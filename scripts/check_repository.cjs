'use strict';
/** Release-preparation checks. No network access and no mutations. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function stripDocumentation(code) {
  // Only our separately marked, standalone comment blocks are removable.
  return code.replace(/^ *\/\*\* PQL-DOC\n[\s\S]*?^ *\*\/\n/gm, '');
}
function main() {
  const code = read('chatgpt-pro-quota-ledger.user.js');
  const pkg = JSON.parse(read('package.json'));
  const provenance = JSON.parse(read('docs/provenance.json'));
  const metaVersion = code.match(/^\/\/ @version\s+(\S+)/m)?.[1];
  const runtimeVersion = code.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(metaVersion, pkg.version, 'Userscript/package version mismatch');
  assert.equal(runtimeVersion, pkg.version, 'Runtime/package version mismatch');
  assert.equal(provenance.version, pkg.version, 'Provenance/version mismatch');
  assert.equal((code.match(/\/\*\* PQL-DOC\n/g) || []).length, provenance.comment_blocks_added);
  assert.equal(sha256(stripDocumentation(code)), provenance.release_userscript_sha256_without_comments,
    'Runtime payload does not match the reviewed v0.3.5 source identity');
  for (const requirement of ['// @grant        none','// @noframes','// @match        https://chatgpt.com/*']) {
    assert.ok(code.includes(requirement), `Missing metadata invariant: ${requirement}`);
  }
  assert.ok(!/^\/\/ @(?:require|connect|downloadURL|updateURL)\s/m.test(code), 'Unexpected permission/update metadata');
  assert.equal(pkg.private, true, 'This is not an npm-published package');
  const manifest = JSON.parse(read('release-files.json'));
  assert.equal(manifest.version, pkg.version);
  const names = manifest.source_files;
  assert.ok(Array.isArray(names) && names.length > 15);
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, names.length, 'Case-colliding release entries');
  for (const name of names) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..') && !name.includes('\\'), `Unsafe path ${name}`);
    assert.ok(!name.split('/').some(part => ['.git','node_modules','.venv','dist','archive','__pycache__'].includes(part)), `Forbidden release path ${name}`);
    const target = path.join(root, name);
    assert.ok(fs.lstatSync(target).isFile() && !fs.lstatSync(target).isSymbolicLink(), `Not an ordinary file: ${name}`);
  }
  for (const name of manifest.install_files) assert.ok(names.includes(name), `Install file absent from source manifest: ${name}`);
  // Check relative Markdown image/link targets. Web destinations aren't fetched.
  for (const name of names.filter(n => n.endsWith('.md'))) {
    const text = read(name).replace(/```[\s\S]*?```/g, '');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const url = match[1];
      if (/^(?:[a-z]+:|#)/i.test(url)) continue;
      const filePart = decodeURIComponent(url.split('#')[0]);
      const target = path.resolve(root, path.dirname(name), filePart);
      assert.ok(target.startsWith(root + path.sep), `Escaping document link in ${name}`);
      assert.ok(fs.existsSync(target), `Broken local link ${url} in ${name}`);
    }
  }
  for (const name of names.filter(n => n.endsWith('.json'))) JSON.parse(read(name));
  console.log(`REPOSITORY_CHECK_PASS: ${names.length} allowlisted files; local links; version; ${provenance.comment_blocks_added} comments; runtime payload SHA-256 verified`);
}
module.exports = {stripDocumentation, sha256};
if (require.main === module) {
  try { main(); } catch (error) { console.error(`REPOSITORY_CHECK_FAILED: ${error.message}`); process.exit(1); }
}
