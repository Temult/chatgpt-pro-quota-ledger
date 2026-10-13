"""Run isolated browser/schema suites with bounded execution; never publish."""
from pathlib import Path
import argparse
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SUITES = (
    'chromium_smoke.py', 'chromium_integration.py', 'chromium_quick_actions.py',
    'diagnostics_schema.py',
)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--include-origin-storage', action='store_true', help='Also run navigation-dependent real-origin two-tab storage test')
    args = parser.parse_args()
    suites = SUITES + (('chromium_storage.py',) if args.include_origin_storage else ())
    failed = []
    for name in suites:
        print(f'RUN {name}', flush=True)
        try:
            result = subprocess.run([sys.executable, str(ROOT / 'tests' / name)],
                                    cwd=ROOT, timeout=120, check=False)
            if result.returncode:
                failed.append(name)
        except (OSError, subprocess.TimeoutExpired) as error:
            print(f'FAILED {name}: {error}', file=sys.stderr)
            failed.append(name)
    if failed:
        print('Failed suites: ' + ', '.join(failed), file=sys.stderr)
        return 1
    print(f'BROWSER_SCHEMA_PASS: {len(suites)}/{len(suites)} suites')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
