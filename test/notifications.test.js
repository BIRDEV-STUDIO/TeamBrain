'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationTracker } = require('../public/notifications');

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('notification tracker treats the first snapshot as seen and only flags other actors', () => {
  const tracker = new NotificationTracker(storage());
  tracker.observe('project-a', [{ category: 'decisions', id: 'old', actor: 'ada' }], ['emre']);
  assert.deepEqual(tracker.counts('project-a'), { decisions: 0 });
  tracker.observe('project-a', [
    { category: 'decisions', id: 'old', actor: 'ada' },
    { category: 'decisions', id: 'own', actor: 'Emre' },
    { category: 'decisions', id: 'incoming', actor: 'Ada' }
  ], ['emre']);
  assert.deepEqual(tracker.counts('project-a'), { decisions: 1 });
});

test('notification tracker keeps unread items until their menu is seen', () => {
  const tracker = new NotificationTracker(storage());
  tracker.observe('team-a', [{ category: 'team', id: 'baseline', actor: 'emre' }], ['emre']);
  tracker.observe('team-a', [
    { category: 'team', id: 'baseline', actor: 'emre' },
    { category: 'team', id: 'member:ada', actor: 'ada' }
  ], ['emre']);
  assert.equal(tracker.counts('team-a').team, 1);
  tracker.markSeen('team-a', 'team');
  assert.equal(tracker.counts('team-a').team, 0);
  tracker.observe('team-a', [
    { category: 'team', id: 'baseline', actor: 'emre' },
    { category: 'team', id: 'member:ada', actor: 'ada' }
  ], ['emre']);
  assert.equal(tracker.counts('team-a').team, 0, 'the same item must not become unread twice');
});
