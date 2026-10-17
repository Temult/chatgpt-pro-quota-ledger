# Changelog

## 0.3.5 - 2026-10-17

- Apply the same projected weekly reset boundary to usage counting and next reset date.
- Preserve all stored events, profile settings and prior server observations.
- Label counts after inferred future rollovers as estimated since projected reset, not confirmed.
- Add time-boundary regressions reproducing the 1/50 after reset defect.

## Publication preparation - 2026-10-13

- Document the accepted v0.3.4 source with reversible JSDoc comments; no runtime or metadata-header change.
- Replace accumulated release prose with a user guide, source map, precise storage/diagnostic contracts, explicit limitations and publication instructions.
- Retain the original 36 scenarios; add transport and known-edge-case characterization, real origin-storage browser coverage and strict synthetic report schema checks.
- Add portable test runners, explicit release allowlist, deterministic local packaging, read-only pinned CI and reviewed upstream license attribution.
- Exclude private screenshots, ad hoc logs and historical executables from the public source tree.
- Publication remains a separate maintainer action.


## 0.3.4 - 2026-10-13 (picker options reliability and temporary settings)

- Fix quick-menu actions that sometimes needed two clicks when ChatGPT dismissed its native model picker mid-gesture. Commit primary-pointer actions at pointerdown and suppress their duplicate click, while retaining keyboard activation.
- Preserve quick-menu button DOM nodes during unrelated background redraws, so the first click remains effective.
- Make **Full settings…** a temporary view that never silently changes Picker-only to Both. Closing the temporary tray returns to the saved placement; deliberate settings changes still persist.
- Add offline Chromium regression covering one-click Picker/Both, a native picker that disappears during pointerdown, a temporary settings visit and close, an explicit placement override, keyboard operation and unchanged usage history.
- No quota calculation, persistent storage format, diagnostic capture or counting changes.

## 0.3.3 - 2026-10-13

- Fix picker-pill clicks lost when ChatGPT closes its native model menu during pointerdown.
- Render placement options in their own viewport-fixed menu, independent of the native slider.
- Keep pointer/keyboard activation and close-on-outside-click behavior.
- Move estimation disclaimers from hover tooltip into the existing ⓘ information screen.
- No changes to stored counts, quota calculation, diagnostics, or settings.


## 0.3.2 - 2026-10-12 (tooltip positioning)

- Picker pill hover tooltip now prefers opening **above** the pill, rather than beneath the Power slider.
- When the pill is near the top of the viewport, place the tooltip beside it instead of clipping its top edge. On narrow screens, fall back to a clamped or below position as needed.
- Constrain tooltip width and height to the viewport, keeping its contents scrollable if the window is small.
- Keep existing local message history, diagnostics, plan settings and display choices unchanged.


## 0.3.1 - 2026-10-12 (UI repair candidate)

- Show the integrated pill only when the native Power picker has **Pro selected**; never show it merely because Pro is an available slider stop. Suppress on High, Extra High, Medium, Instant, and unknown selection.
- Match the compact pill styling to the purple Pro treatment, align it vertically with the native selected-tier label and right-align within the picker without changing React-owned markup.
- Track label/slider updates including character and selected-state mutations and keyboard/pointer adjustments, while retaining the floating display mode and rescue shortcut.
- Extend offline Chromium regression to exercise High ↔ Pro and switching to High while the quick display menu is open; preserve existing ledger storage and diagnostics.
- No change to Pro counting rules, plan detection, storage keys or authorization.

## 0.3.0 - 2026-10-12 (release candidate)

- Added optional diagnostics capture in Settings: explicit opt-in, bounded 150 events/7 days, allowlisted fields, exact JSON preview/copy/download, separate Clear log without deleting the quota ledger.
- Added sync-summary report fields (script version, display mode, status/event key counts, and checksum of ledger keys) to diagnose persistent tab disagreements.
- Added a counter pill by the native Power slider when its recognized menu is open, with hover details and an integrated placement menu. Supports **Picker only / Floating only / Both**, accessible from both surfaces.
- Added Alt+Shift+Q restore shortcut, refresh-on-focus and visibility changes, and conservative fail-closed slider selectors. No model-selection or outgoing-request modification.
- Continued the existing v0.2 storage namespace, original v0.1 migration and all local event/limit keys. No reset of the working counter.
- Expanded docs: internal data flow, diagnostic privacy schema, GitHub contribution/issue template, and offline integration/browser tests.
- Production UI compatibility remains unverified until actual user testing.


## 0.2.2 - 2026-10-12

- Added an **ⓘ information section** next to the ⚙ settings control. Detailed explanations of counting, resets, privacy, model selection and uncertainty have moved into that section rather than cluttering the expanded widget.
- Added **estimated daily-use pacing**, showing the remaining estimated messages divided by the *precise* remaining time before the displayed reset. Examples: 12 messages with 24 hours left = 12/day; 12 with 48 hours left = 6/day. The reset's evidence level (server-confirmed, projected or tentative) remains explicit, and no daily budget is invented without a future deadline.
- **Fixed native quota dropdown immediately flashing closed:** clicking a `<select>` no longer runs the generic panel redraw. Passive refreshes also defer replacement of a focused quota dropdown, while actual selections redraw immediately.
- Preserved the script name, Tampermonkey namespace, v0.1 migration and v0.2 data keys, so existing local counts and manual overrides remain untouched.
- Extended automated regression suite to 31 passing tests. Additional isolated Chromium smoke test exercises an actual native select, simulated background storage update, option change, information toggle and daily budget rendering.

## 0.2.1 - 2026-10-12

- Expanded UI now shows **remaining / configured quota** (e.g., `38/50 remaining`) and a remaining-capacity bar.
- Shows the **next** reset: server-confirmed while blocked, seven-day projection from a confirmed past boundary, or earliest observed event rollover when no boundary exists. Projections are clearly marked non-authoritative.
- Passively detects allow-listed plan slugs from already-occurring ChatGPT account / usage responses; `prolite` selects the known 50-message Pro $100 allowance. A server-reported Pro-block numeric cap can populate Auto.
- Adds small settings gear with Auto / 50 / 200 / custom weekly allowance; v0.2 manual override key and all existing event records retained.
- Pro $200 / $500 caps are not guessed from plan labels because usage differs by tier and cohort; manual selection remains available.
- Added synthetic browser tests for plan detection, server-cap preference, settings, preserved counts, and reset projections; 20/20 tests passed.

## 0.2.0 - 2026-10-12

- Separate append-only storage keys for simultaneous tabs; no shared JSON array lost-update race.
- One-time, idempotent import of v0.1 event history and verified reset boundaries, with v0.1 left unchanged.
- Manual local account profiles and configurable Pro quota targets.
- Stable auto/manual pairing, retry de-duplication, and request-start profile binding.
- Short-lived hashed request identities instead of raw conversation/message IDs in v0.2 records.
- Expanded browser-simulation regression suite, README, security policy, third-party notices and MIT license.
- Still an estimate, not a server-authoritative remaining count. No live ChatGPT service verification was performed for this release candidate.

## 0.1.0 - 2026-10-10

- First working local Pro ledger, with automatic detection, manual shortcut, and exhaustion-reset timestamp.
- Original source preserved unchanged in `archive/v0.1/`.
