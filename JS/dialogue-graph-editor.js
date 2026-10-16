/**
 * Amianto — Visual Dialogue Graph Editor
 * Mutates the same project.dialogues objects used by the form editor / runtime.
 * No second dialogue engine. Editor-only layout lives in node.ui / dialogue.editor.
 */
(function (root) {
  'use strict';

  const NODE_W = 200;
  const NODE_H_EST = 90;
  const GRID_X = 260;
  const GRID_Y = 140;
  const MAX_UNDO = 50;

  function logic() {
    return root.AmiantoDialogueLogic || null;
  }

  function validateApi() {
    return root.AmiantoDialogueValidate || null;
  }

  function uid(prefix) {
    return String(prefix || 'n') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cssEsc(str) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(String(str));
    }
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getDialogues() {
    return Array.isArray(root.projectDialogues) ? root.projectDialogues : [];
  }

  function findDialogue(id) {
    return getDialogues().find(function (d) { return d && d.id === id; }) || null;
  }

  function markDirty() {
    if (typeof root.markAmiantoProjectDirty === 'function') {
      root.markAmiantoProjectDirty();
    } else if (typeof root.markDialoguesDirty === 'function') {
      root.markDialoguesDirty();
    }
  }

  function ensureUi(node, index) {
    if (!node.ui || !Number.isFinite(Number(node.ui.x)) || !Number.isFinite(Number(node.ui.y))) {
      const col = index % 4;
      const row = Math.floor(index / 4);
      node.ui = { x: 40 + col * GRID_X, y: 40 + row * GRID_Y };
    }
  }

  function autoLayout(dlg) {
    if (!dlg || !dlg.nodes) return;
    const ids = Object.keys(dlg.nodes);
    ids.forEach(function (id, i) {
      ensureUi(dlg.nodes[id], i);
    });
  }

  // ---------- Editor singleton ----------
  const Editor = {
    mounted: false,
    mode: 'form', // form | visual
    dialogueId: null,
    selectedNodeId: null,
    selectedEdge: null, // { fromId, port, optionIndex? }
    panX: 0,
    panY: 0,
    zoom: 1,
    dragging: null,
    panning: null,
    connecting: null,
    spaceDown: false,
    undoStack: [],
    redoStack: [],
    layoutDirtyOnly: false,
    els: {},
    _rafEdges: null,
    _boundKey: null
  };

  function pushUndo() {
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    Editor.undoStack.push(deepClone({
      startNodeId: dlg.startNodeId,
      nodes: dlg.nodes,
      name: dlg.name,
      editor: dlg.editor
    }));
    if (Editor.undoStack.length > MAX_UNDO) Editor.undoStack.shift();
    Editor.redoStack = [];
  }

  function applySnapshot(snap) {
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg || !snap) return;
    dlg.startNodeId = snap.startNodeId;
    dlg.nodes = snap.nodes || {};
    if (snap.name != null) dlg.name = snap.name;
    if (snap.editor) dlg.editor = snap.editor;
    else delete dlg.editor;
    Editor.selectedNodeId = null;
    Editor.selectedEdge = null;
    markDirty();
    renderAll();
  }

  function undo() {
    if (!Editor.undoStack.length) return;
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    Editor.redoStack.push(deepClone({
      startNodeId: dlg.startNodeId,
      nodes: dlg.nodes,
      name: dlg.name,
      editor: dlg.editor
    }));
    applySnapshot(Editor.undoStack.pop());
  }

  function redo() {
    if (!Editor.redoStack.length) return;
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    Editor.undoStack.push(deepClone({
      startNodeId: dlg.startNodeId,
      nodes: dlg.nodes,
      name: dlg.name,
      editor: dlg.editor
    }));
    applySnapshot(Editor.redoStack.pop());
  }

  function persistViewport(markProjectDirty) {
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    dlg.editor = { panX: Editor.panX, panY: Editor.panY, zoom: Editor.zoom };
    if (markProjectDirty) markDirty();
  }

  function loadViewport(dlg) {
    if (dlg && dlg.editor) {
      Editor.panX = Number(dlg.editor.panX) || 0;
      Editor.panY = Number(dlg.editor.panY) || 0;
      Editor.zoom = Number(dlg.editor.zoom) || 1;
    } else {
      Editor.panX = 0;
      Editor.panY = 0;
      Editor.zoom = 1;
    }
  }

  function applyWorldTransform() {
    const world = Editor.els.world;
    if (!world) return;
    world.style.transform =
      'translate(' + Editor.panX + 'px,' + Editor.panY + 'px) scale(' + Editor.zoom + ')';
  }

  function screenToWorld(clientX, clientY) {
    const wrap = Editor.els.wrap;
    if (!wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left - Editor.panX) / Editor.zoom,
      y: (clientY - rect.top - Editor.panY) / Editor.zoom
    };
  }

  function getPortWorldPos(nodeEl, portEl) {
    const wrap = Editor.els.wrap;
    if (!wrap || !nodeEl || !portEl) return null;
    const pr = portEl.getBoundingClientRect();
    const cx = pr.left + pr.width / 2;
    const cy = pr.top + pr.height / 2;
    return screenToWorld(cx, cy);
  }

  function bezierPath(x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
    return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
  }

  function scheduleEdges() {
    if (Editor._rafEdges) return;
    Editor._rafEdges = requestAnimationFrame(function () {
      Editor._rafEdges = null;
      drawEdges();
    });
  }

  function drawEdges() {
    const svg = Editor.els.svg;
    const dlg = findDialogue(Editor.dialogueId);
    if (!svg || !dlg) return;
    const nodesRoot = Editor.els.nodes;
    let html = '';
    const V = validateApi();

    Object.keys(dlg.nodes || {}).forEach(function (nid) {
      const node = dlg.nodes[nid];
      const nodeEl = nodesRoot.querySelector('.dlg-node[data-id="' + cssEsc(nid) + '"]');
      if (!nodeEl) return;

      function addEdge(portSel, targetId, edgeKey) {
        const portEl = nodeEl.querySelector(portSel);
        if (!portEl) return;
        const from = getPortWorldPos(nodeEl, portEl);
        if (!from) return;
        const broken = !targetId || !dlg.nodes[targetId];
        let to = null;
        if (!broken) {
          const tEl = nodesRoot.querySelector('.dlg-node[data-id="' + cssEsc(targetId) + '"]');
          const inPort = tEl && tEl.querySelector('.dlg-port-in');
          to = tEl && inPort ? getPortWorldPos(tEl, inPort) : null;
        }
        if (!to) {
          to = { x: from.x + 80, y: from.y };
        }
        const selected =
          Editor.selectedEdge &&
          Editor.selectedEdge.fromId === nid &&
          Editor.selectedEdge.key === edgeKey;
        const cls = [
          broken ? 'dlg-edge-broken' : '',
          selected ? 'dlg-edge-selected' : ''
        ].filter(Boolean).join(' ');
        html +=
          '<path class="' + cls + '" data-from="' + esc(nid) + '" data-edge="' + esc(edgeKey) + '"' +
          (targetId ? ' data-to="' + esc(targetId) + '"' : '') +
          ' d="' + bezierPath(from.x, from.y, to.x, to.y) + '" />';
      }

      if (node.type === 'line' || node.type === 'action') {
        addEdge('.dlg-port-out[data-port="next"]', node.next, 'next');
      } else if (node.type === 'jump') {
        addEdge('.dlg-port-out[data-port="target"]', node.target, 'target');
      } else if (node.type === 'choice') {
        (node.options || []).forEach(function (opt, i) {
          addEdge('.dlg-port-out[data-port="opt"][data-opt-index="' + i + '"]', opt && opt.next, 'opt:' + i);
        });
      }
    });

    if (Editor.connecting && Editor.connecting.tempTo) {
      const c = Editor.connecting;
      html +=
        '<path class="dlg-edge-temp" d="' +
        bezierPath(c.fromX, c.fromY, c.tempTo.x, c.tempTo.y) +
        '" />';
    }

    svg.innerHTML = html;
    // expand svg bbox
    let maxX = 800;
    let maxY = 600;
    Object.keys(dlg.nodes || {}).forEach(function (nid) {
      const n = dlg.nodes[nid];
      if (n && n.ui) {
        maxX = Math.max(maxX, n.ui.x + NODE_W + 80);
        maxY = Math.max(maxY, n.ui.y + 160);
      }
    });
    svg.setAttribute('width', String(maxX));
    svg.setAttribute('height', String(maxY));
    svg.style.width = maxX + 'px';
    svg.style.height = maxY + 'px';

    svg.querySelectorAll('path[data-from]').forEach(function (path) {
      path.style.pointerEvents = 'stroke';
      path.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        Editor.selectedNodeId = null;
        Editor.selectedEdge = {
          fromId: path.getAttribute('data-from'),
          key: path.getAttribute('data-edge')
        };
        const to = path.getAttribute('data-to');
        if (to && e.detail === 2) {
          focusNode(to);
          return;
        }
        renderNodes();
        renderInspector();
        scheduleEdges();
      });
    });

    void V; // reserved for future edge annotations
  }

  function previewText(node) {
    if (!node) return '';
    if (node.type === 'line') {
      const sp = node.speaker ? node.speaker + ': ' : '';
      const mood = node.mood ? '[' + node.mood + '] ' : '';
      return mood + sp + (node.text || '');
    }
    if (node.type === 'choice') {
      const n = (node.options || []).length;
      return n + ' option' + (n === 1 ? '' : 's');
    }
    if (node.type === 'jump') return '→ ' + (node.target || '(none)');
    if (node.type === 'action') {
      const n = (node.actions || []).length;
      return n + ' action' + (n === 1 ? '' : 's');
    }
    return 'End dialogue';
  }

  function validationIndex(dlg) {
    const map = { errors: {}, warnings: {} };
    const V = validateApi();
    if (!V || !dlg) return map;
    const res = V.validateDialogue(dlg, logic());
    (res.errors || []).forEach(function (e) {
      if (e.nodeId) map.errors[e.nodeId] = true;
    });
    (res.warnings || []).forEach(function (w) {
      if (w.nodeId) map.warnings[w.nodeId] = true;
      if (Array.isArray(w.nodeIds)) {
        w.nodeIds.forEach(function (id) { map.warnings[id] = true; });
      }
    });
    map.result = res;
    return map;
  }

  function renderNodes() {
    const dlg = findDialogue(Editor.dialogueId);
    const rootEl = Editor.els.nodes;
    if (!rootEl) return;
    if (!dlg) {
      rootEl.innerHTML = '';
      return;
    }
    autoLayout(dlg);
    const vix = validationIndex(dlg);
    const reachable = (validateApi() && validateApi().collectReachable)
      ? validateApi().collectReachable(dlg)
      : {};

    rootEl.innerHTML = '';
    Object.keys(dlg.nodes).forEach(function (nid) {
      const node = dlg.nodes[nid];
      ensureUi(node, 0);
      const el = document.createElement('div');
      el.className = 'dlg-node';
      el.dataset.id = nid;
      el.dataset.type = node.type || 'end';
      if (Editor.selectedNodeId === nid) el.classList.add('is-selected');
      if (dlg.startNodeId === nid) el.classList.add('is-start');
      if (vix.errors[nid]) el.classList.add('is-error');
      else if (vix.warnings[nid]) el.classList.add('is-warn');
      if (dlg.startNodeId && !reachable[nid]) el.classList.add('is-orphan');
      el.style.left = node.ui.x + 'px';
      el.style.top = node.ui.y + 'px';

      let badges = '';
      if (dlg.startNodeId === nid) badges += '<span class="dlg-badge dlg-badge-start">START</span>';

      let bodyExtra = '';
      if (node.type === 'choice') {
        bodyExtra = '<div class="dlg-choice-ports">';
        (node.options || []).forEach(function (opt, i) {
          const cls = [
            'dlg-choice-port-row',
            opt && opt.condition ? 'has-cond' : '',
            opt && opt.once ? 'has-once' : ''
          ].filter(Boolean).join(' ');
          let ob = '';
          if (opt && opt.once) ob += '<span class="dlg-badge dlg-badge-once">once</span> ';
          if (opt && opt.condition) ob += '<span class="dlg-badge dlg-badge-cond">cond</span> ';
          bodyExtra +=
            '<div class="' + cls + '" data-opt-index="' + i + '">' +
            '<span>' + ob + esc((opt && opt.text) || '(empty)') + '</span>' +
            '<div class="dlg-port dlg-port-out" data-port="opt" data-opt-index="' + i + '" title="Connect option"></div>' +
            '</div>';
        });
        bodyExtra += '</div>';
      } else if (node.type !== 'end') {
        const port = node.type === 'jump' ? 'target' : 'next';
        bodyExtra =
          '<div class="dlg-port dlg-port-out" data-port="' + port + '" title="Connect"></div>';
      }

      el.innerHTML =
        '<div class="dlg-node-header">' +
        '<span class="dlg-node-type">' + esc(node.type || 'end') + '</span>' +
        '<span class="dlg-node-badges">' + badges + '</span>' +
        '</div>' +
        '<div class="dlg-node-body">' +
        '<div class="dlg-port dlg-port-in" title="Input"></div>' +
        '<div class="dlg-node-preview">' + esc(previewText(node)) + '</div>' +
        '<div class="dlg-node-id">' + esc(nid) + '</div>' +
        bodyExtra +
        '</div>';

      rootEl.appendChild(el);
      bindNodeEvents(el, nid);
    });

    updateStatus(vix.result);
    scheduleEdges();
  }

  function bindNodeEvents(el, nid) {
    const header = el.querySelector('.dlg-node-header');
    header.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const dlg = findDialogue(Editor.dialogueId);
      const node = dlg && dlg.nodes[nid];
      if (!node) return;
      Editor.selectedNodeId = nid;
      Editor.selectedEdge = null;
      pushUndo();
      const start = screenToWorld(e.clientX, e.clientY);
      Editor.dragging = {
        id: nid,
        ox: start.x - (node.ui.x || 0),
        oy: start.y - (node.ui.y || 0)
      };
      renderNodes();
      renderInspector();
    });

    el.addEventListener('click', function (e) {
      if (e.target.classList.contains('dlg-port')) return;
      Editor.selectedNodeId = nid;
      Editor.selectedEdge = null;
      renderNodes();
      renderInspector();
    });

    el.querySelectorAll('.dlg-port-out').forEach(function (port) {
      port.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const from = getPortWorldPos(el, port);
        Editor.connecting = {
          fromId: nid,
          port: port.getAttribute('data-port'),
          optionIndex: port.hasAttribute('data-opt-index')
            ? Number(port.getAttribute('data-opt-index'))
            : null,
          fromX: from.x,
          fromY: from.y,
          tempTo: from
        };
        Editor.els.wrap.classList.add('is-connecting');
      });
    });

    // Start node cannot accept incoming — still allow drop for UX but ignore connect to self start rule is: cannot connect INTO start is about ports; we allow connecting TO start from others (start can be mid-graph). Spec: "impossibile collegare un arco entrante allo Start" — so start has no meaningful in, we refuse connections targeting start.
    el.querySelector('.dlg-port-in').addEventListener('mouseup', function (e) {
      e.stopPropagation();
      finishConnect(nid);
    });
  }

  function finishConnect(targetId) {
    const c = Editor.connecting;
    Editor.connecting = null;
    if (Editor.els.wrap) Editor.els.wrap.classList.remove('is-connecting');
    if (!c || !targetId) {
      scheduleEdges();
      return;
    }
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    if (dlg.startNodeId === targetId) {
      // Spec: no incoming edge to Start — refuse
      updateStatusMessage('Cannot connect into the Start node', 'error');
      scheduleEdges();
      return;
    }
    if (c.fromId === targetId) {
      scheduleEdges();
      return;
    }
    const from = dlg.nodes[c.fromId];
    if (!from) return;
    pushUndo();
    if (c.port === 'next') from.next = targetId;
    else if (c.port === 'target') from.target = targetId;
    else if (c.port === 'opt' && Array.isArray(from.options) && from.options[c.optionIndex]) {
      from.options[c.optionIndex].next = targetId;
    }
    markDirty();
    renderNodes();
    renderInspector();
  }

  function updateStatus(result) {
    const el = Editor.els.status;
    if (!el) return;
    el.classList.remove('has-errors', 'has-warnings');
    if (!result) {
      el.textContent = '';
      return;
    }
    const ec = (result.errors || []).length;
    const wc = (result.warnings || []).length;
    if (ec) {
      el.classList.add('has-errors');
      el.textContent = ec + ' error(s), ' + wc + ' warning(s) — ' + (result.errors[0].message || '');
    } else if (wc) {
      el.classList.add('has-warnings');
      el.textContent = wc + ' warning(s) — ' + (result.warnings[0].message || '');
    } else {
      el.textContent = 'Dialogue graph OK';
    }
  }

  function updateStatusMessage(msg, kind) {
    const el = Editor.els.status;
    if (!el) return;
    el.classList.remove('has-errors', 'has-warnings');
    if (kind === 'error') el.classList.add('has-errors');
    if (kind === 'warning') el.classList.add('has-warnings');
    el.textContent = msg;
  }

  function renderToolbar() {
    const title = Editor.els.title;
    const dirty = Editor.els.dirty;
    const dlg = findDialogue(Editor.dialogueId);
    if (title) title.textContent = dlg ? (dlg.name || dlg.id) : '(no dialogue)';
    if (dirty) {
      dirty.style.display = root.__amiantoProjectDirty ? 'inline' : 'none';
    }
  }

  function renderInspector() {
    const panel = Editor.els.inspector;
    if (!panel) return;
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) {
      panel.innerHTML = '<p class="text-muted">No dialogue selected.</p>';
      return;
    }

    if (Editor.selectedEdge) {
      const edge = Editor.selectedEdge;
      const from = dlg.nodes[edge.fromId];
      let target = '';
      if (from) {
        if (edge.key === 'next') target = from.next || '';
        else if (edge.key === 'target') target = from.target || '';
        else if (edge.key.indexOf('opt:') === 0) {
          const oi = Number(edge.key.split(':')[1]);
          target = (from.options && from.options[oi] && from.options[oi].next) || '';
        }
      }
      panel.innerHTML =
        '<h6>Connection</h6>' +
        '<p><code>' + esc(edge.fromId) + '</code> → <code>' + esc(target || '(broken)') + '</code></p>' +
        '<button type="button" class="btn btn-outline-danger btn-sm mb-2" id="dlg-insp-del-edge">Delete link</button>' +
        (target && dlg.nodes[target]
          ? '<button type="button" class="btn btn-outline-info btn-sm" id="dlg-insp-goto">Go to target</button>'
          : '');
      const del = panel.querySelector('#dlg-insp-del-edge');
      if (del) {
        del.addEventListener('click', function () {
          if (!from) return;
          pushUndo();
          if (edge.key === 'next') from.next = '';
          else if (edge.key === 'target') from.target = '';
          else if (edge.key.indexOf('opt:') === 0) {
            const oi = Number(edge.key.split(':')[1]);
            if (from.options && from.options[oi]) from.options[oi].next = '';
          }
          Editor.selectedEdge = null;
          markDirty();
          renderNodes();
          renderInspector();
        });
      }
      const go = panel.querySelector('#dlg-insp-goto');
      if (go) {
        go.addEventListener('click', function () {
          if (target) focusNode(target);
        });
      }
      return;
    }

    const nid = Editor.selectedNodeId;
    if (!nid || !dlg.nodes[nid]) {
      panel.innerHTML =
        '<h6>Inspector</h6>' +
        '<p class="text-muted">Select a node or create one from the toolbar / right-click.</p>' +
        '<p class="text-muted small">Start is marked via <code>startNodeId</code> (badge START).</p>';
      return;
    }

    const node = dlg.nodes[nid];
    let html =
      '<h6>Node <code style="color:#39ff14">' + esc(nid) + '</code></h6>' +
      '<label>Type</label><div class="mb-2"><span class="badge bg-secondary">' + esc(node.type) + '</span></div>' +
      '<div class="d-flex flex-wrap gap-1 mb-2">' +
      '<button type="button" class="btn btn-outline-success btn-sm" id="dlg-insp-set-start">Set as start</button>' +
      '<button type="button" class="btn btn-outline-light btn-sm" id="dlg-insp-dup">Duplicate</button>' +
      '<button type="button" class="btn btn-outline-danger btn-sm" id="dlg-insp-del">Delete</button>' +
      '</div>';

    if (node.type === 'line') {
      const portraitPreview = node.portrait
        ? '<div class="mb-1"><img src="' + esc(node.portrait) + '" alt="portrait" style="max-width:72px;max-height:72px;border:1px solid #444;border-radius:4px;" /></div>'
        : '';
      html +=
        '<label>Speaker</label><input type="text" class="form-control form-control-sm" id="dlg-f-speaker" value="' + esc(node.speaker || '') + '" />' +
        '<label>Text</label><textarea class="form-control form-control-sm" id="dlg-f-text" rows="3">' + esc(node.text || '') + '</textarea>' +
        '<label>Mood</label><input type="text" class="form-control form-control-sm" id="dlg-f-mood" value="' + esc(node.mood || '') + '" placeholder="e.g. happy, angry, default" />' +
        '<label>Portrait (override)</label>' +
        portraitPreview +
        '<div class="d-flex gap-1 mb-2">' +
        '<button type="button" class="btn btn-outline-info btn-sm" id="dlg-f-portrait-pick">Browse…</button>' +
        '<button type="button" class="btn btn-outline-secondary btn-sm" id="dlg-f-portrait-clear">Clear</button>' +
        '</div>' +
        '<small class="text-muted d-block mb-2">Mood picks character portrait map; Browse overrides with a specific image.</small>' +
        '<label>Next</label><input type="text" class="form-control form-control-sm" id="dlg-f-next" value="' + esc(node.next || '') + '" list="dlg-node-ids" />' +
        actionsBuilderHtml(node.actions, 'node');
    } else if (node.type === 'choice') {
      html += '<div id="dlg-insp-options"></div>' +
        '<button type="button" class="btn btn-outline-success btn-sm" id="dlg-add-opt">+ Option</button>';
    } else if (node.type === 'jump') {
      html +=
        '<label>Target</label><input type="text" class="form-control form-control-sm" id="dlg-f-target" value="' + esc(node.target || '') + '" list="dlg-node-ids" />' +
        '<button type="button" class="btn btn-outline-info btn-sm mt-1" id="dlg-insp-goto-jump">Go to target</button>';
    } else if (node.type === 'action') {
      html += actionsBuilderHtml(node.actions, 'node') +
        '<label>Next</label><input type="text" class="form-control form-control-sm" id="dlg-f-next" value="' + esc(node.next || '') + '" list="dlg-node-ids" />';
    } else {
      html += '<p class="text-muted">Ends the dialogue session.</p>';
    }

    html += '<datalist id="dlg-node-ids">' +
      Object.keys(dlg.nodes).map(function (id) {
        return '<option value="' + esc(id) + '"></option>';
      }).join('') +
      '</datalist>';

    panel.innerHTML = html;

    panel.querySelector('#dlg-insp-set-start')?.addEventListener('click', function () {
      pushUndo();
      dlg.startNodeId = nid;
      markDirty();
      renderAll();
    });
    panel.querySelector('#dlg-insp-dup')?.addEventListener('click', function () {
      duplicateSelected();
    });
    panel.querySelector('#dlg-insp-del')?.addEventListener('click', function () {
      deleteSelectedNode();
    });

    const bindField = function (id, apply) {
      const el = panel.querySelector(id);
      if (!el) return;
      el.addEventListener('change', function () {
        pushUndo();
        apply(el);
        markDirty();
        renderNodes();
        renderToolbar();
      });
    };

    bindField('#dlg-f-speaker', function (el) { node.speaker = el.value; });
    bindField('#dlg-f-text', function (el) { node.text = el.value; });
    bindField('#dlg-f-mood', function (el) {
      const v = el.value.trim();
      if (v) node.mood = v;
      else delete node.mood;
    });
    bindField('#dlg-f-next', function (el) { node.next = el.value.trim(); });
    bindField('#dlg-f-target', function (el) { node.target = el.value.trim(); });

    panel.querySelector('#dlg-f-portrait-pick')?.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const pickFn = root.pickAmiantoResourceImage || (window.amiantoResources && window.amiantoResources.pick);
      if (typeof pickFn !== 'function') {
        if (typeof root.showNotification === 'function') {
          root.showNotification('Resource picker unavailable', 'warning');
        }
        return;
      }
      const resource = await pickFn({ title: 'Dialogue portrait' });
      if (!resource) return;
      let src = resource.publicUrl || resource.dataUrl || resource.url || '';
      if (window.amiantoResources && typeof window.amiantoResources.loadImageFromResource === 'function') {
        try {
          const img = await window.amiantoResources.loadImageFromResource(resource);
          if (img && img.src) src = img.src;
        } catch (_) { /* keep publicUrl fallback */ }
      }
      if (!src) {
        if (typeof root.showNotification === 'function') {
          root.showNotification('Could not load portrait image', 'warning');
        }
        return;
      }
      pushUndo();
      node.portrait = src;
      markDirty();
      renderInspector();
      renderNodes();
    });
    panel.querySelector('#dlg-f-portrait-clear')?.addEventListener('click', function () {
      pushUndo();
      delete node.portrait;
      markDirty();
      renderInspector();
      renderNodes();
    });

    panel.querySelector('#dlg-insp-goto-jump')?.addEventListener('click', function () {
      if (node.target) focusNode(node.target);
    });

    if (node.type === 'action' || node.type === 'line') {
      bindActionsBuilder(panel, node, 'actions');
    }

    if (node.type === 'choice') {
      renderOptionsInspector(panel.querySelector('#dlg-insp-options'), node);
      panel.querySelector('#dlg-add-opt')?.addEventListener('click', function () {
        pushUndo();
        if (!Array.isArray(node.options)) node.options = [];
        node.options.push({ id: uid('opt'), text: 'New choice', next: '' });
        markDirty();
        renderAll();
        Editor.selectedNodeId = nid;
        renderInspector();
      });
    }
  }

  function actionsBuilderHtml(actions, _scope) {
    const list = Array.isArray(actions) ? actions : [];
    let html = '<div class="dlg-insp-section"><label>Actions</label><div id="dlg-actions-list">';
    list.forEach(function (a, i) {
      html += actionRowHtml(a, i);
    });
    html += '</div><button type="button" class="btn btn-outline-success btn-sm" id="dlg-add-action">+ Action</button></div>';
    return html;
  }

  function defaultRunScriptCode() {
    return [
      'function on_dialogue_action(dialogueId, nodeId, optionId) {',
      '  // Custom dialogue script',
      '  print("dialogue action");',
      '}'
    ].join('\n');
  }

  function actionRowHtml(a, i) {
    const type = (a && a.type) || 'set_var';
    let fields = '';
    if (type === 'set_var') {
      fields =
        '<label>Key</label><input class="form-control form-control-sm" data-act="key" data-i="' + i + '" value="' + esc(a.key || '') + '" />' +
        '<label>Value (JSON)</label><input class="form-control form-control-sm" data-act="value" data-i="' + i + '" value="' + esc(valueToEditor(a.value)) + '" />';
    } else if (type === 'add_item' || type === 'remove_item') {
      fields =
        '<label>Item ID</label><input class="form-control form-control-sm" data-act="itemId" data-i="' + i + '" value="' + esc(a.itemId || '') + '" />' +
        '<label>Count</label><input type="number" min="1" class="form-control form-control-sm" data-act="count" data-i="' + i + '" value="' + esc(a.count || 1) + '" />';
    } else if (type === 'set_object_visible') {
      fields =
        '<label>Object ID</label><input class="form-control form-control-sm" data-act="objectId" data-i="' + i + '" value="' + esc(a.objectId || '') + '" />' +
        '<label class="form-check mt-1"><input type="checkbox" class="form-check-input" data-act="visible" data-i="' + i + '" ' + (a.visible !== false ? 'checked' : '') + ' /> Visible</label>';
    } else if (type === 'run_script') {
      fields =
        '<input type="hidden" data-act="id" data-i="' + i + '" value="' + esc(a.id || '') + '" />' +
        '<label>Handler</label><input class="form-control form-control-sm" data-act="handler" data-i="' + i + '" value="' +
        esc(a.handler || 'on_dialogue_action') +
        '" placeholder="on_dialogue_action" />' +
        '<label>Script</label><textarea class="form-control form-control-sm font-monospace dlg-run-script-ta" data-act="code" data-i="' + i +
        '" rows="8" spellcheck="false" style="font-size:11px;line-height:1.35;">' +
        esc(a.code || defaultRunScriptCode()) +
        '</textarea>' +
        '<small class="text-muted d-block mt-1">Write the function in the box (API hints while typing). Runs in the game sandbox when this action fires.</small>';
    }
    const typeLabels = {
      set_var: 'set_var',
      add_item: 'add_item',
      remove_item: 'remove_item',
      set_object_visible: 'set_object_visible',
      run_script: 'run_script (custom)'
    };
    return (
      '<div class="dlg-insp-action" data-action-index="' + i + '">' +
      '<div class="d-flex justify-content-between mb-1">' +
      '<select class="form-select form-select-sm" data-act="type" data-i="' + i + '" style="max-width:70%">' +
      ['set_var', 'add_item', 'remove_item', 'set_object_visible', 'run_script'].map(function (t) {
        return '<option value="' + t + '"' + (t === type ? ' selected' : '') + '>' + (typeLabels[t] || t) + '</option>';
      }).join('') +
      '</select>' +
      '<button type="button" class="btn btn-outline-danger btn-sm py-0" data-del-act="' + i + '">×</button>' +
      '</div>' + fields + '</div>'
    );
  }

  function valueToEditor(v) {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  function parseValueEditor(str) {
    const s = String(str || '').trim();
    if (!s) return '';
    try { return JSON.parse(s); } catch (_) { return s; }
  }

  function readRunScriptCode(row) {
    const ta = row.querySelector('[data-act="code"]');
    if (!ta) return '';
    if (ta._amiantoCm && typeof ta._amiantoCm.getValue === 'function') {
      return ta._amiantoCm.getValue();
    }
    return ta.value || '';
  }

  function mountRunScriptEditors(panel, syncQuietFn) {
    if (typeof root.amiantoMountScriptCodeMirror !== 'function') return;
    panel.querySelectorAll('textarea[data-act="code"]').forEach(function (ta) {
      const cm = root.amiantoMountScriptCodeMirror(ta, { height: 180 });
      if (!cm || cm._amiantoDlgBound) return;
      cm._amiantoDlgBound = true;
      let debounce = null;
      cm.on('change', function () {
        try { cm.save(); } catch (_) {}
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(function () {
          if (typeof syncQuietFn === 'function') syncQuietFn();
        }, 350);
      });
    });
  }

  function bindActionsBuilder(panel, owner, field) {
    const collectActions = function () {
      const rows = panel.querySelectorAll('.dlg-insp-action');
      const out = [];
      rows.forEach(function (row) {
        const typeEl = row.querySelector('[data-act="type"]');
        const type = typeEl ? typeEl.value : 'set_var';
        const a = { type: type };
        if (type === 'set_var') {
          a.key = (row.querySelector('[data-act="key"]') || {}).value || '';
          a.value = parseValueEditor((row.querySelector('[data-act="value"]') || {}).value);
        } else if (type === 'add_item' || type === 'remove_item') {
          a.itemId = (row.querySelector('[data-act="itemId"]') || {}).value || '';
          a.count = Number((row.querySelector('[data-act="count"]') || {}).value) || 1;
        } else if (type === 'set_object_visible') {
          a.objectId = (row.querySelector('[data-act="objectId"]') || {}).value || '';
          const vis = row.querySelector('[data-act="visible"]');
          a.visible = !!(vis && vis.checked);
        } else if (type === 'run_script') {
          a.id = (row.querySelector('[data-act="id"]') || {}).value || uid('rs');
          a.handler = (row.querySelector('[data-act="handler"]') || {}).value || 'on_dialogue_action';
          a.code = readRunScriptCode(row);
        }
        out.push(a);
      });
      const DL = logic();
      owner[field] = DL && DL.normalizeActions ? DL.normalizeActions(out) : out;
    };

    const sync = function () {
      pushUndo();
      collectActions();
      markDirty();
      renderNodes();
    };

    // CodeMirror: no undo snapshot per keystroke
    const syncQuiet = function () {
      collectActions();
      markDirty();
    };

    panel.querySelector('#dlg-add-action')?.addEventListener('click', function () {
      pushUndo();
      if (!Array.isArray(owner[field])) owner[field] = [];
      owner[field].push({ type: 'set_var', key: 'flag', value: true });
      markDirty();
      renderInspector();
    });

    panel.querySelectorAll('[data-del-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.getAttribute('data-del-act'));
        pushUndo();
        if (Array.isArray(owner[field])) owner[field].splice(i, 1);
        markDirty();
        renderInspector();
        renderNodes();
      });
    });

    panel.querySelectorAll('[data-act]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (el.getAttribute('data-act') === 'type') {
          const i = Number(el.getAttribute('data-i'));
          pushUndo();
          const t = el.value;
          const next = { type: t };
          if (t === 'set_var') { next.key = 'flag'; next.value = true; }
          else if (t === 'add_item' || t === 'remove_item') { next.itemId = ''; next.count = 1; }
          else if (t === 'set_object_visible') { next.objectId = ''; next.visible = true; }
          else if (t === 'run_script') {
            next.id = uid('rs');
            next.handler = 'on_dialogue_action';
            next.code = defaultRunScriptCode();
          }
          if (!Array.isArray(owner[field])) owner[field] = [];
          owner[field][i] = next;
          markDirty();
          renderInspector();
          return;
        }
        if (el.getAttribute('data-act') === 'code') return; // CodeMirror gestisce via change
        sync();
      });
    });

    mountRunScriptEditors(panel, syncQuiet);
  }

  const COND_MAX_DEPTH = 4;

  function defaultLeafCondition() {
    return { type: 'has_item', itemId: '' };
  }

  function conditionBuilderHtml(cond, optIndex, path, depth) {
    const c = cond || null;
    const type = c ? c.type : '';
    const p = path || '';
    const d = depth || 0;
    const pathAttr = ' data-oi="' + optIndex + '" data-cond-path="' + esc(p) + '"';

    let body = '';
    if (type === 'has_item') {
      body = '<label>Item ID</label><input class="form-control form-control-sm" data-cond-field="itemId"' + pathAttr + ' value="' + esc(c.itemId || '') + '" />';
    } else if (type === 'var') {
      body =
        '<label>Key</label><input class="form-control form-control-sm" data-cond-field="key"' + pathAttr + ' value="' + esc(c.key || '') + '" />' +
        '<label>Op</label><select class="form-select form-select-sm" data-cond-field="op"' + pathAttr + '>' +
        ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'].map(function (op) {
          return '<option value="' + op + '"' + (c.op === op ? ' selected' : '') + '>' + op + '</option>';
        }).join('') +
        '</select>' +
        (c.op !== 'truthy' && c.op !== 'falsy'
          ? '<label>Value (JSON)</label><input class="form-control form-control-sm" data-cond-field="value"' + pathAttr + ' value="' + esc(valueToEditor(c.value)) + '" />'
          : '');
    } else if (type === 'and' || type === 'or') {
      const list = Array.isArray(c.of) ? c.of : [];
      body = '<div class="dlg-cond-nested mt-1">';
      list.forEach(function (child, ci) {
        const childPath = (p ? p + '.' : '') + 'of.' + ci;
        body +=
          '<div class="border border-secondary rounded p-1 mb-1" style="background:#1a1a1a;">' +
          '<div class="d-flex justify-content-between mb-1">' +
          '<small class="text-muted">' + type + ' #' + (ci + 1) + '</small>' +
          '<button type="button" class="btn btn-outline-danger btn-sm py-0" data-cond-del-child="1" data-oi="' + optIndex + '" data-cond-path="' + esc(childPath) + '">×</button>' +
          '</div>' +
          conditionBuilderHtml(child, optIndex, childPath, d + 1) +
          '</div>';
      });
      if (d < COND_MAX_DEPTH) {
        body += '<button type="button" class="btn btn-outline-success btn-sm" data-cond-add-child="1" data-oi="' + optIndex + '" data-cond-path="' + esc(p) + '">+ Sub-condition</button>';
      }
      body += '</div>';
    } else if (type === 'not') {
      const inner = c.of || null;
      const childPath = (p ? p + '.' : '') + 'of';
      body =
        '<div class="dlg-cond-nested mt-1 border border-secondary rounded p-1" style="background:#1a1a1a;">' +
        '<small class="text-muted d-block mb-1">NOT</small>' +
        (d < COND_MAX_DEPTH
          ? conditionBuilderHtml(inner || defaultLeafCondition(), optIndex, childPath, d + 1)
          : '<small class="text-muted">Max nesting depth</small>') +
        '</div>';
    }

    const typeSelect =
      '<select class="form-select form-select-sm" data-cond-type="1"' + pathAttr + '>' +
      (p === ''
        ? '<option value=""' + (!type ? ' selected' : '') + '>(none)</option>'
        : '') +
      ['has_item', 'var', 'and', 'or', 'not'].map(function (t) {
        return '<option value="' + t + '"' + (type === t ? ' selected' : '') + '>' + t + '</option>';
      }).join('') +
      '</select>';

    return (
      (p === '' ? '<label>Condition</label>' : '') +
      typeSelect + body
    );
  }

  function getCondByPath(root, path) {
    if (!path) return root;
    const parts = String(path).split('.');
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      const part = parts[i];
      if (part === 'of') cur = cur.of;
      else if (/^\d+$/.test(part)) cur = Array.isArray(cur) ? cur[Number(part)] : null;
      else cur = cur[part];
    }
    return cur;
  }

  function setCondByPath(option, path, value) {
    if (!path) {
      if (value) option.condition = value;
      else delete option.condition;
      return;
    }
    if (!option.condition) {
      if (value == null) return;
      option.condition = {};
    }
    const parts = String(path).split('.');
    let cur = option.condition;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part === 'of') {
        if (parts[i + 1] != null && /^\d+$/.test(parts[i + 1])) {
          if (!Array.isArray(cur.of)) cur.of = [];
          cur = cur.of;
        } else {
          if (cur.of == null || typeof cur.of !== 'object' || Array.isArray(cur.of)) {
            cur.of = defaultLeafCondition();
          }
          cur = cur.of;
        }
      } else if (/^\d+$/.test(part)) {
        const idx = Number(part);
        if (!Array.isArray(cur)) return;
        if (!cur[idx] || typeof cur[idx] !== 'object') cur[idx] = {};
        cur = cur[idx];
      }
    }
    const last = parts[parts.length - 1];
    if (last === 'of') {
      if (value == null) delete cur.of;
      else cur.of = value;
    } else if (/^\d+$/.test(last)) {
      const idx = Number(last);
      if (!Array.isArray(cur)) return;
      if (value == null) cur.splice(idx, 1);
      else cur[idx] = value;
    }
  }

  function makeConditionOfType(t) {
    if (!t) return null;
    if (t === 'has_item') return { type: 'has_item', itemId: '' };
    if (t === 'var') return { type: 'var', key: '', op: 'eq', value: true };
    if (t === 'not') return { type: 'not', of: defaultLeafCondition() };
    if (t === 'and' || t === 'or') return { type: t, of: [defaultLeafCondition()] };
    return null;
  }

  function normalizeOptionCondition(option) {
    const DL = logic();
    if (!option || !option.condition) return;
    if (DL && DL.normalizeCondition) {
      const n = DL.normalizeCondition(option.condition);
      if (n) option.condition = n;
      else delete option.condition;
    }
  }

  function renderOptionsInspector(container, node) {
    if (!container) return;
    const opts = Array.isArray(node.options) ? node.options : [];
    container.innerHTML = opts.map(function (opt, i) {
      return (
        '<div class="dlg-insp-option" data-opt-index="' + i + '">' +
        '<div class="d-flex justify-content-between mb-1">' +
        '<small class="text-muted">Option <code>' + esc(opt.id) + '</code></small>' +
        '<button type="button" class="btn btn-outline-danger btn-sm py-0" data-del-opt="' + i + '">×</button>' +
        '</div>' +
        '<label>Text</label><input class="form-control form-control-sm" data-opt-field="text" data-oi="' + i + '" value="' + esc(opt.text || '') + '" />' +
        '<label>Next</label><input class="form-control form-control-sm" data-opt-field="next" data-oi="' + i + '" value="' + esc(opt.next || '') + '" list="dlg-node-ids" />' +
        '<label class="form-check"><input type="checkbox" class="form-check-input" data-opt-once="1" data-oi="' + i + '" ' + (opt.once ? 'checked' : '') + ' /> Once only</label>' +
        conditionBuilderHtml(opt.condition, i) +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('[data-del-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pushUndo();
        node.options.splice(Number(btn.getAttribute('data-del-opt')), 1);
        markDirty();
        renderAll();
      });
    });

    container.querySelectorAll('[data-opt-field]').forEach(function (el) {
      el.addEventListener('change', function () {
        const oi = Number(el.getAttribute('data-oi'));
        const field = el.getAttribute('data-opt-field');
        pushUndo();
        if (node.options[oi]) node.options[oi][field] = field === 'next' ? el.value.trim() : el.value;
        markDirty();
        renderNodes();
      });
    });

    container.querySelectorAll('[data-opt-once]').forEach(function (el) {
      el.addEventListener('change', function () {
        const oi = Number(el.getAttribute('data-oi'));
        pushUndo();
        if (!node.options[oi]) return;
        if (el.checked) node.options[oi].once = true;
        else delete node.options[oi].once;
        markDirty();
        renderNodes();
      });
    });

    container.querySelectorAll('[data-cond-type]').forEach(function (el) {
      el.addEventListener('change', function () {
        const oi = Number(el.getAttribute('data-oi'));
        const path = el.getAttribute('data-cond-path') || '';
        const t = el.value;
        pushUndo();
        if (!node.options[oi]) return;
        const next = makeConditionOfType(t);
        setCondByPath(node.options[oi], path, next);
        normalizeOptionCondition(node.options[oi]);
        markDirty();
        renderInspector();
        renderNodes();
      });
    });

    container.querySelectorAll('[data-cond-field]').forEach(function (el) {
      el.addEventListener('change', function () {
        const oi = Number(el.getAttribute('data-oi'));
        const path = el.getAttribute('data-cond-path') || '';
        const field = el.getAttribute('data-cond-field');
        pushUndo();
        const opt = node.options[oi];
        if (!opt || !opt.condition) return;
        const target = getCondByPath(opt.condition, path);
        if (!target || typeof target !== 'object') return;
        if (field === 'value') target.value = parseValueEditor(el.value);
        else target[field] = el.value;
        normalizeOptionCondition(opt);
        markDirty();
        renderNodes();
        if (field === 'op') renderInspector();
      });
    });

    container.querySelectorAll('[data-cond-add-child]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const oi = Number(btn.getAttribute('data-oi'));
        const path = btn.getAttribute('data-cond-path') || '';
        pushUndo();
        const opt = node.options[oi];
        if (!opt || !opt.condition) return;
        const parent = getCondByPath(opt.condition, path);
        if (!parent || (parent.type !== 'and' && parent.type !== 'or')) return;
        if (!Array.isArray(parent.of)) parent.of = [];
        parent.of.push(defaultLeafCondition());
        normalizeOptionCondition(opt);
        markDirty();
        renderInspector();
        renderNodes();
      });
    });

    container.querySelectorAll('[data-cond-del-child]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const oi = Number(btn.getAttribute('data-oi'));
        const path = btn.getAttribute('data-cond-path') || '';
        pushUndo();
        const opt = node.options[oi];
        if (!opt || !opt.condition) return;
        setCondByPath(opt, path, null);
        if (Array.isArray(opt.condition && opt.condition.of) && !opt.condition.of.length) {
          opt.condition.of.push(defaultLeafCondition());
        }
        normalizeOptionCondition(opt);
        markDirty();
        renderInspector();
        renderNodes();
      });
    });
  }

  function renderAll() {
    renderToolbar();
    renderNodes();
    renderInspector();
    applyWorldTransform();
  }

  function focusNode(nid) {
    const dlg = findDialogue(Editor.dialogueId);
    const node = dlg && dlg.nodes[nid];
    if (!node) return;
    ensureUi(node, 0);
    Editor.selectedNodeId = nid;
    Editor.selectedEdge = null;
    const wrap = Editor.els.wrap;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      Editor.panX = rect.width / 2 - (node.ui.x + NODE_W / 2) * Editor.zoom;
      Editor.panY = rect.height / 2 - (node.ui.y + NODE_H_EST / 2) * Editor.zoom;
      persistViewport(false);
    }
    renderAll();
  }

  function fitView() {
    const dlg = findDialogue(Editor.dialogueId);
    const wrap = Editor.els.wrap;
    if (!dlg || !wrap) return;
    const ids = Object.keys(dlg.nodes || {});
    if (!ids.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    ids.forEach(function (id) {
      const n = dlg.nodes[id];
      ensureUi(n, 0);
      minX = Math.min(minX, n.ui.x);
      minY = Math.min(minY, n.ui.y);
      maxX = Math.max(maxX, n.ui.x + NODE_W);
      maxY = Math.max(maxY, n.ui.y + 120);
    });
    const rect = wrap.getBoundingClientRect();
    const pad = 40;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const zx = rect.width / w;
    const zy = rect.height / h;
    Editor.zoom = Math.max(0.3, Math.min(1.5, Math.min(zx, zy)));
    Editor.panX = (rect.width - w * Editor.zoom) / 2 - (minX - pad) * Editor.zoom;
    Editor.panY = (rect.height - h * Editor.zoom) / 2 - (minY - pad) * Editor.zoom;
    persistViewport(false);
    applyWorldTransform();
    scheduleEdges();
  }

  function centerView() {
    const dlg = findDialogue(Editor.dialogueId);
    const wrap = Editor.els.wrap;
    if (!dlg || !wrap) return;
    const ids = Object.keys(dlg.nodes || {});
    if (!ids.length) return;
    let sx = 0;
    let sy = 0;
    ids.forEach(function (id) {
      ensureUi(dlg.nodes[id], 0);
      sx += dlg.nodes[id].ui.x + NODE_W / 2;
      sy += dlg.nodes[id].ui.y + 40;
    });
    const cx = sx / ids.length;
    const cy = sy / ids.length;
    const rect = wrap.getBoundingClientRect();
    Editor.panX = rect.width / 2 - cx * Editor.zoom;
    Editor.panY = rect.height / 2 - cy * Editor.zoom;
    persistViewport(false);
    applyWorldTransform();
    scheduleEdges();
  }

  function addNode(type, atWorld) {
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    if (!dlg.nodes) dlg.nodes = {};
    pushUndo();
    const t = String(type || 'end').toLowerCase();
    let id;
    let node;
    const pos = atWorld || screenToWorld(
      (Editor.els.wrap.getBoundingClientRect().left + Editor.els.wrap.getBoundingClientRect().width / 2),
      (Editor.els.wrap.getBoundingClientRect().top + Editor.els.wrap.getBoundingClientRect().height / 2)
    );
    if (t === 'line') {
      id = uid('ln');
      node = { id: id, type: 'line', speaker: '', text: '', next: '' };
    } else if (t === 'choice') {
      id = uid('ch');
      node = {
        id: id,
        type: 'choice',
        options: [
          { id: uid('opt'), text: 'Option A', next: '' },
          { id: uid('opt'), text: 'Option B', next: '' }
        ]
      };
    } else if (t === 'jump') {
      id = uid('jmp');
      node = { id: id, type: 'jump', target: '' };
    } else if (t === 'action') {
      id = uid('act');
      node = { id: id, type: 'action', next: '', actions: [] };
    } else {
      id = uid('end');
      node = { id: id, type: 'end' };
    }
    node.ui = { x: pos.x - NODE_W / 2, y: pos.y - 20 };
    dlg.nodes[id] = node;
    if (!dlg.startNodeId) dlg.startNodeId = id;
    Editor.selectedNodeId = id;
    markDirty();
    renderAll();
    hideCtx();
  }

  function deleteSelectedNode() {
    const dlg = findDialogue(Editor.dialogueId);
    const nid = Editor.selectedNodeId;
    if (!dlg || !nid || !dlg.nodes[nid]) return;
    if (!confirm('Delete node "' + nid + '"?')) return;
    pushUndo();
    delete dlg.nodes[nid];
    // clear dangling refs
    Object.keys(dlg.nodes).forEach(function (id) {
      const n = dlg.nodes[id];
      if (n.next === nid) n.next = '';
      if (n.target === nid) n.target = '';
      if (Array.isArray(n.options)) {
        n.options.forEach(function (o) {
          if (o && o.next === nid) o.next = '';
        });
      }
    });
    if (dlg.startNodeId === nid) {
      const keys = Object.keys(dlg.nodes);
      dlg.startNodeId = keys[0] || '';
    }
    Editor.selectedNodeId = null;
    markDirty();
    renderAll();
  }

  function duplicateSelected() {
    const dlg = findDialogue(Editor.dialogueId);
    const nid = Editor.selectedNodeId;
    if (!dlg || !nid || !dlg.nodes[nid]) return;
    const V = validateApi();
    pushUndo();
    let clone;
    if (V && V.duplicateNodeWithNewIds) {
      clone = V.duplicateNodeWithNewIds(dlg.nodes[nid], uid);
    } else {
      clone = deepClone(dlg.nodes[nid]);
      clone.id = uid(clone.type || 'n');
      if (clone.ui) { clone.ui.x += 40; clone.ui.y += 40; }
    }
    dlg.nodes[clone.id] = clone;
    Editor.selectedNodeId = clone.id;
    markDirty();
    renderAll();
  }

  function deleteSelectedEdge() {
    if (!Editor.selectedEdge) return;
    const dlg = findDialogue(Editor.dialogueId);
    if (!dlg) return;
    const from = dlg.nodes[Editor.selectedEdge.fromId];
    if (!from) return;
    pushUndo();
    const key = Editor.selectedEdge.key;
    if (key === 'next') from.next = '';
    else if (key === 'target') from.target = '';
    else if (key.indexOf('opt:') === 0) {
      const oi = Number(key.split(':')[1]);
      if (from.options && from.options[oi]) from.options[oi].next = '';
    }
    Editor.selectedEdge = null;
    markDirty();
    renderAll();
  }

  function runValidate() {
    const dlg = findDialogue(Editor.dialogueId);
    const V = validateApi();
    if (!dlg || !V) return;
    const res = V.validateDialogue(dlg, logic());
    updateStatus(res);
    renderNodes();
    if (typeof root.showNotification === 'function') {
      const ec = res.errors.length;
      const wc = res.warnings.length;
      root.showNotification(
        ec ? ('Dialogue: ' + ec + ' error(s), ' + wc + ' warning(s)') : ('Dialogue OK (' + wc + ' warning(s))'),
        ec ? 'warning' : 'success'
      );
    }
  }

  function hideCtx() {
    if (Editor.els.ctx) Editor.els.ctx.classList.remove('is-open');
  }

  function showCtx(x, y) {
    const m = Editor.els.ctx;
    if (!m) return;
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    m.classList.add('is-open');
  }

  function onPointerMove(e) {
    if (Editor.dragging) {
      const dlg = findDialogue(Editor.dialogueId);
      const node = dlg && dlg.nodes[Editor.dragging.id];
      if (!node) return;
      const w = screenToWorld(e.clientX, e.clientY);
      node.ui = {
        x: Math.round(w.x - Editor.dragging.ox),
        y: Math.round(w.y - Editor.dragging.oy)
      };
      const el = Editor.els.nodes.querySelector('.dlg-node[data-id="' + cssEsc(Editor.dragging.id) + '"]');
      if (el) {
        el.style.left = node.ui.x + 'px';
        el.style.top = node.ui.y + 'px';
      }
      scheduleEdges();
      return;
    }
    if (Editor.panning) {
      Editor.panX = Editor.panning.originPanX + (e.clientX - Editor.panning.x);
      Editor.panY = Editor.panning.originPanY + (e.clientY - Editor.panning.y);
      applyWorldTransform();
      return;
    }
    if (Editor.connecting) {
      Editor.connecting.tempTo = screenToWorld(e.clientX, e.clientY);
      scheduleEdges();
    }
  }

  function onPointerUp(e) {
    if (Editor.dragging) {
      Editor.dragging = null;
      markDirty();
      persistViewport(false);
    }
    if (Editor.panning) {
      Editor.panning = null;
      if (Editor.els.wrap) Editor.els.wrap.classList.remove('is-panning');
      persistViewport(false);
    }
    if (Editor.connecting) {
      // if released on a node input — handled by mouseup on port; else cancel
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = el && el.closest ? el.closest('.dlg-node') : null;
      if (nodeEl && el.classList.contains('dlg-port-in')) {
        finishConnect(nodeEl.getAttribute('data-id'));
      } else if (nodeEl) {
        finishConnect(nodeEl.getAttribute('data-id'));
      } else {
        Editor.connecting = null;
        if (Editor.els.wrap) Editor.els.wrap.classList.remove('is-connecting');
        scheduleEdges();
      }
    }
  }

  function bindCanvas() {
    const wrap = Editor.els.wrap;
    if (!wrap) return;

    wrap.addEventListener('mousedown', function (e) {
      hideCtx();
      if (e.button === 1 || (e.button === 0 && (Editor.spaceDown || e.target === wrap || e.target === Editor.els.world || e.target === Editor.els.svg))) {
        if (e.target.classList && e.target.classList.contains('dlg-node')) return;
        if (e.target.closest && e.target.closest('.dlg-node')) return;
        e.preventDefault();
        Editor.panning = {
          x: e.clientX,
          y: e.clientY,
          originPanX: Editor.panX,
          originPanY: Editor.panY
        };
        wrap.classList.add('is-panning');
        Editor.selectedNodeId = null;
        Editor.selectedEdge = null;
        renderInspector();
        renderNodes();
      }
    });

    wrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      const before = screenToWorld(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      Editor.zoom = Math.max(0.25, Math.min(2.5, Editor.zoom * factor));
      const after = screenToWorld(e.clientX, e.clientY);
      Editor.panX += (after.x - before.x) * Editor.zoom;
      Editor.panY += (after.y - before.y) * Editor.zoom;
      applyWorldTransform();
      persistViewport(false);
      scheduleEdges();
    }, { passive: false });

    wrap.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      Editor._ctxWorld = screenToWorld(e.clientX, e.clientY);
      showCtx(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
  }

  function onKeyDown(e) {
    if (Editor.mode !== 'visual') return;
    if (e.code === 'Space') {
      Editor.spaceDown = true;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (Editor.selectedEdge) {
        e.preventDefault();
        deleteSelectedEdge();
      } else if (Editor.selectedNodeId) {
        e.preventDefault();
        deleteSelectedNode();
      }
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') Editor.spaceDown = false;
  }

  function mount() {
    if (Editor.mounted) return;
    const panel = document.getElementById('dialogueGraphMainPanel');
    if (!panel) return;
    Editor.els.panel = panel;
    Editor.els.title = document.getElementById('dlg-graph-title');
    Editor.els.dirty = document.getElementById('dlg-graph-dirty');
    Editor.els.wrap = document.getElementById('dlg-graph-canvas-wrap');
    Editor.els.world = document.getElementById('dlg-graph-world');
    Editor.els.svg = document.getElementById('dlg-graph-edges');
    Editor.els.nodes = document.getElementById('dlg-graph-nodes');
    Editor.els.inspector = document.getElementById('dlg-graph-inspector');
    Editor.els.status = document.getElementById('dlg-graph-status');
    Editor.els.ctx = document.getElementById('dlg-graph-ctx');
    Editor.els.empty = document.getElementById('dlg-graph-empty');

    document.getElementById('dlg-btn-fit')?.addEventListener('click', fitView);
    document.getElementById('dlg-btn-center')?.addEventListener('click', centerView);
    document.getElementById('dlg-btn-validate')?.addEventListener('click', runValidate);
    document.getElementById('dlg-btn-preview')?.addEventListener('click', function () {
      const dlg = findDialogue(Editor.dialogueId);
      if (!dlg) {
        if (typeof root.showNotification === 'function') {
          root.showNotification('No dialogue selected', 'warning');
        }
        return;
      }
      if (typeof root.previewProjectDialogue === 'function') {
        root.previewProjectDialogue(dlg.name || dlg.id);
      } else if (typeof root.showNotification === 'function') {
        root.showNotification('Preview requires Play Test', 'warning');
      }
    });
    document.getElementById('dlg-btn-add-line')?.addEventListener('click', function () { addNode('line'); });
    document.getElementById('dlg-btn-add-choice')?.addEventListener('click', function () { addNode('choice'); });
    document.getElementById('dlg-btn-add-jump')?.addEventListener('click', function () { addNode('jump'); });
    document.getElementById('dlg-btn-add-action')?.addEventListener('click', function () { addNode('action'); });
    document.getElementById('dlg-btn-add-end')?.addEventListener('click', function () { addNode('end'); });

    if (Editor.els.ctx) {
      Editor.els.ctx.querySelectorAll('[data-add-type]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          addNode(btn.getAttribute('data-add-type'), Editor._ctxWorld);
        });
      });
    }
    document.addEventListener('click', function () { hideCtx(); });

    bindCanvas();
    Editor._boundKey = onKeyDown;
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    Editor.mounted = true;
  }

  function setMode(mode) {
    Editor.mode = mode === 'visual' ? 'visual' : 'form';
    const panel = document.getElementById('dialogueGraphMainPanel');
    const formBody = document.getElementById('dialogue-form-mode');
    const visualHint = document.getElementById('dialogue-visual-hint');
    document.querySelectorAll('[data-dlg-mode]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-dlg-mode') === Editor.mode);
    });

    if (Editor.mode === 'visual') {
      mount();
      if (panel) {
        panel.style.display = 'flex';
        panel.classList.add('is-visible');
      }
      if (formBody) formBody.style.display = 'none';
      if (visualHint) visualHint.style.display = 'block';
      if (typeof root.setMainWorkspaceMode === 'function') {
        root.setMainWorkspaceMode('dialogues');
      }
      refresh();
    } else {
      persistViewport(false);
      if (panel) {
        panel.style.display = 'none';
        panel.classList.remove('is-visible');
      }
      if (formBody) formBody.style.display = '';
      if (visualHint) visualHint.style.display = 'none';
      if (typeof root.setMainWorkspaceMode === 'function') {
        root.setMainWorkspaceMode('dialogues-form');
      }
      if (typeof root.renderDialoguesEditor === 'function') {
        root.renderDialoguesEditor();
      }
    }
  }

  function setDialogue(id) {
    if (Editor.dialogueId && Editor.dialogueId !== id) {
      persistViewport(false);
    }
    Editor.dialogueId = id || null;
    Editor.selectedNodeId = null;
    Editor.selectedEdge = null;
    Editor.undoStack = [];
    Editor.redoStack = [];
    const dlg = findDialogue(Editor.dialogueId);
    loadViewport(dlg);
    if (Editor.mode === 'visual') refresh();
  }

  function refresh() {
    if (!Editor.mounted && Editor.mode === 'visual') mount();
    const dlg = findDialogue(Editor.dialogueId);
    if (Editor.els.empty) {
      Editor.els.empty.style.display = dlg && Object.keys(dlg.nodes || {}).length ? 'none' : 'flex';
    }
    renderAll();
  }

  function getMode() {
    return Editor.mode;
  }

  root.AmiantoDialogueGraphEditor = {
    mount: mount,
    setMode: setMode,
    getMode: getMode,
    setDialogue: setDialogue,
    refresh: refresh,
    validate: runValidate,
    fitView: fitView,
    centerView: centerView,
    addNode: addNode,
    focusNode: focusNode
  };
})(typeof window !== 'undefined' ? window : globalThis);
