'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const retryable = new Set(['EACCES', 'EBUSY', 'EPERM']);
function pause(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }

function writeTextAtomic(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, content, { flag: 'wx' });
  try {
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temp, target); return target; }
      catch (error) {
        if (!retryable.has(error.code) || attempt >= 5) throw error;
        pause(20 * (attempt + 1));
      }
    }
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
  }
}

function writeJsonAtomic(target, value) { return writeTextAtomic(target, JSON.stringify(value, null, 2) + '\n'); }

module.exports = { writeTextAtomic, writeJsonAtomic };
