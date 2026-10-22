/**
 * Amianto — pure helpers for game save format (amianto-save).
 * Usable in browser (window.AmiantoGameSave) and Node (module.exports).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.AmiantoGameSave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GAME_SAVE_FORMAT = 'amianto-save';
  const GAME_SAVE_VERSION = 1;
  const GAME_SAVE_MAX_SLOTS = 10;
  const GAME_SAVE_KEY_PREFIX = 'amianto-gamesave:v1:';

  function normalizeGameSaveSlot(slot, options) {
    const opts = options || {};
    const requireExplicit = opts.requireExplicit === true;
    if (slot == null || slot === '') {
      if (requireExplicit) {
        throw new Error('save slot is required');
      }
      return '1';
    }
    if (typeof slot === 'number' && Number.isFinite(slot)) {
      const n = Math.floor(slot);
      if (n < 1 || n > GAME_SAVE_MAX_SLOTS) {
        throw new Error('save slot must be 1–' + GAME_SAVE_MAX_SLOTS);
      }
      return String(n);
    }
    const s = String(slot).trim();
    if (!s) {
      if (requireExplicit) {
        throw new Error('save slot is required');
      }
      return '1';
    }
    const asNum = Number(s);
    if (Number.isFinite(asNum) && String(asNum) === s) {
      const n = Math.floor(asNum);
      if (n < 1 || n > GAME_SAVE_MAX_SLOTS) {
        throw new Error('save slot must be 1–' + GAME_SAVE_MAX_SLOTS);
      }
      return String(n);
    }
    return s.slice(0, 64);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Structural validation for amianto-save payloads.
   * @returns {{ ok: true, data: object } | { ok: false, error: string }}
   */
  function validateGameSavePayload(data) {
    if (!isPlainObject(data)) {
      return { ok: false, error: 'Save payload must be an object' };
    }
    if (data.format !== GAME_SAVE_FORMAT) {
      return { ok: false, error: 'Unrecognized save format' };
    }
    if (typeof data.version !== 'number' || !Number.isFinite(data.version)) {
      return { ok: false, error: 'Save version missing or invalid' };
    }
    if (data.version < 1) {
      return { ok: false, error: 'Save version too old: ' + data.version };
    }
    if (!isPlainObject(data.state)) {
      return { ok: false, error: 'Save state missing or invalid' };
    }
    const st = data.state;
    if (st.currentRoomId != null && typeof st.currentRoomId !== 'string' && typeof st.currentRoomId !== 'number') {
      return { ok: false, error: 'Invalid currentRoomId' };
    }
    if (st.variables != null && !isPlainObject(st.variables)) {
      return { ok: false, error: 'Invalid variables map' };
    }
    if (st.inventory != null) {
      if (!isPlainObject(st.inventory)) {
        return { ok: false, error: 'Invalid inventory' };
      }
      if (st.inventory.contents != null && !isPlainObject(st.inventory.contents)) {
        return { ok: false, error: 'Invalid inventory.contents' };
      }
    }
    if (st.characters != null && !Array.isArray(st.characters)) {
      return { ok: false, error: 'Invalid characters list' };
    }
    if (st.rooms != null && !isPlainObject(st.rooms)) {
      return { ok: false, error: 'Invalid rooms snapshot' };
    }
    if (st.dialogueConsumed != null && !Array.isArray(st.dialogueConsumed)) {
      return { ok: false, error: 'Invalid dialogueConsumed list' };
    }
    return { ok: true, data: data };
  }

  /**
   * Migrate older save payloads to the current version.
   * v1 is identity; unknown future versions are rejected.
   */
  function migrateGameSave(data) {
    const validated = validateGameSavePayload(data);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    const payload = validated.data;
    if (payload.version > GAME_SAVE_VERSION) {
      throw new Error(
        'Save version ' + payload.version + ' is newer than supported (' + GAME_SAVE_VERSION + ')'
      );
    }
    // Future: if (payload.version === 1) { ... migrate to 2 ... }
    const out = Object.assign({}, payload);
    out.version = GAME_SAVE_VERSION;
    out.format = GAME_SAVE_FORMAT;
    if (!out.state || typeof out.state !== 'object') {
      out.state = {};
    }
    if (!Array.isArray(out.state.dialogueConsumed)) {
      out.state.dialogueConsumed = Array.isArray(payload.state.dialogueConsumed)
        ? payload.state.dialogueConsumed.slice()
        : [];
    }
    return out;
  }

  function sanitizeProjectId(id) {
    return String(id || 'default').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'default';
  }

  function buildStorageKey(projectId, slot) {
    return GAME_SAVE_KEY_PREFIX + sanitizeProjectId(projectId) + ':' + normalizeGameSaveSlot(slot);
  }

  return {
    GAME_SAVE_FORMAT: GAME_SAVE_FORMAT,
    GAME_SAVE_VERSION: GAME_SAVE_VERSION,
    GAME_SAVE_MAX_SLOTS: GAME_SAVE_MAX_SLOTS,
    GAME_SAVE_KEY_PREFIX: GAME_SAVE_KEY_PREFIX,
    normalizeGameSaveSlot: normalizeGameSaveSlot,
    validateGameSavePayload: validateGameSavePayload,
    migrateGameSave: migrateGameSave,
    sanitizeProjectId: sanitizeProjectId,
    buildStorageKey: buildStorageKey
  };
});
