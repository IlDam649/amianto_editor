# Visual Dialogue Editor

**Status:** implemented (Amianto Editor 1.0.0).  
**Constraint:** the visual editor does **not** create a second dialogue execution engine. Playtest and standalone export continue to use `runDialogueGraph` in `JS/runtime.js`.

## Goals

- Edit the same `project.dialogues` graph already used by the form editor and runtime.
- Preserve stable node and option IDs so once-only keys (`dialogueId::optionId`) remain valid across edits.
- Keep the form-based editor working alongside the visual editor (shared in-memory model).

## Modes

Under the dedicated **Dialogues** tab (sidebar + main workspace):

| Mode | UI |
|------|-----|
| **Form** | Classic node list in the Dialogues sidebar (unchanged fields). |
| **Visual** | Node canvas in the main workspace (`#dialogueGraphMainPanel`) + inspector. |

Both modes mutate `window.projectDialogues`. Switching modes re-renders from the same objects (no independent copies).

## Data model (shared)

```text
project.dialogues[] = {
  id, name, startNodeId,
  editor?: { panX, panY, zoom },   // editor viewport only
  nodes: { [nodeId]: DialogueNode }
}
```

Node types (runtime / form / visual):

| Type | Purpose |
|------|---------|
| `line` | Speaker + text + optional `actions` + `next` |
| `choice` | `options[]` with `id`, `text`, `next`, optional `once`, `condition`, `actions` |
| `jump` | `target` node id |
| `action` | declarative `actions[]` + `next` |
| `end` | terminate session |

There is **no** `start` node type. The entry point is `startNodeId` (badge **START** in the visual editor). Incoming connections to the start node are refused in the canvas.

### Editor-only metadata

- `node.ui = { x, y }` — canvas layout
- `dialogue.editor = { panX, panY, zoom }` — viewport

Normalized by `JS/lib/dialogue-logic.js` and stored in `.amnt`. The runtime **ignores** these fields (never treated as game logic).

Pan/zoom updates `dialogue.editor` in memory without marking the project dirty on every mouse move; node moves and property edits call `markAmiantoProjectDirty()`.

## Files

| Piece | Location |
|-------|----------|
| Graph view | `JS/dialogue-graph-editor.js` |
| Styles | `CSS/dialogue-graph.css` |
| Normalize (+ `ui` / `editor`) | `JS/lib/dialogue-logic.js` |
| Validate | `JS/lib/dialogue-validate.js` |
| Form + mode hooks | `JS/main.js` (Dialogues tab) |
| Mount | `index.html` (`#dialogueGraphMainPanel`) |

## Canvas features

- Drag nodes; pan (middle mouse / Space+drag / empty background); wheel zoom; Fit / Center
- Toolbar + right-click: add Line / Choice / Jump / Action / End
- Connect output ports → input ports (`next` / option `next` / jump `target`)
- Select nodes and edges; Delete; Duplicate (new ids); Undo/Redo (Ctrl+Z / Ctrl+Y)
- Inspector: structured condition/action builders (no `eval`)
- Action types include `run_script (custom)`: inline JS in a **CodeMirror** editor with the same Game API hints as Scripts; stored as `action.code`; runtime calls `on_dialogue_action(dialogueId, nodeId, optionId)` via the shared sandbox
- Line nodes: optional `mood` + `portrait` (override image); character `portraits` map (mood → image) used as fallback
- Nested condition builder for `and` / `or` / `not` (depth-limited), same declarative schema as runtime
- **Preview** button: opens Play Test and runs real `start_dialogue` (handler `on_dialogue_preview`) — no second dialogue engine
- Validate button (errors vs warnings)
- Visual hints: START badge, once/cond badges on choices, broken edges, unreachable nodes

## Validation

`AmiantoDialogueValidate.validateDialogue(def)` returns `{ ok, errors[], warnings[] }`.

Hard errors include missing start, broken links, jump without target, invalid conditions/actions, duplicate option ids.

Warnings include unreachable nodes, empty option text, missing exits, intentional cycles.

Incomplete dialogues can still be saved; fix errors before playtest/export if you need a runnable graph.

## Preview / playtest

Use existing Play Test with `start_dialogue("name_or_id")`. No separate preview runner.

## Limits (current)

- Localisation keys not supported
- Portrait images are drawn beside the balloon (fixed size); no lip-sync / talking heads
- Nested conditions capped at depth 4 in the visual builder
- Preview requires a playable project (speaker character visible in current room) via Play Test
- Undo stack is scoped to the active dialogue session in the visual editor
- Form mode still uses raw JSON strings for nested conditions/actions (visual mode has builders)

## Manual checks

See [tests/MANUAL.md](../tests/MANUAL.md) section **Visual Dialogue Editor**.
