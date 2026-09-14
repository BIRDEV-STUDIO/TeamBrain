#!/usr/bin/env node
'use strict';
const { run } = require('../src/cli');
run(process.argv.slice(2)).catch((error) => {
  console.error(`teambrain: ${error.message}`);
  process.exitCode = 1;
});
