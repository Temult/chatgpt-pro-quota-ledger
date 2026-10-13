# Security and privacy

## Report a vulnerability privately

Use the repository's **Security → Report a vulnerability** control after the maintainer enables private vulnerability reporting. If it is unavailable, open only a minimal issue requesting a private reporting channel, without an exploit, credentials or private data. Do not post tokens, cookies, HAR files, conversation URLs or raw localStorage. No response-time guarantee or formal security-support SLA is offered.

Ordinary UI bugs can use the bug template with synthetic data and a reviewed minimized diagnostic report.

## Threat model

The script executes in the ChatGPT page context with `@grant none`, on `https://chatgpt.com/*`, at document start and outside frames. It wraps the page's normal fetch/XHR, temporarily parses selected JSON and writes origin-local ledger data. It does not issue its own fetch/XHR requests, read cookies, fetch session/auth endpoints, inspect authorization headers, alter request arguments, or consume/replace the returned response stream.

This is not a sandbox. Same-origin scripts can see/modify its localStorage, open Shadow DOM and JavaScript state. The local estimate must never be used for authentication, access control or financial billing. `hashKey` is a 32-bit non-cryptographic comparison hint, not encryption. There are no secrets that should be stored in this ledger.

## Data minimization

V2 quota records store times, recognized model labels, local random identifiers, request fingerprints and manual pairing links. They do not persist prompts or raw message/conversation IDs. Plan handling keeps allowlisted labels and an optional observed cap, not the complete account response. V1 migration leaves the original record unchanged; that old key can contain raw IDs.

Diagnostic capture requires opt-in and allowlists event scalars before persistence and again before export. Previewed bytes are copied/downloaded only on user action. Timestamps, plan labels and key checksums can still correlate activity; a report is minimized, not anonymous. Retention cleanup is opportunistic, not guaranteed while a browser is closed. See [Diagnostics](docs/DIAGNOSTICS.md) and [known edge cases](docs/KNOWN_LIMITATIONS.md).

No telemetry, remote analytics, cache clearing, service-worker modification, cloud synchronization, automatic model choice, or autonomous prompt submission is implemented. Installing dependencies, downloading a release and the userscript manager's own update checks are separate from the script's normal runtime network behavior.

## Distribution and dependencies

Obtain releases from the intended maintainer repository and review the source. SHA-256 checksums detect corruption only when their reference is trusted; they are not a signature and do not establish maintainer identity on their own. No new auto-update URL is embedded in this publication build. Do not add one pointing at an unreviewed branch or an unrelated account.

The userscript has no runtime dependencies. Node tests use standard modules. Browser/schema test tooling is development-only. CI is read-only, uses pinned action commits, avoids `pull_request_target`, does not use user credentials, and does not publish releases. Inspect dependency and workflow updates before merging. Repository settings such as private vulnerability reporting and branch rules are manual publication steps, not settings this archive has applied.

## Scope of this review

The source was inspected and exercised with synthetic tests for this release preparation. That is not an independent security audit, a guarantee of complete redaction in arbitrary hostile environments, or certification by OpenAI. Known weaknesses and test boundaries are documented instead of hidden behind an unqualified "secure" label.
