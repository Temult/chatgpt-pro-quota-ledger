# Architecture and maintainer map

This describes the implementation, including its compromises. The single `chatgpt-pro-quota-ledger.user.js` file is both source and distribution. There is no bundled alternative implementation. The `PQL-DOC` comments document the executable source; [provenance](provenance.json) and `scripts/check_repository.cjs` bind this release to its source hash and retain the v0.3.4 predecessor record.

## The design in one pass

```text
Page's own fetch/XHR
  ├─ supported POST body → parseSubmission → recognized Pro metadata
  │                       → successful status → recordAuto
  ├─ account/usage response → onAccountStatus → allowlisted plan label
  └─ conversation/init → onInit → optional cap + block/unblock observation

Shortcut/button → recordManual ─┐
Response → recordAuto ──────────┼─ separate event/status localStorage keys
                               └─ counted + quotaInfo + nextReset
                                  ├─ floating tray (draw)
                                  ├─ picker pill + independent quick menu
                                  └─ previewed diagnostics snapshot
```

Observations and conclusions are distinct. Auto/manual events describe something this browser saw. Capacity is a configuration or observed cap. Remaining and pace are derived estimates; they are not stored as an authoritative shared counter.

## Code map

| Area | Main functions | Contract to preserve |
| --- | --- | --- |
| Storage and profiles | `get`, `put`, `allKeys`, `scope`, `activeProfile` | Keep v2 keys stable; the selected profile is global to same-origin tabs. |
| Placement | `displayMode`, `setDisplayMode`, `openFullSettingsFromPicker` | Only explicit placement choices persist. Settings visits are tab-local. |
| Diagnostics | `sanitizedDiagnostic`, `captureDiagnostic`, `diagnosticReport` | Opt-in event capture, allowlisted scalars, frozen preview bytes. |
| Capacity | `quotaInfo`, `rememberPlan`, `onAccountStatus` | Manual override wins; do not infer unknown higher-tier entitlements. |
| Ledger | `appendEvent`, `recordManual`, `recordAuto`, `counted` | Independent keys, no prompt storage, manual-auto linking counted once. |
| Reset | `currentBlock`, `lastReset`, `nextReset`, `onInit` | Distinguish observed deadlines from local future projections. |
| Migration | `migrateV1`, `trimOld` | Deterministic import keys, old v1 untouched, no resurrection after Clear. |
| Transport | `parseSubmission`, `findProModel`, fetch/XHR wrappers | Original call arguments/results; no autonomous service request. |
| Native picker | `visiblePickerSlider`, `selectedPickerEffort`, `updateInline` | Require positive current Pro evidence; never choose a model. |
| Interaction | `mountInlineQuick`, `updateInlineQuick`, `draw` | Stable button/select nodes during gestures; temporary settings visits. |
| Lifecycle | `start`, storage/focus/pageshow/visibility hooks | Passive rereads; 15-second timer is not network polling. |

## Transport boundary

`urlOf` accepts only same-origin URLs. Eligible sends are POSTs to `/backend-api/conversation` or `/backend-api/f/conversation`. The current pathname must not begin with `/work`, `/codex` or `/atlas`. `findProModel` rejects explicitly non-primary conversation modes and accepts the finite `PRO_MODELS` set or a narrow model + `pro` effort combination. Unknown formats are not counted.

`parseSubmission` accepts strings up to 1,000,000 JavaScript characters. It parses the complete JSON transiently but returns only model and request fingerprint. The limit is not a byte cap, and a cloned Request can already have been fully buffered by `.text()` before that guard. No streaming completion parser exists.

The fetch wrapper forwards **exactly one** call and returns the original promise. Observation happens on a side chain. The local auto mark is made after the response reports `ok`. In contrast, XHR observes status at `loadend`, potentially after an entire stream has finished. Thus the transports can record different times for otherwise similar interactions. Profile attribution is captured at request start; the timestamp and manual-pair matching are computed later at response observation.

Only the selected init/account/usage/subscription responses are cloned and parsed. The script does not call those endpoints itself, fetch history, or inspect `/api/auth/session`. Passing the original request object through includes its original headers, but the code does not inspect authorization headers. A later userscript replacing fetch, or injection after the page cached fetch, can bypass observation.

Path and explicit-mode checks are **not an exhaustive mode detector**. A research request represented only by system hints may pass. Do not document all Agent/Research/Work use as excluded. See [known limitations](KNOWN_LIMITATIONS.md).

## Tally and evidence

`counted(profile, now)` loads statuses and events, computes the latest elapsed observed deadline, and starts its window at `max(now - 7 days, latest elapsed boundary)`. Boundaries are inclusive and event timestamps up to one second in the future are tolerated. Count every automatic event plus each manual event whose ID is not linked by an auto event in that same window.

`recordAuto` checks all local auto fingerprints for a match less than 20 seconds away. It then links to the most recent unused manual event from the same tab at most four minutes old. Fingerprints use 32-bit FNV-1a, not a cryptographic hash. Neither the retry check nor read-then-append is a distributed transaction. Independent event keys prevent unrelated writes overwriting one another, not every possible duplicate race.

`quotaInfo` chooses manual limit, then an observed cap associated with the current plan slug, then the built-in `prolite=50` preset, then a labeled fallback of 50. A changed plan slug invalidates the prior observed cap, not usage or the explicit override. No elapsed-time expiry invalidates a stale cap within the same plan. Account detection reads an account-default field and is not an account/workspace-binding mechanism.

`onInit` uses the first matching Pro limit to update a **single** blocked indicator. It can combine that with a numeric `reason.limit`. This design fit the original shared-limit observation but does not model multiple separate entitlements. A future deadline is service-reported as observed; after it passes, `lastReset` uses it locally. No request confirms restored access.

`nextReset` projects whole seven-day steps after an elapsed anchor. With no anchor, it uses the oldest stored event plus seven days if that is still future. It does not currently seek the oldest event *within the current window*, an edge case documented separately. The `partial` flag means "no elapsed boundary exists," not "account history is complete." Pace divides displayed remaining by actual fractional days to the displayed deadline.

## Persistence and concurrency

All normal records use `local_chatgpt_pro_quota_ledger_v2:`; all v0.2+ releases share the format. Separate keys eliminate the original shared-array lost-update pattern. Every redraw enumerates the current store. Storage events are delivered in other tabs, and focus/pageshow/visibility plus a 15-second timer refresh stale views. A read is not a transactional snapshot across all keys.

The active profile is shared, whereas the randomly generated tab ID and display expansion state are not. Async responses stay bound to the label that was selected at request start. Do not advertise automatic account separation or cross-device sync. [Storage](STORAGE.md) defines records, retention and rollback.

## UI boundaries and the bugs they prevent

The floating panel, inline pill and quick menu each use a script-owned open Shadow DOM host appended to `document.body`. They do not modify React-owned slider elements. Shadow DOM isolates styles; it does not protect secrets or guarantee freedom from site overlays/focus managers.

`selectedPickerEffort` first looks for an English selected-tier heading geometrically above the slider. Fallbacks are accessible current status/value. Reading all menu text is prohibited because it always contains the available Pro stop. Unknown selection hides the pill; known High/Medium/Instant/Extra High also closes the quick menu. A native picker that disappears during activation hides the pill but leaves its independent settings menu accessible.

Primary pointerdown commits pill/quick-menu actions before ChatGPT can swallow a later click. A handled-element WeakSet prevents the following click from acting twice. Keyboard click remains supported in tested paths. `updateInlineQuick` avoids replacing button nodes on passive updates when mode has not changed. This is critical: a redraw between pointerdown and click recreated the double-click symptom.

`draw(false)` similarly avoids replacing a focused quota/display select. Explicit committed changes call `draw(true)`. Opening full settings creates only `temporaryPanelVisit`; closing removes it and obeys the **current** saved mode. Never implement settings access as `setDisplayMode('both')`.

Tooltip placement measures hidden content and restores its prior inline display values. It prefers above, then side placement, then bounded fallbacks. It shows concise values; confidence explanations remain in Info as requested. Picker detection and floating positioning assume particular desktop geometry, not every browser zoom or translated interface.

## Diagnostics and trust

Capture is off by default and separate from ordinary quota persistence. Reports are built by allowlisting and retain no arbitrary request/response object. A preview freezes exact JSON; copy/download use that snapshot, not a freshly generated replacement. Clearing a log is not clearing quota events.

The checksum hashes sorted event/status **key names only**. It excludes values, settings, calculation time and profile identity. Identical checksums do not imply identical counts; colliding hashes are also possible. Reports still disclose usage timing and are not anonymous telemetry. See [Diagnostics](DIAGNOSTICS.md) for the optional HTTP-status round-trip defect and reporting boundaries.
