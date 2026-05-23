<div align="center">
  <table>
    <tr>
      <td align="center" width="220">
        <img src="img/mnt.png" alt="Amianto Editor Cover" width="180" />
      </td>
      <td align="center" width="280" style="vertical-align: middle;">
        <h2 style="font-size: 2.5em; margin: 0; font-weight: bold;">si evolve....</h2>
      </td>
      <td align="center" width="220">
        <img src="img/mnt.png" alt="Amianto Editor" width="180" />
      </td>
    </tr>
  </table>
</div>

# Amianto Editor

Modern web-based point'n'click game editor. Design rooms, place scene objects, draw walkable areas, manage characters and animations, and script behaviors with JavaScript — all in your browser.

## 📚 Documentazione

- 📖 **In-app Docs tab** — full English guide in the editor toolbar (**Docs**, `Ctrl+7`)
- 📄 **[README](README.md)** - Panoramica e guida rapida
- 🗺️ **[ROADMAP](ROADMAP.md)** - Piano di sviluppo completo e stato delle implementazioni
- 🔗 **[API_UNIFICATION_CHECKLIST](API_UNIFICATION_CHECKLIST.md)** - Unificazione API editor ↔ runtime (Fasi A–B)
- 🔥 **[FIRESTORE_SETUP](FIRESTORE_SETUP.md)** - Configurazione Firestore e regole di sicurezza
- 🌐 **[STORAGE_CORS_SETUP](STORAGE_CORS_SETUP.md)** - Configurazione CORS per Firebase Storage

---

## Features (already implemented)

- Rooms Manager
  - Create, rename, delete, and switch rooms
  - Per-room assets: background, foreground layers, scene objects, walkable area
- Canvas Workspace (context-aware)
  - Rooms: renders background, scene objects, foregrounds, walkable overlay
  - Characters: preview animation frames in the main canvas
  - Scripts: editor-focused canvas
  - Canvas controls: zoom in/out, reset to 100%, fit to screen, center view
- Walkable Area (Level Design)
  - Click-to-add polygon vertices (Start/Finish/Clear/Show/Hide)
  - Select/move/delete vertices; per-room shape stored in project state
- Hotspots
  - Create polygonal hotspots; add/finish/clear points; show/hide all
  - Select/move/delete vertices; list and manage hotspots
  - Per-hotspot **Is active?** (clickable in playtest); script API `enableHotspot` / `disableHotspot`
- Scene Objects (Rooms)
  - Add image-based objects; edit name and position; delete
  - List with filtering and type badges
- Foreground Layers
  - Multiple image layers; list and ordering controls
- Characters
  - Create characters; 8-direction setup
  - **Walking** animation: upload frames per direction; FPS control; preview
  - **Custom animations**: named animations (e.g. `wave`, `talk`) with their own 8-direction frames; playable via `play_character_animation()` in scripts
  - Game start configuration: choose starting player, room and position
- Inventory Objects
  - Manage items (upload, filter, edit, delete)
  - Grid size controls (width/height)
- GUI Editor
  - Create GUIs; background images
  - Draw, move and delete buttons; list buttons
- Contextual Cursors
  - Define cursor per target type (hotspot/character/scene object)
  - Upload cursor image, optional action text; list active cursors
- Scripting (JavaScript, Sandboxed Runtime)
  - Built‑in editor (CodeMirror) with syntax highlighting
  - **Event System**: `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`, `on_gui_click()`
  - **Runtime API (Play Test / standalone)**: inventario, oggetti dinamici, stanze, variabili — vedi [Current API Status](#current-api-status)
  - **API unification (Fasi A–B ✅)**: `getScriptApiBindings()` + `buildScriptExecutor()` in `runtime.js`; stesse API in iframe e `runtime.html`
  - **Runtime Sandboxed**: Script execution in isolated iframe with `sandbox="allow-scripts"` for security
  - **GameAPI / `Game`**: API esposte agli script (`print`, `load_room`, `add_to_inventory`, `spawn_object`, `Game.getVar()`, …)
  - **Robust Messaging**: MessageQueue system with buffer, retry mechanism (3 attempts), and console fallback
  - **Script Logging**: Integrated ScriptLogService with timestamped logs and log levels (info, warning, error)
  - Attach scripts to rooms, characters, scene objects, inventory, GUI buttons, hotspots and cursors
  - Save/Load scripts, Run/Stop sandbox
- Play Test Panel
  - Start/Pause/Stop test session; debug console; quick test actions
- Authentication & Projects
  - Login/logout, registration modal, persistent sessions
  - Per-user project storage
- File Menu
  - New/Open/Save/Export, Project Settings, Delete Project
- Standalone Runtime & Play Test
  - `runtime.html` loads and renders exported JSON via `JS/runtime.js`
  - Load JSON file, load last saved (OPFS/localStorage), download JSON
  - Auto-try `game.json` at startup; shows runtime logs
  - **Sandboxed Runtime**: Script execution in isolated iframe during Play Test
  - **GameAPI Integration**: Full API access in runtime with context management (roomId, objectId, variables)
  - **Script Console**: Real-time logging from scripts with level filtering and timestamps
  - **Complete Runtime Rendering**: Rooms, objects, characters (8-direction animations), GUI (backgrounds, buttons)
  - **Click Interactions**: Full hit detection for hotspots, objects, characters, GUI buttons with script execution
  - **Pathfinding & Movement**: Click-to-move player with pathfinding on walkable areas, smooth animations
  - **Room Changes**: Complete room switching system with asset loading and script execution
- Theming
  - Acid dark + neon UI across forms, buttons, lists, dropdowns

## Runtime Features

The runtime system provides a complete game execution environment:

- **✅ Complete Rendering**: Rooms (background, foregrounds, objects), characters with 8-direction animations and scaling, GUI overlays with buttons
- **✅ Click Interactions**: Full hit detection system for hotspots (polygon), objects (bounding box), characters, and GUI buttons with script execution
- **✅ Pathfinding & Movement**: Click-to-move player with intelligent pathfinding on walkable areas, smooth character movement with direction-based animations
- **✅ Room Management**: Complete room switching system (`load_room()`) with asset loading, cleanup, and script execution
- **✅ Character System**: Character rendering with pivot support, dynamic scaling, walking + custom named animations (`play_character_animation`)
- **✅ GUI System**: GUI rendering with background images and clickable buttons, script execution on button clicks

## Current API Status

Le API sotto sono disponibili nel **runtime** (`JS/runtime.js`) durante **Play Test** e in **runtime.html** standalone. L’editor espone le stesse funzioni tramite `getScriptApiBindings()` (Fasi A–B dell’unificazione API).

**Fasi completate:** A (infrastruttura binding) · B.1 (inventario) · B.2 (oggetti dinamici) · B.3 (stanze + alias variabili)

### API disponibili (per categoria)

### Basic APIs
- **`print(...)`** / **`GameAPI.print(...)`** - Outputs messages to the script console (with serialization)
- **`GameAPI.error(...)`** - Outputs error messages to the script console
- **`show_message(text)`** - Shows notification messages to the user
- **`move_object(id, x, y)`** - Moves scene objects by ID to new coordinates

### Event System APIs
- **`on_game_start(handler)`** - Registers a function to call when the game starts
- **`on_room_change(handler)`** - Registers a function to call when changing rooms (receives oldRoomId, newRoomId)
- **`on_object_click(handler)`** - Registers a function to call when clicking scene objects (receives objectId, x, y)
- **`on_character_click(handler)`** - Registers a function to call when clicking characters (receives characterId)
- **`on_hotspot_click(handler)`** - Registers a function to call when clicking hotspots (receives hotspotId)

### Inventory System APIs
- **`add_to_inventory(itemId, quantity)`** - Adds items to inventory
- **`remove_from_inventory(itemId, quantity)`** - Removes items from inventory
- **`has_item(itemId)`** - Checks if an item exists in inventory
- **`get_item_count(itemId)`** - Gets the quantity of an item in inventory
- **`clear_inventory()`** - Clears all items from inventory

### Object System APIs
- **`spawn_object(objectNameOrId, x, y, imageUrlOrDataUrl)`** - Creates a new scene object
- **`despawn_object(objectId)`** - Removes a scene object
- **`rotate_object(objectId, degrees)`** - Rotates an object by degrees
- **`scale_object(objectId, scaleX, scaleY)`** - Scales an object
- **`set_object_visible(objectId, visible)`** - Shows or hides an object

### Room System APIs
- **`load_room(roomIdOrName, playerX?, playerY?, playerDirection?)`** - Loads a room by ID or name; optional player placement
- **`get_current_room()`** / **`GameAPI.getCurrentRoom()`** - Returns the current room ID
- **`get_room_objects()`** - Returns plain objects `{ id, name, x, y, rotation, scaleX, scaleY, visible, enabled }` for the current room
- **`set_room_background(imageUrlOrDataUrl)`** - Sets or clears background (`""` / null clears); supports URLs and `asset:...` keys already in `AssetRegistry`

### Game Variables APIs
- **`get_var(key)`** / **`Game.getVar(key)`** / **`GameAPI.getVar(key)`** - Gets a variable (returns `initialValue` from project definitions if not set yet)
- **`set_var(key, value)`** / **`Game.setVar(key, value)`** / **`GameAPI.setVar(key, value)`** - Sets a variable (type coercion from editor definitions when available)
- **`has_var(key)`** / **`Game.hasVar(key)`** / **`GameAPI.hasVar(key)`** - Checks if a variable exists or is defined in the project
- **`toggle_var(key)`** / **`Game.toggleVar(key)`** / **`GameAPI.toggleVar(key)`** - Toggles a boolean variable
- **`GameAPI.getVariable(key)`** / **`GameAPI.setVariable(key, value)`** - camelCase aliases (same storage as `get_var` / `set_var`)

### Character APIs (runtime)
- **`spawn_character(name, x, y, direction?, id?)`** - Spawns a character; returns id
- **`move_character(idOrName, x, y)`** - Instant move
- **`walk_character(idOrName, x, y, wait?)`** - Pathfinding move on walkable area (returns Promise if `wait` is true; default). Stops any custom animation in progress.
- **`set_character_direction(idOrName, direction)`** - Sets 8-direction facing (walking sprites)
- **`animate_character(idOrName, enabled?)`** - Animation control hook (reserved for future use)
- **`play_character_animation(idOrName, animationName, direction, wait?)`** - Plays one full cycle of a **custom** animation defined in the editor (Characters tab → **+** → name, e.g. `wave`). Uses `characterDefinitions.animations[animationName].directions[direction]`. Stops movement; on completion returns to walking idle (frame 0). Directions: `north`, `northeast`, `east`, `southeast`, `south`, `southwest`, `west`, `northwest`. With `await` (default) blocks input until the cycle ends (same pattern as `walk_character`).

**Editor setup (custom animation):** Characters → select character → Animation dropdown → **+** → enter name → assign frames per direction (same workflow as walking).

**Project JSON (excerpt):**
```json
{
  "name": "Hero",
  "directions": { "south": { "fps": 8, "frames": ["asset:..."] } },
  "animations": {
    "wave": {
      "directions": {
        "south": { "fps": 10, "frames": ["asset:..."] }
      }
    }
  }
}
```

### Hotspot APIs
- **`enableHotspot(idOrName)`** — Activates a hotspot in the current room (clickable; sets `visible` to true). Returns `true` on success.
- **`disableHotspot(idOrName)`** — Deactivates a hotspot (no clicks; sets `visible` to false). Returns `true` on success.
- Initial state comes from the **Is active?** checkbox in the Rooms tab (saved as `visible` in project JSON).

### GUI / display
- **`show_message(text)`** / **`showText(text)`** - On-screen message overlay
- **`enableObject(id)`** / **`disableObject(id)`** - Enable/disable scene objects (by id or name)

### Usage Examples
```javascript
// Game start event
on_game_start(function() {
    print("Game started!");
    show_message("Welcome to my adventure game!");
    add_to_inventory("key", 1);
});

// Room change event
on_room_change(function(oldRoom, newRoom) {
    print("Changed from room " + oldRoom + " to " + newRoom);
    Game.setVar("lastRoom", oldRoom);
});

// Object click event
on_object_click(function(objectId, x, y) {
    print("Clicked object " + objectId + " at position " + x + "," + y);
    if (has_item("key")) {
        move_object(objectId, x + 50, y);
        show_message("You moved the object!");
    }
});

// Inventory management
if (has_item("sword")) {
    print("You have a sword!");
    remove_from_inventory("sword", 1);
}

// Object manipulation
spawn_object("treasure", 100, 200, "treasure.png");
rotate_object("treasure", 45);
scale_object("treasure", 1.5, 1.5);

// Room management
load_room("kitchen");
const objects = get_room_objects();
print("Room has " + objects.length + " objects");

// Pickup key (object click + inventory + persistent flag)
function on_object_click(object_id, x, y) {
  if (has_item("key")) return;
  add_to_inventory("key", 1);
  set_object_visible(object_id, false);
  set_var("key_collected", true);
}

// Custom character animation (requires "wave" defined in Characters tab)
on_hotspot_click(async function() {
  await play_character_animation("Hero", "wave", "south");
  show_message("Hello!");
});
```

**Not yet in runtime (roadmap):** dialogue system, audio, save/load slots, visual transitions (`fade_in`, …). See [ROADMAP.md](ROADMAP.md).

> 📖 **Per il piano completo di sviluppo e lo stato dettagliato di tutte le implementazioni, consulta la [ROADMAP.md](ROADMAP.md)**

## Quick Start

1. Open `index.html` in a modern browser.
2. Rooms → Rooms Manager: create/select a room.
3. Add a Background and optional Foreground Layers.
4. Scene Objects → add images; edit positions as needed.
5. Walkable Area → Start Drawing → click to add vertices → Finish.
6. Characters → select a character → upload walking frames (or add a custom animation with **+**) → Start Preview.
7. Scripts → write JavaScript and Run; use the provided APIs.
8. Play → Start Test to see runtime logs and basic flow.

## Keyboard & Tips

- Tabs: Ctrl+1..5 to switch quickly
- Scripts: Ctrl+S saves the current script
- Zoom editor (Rooms/Characters): mouse wheel (bounded zoom)

## Project Structure

- `index.html` — Editor UI layout (login, dashboard, tabs and sections)
- `CSS/main.css` — Acid dark theme and neon styling
- `JS/main.js` — Editor engine: tabs, canvas, rooms/objects, characters, scripting, UI handlers
- `runtime.html` — Standalone runtime player
- `JS/runtime.js` — Runtime renderer (rooms/assets, start room, OPFS/localStorage)
- `# 🎮 Funzioni da Implementare - Amianto editor.md` — Full list of APIs to implement
- `img/mnt.png` — Project cover (shown above)

## Extending

> 🗺️ **Consulta la [ROADMAP.md](ROADMAP.md) per il piano completo di sviluppo, lo stato dettagliato di tutte le implementazioni e le priorità future.**

### 🚀 JavaScript API Roadmap

#### **Phase 1 - Core Systems (High Priority)**
- ✅ **Event System**: `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`, `on_gui_click()` **(runtime)**
- ✅ **Inventory System** (runtime B.1): `add_to_inventory()`, `remove_from_inventory()`, `has_item()`, `get_item_count()`, `clear_inventory()`
- ✅ **Object System** (runtime B.2): `spawn_object()`, `despawn_object()`, `rotate_object()`, `scale_object()`, `set_object_visible()`
- ✅ **Room System** (runtime B.3): `load_room()`, `get_current_room()`, `get_room_objects()`, `set_room_background()`
- ✅ **Variables** (runtime B.3): `get_var`, `set_var`, `has_var`, `toggle_var`, `Game.getVar`, `GameAPI.getVariable`, …
- ✅ **API infrastructure** (Fase A): `getScriptApiBindings()`, `buildScriptExecutor()`, `exposeScriptGlobals()`

#### **Phase 2 - Advanced Interactions (Medium Priority)**
- **Dialogue System**: `start_dialogue()`, `show_dialogue_text()`, `show_dialogue_choices()`, `get_character_mood()`
- **Audio System**: `play_music()`, `play_sound()`, `set_music_volume()`, `play_ambient_sound()`
- **Character System (extended)**: `set_character_ai()`, patrol/follow — core APIs ✅: `spawn_character`, `move_character`, `walk_character`, `play_character_animation`
- **Visual System**: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`

#### **Phase 3 - Advanced Features (Low Priority)**
- **Game System**: `get_game_variable()`, `set_game_variable()`, `save_game()`, `load_game()`, `add_score()`
- **UI System**: `show_tooltip()`, `show_notification()`, `open_menu()`, `show_modal()`
- **Debug System**: `log_info()`, `log_warning()`, `log_error()`, `show_debug_info()`
- **Utility System**: `distance()`, `angle_between()`, `format_string()`, `shuffle_array()`

### 🔧 Technical Implementation

#### **Recommended API Structure**
```javascript
// Exposure in Jailed sandbox
window.gameAPI = {
    // Events
    onGameStart: function() { /* implementation */ },
    onObjectClick: function(objectId, x, y) { /* implementation */ },
    
    // Inventory
    addToInventory: function(itemId, quantity) { /* implementation */ },
    hasItem: function(itemId) { /* implementation */ },
    
    // Objects
    spawnObject: function(objectId, x, y) { /* implementation */ },
    moveObject: function(objectId, x, y) { /* implementation */ }
};
```

#### **Development Considerations**
- Implement functions gradually following priority order
- Test each new API before proceeding to the next
- Maintain compatibility with existing system
- Document every added function with usage examples
- Use existing notification system for user feedback

#### **Related Features**
- Data persistence: serialize `rooms` map and game state to localStorage
- Drag-and-drop: editing tools for objects and walkable vertices
- Save system: implement complete project save/load functionality
- Export/Import: features for sharing projects between users

### 📋 Implementation Checklist

- [ ] **Phase 1**: Core event system and inventory
- [ ] **Phase 1**: Advanced object and room management  
- [ ] **Phase 2**: Dialogue and audio systems
- [ ] **Phase 2**: Character management and visual effects
- [ ] **Phase 3**: Complete game system and advanced UI
- [ ] **Phase 3**: Debug tools and utility functions
- [ ] **Bonus**: Data persistence and project export/import

See `# 🎮 Funzioni da Implementare - Amianto editor.md` for the complete list of functions to implement.

---

# Amianto Editor (Italiano)

Editor web moderno per giochi punta‑e‑clicca. Progetta stanze, posiziona oggetti di scena, disegna le zone camminabili, gestisci personaggi e animazioni, e crea comportamenti con script JavaScript — tutto nel browser.

## 📚 Documentazione

- 📄 **[README](README.md)** - Panoramica e guida rapida
- 🗺️ **[ROADMAP](ROADMAP.md)** - Piano di sviluppo completo e stato delle implementazioni
- 🔗 **[API_UNIFICATION_CHECKLIST](API_UNIFICATION_CHECKLIST.md)** - Unificazione API editor ↔ runtime (Fasi A–B)
- 🔥 **[FIRESTORE_SETUP](FIRESTORE_SETUP.md)** - Configurazione Firestore e regole di sicurezza
- 🌐 **[STORAGE_CORS_SETUP](STORAGE_CORS_SETUP.md)** - Configurazione CORS per Firebase Storage

---

## Funzionalità (già presenti)

- Gestione Stanze
  - Crea, rinomina, elimina e seleziona stanze
  - Dati per stanza: background, livelli di foreground, oggetti di scena, zona camminabile
- Canvas (contestuale alla tab)
  - Rooms: render di background, oggetti, foreground e overlay walkable
  - Characters: anteprima frame d’animazione sul canvas principale
  - Scripts: canvas dedicato all’editor
  - Controlli canvas: zoom +/−, reset 100%, Fit, Center
- Zona Camminabile (Level Design)
  - Clic per aggiungere vertici del poligono (Start/Finish/Clear/Show/Hide)
  - Selezione/spostamento/eliminazione vertici; poligono salvato per stanza
- Hotspot
  - Crea hotspot poligonali; aggiungi/termina/svuota punti; mostra/nascondi tutti
  - Selezione/spostamento/eliminazione vertici; lista hotspot
  - Checkbox **Is active?** per stato iniziale; API script `enableHotspot` / `disableHotspot`
- Oggetti di Scena
  - Aggiunta immagini; modifica nome/posizione; rimozione
  - Supporto per più oggetti con stessa immagine (nomi unici)
  - Lista con filtro e badge (Interactive, Container, ecc.)
- Livelli di Foreground
  - Più livelli immagine con ordinamento
- Personaggi
  - Creazione personaggi; setup 8 direzioni
  - Animazione **Walking**: frame per direzione; FPS; anteprima
  - **Animazioni custom** con nome (es. `wave`, `idle`) e frame per direzione; riproducibili in script con `play_character_animation()`
  - Configurazione avvio gioco: personaggio/room/posizione iniziali
- Oggetti di Inventario
  - Gestione item inventario (upload, filtro, modifica, elimina)
  - Supporto per più oggetti con stessa immagine (nomi unici)
- Editor GUI
  - Crea elementi GUI con immagini di sfondo
  - Disegna, sposta e cancella pulsanti; lista pulsanti
- Cursori Contestuali
  - Definisci cursori per tipo target (hotspot/personaggio/oggetto scena)
  - Upload immagine cursore, testo azione opzionale; lista cursori attivi
- Scripting (JavaScript, Runtime Sandboxed)
  - Editor JavaScript integrato (CodeMirror)
  - **Sistema Eventi**: `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`
  - **API Utilità**: `print(...)`, `show_message(text)`, `move_object(id, x, y)`
  - **Runtime Sandboxed**: Esecuzione script in iframe isolato con `sandbox="allow-scripts"` per sicurezza
  - **GameAPI**: API completa esposta agli script utente (`GameAPI.print()`, `GameAPI.getVariable()`, `GameAPI.setVariable()`, `load_room()`, etc.)
  - **Messaggistica Robusta**: Sistema MessageQueue con buffer, retry (3 tentativi) e fallback a console
  - **Script Logging**: ScriptLogService integrato con log timestamped e livelli (info, warning, error)
  - Collega script a stanze, personaggi, oggetti di scena, inventario, GUI, hotspot e cursori
  - Salva/Carica script, Esegui/Stop sandbox
- Play Test
  - Avvio/Pausa/Stop; console di debug; azioni test rapide
- Autenticazione & Progetti
  - Login/logout, registrazione, sessioni persistenti
  - Progetti per utente
- Menu File
  - Nuovo/Apri/Salva/Export, Impostazioni Progetto, Elimina Progetto
- Runtime Standalone & Play Test
  - `runtime.html` + `JS/runtime.js` per caricare/eseguire JSON di progetto
  - Carica file JSON, Carica ultimo salvataggio (OPFS/localStorage), Download JSON
  - Tentativo automatico di caricare `game.json` all'avvio; log runtime
  - **Runtime Sandboxed**: Esecuzione script in iframe isolato durante Play Test
  - **Integrazione GameAPI**: Accesso completo alle API nel runtime con gestione contesto (roomId, objectId, variables)
  - **Script Console**: Logging in tempo reale dagli script con filtri per livello e timestamp
  - **Rendering Completo Runtime**: Stanze, oggetti, personaggi (animazioni 8 direzioni), GUI (sfondi, pulsanti)
  - **Interazioni Click**: Sistema completo di hit detection per hotspot, oggetti, personaggi, pulsanti GUI con esecuzione script
  - **Pathfinding & Movimento**: Click-to-move player con pathfinding su aree camminabili, animazioni fluide
  - **Cambio Stanza**: Sistema completo di cambio stanza con caricamento asset ed esecuzione script
- Tema
  - Interfaccia acid dark + neon uniforme (form, pulsanti, liste, menu)

## Funzionalità Runtime

Il sistema runtime fornisce un ambiente completo di esecuzione giochi:

- **✅ Rendering Completo**: Stanze (background, foregrounds, oggetti), personaggi con animazioni 8 direzioni e scaling, overlay GUI con pulsanti
- **✅ Interazioni Click**: Sistema completo di hit detection per hotspot (polygon), oggetti (bounding box), personaggi e pulsanti GUI con esecuzione script
- **✅ Pathfinding & Movimento**: Click-to-move player con pathfinding intelligente su aree camminabili, movimento fluido personaggi con animazioni basate su direzione
- **✅ Gestione Stanze**: Sistema completo di cambio stanza (`load_room()`) con caricamento asset, cleanup ed esecuzione script
- **✅ Sistema Personaggi**: Rendering personaggi con supporto pivot, scaling dinamico basato su posizione Y, movimento fluido sub-pixel
- **✅ Sistema GUI**: Rendering GUI con immagini di sfondo e pulsanti cliccabili, esecuzione script su click pulsanti

## Stato Corrente delle API

Le API sotto sono disponibili nel **runtime** (`JS/runtime.js`) durante **Play Test** e in **runtime.html** standalone.

**Fasi unificazione API completate:** A (binding) · B.1 (inventario) · B.2 (oggetti) · B.3 (stanze + variabili)

### API Base
- **`print(...)`** / **`GameAPI.print(...)`** - Invia messaggi alla script console (con serializzazione valori)
- **`GameAPI.error(...)`** - Invia messaggi di errore alla script console
- **`show_message(text)`** - Mostra notifiche all'utente
- **`move_object(id, x, y)`** - Sposta oggetti di scena tramite ID verso nuove coordinate

### API Sistema Eventi
- **`on_game_start(handler)`** - Registra una funzione da chiamare all'avvio del gioco
- **`on_room_change(handler)`** - Registra una funzione da chiamare al cambio stanza (riceve oldRoomId, newRoomId)
- **`on_object_click(handler)`** - Registra una funzione da chiamare al click sugli oggetti (riceve objectId, x, y)
- **`on_character_click(handler)`** - Registra una funzione da chiamare al click sui personaggi (riceve characterId)
- **`on_hotspot_click(handler)`** - Registra una funzione da chiamare al click sugli hotspot (riceve hotspotId)

### API Sistema Inventario
- **`add_to_inventory(itemId, quantity)`** - Aggiunge oggetti all'inventario
- **`remove_from_inventory(itemId, quantity)`** - Rimuove oggetti dall'inventario
- **`has_item(itemId)`** - Verifica se un oggetto è presente nell'inventario
- **`get_item_count(itemId)`** - Ottiene la quantità di un oggetto nell'inventario
- **`clear_inventory()`** - Svuota completamente l'inventario

### API Sistema Oggetti
- **`spawn_object(objectNameOrId, x, y, imageUrlOrDataUrl)`** - Crea un nuovo oggetto di scena
- **`despawn_object(objectId)`** - Rimuove un oggetto di scena
- **`rotate_object(objectId, degrees)`** - Ruota un oggetto di gradi specificati
- **`scale_object(objectId, scaleX, scaleY)`** - Scala un oggetto
- **`set_object_visible(objectId, visible)`** - Mostra o nasconde un oggetto
- **`enableObject(id)`** / **`disableObject(id)`** - Abilita/disabilita oggetti di scena (per id o nome)

### API Hotspot
- **`enableHotspot(idOrName)`** — Attiva un hotspot nella stanza corrente (cliccabile; `visible=true`). Restituisce `true` se trovato.
- **`disableHotspot(idOrName)`** — Disattiva i click sull'hotspot (`visible=false`). Restituisce `true` se trovato.
- Stato iniziale: checkbox **Is active?** nel tab Rooms (salvato come `visible` nel JSON progetto).

### API Sistema Stanze
- **`load_room(roomIdOrName, playerX?, playerY?, playerDirection?)`** - Carica stanza; posizionamento opzionale del player
- **`get_current_room()`** / **`GameAPI.getCurrentRoom()`** - ID stanza corrente
- **`get_room_objects()`** - Oggetti stanza corrente come dati plain (`id`, `name`, `x`, `y`, `rotation`, …)
- **`set_room_background(imageUrlOrDataUrl)`** - Imposta o rimuove lo sfondo (URL o `asset:...`)

### API Variabili di Gioco
- **`get_var(key)`** / **`Game.getVar(key)`** / **`GameAPI.getVar(key)`** - Legge variabile (anche `initialValue` dalle definizioni progetto)
- **`set_var(key, value)`** / **`Game.setVar(key, value)`** - Scrive variabile (coercizione tipo se definita in editor)
- **`has_var(key)`** / **`Game.hasVar(key)`** - Variabile impostata o definita nel progetto
- **`toggle_var(key)`** / **`Game.toggleVar(key)`** - Toggle booleano
- **`GameAPI.getVariable` / `setVariable`** - Alias camelCase

### API Personaggi (runtime)
- **`spawn_character(name, x, y, direction?, id?)`** — Spawna un personaggio; restituisce l’id
- **`move_character(idOrName, x, y)`** — Spostamento istantaneo
- **`walk_character(idOrName, x, y, wait?)`** — Movimento con pathfinding sulla walkable area (Promise se `wait` è true). Interrompe un’animazione custom in corso.
- **`set_character_direction(idOrName, direction)`** — Imposta la direzione (8 direzioni, sprite walking)
- **`animate_character(idOrName, enabled?)`** — Hook controllo animazione (uso futuro)
- **`play_character_animation(idOrName, animationName, direction, wait?)`** — Riproduce un ciclo completo di un’animazione **custom** definita nell’editor (tab Characters → **+** → nome, es. `wave`). Usa `characterDefinitions.animations[nome].directions[direzione]`. Ferma il movimento; al termine torna alla posa idle del walking. Con `await` (default) blocca l’input fino alla fine (come `walk_character`).

**Setup editor:** Characters → personaggio → menu Animation → **+** → nome → frame per direzione.

### Esempi di Utilizzo
```javascript
// Evento di avvio gioco
on_game_start(function() {
    print("Gioco avviato!");
    show_message("Benvenuto nella mia avventura!");
    add_to_inventory("chiave", 1);
});

// Evento di cambio stanza
on_room_change(function(oldRoom, newRoom) {
    print("Cambiato dalla stanza " + oldRoom + " alla " + newRoom);
    Game.setVar("ultimaStanza", oldRoom);
});

// Evento di click oggetto
on_object_click(function(objectId, x, y) {
    print("Cliccato oggetto " + objectId + " alla posizione " + x + "," + y);
    if (has_item("chiave")) {
        move_object(objectId, x + 50, y);
        show_message("Hai spostato l'oggetto!");
    }
});

// Gestione inventario
if (has_item("spada")) {
    print("Hai una spada!");
    remove_from_inventory("spada", 1);
}

// Manipolazione oggetti
spawn_object("tesoro", 100, 200, "tesoro.png");
rotate_object("tesoro", 45);
scale_object("tesoro", 1.5, 1.5);

// Gestione stanze
load_room("cucina");
const oggetti = get_room_objects();
print("La stanza ha " + oggetti.length + " oggetti");

// Animazione custom (richiede "wave" definita in Characters)
on_hotspot_click(async function() {
  await play_character_animation("Eroe", "wave", "south");
  show_message("Ciao!");
});
```

**Non ancora nel runtime:** dialoghi, audio, salvataggi, transizioni visive. Vedi [ROADMAP.md](ROADMAP.md).

> 📖 **Per il piano completo di sviluppo e lo stato dettagliato di tutte le implementazioni, consulta la [ROADMAP.md](ROADMAP.md)**

## Avvio Rapido

1. Apri `index.html` in un browser recente.
2. Rooms → Rooms Manager: crea/seleziona una stanza.
3. Aggiungi un Background e, se vuoi, livelli di Foreground.
4. Scene Objects → aggiungi immagini; modifica le posizioni.
5. Walkable Area → Start Drawing → clic per i vertici → Finish.
6. Characters → seleziona un personaggio → carica frame walking (o animazione custom con **+**) → Start Preview.
7. Scripts → scrivi JavaScript e premi Run; usa le API fornite.
8. Play → Start Test per vedere i log e provare il flusso.

## Note & Consigli

- Cambio tab: Ctrl+1..5
- Scripts: Ctrl+S salva lo script
- Zoom editor (Rooms/Characters): rotella mouse

## Struttura del Progetto

- `index.html` — Editor (login, dashboard, tabs/sezioni)
- `CSS/main.css` — Tema scuro neon
- `JS/main.js` — Motore editor: tabs, canvas, stanze/oggetti, personaggi, scripting, UI
- `runtime.html` — Player runtime standalone
- `JS/runtime.js` — Renderer runtime (stanze/assets, start room, OPFS/localStorage)
- `# 🎮 Funzioni da Implementare - Amianto editor.md` — Lista completa API da implementare
- `img/mnt.png` — Cover (in alto)

## Estensioni Possibili

> 🗺️ **Consulta la [ROADMAP.md](ROADMAP.md) per il piano completo di sviluppo, lo stato dettagliato di tutte le implementazioni e le priorità future.**

### 🚀 Roadmap JavaScript API

#### **Fase 1 - Sistema Base (Priorità Alta)**
- ✅ **Sistema Eventi** (runtime): `on_game_start`, `on_room_change`, `on_object_click`, `on_character_click`, `on_hotspot_click`, `on_gui_click`
- ✅ **Inventario** (B.1): `add_to_inventory`, `remove_from_inventory`, `has_item`, `get_item_count`, `clear_inventory`
- ✅ **Oggetti** (B.2): `spawn_object`, `despawn_object`, `rotate_object`, `scale_object`, `set_object_visible`
- ✅ **Stanze** (B.3): `load_room`, `get_current_room`, `get_room_objects`, `set_room_background`
- ✅ **Variabili** (B.3): `get_var`, `set_var`, `has_var`, `toggle_var`, `Game.getVar`, …
- ✅ **Infrastruttura API** (Fase A): `getScriptApiBindings`, `buildScriptExecutor`, `exposeScriptGlobals`

#### **Fase 2 - Interazioni Avanzate (Priorità Media)**
- **Sistema Dialoghi**: `start_dialogue()`, `show_dialogue_text()`, `show_dialogue_choices()`, `get_character_mood()`
- **Sistema Audio**: `play_music()`, `play_sound()`, `set_music_volume()`, `play_ambient_sound()`
- **Sistema Personaggi (esteso)**: `set_character_ai()`, patrol/follow — API base ✅: `spawn_character`, `move_character`, `walk_character`, `play_character_animation`
- **Sistema Visivo**: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`

#### **Fase 3 - Funzionalità Avanzate (Priorità Bassa)**
- **Sistema Gioco**: `get_game_variable()`, `set_game_variable()`, `save_game()`, `load_game()`, `add_score()`
- **Sistema UI**: `show_tooltip()`, `show_notification()`, `open_menu()`, `show_modal()`
- **Sistema Debug**: `log_info()`, `log_warning()`, `log_error()`, `show_debug_info()`
- **Sistema Utilità**: `distance()`, `angle_between()`, `format_string()`, `shuffle_array()`

### 🔧 Implementazione Tecnica

#### **Struttura API Consigliata**
```javascript
// Esposizione nel sandbox Jailed
window.gameAPI = {
    // Eventi
    onGameStart: function() { /* implementazione */ },
    onObjectClick: function(objectId, x, y) { /* implementazione */ },
    
    // Inventario
    addToInventory: function(itemId, quantity) { /* implementazione */ },
    hasItem: function(itemId) { /* implementazione */ },
    
    // Oggetti
    spawnObject: function(objectId, x, y) { /* implementazione */ },
    moveObject: function(objectId, x, y) { /* implementazione */ }
};
```

#### **Considerazioni di Sviluppo**
- Implementare gradualmente le funzioni seguendo l'ordine di priorità
- Testare ogni nuova API prima di procedere alla successiva
- Mantenere compatibilità con il sistema esistente
- Documentare ogni funzione aggiunta con esempi d'uso
- Utilizzare il sistema di notifiche esistente per feedback utente

#### **Funzionalità Correlate**
- Persistenza dati: serializzare `rooms` map e stato gioco in localStorage
- Drag-and-drop: strumenti di editing per oggetti e vertici walkable
- Sistema di salvataggio: implementare save/load completo del progetto
- Export/Import: funzionalità per condividere progetti tra utenti

### 📋 Checklist Implementazione

- [x] **Fase 1**: Sistema eventi base e inventario ✅
- [x] **Fase 1**: Gestione oggetti e stanze avanzata ✅
- [x] **Fase 1**: Sistema variabili di gioco ✅
- [ ] **Fase 2**: Sistema dialoghi e audio
- [ ] **Fase 2**: Gestione personaggi e effetti visivi
- [ ] **Fase 3**: Sistema gioco completo e UI avanzata
- [ ] **Fase 3**: Debug tools e funzioni di utilità
- [ ] **Bonus**: Persistenza dati e export/import progetti

Vedi `# 🎮 Funzioni da Implementare - Amianto editor.md` per la lista completa delle funzioni da implementare.

## Roadmap (integrazioni possibili)

### Fase 1 — Migliorie core
- Sistema eventi completo (click/hover oggetti, cambi stanza, avvio gioco)
- Pathfinding su zona camminabile e click-to-move del personaggio
- Undo/Redo globale, multi‑selezione, snap‑to‑grid, guide e allineamenti
- Ordinamento livelli/oggetti (z‑index, y‑sorting), parallax per foreground
- Asset manager con drag&drop e deduplica, anteprime

### Fase 2 — Gameplay e contenuti
- Sistema dialoghi ramificati con scelte e condizioni
- Audio: musica di fondo, SFX, suoni ambientali con mixer/volumi
- Inventario avanzato con combinazioni, uso su hotspot/oggetti
- Sistema personaggi: movimento, animazioni custom (`play_character_animation`), AI semplice (patrol/follow)
- Effetti visivi: fade/transition, particellari, cutscene

### Fase 3 — Scripting & Tools
- Estensione API script (vedi file funzioni), helper utility
- Supporto TypeScript, linting e suggerimenti in editor
- Debug script avanzato (log levels, inspector, pause/resume)
- Visual scripting opzionale (nodi) per utenti non programmatori

### Fase 4 — Produzione e distribuzione
- Esportazione progetto in HTML/PWA “one‑click” e pacchetti desktop
- Localizzazione (i18n) e gestione traduzioni
- Sistema salvataggi gioco (slot), caricamento e autosave
- Telemetria facoltativa e report errori runtime

### Fase 5 — Account & collaborazione
- Migliorie auth: reset password via email, social login
- Sync cloud e condivisione progetti, permessi per progetto
- Versionamento progetti e cronologia modifiche

Nota: le voci di roadmap sono indicative e potranno variare in base al feedback.


