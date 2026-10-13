"""Build deterministic, explicitly allowlisted ZIPs. No GitHub writes or credentials.

Uses ZIP_STORED, sorted names, fixed timestamps and normalized permissions so
archive bytes do not depend on local mtimes or compression-library versions.
The source file bytes remain unchanged. Node/repository checks run before build.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {'.git', '.venv', 'node_modules', 'dist', 'archive', '__pycache__'}

def source_bytes(names: list[str]) -> dict[str, bytes]:
    if len({name.casefold() for name in names}) != len(names):
        raise ValueError('Duplicate or case-colliding release paths')
    result = {}
    for name in sorted(names):
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name or FORBIDDEN.intersection(rel.parts):
            raise ValueError(f'Unsafe release path: {name}')
        file = ROOT / name
        if not file.is_file() or file.is_symlink() or any(p.is_symlink() for p in file.parents if p != ROOT.parent):
            raise ValueError(f'Release path is not a regular local file: {name}')
        if ROOT not in file.resolve().parents:
            raise ValueError(f'Path escapes repository: {name}')
        result[name] = file.read_bytes()
    return result

def zip_bytes(files: dict[str, bytes], prefix: str = '') -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(prefix + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, content)
    payload = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        if archive.testzip() is not None:
            raise ValueError('Generated ZIP integrity check failed')
    return payload

def build(manifest: dict) -> dict[str, bytes]:
    version = manifest['version']
    source = source_bytes(manifest['source_files'])
    install = {name: source[name] for name in manifest['install_files']}
    return {
        f'ChatGPT-Pro-Quota-Ledger-v{version}-Install.zip': zip_bytes(install),
        f'ChatGPT-Pro-Quota-Ledger-v{version}-Source.zip': zip_bytes(source, 'chatgpt-pro-quota-ledger/'),
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-reproducible', action='store_true', help='Build twice and compare exact archive bytes')
    args = parser.parse_args()
    node = shutil.which('node')
    if not node:
        raise SystemExit('Node.js 22+ is required to verify the release')
    subprocess.run([node, '--check', 'chatgpt-pro-quota-ledger.user.js'], cwd=ROOT, check=True, timeout=30)
    subprocess.run([node, 'scripts/check_repository.cjs'], cwd=ROOT, check=True, timeout=30)
    subprocess.run([node, 'scripts/run_tests.cjs'], cwd=ROOT, check=True, timeout=150)
    manifest = json.loads((ROOT / 'release-files.json').read_text(encoding='utf-8'))
    artifacts = build(manifest)
    if args.verify_reproducible and artifacts != build(manifest):
        raise SystemExit('Two builds differ')
    dest = ROOT / 'dist'
    if dest.is_symlink():
        raise SystemExit('Refusing a symlinked dist directory')
    dest.mkdir(exist_ok=True)
    checksums = []
    for name, content in artifacts.items():
        target = dest / name
        if target.is_symlink():
            raise SystemExit('Refusing to overwrite a symlinked release file')
        target.write_bytes(content)
        checksums.append(f'{hashlib.sha256(content).hexdigest()}  {name}')
    checksum_file = dest / f"ChatGPT-Pro-Quota-Ledger-v{manifest['version']}-SHA256SUMS.txt"
    if checksum_file.is_symlink():
        raise SystemExit('Refusing a symlinked checksum file')
    checksum_file.write_text('\n'.join(checksums) + '\n', encoding='utf-8', newline='\n')
    print('PACKAGING_PASS' + ('; repeated bytes identical' if args.verify_reproducible else ''))
    for row in checksums:
        print(row)
    print('Archives written locally. Nothing was published. Run browser/schema tests before releasing.')

if __name__ == '__main__':
    main()
