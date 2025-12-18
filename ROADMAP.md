# 🗺️ ROADMAP COMPLETA - Amianto Editor

## Analisi Architettura Attuale

**Amianto Editor** è una webapp per creare giochi punta e clicca nel browser. L'architettura è divisa in:
- **Editor** (`index.html` + `JS/main.js`): Interfaccia di editing con tabs
- **Runtime** (`runtime.html` + `JS/runtime.js`): Player standalone per test/gioco
- **Backend**: Firebase (autenticazione, storage progetti)
- **Scripting**: JavaScript con sandbox Jailed per sicurezza

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
- Sistema eventi base: `on_game_start()`, `on_room_change()`, `on_object_click()`, `on_character_click()`, `on_hotspot_click()`
- API base: `print()`, `show_message()`, `move_object()`
- API inventario: `add_to_inventory()`, `remove_from_inventory()`, `has_item()`, `get_item_count()`, `clear_inventory()`
- API oggetti: `spawn_object()`, `despawn_object()`, `rotate_object()`, `scale_object()`, `set_object_visible()`
- API stanze: `load_room()`, `get_current_room()`, `get_room_objects()`, `set_room_background()`
- Sistema variabili: `Game.getVar()`, `Game.setVar()`, `Game.hasVar()`, `Game.toggleVar()`
- Attach script a rooms, objects, characters, hotspots, GUI buttons
- Salvataggio/caricamento script nel progetto

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

#### 🟡 **Parzialmente Implementato**
- **Sistema print/log**: postMessage funziona ma può perdere messaggi
  - **Prossimo passo**: Buffer messaggi, retry, fallback a console locale
- **Cambio stanza**: `load_room()` esiste ma non implementato completamente
  - **Prossimo passo**: Implementare cambio stanza con transizione, cleanup, script execution
- **Sistema inventario runtime**: API placeholder, nessun rendering
  - **Prossimo passo**: Implementare inventario runtime con rendering GUI Inventory

#### ❌ **Mancante**
- **Interazioni click**: Nessun sistema di click su oggetti/personaggi/hotspot nel runtime
  - **Prossimo passo**: Sistema di hit detection e dispatch eventi click
- **Movimento personaggio**: Nessun sistema di pathfinding e click-to-move
  - **Prossimo passo**: Pathfinding A* su walkable area, animazione movimento, direzione personaggio
- **Rendering personaggi**: Personaggi non vengono renderizzati nel runtime
  - **Prossimo passo**: Rendering personaggi con animazioni 8-direzioni, z-ordering
- **Rendering GUI**: GUI non viene renderizzata nel runtime
  - **Prossimo passo**: Rendering overlay GUI con pulsanti clickabili
- **Sistema cursori**: Cursori contestuali non funzionano nel runtime
  - **Prossimo passo**: Cambio cursore in base a hover su hotspot/character/object
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

#### 1.1 Fix Sistema Print/Log Runtime
- **Stato**: 🟡 Parzialmente implementato
- **Problema**: postMessage può perdere messaggi, sincronizzazione instabile
- **Soluzione**: 
  - Buffer messaggi con retry mechanism
  - Fallback a console locale se opener chiuso
  - Queue system per messaggi in ordine
- **Tempo stimato**: 2-3 giorni

#### 1.2 Implementare Interazioni Click Runtime
- **Stato**: ❌ Mancante
- **Problema**: Click su canvas non gestiti, nessun hit detection
- **Soluzione**:
  - Sistema hit detection per oggetti/personaggi/hotspot
  - Dispatch eventi click agli script
  - Visual feedback (highlight, cursor change)
- **Tempo stimato**: 3-4 giorni

#### 1.3 Implementare Cambio Stanza Runtime
- **Stato**: 🟡 Parzialmente implementato (API esiste, logica manca)
- **Problema**: `load_room()` non funziona realmente
- **Soluzione**:
  - Implementare cambio stanza con cleanup risorse
  - Eseguire script `on_room_change`
  - Transizione base (fade semplice)
- **Tempo stimato**: 2-3 giorni

#### 1.4 Rendering Personaggi Runtime
- **Stato**: ❌ Mancante
- **Problema**: Personaggi non vengono renderizzati
- **Soluzione**:
  - Rendering personaggi con animazioni 8-direzioni
  - Z-ordering (personaggi dietro/avanti oggetti)
  - Sistema di posizionamento personaggi per stanza
- **Tempo stimato**: 4-5 giorni

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

#### 2.1 Pathfinding e Movimento Personaggio
- **Stato**: ❌ Mancante
- **Problema**: Nessun sistema di movimento, walkable area non usata
- **Soluzione**:
  - Implementare pathfinding A* su walkable area polygon
  - Click-to-move del personaggio
  - Animazione movimento con direzione corretta
  - Smooth movement con easing
- **Tempo stimato**: 7-10 giorni

#### 2.2 Rendering GUI Runtime
- **Stato**: 🟡 Parzialmente implementato (salvato, non renderizzato)
- **Problema**: GUI non visibile nel runtime
- **Soluzione**:
  - Rendering overlay GUI con background e pulsanti
  - Sistema di click su pulsanti GUI
  - Esecuzione script associati a pulsanti
- **Tempo stimato**: 4-5 giorni

#### 2.3 Sistema Cursori Contestuali Runtime
- **Stato**: ❌ Mancante
- **Problema**: Cursori definiti ma non funzionano nel runtime
- **Soluzione**:
  - Hit detection per hotspot/character/object
  - Cambio cursore in base a hover
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

### 1. **Comunicazione Editor↔Runtime Instabile**
- **Problema**: postMessage può perdere messaggi, window.opener può essere null
- **Impatto**: Print/log non affidabili, debugging difficile
- **Soluzione immediata**: Buffer + retry + fallback console
- **Soluzione a lungo termine**: WebSocket o SharedWorker per comunicazione stabile

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

### **Immediato (Settimane 1-4)**
1. Fix sistema print/log runtime (Fase 1.1)
2. Implementare interazioni click runtime (Fase 1.2)
3. Implementare cambio stanza runtime (Fase 1.3)
4. Rendering personaggi runtime (Fase 1.4)

### **Breve Termine (Settimane 5-8)**
5. Sistema inventario runtime completo (Fase 1.5)
6. Pathfinding e movimento personaggio (Fase 2.1)
7. Rendering GUI runtime (Fase 2.2)
8. Sistema cursori contestuali (Fase 2.3)

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
1. ✅ Creare stanze, oggetti, personaggi, GUI (già fatto)
2. 🟡 Scrivere script JavaScript funzionanti (parzialmente)
3. ❌ Testare gioco completo nel runtime (manca gameplay)
4. ❌ Esportare gioco standalone (manca export ottimizzato)

**La roadmap qui sopra porta al completamento di tutti questi obiettivi.**

---

*Roadmap generata il: 2025*
*Versione progetto analizzata: 0.1*

