// ==UserScript==
// @name         ChatGPT Pro Quota Ledger (Local)
// @namespace    local.chatgpt.pro-quota-ledger
// @version      0.3.4
// @description  Estimate remaining Pro messages with optional, privacy-minimized diagnostics and reset information.
// @match        https://chatgpt.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

/*
  ChatGPT Pro Quota Ledger. Independent MIT-licensed implementation.
  Inspired by BlueSkyXN's ChatGPT Quota Helper:
  https://github.com/BlueSkyXN/CPA-Panel-LTS/blob/main/scripts/chatgpt-quota-helper.js

  Privacy: intercepts the ChatGPT requests already being sent; extracts the
  model and message identifiers transiently, persists neither prompt bodies
  nor raw conversation/message IDs, and never sends its own network requests.
  It does not read cookies, access tokens or browser session credentials.
  The meter is an estimate, NOT an OpenAI-confirmed remaining allowance.
*/
/** PQL-DOC
 * @file ChatGPT Pro Quota Ledger: observations first, estimates second.
 * @version 0.3.4 (publication documentation pass; runtime unchanged)
 *
 * One installable file, no runtime dependencies and no standalone network
 * requests. The fetch/XHR wrappers observe requests made by the page. They
 * must forward original arguments and return the original result unchanged.
 *
 * Reading order:
 * 1. Storage/profile helpers and presentation preferences.
 * 2. Opt-in diagnostic sanitization and preview/export.
 * 3. Quota evidence, event ledger, reset projection and migration.
 * 4. Request classification and passive fetch/XHR adapters.
 * 5. Formatting, floating/picker presentation and event handling.
 * 6. Startup and same-origin refresh hooks.
 *
 * Private content is parsed transiently only to classify a request. Never
 * add prompts, raw IDs, headers, tokens or complete payloads to persistence
 * or diagnostics. Local storage and open Shadow DOM are not trust boundaries.
 *
 * @typedef {'both'|'picker'|'floating'} DisplayMode
 * @typedef {'server'|'projected'|'local-rollover'} ResetEvidence
 * @typedef {{model:string, key:(string|null)}} Submission
 * @typedef {{iso:string, source:ResetEvidence}} ResetProjection
 * @typedef {{used:number, auto:number, manual:number,
 *  blockedUntil:(string|null), anchor:(number|null), partial:boolean,
 *  since:number}} CountSnapshot
 * @typedef {{max:number, source:string, plan:string, slug:(string|null)}} QuotaInfo
 *
 * Function contracts, storage keys and preserved edge cases are documented
 * in docs/ARCHITECTURE.md, docs/STORAGE.md and docs/KNOWN_LIMITATIONS.md.
 * The PQL-DOC blocks are removable documentation, not generated executable
 * code. scripts/check_repository.cjs verifies byte-for-byte reconstruction
 * of the original source so this pass cannot silently change behavior.
 */
(function () {
  'use strict';
  if (window.top !== window || window.__CHATGPT_PRO_LEDGER_V2__) return;
  window.__CHATGPT_PRO_LEDGER_V2__ = true;

  const OLD_STORE = 'local_chatgpt_pro_quota_ledger_v1';
  const PREFIX = 'local_chatgpt_pro_quota_ledger_v2:';
  const ACTIVE = `${PREFIX}active-profile`;
  const MIGRATED = `${PREFIX}migrated-v1`;
  const VERSION = '0.3.4';
  const QUOTA_DEFAULT = 50;
  const DAY_MS = 86400 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  const KEEP_MS = 45 * 86400 * 1000;
  const RETRY_WINDOW_MS = 20 * 1000;
  const MANUAL_WINDOW_MS = 4 * 60 * 1000;
  const DIAG_KEEP_MS = 7 * DAY_MS;
  const DIAG_MAX_EVENTS = 150;
  const DIAG_KINDS = new Set(['submission', 'manual', 'account-plan', 'model-limit']);
  const DIAG_OUTCOMES = new Set([
    'counted', 'manual-linked', 'retry-suppressed', 'rejected', 'not-pro',
    'unreadable-body', 'request-error', 'added', 'undone', 'detected',
    'blocked', 'unblocked'
  ]);
  const DIAG_SOURCES = new Set(['fetch', 'xhr', 'accounts', 'usage', 'subscription', 'init', 'site']);
  const DIAG_ENDPOINTS = new Set(['conversation', 'f/conversation']);
  const PRO_MODELS = new Set([
    'gpt-5-5-pro', 'gpt-5-6-pro', 'gpt-6-pro', 'gpt-6-pro-chat',
    'gpt-6-astra-pro', 'gpt-6-astra-pro-chat'
  ]);
  const TAB = makeId();
  const fallbackStore = new Map();
  let localStorageAvailable = true;
  let panel = null;
  let expanded = false;
  let settingsOpen = false;
  let infoOpen = false;
  let diagnosticPreview = null; // Previewed exact JSON bytes; export/copy use this snapshot.
  let diagnosticPreviewProfile = null;
  let diagnosticNotice = '';
  let inlineDock = null;
  let inlineQuickHost = null; // Body-level portal: survives ChatGPT closing the native picker.
  let inlineQuickLastRect = null;
  let suppressInlinePointerClick = false;
  let inlineQuickOpen = false;
  let temporaryPanelVisit = null; // Opening full settings must never change the saved display mode.
  const handledQuickPointerClicks = new WeakSet();
  let inlineAnchor = null;
  let inlineUpdatePending = false;
  const DISPLAY_MODES = new Set(['both', 'picker', 'floating']);


  /** PQL-DOC
   * Create a local event/tab identifier. The random fallback is not a
   * cryptographic identity. No identifier is used to authenticate an account.
   * @returns {string}
   */
  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  /** PQL-DOC
   * Read a namespaced value. A read exception triggers tab-local fallback.
   * Known boundary: a setItem-only failure does not make all later reads use
   * fallbackStore. Do not promise durable offline storage (see limitations).
   */
  function get(key) {
    try { return localStorage.getItem(key); }
    catch (_) { localStorageAvailable = false; return fallbackStore.get(key) ?? null; }
  }
  function put(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { localStorageAvailable = false; fallbackStore.set(key, value); return false; }
  }
  function del(key) {
    try { localStorage.removeItem(key); }
    catch (_) { fallbackStore.delete(key); }
  }
  function allKeys() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean);
    } catch (_) {
      localStorageAvailable = false;
      return Array.from(fallbackStore.keys());
    }
  }
  function unpack(key) {
    try { return JSON.parse(get(key)); } catch (_) { return null; }
  }
  /** PQL-DOC
   * Normalize a manually chosen label, not a ChatGPT account identifier.
   * The active label is shared across same-origin tabs; it is not tab-local.
   * @param {unknown} value
   * @returns {string}
   */
  function normalizedProfile(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    return name && name.length <= 40 && !/[\u0000-\u001f]/.test(name) ? name : 'Default';
  }
  function activeProfile() { return normalizedProfile(get(ACTIVE)); }
  /** PQL-DOC
   * Prefix an encoded local profile label. Never rename this v2 namespace
   * in a cosmetic release: it would orphan users' working event histories.
   */
  function scope(profile) { return PREFIX + encodeURIComponent(normalizedProfile(profile)) + ':'; }
  function eventPrefix(profile) { return scope(profile) + 'event:'; }
  function statusPrefix(profile) { return scope(profile) + 'status:'; }
  function settingsKey(profile) { return scope(profile) + 'limit'; } // v0.2 manual override remains compatible.
  function planKey(profile) { return scope(profile) + 'detected-plan'; }
  function serverLimitKey(profile) { return scope(profile) + 'server-limit'; }
  function diagEnabledKey(profile) { return scope(profile) + 'diagnostics-enabled'; }
  function diagPrefix(profile) { return scope(profile) + 'diagnostic:'; }
  function displayKey(profile) { return scope(profile) + 'display-mode'; }
  function displayMode(profile) {
    const value = get(displayKey(profile));
    return DISPLAY_MODES.has(value) ? value : 'both';
  }
  /** PQL-DOC
   * Persist only an explicit placement choice, then refresh presentation.
   * A temporary settings visit is separate and survives until the tray closes.
   * @param {string} profile
   * @param {DisplayMode} value
   */
  function setDisplayMode(profile, value) {
    if (!DISPLAY_MODES.has(value)) return;
    put(displayKey(profile), value);
    inlineQuickOpen = false;
    if (value === 'floating') {
      // The floating display becomes immediately accessible when picker-only is disabled.
      expanded = true;
      settingsOpen = true;
    }
    // A temporary settings visit is intentionally kept until the user closes
    // the tray, even if they choose a new placement inside it.
    draw(true);
  }
  /** PQL-DOC
   * Open a tab-local settings visit WITHOUT writing display-mode. This is
   * navigation, not a persistent preference change. Closing obeys the current
   * saved mode, including any choice deliberately made during the visit.
   */
  function openFullSettingsFromPicker() {
    temporaryPanelVisit = {profile: activeProfile(), startedMode: displayMode(activeProfile())};
    expanded = true;
    settingsOpen = true;
    inlineQuickOpen = false;
    draw(true);
  }
  function closeTemporaryPanelVisit() {
    if (!temporaryPanelVisit) return;
    temporaryPanelVisit = null;
    settingsOpen = false;
    infoOpen = false;
  }
  function diagnosticsEnabled(profile) { return get(diagEnabledKey(profile)) === '1'; }
  // Refuse unknown fields even when localStorage contains malformed / hostile data.
  // Neither the browser's request body nor its response body is ever recorded here.
  /** PQL-DOC
   * Allowlist diagnostic scalars on both capture and export. Unknown fields
   * are discarded; never serialize an arbitrary network object here.
   * Known v0.3.4 defect: capture accepts httpStatus but emits http_status;
   * a second pass therefore drops this optional field. Tests characterize it.
   * @param {unknown} raw
   * @returns {object|null}
   */
  function sanitizedDiagnostic(raw) {
    if (!raw || typeof raw !== 'object' || !DIAG_KINDS.has(raw.kind)) return null;
    const at = typeof raw.at === 'number' ? raw.at :
      typeof raw.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.at)
        ? Date.parse(raw.at) : NaN;
    if (!Number.isFinite(at) || at <= 0 || at > 8640000000000000) return null;
    const record = { at: new Date(at).toISOString(), kind: raw.kind };
    if (DIAG_OUTCOMES.has(raw.outcome)) record.outcome = raw.outcome;
    if (DIAG_SOURCES.has(raw.source)) record.source = raw.source;
    if (DIAG_ENDPOINTS.has(raw.endpoint)) record.endpoint = raw.endpoint;
    const model = String(raw.model || '').toLowerCase();
    if (PRO_MODELS.has(model) || /^gpt-(?:5-5|5-6|6)(?:-astra)? \(pro effort\)$/.test(model)) {
      record.model = model;
    }
    const plan = String(raw.plan || '').toLowerCase();
    if (['prolite', 'pro', 'promax', 'plus', 'go', 'free'].includes(plan)) record.plan = plan;
    if (Number.isInteger(raw.httpStatus) && raw.httpStatus >= 100 && raw.httpStatus <= 599) {
      record.http_status = raw.httpStatus;
    }
    if (Number.isInteger(raw.limit) && raw.limit >= 1 && raw.limit <= 10000) {
      record.limit = raw.limit;
    }
    return record;
  }
  /** PQL-DOC
   * Return at most 150 sanitized, chronological records in the visible
   * seven-day retention window. This read filters; trimDiagnostics deletes.
   * @param {string} profile
   * @param {number} [now] Epoch milliseconds.
   */
  function diagnosticEntries(profile, now = Date.now()) {
    return entries(diagPrefix(profile)).map(sanitizedDiagnostic).filter(record => {
      const at = Date.parse(record?.at);
      return Number.isFinite(at) && at <= now + 1000 && at >= now - DIAG_KEEP_MS;
    }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-DIAG_MAX_EVENTS);
  }
  function trimDiagnostics(profile, now = Date.now()) {
    const prefix = diagPrefix(profile);
    const stored = allKeys().filter(key => key.startsWith(prefix)).map(key => {
      const record = sanitizedDiagnostic(unpack(key));
      return { key, at: record ? Date.parse(record.at) : NaN };
    }).sort((a, b) => (Number.isFinite(a.at) ? a.at : -Infinity) -
      (Number.isFinite(b.at) ? b.at : -Infinity));
    const expired = stored.filter(e => !Number.isFinite(e.at) || e.at < now - DIAG_KEEP_MS || e.at > now + 1000);
    for (const entry of expired) del(entry.key);
    const remaining = stored.filter(e => !expired.includes(e));
    for (const entry of remaining.slice(0, Math.max(0, remaining.length - DIAG_MAX_EVENTS))) del(entry.key);
  }
  /** PQL-DOC
   * Append diagnostics only with profile-specific opt-in. Ordinary quota
   * events are separate and still counted when diagnostic capture is off.
   */
  function captureDiagnostic(profile, kind, details = {}) {
    if (!diagnosticsEnabled(profile)) return;
    const record = sanitizedDiagnostic({ at: Date.now(), kind, ...details });
    if (!record) return;
    // Stored keys contain only a random identifier. No conversation/message IDs.
    put(diagPrefix(profile) + makeId(), JSON.stringify(record));
    trimDiagnostics(profile);
  }
  function clearDiagnosticPreview() { diagnosticPreview = null; diagnosticPreviewProfile = null; diagnosticNotice = ''; }
  function setDiagnosticsEnabled(profile, enabled) {
    if (enabled) put(diagEnabledKey(profile), '1');
    else del(diagEnabledKey(profile));
    clearDiagnosticPreview();
  }
  function clearDiagnostics(profile) {
    if (!confirm('Delete locally captured diagnostic events for this profile? Quota counts will be preserved.')) return;
    for (const key of allKeys().filter(k => k.startsWith(diagPrefix(profile)))) del(key);
    clearDiagnosticPreview();
    diagnosticNotice = 'Diagnostic events cleared. Quota counts are unchanged.';
  }
  /** PQL-DOC
   * Build a summary snapshot without prompts, account labels or raw IDs.
   * ledger_checksum hashes KEY NAMES only, not values, settings or timestamps.
   * Equal checksums are a clue, not proof that balances must be identical.
   * @param {string} profile
   * @param {number} [now]
   * @returns {object} Schema v1 report; see docs/diagnostic-schema-v1.json.
   */
  function diagnosticReport(profile, now = Date.now()) {
    const data = counted(profile, now);
    const quota = quotaInfo(profile);
    const reset = nextReset(profile, data, now);
    // Deliberately no profile name, tab ID, raw hashed request fingerprints,
    // browser fingerprint, URL, message text, or account identifier in reports.
    return {
      schema_version: 1,
      tool: 'ChatGPT Pro Quota Ledger',
      version: VERSION,
      generated_at: new Date(now).toISOString(),
      capture_enabled: diagnosticsEnabled(profile),
      retention: { days: DIAG_KEEP_MS / DAY_MS, max_events: DIAG_MAX_EVENTS },
      quota: {
        configured_limit: quota.max,
        limit_source: quota.source,
        detected_plan: quota.slug || 'unknown',
        estimated_remaining: data.blockedUntil ? 0 : Math.max(0, quota.max - data.used),
        locally_observed: data.used,
        automatic: data.auto,
        manual_only: data.manual,
        local_history_partial: data.partial,
        currently_blocked: Boolean(data.blockedUntil),
        next_reset: reset ? { at: reset.iso, evidence: reset.source } : null
      },
      display_mode: displayMode(profile),
      synchronization: {
        local_storage_accessible: localStorageAvailable,
        event_records: events(profile).length,
        status_records: statuses(profile).length,
        // Comparable across same-origin tabs without exporting random event IDs.
        // This is only a diagnostic checksum, not an account fingerprint.
        ledger_checksum: hashKey(allKeys().filter(key =>
          key.startsWith(eventPrefix(profile)) || key.startsWith(statusPrefix(profile))
        ).sort().join('\n'))
      },
      diagnostics: diagnosticEntries(profile, now)
    };
  }
  /** PQL-DOC
   * Freeze the exact JSON text the user will copy or download. A background
   * refresh must not silently replace an already previewed export snapshot.
   */
  function previewDiagnostics() {
    const profile = activeProfile();
    trimDiagnostics(profile);
    diagnosticPreview = JSON.stringify(diagnosticReport(profile), null, 2) + '\n';
    diagnosticPreviewProfile = profile;
    diagnosticNotice = 'Preview ready. Copy and download use these exact displayed bytes.';
  }
  /** PQL-DOC
   * Copy only the previewed snapshot through the browser clipboard API.
   * This is an explicit user export, not telemetry; permission can be denied.
   */
  function copyDiagnostics() {
    if (!diagnosticPreview || diagnosticPreviewProfile !== activeProfile()) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      diagnosticNotice = 'Clipboard unavailable. Use Download JSON instead.';
      draw(true); return;
    }
    const snapshot = diagnosticPreview;
    Promise.resolve().then(() => navigator.clipboard.writeText(snapshot)).then(() => {
      diagnosticNotice = 'Copied the previewed report.';
      draw();
    }).catch(() => {
      diagnosticNotice = 'Clipboard blocked. Use Download JSON instead.';
      draw();
    });
  }
  function downloadDiagnostics() {
    if (!diagnosticPreview || diagnosticPreviewProfile !== activeProfile()) return;
    try {
      const blob = new Blob([diagnosticPreview], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatgpt-pro-ledger-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        diagnosticNotice = 'Downloaded the previewed report.';
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (_) { diagnosticNotice = 'Download unavailable. Use Copy instead.'; }
    draw(true);
  }
  /** PQL-DOC
   * Accept an integer allowance from 1 through 10,000, otherwise null.
   * This validates syntax, not the current subscription's actual entitlement.
   */
  function validLimit(value) {
    const n = Number(value);
    return value !== null && value !== undefined && value !== '' &&
      Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null;
  }
  function planLabel(slug) {
    return ({ prolite: 'Pro $100', pro: 'Pro $200', promax: 'Pro $500',
      plus: 'Plus', go: 'Go', free: 'Free' })[slug] || 'Unknown';
  }
  /** PQL-DOC
   * Resolve capacity in priority order: manual override, matching observed
   * cap, built-in prolite preset, then a labeled 50-message fallback.
   * The plan preset is static code, not a live subscription-policy lookup.
   * @param {string} profile
   * @returns {QuotaInfo}
   */
  function quotaInfo(profile) {
    const manual = validLimit(get(settingsKey(profile)));
    const observed = unpack(serverLimitKey(profile));
    const plan = unpack(planKey(profile));
    const slug = typeof plan?.slug === 'string' ? plan.slug : null;
    const activePlan = planLabel(slug);
    if (manual !== null) return { max: manual, source: 'manual override', plan: activePlan, slug };
    // This number was returned by the server during an actual Pro restriction.
    // Never assume an observed quota belongs to a subsequently changed plan.
    const server = validLimit(observed?.max);
    if (server !== null && (observed.plan || null) === slug) {
      return { max: server, source: 'server-observed limit', plan: activePlan, slug };
    }
    if (slug === 'prolite') return { max: 50, source: 'Pro $100 plan (automatic)', plan: activePlan, slug };
    // A bare 'pro' or 'promax' does NOT identify cohort/grandfathering or a
    // stable numeric Chat limit; never invent a Pro $200 / $500 allowance.
    return { max: QUOTA_DEFAULT, source: '50-message fallback (verify in settings)', plan: activePlan, slug };
  }
  function limit(profile) { return quotaInfo(profile).max; }
  /** PQL-DOC
   * Store only a recognized plan label. A changed label invalidates the
   * old numerical cap but preserves usage events and manual configuration.
   */
  function rememberPlan(profile, slug, source = 'site') {
    const known = new Set(['prolite', 'pro', 'promax', 'plus', 'go', 'free']);
    const normalized = typeof slug === 'string' ? slug.toLowerCase().trim() : '';
    if (!known.has(normalized)) return;
    const previous = unpack(planKey(profile));
    if (previous?.slug === normalized) return;
    // Changing plans invalidates old server-observed quota and leaves events intact.
    del(serverLimitKey(profile));
    put(planKey(profile), JSON.stringify({ slug: normalized, source, at: Date.now() }));
    captureDiagnostic(profile, 'account-plan', { outcome: 'detected', source, plan: normalized });
    draw();
  }
  /** PQL-DOC
   * Extract allowlisted fields from selected responses already fetched by
   * the site. The accounts adapter reads accounts.default, which does not
   * prove it is the active workspace. No credentials are fetched or stored.
   */
  function onAccountStatus(profile, data, source) {
    if (!data || typeof data !== 'object') return;
    // Named, whitelisted scalar fields only. Never retain user/account IDs,
    // access tokens, emails, full response objects, or billing details.
    let slug;
    if (source === 'accounts') {
      slug = data.accounts?.default?.account?.plan_type || data.accounts?.default?.entitlement?.plan_type;
    } else if (source === 'usage' || source === 'subscription') {
      slug = data.plan_type || data.subscription?.plan_type;
    } else if (source === 'init') {
      slug = data.plan_type;
    }
    rememberPlan(profile, slug, source);
  }
  /** PQL-DOC
   * Store an observation under its own key so unrelated tab writes do not
   * overwrite one shared array. This is not a transaction or cross-tab lock.
   * @param {string} profile
   * @param {object} event
   * @param {string} [id] Optional deterministic key for idempotent migration.
   */
  function appendEvent(profile, event, id = makeId()) {
    const key = eventPrefix(profile) + id;
    if (get(key) === null) put(key, JSON.stringify(event));
    draw();
    return key;
  }
  function appendStatus(profile, status, id = makeId()) {
    const key = statusPrefix(profile) + id;
    if (get(key) === null) put(key, JSON.stringify(status));
    draw();
  }
  function entries(prefix) {
    return allKeys().filter(k => k.startsWith(prefix)).map(k => {
      const value = unpack(k);
      return value && typeof value === 'object' ? { ...value, storageKey: k } : null;
    }).filter(Boolean);
  }
  function events(profile) {
    return entries(eventPrefix(profile)).filter(e =>
      (e.type === 'auto' || e.type === 'manual') && Number.isFinite(e.at) && e.at > 0
    );
  }
  function statuses(profile) {
    return entries(statusPrefix(profile)).filter(s =>
      (s.kind === 'blocked' || s.kind === 'unblocked' || s.kind === 'reset') && Number.isFinite(s.at)
    ).sort((a, b) => a.at - b.at);
  }
  /** PQL-DOC
   * Use the newest non-reset status if its deadline remains in the future.
   * This is the script's aggregate indicator, not a per-model entitlement map.
   */
  function currentBlock(list, now = Date.now()) {
    const observation = [...list].reverse().find(s => s.kind !== 'reset');
    return observation?.kind === 'blocked' && Date.parse(observation.until) > now ? observation.until : null;
  }
  /** PQL-DOC
   * Find the latest elapsed observed deadline/reset. A passed timestamp is
   * used as a local counting boundary; it is not proof access was restored.
   */
  function lastReset(list, now = Date.now()) {
    const times = list.map(s => s.kind === 'reset' ? Date.parse(s.until) :
      s.kind === 'blocked' ? Date.parse(s.until) : NaN).filter(t => Number.isFinite(t) && t <= now);
    return times.length ? Math.max(...times) : null;
  }
  /** PQL-DOC
   * Prefer an active reported block, then project from a past boundary,
   * then try the oldest stored event plus seven days. No automatic request.
   * Known edge: an old retained event can hide a newer possible rollover.
   * @param {string} profile
   * @param {CountSnapshot} data
   * @param {number} [now]
   * @returns {ResetProjection|null}
   */
  function nextReset(profile, data, now = Date.now()) {
    if (data.blockedUntil) return { iso: data.blockedUntil, source: 'server' };
    if (Number.isFinite(data.anchor)) {
      // A projection, NOT a service promise: the Chat model's allowance may
      // use a rolling window or a different scheduling rule.
      const steps = Math.floor((now - data.anchor) / WEEK_MS) + 1;
      return { iso: new Date(data.anchor + Math.max(1, steps) * WEEK_MS).toISOString(), source: 'projected' };
    }
    const observed = events(profile).filter(e => e.at <= now).sort((a, b) => a.at - b.at)[0];
    if (observed && observed.at + WEEK_MS > now) {
      return { iso: new Date(observed.at + WEEK_MS).toISOString(), source: 'local-rollover' };
    }
    return null;
  }
  /** PQL-DOC
   * Derive, do not persist, the displayed usage total. Count auto events
   * plus manual events not linked by an auto event inside the same window.
   * Use max(now - 7 days, latest elapsed boundary), inclusive at the start.
   * partial=false means a boundary exists, not that all account use was seen.
   * @param {string} profile
   * @param {number} [now]
   * @returns {CountSnapshot}
   */
  function counted(profile, now = Date.now()) {
    const observedStatuses = statuses(profile);
    const boundary = lastReset(observedStatuses, now);
    const windowStart = Math.max(now - WEEK_MS, boundary || 0);
    const relevant = events(profile).filter(e => e.at >= windowStart && e.at <= now + 1000);
    const autos = relevant.filter(e => e.type === 'auto');
    const matchedManualIds = new Set(autos.map(e => e.manualId).filter(Boolean));
    const manualOnly = relevant.filter(e => e.type === 'manual' && !matchedManualIds.has(e.id));
    return { used: autos.length + manualOnly.length, auto: autos.length, manual: manualOnly.length,
      blockedUntil: currentBlock(observedStatuses, now), anchor: boundary,
      partial: boundary === null, since: windowStart };
  }
  // No single shared read-modify-write array: every event has its own key,
  // preventing loss of unrelated writes by simultaneous ChatGPT tabs.
  /** PQL-DOC
   * Immediately add one local estimate. A later accepted submission in
   * this tab can consume the marker; choosing Pro alone never counts.
   */
  function recordManual() {
    if (!isRegularChat()) return;
    // An explicit manual mark ALWAYS adds one pending estimate. A subsequent
    // recognized submission links to it rather than increasing the total.
    const profile = activeProfile();
    appendEvent(profile, { id: makeId(), type: 'manual', at: Date.now(), tab: TAB });
    captureDiagnostic(profile, 'manual', { outcome: 'added' });
  }
  /** PQL-DOC
   * 32-bit FNV-1a comparison hint, not encryption or anonymization. Collisions
   * are possible. Do not use it to authenticate, authorize or conceal secrets.
   * @param {string} value
   * @returns {string|null}
   */
  function hashKey(value) {
    // Non-cryptographic fingerprint for retry de-duplication, not an identity.
    // Raw message/conversation IDs are never stored.
    if (!value) return null;
    let a = 2166136261;
    for (let i = 0; i < value.length; i++) {
      a ^= value.charCodeAt(i);
      a = Math.imul(a, 16777619);
    }
    return (a >>> 0).toString(16).padStart(8, '0');
  }
  /** PQL-DOC
   * Account at response-observation time, not request-start time. Suppress
   * matching request fingerprints within 20 seconds; link the newest unused
   * same-tab manual mark within four minutes. These heuristics can differ
   * from server billing and are not atomic across independent tabs.
   * @param {string} profile Profile captured when the request began.
   * @param {Submission|null} submission
   */
  function recordAuto(profile, submission, source = null, endpoint = null) {
    if (!submission) return;
    const now = Date.now();
    const past = events(profile);
    // Accepted retries with identical request identity do not produce a second
    // count within the retry window. No identity => conservative one per 2xx.
    if (submission.key && past.some(e => e.type === 'auto' && e.request === submission.key &&
      Math.abs(now - e.at) < RETRY_WINDOW_MS)) {
      captureDiagnostic(profile, 'submission', {
        outcome: 'retry-suppressed', model: submission.model, source, endpoint
      });
      return;
    }
    const manual = past.filter(e => e.type === 'manual' && e.tab === TAB &&
      now >= e.at && now - e.at <= MANUAL_WINDOW_MS &&
      !past.some(a => a.type === 'auto' && a.manualId === e.id))
      .sort((a, b) => b.at - a.at)[0];
    const e = { id: makeId(), type: 'auto', at: now, model: submission.model,
      request: submission.key || null, tab: TAB, manualId: manual?.id || null };
    appendEvent(profile, e);
    captureDiagnostic(profile, 'submission', {
      outcome: manual ? 'manual-linked' : 'counted', model: submission.model, source, endpoint
    });
  }
  /** PQL-DOC
   * Delete the latest manual marker, even if it had already been paired.
   * Its corresponding automatic event is deliberately left in the ledger.
   */
  function undoManual() {
    const profile = activeProfile();
    const past = events(profile).filter(e => e.type === 'manual').sort((a, b) => b.at - a.at);
    if (past.length) { del(past[0].storageKey); captureDiagnostic(profile, 'manual', { outcome: 'undone' }); draw(); }
    // A matched auto event remains accounted for even if its manual marker is undone.
  }
  /** PQL-DOC
   * Delete quota events/statuses only after confirmation. Does not reset
   * OpenAI limits, remove preferences, erase diagnostics or edit v0.1 data.
   */
  function clearProfile() {
    const profile = activeProfile();
    if (!confirm(`Clear the LOCAL Pro history for profile "${profile}"? Your OpenAI quota will not change.`)) return;
    for (const key of allKeys()) {
      if (key.startsWith(eventPrefix(profile)) || key.startsWith(statusPrefix(profile))) del(key);
    }
    put(MIGRATED, '1'); // Do not resurrect v0.1 events after explicit clear.
    // Diagnostic history is distinct, not affected by clearing the quota ledger.
    draw();
  }
  /** PQL-DOC
   * Opportunistic startup cleanup of event/status observations older than
   * 45 days. No background guarantee: closed/inactive profiles can retain
   * expired data until the script runs cleanup again.
   */
  function trimOld() {
    const before = Date.now() - KEEP_MS;
    for (const key of allKeys()) {
      if (!key.startsWith(PREFIX)) continue;
      if (!key.includes(':event:') && !key.includes(':status:')) continue;
      const e = unpack(key);
      if (e && Number.isFinite(e.at) && e.at < before) del(key);
    }
  }
  /** PQL-DOC
   * One-time migration into Default using deterministic event keys. The
   * old record remains untouched for rollback and may contain raw IDs.
   * Never rerun migration automatically after an explicit local Clear.
   */
  function migrateV1() {
    if (get(MIGRATED) === '1') return;
    const old = unpack(OLD_STORE);
    if (!old || old.v !== 1 || !Array.isArray(old.events)) {
      put(MIGRATED, '1'); return;
    }
    // Preserve the user's v0.1 events and reset evidence. Do not modify v0.1.
    // Migration keys are deterministic: multiple tabs may migrate safely.
    const profile = 'Default';
    for (const [i, e] of old.events.entries()) {
      if (!Number.isFinite(e?.at) || e.at <= 0) continue;
      const id = `v1-${hashKey(`${e.id || i}:${e.at}:${i}`)}`;
      const isManual = e.source === 'manual';
      appendEvent(profile, { id, type: isManual ? 'manual' : 'auto', at: e.at,
        tab: e.tab || 'legacy', model: typeof e.model === 'string' ? e.model : null,
        request: typeof e.key === 'string' ? hashKey(e.key) : null, legacy: true }, id);
    }
    const reset = old.cycleStart || (old.blockedUntil && Date.parse(old.blockedUntil) <= Date.now() ? old.blockedUntil : null);
    if (reset && Number.isFinite(Date.parse(reset))) {
      appendStatus(profile, { kind: 'reset', at: Date.parse(reset), until: reset },
        `v1-reset-${Date.parse(reset)}`);
    }
    if (old.blockedUntil && Date.parse(old.blockedUntil) > Date.now()) {
      appendStatus(profile, { kind: 'blocked', at: Date.parse(old.blockedSeenAt) || Date.now(),
        until: old.blockedUntil }, 'v1-block');
    }
    put(MIGRATED, '1');
  }

  function asModel(value) {
    if (typeof value === 'string') return value.toLowerCase();
    if (value && typeof value === 'object') return String(value.slug || value.id || value.name || '').toLowerCase();
    return '';
  }
  /** PQL-DOC
   * Classify only recognized model/effort fields. Explicit modes other than
   * primary_assistant are excluded. System-hint-only research/work variants
   * are not inspected, so the exclusion is not exhaustive.
   * @param {unknown} data
   * @returns {string|null}
   */
  function findProModel(data) {
    if (!data || typeof data !== 'object') return null;
    // Work, Agent, research and custom non-primary sessions are excluded.
    const mode = String(data.conversation_mode_kind || data.conversation_mode?.kind || '').toLowerCase();
    if (mode && mode !== 'primary_assistant') return null;
    const candidates = [data.model, data.model_slug, data.model_id, data.selected_model,
      data.model_config?.model, data.metadata?.model_slug];
    for (const candidate of candidates) {
      const slug = asModel(candidate);
      if (PRO_MODELS.has(slug)) return slug;
    }
    const effort = String(data.thinking_effort || data.reasoning_effort ||
      data.model_config?.thinking_effort || '').toLowerCase();
    const model = asModel(data.model || data.model_slug || data.model_id);
    return effort === 'pro' && /^gpt-(5-5|5-6|6)(?:-astra)?$/.test(model) ? `${model} (Pro effort)` : null;
  }
  /** PQL-DOC
   * Hash conversation plus latest message/turn identity, transiently.
   * Missing IDs mean no retry fingerprint; identical content is not compared.
   */
  function eventKey(data) {
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const recent = messages[messages.length - 1];
    const id = recent?.id || recent?.message?.id || data.turn_exchange_id || data.working_turn_id;
    return id ? hashKey(`${data.conversation_id || 'new'}:${id}`) : null;
  }
  /** PQL-DOC
   * Inspect a JSON string of at most 1,000,000 JavaScript characters.
   * Return model/fingerprint only. This limit is characters, not UTF-8 bytes.
   * Request.clone().text() can have already buffered more data before this
   * check. Unknown, malformed and non-string bodies are not counted.
   * @param {unknown} body
   * @returns {Submission|null}
   */
  function parseSubmission(body) {
    if (typeof body !== 'string' || body.length > 1_000_000) return null;
    try {
      const data = JSON.parse(body);
      const model = findProModel(data);
      return model ? { model, key: eventKey(data) } : null;
    } catch (_) { return null; }
  }
  function isRegularChat() { return !/^\/(codex|work|atlas)(\/|$)/i.test(location.pathname); }
  function urlOf(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input?.url, location.href);
      return url.origin === location.origin ? url : null;
    } catch (_) { return null; }
  }
  function isSubmit(url) { return /^\/backend-api\/(?:f\/)?conversation\/?$/.test(url.pathname); }
  function isInit(url) { return url.pathname === '/backend-api/conversation/init'; }
  function accountResponseKind(url) {
    if (/^\/backend-api\/accounts\/check\//.test(url.pathname)) return 'accounts';
    if (url.pathname === '/backend-api/wham/usage') return 'usage';
    if (url.pathname === '/backend-api/subscriptions') return 'subscription';
    return null;
  }
  /** PQL-DOC
   * Observe optional plan/cap and block metadata. The first supported model
   * restriction drives a single aggregate block. An empty model_limits list
   * clears that indicator, but does not prove any particular remaining count.
   * Multiple independent model caps need a future per-model implementation.
   */
  function onInit(profile, data) {
    onAccountStatus(profile, data, 'init');
    if (!data || !Array.isArray(data.model_limits)) return;
    const matching = data.model_limits.find(x => PRO_MODELS.has(String(x?.model_slug || '').toLowerCase()));
    const blockedReason = matching && Array.isArray(data.blocked_features) ? data.blocked_features.find(x =>
      x?.name === 'reason' && validLimit(x.limit) !== null) : null;
    // A reason-block corresponding to a Pro model may disclose an explicit cap.
    if (matching && blockedReason) {
      const max = validLimit(blockedReason.limit);
      const slug = unpack(planKey(profile))?.slug || null;
      const previous = unpack(serverLimitKey(profile));
      if (max !== previous?.max || slug !== (previous?.plan || null)) {
        put(serverLimitKey(profile), JSON.stringify({ max, plan: slug, at: Date.now() }));
      }
    }
    const until = matching?.resets_after || blockedReason?.resets_after;
    const now = Date.now();
    const blocked = typeof until === 'string' && Number.isFinite(Date.parse(until)) && Date.parse(until) > now;
    const kind = blocked ? 'blocked' : 'unblocked';
    const last = [...statuses(profile)].reverse().find(s => s.kind !== 'reset');
    // Persist only transitions or changed authoritative deadlines; no polling.
    if (last?.kind === kind && (!blocked || last.until === until)) return;
    appendStatus(profile, { kind, at: now, ...(blocked ? { until } : {}) });
    captureDiagnostic(profile, 'model-limit', {
      outcome: kind, source: 'init', ...(blockedReason ? { limit: validLimit(blockedReason.limit) } : {})
    });
  }
  // The page's own fetch is called exactly once, with unchanged arguments.
  /** PQL-DOC
   * Fetch adapter: one forwarding call, original promise returned. Observing
   * headers/JSON is asynchronous and does not consume the response stream.
   * Profile is bound at request start; the auto event time is recorded later.
   * Do not add a fetch for quota, auth, history, or completion polling here.
   */
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function quotaLedgerFetch(input, options) {
      const url = urlOf(input);
      const method = String(options?.method || input?.method || 'GET').toUpperCase();
      const eligible = url && method === 'POST' && isSubmit(url) && isRegularChat();
      const initRequest = url && isInit(url);
      const planResponseKind = url && accountResponseKind(url);
      const profile = activeProfile(); // Bind response to profile selected at request start.
      let bodyProbe = null;
      if (eligible) {
        if (typeof options?.body === 'string') bodyProbe = Promise.resolve(options.body);
        else if (typeof input?.clone === 'function') {
          try { bodyProbe = input.clone().text().catch(() => null); } catch (_) { /* ignored */ }
        }
      }
      const result = originalFetch.apply(this, arguments);
      if (eligible) {
        const endpoint = url.pathname.includes('/f/') ? 'f/conversation' : 'conversation';
        Promise.resolve(result).then(response => {
          Promise.resolve(bodyProbe).then(body => {
            const submission = parseSubmission(body);
            if (response?.ok && submission) recordAuto(profile, submission, 'fetch', endpoint);
            else captureDiagnostic(profile, 'submission', {
              source: 'fetch', endpoint,
              outcome: !response?.ok ? 'rejected' : body === null ? 'unreadable-body' : 'not-pro',
              httpStatus: response?.status,
              ...(submission ? { model: submission.model } : {})
            });
          }).catch(() => captureDiagnostic(profile, 'submission', {
            source: 'fetch', endpoint, outcome: 'unreadable-body'
          }));
        }).catch(() => captureDiagnostic(profile, 'submission', {
          source: 'fetch', endpoint, outcome: 'request-error'
        }));
      }
      if (initRequest || planResponseKind) {
        Promise.resolve(result).then(response => {
          if (response?.ok && typeof response.clone === 'function') {
            response.clone().json().then(data => {
              if (initRequest) onInit(profile, data);
              else onAccountStatus(profile, data, planResponseKind);
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      return result;
    };
  }
  // XHR fallback, with the same response-only counting semantics.
  /** PQL-DOC
   * XHR adapter: classify the outgoing body but count only at loadend with
   * 2xx status. Unlike fetch header acceptance, this can be much later for
   * a streamed response. Keep response objects and original arguments intact.
   */
  if (typeof XMLHttpRequest !== 'undefined') {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function quotaLedgerOpen(method, url) {
      this.__pqlUrl = urlOf(url);
      this.__pqlMethod = String(method).toUpperCase();
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function quotaLedgerSend(body) {
      const url = this.__pqlUrl;
      const eligible = url && this.__pqlMethod === 'POST' && isSubmit(url) && isRegularChat();
      const initRequest = url && isInit(url);
      const planResponseKind = url && accountResponseKind(url);
      const submission = eligible ? parseSubmission(body) : null;
      const profile = activeProfile();
      if (eligible || initRequest || planResponseKind) {
        this.addEventListener('loadend', () => {
          const ok = this.status >= 200 && this.status < 300;
          if (eligible) {
            if (ok && submission) recordAuto(profile, submission, 'xhr',
              url.pathname.includes('/f/') ? 'f/conversation' : 'conversation');
            else captureDiagnostic(profile, 'submission', {
              source: 'xhr', endpoint: url.pathname.includes('/f/') ? 'f/conversation' : 'conversation',
              outcome: !ok ? this.status === 0 ? 'request-error' : 'rejected' : 'not-pro',
              ...(submission ? { model: submission.model } : {}), httpStatus: this.status
            });
          }
          if (!ok) return;
          if (initRequest || planResponseKind) {
            try {
              const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
              if (initRequest) onInit(profile, data);
              else onAccountStatus(profile, data, planResponseKind);
            } catch (_) { /* ignored */ }
          }
        }, { once: true });
      }
      return send.apply(this, arguments);
    };
  }

  function safe(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function relative(iso) {
    const minutes = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60000));
    if (!Number.isFinite(minutes)) return 'unknown';
    return `${Math.floor(minutes / 1440) ? `${Math.floor(minutes / 1440)}d ` : ''}${Math.floor(minutes % 1440 / 60) ? `${Math.floor(minutes % 1440 / 60)}h ` : ''}${minutes % 60}m`;
  }
  function exact(iso) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
    });
  }
  function formatPace(value) {
    // A fractional pace should not round up to an imaginary whole message.
    const decimals = value < 1 ? 2 : value < 10 ? 1 : 1;
    return value.toFixed(decimals).replace(/\.?0+$/, '');
  }
  function formatTimeAvailable(milliseconds) {
    const days = milliseconds / DAY_MS;
    if (days >= 1) {
      const rounded = Number(days.toFixed(1));
      return `${rounded} ${rounded === 1 ? 'day' : 'days'} left`;
    }
    if (milliseconds >= 3600000) {
      const hours = Math.round(milliseconds / 3600000 * 10) / 10;
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
    }
    const minutes = Math.max(1, Math.ceil(milliseconds / 60000));
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  }
  /** PQL-DOC
   * Suggested mean uses/day = remaining * 86,400,000 / timeUntilReset.
   * It is not a daily server allowance. Fractional days are intentionally used.
   * @param {number} remaining
   * @param {ResetProjection|null} upcoming
   * @param {number} [now]
   * @returns {object|null}
   */
  function paceProjection(remaining, upcoming, now = Date.now()) {
    if (!upcoming?.iso || !Number.isFinite(remaining) || remaining < 0) return null;
    const milliseconds = Date.parse(upcoming.iso) - now;
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
    const perDay = remaining * DAY_MS / milliseconds;
    return { perDay, days: milliseconds / DAY_MS,
      timeLeftText: formatTimeAvailable(milliseconds),
      source: upcoming.source };
  }
  const CSS = `
    :host{all:initial;font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#f5f5f5}
    button{color:#fafafa;background:#373737;border:1px solid #686868;border-radius:7px;
      padding:6px 8px;font:inherit;cursor:pointer}button:hover{background:#525252}
    button.gear{font-size:15px;padding:3px 6px;line-height:1.2;min-width:27px}
    button.gear[aria-expanded="true"]{background:#555;border-color:#90c5fa}
    button:focus-visible,select:focus-visible{outline:2px solid #8fc4ff;outline-offset:2px}
    select{background:#343434;color:#fff;border:1px solid #777;border-radius:6px;
      font:inherit;padding:5px 6px;max-width:100%;width:100%}
    .settings,.info{margin-top:10px;padding:9px;background:#2c2c2c;border:1px solid #5b5b5b;border-radius:8px}
    .settings label{display:block;margin-bottom:4px;font-weight:600}
    .settings small{margin-top:5px}
    .diag{margin-top:10px;padding-top:9px;border-top:1px solid #555}
    .diag-toggle{display:flex!important;align-items:center;gap:6px;cursor:pointer;font-weight:normal!important}
    .diag-toggle input{accent-color:#8fc4ff;cursor:pointer}
    .diag .row button{font-size:11px;padding:5px 7px}
    .diag pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:27vh;overflow-y:auto;
      color:#dfdfdf;background:#171717;border:1px solid #505050;border-radius:6px;
      padding:8px;margin:8px 0 0;user-select:text;font:10px/1.45 ui-monospace,Consolas,monospace}
    button:disabled{opacity:.5;cursor:not-allowed}
    .info{max-height:35vh;overflow-y:auto;overscroll-behavior:contain}
    .info p{margin:7px 0 0}.info p:first-child{margin-top:0}
    .pace{margin-top:10px;padding:9px;border-radius:8px;background:#292d33;border:1px solid #485464}
    .pace strong{font-size:17px}.pace .label{font-size:11px;letter-spacing:.01em}
    #pill{background:#232323;border-radius:12px;padding:8px 11px;box-shadow:0 3px 14px #0005}
    #card{width:275px;border:1px solid #666;border-radius:12px;background:#202020;color:#f5f5f5;
      padding:12px;box-shadow:0 7px 30px #0006;max-height:calc(100vh - 120px);overflow-y:auto}
    .head,.row{display:flex;align-items:center;justify-content:space-between;gap:6px}
    .row{justify-content:flex-start;margin-top:10px;flex-wrap:wrap}
    .big{font-size:20px;font-weight:700;margin-top:4px}.muted{color:#bcbcbc}
    .warn{color:#f2c388}.bar{height:5px;background:#494949;border-radius:8px;
      overflow:hidden;margin:9px 0}.bar>div{height:100%;background:#8fc4ff}
    small{display:block;margin-top:8px;line-height:1.5}
  `;

  // A separate, read-only presentation dock beside ChatGPT's current Pro slider.
  // Never mutate the slider or intercept its keyboard/mouse selection behavior.
  // Native markup is undocumented, so this deliberately fails closed if no
  // visible slider can be identified. It does not guess at a model choice.
  const INLINE_CSS = `
    :host{all:initial;color:#f7f4ff;font:12px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}
    .wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
    .badge{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
      min-width:68px;height:28px;padding:3px 11px;white-space:nowrap;
      color:#f5edff;background:linear-gradient(135deg,#443255,#302b3a);
      border:1px solid #9676b4;border-radius:999px;
      font:650 12px/1 system-ui,-apple-system,'Segoe UI',sans-serif;
      font-variant-numeric:tabular-nums;letter-spacing:.01em;cursor:pointer;
      box-shadow:0 1px 6px #0004,inset 0 1px #fff1;
      transition:background .12s ease,border-color .12s ease}
    .badge:hover,.badge[aria-expanded="true"]{background:#56416a;border-color:#c6a5e9}
    .badge:focus-visible,.quick button:focus-visible{outline:2px solid #ceb0ff;outline-offset:2px}
    /* The hover card is fixed to the viewport, not constrained by ChatGPT's
       model-picker layout. positionInlineTooltip chooses an upward placement
       first and a viewport-safe side placement when the header is too high. */
    .tip{display:none;position:fixed;top:0;left:0;width:min(245px, calc(100vw - 16px));
      max-height:calc(100vh - 16px);box-sizing:border-box;overflow:auto;overflow-wrap:anywhere;
      color:#f7f7f7;background:#242129;border:1px solid #716679;border-radius:10px;
      box-shadow:0 10px 25px #0009;padding:10px;line-height:1.55;z-index:2;pointer-events:none}
    .wrap:hover .tip,.badge:focus-visible + .tip{display:block}
    .wrap.quick-open .tip{display:none}
    .quick{position:fixed;top:8px;left:8px;width:202px;
      max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);box-sizing:border-box;
      overflow:auto;overscroll-behavior:contain;pointer-events:auto;
      background:#242129;color:#f7f7f7;border:1px solid #796e86;border-radius:10px;
      box-shadow:0 10px 25px #0009;padding:10px;z-index:3}
    .quick strong{display:block;margin-bottom:6px;font-size:12px}
    .quick button{display:block;width:100%;padding:7px 9px;margin:4px 0;text-align:left;
      background:#39333f;border:1px solid #665a70;border-radius:7px;color:#f7f7f7;
      font:inherit;cursor:pointer}
    .quick button[aria-pressed="true"]{border-color:#c6a5e9;background:#57446b}
    .quick button:hover{background:#514259}
    .quick .hint{color:#c8c1cc;font-size:10px;padding-top:3px}
    @media (prefers-reduced-motion:reduce){.badge{transition:none}}
  `;
  const EFFORT_TIERS = new Set(['Instant', 'Medium', 'High', 'Extra High', 'Pro']);
  /** PQL-DOC
   * Locate only recognized, nonzero-size slider markup inside a menu.
   * No selector match means no pill. This is geometry-based compatibility,
   * not a general visibility/security test; do not scan conversation text.
   */
  function visiblePickerSlider() {
    if (typeof document.querySelectorAll !== 'function') return null;
    // Never scan ordinary conversation content or infer Pro from the list of
    // available slider stops: they always contain the word "Pro".
    const nodes = document.querySelectorAll(
      '[role="menuitem"][data-reasoning-slider="true"], [data-model-picker-power-slider]'
    );
    for (const node of nodes) {
      if (!node.closest?.('[role="menu"], [data-model-picker-view]')) continue;
      if (typeof node.getBoundingClientRect !== 'function') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 25 && rect.height > 4) return node;
    }
    return null;
  }
  /** PQL-DOC
   * Look for a current selected-tier heading, then accessible status/value.
   * The presence of Pro among all available stops must never be sufficient.
   * Current vocabulary is English; ambiguous/localized layouts may hide it.
   */
  function selectedPickerEffort(slider) {
    if (!slider) return { tier: null, label: null };
    const scope = slider.closest?.('[role="menu"]') || slider.closest?.('[data-model-picker-view]');
    if (!scope?.querySelectorAll) return { tier: null, label: null };
    const sliderRect = slider.getBoundingClientRect();
    // Current ChatGPT layouts show the SELECTED effort above the track
    // ("High ›" or "Pro ›"). Find that header by its bounding box rather
    // than reading menu.textContent, which also lists every available tier.
    const labels = [];
    for (const el of scope.querySelectorAll('span,div,strong,b,p,h2,h3,h4,button,[role="heading"]')) {
      if (el === slider || slider.contains?.(el) || el.closest?.('[data-reasoning-slider],[data-model-picker-power-slider]')) continue;
      if (el.children?.length && Array.from(el.children).some(child => EFFORT_TIERS.has((child.textContent || '').trim()))) continue;
      // Some headers render the chevron as a literal character beside the tier.
      const tier = (el.textContent || '').trim().replace(/\s*[›>⌄▼]$/, '').trim();
      if (!EFFORT_TIERS.has(tier)) continue;
      const rect = el.getBoundingClientRect?.();
      if (!rect || !rect.width || !rect.height || rect.bottom > sliderRect.top - 2 ||
          sliderRect.top - rect.bottom > 110) continue;
      const center = (rect.left + rect.right) / 2;
      if (center < sliderRect.left + sliderRect.width * .22 ||
          center > sliderRect.right - sliderRect.width * .22) continue;
      labels.push({ tier, el, rect, separation: sliderRect.top - rect.bottom });
    }
    labels.sort((a,b) => a.separation - b.separation || a.rect.width - b.rect.width);
    if (labels.length) return {tier:labels[0].tier,label:labels[0].el};
    // Alternate layout: an accessible, CURRENT status reads "Pro, 5 of 5".
    // Do not interpret model names, available tick labels, or the unreliable
    // data-selected-reasoning-effort attribute as current selection.
    for (const el of scope.querySelectorAll('[role="status"],[aria-live]')) {
      const match = (el.textContent || '').trim().match(/^(Instant|Medium|High|Extra High|Pro)\s*,\s*\d+\s+of\s+\d+\.?$/i);
      if (match) return {tier:match[1],label:null};
    }
    const valueText = (slider.getAttribute?.('aria-valuetext') || '').trim();
    if (EFFORT_TIERS.has(valueText)) return {tier:valueText,label:null};
    return {tier:null,label:null}; // Fail closed when there is no convincing selection evidence.
  }
  // The picker is a focus-managed portal. Clicking a foreign button can close
  // ChatGPT's menu on pointerdown, before the browser delivers click. Handle
  // the badge on pointerdown and keep its settings in a separate body portal.
  // Keyboard clicks remain handled via the normal click event.
  function toggleInlineQuick() {
    inlineQuickOpen = !inlineQuickOpen;
    const badge = inlineDock?.shadowRoot?.querySelector('[data-action="inline-toggle"]');
    if (badge) {
      badge.setAttribute('aria-expanded', String(inlineQuickOpen));
      badge.closest('.wrap')?.classList.toggle('quick-open', inlineQuickOpen);
      if (inlineQuickOpen) inlineQuickLastRect = badge.getBoundingClientRect();
    }
    updateInlineQuick(); // No badge replacement in the middle of a pointer gesture.
  }
  function mountInlineDock() {
    if (inlineDock || !document.body) return;
    inlineDock = document.createElement('div');
    inlineDock.id = 'chatgpt-pro-quota-ledger-inline-host';
    inlineDock.style.cssText = 'position:fixed;z-index:2147483100;pointer-events:auto;display:none';
    const shadow = inlineDock.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${INLINE_CSS}</style><div id="inline"></div>`;
    document.body.appendChild(inlineDock);
    shadow.addEventListener('pointerdown', e => {
      const button = e.target.closest?.('[data-action="inline-toggle"]');
      if (button && e.button === 0) {
        e.preventDefault(); e.stopPropagation();
        suppressInlinePointerClick = true;
        toggleInlineQuick();
      }
    });
    shadow.addEventListener('click', e => {
      if (!e.target.closest?.('[data-action="inline-toggle"]')) return;
      e.preventDefault(); e.stopPropagation();
      if (e.detail > 0 && suppressInlinePointerClick) { suppressInlinePointerClick = false; return; }
      suppressInlinePointerClick = false;
      toggleInlineQuick(); // Keyboard activation or synthetic click without pointerdown.
    });
  }
  /** PQL-DOC
   * Own the options menu in an independent fixed Shadow DOM host. Commit
   * primary pointerdown before native picker dismissal, and suppress that
   * button's following click. Preserve keyboard click activation.
   * Do not replace the native model controls or synthetic-click the slider.
   */
  function mountInlineQuick() {
    if (inlineQuickHost || !document.body) return;
    inlineQuickHost = document.createElement('div');
    inlineQuickHost.id = 'chatgpt-pro-quota-ledger-quick-host';
    // The transparent root cannot intercept the native Power slider.
    inlineQuickHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483600;display:none';
    const shadow = inlineQuickHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${INLINE_CSS}</style><div id="quick-surface"></div>`;
    document.body.appendChild(inlineQuickHost);
    // ChatGPT may dismiss its native picker during pointerdown, and a
    // MutationObserver can then remove/rebuild the clicked button before click.
    // Commit a single primary-pointer action immediately, before that race.
    // The follow-up browser click is suppressed on this exact element only;
    // keyboard Enter/Space still activates through click (detail === 0).
    function activateQuickTarget(button) {
      if (button.dataset.displayMode) {
        setDisplayMode(activeProfile(), button.dataset.displayMode);
      } else if (button.dataset.action === 'inline-close') {
        inlineQuickOpen = false;
        updateInline();
      } else if (button.dataset.action === 'inline-settings') {
        openFullSettingsFromPicker();
      }
    }
    shadow.addEventListener('pointerdown', e => {
      const button = e.target.closest?.('[data-action],[data-display-mode]');
      if (!button || e.button !== 0 || button.disabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handledQuickPointerClicks.add(button);
      activateQuickTarget(button);
    });
    shadow.addEventListener('click', e => {
      const button = e.target.closest?.('[data-action],[data-display-mode]');
      if (!button || button.disabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (handledQuickPointerClicks.has(button)) {
        handledQuickPointerClicks.delete(button);
        return;
      }
      activateQuickTarget(button);
    });
  }
  /** PQL-DOC
   * Reposition the independent options surface. Keep its existing button
   * nodes when the selected mode is unchanged: recreating them mid-gesture
   * was the source of earlier lost/double-click behavior.
   */
  function updateInlineQuick() {
    if (!inlineQuickOpen || !isRegularChat() || displayMode(activeProfile()) === 'floating') {
      if (inlineQuickHost) inlineQuickHost.style.display = 'none';
      return;
    }
    mountInlineQuick();
    if (!inlineQuickHost) return;
    const mode = displayMode(activeProfile());
    const surface = inlineQuickHost.shadowRoot.querySelector('#quick-surface');
    const next = `<section class="quick" aria-label="Counter display options">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:5px">
        <strong>Counter placement</strong><button type="button" data-action="inline-close" style="width:auto;padding:2px 7px">×</button></div>
      <button type="button" data-display-mode="picker" aria-pressed="${mode === 'picker'}">Picker only</button>
      <button type="button" data-display-mode="floating" aria-pressed="${mode === 'floating'}">Floating only</button>
      <button type="button" data-display-mode="both" aria-pressed="${mode === 'both'}">Both</button>
      <button type="button" data-action="inline-settings">Full settings…</button>
      <div class="hint">Placement syncs across tabs. Full settings opens temporarily.</div>
    </section>`;
    // Preserve live button DOM across picker mutations, 15-second refreshes,
    // and focus changes. Recreating a pressed button can swallow its click.
    const currentMode = surface.querySelector('[data-display-mode][aria-pressed="true"]')?.dataset?.displayMode;
    if (!surface.querySelector('.quick') || currentMode !== mode) surface.innerHTML = next;
    inlineQuickHost.style.display = 'block';
    const menu = surface.querySelector('.quick');
    const pill = inlineDock?.shadowRoot?.querySelector('.badge');
    if (pill?.getBoundingClientRect && inlineDock.style.display !== 'none') {
      inlineQuickLastRect = pill.getBoundingClientRect();
    }
    const anchor = inlineQuickLastRect;
    if (!menu || !anchor) return;
    const rect = menu.getBoundingClientRect();
    const vw = Math.max(1, window.innerWidth || 800), vh = Math.max(1, window.innerHeight || 600);
    const gutter = 8, gap = 8;
    const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
    // Prefer a right-aligned card below the selected tier; use above if there
    // is insufficient room. Always bound it to the visible viewport.
    const x = clamp(anchor.right - rect.width, gutter, vw - rect.width - gutter);
    const y = anchor.bottom + gap + rect.height <= vh - gutter
      ? anchor.bottom + gap
      : clamp(anchor.top - rect.height - gap, gutter, vh - rect.height - gutter);
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  }
  function inlineTooltipText(profile, data, quota, remaining, reset, pace) {
    // Warnings/confidence details live in the floating tray's ⓘ section.
    // Hover is a deliberately concise snapshot, never an authoritative claim.
    const deadline = reset ? `Next reset: ${exact(reset.iso)}` : 'Next reset: unknown';
    const budget = pace ? `Daily budget: ~${formatPace(pace.perDay)} uses/day` :
      'Daily budget: awaiting reset time';
    return {deadline,budget,description:`${remaining}/${quota.max} remaining`};
  }
  /** PQL-DOC
   * Measure without leaving inline display overrides. Prefer above, then
   * upper-left/right, then a viewport-clamped fallback. Presentation only.
   */
  function positionInlineTooltip() {
    // Shadow-root CSS still governs hover/focus visibility. Temporarily show
    // the tooltip invisibly only to measure it; never leave display overridden,
    // or it would appear without hover and obscure ChatGPT's slider.
    const root = inlineDock?.shadowRoot;
    const badge = root?.querySelector('[data-action="inline-toggle"]');
    const tip = root?.querySelector('.tip');
    if (!badge || !tip || inlineDock?.style.display === 'none') return;
    const previousDisplay = tip.style.display;
    const previousVisibility = tip.style.visibility;
    tip.style.display = 'block';
    tip.style.visibility = 'hidden';
    const badgeRect = badge.getBoundingClientRect();
    const tooltipRect = tip.getBoundingClientRect();
    tip.style.display = previousDisplay;
    tip.style.visibility = previousVisibility;
    if (!badgeRect.width || !tooltipRect.width || !tooltipRect.height) return;
    const gutter = 8, gap = 10;
    const vw = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 800);
    const vh = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 600);
    const tw = tooltipRect.width, th = tooltipRect.height;
    const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));
    let x, y, placement;
    if (badgeRect.top >= th + gap + gutter) {
      // Preferred placement: above the pill, right edge aligned.
      x = clamp(badgeRect.right - tw, gutter, vw - tw - gutter);
      y = badgeRect.top - th - gap;
      placement = 'above';
    } else if (badgeRect.left >= tw + gap + gutter) {
      // Near the top, place the card to the left and as high as the
      // viewport allows. It stays above/alongside the pill, never below it.
      x = badgeRect.left - tw - gap;
      y = clamp(badgeRect.top - th + 26, gutter, vh - th - gutter);
      placement = 'upper-left';
    } else if (vw - badgeRect.right >= tw + gap + gutter) {
      x = badgeRect.right + gap;
      y = clamp(badgeRect.top - th + 26, gutter, vh - th - gutter);
      placement = 'upper-right';
    } else if (vh - badgeRect.bottom >= th + gap + gutter) {
      // A very narrow viewport may have no space beside the pill.
      x = clamp(badgeRect.right - tw, gutter, vw - tw - gutter);
      y = badgeRect.bottom + gap;
      placement = 'below-fallback';
    } else {
      // Final cramped-screen fallback: always keep the entire card (or its
      // scrollable viewport-limited area) visible, even if it overlaps the UI.
      x = clamp(badgeRect.right - tw, gutter, vw - tw - gutter);
      y = clamp(badgeRect.top - th - gap, gutter, vh - th - gutter);
      placement = 'clamped';
    }
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
    tip.dataset.placement = placement;
  }
  /** PQL-DOC
   * Render from the same derived ledger as the floating panel. Hide the
   * badge unless Pro is positively identified as selected. The independent
   * quick menu may survive native dismissal but closes on a known non-Pro
   * tier or navigation outside the supported chat pathname.
   */
  function updateInline() {
    if (!document.body || !isRegularChat()) {
      if (inlineDock) inlineDock.style.display = 'none';
      inlineQuickOpen = false; updateInlineQuick();
      return;
    }
    const profile = activeProfile();
    if (displayMode(profile) === 'floating') {
      inlineQuickOpen = false;
      if (inlineDock) inlineDock.style.display = 'none';
      updateInlineQuick();
      return;
    }
    const slider = visiblePickerSlider();
    const chosen = slider ? selectedPickerEffort(slider) : { tier: null, label: null };
    // The pill belongs to the SELECTED Pro tier, not to all five possible
    // slider stops. When moving to High, hide it immediately even if the
    // quick settings menu had been opened before the change.
    if (slider && chosen.tier && chosen.tier !== 'Pro') {
      inlineQuickOpen = false;
      inlineAnchor = null;
      if (inlineDock) inlineDock.style.display = 'none';
      updateInlineQuick();
      return;
    }
    if (!slider || chosen.tier !== 'Pro') {
      // Native menu can close on the pill's pointerdown. Keep the independent
      // settings portal visible but never leave a Pro pill on a non-Pro tier.
      inlineAnchor = null;
      if (inlineDock) inlineDock.style.display = 'none';
      updateInlineQuick();
      return;
    }
    inlineAnchor = slider;
    mountInlineDock();
    if (!inlineDock) return;
    inlineDock.style.display = 'block';
    if (slider) {
      const box = slider.getBoundingClientRect();
      const menuBox = slider.closest?.('[role="menu"]')?.getBoundingClientRect?.() ||
        slider.closest?.('[data-model-picker-view]')?.getBoundingClientRect?.();
      const headerBox = chosen.label?.getBoundingClientRect?.();
      const winWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 1200;
      const winHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 800;
      const badgeWidth = 68, badgeHeight = 28;
      // Right-align inside the native menu, with the center vertically
      // aligned to the selected tier's title instead of the slider track.
      const right = Math.min(box.right - 5, menuBox ? menuBox.right - 16 : box.right - 5);
      let left = right - badgeWidth;
      let top = headerBox ? headerBox.top + (headerBox.height - badgeHeight) / 2
        : (menuBox ? menuBox.top + Math.max(8, (box.top - menuBox.top - badgeHeight)/2) : box.top - 43);
      // Never obscure a selected header in narrow or translated menus.
      if (headerBox && left < headerBox.right + 12) top = box.bottom + 8;
      left = Math.max(6, Math.min(winWidth - badgeWidth - 6, left));
      top = Math.max(6, Math.min(winHeight - badgeHeight - 6, top));
      inlineDock.style.left = `${Math.round(left)}px`;
      inlineDock.style.top = `${Math.round(top)}px`;
    }
    const data = counted(profile);
    const quota = quotaInfo(profile);
    const remaining = data.blockedUntil ? 0 : Math.max(0, quota.max - data.used);
    const reset = nextReset(profile, data);
    const pace = paceProjection(remaining, reset);
    const tip = inlineTooltipText(profile, data, quota, remaining, reset, pace);
    const mode = displayMode(profile);
    const next = `<div class="wrap${inlineQuickOpen ? ' quick-open' : ''}"><button type="button" class="badge" data-action="inline-toggle"
      aria-label="Pro quota: ${remaining} of ${quota.max} estimated messages remaining. Change display placement."
      aria-expanded="${inlineQuickOpen}">${remaining}/${quota.max}</button>
      <div class="tip" role="tooltip"><b>${safe(tip.description)}</b><div>${safe(tip.deadline)}</div>
        <div>${safe(tip.budget)}</div><div>Click for display options</div></div>
    </div>`;
    const surface = inlineDock.shadowRoot.querySelector('#inline');
    if (surface && surface.innerHTML !== next) surface.innerHTML = next;
    positionInlineTooltip();
    updateInlineQuick();
  }
  function scheduleInlineUpdate() {
    if (inlineUpdatePending) return;
    inlineUpdatePending = true;
    setTimeout(() => { inlineUpdatePending = false; updateInline(); }, 50);
  }
  /** PQL-DOC
   * Debounce geometry refreshes after relevant native mutations/events.
   * Observe markup, not conversations; never persist a DOM snapshot. Fixed
   * portals keep script-owned controls outside React's picker subtree.
   */
  function watchNativePicker() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    const observer = new MutationObserver(changes => {
      // Updating our own Shadow DOM must not spin a mutation/render loop.
      if (changes.some(change => !panel?.contains?.(change.target) &&
        !inlineDock?.contains?.(change.target))) scheduleInlineUpdate();
    });
    observer.observe(document.body, { childList: true, characterData: true, attributes: true,
      attributeFilter: ['aria-valuetext', 'aria-valuenow', 'aria-checked', 'data-selected', 'data-state'], subtree: true });
    window.addEventListener('resize', scheduleInlineUpdate);
    document.addEventListener('scroll', scheduleInlineUpdate, true);
    document.addEventListener('pointerup', scheduleInlineUpdate, true);
    document.addEventListener('keyup', scheduleInlineUpdate, true);
    document.addEventListener('pointerdown', e => {
      if (!inlineQuickOpen) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(inlineDock) || path.includes(inlineQuickHost)) return;
      inlineQuickOpen = false;
      updateInlineQuick();
      scheduleInlineUpdate();
    }, true);
  }
  function mount() {
    if (panel || !document.body) return;
    panel = document.createElement('div');
    panel.id = 'chatgpt-pro-quota-ledger-host';
    panel.style.cssText = 'position:fixed;top:86px;right:18px;max-width:320px;z-index:2147483000';
    const shadow = panel.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div id="surface"></div>`;
    document.body.appendChild(panel);
    shadow.addEventListener('click', e => {
      const target = e.target.closest?.('[data-action]');
      if (!target) return;
      // A native <select> emits a click before its popup opens. Rebuilding
      // #surface here destroys the live control and instantly closes it.
      // Its selection is handled by the delegated change listener below.
      if (target.dataset.action === 'quota-select' || target.dataset.action === 'display-select' ||
          target.dataset.action === 'diag-capture') return;
      switch (target.dataset.action) {
        case 'toggle':
          expanded = !expanded;
          if (!expanded) closeTemporaryPanelVisit();
          break;
        case 'settings': settingsOpen = !settingsOpen; break;
        case 'info': infoOpen = !infoOpen; break;
        case 'manual': recordManual(); break;
        case 'undo': undoManual(); break;
        case 'clear': clearProfile(); break;
        case 'diag-preview': previewDiagnostics(); break;
        case 'diag-copy': copyDiagnostics(); break;
        case 'diag-download': downloadDiagnostics(); break;
        case 'diag-clear': clearDiagnostics(activeProfile()); break;
        case 'profile': {
          const name = prompt('Local account profile name (up to 40 characters). Switch profiles when changing ChatGPT accounts:', activeProfile());
          if (name !== null) {
            const clean = normalizedProfile(name);
            if (name.trim().length <= 40 && !/[\u0000-\u001f]/.test(name)) {
              put(ACTIVE, clean);
              clearDiagnosticPreview();
            }
          }
          break;
        }
        case 'limit': { // Compatibility for older test/UI automation.
          const profile = activeProfile();
          const raw = prompt('Local estimated Pro messages per week:', String(limit(profile)));
          if (raw !== null && /^[1-9]\d{0,4}$/.test(raw.trim())) {
            const n = Number(raw.trim());
            if (n <= 10000) put(settingsKey(profile), String(n));
          }
          break;
        }
        default: return; // Unknown nested action: never redraw a native control.
      }
      draw(true); // An explicit UI action may intentionally change focus/layout.
    });
    shadow.addEventListener('change', e => {
      if (e.target?.dataset?.action === 'diag-capture') {
        setDiagnosticsEnabled(activeProfile(), Boolean(e.target.checked));
        draw(true);
        return;
      }
      if (e.target?.dataset?.action === 'display-select') {
        setDisplayMode(activeProfile(), String(e.target.value || ''));
        return;
      }
      if (e.target?.dataset?.action !== 'quota-select') return;
      const profile = activeProfile();
      const selected = String(e.target.value || '');
      if (selected === 'auto') del(settingsKey(profile));
      else if (selected === '50' || selected === '200') put(settingsKey(profile), selected);
      else if (selected === 'custom') {
        const raw = prompt('Weekly Pro message allowance (1 to 10,000):', String(limit(profile)));
        const trimmed = typeof raw === 'string' ? raw.trim() : '';
        if (/^[1-9]\d{0,4}$/.test(trimmed) && Number(trimmed) <= 10000) {
          put(settingsKey(profile), trimmed);
        }
      }
      draw(true); // The native select has committed its new value.
    });
    shadow.addEventListener('focusout', e => {
      if (['quota-select', 'display-select'].includes(e.target?.dataset?.action)) {
        setTimeout(() => draw(), 0);
      }
    });
    draw();
  }
  /** PQL-DOC
   * Render the floating surface and refresh the picker adapter. Passive
   * updates must leave focused native selects attached. force=true is for
   * explicit UI actions, not timer/network refreshes. The selected profile
   * and shared storage are reread; expanded/settings/visit state is tab-local.
   * @param {boolean} [force=false]
   */
  function draw(force = false) {
    if (!panel) return;
    if (!isRegularChat()) { panel.style.display = 'none'; updateInline(); return; }
    const profile = activeProfile();
    if (displayMode(profile) === 'picker' && temporaryPanelVisit?.profile !== profile) {
      panel.style.display = 'none';
      updateInline();
      return;
    }
    panel.style.display = 'block';
    updateInline();
    // Passive refreshes (storage events, request completions, 15s timer)
    // must not replace a focused native dropdown while its menu is open.
    // Real selection changes and button clicks pass force=true above.
    if (!force && ['quota-select', 'display-select'].includes(
      panel.shadowRoot?.activeElement?.dataset?.action)) return;
    if (diagnosticPreview && diagnosticPreviewProfile !== profile) clearDiagnosticPreview();
    const data = counted(profile);
    const quota = quotaInfo(profile);
    const max = quota.max;
    const remaining = data.blockedUntil ? 0 : Math.max(0, max - data.used);
    const label = data.blockedUntil ? 'Pro blocked' : data.partial ? `${data.used} observed` : `${remaining} est. left`;
    const node = panel.shadowRoot.querySelector('#surface');
    if (!node) return;
    if (!expanded) {
      node.innerHTML = `<button id="pill" data-action="toggle" aria-label="Expand Pro quota ledger">Pro: ${safe(label)} ▾</button>`;
      return;
    }
    const upcoming = nextReset(profile, data);
    const resetLine = upcoming?.source === 'server'
      ? `Next reset (server-confirmed): ${exact(upcoming.iso)} · in ${relative(upcoming.iso)}`
      : upcoming?.source === 'projected'
        ? `Next reset (7-day projection): ${exact(upcoming.iso)} · in ${relative(upcoming.iso)}`
        : upcoming?.source === 'local-rollover'
          ? `Next possible 7-day rollover: ${exact(upcoming.iso)} · in ${relative(upcoming.iso)}`
          : 'Next reset: not yet reported by ChatGPT';
    const manualOverride = validLimit(get(settingsKey(profile)));
    const selection = manualOverride === null ? 'auto' :
      manualOverride === 50 ? '50' : manualOverride === 200 ? '200' : 'custom';
    const selected = key => key === selection ? ' selected' : '';
    const quotaSettings = settingsOpen ? `<div class="settings" id="pql-settings-panel" role="region" aria-label="Quota settings">
      <label for="pql-quota-choice">Weekly message allowance</label>
      <select id="pql-quota-choice" data-action="quota-select" aria-label="Weekly Pro quota">
        <option value="auto"${selected('auto')}>Auto (plan / server if available)</option>
        <option value="50"${selected('50')}>50 per week · Pro $100</option>
        <option value="200"${selected('200')}>200 per week · manual</option>
        <option value="custom"${selected('custom')}>Custom${selection === 'custom' ? ` (${max})` : '…'}</option>
      </select>
      <small class="muted">Plan: ${safe(quota.plan)} · Quota source: ${safe(quota.source)}</small>
      <label for="pql-display-choice" style="margin-top:10px">Counter placement</label>
      <select id="pql-display-choice" data-action="display-select" aria-label="Counter display placement">
        <option value="both"${displayMode(profile) === 'both' ? ' selected' : ''}>Both: picker + floating</option>
        <option value="picker"${displayMode(profile) === 'picker' ? ' selected' : ''}>Picker only</option>
        <option value="floating"${displayMode(profile) === 'floating' ? ' selected' : ''}>Floating only</option>
      </select>
      <small class="muted">Also change this from the pill next to the Pro Power slider.</small>
      <section class="diag" aria-label="Diagnostic capture settings">
        <div class="head"><b>Diagnostics</b>
          <label class="diag-toggle"><input type="checkbox" data-action="diag-capture"
            aria-label="Enable local diagnostic capture" ${diagnosticsEnabled(profile) ? 'checked' : ''}>Capture</label></div>
        <small class="muted">Off by default. Stores only allowlisted event types, statuses and times locally. No prompts, URLs, account IDs or tokens. Maximum 150 events for 7 days.</small>
        <small class="muted">${diagnosticEntries(profile).length} captured events for this local profile</small>
        <div class="row">
          <button data-action="diag-preview">${diagnosticPreview ? 'Refresh preview' : 'Preview report'}</button>
          <button data-action="diag-copy" ${diagnosticPreview ? '' : 'disabled'}>Copy</button>
          <button data-action="diag-download" ${diagnosticPreview ? '' : 'disabled'}>Download JSON</button>
          <button data-action="diag-clear">Clear log</button>
        </div>
        ${diagnosticNotice ? `<small role="status" class="muted">${safe(diagnosticNotice)}</small>` : ''}
        ${diagnosticPreview ? `<pre aria-label="Diagnostic report preview">${safe(diagnosticPreview)}</pre>` : ''}
      </section>
    </div>` : '';
    const explanations = infoOpen ? `<section class="info" id="pql-info-panel" aria-label="About this ledger">
      <b>How these numbers work</b>
      <p><b>Remaining</b> is an estimate based on Pro submissions this browser saw, not a live balance from OpenAI. Other devices, failed generations and retries can change the true balance.</p>
      <p><b>Daily budget</b> spreads the estimated remaining messages across the exact time until the displayed deadline. For example, 12 with 24 hours left is 12/day; 12 with 48 hours left is 6/day. It is a planning pace, not a limit imposed each day.</p>
      <p><b>Reset confidence:</b> server-confirmed applies to a currently reported Pro restriction. Seven-day projections and local rollovers are estimates and may not reflect the service's actual reset schedule.</p>
      <p><b>Detection:</b> accepted Pro requests are tracked automatically. Ctrl+Shift+P (or Alt+Shift+P) adds a manual mark; an automatic mark in the same tab within four minutes merges with it.</p>
      <p><b>Plan and privacy:</b> settings override the inferred allowance. Switch the local profile when changing ChatGPT accounts. The script makes no extra network requests and does not save prompt text, raw conversation IDs or credentials.</p>
      <p><b>Display placement:</b> the count can appear beside the Power slider's Pro end, in the floating tray, or both. Tap the picker pill or use ⚙ Settings. Opening full settings from the picker is temporary: closing that view returns to your saved placement, unless you explicitly choose a new one. The picker pill appears only while the native menu shows Pro as the selected effort.</p>
      <p><b>Tab discrepancies:</b> same-origin tabs share one local ledger. Check the script version, local profile, storage count and ledger checksum in diagnostics. Different Chrome profiles or incognito windows have separate storage. The extension refreshes on focus and visibility changes.</p>
      <p><b>Diagnostics:</b> optionally capture a bounded, privacy-minimized timeline under ⚙ Settings. Preview a redacted JSON report before copying or downloading. This does not read or export conversation text, account identifiers, session tokens or full network responses.</p>
      ${localStorageAvailable ? '' : '<p class="warn"><b>Storage unavailable:</b> marks may be lost on reload.</p>'}
    </section>` : '';
    const budget = paceProjection(remaining, upcoming);
    const budgetLine = budget
      ? `<div class="pace"><div class="muted label">Daily budget · estimated</div>
         <strong>≈${formatPace(budget.perDay)} uses/day</strong>
         <div class="muted">${safe(budget.timeLeftText)} · ${budget.source === 'server' ? 'confirmed deadline' : budget.source === 'projected' ? 'projected deadline' : 'tentative rollover'}</div></div>`
      : `<div class="pace"><div class="muted label">Daily budget · estimated</div>
         <div class="muted">Awaiting a future reset date to calculate a daily pace</div></div>`;
    node.innerHTML = `<div id="card">
      <div class="head"><b>ChatGPT Pro ledger</b><span class="row" style="margin:0">
        <button class="gear" data-action="settings" aria-label="Quota settings" aria-controls="pql-settings-panel" aria-expanded="${settingsOpen}" title="Quota settings">⚙</button>
        <button class="gear" data-action="info" aria-label="Info and explanations" aria-controls="pql-info-panel" aria-expanded="${infoOpen}" title="Explanations">ⓘ</button>
        <button data-action="toggle" aria-label="${temporaryPanelVisit?.profile === profile ? 'Close temporary settings and restore counter placement' : 'Collapse'}" title="${temporaryPanelVisit?.profile === profile ? 'Close and return to previous placement' : 'Collapse'}">${temporaryPanelVisit?.profile === profile ? '×' : '▴'}</button></span></div>
      ${temporaryPanelVisit?.profile === profile ? `<small class="muted">Temporary settings view · ${safe(displayMode(profile) === 'picker' ? 'close × to return to Picker only' : 'close × to return to your selected layout')}</small>` : ''}
      <div class="big ${data.blockedUntil ? 'warn' : ''}">${remaining}/${max} remaining</div>
      <div class="muted">${data.blockedUntil ? 'Server-confirmed Pro restriction' : data.partial ? 'Estimate from partial local history' : 'Estimated · since confirmed reset'}</div>
      <div class="bar"><div style="width:${(100*Math.min(1,remaining/max)).toFixed(1)}%"></div></div>
      <div class="${data.blockedUntil ? 'warn' : 'muted'}">${safe(resetLine)}</div>
      ${budgetLine}
      <small class="muted">Profile: <b>${safe(profile)}</b> · Detected: ${safe(quota.plan)} · Auto ${data.auto} · Manual-only ${data.manual}</small>
      ${quotaSettings}
      ${explanations}
      <div class="row"><button data-action="manual">+1 manual</button><button data-action="undo">Undo manual</button><button data-action="profile">Profile</button><button data-action="clear">Clear</button></div>
    </div>`;
  }
  window.addEventListener('keydown', e => {
    // Escape hatch: restores both displays even if ChatGPT changes the picker.
    if (e.altKey && e.shiftKey && e.code === 'KeyQ' && !e.ctrlKey && !e.metaKey && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation();
      setDisplayMode(activeProfile(), 'both');
      expanded = true; settingsOpen = true;
      draw(true);
      return;
    }
    if (e.repeat || !isRegularChat() || e.metaKey || e.code !== 'KeyP') return;
    if ((e.ctrlKey && e.shiftKey && !e.altKey) || (e.altKey && e.shiftKey && !e.ctrlKey)) {
      e.preventDefault(); e.stopImmediatePropagation(); recordManual();
    }
  }, true);
  window.addEventListener('storage', e => {
    if (e.key && e.key.startsWith(PREFIX)) draw();
  });
  window.addEventListener('focus', () => draw());
  window.addEventListener('pageshow', () => draw());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) draw();
  });
  /** PQL-DOC
   * Migrate/trim once, then mount UI and attach native-picker observers.
   * The 15-second timer only rereads local state. It does not poll the network.
   * Startup timing and other userscripts can affect whether page fetches are
   * observable, so this is not a guarantee of complete account-wide history.
   */
  function start() {
    migrateV1(); trimOld(); trimDiagnostics(activeProfile()); mount(); watchNativePicker();
    setInterval(() => { if (!panel) mount(); else draw(); }, 15_000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
