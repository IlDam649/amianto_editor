/**
 * Amianto — dialogue graph validation (editor-time).
 * Distinguishes blocking errors from non-blocking warnings.
 * Reuses AmiantoDialogueLogic for condition/action normalization.
 * Browser: window.AmiantoDialogueValidate | Node: module.exports
 */
(function (root, factory) {
  'use strict';
  function getLogic() {
    if (typeof module !== 'undefined' && module.exports) {
      try {
        return require('./dialogue-logic.js');
      } catch (_) { /* fall through */ }
    }
    if (root && root.AmiantoDialogueLogic) return root.AmiantoDialogueLogic;
    return null;
  }
  const api = factory(getLogic);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.AmiantoDialogueValidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (getLogic) {
  'use strict';

  function issue(severity, code, message, extra) {
    const out = { severity: severity, code: code, message: message };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) {
        out[k] = extra[k];
      });
    }
    return out;
  }

  function getOutgoingTargets(node) {
    const targets = [];
    if (!node || typeof node !== 'object') return targets;
    const type = String(node.type || '').toLowerCase();
    if (type === 'line' || type === 'action') {
      const n = String(node.next || '').trim();
      if (n) targets.push({ kind: 'next', target: n });
    } else if (type === 'jump') {
      const t = String(node.target || node.next || '').trim();
      if (t) targets.push({ kind: 'target', target: t });
    } else if (type === 'choice') {
      const opts = Array.isArray(node.options) ? node.options : [];
      opts.forEach(function (opt, i) {
        const n = String((opt && opt.next) || '').trim();
        if (n) targets.push({ kind: 'option', target: n, optionId: opt && opt.id, optionIndex: i });
      });
    }
    return targets;
  }

  function collectReachable(def) {
    const nodes = (def && def.nodes) || {};
    const start = String((def && def.startNodeId) || '').trim();
    const visited = {};
    if (!start || !nodes[start]) return visited;
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      if (visited[id]) continue;
      visited[id] = true;
      const node = nodes[id];
      getOutgoingTargets(node).forEach(function (edge) {
        if (edge.target && nodes[edge.target] && !visited[edge.target]) {
          stack.push(edge.target);
        }
      });
    }
    return visited;
  }

  /**
   * Detect cycles reachable from start (DFS with recursion stack).
   * Returns list of node ids that participate in at least one cycle.
   */
  function findCycleNodes(def) {
    const nodes = (def && def.nodes) || {};
    const start = String((def && def.startNodeId) || '').trim();
    const cycleIds = {};
    if (!start || !nodes[start]) return [];

    const color = {}; // 0 white, 1 gray, 2 black
    function dfs(id, path) {
      color[id] = 1;
      path.push(id);
      const edges = getOutgoingTargets(nodes[id]);
      for (let i = 0; i < edges.length; i++) {
        const t = edges[i].target;
        if (!t || !nodes[t]) continue;
        if (color[t] === 1) {
          const idx = path.indexOf(t);
          if (idx >= 0) {
            for (let j = idx; j < path.length; j++) cycleIds[path[j]] = true;
          }
          cycleIds[t] = true;
        } else if (color[t] !== 2) {
          dfs(t, path);
        }
      }
      path.pop();
      color[id] = 2;
    }
    dfs(start, []);
    return Object.keys(cycleIds);
  }

  /**
   * @param {object} rawDialogue
   * @param {object} [logic] optional AmiantoDialogueLogic
   * @returns {{ ok: boolean, errors: object[], warnings: object[] }}
   */
  function validateDialogue(rawDialogue, logic) {
    const DL = logic || (typeof getLogic === 'function' ? getLogic() : null) || {};
    const errors = [];
    const warnings = [];

    if (!rawDialogue || typeof rawDialogue !== 'object') {
      errors.push(issue('error', 'invalid_dialogue', 'Dialogue definition is missing or invalid'));
      return { ok: false, errors: errors, warnings: warnings };
    }

    const def = typeof DL.normalizeDialogueDef === 'function'
      ? DL.normalizeDialogueDef(rawDialogue)
      : rawDialogue;

    if (!def || !def.id) {
      errors.push(issue('error', 'invalid_dialogue', 'Dialogue has no valid id'));
      return { ok: false, errors: errors, warnings: warnings };
    }

    const nodes = def.nodes && typeof def.nodes === 'object' ? def.nodes : {};
    const ids = Object.keys(nodes);

    if (!ids.length) {
      errors.push(issue('error', 'empty_graph', 'Dialogue has no nodes', { dialogueId: def.id }));
    }

    const startNodeId = String(def.startNodeId || '').trim();
    if (!startNodeId) {
      errors.push(issue('error', 'missing_start', 'Start node is not set', { dialogueId: def.id }));
    } else if (!nodes[startNodeId]) {
      errors.push(issue('error', 'invalid_start', 'Start node "' + startNodeId + '" does not exist', {
        dialogueId: def.id,
        nodeId: startNodeId
      }));
    }

    // Duplicate option ids within a choice node (node keys are unique by object shape)
    const seenOptionKeys = {};
    ids.forEach(function (nid) {
      const node = nodes[nid];
      if (!node) return;
      const type = String(node.type || '').toLowerCase();

      if (type === 'line' || type === 'action') {
        const next = String(node.next || '').trim();
        if (!next) {
          warnings.push(issue('warning', 'missing_exit', 'Node "' + nid + '" (' + type + ') has no next', {
            nodeId: nid, nodeType: type
          }));
        } else if (!nodes[next]) {
          errors.push(issue('error', 'broken_link', 'Node "' + nid + '" next "' + next + '" does not exist', {
            nodeId: nid, target: next, field: 'next'
          }));
        }
      }

      if (type === 'jump') {
        const target = String(node.target || '').trim();
        if (!target) {
          errors.push(issue('error', 'jump_no_target', 'Jump node "' + nid + '" has no target', {
            nodeId: nid
          }));
        } else if (!nodes[target]) {
          errors.push(issue('error', 'broken_link', 'Jump "' + nid + '" target "' + target + '" does not exist', {
            nodeId: nid, target: target, field: 'target'
          }));
        }
      }

      if (type === 'choice') {
        const opts = Array.isArray(node.options) ? node.options : [];
        if (!opts.length) {
          warnings.push(issue('warning', 'empty_choice', 'Choice node "' + nid + '" has no options', {
            nodeId: nid
          }));
        }
        opts.forEach(function (opt, oi) {
          if (!opt || !opt.id) {
            errors.push(issue('error', 'option_no_id', 'Choice "' + nid + '" option #' + (oi + 1) + ' has no id', {
              nodeId: nid, optionIndex: oi
            }));
            return;
          }
          const okey = nid + '::' + opt.id;
          if (seenOptionKeys[okey]) {
            errors.push(issue('error', 'duplicate_option_id', 'Duplicate option id "' + opt.id + '" in "' + nid + '"', {
              nodeId: nid, optionId: opt.id
            }));
          }
          seenOptionKeys[okey] = true;

          if (!String(opt.text || '').trim()) {
            warnings.push(issue('warning', 'empty_option_text', 'Choice "' + nid + '" option "' + opt.id + '" has empty text', {
              nodeId: nid, optionId: opt.id
            }));
          }

          const next = String(opt.next || '').trim();
          if (!next) {
            warnings.push(issue('warning', 'missing_exit', 'Option "' + opt.id + '" on "' + nid + '" has no next', {
              nodeId: nid, optionId: opt.id
            }));
          } else if (!nodes[next]) {
            errors.push(issue('error', 'broken_link', 'Option "' + opt.id + '" next "' + next + '" does not exist', {
              nodeId: nid, optionId: opt.id, target: next, field: 'next'
            }));
          }

          if (opt.condition != null) {
            if (typeof DL.normalizeCondition === 'function') {
              const nc = DL.normalizeCondition(opt.condition);
              if (!nc) {
                errors.push(issue('error', 'invalid_condition', 'Option "' + opt.id + '" has invalid condition', {
                  nodeId: nid, optionId: opt.id
                }));
              }
            }
          }

          if (opt.actions != null) {
            if (typeof DL.normalizeActions === 'function') {
              const na = DL.normalizeActions(opt.actions);
              if (Array.isArray(opt.actions) && opt.actions.length && !na.length) {
                errors.push(issue('error', 'invalid_actions', 'Option "' + opt.id + '" has invalid actions', {
                  nodeId: nid, optionId: opt.id
                }));
              }
            }
          }
        });
      }

      if (type === 'action' || type === 'line') {
        if (node.actions != null && typeof DL.normalizeActions === 'function') {
          const na = DL.normalizeActions(node.actions);
          if (Array.isArray(node.actions) && node.actions.length && type === 'action' && !na.length) {
            errors.push(issue('error', 'invalid_actions', 'Action node "' + nid + '" has invalid or empty actions', {
              nodeId: nid
            }));
          }
          if (type === 'action' && (!Array.isArray(node.actions) || !node.actions.length)) {
            warnings.push(issue('warning', 'empty_actions', 'Action node "' + nid + '" has no actions', {
              nodeId: nid
            }));
          }
        } else if (type === 'action' && (!Array.isArray(node.actions) || !node.actions.length)) {
          warnings.push(issue('warning', 'empty_actions', 'Action node "' + nid + '" has no actions', {
            nodeId: nid
          }));
        }
      }

      // Validate action required params more strictly when present
      if (Array.isArray(node.actions) && typeof DL.normalizeActions === 'function') {
        node.actions.forEach(function (a, ai) {
          if (!a || typeof a !== 'object') return;
          const normalized = DL.normalizeActions([a]);
          if (!normalized.length) {
            errors.push(issue('error', 'invalid_action_params', 'Node "' + nid + '" action #' + (ai + 1) + ' has missing/invalid params', {
              nodeId: nid, actionIndex: ai
            }));
          }
        });
      }
    });

    // Duplicate node ids: object keys are unique, but node.id may disagree with key
    ids.forEach(function (nid) {
      const node = nodes[nid];
      if (node && node.id && String(node.id) !== String(nid)) {
        errors.push(issue('error', 'id_mismatch', 'Node key "' + nid + '" does not match node.id "' + node.id + '"', {
          nodeId: nid
        }));
      }
    });

    // Check for duplicate ids if nodes were provided as array-like (defensive)
    if (Array.isArray(rawDialogue.nodes)) {
      const seen = {};
      rawDialogue.nodes.forEach(function (n) {
        const id = n && n.id;
        if (!id) return;
        if (seen[id]) {
          errors.push(issue('error', 'duplicate_node_id', 'Duplicate node id "' + id + '"', { nodeId: id }));
        }
        seen[id] = true;
      });
    }

    const reachable = collectReachable(def);
    ids.forEach(function (nid) {
      if (startNodeId && !reachable[nid]) {
        warnings.push(issue('warning', 'unreachable', 'Node "' + nid + '" is not reachable from start', {
          nodeId: nid
        }));
      }
    });

    const cycleNodes = findCycleNodes(def);
    if (cycleNodes.length) {
      warnings.push(issue('warning', 'cycle', 'Possible cycle involving: ' + cycleNodes.join(', '), {
        nodeIds: cycleNodes
      }));
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  /**
   * Deep-clone a dialogue def and assign new ids for a duplicated subgraph/node.
   * Used by the visual editor; keeps option ids unique within the new node.
   */
  function duplicateNodeWithNewIds(node, uidFn) {
    const makeId = typeof uidFn === 'function' ? uidFn : function (p) {
      return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    };
    if (!node || typeof node !== 'object') return null;
    const type = String(node.type || 'end').toLowerCase();
    const prefix = type === 'line' ? 'ln' : type === 'choice' ? 'ch' : type === 'jump' ? 'jmp' : type === 'action' ? 'act' : 'end';
    const newId = makeId(prefix);
    const clone = JSON.parse(JSON.stringify(node));
    clone.id = newId;
    if (type === 'choice' && Array.isArray(clone.options)) {
      clone.options.forEach(function (opt) {
        if (opt) opt.id = makeId('opt');
      });
    }
    if (clone.ui) {
      clone.ui = {
        x: Number(clone.ui.x) + 40,
        y: Number(clone.ui.y) + 40
      };
    }
    return clone;
  }

  return {
    validateDialogue: validateDialogue,
    getOutgoingTargets: getOutgoingTargets,
    collectReachable: collectReachable,
    findCycleNodes: findCycleNodes,
    duplicateNodeWithNewIds: duplicateNodeWithNewIds
  };
});
