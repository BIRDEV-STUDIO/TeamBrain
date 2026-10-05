'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = __dirname;
const tests = fs.readdirSync(directory)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => path.join(directory, file));

const result = spawnSync(process.execPath, [
  '--experimental-sqlite',
  '--test',
  '--test-concurrency=1',
  ...tests
], { stdio: 'inherit' });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
