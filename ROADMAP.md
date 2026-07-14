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
- [`API_UNIFICATION_CHECKLIST.md`](API_UNIFICATION_CHECKLIST.md) — piano tecnico unificazione API editor ↔ runtime

**✅ Nota (luglio 2026):** Editor **offline** senza Firebase/Supabase. Formato progetto **`.amnt`**. Unificazione API **Fasi A–D** completata. **Dialoghi base ✅**, **animazioni stanza ✅**, **audio base ✅** (`play_music`/`play_sound`), inventario runtime parziale. Prossimi step: scelte dialogo, mixer audio, cursori in playtest, transizioni, save slot gioco.

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
- **Salvataggio automatico**: Esiste debounce OPFS ma non autosave periodico
  - **Prossimo passo**: Implementare autosave ogni 30-60 secondi con indicatore visivo

#### ❌ **Mancante**
- **Versionamento progetti**: Nessun sistema di backup/versioni
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
- **Asset manager centralizzato**: Tab **Resources** con immagini e suoni in **IndexedDB** (import, ricerca, picker); mancano statistiche uso globali e deduplica
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
- **Sistema di dialogo GUI**: Balloon su personaggio via script (`show_dialogue`)
  - ✅ Rendering balloon (testo, colori, immagine opzionale da GUI DialogBox)
  - ✅ Balloon segue il personaggio; chiusura con click
  - **Prossimo passo**: Scelte ramificate (`show_dialogue_choices`), `start_dialogue` session
- **Sistema inventario GUI**: Inventory GUI parziale
  - ✅ Rendering pannello, slot, oggetto in mano (carriedItem)
  - ✅ Combinazioni use-with (hotspot, object, character, inventory)
  - **Prossimo passo**: drag&drop slot, tooltip
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
- **Eventi (8):** `on_game_start`, `on_room_change`, `on_object_click`, `on_character_click`, `on_hotspot_click`, `on_gui_click`, `on_use_with`, `on_inventory_use_with` (click con `usedItemId` opzionale dove applicabile)
- **Base:** `print`, `show_message` / `showText`, `move_object`, `enableObject`, `disableObject`
- **Dialoghi (base):** `show_dialogue`, `show_dialogue_text`, `end_dialogue`
- **Hotspot:** `enableHotspot`, `disableHotspot` (campo `visible`; checkbox **Is active?** in editor)
- **Stanze:** `load_room`, `getCurrentRoom` (alias snake_case `get_current_room` — Fase B)
- **Variabili:** `getVariable`, `setVariable` su `gameState.variables` (alias `Game.getVar` — Fase B)
- **Personaggi:** `spawn_character`, `move_character`, `walk_character`, `set_character_direction`, `animate_character`, `play_character_animation` (animazioni custom da editor)
- **Animazioni stanza:** `play_animation`, `stop_animation` (istanze posizionate in editor)
- **Audio:** `play_music`, `play_sound`, `stop_music`, `stop_sound`
- Compilazione script con cache handler (`compileScript` / `executeScriptHandler`)

#### ✅ **API runtime (Fase B completata)**
- Inventario, oggetti dinamici, stanze, alias variabili — tutti in `GameAPI` + `getScriptApiBindings()`

#### 🟡 **Qualità scripting**
- Error handling: migliorare stack trace negli script utente
- Test manuali checklist Fase E (`await` + inventario nello stesso handler)

#### ❌ **Mancante (backlog)**
- Dialoghi avanzati: `start_dialogue()`, `show_dialogue_choices()`, mood/relazioni
- Audio avanzato: volumi, ambient, fade musica
- Effetti: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`
- Salvataggio gioco: `save_game()`, `load_game()`, slot, metadata
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
  - ✅ Esecuzione script `on_room_change` automatica
  - ✅ Caricamento asset stanza (background, foregrounds, oggetti, hotspot)
  - ✅ Gestione transizione tra stanze
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
- **Rendering GUI**: ✅ Sistema completo implementato
  - ✅ Rendering overlay GUI con background immagini
  - ✅ Rendering pulsanti GUI con immagini e testo
  - ✅ Sistema di click su pulsanti GUI funzionante
  - ✅ Esecuzione script associati a pulsanti

#### 🟡 **Parzialmente Implementato**
- **Sistema inventario runtime**
  - ✅ API inventario in `runtime.js` (`add_to_inventory`, use-with, `get_carried_item`, …)
  - ✅ Rendering GUI inventario parziale (pannello, slot, oggetto in mano, combinazioni)
  - **Prossimo passo**: drag&drop slot, tooltip, sync `UPDATE_CONTEXT` editor↔runtime
- **Sistema cursori contestuali**
  - ✅ Definizione e hover sul **canvas editor** (`checkContextualCursor` in `main.js`)
  - ❌ Cambio cursore dinamico in **playtest/runtime** (cursore `pointer` o custom inventario)
  - **Prossimo passo**: Hover detection runtime + immagini cursore da progetto

#### ❌ **Mancante**
- **Sistema dialogo visuale**: 🟡 Balloon base implementato (`show_dialogue`)
  - **Prossimo passo**: Scelte ramificate, animazioni GUI dialogo avanzate
- **Sistema audio runtime**: 🟡 `play_music` / `play_sound` base implementati
  - **Prossimo passo**: Mixer volumi, ambient layers, fade
- **Sistema transizioni**: Nessun sistema di transizioni tra stanze
  - **Prossimo passo**: Fade in/out, slide, dissolve tra stanze
- **Sistema pause/menu**: Nessun sistema di pausa o menu principale
  - **Prossimo passo**: Menu GUI con opzioni, pausa, quit

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
- Salvataggio progetto editor (`.amnt`, cache locale)

#### ❌ **Mancante**
- **Sistema salvataggi gioco**: Nessun sistema per salvare stato gioco durante il gameplay
  - **Prossimo passo**: Sistema slot salvataggi (1-10), serializzazione stato gioco
- **Auto-save**: Nessun autosave durante gameplay
  - **Prossimo passo**: Autosave periodico (ogni 5 minuti) con indicatore
- **Save metadata**: Nessuna info su salvataggi (data, screenshot, progresso)
  - **Prossimo passo**: Metadata salvataggi con timestamp, screenshot, nome slot
- **Load game menu**: Nessun menu per caricare salvataggi
  - **Prossimo passo**: Menu GUI per visualizzare/caricare/eliminare salvataggi

---

### 8. EXPORT (Sistema Export)

#### ✅ **Già Implementato**
- Export JSON progetto
- Export **`.amnt`** (progetto + asset embedded)
- Download / salvataggio file su disco
- Salvataggio OPFS per runtime
- **App editor desktop** Electron (Windows installer via `npm run dist`)

#### 🟡 **Parzialmente Implementato**
- **Export standalone HTML**: Nessun export completo del *gioco* come HTML standalone
  - **Prossimo passo**: Generare HTML standalone con progetto embedded, runtime incluso

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

**⏳ Prossimo:** Fase E test manuali (checklist); sync inventario in `UPDATE_CONTEXT`; cursori runtime

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

#### 1.6 Sistema Inventario Runtime — API ✅ / GUI 🟡
- **Stato API**: ✅ 8 API inventario in `GameAPI` + use-with (`on_use_with`, `on_inventory_use_with`)
- **Stato GUI**: 🟡 rendering parziale; combinazioni ✅; mancano drag&drop, tooltip
- **Tempo stimato GUI**: 3-4 giorni

**Totale Fase 1**: runtime scripting unificato; prossimo focus GUI inventario + Fase E test

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
- **Stato**: 🟡 Parzialmente implementato
- **Problema**: Cursori definiti ma cambio dinamico non implementato
- **Implementazione attuale**:
  - ✅ Cursor fisso 'pointer' implementato
  - ❌ Cambio cursore in base a hover su hotspot/character/object non funzionante
- **Soluzione**:
  - Hit detection hover per hotspot/character/object
  - Cambio cursore dinamico in base a hover
  - Visual feedback con action text
- **Tempo stimato**: 3-4 giorni

#### 2.4 Sistema Dialoghi Base
- **Stato**: 🟡 Parziale (maggio 2026)
- **Completato**:
  - API scripting: `show_dialogue(character, text)`, `show_dialogue_text(text, speaker)`, `end_dialogue()`
  - Rendering balloon DialogBox (colori, immagine balloon, `appear`: instant/fade/slide)
  - Balloon segue il personaggio in play test; chiusura con click; coda comandi
- **Mancante**:
  - `start_dialogue()`, `show_dialogue_choices()`, risposta giocatore
  - Sistema di scelte ramificate e mood/relazioni
- **Tempo stimato residuo**: 4-6 giorni

**Totale Fase 2**: ~20-27 giorni lavorativi

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
- **✅ Già in runtime:** `spawn_character`, `move_character`, `walk_character`, `set_character_direction`, `animate_character`, `play_character_animation` (+ pathfinding player; animazioni custom nominate in editor)
- **✅ Editor:** animazioni custom con nome (`animations.wave`, ecc.) e 8 direzioni
- **❌ Mancante:** AI (patrol, follow), loop/repeat animazione da script, NPC scheduling
- **Tempo stimato**: 5-7 giorni (solo parti AI/stato)

#### 3.4 Sistema Salvataggi Gioco
- **Stato**: ❌ Mancante
- **Problema**: Nessun sistema per salvare stato gioco
- **Soluzione**:
  - API scripting: `save_game()`, `load_game()`, `delete_save()`, `get_save_info()`
  - Sistema slot salvataggi (1-10)
  - Serializzazione stato gioco completo
  - Menu GUI per salvataggi
  - Auto-save periodico
- **Tempo stimato**: 6-8 giorni

**Totale Fase 3**: ~24-32 giorni lavorativi

---

### **FASE 4: MIGLIORIE EDITOR** (Priorità MEDIA-BASSA)

**Obiettivo**: Migliorare esperienza di editing.

#### 4.1 Asset Manager Centralizzato
- **Stato**: ❌ Mancante
- **Problema**: Asset sparsi, nessuna vista unificata
- **Soluzione**:
  - Tab "Assets" con lista completa
  - Ricerca, filtri, statistiche uso
  - Preview, eliminazione, sostituzione
- **Tempo stimato**: 4-5 giorni

#### 4.2 Deduplicazione e Ottimizzazione Asset
- **Stato**: 🟡 Parzialmente implementato
- **Problema**: Asset duplicati, nessuna compressione
- **Soluzione**:
  - Sistema hash per deduplicare asset identici
  - Compressore automatico per immagini > 1MB
  - Thumbnail generation automatica
- **Tempo stimato**: 3-4 giorni

#### 4.3 Autosave e Versionamento
- **Stato**: 🟡 Parzialmente implementato (debounce OPFS)
- **Problema**: Nessun autosave periodico, nessun versionamento
- **Soluzione**:
  - Autosave ogni 30-60 secondi con indicatore
  - Sistema backup timestamped
  - Ripristino versioni precedenti
- **Tempo stimato**: 3-4 giorni

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
- **Stato**: 🟡 Parzialmente implementato
- **Problema**: Export base ma non ottimizzato
- **Soluzione**:
  - Generare HTML standalone con progetto embedded
  - Runtime incluso, nessuna dipendenza esterna
  - Minificazione JS/CSS
- **Tempo stimato**: 3-4 giorni

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

### ✅ **Completato — Runtime e gameplay base**
- ✅ Rendering, click, stanze, pathfinding, personaggi (8 dir.), GUI overlay
- ✅ MessageQueue / log runtime, iframe sandbox, cache script (`compileScript`)
- ✅ **Fase A unificazione API:** binding unico `getScriptApiBindings` + `buildScriptExecutor`
- ✅ API personaggio script nel runtime

### **Immediato — Qualità e gameplay**
1. ✅ Unificazione API Fasi A–D — COMPLETATO
2. ⏳ Test manuali Fase E (`API_UNIFICATION_CHECKLIST.md`)
3. Inventario GUI: drag&drop, tooltip, sync contesto
4. Cursori contestuali in runtime/playtest (Fase 2.3)
5. ~~Dialoghi base~~ ✅ balloon + `show_dialogue`

### **Breve Termine**
6. Scelte dialogo ramificate (resto Fase 2.4)
7. Sistema audio runtime (Fase 3.1)

### **Medio Termine (Settimane 9-16)**
9. Scelte dialogo ramificate (Fase 2.4 resto)
10. Sistema audio (Fase 3.1)
11. Sistema effetti visivi (Fase 3.2)
12. Sistema salvataggi gioco (Fase 3.4)

### **Lungo Termine (Settimane 17+)**
13. Migliorie editor (Fase 4)
14. Export e distribuzione (Fase 5)

---

## 🎯 OBIETTIVO FINALE

**Amianto Editor** dovrebbe permettere di:
1. ✅ Creare stanze, oggetti, personaggi, GUI, libreria Resources (completato)
2. ✅ Scrivere script JavaScript nel Play Test con API unificate (inventario, oggetti, stanze, variabili, dialoghi)
3. 🟡 Gameplay punta-e-clicca completo (cammina, clic, use-with, inventario GUI parziale ✅; audio/transizioni/save gioco ❌)
4. 🟡 Distribuzione: editor desktop `.exe` + `.amnt` ✅; export *gioco* standalone HTML/PWA ❌

**La roadmap qui sopra porta al completamento di tutti questi obiettivi.**

---

*Roadmap aggiornata: Luglio 2026*
*Versione progetto: 1.0.0 (offline / Electron)*
*Ultimo aggiornamento: editor offline, formato .amnt, rimozione stack cloud, runtime-sandbox.html*

