"""Validate a newly emitted synthetic report, plus rejection of extra fields."""
from pathlib import Path
import copy
import json
import subprocess
import shutil
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js required to emit the synthetic report')
result = subprocess.run([node, 'scripts/emit_example.cjs'], cwd=ROOT,
                        capture_output=True, text=True, encoding='utf-8', check=True, timeout=30)
report = json.loads(result.stdout)
schema = json.loads((ROOT / 'docs/diagnostic-schema-v1.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, format_checker=FormatChecker())
validator.validate(report)
contaminated = copy.deepcopy(report)
contaminated['access_token'] = 'SYNTHETIC-DO-NOT-EXPORT'
assert list(validator.iter_errors(contaminated)), 'Extra root fields must fail schema validation'
contaminated = copy.deepcopy(report)
contaminated['diagnostics'][0]['prompt'] = 'SYNTHETIC PRIVATE TEXT'
assert list(validator.iter_errors(contaminated)), 'Extra event fields must fail schema validation'
assert report['version'] == '0.3.5'
print('DIAGNOSTICS_SCHEMA_PASS: fresh actual-script report; strict schema; extra sensitive fields rejected')
