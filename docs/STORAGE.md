# Storage, estimates and migration

All examples are synthetic. This is an internal schema description, not an invitation to paste real browser-storage exports into issues.

## Namespaces

The prefix is `local_chatgpt_pro_quota_ledger_v2:`. A profile-scoped prefix adds `encodeURIComponent(normalizedProfile(label)) + ':'`. Labels are trimmed, limited to 40 characters and reject control characters; invalid values become `Default`.

| Suffix | Stored value | Scope |
| --- | --- | --- |
| `active-profile` | Profile label, e.g. `Default` | Shared across all same-origin tabs |
| `migrated-v1` | `1` once migration has been attempted | Global |
| `<profile>:event:<id>` | JSON automatic/manual observation | Profile |
| `<profile>:status:<id>` | JSON block/unblock/reset observation | Profile |
| `<profile>:limit` | Decimal override, 1 to 10,000; absent means Auto | Profile |
| `<profile>:detected-plan` | `{slug, source, at}` | Profile |
| `<profile>:server-limit` | `{max, plan, at}` | Profile |
| `<profile>:display-mode` | `both`, `picker` or `floating`; absent defaults to `both` | Profile |
| `<profile>:diagnostics-enabled` | `1`; absent means off | Profile |
| `<profile>:diagnostic:<id>` | Sanitized diagnostic JSON | Profile |

An event's storage key ID and its JSON `id` are local IDs and need not match. Deterministic migration keys prevent two tabs importing the same legacy observations twice. Local labels are not service-account IDs.

## Event records

Manual event:

```json
{"id":"example-manual","type":"manual","at":1791849600000,"tab":"example-tab"}
```

Automatic event, paired with that manual mark:

```json
{"id":"example-auto","type":"auto","at":1791849660000,"model":"gpt-6-pro","request":"1234abcd","tab":"example-tab","manualId":"example-manual"}
```

`at` is milliseconds since the Unix epoch. `request` is a local 32-bit fingerprint or null, not the raw message or conversation ID. `manualId` links a marker, not a service ID. A paired automatic + manual pair contributes one count while both are in the tally window. An unpaired manual mark does not expire after four minutes; four minutes is only the pairing window. It remains part of the weekly local estimate until aging out, undo, or clear.

Migrated records may carry `legacy:true`, an inherited tab label, and no manual linkage. Current validation is intentionally modest, not a comprehensive hostile-storage validator. Other same-origin code can falsify ledger values; this data must never grant privileges.

## Status records

```json
{"kind":"blocked","at":1791849600000,"until":"2026-10-13T12:00:00Z"}
```

A later `{"kind":"unblocked","at":...}` clears the aggregate block indicator. `reset` records arise from v1 migration or synthetic fixtures; ordinary runtime init handling appends blocked/unblocked observations. An elapsed `until` from a block can still anchor local counts after an unblock. It does not independently verify that the provider restored capacity.

Remaining is not stored. At time `now`:

```text
boundary = latest elapsed deadline/reset observed locally, if any
windowStart = max(now - 7 days, boundary or 0)
used = auto events in window + unmatched manual events in window
remaining = active aggregate block ? 0 : max(0, configuredLimit - used)
```

This combines a trailing window with a known boundary. It is not a specification of the provider's quota algorithm. Window endpoints, marker pairing around boundaries, clock skew and request completion timing can all affect the estimate. Events are timestamped on response observation, not on starting the run.

## Persistence versus temporary state

Saved choices are allowance, plan/cap observations, display mode and capture consent. `expanded`, `settingsOpen`, `infoOpen`, current preview, selected native anchor, pointer suppression flags and `temporaryPanelVisit` live only in the tab's memory. A page refresh closes temporary views but retains normal stored observations/preferences.

Changing the active profile applies to all same-origin tabs after refresh. It does not keep tab A permanently assigned to account A. Use separate browser profiles for simultaneous independent accounts, and remember that the script cannot read another browser's usage.

## Retention and deletion

Event/status observations older than 45 days are pruned at startup by their `at` field. Diagnostic records are filtered to seven days/150 entries and physically trimmed during capture, preview or startup of the active profile. A closed browser or inactive local profile does not run a scheduled erasure task. Malformed quota records are not comprehensively purged.

**Undo manual** deletes the most recent marker; a linked auto survives. **Clear** confirms and deletes this profile's events/statuses, then records that legacy migration is complete. It preserves preferences, captured diagnostics and the old v1 key. **Clear log** confirms and deletes only this profile's diagnostic keys.

Uninstalling a userscript does not constitute a full site-data deletion routine. Clearing ChatGPT site data can erase the ledger along with unrelated site state. There is no built-in full ledger backup/restore UI; the diagnostic JSON is a minimized report, not a restorable backup.

## Migration and rollback

`local_chatgpt_pro_quota_ledger_v1` is read once if `migrated-v1` is absent. Valid legacy events import into Default under deterministic keys; elapsed cycle information becomes a reset observation; a future block is retained. The legacy key is never rewritten and can contain raw IDs that are absent from v2 records. Do not export it publicly.

If no valid legacy record exists, the migration marker is still written. Creating a v1 record afterward does not automatically import it. Clearing the current profile must not resurrect old v1 history.

All v0.2+ builds here use the same keys. To roll back the script, disable the newer copy, install the prior known-good userscript, and refresh every open tab. Do not run competing versions side by side. Returning to v0.1 is not a reverse migration: it cannot see later v2-only events.

## Storage failures

The current wrapper falls back to an in-memory Map when an individual storage operation throws, and records that storage has been unavailable. This is not complete fault recovery: if only writes fail while reads still succeed, later reads/enumeration can miss the fallback entries. Reload also loses in-memory entries. Treat the estimate as unreliable after a storage warning. This preserved edge case is characterized in tests rather than hidden by a documentation-only runtime patch.
