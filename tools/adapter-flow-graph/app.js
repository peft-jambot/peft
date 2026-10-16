/* ============================================================================
 * PEFT flow graph viewer
 *
 * - deterministic column/swimlane layout (readable order, not a force sim)
 * - semantic zoom: internals appear as you zoom in (+ labels gated by zoom)
 * - "bridge" edges keep the flow connected when lower levels are hidden
 * - editable: drag nodes, draw your own edges, drop note nodes
 * - everything persists to localStorage and exports/imports as JSON
 * ==========================================================================*/
(function () {
  'use strict';

  var FLOW = window.PEFT_FLOW;
  var G = FLOW.geo;
  var LS_KEY = 'peft-flow-state-v1';

  var NODE_W = 240, NODE_H = 64;
  var NOTE_W = 310, NOTE_H = 124;
  var LANEHEAD_W = 340, LANEHEAD_H = 44;
  var BAND_PAD_X = 36, BAND_PAD_Y = 30;
  var GITHUB = 'https://github.com/huggingface/peft/blob/' + FLOW.meta.ref + '/';

  var state = {
    mode: 'select',
    lodSelect: 'auto',
    lodApplied: null,
    focus: null,
    search: '',
    selected: null,
    connectSrc: null,
    collapsed: {},
    adj: { out: new Map(), in: new Map(), direct: new Set() }
  };

  /* ------------------------------------------------------------ persistence */
  var P = load();
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('state load failed', e); }
    return normalize({});
  }
  function normalize(o) {
    return {
      pos: o.pos || {}, notes: o.notes || {},
      nodes: o.nodes || [], edges: o.edges || [],
      hidden: o.hidden || [], removed: o.removed || [], removedEdges: o.removedEdges || [],
      seq: o.seq || 0, view: o.view || null
    };
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(collectState())); }
      catch (e) { console.warn('state save failed', e); }
    }, 250);
  }
  function collectState() {
    var pos = {};
    cy.nodes().forEach(function (n) {
      if (n.data('kind') === 'band' || n.data('kind') === 'lanehead') return;
      pos[n.id()] = { x: n.position('x'), y: n.position('y') };
    });
    var userNodes = [], userEdges = [];
    cy.nodes().forEach(function (n) {
      if (n.data('custom') && !n.data('derived')) {
        userNodes.push({ id: n.id(), x: n.position('x'), y: n.position('y'), label: n.data('label') });
      }
    });
    cy.edges().forEach(function (e) {
      if (e.data('custom')) {
        userEdges.push({ id: e.id(), s: e.data('source'), t: e.data('target'), label: e.data('label') || '', kind: e.data('kind') });
      }
    });
    return {
      pos: pos, notes: P.notes, nodes: userNodes, edges: userEdges,
      hidden: P.hidden, removed: P.removed, removedEdges: P.removedEdges, seq: P.seq,
      view: { zoom: cy.zoom(), x: cy.pan().x, y: cy.pan().y }
    };
  }

  /* ---------------------------------------------------------------- layout */
  var laneMin = {}, laneTop = {};
  function computeLayout(nodes) {
    var y = 0;
    FLOW.lanes.forEach(function (lane) {
      var rows = nodes.filter(function (n) { return n.lane === lane.id; }).map(function (n) { return n.row; });
      var mn = rows.length ? Math.min.apply(null, rows) : 0;
      var mx = rows.length ? Math.max.apply(null, rows) : 0;
      laneMin[lane.id] = mn;
      laneTop[lane.id] = y;
      y += (mx - mn) * G.ROW_H + 2 * G.LANE_PAD + G.LANE_GAP;
    });
  }
  function posOf(n) {
    return {
      x: n.col * G.COL_W,
      y: (laneTop[n.lane] || 0) + G.LANE_PAD + ((n.row - (laneMin[n.lane] || 0)) * G.ROW_H)
    };
  }

  /* ------------------------------------------------------------- elements  */
  function dispOf(d) {
    return d.sub ? d.label + '\n' + d.sub : d.label;
  }

  function buildElements() {
    var nodes = FLOW.nodes.filter(function (n) { return P.removed.indexOf(n.id) === -1; });
    computeLayout(nodes);
    var els = [];

    nodes.forEach(function (n) {
      var position = P.pos[n.id] ? { x: P.pos[n.id].x, y: P.pos[n.id].y } : posOf(n);
      els.push({
        group: 'nodes',
        data: {
          id: n.id, kind: n.kind, lane: n.lane, col: n.col, tier: n.tier || 1,
          label: n.label, sub: n.sub || '', disp: dispOf(n),
          file: n.file || '', line: n.line || 0, sig: n.sig || '',
          does: n.does || [], watch: n.watch || [],
          note: P.notes[n.id] || ''
        },
        position: position
      });
    });

    FLOW.edges.forEach(function (e) {
      var eid = 'e::' + e.s + '::' + e.t;
      if (P.removed.indexOf(e.s) > -1 || P.removed.indexOf(e.t) > -1) return;
      if (P.removedEdges.indexOf(eid) > -1) return;
      els.push({
        group: 'edges',
        data: { id: eid, source: e.s, target: e.t, kind: e.kind || 'call', label: e.label || '' }
      });
    });

    P.nodes.forEach(function (u) {
      els.push({
        group: 'nodes',
        data: {
          id: u.id, kind: 'note', lane: '', tier: 1, custom: true,
          label: u.label || 'note', sub: '', disp: u.label || 'note', does: [],
          note: P.notes[u.id] || ''
        },
        position: { x: u.x, y: u.y }
      });
    });
    P.edges.forEach(function (u) {
      els.push({
        group: 'edges',
        data: { id: u.id, source: u.s, target: u.t, kind: u.kind || 'user', label: u.label || '', custom: true }
      });
    });
    return els;
  }

  /* --------------------------------------------------------------- styles  */
  var stylesheet = [
    { selector: 'node', style: {
      'width': NODE_W, 'height': NODE_H,
      'background-color': '#16202c', 'background-opacity': 1,
      'border-width': 1.4, 'border-color': '#4b5563', 'border-style': 'solid',
      'shape': 'round-rectangle', 'padding': 6,
      'label': 'data(disp)', 'color': '#c9d1d9', 'font-size': 11,
      'line-height': 1.32, 'text-wrap': 'wrap', 'text-max-width': NODE_W - 24,
      'text-valign': 'center', 'text-halign': 'center',
      'min-zoomed-font-size': 8.5,
      'z-index': 10,
      'transition-property': 'opacity, border-color, border-width',
      'transition-duration': '110ms'
    }},
    { selector: 'node[kind = "entry"]', style: {
      'background-color': '#1d4ed8', 'border-color': '#60a5fa',
      'color': '#eff6ff', 'font-weight': 'bold'
    }},
    { selector: 'node[kind = "tuner"]', style: {
      'background-color': '#2a2010', 'border-color': '#f59e0b', 'color': '#fde68a'
    }},
    { selector: 'node[kind = "layer"]', style: {
      'background-color': '#241a33', 'border-color': '#a855f7', 'color': '#ecd9ff'
    }},
    { selector: 'node[kind = "branch"]', style: {
      'background-color': '#3f2d10', 'border-color': '#fb923c', 'color': '#fed7aa',
      'border-style': 'dashed', 'border-width': 1.8
    }},
    { selector: 'node[kind = "guard"]', style: {
      'background-color': '#2a1416', 'border-color': '#f85149', 'color': '#ffc9c4'
    }},
    { selector: 'node[kind = "note"]', style: {
      'background-color': '#14251a', 'border-color': '#22c55e', 'color': '#bbf7d0',
      'border-style': 'dashed', 'border-width': 1.8,
      'width': NOTE_W, 'height': NOTE_H, 'shape': 'round-rectangle'
    }},
    { selector: 'node[kind = "mutate-base"]', style: {
      'background-color': '#2b1116', 'border-color': '#f43f5e', 'color': '#fecdd3',
      'border-style': 'double', 'border-width': 2.4, 'shape': 'cut-rectangle'
    }},
    { selector: 'node[kind = "mutate-adapter"]', style: {
      'background-color': '#0d2724', 'border-color': '#2dd4bf', 'color': '#ccfbf1',
      'border-style': 'double', 'border-width': 2.4, 'shape': 'cut-rectangle'
    }},
    /* halo marks, derived from the mutate edges: this call site changes state */
    { selector: 'node.mut-base', style: {
      'overlay-color': '#f43f5e', 'overlay-opacity': 0.26, 'overlay-padding': 5
    }},
    { selector: 'node.mut-adapter', style: {
      'overlay-color': '#2dd4bf', 'overlay-opacity': 0.26, 'overlay-padding': 5
    }},
    { selector: 'node.mut-both', style: {
      'overlay-color': '#c084fc', 'overlay-opacity': 0.3, 'overlay-padding': 5
    }},

    { selector: 'node[kind = "band"]', style: {
      'shape': 'round-rectangle', 'background-color': '#f59e0b', 'background-opacity': 0.045,
      'border-color': '#f59e0b', 'border-opacity': 0.38, 'border-width': 1.2, 'border-style': 'dashed',
      'label': 'data(label)', 'color': '#f59e0b', 'font-size': 13, 'font-weight': 'bold',
      'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -9,
      'text-max-width': 900, 'text-wrap': 'wrap', 'min-zoomed-font-size': 7,
      'events': 'no', 'z-index': 0, 'padding': 0
    }},

    /* edges */
    { selector: 'edge', style: {
      'width': 1.4, 'line-color': '#5b6572', 'target-arrow-color': '#5b6572',
      'target-arrow-shape': 'triangle', 'arrow-scale': 0.8,
      'curve-style': 'bezier', 'control-point-step-size': 44,
      'label': 'data(label)', 'font-size': 9, 'color': '#8b949e',
      'text-rotation': 'autorotate', 'text-background-color': '#0d1117',
      'text-background-opacity': 0.88, 'text-background-padding': '2px',
      'min-zoomed-font-size': 8.5,
      'transition-property': 'opacity, line-color', 'transition-duration': '110ms'
    }},
    { selector: 'edge[kind = "branch"]', style: {
      'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'width': 1.6, 'color': '#d29922'
    }},
    { selector: 'edge[kind = "cross"]', style: {
      'line-color': '#a855f7', 'target-arrow-color': '#a855f7', 'width': 1.9,
      'line-style': 'dashed', 'line-dash-pattern': [6, 4], 'color': '#c084fc'
    }},
    { selector: 'edge[kind = "note"]', style: {
      'line-color': '#22c55e', 'target-arrow-color': '#22c55e', 'width': 1.6,
      'line-style': 'dotted', 'target-arrow-shape': 'none', 'color': '#86efac'
    }},
    { selector: 'edge[kind = "user"]', style: {
      'line-color': '#22d3ee', 'target-arrow-color': '#22d3ee', 'width': 2.2,
      'line-style': 'dashed', 'line-dash-pattern': [7, 4], 'color': '#67e8f9'
    }},
    { selector: 'edge[kind = "mutate"]', style: {
      'line-color': '#2dd4bf', 'target-arrow-color': '#2dd4bf', 'width': 1.7,
      'line-style': 'dashed', 'line-dash-pattern': [3, 3],
      'target-arrow-shape': 'chevron', 'arrow-scale': 0.9, 'color': '#99f6e4'
    }},
    { selector: 'edge.mut-edge-base', style: {
      'line-color': '#f43f5e', 'target-arrow-color': '#f43f5e', 'color': '#fda4af'
    }},
    { selector: 'edge.bridge', style: {
      'line-color': '#39424e', 'target-arrow-color': '#39424e', 'width': 1.2,
      'line-style': 'dotted', 'target-arrow-shape': 'vee', 'arrow-scale': 0.6,
      'label': ''
    }},

    /* view state */
    { selector: '.lod-hidden', style: { 'display': 'none' } },
    { selector: '.manually-hidden', style: { 'display': 'none' } },
    { selector: 'node.dimmed, edge.dimmed', style: { 'opacity': 0.09 } },
    { selector: 'node.hit', style: { 'border-color': '#22d3ee', 'border-width': 3, 'border-style': 'solid' } },
    { selector: 'node:selected', style: { 'border-color': '#ffffff', 'border-width': 2.6 } },
    { selector: 'edge:selected', style: { 'line-color': '#ffffff', 'target-arrow-color': '#ffffff', 'width': 3 } },
    { selector: 'node.connect-src', style: { 'border-color': '#22d3ee', 'border-width': 3.4 } },
    { selector: 'node.focus-root', style: { 'border-color': '#f0abfc', 'border-width': 3.4 } }
  ];

  /* ---------------------------------------------------------------- cy init */
  var cy = cytoscape({
    container: document.getElementById('cy'),
    elements: buildElements(),
    style: stylesheet,
    wheelSensitivity: 0.22,
    boxSelectionEnabled: true,
    selectionType: 'additive',
    minZoom: 0.06,
    maxZoom: 4,
    layout: { name: 'preset' },
    pixelRatio: 'auto'
  });

  P.hidden.forEach(function (id) {
    var el = cy.getElementById(id);
    if (el && el.length) el.addClass('manually-hidden');
  });

  /* ------------------------------------------------------------ adjacency  */
  function rebuildAdj() {
    var out = new Map(), inn = new Map(), direct = new Set();
    cy.edges().forEach(function (e) {
      var s = e.data('source'), t = e.data('target');
      if (e.data('derived')) return;
      direct.add(s + '|' + t);
      if (!out.has(s)) out.set(s, []);
      out.get(s).push(t);
      if (!inn.has(t)) inn.set(t, []);
      inn.get(t).push(s);
    });
    state.adj = { out: out, in: inn, direct: direct };
  }
  function neighbors(id) {
    var set = new Set([id]);
    (state.adj.out.get(id) || []).forEach(function (t) { set.add(t); });
    (state.adj.in.get(id) || []).forEach(function (s) { set.add(s); });
    return set;
  }

  /* Mutation marks are DERIVED from the mutate edges, so the halo on a call site
     and the colour of the edge can never disagree with the data. */
  function applyMutationMarks() {
    var marks = {};
    cy.batch(function () {
      cy.nodes().forEach(function (n) { n.removeClass('mut-base mut-adapter mut-both'); });
      cy.edges('[kind = "mutate"]').forEach(function (e) {
        var tk = e.target().data('kind');
        var isBase = (tk === 'mutate-base');
        e.toggleClass('mut-edge-base', isBase);
        var sid = e.source().id();
        if (!marks[sid]) marks[sid] = { b: false, a: false };
        if (isBase) marks[sid].b = true; else marks[sid].a = true;
      });
      Object.keys(marks).forEach(function (id) {
        var el = cy.getElementById(id), m = marks[id];
        if (!el.length) return;
        el.addClass(m.b && m.a ? 'mut-both' : (m.b ? 'mut-base' : 'mut-adapter'));
      });
    });
  }

  /* ------------------------------------------------------------------ LOD  */
  function lodLevel() {
    if (state.lodSelect === 'all') return 4;
    if (state.lodSelect === '3') return 3;
    if (state.lodSelect === '2') return 2;
    var z = cy.zoom();
    if (z >= 1.0) return 4;
    if (z >= 0.55) return 3;
    return 2;
  }
  var LOD_NAMES = { 1: 'landmarks', 2: 'calls (lvl ≤ 2)', 3: 'internals (lvl ≤ 3)', 4: 'everything' };

  function applyLod() {
    var lvl = lodLevel();
    document.getElementById('lodBadge').textContent = 'detail: ' + LOD_NAMES[lvl];
    var sig = lvl + '|' + Object.keys(state.collapsed).filter(function (k) { return state.collapsed[k]; }).sort().join(',');
    if (state.lodApplied === sig) return;
    var showMore = state.lodApplied !== null && lvl > parseInt(state.lodApplied, 10);
    state.lodApplied = sig;
    cy.batch(function () {
      cy.nodes().forEach(function (n) {
        var kind = n.data('kind');
        if (kind === 'lanehead') return;
        var off = !!state.collapsed[n.data('lane')];
        var t = n.data('tier') || 1;
        if (off || (kind !== 'band' && t > lvl)) n.addClass('lod-hidden');
        else n.removeClass('lod-hidden');
      });
    });
    rebuildAdj();
    updateBridges();
    updateBands();
    if (showMore) showHint('zoom ' + Math.round(cy.zoom() * 100) + '% → deeper level revealed');
  }

  /* fit whatever is currently visible, so collapsing a lane gives a readable view */
  function fitVisible(pad, animate) {
    var vis = cy.nodes().filter(function (n) { return n.visible(); });
    if (!vis.length) return;
    if (animate) cy.animate({ fit: { eles: vis, padding: pad || 70 } }, { duration: 220 });
    else cy.fit(vis, pad || 70);
  }

  function toggleLane(laneId) {
    state.collapsed[laneId] = !state.collapsed[laneId];
    state.lodApplied = null;
    applyLod();
    applyHighlight();
    positionLaneTitles();
    fitVisible(80, true);
    showHint((state.collapsed[laneId] ? 'collapsed' : 'expanded') + ' lane: ' + laneId + ' — click the lane title to toggle');
  }

  /* lane titles live in HTML, not on the canvas: they stay readable at every zoom */
  var laneTitleEls = {};
  function buildLaneTitles() {
    var host = document.getElementById('laneTitles');
    host.innerHTML = '';
    laneTitleEls = {};
    FLOW.lanes.forEach(function (lane) {
      var b = document.createElement('button');
      b.className = 'laneTitle';
      b.style.borderLeftColor = lane.color;
      b.innerHTML = '<span class="chev">▾</span>' + lane.label;
      b.title = 'click to collapse / expand this lane';
      b.addEventListener('click', function () { toggleLane(lane.id); });
      host.appendChild(b);
      laneTitleEls[lane.id] = b;
    });
  }
  function positionLaneTitles() {
    var z = cy.zoom(), p = cy.pan();
    FLOW.lanes.forEach(function (lane) {
      var el = laneTitleEls[lane.id];
      if (!el) return;
      var mx = -200, my = (laneTop[lane.id] || 0) + 14;
      el.style.transform = 'translate(' + Math.round(mx * z + p.x) + 'px,' + Math.round(my * z + p.y) + 'px)';
      el.classList.toggle('collapsed', !!state.collapsed[lane.id]);
      el.querySelector('.chev').textContent = state.collapsed[lane.id] ? '▸' : '▾';
    });
  }

  function updateBridges() {
    cy.edges('.bridge').remove();
    var hidden = new Set();
    cy.nodes().forEach(function (n) {
      if (n.hasClass('lod-hidden') || n.hasClass('manually-hidden')) hidden.add(n.id());
    });
    if (!hidden.size) { rebuildAdj(); return; }

    var els = [], seen = new Set();
    function addBridge(a, b) {
      if (!a || !b || a === b) return;
      var k = a + '|' + b, kr = b + '|' + a;
      if (seen.has(k) || seen.has(kr)) return;
      if (state.adj.direct.has(k) || state.adj.direct.has(kr)) return;
      seen.add(k);
      els.push({ group: 'edges', classes: 'bridge', data: {
        id: 'bridge::' + k, source: a, target: b, kind: 'bridge', derived: true, label: ''
      }});
    }
    /* visible frontier reachable from `vid` by walking only through hidden nodes */
    function frontier(vid, dirMap) {
      var queue = [], visited = new Set(), front = new Set();
      (dirMap.get(vid) || []).forEach(function (t) {
        if (hidden.has(t) && !visited.has(t)) { visited.add(t); queue.push(t); }
      });
      var guard = 0;
      while (queue.length && guard++ < 5000) {
        var cur = queue.shift();
        (dirMap.get(cur) || []).forEach(function (t) {
          if (hidden.has(t)) { if (!visited.has(t)) { visited.add(t); queue.push(t); } }
          else if (t !== vid) front.add(t);
        });
      }
      return front;
    }
    /* bridge in BOTH directions, so a node whose callers are hidden is still
       visibly caused by something at the current level of detail */
    cy.nodes().forEach(function (v) {
      var vid = v.id();
      if (hidden.has(vid)) return;
      frontier(vid, state.adj.out).forEach(function (t) { addBridge(vid, t); });
      frontier(vid, state.adj.in).forEach(function (a) { addBridge(a, vid); });
    });
    if (els.length) cy.batch(function () { cy.add(els); });
    rebuildAdj();
  }

  /* ---------------------------------------------------------------- bands  */
  function sizeOf(n) {
    var w = parseFloat(n.style('width')), h = parseFloat(n.style('height'));
    if (!isFinite(w) || w <= 0) w = NODE_W;
    if (!isFinite(h) || h <= 0) h = NODE_H;
    return { w: w, h: h };
  }
  function updateBands() {
    cy.nodes('[kind = "band"]').forEach(function (b) {
      var members = cy.nodes().filter(function (n) {
        return n.data('kind') !== 'band' && n.data('kind') !== 'lanehead' &&
               n.data('lane') === b.data('lane') && n.data('col') === b.data('col');
      });
      if (!members.length) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      members.forEach(function (m) {
        var p = m.position(), s = sizeOf(m);
        minX = Math.min(minX, p.x - s.w / 2); maxX = Math.max(maxX, p.x + s.w / 2);
        minY = Math.min(minY, p.y - s.h / 2); maxY = Math.max(maxY, p.y + s.h / 2);
      });
      b.position({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 6 });
      b.style({
        width: (maxX - minX) + 2 * BAND_PAD_X,
        height: (maxY - minY) + 2 * BAND_PAD_Y + 14
      });
    });
  }

  /* ------------------------------------------------------------ highlight  */
  function nodesMatching(q) {
    var hits = new Set();
    cy.nodes().forEach(function (n) {
      if (n.data('kind') === 'band' || n.data('kind') === 'lanehead') return;
      var hay = [
        n.id(), n.data('label') || '', n.data('sub') || '', n.data('file') || '',
        n.data('sig') || '', (n.data('does') || []).join(' '), (n.data('watch') || []).join(' ')
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) > -1) hits.add(n.id());
    });
    return hits;
  }
  function applyHighlight() {
    var q = (state.search || '').trim().toLowerCase();
    var focusSet = state.focus ? neighbors(state.focus) : null;
    var hitSet = q ? nodesMatching(q) : null;
    cy.batch(function () {
      cy.nodes().forEach(function (n) {
        var id = n.id(), dim = false, hit = false;
        if (focusSet && !focusSet.has(id)) dim = true;
        if (hitSet) { if (hitSet.has(id)) hit = true; else dim = true; }
        n.toggleClass('dimmed', dim);
        n.toggleClass('hit', hit);
        n.toggleClass('focus-root', !!state.focus && id === state.focus);
      });
      cy.edges().forEach(function (e) {
        var s = e.source().id(), t = e.target().id(), dim = false;
        if (focusSet && !(focusSet.has(s) && focusSet.has(t))) dim = true;
        if (hitSet && !(hitSet.has(s) && hitSet.has(t))) dim = true;
        e.toggleClass('dimmed', dim);
      });
    });
    var cnt = document.getElementById('searchCount');
    cnt.textContent = q && hitSet ? hitSet.size + ' hits' : '';
  }

  /* ----------------------------------------------------------------- panel */
  var panelBody = document.getElementById('panelBody');
  var panelEmpty = document.querySelector('.panel-empty');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ghLink(d) {
    if (!d.file) return '';
    return GITHUB + d.file + (d.line ? '#L' + d.line : '');
  }
  function connButton(id, dir) {
    var n = cy.getElementById(id);
    if (!n.length) return '';
    return '<button class="conn" data-goto="' + esc(id) + '">' +
      (dir === 'in' ? '↘ from ' : '↗ to ') + esc(n.data('label')) +
      ' <small>' + esc(n.data('sub') || n.data('kind')) + '</small></button>';
  }
  /* mutation edges carry the operation in their label, so show that instead */
  function mutButton(e, dir) {
    var other = dir === 'in' ? e.source() : e.target();
    var op = e.data('label') || '';
    return '<button class="conn" data-goto="' + esc(other.id()) + '">' +
      (dir === 'in' ? esc(other.data('label')) + ' <code>' + esc(op) + '</code> →'
                    : '<code>' + esc(op) + '</code> → ' + esc(other.data('label'))) +
      '</button>';
  }

  function showPanel() {
    var sel = state.selected;
    if (!sel) {
      panelBody.hidden = true; panelEmpty.hidden = false;
      return;
    }
    panelEmpty.hidden = true; panelBody.hidden = false;

    if (sel.type === 'node') {
      var n = cy.getElementById(sel.id);
      if (!n || !n.length) { state.selected = null; return showPanel(); }
      var d = n.data();
      var outs = n.outgoers('edge').filter(function (e) {
        var k = e.data('kind'); return k !== 'bridge' && k !== 'mutate';
      });
      var ins = n.incomers('edge').filter(function (e) {
        var k = e.data('kind'); return k !== 'bridge' && k !== 'mutate';
      });
      var mutOut = n.outgoers('edge').filter(function (e) { return e.data('kind') === 'mutate'; });
      var mutIn = n.incomers('edge').filter(function (e) { return e.data('kind') === 'mutate'; });
      var brOut = n.outgoers('edge').filter(function (e) { return e.data('kind') === 'bridge'; });
      var brIn = n.incomers('edge').filter(function (e) { return e.data('kind') === 'bridge'; });

      var h = '';
      if (d.custom) {
        h += '<div class="section"><h4>Your note title</h4><input type="text" id="noteTitle" value="' + esc(d.label) + '"></div>';
      } else {
        h += '<h2>' + esc(d.label) + '</h2>';
      }
      h += '<div class="badges">' +
        '<span class="badge kind-' + esc(d.kind) + '">' + esc(d.kind) + '</span>' +
        '<span class="badge">level ' + (d.tier || 1) + '</span>' +
        (d.lane ? '<span class="badge">lane: ' + esc(d.lane) + '</span>' : '') +
        (d.custom ? '<span class="badge">yours</span>' : '') +
        '</div>';

      if (d.file) {
        h += '<div class="section"><h4>Source</h4><div class="loc">' + esc(d.file) +
          (d.line ? ':' + d.line : '') + '</div>' +
          (d.line ? '<div class="loc"><a href="' + ghLink(d) + '" target="_blank" rel="noopener">open on GitHub ↗</a></div>' : '') +
          '</div>';
      }
      if (d.sig) h += '<div class="section"><h4>Signature</h4><pre class="sig">' + esc(d.sig) + '</pre></div>';
      if (d.does && d.does.length) {
        h += '<div class="section"><h4>What it does</h4><ul>' +
          d.does.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }
      if (d.watch && d.watch.length) {
        h += '<div class="section watch"><h4>Watch out</h4><ul>' +
          d.watch.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }

      h += '<div class="section"><h4>Calls (' + outs.length + ')</h4><div class="connlist">' +
        (outs.length ? outs.map(function (e) { return connButton(e.target().id(), 'out'); }).join('') : '<span class="muted">none</span>') +
        '</div></div>';
      h += '<div class="section"><h4>Called by (' + ins.length + ')</h4><div class="connlist">' +
        (ins.length ? ins.map(function (e) { return connButton(e.source().id(), 'in'); }).join('') : '<span class="muted">none</span>') +
        '</div></div>';
      if (mutOut.length) {
        h += '<div class="section mutsec"><h4>Mutates model state (' + mutOut.length + ')</h4><div class="connlist">' +
          mutOut.map(function (e) { return mutButton(e, 'out'); }).join('') +
          '</div><div class="muted" style="font-size:11px">red = base weights / modules · teal = per-adapter entries</div></div>';
      }
      if (mutIn.length) {
        h += '<div class="section mutsec"><h4>State written here, by (' + mutIn.length + ')</h4><div class="connlist">' +
          mutIn.map(function (e) { return mutButton(e, 'in'); }).join('') + '</div></div>';
      }
      if (brOut.length || brIn.length) {
        h += '<div class="section"><h4>Via hidden steps</h4><div class="connlist">' +
          brOut.map(function (e) { return connButton(e.target().id(), 'out'); }).join('') +
          brIn.map(function (e) { return connButton(e.source().id(), 'in'); }).join('') +
          '</div><div class="muted" style="font-size:11px">Zoom in to see the intermediate calls.</div></div>';
      }

      h += '<div class="section"><h4>Your note</h4><textarea id="noteText" placeholder="notes, TODOs, links…">' +
        esc(P.notes[d.id] || '') + '</textarea><div class="saved" id="savedMsg"></div></div>';

      h += '<div class="rowbtns">' +
        '<button id="btnFocus">Focus neighborhood</button>' +
        '<button id="btnCopyLoc">Copy location</button>' +
        '<button id="btnHide">' + (n.hasClass('manually-hidden') ? 'Unhide' : 'Hide') + '</button>' +
        (d.custom ? '<button id="btnDelEl" class="danger">Delete</button>' : '') +
        '</div>';

      panelBody.innerHTML = h;

      var ni = document.getElementById('noteTitle');
      if (ni) ni.addEventListener('input', function () {
        n.data('label', this.value);
        n.data('disp', this.value);
        var u = P.nodes.filter(function (x) { return x.id === d.id; })[0];
        if (u) { u.label = this.value; save(); }
      });
      var ta = document.getElementById('noteText');
      ta.addEventListener('input', function () {
        P.notes[d.id] = this.value;
        var m = document.getElementById('savedMsg');
        m.textContent = 'saved';
        clearTimeout(ta._t); ta._t = setTimeout(function () { m.textContent = ''; }, 900);
        save();
      });
      document.getElementById('btnFocus').addEventListener('click', function () { setFocus(d.id); });
      document.getElementById('btnCopyLoc').addEventListener('click', function () {
        var txt = (d.file || '') + (d.line ? ':' + d.line : '');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(
            function () { showHint('copied: ' + txt); },
            function () { showHint('clipboard blocked by the embedding page — ' + txt); }
          );
        } else {
          showHint(txt);
        }
      });
      document.getElementById('btnHide').addEventListener('click', function () {
        n.toggleClass('manually-hidden');
        if (n.hasClass('manually-hidden')) { if (P.hidden.indexOf(d.id) < 0) P.hidden.push(d.id); }
        else P.hidden = P.hidden.filter(function (x) { return x !== d.id; });
        save(); updateBridges(); updateBands(); showPanel(); refreshUnhide();
      });
      var bd = document.getElementById('btnDelEl');
      if (bd) bd.addEventListener('click', function () { deleteElement(d.id); });
      panelBody.querySelectorAll('[data-goto]').forEach(function (b) {
        b.addEventListener('click', function () { gotoNode(b.getAttribute('data-goto')); });
      });
      return;
    }

    /* edge */
    var e = cy.getElementById(sel.id);
    if (!e || !e.length) { state.selected = null; return showPanel(); }
    var ed = e.data();
    var srcN = cy.getElementById(ed.source).data(), tgtN = cy.getElementById(ed.target).data();
    var hh = '<h2>' + esc(srcN.label) + ' <span style="color:#8b949e">→</span> ' + esc(tgtN.label) + '</h2>' +
      '<div class="badges"><span class="badge">edge</span><span class="badge">' + esc(ed.kind) + '</span>' +
      (ed.derived ? '<span class="badge">derived (bridged)</span>' : '') +
      (ed.custom ? '<span class="badge">yours</span>' : '') + '</div>';
    if (ed.label) hh += '<div class="section"><h4>Label</h4><div>' + esc(ed.label) + '</div></div>';
    if (ed.custom) {
      hh += '<div class="section"><h4>Your edge label</h4><input type="text" id="edgeLabel" value="' + esc(ed.label || '') + '"></div>';
    }
    hh += '<div class="section"><h4>Endpoints</h4><div class="connlist">' +
      connButton(ed.source, 'in') + connButton(ed.target, 'out') + '</div></div>';
    hh += '<div class="rowbtns">' + (ed.custom ? '<button id="btnDelEl" class="danger">Delete edge</button>' : '<span class="muted">baseline edge (cannot be deleted)</span>') + '</div>';
    panelBody.innerHTML = hh;
    var el = document.getElementById('edgeLabel');
    if (el) el.addEventListener('input', function () {
      e.data('label', this.value);
      if (e.data('custom')) {
        var u = P.edges.filter(function (x) { return x.id === e.id(); })[0];
        if (u) u.label = this.value;
        save();
      }
    });
    var bd2 = document.getElementById('btnDelEl');
    if (bd2) bd2.addEventListener('click', function () { deleteElement(ed.id); });
    panelBody.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { gotoNode(b.getAttribute('data-goto')); });
    });
  }

  function gotoNode(id) {
    var n = cy.getElementById(id);
    if (!n.length) return;
    if (n.hasClass('lod-hidden')) { n.removeClass('lod-hidden'); state.lodApplied = null; rebuildAdj(); updateBridges(); }
    cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 300 });
    cy.elements().unselect(); n.select();
    state.selected = { type: 'node', id: id };
    showPanel();
  }

  function setFocus(id) {
    state.focus = (state.focus === id) ? null : id;
    applyHighlight();
    if (state.focus) {
      var n = cy.getElementById(id);
      if (n.length) cy.animate({ center: { eles: n } }, { duration: 260 });
      showHint('focused on ' + n.data('label') + ' — Esc to exit');
    } else showHint('');
  }

  function deleteElement(id) {
    var el = cy.getElementById(id);
    if (!el.length) return;
    var d = el.data();
    if (el.isNode() && d.custom) {
      P.nodes = P.nodes.filter(function (x) { return x.id !== id; });
      el.remove();
    } else if (el.isEdge() && d.custom) {
      P.edges = P.edges.filter(function (x) { return x.id !== id; });
      el.remove();
    } else if (el.isNode()) {
      el.addClass('manually-hidden');
      if (P.hidden.indexOf(id) < 0) P.hidden.push(id);
    } else {
      if (P.removedEdges.indexOf(id) < 0) P.removedEdges.push(id);
      el.remove();
    }
    state.selected = null;
    rebuildAdj(); updateBridges(); updateBands();
    refreshUnhide(); save(); showPanel();
  }

  function refreshUnhide() {
    var b = document.getElementById('btnUnhide');
    b.hidden = P.hidden.length === 0;
    b.textContent = 'Restore hidden (' + P.hidden.length + ')';
  }

  /* --------------------------------------------------------------- editing */
  function createUserEdge(a, b) {
    if (!a || !b || a === b) return;
    if (cy.getElementById(a).empty() || cy.getElementById(b).empty()) return;
    var exists = cy.edges().filter(function (e) {
      return e.data('source') === a && e.data('target') === b;
    }).length;
    if (exists) { showHint('edge already exists'); return; }
    var id = 'u_e_' + (++P.seq);
    P.edges.push({ id: id, s: a, t: b, label: '', kind: 'user' });
    cy.add({ group: 'edges', data: { id: id, source: a, target: b, kind: 'user', label: '', custom: true } });
    rebuildAdj(); updateBridges(); save();
    showHint('edge added — click it to label it');
  }

  function createNote(x, y) {
    var id = 'u_n_' + (++P.seq);
    P.nodes.push({ id: id, x: x, y: y, label: 'new note' });
    var el = cy.add({ group: 'nodes', data: {
      id: id, kind: 'note', lane: '', tier: 1, custom: true,
      label: 'new note', sub: '', disp: 'new note', does: []
    }, position: { x: x, y: y } });
    cy.elements().unselect(); el.select();
    state.selected = { type: 'node', id: id };
    showPanel();
    var ni = document.getElementById('noteTitle');
    if (ni) { ni.focus(); ni.select(); }
    save();
  }

  /* ------------------------------------------------------------------ hint */
  var hintTimer = null;
  function showHint(msg, sticky) {
    var h = document.getElementById('hint');
    if (!msg) { h.className = 'hint'; h.textContent = ''; return; }
    h.textContent = msg;
    h.className = 'hint show' + (sticky ? ' on' : '');
    clearTimeout(hintTimer);
    if (!sticky) hintTimer = setTimeout(function () { h.className = 'hint'; }, 2600);
  }
  function modeHint() {
    if (state.mode === 'connect') showHint('Connect: drag node → node (or click node, then click target)', true);
    else if (state.mode === 'note') showHint('Note: click anywhere on the canvas to drop a note', true);
    else showHint('');
  }

  /* ----------------------------------------------------------------- tools */
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('.mode').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === m);
    });
    clearConnect();
    cy.container().style.cursor = m === 'select' ? 'default' : 'crosshair';
    modeHint();
  }

  function clearConnect() {
    if (state.connectSrc) {
      var el = cy.getElementById(state.connectSrc);
      if (el.length) el.removeClass('connect-src');
    }
    state.connectSrc = null;
    drawGhost(null);
  }
  function drawGhost(to) {
    var svg = document.getElementById('overlay');
    if (!to || !state.connectSrc) { svg.innerHTML = ''; return; }
    var n = cy.getElementById(state.connectSrc);
    if (!n.length) { svg.innerHTML = ''; return; }
    var p = n.renderedPosition();
    svg.innerHTML = '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + to.x + '" y2="' + to.y +
      '" stroke="#22d3ee" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#ar)"/>' +
      '<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">' +
      '<path d="M0,0 L7,3 L0,6 z" fill="#22d3ee"/></marker></defs>';
  }

  function relayout() {
    var nodes = FLOW.nodes.filter(function (n) { return P.removed.indexOf(n.id) === -1; });
    computeLayout(nodes);
    cy.batch(function () {
      nodes.forEach(function (n) {
        var el = cy.getElementById(n.id);
        if (el.length) el.position(posOf(n));
      });
    });
    P.pos = {};
    updateBands();
    cy.fit(undefined, 70);
    save();
    showHint('layout reset to the computed order');
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function snapshot() {
    var nodes = [], edges = [];
    cy.nodes().forEach(function (n) {
      if (n.data('kind') === 'lanehead') return;
      var d = n.data();
      var o = {
        id: n.id(), label: d.label, sub: d.sub || '', kind: d.kind, lane: d.lane || '',
        tier: d.tier || 1, col: (typeof d.col === 'number' ? d.col : 0),
        x: Math.round(n.position('x')), y: Math.round(n.position('y')),
        hidden: n.hasClass('manually-hidden') || undefined
      };
      if (d.file) { o.file = d.file; o.line = d.line; }
      if (d.sig) o.sig = d.sig;
      if (d.does && d.does.length) o.does = d.does;
      if (d.watch && d.watch.length) o.watch = d.watch;
      if (d.custom) o.custom = true;
      if (P.notes[n.id()]) o.note = P.notes[n.id()];
      nodes.push(o);
    });
    cy.edges().forEach(function (e) {
      if (e.data('derived')) return;
      edges.push({
        id: e.id(), source: e.data('source'), target: e.data('target'),
        kind: e.data('kind'), label: e.data('label') || '',
        custom: e.data('custom') || undefined
      });
    });
    return {
      app: 'peft-flow-graph', version: 1,
      exported: new Date().toISOString(),
      meta: FLOW.meta,
      geo: G,
      lanes: FLOW.lanes,
      view: { zoom: cy.zoom(), pan: cy.pan() },
      nodes: nodes, edges: edges
    };
  }

  function importSnapshot(snap) {
    if (!snap || !snap.nodes) throw new Error('not a flow-graph export');
    P = normalize({});
    cy.elements().remove();
    var els = [];
    snap.nodes.forEach(function (n) {
      var disp = n.sub ? n.label + '\n' + n.sub : n.label;
      els.push({ group: 'nodes', data: {
        id: n.id, kind: n.kind, lane: n.lane || '', col: n.col || 0, tier: n.tier || 1,
        label: n.label, sub: n.sub || '', disp: disp, file: n.file || '', line: n.line || 0,
        sig: n.sig || '', does: n.does || [], watch: n.watch || [],
        custom: n.custom || false, note: n.note || ''
      }, position: { x: n.x, y: n.y }, classes: n.hidden ? 'manually-hidden' : '' });
      if (n.note) P.notes[n.id] = n.note;
      if (n.custom) P.nodes.push({ id: n.id, x: n.x, y: n.y, label: n.label });
    });
    snap.edges.forEach(function (e) {
      els.push({ group: 'edges', data: {
        id: e.id, source: e.source, target: e.target, kind: e.kind || 'call',
        label: e.label || '', custom: e.custom || false
      }});
      if (e.custom) P.edges.push({ id: e.id, s: e.source, t: e.target, label: e.label, kind: e.kind });
    });
    cy.add(els);
    state.lodApplied = null; state.focus = null; state.search = '';
    document.getElementById('search').value = '';
    rebuildAdj(); applyLod(); updateBands(); applyMutationMarks(); applyHighlight();
    cy.fit(undefined, 70);
    save();
    showHint('imported ' + snap.nodes.length + ' nodes / ' + snap.edges.length + ' edges');
  }

  /* -------------------------------------------------------------- handlers */
  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  document.getElementById('btnFit').addEventListener('click', function () { fitVisible(70, true); });
  document.getElementById('btnRelayout').addEventListener('click', relayout);
  document.getElementById('btnExport').addEventListener('click', function () {
    download('peft-adapter-flow.json', JSON.stringify(snapshot(), null, 2));
    showHint('exported JSON');
  });
  document.getElementById('btnPng').addEventListener('click', function () {
    // always export the complete graph: a poster should not inherit the current LOD
    var prev = state.lodSelect;
    state.lodSelect = 'all';
    state.lodApplied = null;
    applyLod();
    var uri = cy.png({ full: true, scale: 2, bg: '#0d1117' });
    state.lodSelect = prev;
    state.lodApplied = null;
    applyLod();
    applyHighlight();
    var a = document.createElement('a');
    a.href = uri; a.download = 'peft-adapter-flow.png';
    document.body.appendChild(a); a.click(); a.remove();
    showHint('exported PNG (whole graph, all levels)');
  });
  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm('Remove your nodes, edges, notes and positions, and restore the baseline graph?')) return;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    location.reload();
  });
  document.getElementById('btnImport').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { importSnapshot(JSON.parse(r.result)); }
      catch (err) { alert('Import failed: ' + err.message); }
    };
    r.readAsText(f);
    ev.target.value = '';
  });
  document.getElementById('lodSelect').addEventListener('change', function () {
    state.lodSelect = this.value; state.lodApplied = null; applyLod(); applyHighlight();
  });
  document.getElementById('btnUnhide').addEventListener('click', function () {
    cy.nodes().removeClass('manually-hidden');
    P.hidden = [];
    refreshUnhide(); updateBridges(); updateBands(); save();
    showHint('all hidden elements restored');
  });
  document.getElementById('search').addEventListener('input', function () {
    state.search = this.value; applyHighlight();
  });
  document.getElementById('search').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      var q = this.value.trim().toLowerCase();
      if (!q) return;
      var hits = cy.nodes().filter(function (n) {
        return !n.hasClass('dimmed') && n.data('kind') !== 'band' && n.data('kind') !== 'lanehead';
      });
      if (hits.length) cy.animate({ fit: { eles: hits, padding: 90 } }, { duration: 300 });
    }
    ev.stopPropagation();
  });
  document.getElementById('legendToggle').addEventListener('click', function () {
    var l = document.getElementById('legend');
    l.classList.toggle('collapsed');
    this.textContent = l.classList.contains('collapsed') ? '+' : '–';
  });
  /* on narrow viewports start with the legend collapsed so it does not sit on the graph */
  if (window.innerWidth < 1250) {
    document.getElementById('legend').classList.add('collapsed');
    document.getElementById('legendToggle').textContent = '+';
  }
  document.getElementById('helpToggle').addEventListener('click', function () {
    document.getElementById('help').classList.add('hidden');
    try { localStorage.setItem(LS_KEY + ':helpseen', '1'); } catch (e) {}
  });
  document.getElementById('btnHelp').addEventListener('click', function () {
    document.getElementById('help').classList.toggle('hidden');
  });

  window.addEventListener('resize', function () { cy.resize(); updateBands(); });
  window.addEventListener('keydown', function (ev) {
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') { if (ev.key === 'Escape') ev.target.blur(); return; }
    if (ev.key === 'Escape') { setFocus(null); clearConnect(); setMode('select'); return; }
    if (ev.key === 'v' || ev.key === 'V') return setMode('select');
    if (ev.key === 'c' || ev.key === 'C') return setMode('connect');
    if (ev.key === 'n' || ev.key === 'N') return setMode('note');
    if (ev.key === 'f' || ev.key === 'F') return fitVisible(70, true);
    if (ev.key === 'l' || ev.key === 'L') return relayout();
    if (ev.key === '/') { ev.preventDefault(); document.getElementById('search').focus(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      var sel = cy.$(':selected');
      if (sel.length) {
        sel.forEach(function (el) { deleteElement(el.id()); });
        ev.preventDefault();
      }
    }
  });

  /* --------------------------------------------------- cytoscape bindings  */
  cy.on('tap', 'node', function (evt) {
    var n = evt.target;
    if (state.mode === 'connect') return;
    if (n.data('kind') === 'band') return;
    state.selected = { type: 'node', id: n.id() };
    showPanel();
  });
  cy.on('tap', 'edge', function (evt) {
    state.selected = { type: 'edge', id: evt.target.id() };
    showPanel();
  });
  cy.on('tap', function (evt) {
    if (evt.target !== cy) return;
    if (state.mode === 'note') {
      var p = evt.position;
      createNote(p.x, p.y);
      return;
    }
    state.selected = null;
    setFocus(null);
    showPanel();
  });
  cy.on('dbltap', 'node', function (evt) {
    var d = evt.target.data();
    if (d.custom) {
      var v = window.prompt('Note title', d.label || '');
      if (v !== null) {
        evt.target.data('label', v); evt.target.data('disp', v);
        var u = P.nodes.filter(function (x) { return x.id === evt.target.id(); })[0];
        if (u) u.label = v;
        showPanel(); save();
      }
      return;
    }
    setFocus(evt.target.id());
  });
  cy.on('dbltap', function (evt) { if (evt.target === cy) setFocus(null); });

  cy.on('dragfree', 'node', function (evt) {
    if (evt.target.data('kind') === 'band' || evt.target.data('kind') === 'lanehead') return;
    updateBands(); save();
  });
  cy.on('zoom', function () {
    if (!state._raf) {
      state._raf = requestAnimationFrame(function () {
        state._raf = null;
        document.getElementById('zoomPct').textContent = Math.round(cy.zoom() * 100) + '%';
        applyLod();
        positionLaneTitles();
      });
    }
  });
  cy.on('pan', function () { positionLaneTitles(); });

  /* connect mode: drag or click-click */
  cy.on('mousedown', 'node', function (evt) {
    if (state.mode !== 'connect') return;
    var n = evt.target;
    if (n.data('kind') === 'band' || n.data('kind') === 'lanehead') return;
    if (state.connectSrc && state.connectSrc !== n.id()) {
      createUserEdge(state.connectSrc, n.id());
      clearConnect();
    } else {
      state.connectSrc = n.id();
      n.addClass('connect-src');
    }
  });
  cy.on('mouseup', 'node', function (evt) {
    if (state.mode !== 'connect' || !state.connectSrc) return;
    var n = evt.target;
    if (n.id() !== state.connectSrc) { createUserEdge(state.connectSrc, n.id()); clearConnect(); }
  });
  cy.on('mouseup', function (evt) {
    if (state.mode !== 'connect') return;
    if (evt.target === cy) { /* keep the pending source: click-click still works */ }
  });

  var container = document.getElementById('cy');
  container.addEventListener('mousemove', function (ev) {
    if (state.mode !== 'connect' || !state.connectSrc) return;
    var r = container.getBoundingClientRect();
    drawGhost({ x: ev.clientX - r.left, y: ev.clientY - r.top });
  });

  /* --------------------------------------------------------------- startup */
  document.getElementById('brandSub').innerHTML =
    'extracted from <a href="' + FLOW.meta.refUrl + '" target="_blank" rel="noopener">' +
    FLOW.meta.repo + '@' + FLOW.meta.ref + '</a> · ' + FLOW.nodes.length + ' nodes · ' +
    FLOW.edges.length + ' edges';

  /* scripting / debugging handle */
  window.__flow = {
    cy: cy, state: state, data: FLOW,
    snapshot: snapshot, relayout: relayout, importSnapshot: importSnapshot,
    applyLod: applyLod, updateBands: updateBands, setMode: setMode,
    api: {
      addNode: function (opts) {
        var id = 'u_n_' + (++P.seq);
        P.nodes.push({ id: id, x: opts.x, y: opts.y, label: opts.label || 'note' });
        return cy.add({ group: 'nodes', data: {
          id: id, kind: opts.kind || 'note', lane: opts.lane || '', tier: opts.tier || 1,
          custom: true, label: opts.label || 'note', sub: '', disp: opts.label || 'note', does: []
        }, position: { x: opts.x, y: opts.y } }).id();
      },
      addEdge: function (s, t, label) {
        var id = 'u_e_' + (++P.seq);
        P.edges.push({ id: id, s: s, t: t, label: label || '', kind: 'user' });
        cy.add({ group: 'edges', data: { id: id, source: s, target: t, kind: 'user', label: label || '', custom: true } });
        rebuildAdj(); updateBridges();
        return id;
      },
      setNote: function (id, text) { P.notes[id] = text; save(); },
      clear: function () { try { localStorage.clear(); } catch (e) {} }
    }
  };

  /* help overlay: auto-dismiss, remembered, toggled with the ? button */
  (function () {
    var help = document.getElementById('help');
    var seen = null;
    try { seen = localStorage.getItem(LS_KEY + ':helpseen'); } catch (e) {}
    if (seen) { help.classList.add('hidden'); return; }
    var t = setTimeout(function () { help.classList.add('hidden'); }, 20000);
    help.addEventListener('click', function () { clearTimeout(t); });
  })();

  cy.ready(function () {
    buildLaneTitles();
    updateBands();
    rebuildAdj();
    applyMutationMarks();
    refreshUnhide();
    applyLod();
    if (P.view && P.view.zoom) {
      cy.zoom({ level: P.view.zoom, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      cy.pan(P.view);
    } else {
      fitVisible(70, false);
    }
    positionLaneTitles();
    applyHighlight();
    document.getElementById('zoomPct').textContent = Math.round(cy.zoom() * 100) + '%';
    if (!P.view) {
      showHint('scroll / pinch to zoom — labels appear, then level 3 and 4 internals. Click a lane title to collapse it.');
    }
  });
})();
