# Proposed architecture — Visual Dialogue Editor

**Status:** design only. Do not implement until approved.  
**Constraint:** the visual editor must **not** create a second dialogue execution engine. Playtest and standalone export continue to use `runDialogueGraph` in `JS/runtime.js`.

## Goals

- Edit the same `project.dialogues` graph already used by the form editor and runtime.
- Preserve stable node and option IDs so once-only keys (`dialogueId::optionId`) remain valid across edits.
- Keep the form-based editor working until the visual editor reaches feature parity for load/edit/save.

## Non-goals (first visual release)

- Separate runtime / preview sandbox with different APIs.
- Arbitrary JavaScript in node conditions or actions (continue using the declarative condition/action model).
- Simultaneous multi-user editing.

## Data model (shared)

Unchanged root shape:

```text
project.dialogues[] = {
  id, name, startNodeId,
  nodes: { [nodeId]: DialogueNode }
}
```

Node types (already in runtime / form editor):

| Type | Purpose |
|------|---------|
| `line` | Speaker + text + optional `actions` + `next` |
| `choice` | `options[]` with `id`, `text`, `next`, optional `once`, `condition`, `actions` |
| `jump` | `target` node id |
| `action` | declarative `actions[]` + `next` |
| `end` | terminate session |

Optional future visual-only presentation fields (must be ignored by runtime if unknown):

- `ui: { x, y }` — canvas layout positions
- `ui: { color, collapsed }` — cosmetic

Normalization must continue to live in `JS/lib/dialogue-logic.js` so editor, runtime, and tests share one schema.

## UI layout

```text
+------------------------------------------------------------------+
| Toolbar: dialogue select | + Dialogue | Validate | Preview       |
+------------------+---------------------------+-------------------+
| Palette          | Graph canvas              | Inspector         |
| - Line           | (pan / zoom)              | Selected node /   |
| - Choice         | nodes + bezier edges      | option fields     |
| - Jump           |                           |                   |
| - Action         |                           |                   |
| - End            |                           |                   |
+------------------+---------------------------+-------------------+
| Status: validation warnings / start node / unsaved               |
+------------------------------------------------------------------+
```

### Canvas

- CSS transform or lightweight canvas for pan/zoom.
- Nodes as DOM cards (easier inspector binding) or drawn boxes; prefer DOM for accessibility.
- Edges from output ports (`next` / option `next` / jump `target`) to target node.
- Mark `startNodeId` with a distinct badge; allow “Set as start”.

### Node inspector

Mirrors form fields:

- Line: speaker, text, next, actions JSON (or structured rows).
- Choice: list of options with once, condition builder, actions, next.
- Jump: target picker (dropdown of node ids).
- Action: action list builder + next.
- End: no fields.

### Condition / action builders

Replace raw JSON for common cases with small forms that emit the same declarative objects:

- Conditions: `has_item`, `var` ops, `and` / `or` / `not`
- Actions: `set_var`, `add_item`, `remove_item`, `set_object_visible`

Advanced users may still edit JSON. No `eval` / `new Function`.

## Interactions

- Click select; Shift/Ctrl multi-select; Delete removes nodes and clears dangling refs to deleted ids.
- Drag from port to node creates/updates `next` or `target`.
- Double-click node focuses inspector text field.
- Undo/redo stack scoped to the active dialogue (optional in v1; can ship without).

## Validation (editor-time)

Shared helper (extend `dialogue-logic.js` or add `dialogue-validate.js`):

- Missing `startNodeId` or start not in `nodes`
- Broken `next` / `target` references
- Choice options without `id` or empty text (warning)
- Jump cycles / strongly connected components → warning (runtime already has MAX_STEPS / visit caps)
- Unused nodes → info

Show results in the status bar; block Preview only on hard errors (missing start).

## Preview mode

- Button **Preview** opens playtest-like mini runner **or** reuses existing runtime iframe with a temporary script `start_dialogue(id)`.
- Must call the real `GameAPI.start_dialogue` / `runDialogueGraph`.
- No duplicate dialogue walker in the editor.

## Serialization

1. Visual layout → mutate in-memory `window.projectDialogues` (same as form editor).
2. On project save → `serializeDialogues()` → `normalizeDialogueDef` → `.amnt`.
3. `ui` layout fields: either stripped on export to runtime (keep only in editor cache) **or** stored in project as optional ignored fields. Prefer storing `ui` in project so positions survive reload; runtime normalizer already drops unknown keys only if we explicitly allow `ui` passthrough on serialize for editor roundtrip.

**Recommendation:** keep `node.ui = { x, y }` in `.amnt`; runtime `normalizeNode` ignores `ui`.

## Migration path

1. Ship visual editor behind a toggle (“Form” | “Graph”) reading/writing the same dialogue object.
2. When opening a dialogue without `ui` positions, auto-layout (layered / simple grid).
3. Deprecate form editor only after parity checklist passes (conditions, once, jump, action, start node, validation).

## Implementation sketch (future)

| Piece | Suggested location |
|-------|--------------------|
| Graph view | `JS/dialogue-graph-editor.js` (new) |
| Shared normalize/validate | `JS/lib/dialogue-logic.js` (extend) |
| Mount point | Scripts tab panel beside current form |
| Dirty flag | existing `markAmiantoProjectDirty()` |

Avoid large edits to `JS/main.js` beyond a thin mount/unmount hook.

## Out of scope until later

- Mood / portraits / voice lines
- Localisation keys
- Sub-dialogues as separate assets with cross-file references
- Collaborative cursors
