'use strict';
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TeamBrainTree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function timestamp(event) {
    const value = Date.parse(event.created_at || '');
    return Number.isFinite(value) ? value : 0;
  }

  function buildForest(input) {
    const events = (Array.isArray(input) ? input : []).filter(event => event && event.event_id && !String(event.event_type || '').startsWith('chat.'));
    const byId = new Map(events.map(event => [event.event_id, event]));
    const children = new Map(events.map(event => [event.event_id, []]));
    const roots = [];

    function createsCycle(event) {
      const seen = new Set([event.event_id]);
      let parentId = event.causation_id;
      while (parentId && byId.has(parentId)) {
        if (seen.has(parentId)) return true;
        seen.add(parentId);
        parentId = byId.get(parentId).causation_id;
      }
      return false;
    }

    for (const event of events) {
      const parentId = event.causation_id;
      if (parentId && parentId !== event.event_id && byId.has(parentId) && !createsCycle(event)) children.get(parentId).push(event);
      else roots.push(event);
    }

    const order = (a, b) => timestamp(a) - timestamp(b) || String(a.title || '').localeCompare(String(b.title || ''), 'tr');
    roots.sort(order);
    for (const list of children.values()) list.sort(order);

    let maxDepth = 0;
    function node(event, depth) {
      maxDepth = Math.max(maxDepth, depth);
      return { event, depth, children: children.get(event.event_id).map(child => node(child, depth + 1)) };
    }
    const forest = roots.map(event => node(event, 0));
    return { forest, stats: { records: events.length, roots: roots.length, branches: Math.max(0, events.length - roots.length), maxDepth } };
  }

  function buildProjectTree(forest, projectName = 'Proje') {
    function decorate(node, depth) {
      const children = node.children.map(child => decorate(child, depth + 1));
      return { event: node.event, children, depth, descendants: children.reduce((sum, child) => sum + 1 + child.descendants, 0) };
    }
    return decorate({ event: { event_id: '__project__', title: projectName, event_type: 'project.root' }, children: Array.isArray(forest) ? forest : [] }, 0);
  }

  function layoutMindMap(forest, options = {}) {
    const collapsed = new Set(options.collapsed || []), xGap = options.xGap || 285, yGap = options.yGap || 92;
    const maxDepth = Number.isFinite(options.maxDepth) ? Math.max(1, options.maxDepth) : Infinity;
    if (!Array.isArray(forest) || !forest.length) return { nodes: [], edges: [], width: 1600, height: 900 };
    const baseRoot = forest.length === 1 ? forest[0] : { event: { event_id: '__project__', title: options.projectName || 'Proje', event_type: 'project.root' }, children: forest };
    function locate(node, id, path = []) {
      const nextPath = [...path, node];
      if (node.event.event_id === id) return { node, path: nextPath };
      for (const child of node.children) { const found = locate(child, id, nextPath); if (found) return found; }
      return null;
    }
    const focused = options.focusId ? locate(baseRoot, options.focusId) : null;
    const sourceRoot = focused?.node || baseRoot, focusPath = focused?.path || [baseRoot];
    const descendantMemo = new Map();
    function descendants(node) {
      if (!descendantMemo.has(node)) descendantMemo.set(node, node.children.reduce((sum, child) => sum + 1 + descendants(child), 0));
      return descendantMemo.get(node);
    }
    const visibleChildren = (node, depth) => collapsed.has(node.event.event_id) || depth >= maxDepth ? [] : node.children;
    const nodes = [{ node: sourceRoot, id: sourceRoot.event.event_id, x: 0, y: 0, depth: 0, side: 0, branch: -1, descendants: descendants(sourceRoot), hiddenCount: maxDepth === 0 ? descendants(sourceRoot) : 0 }], edges = [];
    const first = visibleChildren(sourceRoot, 0), right = [], left = [];
    first.forEach((child, index) => (index % 2 === 0 ? right : left).push({ child, branch: index }));

    function leaves(node, depth) {
      const children = visibleChildren(node, depth);
      return children.length ? children.reduce((sum, child) => sum + leaves(child, depth + 1), 0) : 1;
    }

    function placeSide(items, side) {
      const total = items.reduce((sum, item) => sum + leaves(item.child, 1), 0);
      let cursor = -((total - 1) * yGap) / 2;
      function place(node, depth, branch, parent) {
        const children = visibleChildren(node, depth);
        let y;
        if (!children.length) { y = cursor; cursor += yGap; }
        else {
          const positions = children.map(child => place(child, depth + 1, branch, node));
          y = positions.reduce((sum, position) => sum + position.y, 0) / positions.length;
        }
        const placed = { node, id: node.event.event_id, x: side * depth * xGap, y, depth, side, branch, descendants: descendants(node), hiddenCount: children.length ? 0 : descendants(node) };
        nodes.push(placed);
        edges.push({ from: parent.event.event_id, to: placed.id, side, branch });
        return placed;
      }
      for (const item of items) place(item.child, 1, item.branch, sourceRoot);
    }
    placeSide(right, 1);
    placeSide(left, -1);
    return { nodes, edges, width: 1600, height: 900, rootId: sourceRoot.event.event_id, focusId: focused ? sourceRoot.event.event_id : null, focusPath: focusPath.map(node => ({ id: node.event.event_id, title: node.event.title })) };
  }

  function constrainMapView(view = {}, viewport = {}) {
    const minScale = Number.isFinite(viewport.minScale) ? viewport.minScale : .35;
    const maxScale = Number.isFinite(viewport.maxScale) ? viewport.maxScale : 1.65;
    const scale = Math.max(minScale, Math.min(maxScale, Number(view.scale) || minScale));
    const padding = Math.max(0, Number(viewport.padding) || 0);
    const availableX = Math.max(0, (Number(viewport.halfWidth) || 0) - padding);
    const availableY = Math.max(0, (Number(viewport.halfHeight) || 0) - padding);
    const maxX = Math.max(0, (Number(viewport.contentHalfWidth) || 0) * scale - availableX);
    const maxY = Math.max(0, (Number(viewport.contentHalfHeight) || 0) * scale - availableY);
    const x = maxX ? Math.max(-maxX, Math.min(maxX, Number(view.x) || 0)) : 0;
    const y = maxY ? Math.max(-maxY, Math.min(maxY, Number(view.y) || 0)) : 0;
    return { x, y, scale, maxX, maxY };
  }

  return { buildForest, buildProjectTree, layoutMindMap, constrainMapView };
});
