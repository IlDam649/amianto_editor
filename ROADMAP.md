# 🗺️ ROADMAP COMPLETA - Amianto Editor

## Analisi Architettura Attuale

**Amianto Editor** è una webapp per creare giochi punta e clicca nel browser. L'architettura è divisa in:
- **Editor** (`index.html` + `JS/main.js`): Interfaccia di editing con tabs
- **Runtime Standalone** (`runtime.html` + `JS/runtime.js`): Player standalone per test/gioco
- **Runtime Sandboxed** (iframe + `JS/runtime.js`): Esecuzione script isolata durante Play Test con sistema MessageQueue robusto
- **Backend**: Firebase (autenticazione, storage progetti)
- **Scripting**: JavaScript eseguito in iframe sandboxed (`sandbox="allow-scripts"`) per isolamento completo e sicurezza

---

## 📊 STATO ATTUALE PER MACRO-AREA

### 1. PROJECT (Gestione Progetti)

#### ✅ **Già Implementato**
- Struttura JSON progetto completa (`serializeProject()`)
- Salvataggio multi-backend: OPFS + localStorage + Firebase
- Caricamento progetti da storage
- Export/Import JSON
- Project Settings (nome, dimensioni canvas)
- Gestione progetti per utente

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
- Upload GUI backgrounds e cursors
- Cache immagini in memoria

#### 🟡 **Parzialmente Implementato**
- **Deduplicazione asset**: Immagini salvate come dataURL, possibile duplicazione
  - **Prossimo passo**: Sistema hash per deduplicare asset identici
- **Ottimizzazione immagini**: Nessuna compressione/ridimensionamento automatico
  - **Prossimo passo**: Compressore automatico per immagini > 1MB

#### ❌ **Mancante**
- **Asset manager centralizzato**: Nessuna vista unificata di tutti gli asset
  - **Prossimo passo**: Tab "Assets" con lista completa, ricerca, statistiche uso
- **Supporto audio**: Nessun sistema per caricare/gestire audio
  - **Prossimo passo**: Upload audio (MP3/OGG) con preview player
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

#### 🟡 **Parzialmente Implementato**
- **Rendering GUI nel runtime**: GUI salvata ma non renderizzata nel runtime
  - **Prossimo passo**: Implementare rendering GUI overlay nel runtime.js
- **Interazioni GUI nel runtime**: Click su pulsanti non gestiti
  - **Prossimo passo**: Sistema di eventi click per pulsanti GUI nel runtime
- **Layout responsive**: GUI non si adatta a dimensioni canvas diverse
  - **Prossimo passo**: Sistema di scaling/anchoring per GUI responsive

#### ❌ **Mancante**
- **Sistema di dialogo GUI**: Nessun sistema per mostrare dialoghi
  - **Prossimo passo**: Implementare DialogBox GUI con testo, scelte, callback
- **Sistema inventario GUI**: Inventory GUI non funzionale
  - **Prossimo passo**: Rendering inventario con drag&drop, tooltip, combinazioni
- **Animazioni GUI**: Nessun sistema di animazioni per elementi GUI
  - **Prossimo passo**: Fade in/out, slide, scale per elementi GUI
- **Stili GUI**: Nessun sistema di temi/stili per GUI
  - **Prossimo passo**: Sistema di stili (colori, font, bordi) per GUI

---

### 4. SCRIPTING (Sistema di Scripting)

#### ✅ **Già Implementato**
- Editor CodeMirror con syntax highlighting JavaScript
- Sandbox Jailed per esecuzione sicura
- **Sistema eventi completo (5 API)**: `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`
- **API base (3 API)**: `print()`, `show_message()`, `move_object()`
- **API inventario completo (5 API)**: `add_to_inventory()`, `remove_from_inventory()`, `has_item()`, `get_item_count()`, `clear_inventory()`
- **API oggetti completo (5 API)**: `spawn_object()`, `despawn_object()`, `rotate_object()`, `scale_object()`, `set_object_visible()`
- **API stanze completo (4 API)**: `load_room()`, `get_current_room()`, `get_room_objects()`, `set_room_background()`
- **Sistema variabili completo (4 API)**: `Game.getVar()`, `Game.setVar()`, `Game.hasVar()`, `Game.toggleVar()` (con alias `get_var()`, `set_var()`, `has_var()`, `toggle_var()`)
- Attach script a rooms, objects, characters, hotspots, GUI buttons, cursors
- Salvataggio/caricamento script nel progetto
- **Totale: 24 API funzionanti implementate**

#### 🟡 **Parzialmente Implementato**
- **Print/log nel runtime**: Sistema postMessage funziona ma ha problemi di sincronizzazione
  - **Prossimo passo**: Fixare comunicazione editor↔runtime, aggiungere retry mechanism
- **Error handling**: Errori script non sempre catturati correttamente
  - **Prossimo passo**: Migliorare try/catch e logging errori con stack trace
- **Autocomplete API**: CodeMirror hints non include tutte le API disponibili
  - **Prossimo passo**: Aggiornare hints con tutte le API documentate

#### ❌ **Mancante**
- **Sistema dialogo**: Nessuna API per dialoghi ramificati
  - **Prossimo passo**: `start_dialogue()`, `show_dialogue_text()`, `show_dialogue_choices()`
- **Sistema audio**: Nessuna API per musica/effetti sonori
  - **Prossimo passo**: `play_music()`, `play_sound()`, `set_music_volume()`, `play_ambient_sound()`
- **Sistema personaggi avanzato**: Nessuna API per movimento/animazione personaggi
  - **Prossimo passo**: `move_character()`, `animate_character()`, `set_character_direction()`, `spawn_character()`
- **Sistema effetti visivi**: Nessuna API per transizioni/effetti
  - **Prossimo passo**: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`
- **Sistema salvataggio gioco**: Nessuna API per salvare stato gioco (non progetto)
  - **Prossimo passo**: `save_game()`, `load_game()`, `delete_save()`, `get_save_info()`
- **Utility functions**: Nessuna funzione helper matematica/geometria
  - **Prossimo passo**: `distance()`, `angle_between()`, `lerp()`, `shuffle_array()`

---

### 5. RUNTIME (Sistema di Esecuzione)

#### ✅ **Già Implementato**
- Caricamento JSON progetto
- Rendering stanze (background, foregrounds, scene objects)
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
- **Sistema inventario runtime**: API funzionanti ma rendering mancante
  - ✅ API scripting complete (`add_to_inventory()`, `remove_from_inventory()`, `has_item()`, `get_item_count()`, `clear_inventory()`)
  - ❌ Rendering inventario GUI non implementato
  - **Prossimo passo**: Implementare rendering inventario GUI con drag&drop, tooltip

#### ❌ **Mancante**
- **Sistema cursori contestuali**: Cursori definiti ma cambio dinamico non implementato
  - ❌ Cambio cursore in base a hover su hotspot/character/object non funzionante
  - ✅ Cursor fisso 'pointer' implementato
  - **Prossimo passo**: Sistema hover detection e cambio cursore dinamico con action text
- **Sistema inventario visuale**: Inventario non visibile nel runtime
  - **Prossimo passo**: Rendering inventario GUI con drag&drop, tooltip
- **Sistema dialogo visuale**: Nessun rendering dialoghi
  - **Prossimo passo**: Rendering DialogBox GUI con testo, scelte, animazioni
- **Sistema audio runtime**: Nessun sistema audio
  - **Prossimo passo**: Audio context, gestione musica/SFX, mixer volumi
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
- Salvataggio progetto (editor)
- Salvataggio in OPFS/localStorage/Firebase

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
- Download file .amianto.json
- Salvataggio OPFS per runtime

#### 🟡 **Parzialmente Implementato**
- **Export standalone HTML**: Nessun export completo standalone
  - **Prossimo passo**: Generare HTML standalone con progetto embedded, runtime incluso

#### ❌ **Mancante**
- **Export PWA**: Nessun export come Progressive Web App
  - **Prossimo passo**: Generare manifest.json, service worker, icona per PWA
- **Export desktop**: Nessun export come app desktop
  - **Prossimo passo**: Wrapper Electron o Tauri per export desktop
- **Export mobile**: Nessun export ottimizzato mobile
  - **Prossimo passo**: Versione mobile-responsive, touch controls
- **Compressione export**: Nessuna compressione asset nell'export
  - **Prossimo passo**: Minificazione JS, compressione immagini, tree-shaking
- **Export con build**: Nessun sistema di build ottimizzato
  - **Prossimo passo**: Build system che ottimizza asset, bundle JS, CSS

---

## 🎯 ROADMAP IN FASI

### **FASE 1: SOLIDITÀ RUNTIME E SCRIPTING** (Priorità CRITICA)

**Obiettivo**: Rendere il runtime completamente funzionale per gameplay base.

**✅ COMPLETATO - Sistema Scripting API (24 API implementate)**:
- ✅ Sistema eventi (5 API): `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`
- ✅ Sistema inventario (5 API): `add_to_inventory()`, `remove_from_inventory()`, `has_item()`, `get_item_count()`, `clear_inventory()`
- ✅ Sistema oggetti (5 API): `spawn_object()`, `despawn_object()`, `rotate_object()`, `scale_object()`, `set_object_visible()`
- ✅ Sistema stanze (4 API): `load_room()`, `get_current_room()`, `get_room_objects()`, `set_room_background()`
- ✅ Sistema variabili (4 API): `Game.getVar()`, `Game.setVar()`, `Game.hasVar()`, `Game.toggleVar()`
- ✅ API base (3 API): `print()`, `show_message()`, `move_object()`

**✅ COMPLETATO - Sistema Runtime Sandboxed**:
- ✅ Runtime sandboxed con iframe isolato (`sandbox="allow-scripts"`)
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
  - ✅ Z-ordering automatico (personaggi renderizzati dopo oggetti di scena)
  - ✅ Gestione frame specchiati (Canvas) e frame normali (Image)
  - ✅ Placeholder rendering quando frame non disponibili
- **Tempo impiegato**: Completato

#### 1.5 Sistema Inventario Runtime Completo
- **Stato**: 🟡 Parzialmente implementato (API placeholder)
- **Problema**: API esistono ma inventario non funziona realmente
- **Soluzione**:
  - Implementare storage inventario runtime
  - Rendering GUI Inventory
  - Drag&drop, tooltip, combinazioni
- **Tempo stimato**: 5-6 giorni

**Totale Fase 1**: ~16-21 giorni lavorativi

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
- **Stato**: ❌ Mancante
- **Problema**: Nessun sistema per dialoghi
- **Soluzione**:
  - API scripting: `start_dialogue()`, `show_dialogue_text()`, `show_dialogue_choices()`
  - Rendering DialogBox GUI
  - Sistema di scelte ramificate
  - Integrazione con personaggi
- **Tempo stimato**: 6-8 giorni

**Totale Fase 2**: ~20-27 giorni lavorativi

---

### **FASE 3: SISTEMI AVANZATI** (Priorità MEDIA)

**Obiettivo**: Aggiungere sistemi avanzati per gameplay ricco.

#### 3.1 Sistema Audio
- **Stato**: ❌ Mancante
- **Problema**: Nessun supporto audio
- **Soluzione**:
  - Upload audio (MP3/OGG) nell'editor
  - API scripting: `play_music()`, `play_sound()`, `set_music_volume()`, `play_ambient_sound()`
  - Audio context nel runtime
  - Mixer con volumi separati (musica/SFX/ambient)
  - Fade in/out automatico
- **Tempo stimato**: 5-7 giorni

#### 3.2 Sistema Effetti Visivi
- **Stato**: ❌ Mancante
- **Problema**: Nessun sistema di transizioni/effetti
- **Soluzione**:
  - API scripting: `fade_in()`, `fade_out()`, `transition_to_room()`, `show_cutscene()`
  - Sistema di transizioni (fade, slide, dissolve)
  - Cutscene system con timeline
- **Tempo stimato**: 6-8 giorni

#### 3.3 Sistema Personaggi Avanzato
- **Stato**: 🟡 Parzialmente implementato (animazioni base)
- **Problema**: Nessun movimento/animazione avanzata
- **Soluzione**:
  - API scripting: `move_character()`, `animate_character()`, `set_character_direction()`, `spawn_character()`
  - Sistema AI base (patrol, follow, idle)
  - Animazioni per stato (walk, idle, talk)
- **Tempo stimato**: 7-9 giorni

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

### 4. **Scripting API Inconsistente**
- **Problema**: Alcune API funzionano solo in editor, altre solo in runtime
- **Impatto**: Confusione per sviluppatori, bug difficili da debuggare
- **Soluzione**: Unificare API, documentazione chiara, test suite

---

## 📈 PRIORITÀ SVILUPPO RACCOMANDATE

### ✅ **Completato (Fase 1 - Sistema Scripting e Runtime)**
- ✅ Sistema eventi completo (5 API)
- ✅ Sistema inventario completo (5 API)
- ✅ Sistema oggetti completo (5 API)
- ✅ Sistema stanze completo (4 API)
- ✅ Sistema variabili completo (4 API)
- ✅ Sistema Runtime Sandboxed completo con MessageQueue robusto
- ✅ GameAPI completo con tutte le funzioni di base
- ✅ ScriptLogService integrato
- ✅ Sistema interazioni click completo (hit detection, dispatch eventi)
- ✅ Sistema cambio stanza completo (`changeRoom`, `load_room`)
- ✅ Rendering personaggi completo (animazioni 8-direzioni, scaling, pivot)
- ✅ Pathfinding e movimento personaggio completo (click-to-move)
- ✅ Rendering GUI completo (background, pulsanti, click handling)
- **Totale: 24 API implementate e funzionanti + Runtime Sandboxed completo + Rendering e Interazioni Runtime complete**

### **Immediato (Settimane 1-4)**
1. ✅ Fix sistema print/log runtime (Fase 1.1) - COMPLETATO
2. ✅ Implementare interazioni click runtime (Fase 1.2) - COMPLETATO
3. ✅ Implementare cambio stanza runtime (Fase 1.3) - COMPLETATO
4. ✅ Rendering personaggi runtime (Fase 1.4) - COMPLETATO
5. ✅ Pathfinding e movimento personaggio (Fase 2.1) - COMPLETATO
6. ✅ Rendering GUI runtime (Fase 2.2) - COMPLETATO

### **Breve Termine (Settimane 5-8)**
5. Sistema inventario runtime completo (Fase 1.5) - API complete, manca rendering GUI
6. ✅ Pathfinding e movimento personaggio (Fase 2.1) - COMPLETATO
7. ✅ Rendering GUI runtime (Fase 2.2) - COMPLETATO
8. Sistema cursori contestuali (Fase 2.3) - Parzialmente implementato (cursor fisso)

### **Medio Termine (Settimane 9-16)**
9. Sistema dialoghi base (Fase 2.4)
10. Sistema audio (Fase 3.1)
11. Sistema effetti visivi (Fase 3.2)
12. Sistema salvataggi gioco (Fase 3.4)

### **Lungo Termine (Settimane 17+)**
13. Migliorie editor (Fase 4)
14. Export e distribuzione (Fase 5)

---

## 🎯 OBIETTIVO FINALE

**Amianto Editor** dovrebbe permettere di:
1. ✅ Creare stanze, oggetti, personaggi, GUI (completato)
2. ✅ Scrivere script JavaScript funzionanti (24 API implementate)
3. ✅ Testare gioco completo nel runtime (API complete, rendering completo, interazioni click complete, pathfinding completo)
4. ❌ Esportare gioco standalone (manca export ottimizzato)

**La roadmap qui sopra porta al completamento di tutti questi obiettivi.**

---

*Roadmap aggiornata il: Gennaio 2025*
*Versione progetto analizzata: 0.4*
*Ultimo aggiornamento: Sistema Runtime completo con rendering personaggi/GUI, interazioni click, pathfinding e movimento personaggio, cambio stanza completo*

