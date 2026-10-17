# Test guide and confidence boundaries

## Node checks

Use Node.js 22+:

```sh
npm run check
```

No npm packages are needed. The test runner enumerates `.test.cjs` files itself rather than relying on a Unix shell glob, so the same command works in PowerShell. It syntax-checks the userscript, validates repository metadata/links/manifest/provenance, and runs the actual source in a VM harness.

The original 36 scenarios are retained. The extracted helper in `tests/helpers/browser-harness.cjs` supplies synthetic storage, clock, fetch/XHR and a deliberately small DOM stub. New characterization tests cover transport forwarding, XHR, malformed/oversize input, and preserved limitations. Tests named `characterization` assert current behavior that a future runtime fix may deliberately change; passing them does not mean the limitation is desirable.

## Browser and schema tests

Python 3.10+ in a virtual environment is recommended:

```sh
python -m venv .venv
# Activate with .venv\Scripts\Activate.ps1 on Windows, or source .venv/bin/activate on POSIX.
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python scripts/run_browser_tests.py
```

On a minimal Linux runner use `python -m playwright install --with-deps chromium`. `CHROMIUM_PATH` overrides browser selection. Otherwise an installed `/usr/bin/chromium` is used when available, followed by Playwright's managed browser. Versions in `requirements-dev.txt` pin the direct development packages, not the entire OS or all transitive dependencies.

| Suite | Evidence |
| --- | --- |
| `chromium_smoke.py` | Native select stays attached on click/storage refresh; quota and pace render. |
| `chromium_integration.py` | Pro-only visibility, heading alignment, adaptive tooltip, independent menu and diagnostics. |
| `chromium_quick_actions.py` | One click despite native picker dismissal; temporary settings; deliberate placement override; keyboard path. |
| `chromium_storage.py` | Two browser pages with real shared origin-localStorage, accepted fake requests, storage-event refresh and reload persistence. |
| `diagnostics_schema.py` | A freshly emitted synthetic report validates against schema v1; rejected extra sensitive fields. |

Assertions on debounced UI transitions wait for the observable condition with a timeout, rather than treating a single instantaneous visibility sample as settled state. No automatic rerun is used to conceal a failure.

The first three use an in-memory storage stand-in. The fourth uses a synthetic loopback origin fulfilled entirely by Playwright routing, not a remote server or real account. Network attempts are blocked/asserted. The browser runner starts each suite separately with a timeout; no ChatGPT credentials or Pro message quota are used.

The navigation-dependent two-tab test is opt-in locally: `python scripts/run_browser_tests.py --include-origin-storage`. CI includes it. In the preparation environment, browser administrator policy blocked even loopback navigation, so this extra test could not be executed there; the three existing set-content Chromium suites and schema test did execute. A supplied test is not a passed test. The first remote CI run must establish this extra coverage.

## Reproducible packaging

```sh
python scripts/package_release.py
```

The packager first runs repository/Node checks, then writes only explicitly listed files with fixed ZIP metadata and no compression. Repeated packaging of the same file bytes produces identical archives. This proves artifact reproducibility, not a hermetic rebuild of external tools. Browser tests must be run separately and their success checked before a release is published.

The source archive must be extractable into a clean directory and pass `npm run check` there. Logs/screenshots belong under ignored test-artifact paths unless a specifically reviewed synthetic demonstration is intentionally included. Do not infer a remote green Actions run from local test success.

## Manual acceptance before general availability

Try one normal, useful Pro submission with one script version enabled; do not spend quota solely to exercise a test. Check one count, no change for a non-Pro send, Pro-only pill visibility, single-click placement, dropdown usability, temporary settings close, focused-tab synchronization, and a previewed diagnostic report. A second browser or another device is not expected to share the count.

The v0.3.4 interface was used in a live Chrome session during development. The v0.3.5 counting patch has synthetic regressions; it does not alter the native model-picker UI. Server-side quota reconciliation and compatibility across languages, mobile layouts, accessibility tools, and future UI revisions remain outside the test coverage.
