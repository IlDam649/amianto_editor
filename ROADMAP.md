# 🗺️ ROADMAP COMPLETA - Amianto Editor

## Analisi Architettura Attuale

**Amianto Editor** è un editor offline per avventure punta e clicca (Electron Windows + browser). L'architettura è divisa in:
- **Editor** (`index.html` + `JS/main.js`): Interfaccia di editing con tabs
- **Runtime Standalone** (`runtime.html` + `JS/runtime.js`): Player a finestra per Play Test
- **Runtime Sandboxed** (`runtime-sandbox.html` + iframe + `JS/runtime.js`): Esecuzione script isolata nell'editor
- **Storage locale**: file `.amnt` su disco, IndexedDB per asset (`JS/local-storage.js`), cache `localStorage` + backup OPFS
- **Desktop**: Electron (`electron/main.js`) con dialoghi nativi open/save
- **Scripting**: JavaScript in iframe sandboxed; API via `GameAPI` + `getScriptApiBindings()` / `compileScript`

**Documenti correlati:**
- [`API_UNIFICATION_CHECKLIST.md`](API_UNIFICATION_CHECKLIST.md) — unificazione API editor ↔ runtime (Fasi A–D ✅; Fase E test manuali)
- [`docs/DIALOGUE_VISUAL_EDITOR.md`](docs/DIALOGUE_VISUAL_EDITOR.md) — editor dialoghi Form/Visual
- [`tests/MANUAL.md`](tests/MANUAL.md) — checklist verifica manuale (save, dialoghi, autosave, export)

**✅ Nota (ottobre 2026):** Editor **offline** senza Firebase/Supabase. Formato progetto **`.amnt`**. Unificazione API **Fasi A–D** completata. **Dialoghi** (balloon + `start_dialogue` line/choice/end/jump/action + condizioni + once-only + `run_script` inline) ✅ · **tab Dialogues dedicata** + editor nodi Form/Visual (stesso `project.dialogues`; Preview Play Test) ✅ · **ritratti/mood** (Line + `character.portraits`) ✅ · **condizioni annidate** and/or/not ✅ · **save/load gioco** hardenato (`validate`/`migrate`, `dialogueConsumed`) ✅ · **GUI SaveLoad** (slot disegnabili + `show_gui`/`hide_gui`) ✅ · **inventario GUI** testato ✅ · **autosave progetto** cache vs disco ✅ · **smoke test** (`npm test`) + `tests/MANUAL.md` ✅ · export HTML standalone ✅ · **`set_character_visibility` / `set_character_opacity`** ✅ · messaggi/dialoghi **bloccanti** ✅ · `load_room` Before → load → After ✅ · script Before/After room load distinti ✅.

**Prossimi step prioritari:** test manuali Fase E · tooltip inventario (opz.) · mixer audio / fade · transizioni stanza.

---

## 📊 STATO ATTUALE PER MACRO-AREA

### 1. PROJECT (Gestione Progetti)

#### ✅ **Già Implementato**
- Struttura JSON progetto completa (`serializeProject()`)
- **Formato `.amnt`** — bundle singolo (progetto + asset base64) via `JS/amnt-format.js`
- Salvataggio su file `.amnt` scelto dall'utente (dialogo nativo Electron)
- Cache locale: `localStorage` + IndexedDB + backup OPFS
- Caricamento `.amnt` e `.json` legacy
- Export `.amnt` e JSON
- **Project Settings** e **Save Project** in header
- Utente locale (`Local`) — nessun login cloud

#### 🟡 **Parzialmente Implementato**
- **Salvataggio automatico**: ✅ Debounce su `.amnt` collegato (2.5s) + **autosave periodico 45s** se dirty
  - Indicatore: `Saved to disk` / `Saved to cache` / `Unsaved changes` / `Autosaving…` / `Disk save failed (cache OK)`
  - Dirty resta attivo se write `.amnt` fallisce (beforeunload non silenzioso)
  - ✅ Flush script durante persist **non** rimarca dirty (evita glitch Saved↔Unsaved)
  - ✅ Timer autosave cancellato al clear dirty; no re-save se non dirty
  - **Prossimo passo**: backup timestamped multipli (versioning)

#### ❌ **Mancante**
- **Versionamento progetti**: Nessun sistema di backup/versioni multiple
  - **Prossimo passo**: Aggiungere timestamped backups in localStorage/OPFS
- **Template progetti**: Nessun sistema di template predefiniti
  - **Prossimo passo**: Creare template base (empty, tutorial, example)
- **Validazione progetto**: Nessuna validazione struttura JSON
  - **Prossimo passo**: Validator che controlla integrità prima di salvare

---

### 2. ASSETS (Gestione Asset)

#### ✅ **Già Implementato**
- Upload immagini per background/foreground
- Upload scene objects con posizionamento
- Upload inventory items
- Upload character animation frames (8 direzioni)
- Upload room/environment animation frames (tab **Animations**)
- Upload GUI backgrounds e cursors
- Cache immagini in memoria

#### 🟡 **Parzialmente Implementato**
- **Deduplicazione asset**: Immagini salvate come dataURL, possibile duplicazione
  - **Prossimo passo**: Sistema hash per deduplicare asset identici
- **Ottimizzazione immagini**: Nessuna compressione/ridimensionamento automatico
  - **Prossimo passo**: Compressore automatico per immagini > 1MB

#### 🟡 **Parzialmente Implementato**
- **Asset manager centralizzato**: ✅ Tab **Resources** (immagini + suoni in IndexedDB: import, ricerca, picker usato da Browse in Characters/Dialogues/…) — ❌ statistiche uso globali, deduplica
- **Supporto audio (editor)**: Upload/gestione file audio in Resources
- **API audio runtime**: ✅ `play_music()`, `play_sound()`, `stop_music()`, `stop_sound()` — ❌ mixer volumi, ambient layers, fade

#### ❌ **Mancante**
- **Supporto video**: Nessun sistema per cutscene video
  - **Prossimo passo**: Upload video (MP4) con preview e timeline
- **Thumbnail generation**: Nessuna generazione automatica di thumbnail
  - **Prossimo passo**: Generare thumbnail 64x64 per ogni asset

---

### 3. GUI (Interfaccia Utente)

#### ✅ **Già Implementato**
- Editor GUI con background image
- Disegno/movimento/resize pulsanti GUI
- Lista pulsanti con selezione
- Tipi GUI: MainInterface, DialogBox, Inventory, Menu, VerbGUI, VerbCoin, OverlayCustom
- Salvataggio GUI nel progetto

#### ✅ **Completato in runtime**
- Rendering GUI overlay (background, pulsanti, testo)
- Click su pulsanti GUI + script `on_gui_click`

#### 🟡 **Parzialmente Implementato**
- **Layout responsive**: GUI non si adatta a dimensioni canvas diverse
  - **Prossimo passo**: Sistema di scaling/anchoring per GUI responsive

#### 🟡 **Parzialmente Implementato**
- **Sistema di dialogo GUI**: Balloon + grafo ramificato v1
  - ✅ Rendering balloon (testo, colori, immagine opzionale da GUI DialogBox)
  - ✅ Balloon segue il personaggio; chiusura con click
  - ✅ `start_dialogue(idOrName)` — grafo `line` / `choice` / `jump` / `action` / `end` in `project.dialogues`
  - ✅ Condizioni declarative su choice (`has_item`, `var`, `and`/`or`/`not`) — no eval
  - ✅ Once-only choices (persistite in `save_game` come `state.dialogueConsumed`)
  - ✅ Actions declarative (`set_var`, `add_item`, `remove_item`, `set_object_visible`)
  - ✅ Tab **Dialogues** dedicata (sidebar Form + canvas Visual; non più sotto Scripts)
  - ✅ Editor form-based + nodi visuale (DOM/SVG), toggle Form/Visual, inspector, validazione (`docs/DIALOGUE_VISUAL_EDITOR.md`); persistito in `.amnt`
  - ✅ Action `run_script` con codice inline (`on_dialogue_action`); Preview → Play Test → `start_dialogue`
  - ✅ Scelte clickable in playtest e export HTML (stesso `runtime.js`)
  - ✅ Ritratti / mood su Line + mappa `character.portraits` (Browse Resources Characters + Dialogues)
  - ✅ Builder condizioni annidate (`and` / `or` / `not`) nell’inspector Visual
  - ✅ `show_message` / `show_dialogue` / `start_dialogue` / `show_image` bloccano i comandi successivi (auto-`await` in compile; eccezione room-transition vs `load_room`)
  - **Prossimo passo**: localisation keys; talking-head / lip-sync
- **Sistema inventario GUI**: ✅ Testato e funzionante
  - ✅ Rendering pannello, slot, oggetto in mano (carriedItem)
  - ✅ Combinazioni use-with (hotspot, object, character, inventory)
  - **Residuo opzionale**: drag&drop riordino slot, tooltip
- **GUI SaveLoad**: ✅ Tipo `SaveLoad` nel dropdown GUI
  - ✅ Slot disegnabili (come inventario) con `slotKey` 1–10
  - ✅ Mode save / load / both; `show_gui` / `hide_gui`; click fuori chiude (opz.)
- **Animazioni GUI**: Nessun sistema di animazioni per elementi GUI
  - **Prossimo passo**: Fade in/out, slide, scale per elementi GUI
- **Animazioni stanza (ambiente)**: ✅ Tab Animations + posizionamento in Rooms; runtime con layer background/foreground; `play_animation` / `stop_animation`
- **Stili GUI**: Nessun sistema di temi/stili per GUI
  - **Prossimo passo**: Sistema di stili (colori, font, bordi) per GUI

---

### 4. SCRIPTING (Sistema di Scripting)

#### ✅ **Runtime (`JS/runtime.js`) — Play Test e standalone**
- Editor CodeMirror + attach script a rooms, objects, characters, hotspots, GUI, cursors
- **Infrastruttura API unificata (Fase A ✅):** `getScriptApiBindings()`, `buildScriptExecutor()`, `exposeScriptGlobals()`, `SUPPORTED_SCRIPT_HANDLERS`
- **Eventi:** `on_game_start`, `on_before_room_change`, `on_room_change`, `on_object_click`, `on_character_click`, `on_hotspot_click`, `on_gui_click`, `on_use_with`, `on_inventory_use_with`, `on_dialogue_action` / preview (click con `usedItemId` opzionale dove applicabile)
- **Script Before/After room load:** file distinti (`Room:id:on_before_room_change` / `Room:id:on_room_change`, analoghi Global); legacy `Room:id` ancora supportato
- **Base:** `print`, `show_message` / `showText` (bloccanti fino a chiusura), `move_object`, `enableObject`, `disableObject`
- **Dialoghi:** `show_dialogue`, `show_dialogue_text`, `end_dialogue`, `start_dialogue` (grafo; bloccanti fuori room-transition)
- **Hotspot:** `enableHotspot`, `disableHotspot` (campo `visible`; checkbox **Is active?** in editor)
- **Stanze:** `load_room` (Before → load → place player → After awaited), `getCurrentRoom` / `get_current_room`, `get_room_objects`, `set_room_background`
- **Variabili:** `getVariable`, `setVariable` su `gameState.variables` (alias `Game.getVar` — Fase B)
- **Personaggi:** `spawn_character`, `move_character`, `walk_character`, `set_character_direction`, `set_character_visibility`, `set_character_opacity`, `animate_character`, `play_character_animation`
- **Animazioni stanza:** `play_animation`, `stop_animation` (istanze posizionate in editor)
- **Audio:** `play_music`, `play_sound`, `stop_music`, `stop_sound`
- **Save gioco:** `save_game`, `load_game`, `delete_save` (slot obbligatorio), `get_save_info` (localStorage; slot 1–10 o stringa); GUI `SaveLoad` + `show_gui` / `hide_gui`
- **Boot:** overlay loading opaco; `on_game_start` (+ room scripts iniziali) prima del reveal canvas
- Compilazione script con cache handler (`compileScript` / `executeScriptHandler`) + auto-`await` API bloccanti

#### ✅ **API runtime (Fase B completata)**
- Inventario, oggetti dinamici, stanze, alias variabili — tutti in `GameAPI` + `getScriptApiBindings()`

#### 🟡 **Qualità scripting**
- Error handling: migliorare stack trace negli script utente
- Test manuali checklist Fase E (`await` + inventario nello stesso handler)

#### ❌ **Mancante (backlog)**
- Dialoghi: localisation keys; talking-head / lip-sync (editor visuale + ritratti/mood ✅)
- Audio avanzato: volumi, ambient, fade musica
- Effetti: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`
- Save gioco: IndexedDB; screenshot metadata (UI slot ✅ via GUI SaveLoad)
- Utility: `distance()`, `angle_between()`, `lerp()`, `shuffle_array()`
- AI personaggi: patrol, follow (oltre a `walk_character` già presente)

---

### 5. RUNTIME (Sistema di Esecuzione)

#### ✅ **Già Implementato**
- Caricamento JSON progetto
- **Rendering stanze (background, foregrounds, scene objects)**
- **Rendering animazioni stanza** (layer background/foreground, game loop frame)
- Rendering starting position marker
- Esecuzione script con Jailed sandbox
- Sistema variabili funzionante
- Log runtime base
- Auto-load da OPFS/localStorage/game.json

#### ✅ **Completato**
- **Sistema print/log**: ✅ Implementato sistema completo con MessageQueue (buffer, retry fino a 3 tentativi, fallback a console locale)
  - Sistema di messaggistica robusto con coda messaggi (max 1000)
  - Retry automatico con delay configurabile
  - Fallback alla console locale se parent non disponibile
  - Gestione priorità messaggi (errori hanno priorità alta)
- **Runtime sandboxed**: ✅ Sistema completo di esecuzione script isolato
  - Iframe con sandbox="allow-scripts" per isolamento completo
  - GameAPI esposto agli script utente con API limitate e sicure
  - Gestione contesto di esecuzione (roomId, objectId, variables)
  - Sistema di inizializzazione con RUNTIME_READY
  - Gestione script pending durante inizializzazione

#### ✅ **Completato**
- **Cambio stanza**: ✅ Sistema completo `changeRoom()` e `load_room()` implementato
  - ✅ Cambio stanza con cleanup risorse
  - ✅ `load_room`: esegue `on_before_room_change` (destinazione) → carica stanza → posiziona player → `on_room_change` (awaited)
  - ✅ Script Before/After come asset distinti in editor; non forzare `visible=true` sul player al load (rispetta `set_character_visibility`)
  - ✅ Caricamento asset stanza (background, foregrounds, oggetti, hotspot)
  - ✅ Gestione transizione tra stanze (senza effetti fade — backlog Fase 3.2)
- **Interazioni click**: ✅ Sistema completo di hit detection e dispatch eventi
  - ✅ Hit detection per hotspot (polygon), oggetti (bounding box), character (bounding box), GUI buttons
  - ✅ Sistema di click centralizzato con protezioni anti-doppio click (debounce, frame guard)
  - ✅ Dispatch eventi click agli script (`on_hotspot_click`, `on_object_click`, `on_character_click`, `on_gui_click`)
  - ✅ Priorità click: hotspot > oggetti > character > GUI > pathfinding
- **Movimento personaggio**: ✅ Sistema completo di pathfinding e click-to-move
  - ✅ Pathfinding su walkable area polygon con verifica percorso valido
  - ✅ Click-to-move del player con pathfinding automatico
  - ✅ Animazione movimento con direzione corretta (8 direzioni)
  - ✅ Smooth movement con sub-pixel rendering
  - ✅ Gestione pivot per posizionamento corretto
  - ✅ Sistema di scaling basato su posizione Y (character scaling)
- **Rendering personaggi**: ✅ Sistema completo implementato
  - ✅ Rendering personaggi con animazioni 8-direzioni
  - ✅ Supporto pivot per posizionamento corretto
  - ✅ Character scaling dinamico basato su posizione Y
  - ✅ Sub-pixel rendering per movimento fluido
  - ✅ Gestione frame animazione (idle frame 0, movimento frame 1+)
  - ✅ Z-ordering automatico (personaggi renderizzati dopo oggetti di scena)
  - ✅ `set_character_visibility` / `set_character_opacity` (0–1; persistiti in `save_game`)
- **Rendering GUI**: ✅ Sistema completo implementato
  - ✅ Rendering overlay GUI con background immagini
  - ✅ Rendering pulsanti GUI con immagini e testo
  - ✅ Sistema di click su pulsanti GUI funzionante
  - ✅ Esecuzione script associati a pulsanti

#### 🟡 **Parzialmente Implementato**
- **Sistema inventario runtime**
  - ✅ API inventario in `runtime.js` (`add_to_inventory`, use-with, `get_carried_item`, …)
  - ✅ Rendering GUI inventario (pannello, slot, oggetto in mano, combinazioni) — testato OK
  - **Residuo opzionale**: drag&drop riordino, tooltip
- **Sistema cursori contestuali**
  - ✅ Definizione in editor + hover canvas editor
  - ✅ Cambio cursore dinamico in playtest/runtime (categorie + action text)
- **UI slot save in-game**: ✅ GUI type `SaveLoad` + `show_gui` / `hide_gui`

#### ❌ **Mancante**
- **Sistema audio runtime avanzato**: 🟡 `play_music` / `play_sound` / stop base ✅
  - **Prossimo passo**: Mixer volumi, ambient layers, fade
- **Sistema transizioni**: Nessun sistema di transizioni tra stanze
  - **Prossimo passo**: Fade in/out, slide, dissolve tra stanze (`fade_in`, `transition_to_room`, …)
- **Sistema pause/menu**: Menu pausa generico (SaveLoad GUI copre save/load)
  - **Prossimo passo**: Menu GUI con opzioni, pausa, quit (+ slot save in-game)

---

### 6. VARIABILI (Sistema Variabili)

#### ✅ **Già Implementato**
- Creazione/modifica variabili nell'editor
- Tipi: string, number, boolean
- Valori iniziali
- API scripting: `Game.getVar()`, `Game.setVar()`, `Game.hasVar()`, `Game.toggleVar()`
- Persistenza variabili nel progetto JSON
- Caricamento variabili nel runtime

#### 🟡 **Parzialmente Implementato**
- **Validazione valori**: Nessuna validazione tipo/range
  - **Prossimo passo**: Validazione tipo, range per numeri, lunghezza stringhe

#### ❌ **Mancante**
- **Variabili locali**: Nessun sistema di variabili locali a stanza/oggetto
  - **Prossimo passo**: Scope variabili (global, room, object)
- **Variabili array/object**: Solo tipi primitivi supportati
  - **Prossimo passo**: Supporto array e object come tipi variabile
- **Export/import variabili**: Nessun sistema per esportare/importare set di variabili
  - **Prossimo passo**: Export/import variabili come JSON

---

### 7. SALVATAGGIO (Sistema Salvataggio Gioco)

#### ✅ **Già Implementato**
- Salvataggio progetto editor (`.amnt`, cache locale, autosave periodico)
- **Save/load stato gioco (API)**: `save_game(slot, label?)`, `load_game(slot)`, `delete_save(slot)`, `get_save_info(slot?)`
  - Formato `amianto-save` v1 in `localStorage` (`amianto-gamesave:v1:{projectId}:{slot}`)
  - Helpers: `JS/lib/game-save-format.js` (`validateGameSavePayload`, `migrateGameSave`)
  - Persiste: room, variables, inventory (+ carried), characters, object/hotspot overrides, `dialogueConsumed`
  - Write a 2 fasi (tmp → commit); rifiuta payload incompleti; `delete_save` richiede slot esplicito
  - `load_game` non riesegue `on_room_change` / `on_game_start` (`skipRoomScripts`)
  - Stesso runtime → playtest + export HTML
  - **Limite:** quota `localStorage` del browser; salvataggi **non** nel file `.amnt`

#### 🟡 **Parzialmente Implementato**
- **Save metadata**: timestamp + label + roomId; ❌ screenshot
- **Storage**: localStorage (ok per stato piccolo); ❌ IndexedDB per quota elevate

#### ❌ **Mancante**
- **Auto-save gameplay**: Nessun autosave periodico durante la partita
- **Load game menu**: ✅ Tipo GUI `SaveLoad` (slot disegnabili); residuo: thumbnail/screenshot
- **Screenshot metadata** su slot

---

### 8. EXPORT (Sistema Export)

#### ✅ **Già Implementato**
- Export JSON progetto
- Export **`.amnt`** (progetto + asset embedded)
- Download / salvataggio file su disco
- Salvataggio OPFS per runtime
- **App editor desktop** Electron (Windows installer via `npm run dist`)

#### 🟡 **Parzialmente Implementato**
- **Export standalone HTML**: ✅ Export Game (HTML) one-click — singolo file con runtime + progetto + asset embedded (`JS/export-standalone.js`)
  - **Prossimo passo**: minificazione JS/CSS, compressione asset nell'export

#### ❌ **Mancante**
- **Export PWA**: Nessun export del gioco come Progressive Web App
- **Export gioco desktop**: Wrapper del solo gioco (non l'editor) — Electron/Tauri
- **Export mobile**: Nessun export ottimizzato mobile
- **Compressione export**: Nessuna compressione asset nell'export gioco
- **Build gioco ottimizzata**: Minificazione, tree-shaking per distribuzione finale

---

## 🎯 ROADMAP IN FASI

### **FASE 1: SOLIDITÀ RUNTIME E SCRIPTING** (Priorità CRITICA)

**Obiettivo**: Rendere il runtime completamente funzionale per gameplay base.

**✅ COMPLETATO - Runtime core (rendering, click, stanze, personaggi)**:
- ✅ Eventi (8): inclusi `on_gui_click`, `on_use_with`, `on_inventory_use_with`
- ✅ API base runtime: `print`, `show_message`, `move_object`, `load_room`, variabili (`getVariable`/`setVariable`)
- ✅ Personaggi: `spawn_character`, `move_character`, `walk_character`, `set_character_direction`, `animate_character`, `play_character_animation`

**✅ COMPLETATO - Unificazione API scripting** (vedi [`API_UNIFICATION_CHECKLIST.md`](API_UNIFICATION_CHECKLIST.md)):
- ✅ **Fase A:** `getScriptApiBindings`, `buildScriptExecutor`, `exposeScriptGlobals`
- ✅ **Fase B:** inventario, oggetti spawn, stanze, alias `Game.getVar`
- ✅ **Fase C:** `buildHandlerExecutionScope` + `runHandlerWithExecutionScope` negli handler
- ✅ **Fase D:** rimossi `sandboxApi` / `gameInventory` editor; `scriptName` stabile in Play Test

**⏳ Prossimo:** Fase E test manuali (checklist); sync inventario in `UPDATE_CONTEXT` se ancora necessario

**✅ COMPLETATO - Sistema Runtime Sandboxed**:
- ✅ Runtime sandboxed con iframe (`runtime-sandbox.html`, `allow-scripts allow-same-origin`)
- ✅ Sistema MessageQueue robusto (buffer, retry, fallback)
- ✅ GameAPI completo esposto agli script (`print()`, `error()`, `getVariable()`, `setVariable()`, `load_room()`, `getCurrentRoom()`, `getCurrentObject()`)
- ✅ ScriptLogService integrato con logging timestamped e livelli
- ✅ Gestione contesto esecuzione (roomId, objectId, variables)
- ✅ Sistema di inizializzazione con RUNTIME_READY e script pending

#### 1.1 ✅ Fix Sistema Print/Log Runtime - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo MessageQueue implementato
  - ✅ Buffer messaggi con coda (MAX_QUEUE_SIZE: 1000)
  - ✅ Retry mechanism con MAX_RETRIES: 3 e RETRY_DELAY: 100ms
  - ✅ Fallback a console locale se parent non disponibile
  - ✅ Sistema di priorità messaggi (errori hanno priorità alta)
  - ✅ Check disponibilità parent con intervallo configurabile
  - ✅ Gestione timeout e cleanup coda
- **GameAPI completo**: 
  - ✅ `GameAPI.print()` - Logging con serializzazione valori
  - ✅ `GameAPI.error()` - Error logging
  - ✅ `GameAPI.getVariable()` / `GameAPI.setVariable()` - Gestione variabili
  - ✅ `load_room()` - Carica una stanza per ID o nome
  - ✅ `GameAPI.getCurrentRoom()` / `GameAPI.getCurrentObject()` - Info contesto
- **ScriptLogService**: Sistema di logging integrato nell'editor con timestamp e livelli (info, warning, error)

#### 1.2 ✅ Implementare Interazioni Click Runtime - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo di hit detection e click handling
  - ✅ Hit detection per hotspot (polygon con `isPointInPolygon`), oggetti (bounding box), character (bounding box), GUI buttons
  - ✅ Sistema di click centralizzato (`handleCanvasClick`, `handleClick`) con protezioni multiple
  - ✅ Protezioni anti-doppio click: debounce (50ms), frame guard, stopImmediatePropagation
  - ✅ Dispatch eventi click agli script con priorità: hotspot > oggetti > character > GUI > pathfinding
  - ✅ Esecuzione script associati a hotspot/oggetti/character/GUI buttons
  - ✅ Gestione coordinate canvas con scaling CSS e devicePixelRatio
- **Tempo impiegato**: Completato

#### 1.3 ✅ Implementare Cambio Stanza Runtime - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo `changeRoom()` e `load_room()`
  - ✅ Cambio stanza con cleanup risorse (immagini, oggetti, hotspot)
  - ✅ Esecuzione script `on_room_change` automatica (`executeRoomChangeScripts`)
  - ✅ Caricamento asset stanza (background, foregrounds, oggetti, hotspot, walkable area)
  - ✅ Gestione transizione tra stanze con preload asset
  - ✅ Supporto cambio stanza per ID o nome
  - ✅ Posizionamento player opzionale con direzione iniziale
- **Tempo impiegato**: Completato

#### 1.4 ✅ Rendering Personaggi Runtime - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo di rendering personaggi
  - ✅ Rendering personaggi con animazioni 8-direzioni
  - ✅ Supporto pivot per posizionamento corretto (pivotX, pivotY)
  - ✅ Character scaling dinamico basato su posizione Y (`calculateCharacterScale`)
  - ✅ Sub-pixel rendering per movimento fluido (renderX, renderY)
  - ✅ Gestione frame animazione (idle frame 0, movimento frame 1+)
  - ✅ Animazioni custom nominate in editor (`animations.{nome}`) + API `play_character_animation`
  - ✅ Z-ordering automatico (personaggi renderizzati dopo oggetti di scena)
  - ✅ Gestione frame specchiati (Canvas) e frame normali (Image)
  - ✅ Placeholder rendering quando frame non disponibili
- **Tempo impiegato**: Completato

#### 1.5 ✅ Unificazione API — Fase A (infrastruttura) - COMPLETATO
- **Stato**: ✅ Completato (maggio 2026)
- **Implementazione**:
  - `SUPPORTED_SCRIPT_HANDLERS` centralizzato
  - `getScriptApiBindings()` — elenco unico API per `compileScript` e `window`
  - `buildScriptExecutor()` — sostituisce `new Function` duplicati
  - `exposeScriptGlobals()` — esposizione globale coerente
  - API personaggio incluse nei parametri di compilazione (prima solo su `window`)

#### 1.6 Sistema Inventario Runtime — API ✅ / GUI ✅
- **Stato API**: ✅ 8 API inventario in `GameAPI` + use-with (`on_use_with`, `on_inventory_use_with`)
- **Stato GUI**: ✅ pannello/slot/carried/use-with testati; residuo opz. drag&drop/tooltip

**Totale Fase 1**: runtime scripting unificato; focus su Fase E test + polish

---

### **FASE 2: GAMEPLAY CORE** (Priorità ALTA)

**Obiettivo**: Implementare meccaniche base di gameplay punta e clicca.

#### 2.1 ✅ Pathfinding e Movimento Personaggio - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo di pathfinding e movimento
  - ✅ Pathfinding su walkable area polygon con verifica percorso valido (`findPath`)
  - ✅ Click-to-move del player con pathfinding automatico
  - ✅ Animazione movimento con direzione corretta (8 direzioni, `getDirectionFromVector`)
  - ✅ Smooth movement con sub-pixel rendering (renderX, renderY)
  - ✅ Gestione pivot per posizionamento corretto durante movimento
  - ✅ Sistema di scaling basato su posizione Y (character scaling)
  - ✅ Gestione dead ends e posizioni sicure (`findSafePositionNearTarget`)
  - ✅ Verifica spazio movimento (`hasMovementSpace`) per evitare incastri
  - ✅ Gestione velocità movimento configurabile (moveSpeed in pixel/secondo)
  - ✅ Velocità scalata con profondità (rallenta verso background line; opzione per character)
  - ✅ Animazioni: idle (frame 0) quando fermo, movimento (frame 1+) quando cammina
- **Tempo impiegato**: Completato

#### 2.2 ✅ Rendering GUI Runtime - COMPLETATO
- **Stato**: ✅ Completato
- **Implementazione**: Sistema completo di rendering GUI
  - ✅ Rendering overlay GUI con background immagini
  - ✅ Rendering pulsanti GUI con immagini e testo
  - ✅ Sistema di click su pulsanti GUI funzionante (hit detection bounding box)
  - ✅ Esecuzione script associati a pulsanti (`on_gui_click`)
  - ✅ Fallback rendering (rettangolo verde) quando immagine non disponibile
  - ✅ Gestione pulsanti abilitati/disabilitati
- **Tempo impiegato**: Completato

#### 2.3 Sistema Cursori Contestuali Runtime
- **Stato**: ✅ Completato (luglio 2026)
- **Implementazione**:
  - ✅ Caricamento cursori per categoria da progetto (`loadCursors`)
  - ✅ Hover detection runtime (inventario, GUI, hotspot, oggetto, personaggio, walkable)
  - ✅ Categorie: `use` / `talk` / `grab` / `exit` / `walk` / `wait` / `default` con fallback
  - ✅ Action text overlay in playtest
  - ✅ Cursore `wait` durante input lock; nascosto con oggetto inventario in mano
- **Tempo impiegato**: Completato

#### 2.4 ✅ Sistema Dialoghi + grafo ramificato + editor visuale — COMPLETATO (base)
- **Stato**: ✅ Completato (ottobre 2026) — backlog residuo solo localisation / talking-head
- **Completato**:
  - API: `show_dialogue`, `show_dialogue_text`, `end_dialogue`, `start_dialogue(idOrName)`
  - Rendering balloon DialogBox (+ ritratto/mood a sinistra del balloon); coda comandi; click per avanzare
  - Grafo in `project.dialogues`: `line` / `choice` / `jump` / `action` / `end`
  - Condizioni declarative (`has_item`, `var`, `and`/`or`/`not`), once-only (+ `dialogueConsumed` in save), actions + `run_script` inline
  - Helpers: `JS/lib/dialogue-logic.js`, validazione `JS/lib/dialogue-validate.js`
  - Tab **Dialogues** + editor **Form** / **Visual**: canvas DOM/SVG, inspector, undo/redo, Validate, Preview Play Test
  - Stesso modello in memoria → playtest + export HTML (`runtime.js` unico; no secondo engine)
  - Docs: `docs/DIALOGUE_VISUAL_EDITOR.md`; smoke: `npm test`; checklist: `tests/MANUAL.md`
- **Residuo (non bloccante)**: localisation keys; talking-head / lip-sync
- **Tempo impiegato**: Completato (MVP visuale + ritratti + tab dedicata)

**Totale Fase 2**: core gameplay ✅ (inventario GUI ✅; SaveLoad GUI ✅)

---

### **FASE 3: SISTEMI AVANZATI** (Priorità MEDIA)

**Obiettivo**: Aggiungere sistemi avanzati per gameplay ricco.

#### 3.1 Sistema Audio
- **Stato**: 🟡 Parzialmente implementato
- **✅ Runtime:** `play_music()`, `play_sound()`, `stop_music()`, `stop_sound()`; import audio in Resources
- **❌ Mancante:** `set_music_volume()`, `play_ambient_sound()`, fade in/out, mixer

#### 3.2 Sistema Effetti Visivi
- **Stato**: ❌ Mancante
- **Problema**: Nessun sistema di transizioni/effetti
- **Soluzione**:
  - API scripting: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`
  - Sistema di transizioni (fade, slide, dissolve)
  - Cutscene system con timeline
- **Tempo stimato**: 6-8 giorni

#### 3.3 Sistema Personaggi Avanzato
- **Stato**: 🟡 Parzialmente implementato
- **✅ Già in runtime:** `spawn_character`, `move_character`, `walk_character`, `set_character_direction`, `set_character_visibility`, `set_character_opacity`, `animate_character`, `play_character_animation` (+ pathfinding player; animazioni custom nominate in editor)
- **✅ Editor:** animazioni custom con nome (`animations.wave`, ecc.) e 8 direzioni
- **❌ Mancante:** AI (patrol, follow), loop/repeat animazione da script, NPC scheduling
- **Tempo stimato**: 5-7 giorni (solo parti AI/stato)

#### 3.4 Sistema Salvataggi Gioco
- **Stato**: 🟡 API + UI SaveLoad ✅ — autosave partita / IndexedDB / screenshot ancora da fare
- **Completato**:
  - API: `save_game`, `load_game`, `delete_save` (slot required), `get_save_info`, `show_gui`, `hide_gui`
  - GUI type `SaveLoad`: slot disegnabili, mode save/load/both
  - Slot 1–10 (o id stringa); formato versionato `amianto-save` + validate/migrate
  - Stato: room, vars, inventory, characters, oggetti/hotspot, dialogueConsumed
- **Mancante**:
  - Autosave periodico in partita, screenshot thumbnail, IndexedDB
- **Tempo stimato residuo**: 2–4 giorni

**Totale Fase 3**: ~24-32 giorni lavorativi

---

### **FASE 4: MIGLIORIE EDITOR** (Priorità MEDIA-BASSA)

**Obiettivo**: Migliorare esperienza di editing.

#### 4.1 Asset Manager Centralizzato
- **Stato**: 🟡 Tab **Resources** ✅ (immagini + audio, IndexedDB, picker) — statistiche uso / deduplica ❌
- **Completato**: import, ricerca, griglia, Browse da altri editor (Characters portraits, Dialogues, BG/FG, …)
- **Mancante**:
  - Statistiche “dove è usato” per asset
  - Filtri avanzati / sostituzione globale
- **Tempo stimato residuo**: 2-3 giorni

#### 4.2 Deduplicazione e Ottimizzazione Asset
- **Stato**: 🟡 Parzialmente implementato
- **Problema**: Asset duplicati, nessuna compressione
- **Soluzione**:
  - Sistema hash per deduplicare asset identici
  - Compressore automatico per immagini > 1MB
  - Thumbnail generation automatica
- **Tempo stimato**: 3-4 giorni

#### 4.3 Autosave e Versionamento
- **Stato**: 🟡 Autosave periodico ✅ / versionamento ❌
- **Completato**: debounce `.amnt` (2.5s) + interval 45s se dirty + status header; fix feedback-loop dirty durante persist
- **Mancante**: backup timestamped multipli e ripristino versioni
- **Tempo stimato residuo**: 2-3 giorni

#### 4.4 Validazione e Template
- **Stato**: ❌ Mancante
- **Problema**: Nessuna validazione, nessun template
- **Soluzione**:
  - Validatore struttura progetto
  - Template predefiniti (empty, tutorial, example)
  - Wizard creazione progetto
- **Tempo stimato**: 3-4 giorni

**Totale Fase 4**: ~13-17 giorni lavorativi

---

### **FASE 5: EXPORT E DISTRIBUZIONE** (Priorità BASSA)

**Obiettivo**: Permettere distribuzione giochi creati.

#### 5.1 Export Standalone HTML
- **Stato**: ✅ Completato (base, luglio 2026)
- **Implementazione**:
  - ✅ Pulsante **Export Game (HTML)** in tab Projects
  - ✅ File unico: shell player + `runtime.js` inline + progetto + asset base64
  - ✅ Shim `assetStorage` embedded per risolvere `asset:` offline
  - ✅ Dialogo salvataggio Electron / File System Access / download browser
- **Residuo**: minificazione, compressione asset, PWA
- **Tempo impiegato**: Completato (MVP)

#### 5.2 Export PWA
- **Stato**: ❌ Mancante
- **Problema**: Nessun export come PWA
- **Soluzione**:
  - Generare manifest.json
  - Service worker per offline
  - Icone e splash screen
- **Tempo stimato**: 4-5 giorni

#### 5.3 Export Desktop
- **Stato**: ❌ Mancante
- **Problema**: Nessun export desktop
- **Soluzione**:
  - Wrapper Electron o Tauri
  - Build system per Windows/Mac/Linux
  - Installer automatico
- **Tempo stimato**: 7-10 giorni

#### 5.4 Compressione e Ottimizzazione Export
- **Stato**: ❌ Mancante
- **Problema**: Export non ottimizzato
- **Soluzione**:
  - Compressione immagini
  - Tree-shaking JS
  - Bundle ottimizzato
- **Tempo stimato**: 4-5 giorni

**Totale Fase 5**: ~18-24 giorni lavorativi

---

## ⚠️ PROBLEMI STRUTTURALI CRITICI

### 1. ✅ **Comunicazione Editor↔Runtime - RISOLTO**
- **Problema originale**: postMessage può perdere messaggi, window.opener può essere null
- **Soluzione implementata**: ✅ Sistema MessageQueue completo con:
  - Buffer messaggi con coda (MAX_QUEUE_SIZE: 1000)
  - Retry mechanism (MAX_RETRIES: 3, RETRY_DELAY: 100ms)
  - Fallback a console locale se parent non disponibile
  - Sistema di priorità messaggi
  - Check disponibilità parent periodico
- **Stato**: ✅ Completato e funzionante

### 2. **Mancanza Sistema di Eventi Runtime**
- **Problema**: Runtime non ha sistema eventi centralizzato
- **Impatto**: Difficile aggiungere nuove interazioni
- **Soluzione**: Implementare EventEmitter pattern nel runtime

### 3. **Nessun Sistema di Resource Management**
- **Problema**: Immagini caricate ma non gestite (memory leak potenziale)
- **Impatto**: Performance degrada con molti asset
- **Soluzione**: Resource pool con cleanup automatico, LRU cache

### 4. **Scripting API Inconsistente** — ✅ RISOLTO (Fasi A–D)
- **Problema originale**: API solo in editor legacy; Play Test senza inventario/oggetti/alias variabili
- **Soluzione**: `getScriptApiBindings()` + `buildHandlerExecutionScope()` in `runtime.js`; `sandboxApi` / `gameInventory` rimossi da `main.js`
- **Residuo**: test manuali Fase E; allineare `GAME_API_COMPLETIONS` con ogni nuova API

---

## 📈 PRIORITÀ SVILUPPO RACCOMANDATE

### ✅ **Completato — Runtime, dialoghi, save, export**
- ✅ Rendering, click, stanze, pathfinding, personaggi (8 dir. + visibility/opacity), GUI overlay, cursori contestuali
- ✅ MessageQueue / sandbox iframe / `compileScript` + unificazione API Fasi A–D
- ✅ Dialoghi ramificati + tab Dialogues + editor Form/Visual + ritratti/mood + Preview
- ✅ Messaggi/dialoghi bloccanti; `load_room` Before/After; script room-change distinti
- ✅ Save/load gioco API v1 + autosave progetto (cache vs disk)
- ✅ Export Game (HTML) + smoke test (`npm test`) + `tests/MANUAL.md`

### **Immediato — Qualità**
1. ⏳ Test manuali Fase E (`API_UNIFICATION_CHECKLIST.md`) + checklist `tests/MANUAL.md`
2. ✅ Inventario GUI testato; ✅ GUI SaveLoad (slot + `show_gui`/`hide_gui`)

### **Breve termine — Ship gameplay**
3. ~~UI slot save in-game~~ ✅ (tipo GUI `SaveLoad`)
4. Audio avanzato: volumi + fade (Fase 3.1)
5. Transizioni stanza: `fade_in` / `fade_out` / `transition_to_room` (Fase 3.2)

### **Medio termine**
6. Menu pausa / quit
7. Save gioco: IndexedDB + autosave partita + screenshot metadata
8. Resources: statistiche uso + deduplica; backup timestamped progetti

### **Lungo termine**
9. Migliorie editor (template, validatore progetto) — Fase 4
10. Export PWA / wrapper desktop del solo gioco / minify — Fase 5
11. Dialoghi: localisation / talking-head (opzionale)

---

## 🎯 OBIETTIVO FINALE

**Amianto Editor** dovrebbe permettere di:
1. ✅ Creare stanze, oggetti, personaggi, GUI, libreria Resources
2. ✅ Scrivere script JavaScript nel Play Test con API unificate (inventario, oggetti, stanze, variabili, dialoghi visuali)
3. 🟡 Gameplay punta-e-clicca completo (cammina, clic, use-with, dialoghi ✅; show/hide personaggio ✅; inventario GUI ✅; SaveLoad GUI ✅; audio base ✅; transizioni ❌)
4. 🟡 Distribuzione: editor desktop `.exe` + `.amnt` ✅; export *gioco* HTML standalone ✅ (PWA / wrapper gioco desktop ❌)

**La roadmap qui sopra porta al completamento di tutti questi obiettivi.**

---

*Roadmap aggiornata: Ottobre 2026*
*Versione progetto: 1.0.0 (offline / Electron)*
*Ultimo aggiornamento: inventario GUI ✅ testato; tipo GUI SaveLoad (slot disegnabili + show_gui/hide_gui); priorità su Fase E / audio / transizioni*

