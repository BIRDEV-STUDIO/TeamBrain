'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationTracker, buildAgentSetupPrompt } = require('../public/notifications');

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

test('notification tracker aggregates and clears unread changes across repositories', () => {
  const tracker = new NotificationTracker(storage());
  const scopes = ['team:studio:project:robot', 'team:studio:project:web'];
  tracker.observe(scopes[0], [{ category: 'activity', id: 'robot-old', actor: 'ada' }], ['emre']);
  tracker.observe(scopes[1], [{ category: 'tasks', id: 'web-old', actor: 'ada' }], ['emre']);
  tracker.observe(scopes[0], [{ category: 'activity', id: 'robot-old', actor: 'ada' }, { category: 'activity', id: 'robot-new', actor: 'ada' }], ['emre']);
  tracker.observe(scopes[1], [{ category: 'tasks', id: 'web-old', actor: 'ada' }, { category: 'tasks', id: 'web-new', actor: 'ada' }], ['emre']);
  assert.equal(tracker.totalUnread(scopes), 2);
  tracker.markSeenMany(scopes, ['activity', 'tasks']);
  assert.equal(tracker.totalUnread(scopes), 0);
});

test('setup guide builds a safe client fallback when an older dashboard omits agent_prompt', () => {
  const prompt = buildAgentSetupPrompt({
    memory_repository: 'https://github.com/acme/memory.git',
    team: { name: 'Studio' },
    project: { name: 'Robot' },
    command: 'teambrain setup --repo C:\\code'
  });
  assert.match(prompt, /Merhaba! 👋 TeamBrain kurulumunda sana yardımcı olacağım/);
  assert.match(prompt, /doğrulamalar geçmeden başarı ilan etme/);
  assert.match(prompt, /yalnızca şu kesin URL'yi kullan: https:\/\/github\.com\/acme\/memory\.git/);
  assert.match(prompt, /tüm son seçimleri kullanıcıya göster ve onaylat/);
  assert.match(prompt, /teambrain setup --repo/);
});

test('setup guide prefers the server-provided agent prompt', () => {
  assert.equal(buildAgentSetupPrompt({ agent_prompt: 'Sunucudan gelen mesaj' }), 'Sunucudan gelen mesaj');
});
