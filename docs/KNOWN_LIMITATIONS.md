# Known limitations and preserved edge cases

The public script is a local estimator, not a provider billing instrument. Version 0.3.5 repairs projected-week accounting while preserving stored events. The remaining limitations below are not fixed by that change.

## Counting and scope

**HTTP acceptance is not a billing receipt.** Fetch counts at response acceptance; XHR counts at loadend. A generation can fail later. Requests started near a reset can be counted after it. Manual pairing uses observation time and can miss a mark if acceptance is delayed more than four minutes. Repeated accepted requests with the same fingerprint within 20 seconds are suppressed even if the service billed both; outside that interval both count.

**Not every non-chat workflow is recognized.** Explicit non-primary modes and `/work`, `/codex`, `/atlas` pathnames are excluded. A primary-mode Pro request identified as research only through `system_hints` is not excluded. Model names, explicit modes and routes are allowlisted, not an exhaustive understanding of the website. One new characterization test demonstrates this scope boundary without contacting the service.

**Input and identity limits.** Non-string, malformed or over-1,000,000-character bodies are ignored; unknown model slugs are not automatically counted. Request cloning may buffer a larger body before the size check. The request fingerprint is 32-bit and can collide. Missing IDs disable retry matching. Manual events on opposite sides of a tally boundary can pair in ways that diverge from server usage.

## Reset and capacity

**The seven-day window is a model assumption.** When an earlier server-reported reset is known, the ledger counts only events since the most recent projected seven-day boundary; without that anchor it uses a trailing seven-day window. A projected rollover and its count are not a formal provider quota algorithm. An elapsed reported deadline does not confirm access returned, and an existing boundary does not prove complete history.

**A missing next date can have a local cause.** With no reset anchor, `nextReset` considers the oldest retained event rather than the oldest event still in the active window. An event from eight days ago plus a recent event can therefore produce no date. This does not imply the server has no reset.

**One aggregate block.** The first supported model-limit entry drives the whole display. Different model families/cohorts with independent caps are not modeled separately. Do not advertise the script as an authoritative per-model allowance dashboard.

**Static plan presets and stale evidence.** `prolite=50` is baked into this release. It is not checked against live policy. A server-observed cap remains eligible until the plan slug changes or the user overrides it; there is no freshness timeout. `accounts.default` may not be the active workspace. Manual profiles and manual quota configuration remain necessary fallbacks.

## Storage and synchronization

**Shared keys prevent one particular race, not all races.** Separate event keys preserve unrelated tab writes. Retry detection and read-then-append are not atomic cross-tab transactions. An allKeys/read pass is not a transactional snapshot. Browser profiles, incognito partitions and devices do not share this store.

**Write-only failure is not fully recovered.** If `setItem` throws but `getItem` and enumeration continue to work, entries placed in the fallback Map may not be read back into the displayed total. There is a storage-warning path, but no reliable durability or complete fallback guarantee. The documentation pass includes a test reproducing the limitation.

**Same checksum is not same state.** The checksum covers key names only and not record values, preferences, timestamps or clocks. It can stay identical while counts change. It is not a digest of the full ledger and not a security feature. The new test demonstrates matching checksums with different derived counts.

**Retention is opportunistic.** Forty-five-day quota cleanup occurs at startup. Diagnostic deletion occurs while capture/preview/startup runs for a profile. No closed-browser erasure timer exists. Reports are filtered even when old physical entries have not yet been cleaned.

## Diagnostics

**Optional HTTP status is lost in report export.** Capture accepts camelCase `httpStatus` and emits snake_case `http_status`; export's second sanitizer pass drops it. This is a reporting omission, not a leak. Preserve the observation and fix it with a round-trip regression in a future runtime patch.

**Sanitization is scoped, not a security enclave.** Diagnostics whitelist strings and omit arbitrary objects; quota/event storage has looser validation. Other page-origin scripts can change local data. A minimized report still reveals usage timings and plan labels. The old v1 record is retained and may contain raw IDs. Do not post browser-storage dumps.

## Interface and compatibility

**English desktop picker geometry.** Recognition uses current English labels and bounding boxes. Translated, redesigned, zoomed, mobile or obscured pickers may hide or misplace the pill. Unknown selection is hidden. The floating tray and recovery shortcut remain fallbacks, not a promise of support for every interface.

**Browser timing still matters.** Other userscripts can replace hooks; injection can miss early requests. Old tabs continue running the old script until refreshed. Focus-managed native menus can vary. The three regression fixtures preserve the working single-click and temporary-settings behavior, but are not a universal accessibility audit. Touch, screen readers and every keyboard/focus sequence remain unqualified.

## Recommended next maintenance work

Resolve the diagnostic status round-trip, active-window rollover selection, and consistent storage-failure behavior as separate runtime fixes with targeted tests and live acceptance. Then investigate semantic mode exclusion and richer ledger comparisons. Do not redesign the working pill while addressing these internals, and do not claim the original 37/38 discrepancy has been definitively diagnosed from code review alone.
