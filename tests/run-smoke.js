/**
 * Amianto Editor — minimal smoke tests (no external test framework).
 * Run: npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  OK  ' + msg);
  } else {
    failed += 1;
    console.error('  FAIL  ' + msg);
  }
}

function section(title) {
  console.log('\n== ' + title + ' ==');
}

// --- Syntax check key JS files ---
section('Syntax (node --check)');
const syntaxFiles = [
  'JS/lib/game-save-format.js',
  'JS/lib/dialogue-logic.js',
  'JS/runtime.js',
  'JS/amnt-format.js',
  'JS/export-standalone.js',
  'JS/docs-panel.js'
];
syntaxFiles.forEach((rel) => {
  const full = path.join(ROOT, rel);
  try {
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
    assert(true, rel + ' parses');
  } catch (err) {
    assert(false, rel + ' parse error: ' + (err.stderr ? err.stderr.toString() : err.message));
  }
});

// --- Game save format ---
section('Game save validate / migrate');
const GameSave = require(path.join(ROOT, 'JS/lib/game-save-format.js'));

assert(GameSave.normalizeGameSaveSlot(null) === '1', 'null slot → 1');
assert(GameSave.normalizeGameSaveSlot(3) === '3', 'numeric slot 3');
assert(GameSave.normalizeGameSaveSlot('checkpoint') === 'checkpoint', 'string slot');
try {
  GameSave.normalizeGameSaveSlot(null, { requireExplicit: true });
  assert(false, 'requireExplicit should throw on null');
} catch (e) {
  assert(true, 'requireExplicit throws on null');
}
try {
  GameSave.normalizeGameSaveSlot(99);
  assert(false, 'slot 99 should throw');
} catch (e) {
  assert(true, 'slot 99 out of range throws');
}

const goodSave = {
  format: 'amianto-save',
  version: 1,
  label: 'test',
  savedAt: '2026-01-01T00:00:00.000Z',
  projectId: 'demo',
  state: {
    currentRoomId: 'room1',
    variables: { flag: true },
    inventory: { contents: { key: 1 }, carriedItemKey: null, visible: false },
    characters: [{ name: 'Hero', x: 10, y: 20, direction: 'south', visible: true, roomId: 'room1' }],
    rooms: {},
    dialogueConsumed: ['dlg1::opt_a']
  }
};

const v = GameSave.validateGameSavePayload(goodSave);
assert(v.ok === true, 'valid save passes');

const badFormat = GameSave.validateGameSavePayload({ format: 'other', version: 1, state: {} });
assert(badFormat.ok === false, 'bad format rejected');

const migrated = GameSave.migrateGameSave(goodSave);
assert(migrated.version === 1, 'migrate keeps v1');
assert(Array.isArray(migrated.state.dialogueConsumed), 'migrate keeps dialogueConsumed');
assert(migrated.state.dialogueConsumed[0] === 'dlg1::opt_a', 'dialogueConsumed content preserved');

try {
  GameSave.migrateGameSave({ format: 'amianto-save', version: 99, state: {} });
  assert(false, 'future version should reject');
} catch (e) {
  assert(true, 'future version rejected: ' + e.message);
}

const incomplete = GameSave.validateGameSavePayload({ format: 'amianto-save', version: 1 });
assert(incomplete.ok === false, 'missing state rejected');

// --- Dialogue logic ---
section('Dialogue conditions / once-only / normalize');
const DL = require(path.join(ROOT, 'JS/lib/dialogue-logic.js'));

const legacy = DL.normalizeDialogueDef({
  id: 'dlg_legacy',
  name: 'Legacy',
  startNodeId: 'n1',
  nodes: {
    n1: { id: 'n1', type: 'line', speaker: 'A', text: 'Hi', next: 'n2' },
    n2: {
      id: 'n2',
      type: 'choice',
      options: [
        { id: 'opt_a', text: 'Go', next: 'end' },
        { id: 'opt_b', text: 'Bye', next: 'end' }
      ]
    },
    end: { id: 'end', type: 'end' }
  }
});
assert(legacy && legacy.nodes.n1.type === 'line', 'legacy line preserved');
assert(legacy.nodes.n2.options.length === 2, 'legacy choices preserved');
assert(legacy.nodes.n2.options[0].once !== true, 'legacy options have no once by default');

const withExtras = DL.normalizeDialogueDef({
  id: 'dlg2',
  name: 'Adv',
  startNodeId: 'c1',
  nodes: {
    c1: {
      id: 'c1',
      type: 'choice',
      options: [
        {
          id: 'ask',
          text: 'Ask',
          next: 'j1',
          once: true,
          condition: { type: 'has_item', itemId: 'key' },
          actions: [{ type: 'set_var', key: 'asked', value: true }]
        },
        {
          id: 'need',
          text: 'Need key',
          next: 'end',
          condition: { type: 'not', of: { type: 'has_item', itemId: 'key' } }
        },
        {
          id: 'flag',
          text: 'Flag',
          next: 'end',
          condition: { type: 'var', key: 'met', op: 'truthy' }
        }
      ]
    },
    j1: { id: 'j1', type: 'jump', target: 'act1' },
    act1: {
      id: 'act1',
      type: 'action',
      next: 'end',
      actions: [{ type: 'add_item', itemId: 'coin', count: 1 }]
    },
    end: { id: 'end', type: 'end' }
  }
});
assert(withExtras.nodes.c1.options[0].once === true, 'once flag preserved');
assert(withExtras.nodes.c1.options[0].condition.type === 'has_item', 'condition preserved');
assert(withExtras.nodes.j1.type === 'jump' && withExtras.nodes.j1.target === 'act1', 'jump node');
assert(withExtras.nodes.act1.type === 'action', 'action node');

const inv = new Set(['key']);
const vars = { met: false };
const ctx = {
  hasItem: (id) => inv.has(id),
  getVar: (k) => vars[k]
};

const filtered = DL.filterChoiceOptions(withExtras.nodes.c1.options, 'dlg2', new Set(), ctx);
assert(filtered.some(o => o.id === 'ask'), 'has_item true → ask visible');
assert(!filtered.some(o => o.id === 'need'), 'not has_item → need hidden when has key');
assert(!filtered.some(o => o.id === 'flag'), 'var falsy → flag hidden');

vars.met = true;
const filtered2 = DL.filterChoiceOptions(withExtras.nodes.c1.options, 'dlg2', new Set(), ctx);
assert(filtered2.some(o => o.id === 'flag'), 'var truthy → flag visible');

const consumed = new Set([DL.makeConsumedKey('dlg2', 'ask')]);
const filtered3 = DL.filterChoiceOptions(withExtras.nodes.c1.options, 'dlg2', consumed, ctx);
assert(!filtered3.some(o => o.id === 'ask'), 'once-only consumed hides ask');

assert(
  DL.evaluateCondition(
    { type: 'and', of: [{ type: 'has_item', itemId: 'key' }, { type: 'var', key: 'met', op: 'eq', value: true }] },
    ctx
  ) === true,
  'and condition'
);

assert(
  DL.evaluateCondition(
    { type: 'or', of: [{ type: 'has_item', itemId: 'nope' }, { type: 'var', key: 'met', op: 'truthy' }] },
    ctx
  ) === true,
  'or condition'
);

// Save roundtrip of dialogueConsumed list
section('Save + dialogueConsumed roundtrip');
const savePayload = GameSave.migrateGameSave({
  format: 'amianto-save',
  version: 1,
  state: {
    currentRoomId: 'r',
    variables: {},
    inventory: { contents: {} },
    characters: [],
    rooms: {},
    dialogueConsumed: [DL.makeConsumedKey('dlg2', 'ask'), 'dlg2::other']
  }
});
const json = JSON.stringify(savePayload);
const reloaded = GameSave.migrateGameSave(JSON.parse(json));
assert(reloaded.state.dialogueConsumed.length === 2, 'dialogueConsumed survives JSON roundtrip');
assert(reloaded.state.dialogueConsumed.indexOf('dlg2::ask') >= 0, 'consumed key intact');

// --- AMNT format basic ---
section('AMNT format (load module + package shape)');
const amntSrc = fs.readFileSync(path.join(ROOT, 'JS/amnt-format.js'), 'utf8');
// Evaluate in a sandbox-like global
const amntGlobal = { window: {} };
amntGlobal.window = amntGlobal;
const amntFn = new Function('window', amntSrc + '\n; return window.AmiantoAmnt;');
const AmiantoAmnt = amntFn(amntGlobal);
assert(!!AmiantoAmnt && typeof AmiantoAmnt.createPackage === 'function', 'AmiantoAmnt.createPackage exists');

const projectObj = {
  settings: { name: 'Smoke', id: 'smoke_1', canvasWidth: 800, canvasHeight: 600 },
  rooms: [],
  characters: [],
  dialogues: [legacy],
  scripts: {}
};
const pkg = AmiantoAmnt.createPackage(projectObj, []);
assert(pkg && pkg.format === 'amianto-amnt', 'createPackage format');
const text = AmiantoAmnt.stringify(pkg, false);
const parsed = AmiantoAmnt.parse(text);
assert(parsed && parsed.project && parsed.project.settings.name === 'Smoke', 'AMNT roundtrip name');
assert(
  Array.isArray(parsed.project.dialogues) && parsed.project.dialogues[0].id === 'dlg_legacy',
  'AMNT roundtrip dialogues'
);

// --- Export helper presence ---
section('Standalone export module');
const exportSrc = fs.readFileSync(path.join(ROOT, 'JS/export-standalone.js'), 'utf8');
const exportGlobal = { window: {} };
exportGlobal.window = exportGlobal;
const exportFn = new Function('window', exportSrc + '\n; return window.AmiantoStandaloneExport;');
const Standalone = exportFn(exportGlobal);
assert(!!Standalone && typeof Standalone.buildStandaloneHtml === 'function', 'buildStandaloneHtml exists');
const html = Standalone.buildStandaloneHtml(
  { project: { settings: { name: 'T', canvasWidth: 100, canvasHeight: 100 } }, assets: [] },
  'function initRuntime(){} // stub runtime long enough xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  {}
);
assert(typeof html === 'string' && html.indexOf('amianto-embedded-runtime') >= 0, 'standalone HTML embeds runtime');
assert(html.indexOf('initRuntime') >= 0, 'standalone HTML contains runtime source');

// --- Summary ---
console.log('\n----------------------------------------');
console.log('Passed: ' + passed + '  Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
console.log('All smoke tests passed.');
