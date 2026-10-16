/**
 * Amianto — pure dialogue graph helpers (normalize, conditions, once-only, actions schema).
 * Usable in browser (window.AmiantoDialogueLogic) and Node (module.exports).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.AmiantoDialogueLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VAR_OPS = {
    eq: true,
    neq: true,
    gt: true,
    gte: true,
    lt: true,
    lte: true,
    truthy: true,
    falsy: true
  };

  const ACTION_TYPES = {
    set_var: true,
    add_item: true,
    remove_item: true,
    set_object_visible: true,
    run_script: true
  };

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function makeConsumedKey(dialogueId, optionId) {
    return String(dialogueId || '').trim() + '::' + String(optionId || '').trim();
  }

  function normalizeCondition(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || '').toLowerCase();

    if (type === 'has_item') {
      // Keep incomplete drafts (empty itemId) so the Visual inspector dropdown
      // does not snap back to (none) right after selecting has_item.
      const itemId = String(raw.itemId || raw.item || '').trim();
      return { type: 'has_item', itemId: itemId };
    }

    if (type === 'var') {
      const key = String(raw.key || raw.name || '').trim();
      let op = String(raw.op || 'eq').toLowerCase();
      if (!VAR_OPS[op]) op = 'eq';
      const out = { type: 'var', key: key, op: op };
      if (op !== 'truthy' && op !== 'falsy') {
        out.value = raw.value;
      }
      return out;
    }

    if (type === 'and' || type === 'or') {
      const list = Array.isArray(raw.of) ? raw.of : (Array.isArray(raw.conditions) ? raw.conditions : []);
      const of = list.map(normalizeCondition).filter(Boolean);
      // Keep empty group as draft with one leaf so editor can keep editing
      if (!of.length) return { type: type, of: [{ type: 'has_item', itemId: '' }] };
      return { type: type, of: of };
    }

    if (type === 'not') {
      const inner = normalizeCondition(raw.of || raw.condition || raw.not);
      return { type: 'not', of: inner || { type: 'has_item', itemId: '' } };
    }

    return null;
  }

  function normalizeActions(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach(function (a) {
      if (!a || typeof a !== 'object') return;
      const type = String(a.type || '').toLowerCase();
      if (!ACTION_TYPES[type]) return;
      if (type === 'set_var') {
        const key = String(a.key || a.name || '').trim();
        if (!key) return;
        out.push({ type: 'set_var', key: key, value: a.value });
        return;
      }
      if (type === 'add_item' || type === 'remove_item') {
        const itemId = String(a.itemId || a.item || '').trim();
        if (!itemId) return;
        const count = Math.max(1, Math.floor(Number(a.count) || 1));
        out.push({ type: type, itemId: itemId, count: count });
        return;
      }
      if (type === 'set_object_visible') {
        const objectId = String(a.objectId || a.object || a.id || '').trim();
        if (!objectId) return;
        out.push({ type: 'set_object_visible', objectId: objectId, visible: a.visible !== false });
        return;
      }
      if (type === 'run_script') {
        // Inline custom script written in the dialogue editor (not a project script picker).
        const code = String(a.code != null ? a.code : '').trim();
        if (!code) return;
        const handler = String(a.handler || a.handlerName || 'on_dialogue_action').trim() || 'on_dialogue_action';
        const entry = { type: 'run_script', code: code, handler: handler };
        const sid = String(a.id || '').trim();
        if (sid) entry.id = sid;
        out.push(entry);
      }
    });
    return out;
  }

  /**
   * Editor-only layout metadata. Runtime ignores these fields.
   * @returns {{ x: number, y: number }|null}
   */
  function normalizeNodeUi(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw.ui && typeof raw.ui === 'object' ? raw.ui : raw;
    const x = Number(src.x);
    const y = Number(src.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x, y: y };
  }

  /**
   * Editor viewport state on the dialogue root. Runtime ignores this.
   * @returns {{ panX: number, panY: number, zoom: number }|null}
   */
  function normalizeEditorViewport(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const panX = Number(raw.panX);
    const panY = Number(raw.panY);
    let zoom = Number(raw.zoom);
    if (!Number.isFinite(panX) || !Number.isFinite(panY)) return null;
    if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1;
    if (zoom < 0.2) zoom = 0.2;
    if (zoom > 3) zoom = 3;
    return { panX: panX, panY: panY, zoom: zoom };
  }

  function attachNodeUi(node, src) {
    if (!node || !src) return node;
    const ui = normalizeNodeUi(src);
    if (ui) node.ui = ui;
    return node;
  }

  function normalizeOption(opt, index) {
    if (!opt || typeof opt !== 'object') return null;
    const id = String(opt.id || ('opt_' + index)).trim();
    if (!id) return null;
    const out = {
      id: id,
      text: String(opt.text != null ? opt.text : '').trim(),
      next: String(opt.next || '').trim()
    };
    if (opt.once === true) out.once = true;
    const cond = normalizeCondition(opt.condition);
    if (cond) out.condition = cond;
    const actions = normalizeActions(opt.actions);
    if (actions.length) out.actions = actions;
    return out;
  }

  function normalizeNode(src, fallbackId) {
    if (!src || typeof src !== 'object') return null;
    const nodeId = String(src.id || fallbackId || '').trim();
    if (!nodeId) return null;
    const type = String(src.type || 'end').toLowerCase();

    if (type === 'line') {
      const node = {
        id: nodeId,
        type: 'line',
        speaker: String(src.speaker || '').trim(),
        text: String(src.text != null ? src.text : ''),
        next: String(src.next || '').trim()
      };
      const mood = String(src.mood || '').trim();
      if (mood) node.mood = mood;
      const portrait = String(src.portrait || src.portraitImage || '').trim();
      if (portrait) node.portrait = portrait;
      const actions = normalizeActions(src.actions);
      if (actions.length) node.actions = actions;
      return attachNodeUi(node, src);
    }

    if (type === 'choice') {
      const options = Array.isArray(src.options)
        ? src.options.map(normalizeOption).filter(Boolean)
        : [];
      return attachNodeUi({ id: nodeId, type: 'choice', options: options }, src);
    }

    if (type === 'jump') {
      return attachNodeUi({
        id: nodeId,
        type: 'jump',
        target: String(src.target || src.next || '').trim()
      }, src);
    }

    if (type === 'action') {
      const node = {
        id: nodeId,
        type: 'action',
        next: String(src.next || '').trim(),
        actions: normalizeActions(src.actions)
      };
      return attachNodeUi(node, src);
    }

    return attachNodeUi({ id: nodeId, type: 'end' }, src);
  }

  function normalizeDialogueDef(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const name = String(raw.name || id).trim() || id;
    const nodesIn = (raw.nodes && typeof raw.nodes === 'object') ? raw.nodes : {};
    const nodes = {};
    Object.keys(nodesIn).forEach(function (nid) {
      const n = normalizeNode(nodesIn[nid], nid);
      if (n) nodes[n.id] = n;
    });
    let startNodeId = String(raw.startNodeId || '').trim();
    if (!startNodeId || !nodes[startNodeId]) {
      const keys = Object.keys(nodes);
      startNodeId = keys.length ? keys[0] : '';
    }
    const out = { id: id, name: name, startNodeId: startNodeId, nodes: nodes };
    const editor = normalizeEditorViewport(raw.editor);
    if (editor) out.editor = editor;
    return out;
  }

  function compareValues(left, op, right) {
    if (op === 'truthy') return !!left;
    if (op === 'falsy') return !left;
    if (op === 'eq') return left === right || String(left) === String(right);
    if (op === 'neq') return !(left === right || String(left) === String(right));
    const ln = Number(left);
    const rn = Number(right);
    if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
    if (op === 'gt') return ln > rn;
    if (op === 'gte') return ln >= rn;
    if (op === 'lt') return ln < rn;
    if (op === 'lte') return ln <= rn;
    return false;
  }

  /**
   * @param {object|null} condition
   * @param {{ hasItem: function, getVar: function }} ctx
   */
  function evaluateCondition(condition, ctx) {
    if (!condition) return true;
    const api = ctx || {};
    const type = condition.type;

    if (type === 'has_item') {
      if (typeof api.hasItem !== 'function') return false;
      return !!api.hasItem(condition.itemId);
    }

    if (type === 'var') {
      const value = typeof api.getVar === 'function' ? api.getVar(condition.key) : undefined;
      return compareValues(value, condition.op, condition.value);
    }

    if (type === 'and') {
      const list = Array.isArray(condition.of) ? condition.of : [];
      for (let i = 0; i < list.length; i++) {
        if (!evaluateCondition(list[i], api)) return false;
      }
      return list.length > 0;
    }

    if (type === 'or') {
      const list = Array.isArray(condition.of) ? condition.of : [];
      for (let i = 0; i < list.length; i++) {
        if (evaluateCondition(list[i], api)) return true;
      }
      return false;
    }

    if (type === 'not') {
      return !evaluateCondition(condition.of, api);
    }

    return true;
  }

  /**
   * Filter choice options by condition + once-only consumed set.
   */
  function filterChoiceOptions(options, dialogueId, consumedSet, ctx) {
    const list = Array.isArray(options) ? options : [];
    const consumed = consumedSet || null;
    return list.filter(function (opt) {
      if (!opt || !opt.id) return false;
      if (opt.once === true && consumed) {
        const key = makeConsumedKey(dialogueId, opt.id);
        if (consumed.has && consumed.has(key)) return false;
        if (!consumed.has && Array.isArray(consumed) && consumed.indexOf(key) >= 0) return false;
      }
      if (opt.condition) {
        return evaluateCondition(opt.condition, ctx);
      }
      return true;
    });
  }

  function isOptionSelectable(opt, dialogueId, consumedSet, ctx) {
    if (!opt || !opt.id) return false;
    return filterChoiceOptions([opt], dialogueId, consumedSet, ctx).length === 1;
  }

  return {
    ACTION_TYPES: ACTION_TYPES,
    VAR_OPS: VAR_OPS,
    makeConsumedKey: makeConsumedKey,
    normalizeCondition: normalizeCondition,
    normalizeActions: normalizeActions,
    normalizeOption: normalizeOption,
    normalizeNode: normalizeNode,
    normalizeNodeUi: normalizeNodeUi,
    normalizeEditorViewport: normalizeEditorViewport,
    normalizeDialogueDef: normalizeDialogueDef,
    evaluateCondition: evaluateCondition,
    filterChoiceOptions: filterChoiceOptions,
    isOptionSelectable: isOptionSelectable,
    compareValues: compareValues
  };
});
