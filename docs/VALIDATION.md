# Publication preparation validation

Prepared **2026-10-13** for the initial **v0.3.4 prerelease**. This is a local
verification record, not a GitHub Actions result or an independent review.
The v0.3.4 interface was exercised during development in a signed-in Chrome session.
No account credentials, live Pro submissions or paid inference were used
for the checks described here.

## Preserved baseline

The input source and installation archives were authenticated against their
supplied SHA-256 checksums. Their recorded hashes are in
[provenance.json](provenance.json). ZIP members passed integrity checks.
The predecessor userscript SHA-256 is:

```text
c03ebdb52da129fb5e07aeb697b689e791cf57e541a673df8b9b6a3452f46547
```

The publication file adds **45 marked documentation blocks only**. Removing
them reconstructs the entire predecessor byte for byte, including its
metadata, strings, whitespace and runtime logic. `npm run check` verifies
this property, and a regression test shows that a changed runtime statement
breaks that hash check. The documented file therefore has a different file
hash but no intended executable behavior or metadata changes. Users do not
need to reinstall for documentation alone.

The upstream MIT notice's Git blob hash was independently checked as
`82cc6a2bdcb93479d9b9cc5f852a49cbf5229b01`; the included notice matches those
bytes. This is license-provenance verification, not an exhaustive
copyright/originality analysis.

## Completed checks

| Check | Result and scope |
| --- | --- |
| Predecessor Node suite | 36/36 passed before documentation changes. |
| Publication Node suite | 50/50 passed: original 36 scenarios plus 14 transport, provenance and characterization tests. |
| Chromium dropdown suite | Passed on a synthetic page. |
| Chromium picker/tooltip/diagnostics suite | Passed on a synthetic page. |
| Chromium one-click/temporary-settings suite | Passed on a synthetic page. |
| Diagnostic schema suite | Fresh synthetic output validates; sensitive extra fields are rejected. |
| Repository consistency | Versions, 45 reversible comment blocks, JSON, local Markdown targets and explicit release file manifest checked. |
| Release packaging | Explicit source/install allowlists, fixed ZIP metadata, CRC verification and repeated-byte comparison. |
| Clean source extraction | Checks rerun from the extracted publication archive, not just the editing directory. |

A clean-extraction run initially exposed a timing-sensitive assertion in the
picker fixture: it sampled tooltip visibility immediately after a debounced
label refresh. The test now waits, with a bounded timeout, for the same
visible condition. No runtime change or retry-until-green wrapper was added.
The updated fixture passed repeated standalone runs and the clean-source
check below.

Local tools: Node.js **22.16.0**, Python **3.13.5**, Playwright **1.57.0**,
jsonschema **4.26.0**, and system Chromium. No Windows runner or live
ChatGPT session was used for these new local checks.

The suite also documents existing edge cases rather than changing them:
key-name-only checksum comparisons, optional diagnostic HTTP status lost
on export, old-event rollover selection, storage-write fallback gaps and
mode/aggregate-limit assumptions. Characterization tests reproduce these
limitations; a passing characterization test is **not a claim the behavior
is correct**. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Not completed in this environment

The additional `chromium_storage.py` suite is designed to use two pages with
real shared-origin localStorage instead of the earlier storage stand-ins.
Browser administrator policy blocked navigation even to its synthetic
loopback address. It was **not passed** and the policy was not altered or
bypassed. It is opt-in locally and explicitly included in the supplied CI
workflow. Run `python scripts/run_browser_tests.py --include-origin-storage`
on an ordinary development or CI runner before publishing.

The CI configuration is prepared but has not run on GitHub. Its Linux and
Windows jobs, repository permission settings, installation from an actual
GitHub release, additional languages/devices/accessibility tools, exact
provider billing reconciliation, and a complete independent security audit
remain unverified. The historical 37/38 tab disagreement has not been
conclusively diagnosed.

## Publication decision

The repository package is ready for review and an initial **prerelease**
workflow. Wait for successful real CI, including the additional shared-origin
test, review the documented limitations, then deliberately publish the exact
reviewed commit and locally verified assets. This bundle itself has no
publication capability or credentials. Nothing was pushed or published.
