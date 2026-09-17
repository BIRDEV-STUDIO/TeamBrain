'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const {parseUrl}=require('../src/repo-registry');
test('repository URLs produce isolated owner/name identities',()=>{assert.deepEqual(parseUrl('https://github.com/acme/team-memory.git'),{owner:'acme',name:'team-memory',full:'acme/team-memory'}); assert.deepEqual(parseUrl('git@github.com:acme/team-memory'),{owner:'acme',name:'team-memory',full:'acme/team-memory'}); assert.throws(()=>parseUrl('https://example.com/a/b'),/exact GitHub/);});
