'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildForest, buildProjectTree, layoutMindMap, constrainMapView } = require('../public/tree-model');

function event(id, causationId, createdAt) {
  return { event_id: id, causation_id: causationId || null, event_type: 'note.created', title: id, created_at: createdAt || '2026-10-17T10:00:00.000Z' };
}

test('knowledge tree turns causal records into ordered branches', () => {
  const model = buildForest([
    event('change', 'decision', '2026-10-17T13:00:00.000Z'),
    event('root', null, '2026-10-17T10:00:00.000Z'),
    event('decision', 'root', '2026-10-17T12:00:00.000Z'),
    event('note', 'root', '2026-10-17T11:00:00.000Z'),
    { ...event('chat', 'root'), event_type: 'chat.message' }
  ]);
  assert.deepEqual(model.stats, { records: 4, roots: 1, branches: 3, maxDepth: 2 });
  assert.equal(model.forest[0].event.event_id, 'root');
  assert.deepEqual(model.forest[0].children.map(node => node.event.event_id), ['note', 'decision']);
  assert.equal(model.forest[0].children[1].children[0].event.event_id, 'change');
});

test('knowledge tree keeps missing parents and cycles safe as roots', () => {
  const model = buildForest([event('orphan', 'missing'), event('self', 'self'), event('a', 'b'), event('b', 'a')]);
  assert.equal(model.stats.records, 4);
  assert.equal(model.stats.roots, 4);
  assert.equal(model.stats.maxDepth, 0);
});

test('project tree preserves the real parent-child hierarchy and descendant counts', () => {
  const model = buildForest([event('root'), event('branch', 'root'), event('leaf', 'branch'), event('other')]);
  const tree = buildProjectTree(model.forest, 'Demo');
  assert.equal(tree.event.title, 'Demo');
  assert.equal(tree.descendants, 4);
  assert.deepEqual(tree.children.map(node => node.event.event_id).sort(), ['other', 'root']);
  const root = tree.children.find(node => node.event.event_id === 'root');
  assert.equal(root.descendants, 2);
  assert.equal(root.children[0].children[0].event.event_id, 'leaf');
});

test('mind map layout fans first-level branches to both sides and respects collapse', () => {
  const model = buildForest([event('root'), event('a', 'root'), event('b', 'root'), event('a1', 'a')]);
  const expanded = layoutMindMap(model.forest);
  assert.deepEqual(expanded.nodes.filter(node => node.depth === 1).map(node => Math.sign(node.x)), [1, -1]);
  assert.equal(expanded.edges.length, 3);
  const collapsed = layoutMindMap(model.forest, { collapsed: ['a'] });
  assert.equal(collapsed.nodes.some(node => node.id === 'a1'), false);
  assert.equal(collapsed.edges.length, 2);
});

test('mind map progressively reveals a focused branch from general to specific', () => {
  const model = buildForest([event('root'), event('area', 'root'), event('topic', 'area'), event('detail', 'topic'), event('other', 'root')]);
  const overview = layoutMindMap(model.forest, { maxDepth: 1 });
  assert.deepEqual(overview.nodes.map(node => node.id), ['root', 'area', 'other']);
  assert.equal(overview.nodes.find(node => node.id === 'area').hiddenCount, 2);
  const focused = layoutMindMap(model.forest, { focusId: 'area', maxDepth: 2 });
  assert.deepEqual(focused.focusPath.map(item => item.id), ['root', 'area']);
  assert.deepEqual(focused.nodes.map(node => node.id).sort(), ['area', 'detail', 'topic']);
});

test('mind map viewport prevents excessive zooming and empty-space panning', () => {
  const viewport = { halfWidth: 500, halfHeight: 300, contentHalfWidth: 640, contentHalfHeight: 360, minScale: .75, maxScale: 1.5, padding: 20 };
  assert.deepEqual(constrainMapView({ x: 900, y: -900, scale: .1 }, viewport), { x: 0, y: 0, scale: .75, maxX: 0, maxY: 0 });
  assert.deepEqual(constrainMapView({ x: 900, y: -900, scale: 1.5 }, viewport), { x: 480, y: -260, scale: 1.5, maxX: 480, maxY: 260 });
});
