'use strict';
/** Cross-platform Node test discovery; no shell glob expansion or dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.cjs')).sort()
  .map(name => path.join(root, 'tests', name));
if (!tests.length) throw new Error('No Node test files discovered');
const result = spawnSync(process.execPath, ['--test', ...tests], {cwd: root, stdio: 'inherit', timeout: 120000});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
