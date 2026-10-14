# Checklist tecnica — Unificazione API Editor ↔ Runtime

**Obiettivo:** una sola superficie API usabile da Play Test (`main.js` → iframe `runtime.js`), `runtime.html` standalone e documentazione (`README.md` / esempi script).

**Stato (luglio 2026):** Fasi **A**, **B**, **C** e pulizia **D** (parziale) completate in `runtime.js`. Editor **offline**; script sandbox in `runtime-sandbox.html` (iframe) o `runtime.html` (Play Test window). Residuo: test manuali Fase E (checklist sotto).

---

## Architettura attuale vs target

```mermaid
flowchart TB
  subgraph editor [main.js - Editor]
    CM[CodeMirror GAME_API_COMPLETIONS]
    SER[serializeProject]
    PT[Play Test - executeScriptInSandbox]
    GEDIT[window.Game - tab Variables UI]
  end

  subgraph iframe [runtime.js - Iframe sandbox]
    CS[compileScript]
    ESH[executeScriptHandler]
    GA[GameAPI + window.* parziali]
    GS[gameState.variables Map]
  end

  PT -->|postMessage RUN_SCRIPT| ESH
  ESH --> CS
  CM -.->|allineato a getScriptApiBindings| GA
  GEDIT -.->|variabili UI; runtime ha gameState.variables| GS
```

**Target:**

```mermaid
flowchart TB
  BIND[SCRIPT_API_BINDINGS - runtime.js]
  GA[GameAPI unico]
  CS[compileScript / executeScript]
  WIN[exposeScriptGlobals - window]

  BIND --> CS
  GA --> BIND
  GA --> WIN
  CS -->|handler con with scriptScope| ESH[executeScriptHandler]
```

---

## Matrice API — dove vive oggi e cosa fare

Legenda azione:
- **Portare** → implementare in `runtime.js` (adattando a `gameState` / canvas)
- **Alias** → esporre nome documentato che delega a implementazione esistente
- **Rimuovere** → eliminare duplicato morto in `main.js` dopo migrazione
- **Tenere editor** → resta solo per editing canvas, non per Play Test

| API | `GameAPI` | `getScriptApiBindings()` | `buildHandlerExecutionScope()` | Note |
|-----|-----------|------------------------|--------------------------------|------|
| `print`, `show_message` / `showText` | ✅ | ✅ | ✅ | |
| `move_object`, oggetti spawn/rotate/scale/visible | ✅ | ✅ | ✅ | |
| `enableObject` / `disableObject`, hotspot enable/disable | ✅ | ✅ | ✅ | |
| Inventario + `get/set/clear_carried_item` | ✅ | ✅ | ✅ | `gameState.inventory` |
| `load_room`, `get_current_room`, `get_room_objects`, `set_room_background` | ✅ | ✅ | ✅ | |
| `get_var` / `set_var` / `has_var` / `toggle_var`, `Game.getVar` | ✅ | ✅ | ✅ | `Game` = `GameAPI` |
| Personaggi (spawn, walk, `play_character_animation`, …) | ✅ | ✅ | ✅ | |
| Animazioni stanza (`play_animation`, `stop_animation`) | ✅ | ✅ | ✅ | |
| Audio (`play_music`, `play_sound`, …) | ✅ | ✅ | ✅ | |
| Dialoghi (`show_dialogue`, `end_dialogue`, `start_dialogue`, …) | ✅ | ✅ | ✅ | |
| Save gioco (`save_game`, `load_game`, `delete_save`, `get_save_info`) | ✅ | ✅ | ✅ | localStorage per projectId |
| Handler `on_*` (8 eventi) | ✅ | compile + scope | ✅ | `SUPPORTED_SCRIPT_HANDLERS` |
| `sandboxApi` in `main.js` | — | — | — | **Rimosso** (Fase D) |

---

## Dialoghi — runtime (maggio 2026)

- [x] `GameAPI.show_dialogue(characterIdOrName, text)` — coda comandi, balloon segue personaggio
- [x] `show_dialogue_text(text, speaker)` — alias roadmap
- [x] `end_dialogue()` — chiude balloon e abortisce sessione grafo
- [x] `start_dialogue(idOrName)` — grafo `project.dialogues` (line/choice/end); playtest + export
- [x] Rendering da prima GUI `DialogBox` (colori, `balloon` asset, `appear`)
- [x] `getScriptApiBindings()` + `GAME_API_COMPLETIONS` in `main.js`
- [ ] Editor nodi visuale, condizioni, mood/relazioni — backlog

**Setup progetto:** tab GUI → tipo **DialogBox** → colori / immagine balloon.

**Esempio:**

```javascript
function on_character_click(character_id) {
  show_dialogue(character_id, "Buongiorno!");
}
```

---

## Animazioni personaggi — editor ↔ runtime

### Editor (`index.html` + `main.js`)
- **Walking (standard):** `character.directions` — 8 direzioni, frame, FPS, mirror.
- **Custom:** `character.animations[nome].directions` — stessa struttura; nome scelto dall’utente (non usare `walking`).
- UI: selettore Animation, pulsanti **+** / **−**, serializzazione in `serializeCharacters()`.

### Runtime (`runtime.js`)
- Caricamento: `loadCharacterDefinitions()` → `charDef.directions` + `charDef.animations`.
- Preload asset: frame in `directions` e in ogni `animations[*].directions`.
- Game loop: se `character.playingAnimation`, avanza frame da `animations[nome]`; al termine torna idle walking.
- Script: `play_character_animation(idOrName, animationName, direction, waitForCompletion?)`.

### Esempio script (Fase E)

```javascript
async function on_object_click(objectId, x, y) {
  await play_character_animation("Hero", "wave", "south");
  show_message("Done!");
}
```

- [ ] Animazione visibile; messaggio dopo il ciclo
- [ ] `walk_character` interrompe animazione custom in corso

---

## Animazioni stanza (background / foreground) — editor ↔ runtime

### Editor (`index.html` + `main.js`)
- Tab **Animations** (`Ctrl+5`): catalogo globale `roomAnimationsCatalog` — nome, frame, FPS, layer (`background` | `foreground`), loop default, preview canvas.
- Tab **Rooms → Room Animations**: istanze per stanza (`animationInstances[]`) — `animationId`, `name`, `x`, `y`, `layer`, `visible`, `autoPlay`.
- Primo frame trascinabile sul canvas (come scene objects).
- Serializzazione: `project.roomAnimations[]` + `rooms[].animationInstances[]` in `serializeProject()`.

### Runtime (`runtime.js`)
- Caricamento: `loadRoomAnimationDefinitions(projectData.roomAnimations)` → `gameState.roomAnimationDefinitions`.
- `changeRoom`: costruisce `currentRoom.animationInstances` con stato playback (`currentFrame`, `frameTime`, `playing`).
- Render: layer background dopo sfondo, layer foreground dopo scene objects.
- Game loop: `updateRoomAnimationInstance()` (stessa logica loop di `parseAudioLoopOption`).
- Script: `play_animation(instanceIdOrName, loop?)`, `stop_animation(instanceIdOrName?)`.

### Esempio script (Fase E)

```javascript
function on_room_change(oldRoom, newRoom) {
  play_animation("waterfall_main", true);
}

function on_hotspot_click(hotspotId) {
  play_animation("torch_flicker", false);
}
```

- [ ] Animazione visibile in play test (autoPlay o `play_animation`)
- [ ] Layer background dietro oggetti; layer foreground davanti
- [ ] `stop_animation()` ferma il ciclo frame

---

## File per file

### 1. `JS/runtime.js` (priorità massima)

#### 1.1–1.5 Stato runtime ✅

- [x] `gameState.inventory` — contenuti slot + `carriedItem` (definizioni da `projectData.inventory` al load)
- [x] Modulo inventario su `GameAPI` + use-with (`on_use_with`, `on_inventory_use_with`)
- [x] Oggetti dinamici: spawn/despawn/rotate/scale/visible su `currentRoom.objects`
- [x] `get_room_objects`, `set_room_background`
- [x] Alias variabili: `get_var`, `Game.getVar`, validazione da `projectData.variables` dove disponibile

#### 1.6 `exposeScriptGlobals()` ✅

- [x] Loop su `getScriptApiBindings()`; chiamata dopo init/reset

#### 1.7 Refactor `compileScript` ✅

**Problema:** gli handler sono closure sullo scope del `new Function`; le API devono essere **parametri** della funzione di compilazione, non solo globali (le globali aiutano ma non bastano in strict mode futuro / CSP).

**Implementazione consigliata:**

```javascript
// Esempio struttura (da inserire in runtime.js)

const SCRIPT_API_BINDINGS = [
  { name: 'print', fn: () => GameAPI.print.bind(GameAPI) },
  { name: 'Game', fn: () => GameAPI },
  { name: 'GameAPI', fn: () => GameAPI },
  { name: 'getVariable', fn: () => GameAPI.getVariable.bind(GameAPI) },
  { name: 'setVariable', fn: () => GameAPI.setVariable.bind(GameAPI) },
  { name: 'get_var', fn: () => GameAPI.getVar.bind(GameAPI) },
  // ... tutte le API pubbliche ...
  { name: 'add_to_inventory', fn: () => GameAPI.add_to_inventory.bind(GameAPI) },
  { name: 'spawn_character', fn: () => GameAPI.spawn_character.bind(GameAPI) },
  { name: 'play_character_animation', fn: () => GameAPI.play_character_animation.bind(GameAPI) },
  // handler names NON vanno qui — gestiti a parte come ora
];

function buildScriptFunction(scriptBody, options) {
  const { handlerNames = [], useNoOpHandlers = false } = options;
  const apiParams = SCRIPT_API_BINDINGS.map(b => b.name);
  const handlerParams = handlerNames; // on_game_start, ...
  const params = [...apiParams, ...handlerParams, 'handlerContainer'];

  const fn = new Function(...params, scriptBody);
  const apiArgs = SCRIPT_API_BINDINGS.map(b => b.fn());
  const handlerArgs = handlerNames.map(h =>
    useNoOpHandlers ? createNoOpHandler(h) : GameAPI[h].bind(GameAPI)
  );
  return { fn, args: [...apiArgs, ...handlerArgs, handlerContainer] };
}
```

Checklist (completata — vedi `getScriptApiBindings()` / `buildScriptExecutor()`):

- [x] Fonte unica binding
- [x] `compileScript` / `executeScript` refactor
- [x] Preprocessing async handler + `handlerContainer`

#### 1.8 Handler wrapper — scope API in esecuzione ✅ (Fase C)

- [x] `buildHandlerExecutionScope()` — API da `getScriptApiBindings()` + getter/setter variabili (ricostruito a ogni invocazione)
- [x] `runHandlerWithExecutionScope()` — `with (scriptScope)` senza `handlerFunc.toString()`
- [x] `applyRuntimeContext()` — variabili, stanza, inventario (`UPDATE_CONTEXT` + `RUN_SCRIPT`)
- [x] `INVENTORY_STATE` → editor; `serializeInventoryRuntimeSnapshot` / `applyInventoryRuntimeSnapshot`

#### 1.9 `executeScriptHandler` / `RUN_SCRIPT`

- [x] `RUN_SCRIPT` ignorato se `handlerName` mancante
- [x] `executeScriptInSandbox` invia `scriptName` stabile nel postMessage
- [x] `executeScriptHandler` attende Promise restituite dagli handler

#### 1.10 Reset e load

- [x] `RESET`: clear `gameState.inventory`, `compiledScripts`
- [ ] `initRuntime`: reset inventario da save slot (futuro `load_game`)

---

### 2. `JS/main.js`

#### 2.1 Rimuovere / deprecare codice morto

| Elemento | Righe circa | Azione |
|----------|-------------|--------|
| `const sandboxApi = { ... }` | — | [x] **Rimosso** |
| `executeScriptHandler` stub editor | — | [x] Non presente (solo iframe) |
| `triggerGameEvent` / `gameEventHandlers` editor | — | [ ] Verificare se ancora usati in canvas editor |

#### 2.2 `gameInventory` editor ✅

| Azione | Dettaglio |
|--------|-----------|
| [x] Rimosso `gameInventory`, `persistInventory`, `amiantoGameInventory` da editor |
| [x] Play Test: stato inventario solo in `runtime.js` (`gameState.inventory`) |

#### 2.3 `window.Game` editor (~6953–7022)

- [x] **Tenere** per tab Variables UI in editor
- [x] Play Test: variabili + inventario in `UPDATE_CONTEXT` / `RUN_SCRIPT` context (`buildSandboxContext`)
- [x] Runtime → editor: messaggio `INVENTORY_STATE` dopo mutazioni inventario (iframe + finestra PLAY via `window.opener`)

#### 2.4 Play Test — `executeScriptInSandbox` (~8954–9000)

- [x] `scriptName` stabile nel postMessage
- [x] `UPDATE_CONTEXT` include snapshot inventario (`contents`, `carriedItemKey`)
- [x] Finestra PLAY: `PLAYTEST_RUNTIME_READY` + push contesto; reload mantiene inventario editor
- [x] `on_room_change` allineato in editor e runtime (non più `on_room_enter`)

#### 2.5 CodeMirror hints (~7100)

- [x] `GAME_API_COMPLETIONS` allineato a `getScriptApiBindings()` + 8 handler + `play_animation` / `stop_animation` + alias `Game.*` / `GameAPI.*`

#### 2.6 Serializzazione progetto (~11881)

- [ ] `inventory` nel JSON = definizioni oggetti (nomi), non stato runtime — documentare
- [ ] Futuro: `initialInventory` in progetto o variabile di gioco

---

### 3. `index.html` / `runtime.html` / `runtime-sandbox.html`

- [x] Play Test finestra: `runtime.html` + `JS/runtime.js`
- [x] Sandbox editor: `runtime-sandbox.html` (minimo) + `postMessage` `RUNTIME_READY` / `SANDBOX_PING`
- [x] Stesse API script in iframe e standalone (`getScriptApiBindings`)

---

### 4. Documentazione

| File | Azione |
|------|--------|
| `README.md` | [x] Allineato luglio 2026 (offline, `.amnt`, Electron, API) |
| `ROADMAP.md` | [x] Architettura offline, export desktop editor, stato runtime |
| `JS/docs-panel.js` | [x] Guida in-app: tab Animations, room animations API, runtime-sandbox |
| `# 🎮 Funzioni da Implementare - Amianto editor.md` | [x] Legenda backlog vs ✅ runtime |

---

## Piano `compileScript` — passi implementativi

### Fase A — Infrastruttura (1–2 giorni) ✅ COMPLETATA (maggio 2026)

1. [x] Definire `getScriptApiBindings()` in `runtime.js` (fonte unica binding)
2. [x] Implementare `buildScriptExecutor()` + refactor `compileScript` / `executeScript`
3. [x] Implementare `exposeScriptGlobals()`
4. [x] Smoke `add_to_inventory` — API in `getScriptApiBindings()` (verificare in Fase E)

### Fase B — Port API mancanti ✅ (maggio 2026)

5. [x] Inventario su `gameState.inventory`
6. [x] Oggetti: spawn/despawn/rotate/scale/visible
7. [x] `get_room_objects`, `set_room_background`
8. [x] Alias variabili `get_var` / `Game.getVar`

### Fase C — Scope handler ✅ (maggio 2026)

9. [x] `compileScript` usa `buildScriptExecutor`
10. [x] `executeScript` usa `buildScriptExecutor`
11. [x] Handler wrapper: `buildHandlerExecutionScope` + `runHandlerWithExecutionScope`

### Fase D — Pulizia editor ✅ (maggio 2026)

12. [x] `sandboxApi` rimosso
13. [x] `on_room_change` in Play Test
14. [x] `scriptName` stabile in postMessage (`executeScriptInSandbox`)

### Fase E — Test manuali

Vedi sezione Test sotto.

---

## Dettaglio porting funzioni — `main.js` → `runtime.js`

### Inventario

**Sorgente:** `main.js` 7237–7273, storage 5979–5999

```text
gameState.inventory: Map<string, number>

GameAPI.add_to_inventory(itemId, quantity?)
  → normalizza id, incrementa, log, return count

GameAPI.remove_from_inventory(...)
GameAPI.has_item(itemId) → boolean
GameAPI.get_item_count(itemId) → number
GameAPI.clear_inventory() → true
```

**Non copiare:** `showNotification` — usare `GameAPI.print` o overlay.

### Oggetti

**Sorgente:** `main.js` 7365–7477

**Differenze da gestire:**

| Editor | Runtime |
|--------|---------|
| `sceneObjects` array globale | `gameState.currentRoom.objects` |
| `rotationRad` | verificare se runtime usa gradi o radianti |
| `redraw()` | game loop `render()` automatico |
| placeholder canvas 32×32 | riusare pattern in `renderCharacterPlaceholder` |

### Stanze

**Sorgente:** `get_room_objects` 7300–7313, `set_room_background` 7315–7361

- `get_room_objects`: return plain objects `{ id, name, x, y, visible, ... }`
- `set_room_background`: accetta URL o assetId già in `AssetRegistry`

### Variabili

**Sorgente:** `main.js` 6962–7022, alias sandbox 7480–7491

```javascript
GameAPI.getVar = (key) => GameAPI.getVariable(key);
GameAPI.setVar = (key, val) => { GameAPI.setVariable(key, val); return true; };
// hasVar, toggleVar analoghi
```

Validazione tipo: copiare blocco `gameVariableDefinitions` solo se le definizioni sono caricate in runtime da `projectData.variables`.

---

## Bug noti da includere nel lavoro

| # | Problema | File | Fix |
|---|----------|------|-----|
| 1 | `on_room_enter` vs `on_room_change` | main.js ~9068 | Usare `on_room_change` |
| 2 | `window.Game` senza `getVar` | runtime.js ~3404 | Estendere GameAPI |
| 3 | `sandboxApi` mai usato | main.js 7133+ | Rimuovere |
| 4 | Handler non vedono API non iniettate | compileScript | Bindings + scriptScope |
| 5 | `RUN_SCRIPT` senza `scriptName` stabile | main.js 8987 | Passare nome script editor |

---

## Test di accettazione (Play Test)

Eseguire ogni script come handler globale o su hotspot dopo unificazione.

### Script 1 — Variabili

```javascript
function on_game_start() {
  Game.setVar("intro", true);
  print("intro=", Game.getVar("intro"));
}
```

- [ ] Nessun errore in Script Log
- [ ] Valore visibile in log runtime

### Script 2 — Inventario

```javascript
function on_hotspot_click(hotspotId) {
  add_to_inventory("chiave", 1);
  if (has_item("chiave")) {
    show_message("Hai la chiave!");
  }
}
```

- [ ] `has_item` true dopo click
- [ ] Stato sopravvive tra click (Map runtime)

### Script 3 — Oggetti

```javascript
function on_object_click(objectId, x, y) {
  spawn_object("barile", x + 40, y);
  move_object(objectId, x, y - 20);
}
```

- [ ] Oggetto visibile e cliccabile nel canvas

### Script 4 — Personaggi async

```javascript
async function on_game_start() {
  const id = spawn_character("Eroe", 200, 300, "south");
  await walk_character(id, 400, 300);
  show_message("Arrivato!");
}
```

- [ ] Movimento visibile; messaggio dopo walk

### Script 4b — Animazione custom

Prerequisito: in editor, character `Eroe` (o `Hero`) con animazione custom `wave` e frame per `south`.

```javascript
async function on_hotspot_click(hotspotId) {
  await play_character_animation("Eroe", "wave", "south");
  show_message("Animazione finita");
}
```

- [ ] Ciclo `wave` visibile; posa idle walking dopo
- [ ] Con `await`, `show_message` solo a fine animazione

### Script 4c — Animazione stanza

Prerequisito: in editor, tab **Animations** → animazione con frame; tab **Rooms** → istanza posizionata (nome es. `waterfall_main`).

```javascript
function on_game_start() {
  play_animation("waterfall_main", true);
}

function on_hotspot_click(hotspotId) {
  if (hotspotId === "toggle_water") {
    stop_animation("waterfall_main");
  }
}
```

- [ ] Ciclo frame visibile in play test
- [ ] `stop_animation` ferma l'animazione

### Script 5 — Stanza

```javascript
function on_hotspot_click() {
  load_room("Stanza2");
  print("Oggetti:", get_room_objects().length);
}
```

- [ ] Cambio stanza + log count

---

## Ordine di merge consigliato

1. `SCRIPT_API_BINDINGS` + refactor compile (senza nuove API) — verifica regressioni eventi esistenti  
2. Alias variabili + `get_room_objects`  
3. Inventario runtime  
4. Oggetti runtime  
5. Pulizia `main.js` + fix `on_room_enter`  
6. Aggiornamento README / ROADMAP  

---

## Riferimenti righe codice (snapshot)

| Area | File | Righe |
|------|------|-------|
| `gameState` | runtime.js | 20–40 |
| `compileScript` | runtime.js | 1593–1861 |
| `executeScript` | runtime.js | 1952–2025 |
| `executeScriptHandler` | runtime.js | 2041–2087 |
| `GameAPI` | runtime.js | 2834–3400 |
| Esposizione globale parziale | runtime.js | 3402–3468 |
| `sandboxApi` | main.js | **rimosso** |
| `gameInventory` editor | main.js | **rimosso** |
| `getScriptApiBindings` | runtime.js | ~5341 |
| `window.Game` editor | main.js | 6953–7022 |
| Play Test postMessage | main.js | 8954–9070 |
| CodeMirror API list | main.js | 6040–6047 |
| RUN_SCRIPT handler | runtime.js | 4409–4428 |

---

*Documento generato per il progetto Amianto Editor — unificazione API scripting.*
