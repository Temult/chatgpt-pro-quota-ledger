# v0.3.5 validation

This is a focused fix for the weekly rollover mismatch. Automated tests check the October 17 reset boundary, the October 24 projection, old-event retention, and a new message after rollover. Browser/UI fixtures check that the pill, dropdown, and menu interaction remain functional. This is not a server-authoritative quota calculation and the patch needs user acceptance in the live browser before a public release.

## Reproduction

```bash
npm run check
python scripts/run_browser_tests.py
python scripts/package_release.py --verify-reproducible
```
