# Contributing

Keep this a small, understandable userscript: a useful estimate in the right place, not an account scraper or an analytics service.

## Start here

Read [Architecture](docs/ARCHITECTURE.md), [Storage](docs/STORAGE.md) and [known limitations](docs/KNOWN_LIMITATIONS.md). Install Node.js 22+ and run `npm run check`. The distribution file is the source of truth and is tested directly. Python/Playwright are needed only for browser tests; commands are in [Testing](docs/TESTING.md).

## Non-negotiable behavior

- No autonomous prompts, quota bypass, credential extraction, telemetry, model switching or new network polling. Any proposal to expand permissions needs explicit maintainer review before implementation.
- Preserve the existing v2 namespace, counts and migration semantics. A UI change must not silently start a new ledger. Local account profiles remain clearly described as manual.
- Keep observed server metadata separate from estimates; no invented quotas, billing guarantees or repaired counters without evidence.
- Keep diagnostics opt-in and allowlisted. A new field needs sanitization, schema, privacy documentation and contaminated-input tests.
- Preserve single-click options, stable dropdown nodes, Pro-only pill visibility and temporary full settings. Closing settings must not silently change placement.

## Making a change

Create a focused branch, describe the defect with synthetic input, add a regression, and change only the necessary behavior. Run Node and browser tests. Update docs and changelog in the same pull request. Avoid unrelated formatting of the large userscript during a bug fix.

The current publication build deliberately has the same runtime as accepted v0.3.4. `PQL-DOC` blocks are removable comments; the repository checker verifies reconstruction of that predecessor. A future **intentional runtime change** must update the release version and provenance policy after review, not blindly change the expected hash merely to make a failing check green. Never put executable statements outside the removable-comment boundary and call the release documentation-only.

## Before asking for review

Check source/metadata version agreement, storage compatibility, no private data in fixtures, successful Node/browser/schema checks, and unchanged native slider state for presentation-only changes. Record what was tested live versus in a fixture. Follow [Releasing](docs/RELEASING.md) before packaging or tagging.

Use the bug/feature templates. Do not commit raw diagnostic exports from real accounts, private screenshots, browser profiles, tokens or old local archives. Synthetic examples must be labeled. `release-files.json` is an explicit allowlist, not an invitation to add every local file.

## License and review

Contributions are offered under the existing MIT license unless separately agreed. Credit borrowed work and preserve notices. AI-assisted contributions need the same review and tests as any other code. No independent review or security certification should be claimed merely because tests pass.
