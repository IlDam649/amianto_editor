# Manual verification — Amianto Editor

Automated smoke tests cover pure helpers and serialization. The following require the editor / playtest / export UI.

## Prerequisites

1. `npm start` (Electron) or open `index.html` in a supported environment.
2. Open or create a small project with at least two rooms, one inventory item, one dialogue, and a player character.

## Game save / load

| # | Steps | Expected |
|---|--------|----------|
| 1 | Playtest → move to room A → `save_game(1, "A")` | Log success; `get_save_info(1)` shows room A |
| 2 | Go to room B → `load_game(1)` | Back in room A; no `on_game_start` / `on_room_change` side effects beyond restore |
| 3 | Pick up item → `save_game(2)` → drop / clear → `load_game(2)` | Item restored in inventory |
| 4 | Hide/move object or hotspot → save → change room → load | Object/hotspot state restored |
| 5 | Move player → save → load | Position/direction restored |
| 6 | `set_var("flag", true)` → save → change var → load | Flag restored |
| 7 | Save in room A, walk to B, load | Restores A without room scripts |
| 8 | `save_game(1)` and `save_game(2)` → `delete_save(1)` → `get_save_info()` | Slot 2 intact; slot 1 gone |
| 9 | `delete_save()` with no arg | Error `slot_required`, no deletion |
| 10 | Corrupt a localStorage key under `amianto-gamesave:v1:` → `load_game` | Error, no crash |
| 11 | Export standalone HTML → repeat save/load in browser | Same behavior as playtest |

**Storage note:** Saves use browser `localStorage` (~5MB typical). Quota errors surface as `"Storage quota exceeded..."`. Saves are **not** stored in `.amnt` project files.

## Editor autosave

| # | Steps | Expected |
|---|--------|----------|
| 1 | Edit a room / script | Header: `Unsaved changes` |
| 2 | Wait ~45s (or debounce 2.5s with linked `.amnt`) | `Autosaving…` then `Saved to cache` or `Saved to disk` |
| 3 | Without linked `.amnt` | Status shows cache, not disk |
| 4 | With linked `.amnt`, simulate write failure | `Disk save failed (cache OK)`; reload still warns via beforeunload if dirty |
| 5 | Edit a dialogue only | Marks dirty / triggers autosave path |

## Dialogue logic

| # | Steps | Expected |
|---|--------|----------|
| 1 | Choice with `condition: {"type":"has_item","itemId":"..."}` without item | Choice hidden |
| 2 | Give item, reopen dialogue | Choice appears |
| 3 | Mark choice **Once only**, select it, reopen dialogue | Choice gone for session |
| 4 | `save_game` after once-only → new playtest session → `load_game` | Choice still consumed |
| 5 | Jump node to another line | Continues without duplicating content |
| 6 | Action node / option actions (`set_var`, `add_item`, …) | GameAPI effects apply |
| 7 | Accidental jump cycle | Runtime stops (visit/MAX_STEPS warning), UI not frozen |
| 8 | Old dialogue (line/choice/end only) | Still runs unchanged |

## Visual Dialogue Editor

| # | Steps | Expected |
|---|--------|----------|
| 1 | Scripts → Dialogues → open a legacy dialogue → **Visual** | Nodes appear; auto-layout if no `ui`; Form still shows same data |
| 2 | Switch **Form** ↔ **Visual**, edit text in one mode, switch | Same dialogue object; changes visible in the other mode |
| 3 | Add Line / Choice / End, connect ports, set start | Graph updates; Validate reports OK or clear warnings |
| 4 | Choice option: set condition + once in inspector | Badges on node; data matches form JSON fields |
| 5 | Add Action + Jump, wire them, Save Project, reopen `.amnt` | Positions (`ui`) and graph logic restored |
| 6 | Duplicate a node | New ids; links on the clone are independent |
| 7 | Validate with broken `next` | Status shows errors; project still savable |
| 8 | Playtest `start_dialogue("…")` | Same runtime behaviour as form-built dialogues |
| 9 | Export standalone HTML → run dialogue | Behaviour unchanged; layout metadata ignored by runtime |
| 10 | Pan/zoom only (no node edit) | Viewport stored in `dialogue.editor`; heavy dirty spam avoided |
| 11 | Line: set mood + portrait (Browse) or character portrait map | Playtest balloon shows portrait + mood label |
| 12 | Choice condition: build nested `and` / `or` / `not` in Visual | Same declarative objects as runtime; choices hide correctly |
| 13 | Visual → **Preview** | Play Test opens/focuses and runs `start_dialogue` for the active dialogue |
| 14 | Action `run_script`: type API names in the script box | Same autocomplete hints as Scripts tab (CodeMirror) |
| 15 | Playtest `await show_image("file.png")` (image in Resources) | Fullscreen image; click dismisses; `hide_image()` closes early |

## How to run automated smoke tests

```bash
npm test
```

Covers: JS syntax, save validate/migrate, dialogue conditions/once-only/normalize, `ui`/`editor` roundtrip, dialogue validation, AMNT roundtrip, standalone HTML generation.
