# 🎮 Funzioni da Implementare - Amianto Editor

> **Aggiornamento: Giugno 2026** — Questo file elenca API **target** (wishlist + backlog). Per lo **stato reale nel runtime** vedi [`README.md`](README.md), tab **Docs** in-app (`JS/docs-panel.js`), [`ROADMAP.md`](ROADMAP.md) e [`API_UNIFICATION_CHECKLIST.md`](API_UNIFICATION_CHECKLIST.md).

## Legenda stato

| Simbolo | Significato |
|---------|-------------|
| ✅ | Disponibile in **runtime** (`JS/runtime.js`) — Play Test / `runtime.html` |
| 🟡 | Parziale, solo editor legacy, o alias mancante |
| ❌ | Non implementato |
| 📋 | Backlog / bassa priorità |

**Dove girano gli script:** Play Test → iframe → `runtime.js` (`getScriptApiBindings` + `buildHandlerExecutionScope` + `GameAPI`). Il vecchio `sandboxApi` in `main.js` è stato **rimosso** (Fase D).

---

## 📊 Riepilogo rapido (runtime)

| Categoria | ✅ Runtime | 🟡 Parziale | ❌ Backlog |
|-----------|------------|-------------|------------|
| Eventi | 8 handler (`on_use_with`, …) | — | hover, pause, `on_game_end`, … |
| Base / log | `print`, `show_message`, `move_object` | — | — |
| Stanze | `load_room`, `get_current_room`, `get_room_objects`, `set_room_background` | — | `unload_room`, transizioni |
| Variabili | `get_var` / `Game.getVar`, `set_var`, `has_var`, `toggle_var` | — | array/object vars |
| Personaggi | spawn, walk, `play_character_animation`, … | — | AI patrol/follow, health |
| Inventario | 5 API + carried item + use-with | GUI drag&drop, tooltip | peso, sort avanzato |
| Oggetti scena | spawn/despawn/rotate/scale/visible, enable/disable | — | proprietà custom |
| Dialoghi | `show_dialogue`, `end_dialogue` | — | scelte ramificate, mood |
| Audio / FX | — | upload in tab Resources | `play_music`, `fade_in`, save slot |

**Infrastruttura ✅ (Fasi A–D):** `getScriptApiBindings()`, `buildScriptExecutor()`, `exposeScriptGlobals()`, scope handler.

---

## 📋 Lista Completa di Funzioni Utili per Editor Point-and-Click

### 🎯 **Sistema di Eventi Base**

#### Eventi di Gioco
```javascript
// ✅ Runtime
on_game_start()                    // All'avvio del gioco
on_room_change(oldRoom, newRoom)   // Cambio di stanza (nome handler ufficiale)
on_object_click(objectId, x, y, usedItemId?) // Click su oggetto (+ 4° arg se use-with)
on_character_click(characterId, x, y, usedItemId?) // Click su personaggio (+ 4° arg se use-with)
on_hotspot_click(hotspotId, x, y, usedItemId?)   // Click su hotspot (+ 4° arg se use-with)
on_gui_click(buttonId)             // Click su pulsante GUI (non on_gui_button_click)
on_use_with(targetType, targetId, x, y) // Script oggetto inventario: combinazione (return true se ok)
on_inventory_use_with(itemId, targetType, targetId, x, y) // Fallback globale use-with (return true se ok)

// ❌ Non implementati
on_game_end()                      // Alla fine del gioco
on_game_pause()                    // Quando il gioco viene messo in pausa
on_game_resume()                   // Quando il gioco viene ripreso
on_room_enter(roomId)              // Usare on_room_change + logica in script
on_room_exit(roomId)               // —
on_object_hover(objectId)          // Hover su oggetto
on_object_drag(objectId, x, y)     // Trascinamento oggetto
on_character_talk(characterId)     // Dialogo con personaggio
on_hotspot_hover(hotspotId)        // Hover su hotspot
on_gui_button_click(buttonId)      // Alias non usato; usare on_gui_click
on_inventory_item_click(itemId)    // Click su slot inventario (selezione visuale, no handler dedicato)
on_cursor_change(cursorType)       // Cambio cursore
```

### 🎒 **Sistema Inventario**

#### Gestione Inventario
```javascript
// ✅ Runtime (GameAPI)
add_to_inventory(itemId, quantity) // Aggiungi oggetto all'inventario
remove_from_inventory(itemId, quantity) // Rimuovi oggetto dall'inventario
has_item(itemId)                   // Verifica se l'oggetto è nell'inventario
get_item_count(itemId)             // Ottieni quantità oggetto
clear_inventory()                  // Svuota inventario
get_carried_item()                 // Oggetto attualmente in mano (use-with) o null
set_carried_item(itemId)           // Seleziona oggetto per use-with
clear_carried_item()               // Deseleziona oggetto in mano

// ❌ Backlog
get_inventory_items()              // Ottieni lista completa inventario
swap_inventory_items(item1, item2)  // Scambia posizione oggetti
sort_inventory(sortType)           // Ordina inventario
search_inventory(searchTerm)       // Cerca oggetti nell'inventario
get_inventory_weight()             // Calcola peso totale inventario
is_inventory_full()                // Verifica se inventario è pieno
get_inventory_slots()              // Ottieni numero slot disponibili
set_inventory_slots(count)         // Imposta numero slot
get_item_in_slot(slotIndex)        // Ottieni oggetto in slot specifico
move_item_to_slot(itemId, slot)    // Sposta oggetto in slot specifico
```

### 🗣️ **Sistema Dialoghi** — 🟡 Parziale (runtime maggio 2026)

Richiede una GUI di tipo **DialogBox** nel progetto (colori, balloon opzionale, effetto `appear`). Il balloon segue il personaggio in play test.

#### Dialoghi Base
```javascript
// ✅ Runtime (GameAPI + getScriptApiBindings)
show_dialogue(characterIdOrName, text)  // Balloon sul personaggio; click per chiudere; coda comandi
show_dialogue_text(text, speaker)       // Alias roadmap (ordine invertito)
end_dialogue()                          // Chiude subito il dialogo attivo

// ❌ Backlog
start_dialogue(characterId)        // Sessione dialogo ramificata
show_dialogue_choices(choices)     // Mostra scelte dialogo
get_dialogue_response()             // Ottieni risposta del giocatore

// Gestione personaggi
get_character_mood(characterId)     // Ottieni umore personaggio
set_character_mood(characterId, mood) // Imposta umore personaggio
get_character_relationship(characterId) // Ottieni relazione con personaggio
set_character_relationship(characterId, level) // Imposta relazione

// Sistema di reputazione
get_reputation(faction)             // Ottieni reputazione con fazione
change_reputation(faction, amount)  // Modifica reputazione
get_all_reputations()              // Ottieni tutte le reputazioni
```

### 🎵 **Sistema Audio** — ❌ Non implementato (Fase 3.1 roadmap)

#### Gestione Suoni
```javascript
// ❌ Tutti in backlog
play_music(trackId, loop)           // Riproduci musica
stop_music()                        // Ferma musica
pause_music()                       // Metti in pausa musica
resume_music()                      // Riprendi musica
set_music_volume(volume)            // Imposta volume musica
fade_music_in(duration)             // Fade in musica
fade_music_out(duration)            // Fade out musica

// Effetti sonori
play_sound(soundId, volume)         // Riproduci effetto sonoro
play_sound_at_position(soundId, x, y) // Riproduci suono in posizione
stop_sound(soundId)                 // Ferma effetto sonoro
set_sound_volume(soundId, volume)   // Imposta volume suono
play_ambient_sound(soundId)         // Riproduci suono ambientale
stop_ambient_sound(soundId)         // Ferma suono ambientale
```

### 🎨 **Sistema Visivo** — ❌ Non implementato (Fase 3.2 roadmap)

#### Effetti Visivi
```javascript
// ❌ Backlog
fade_in(duration)                   // Fade in schermo
fade_out(duration)                  // Fade out schermo
transition_to_room(roomId, effect)  // Transizione verso stanza
show_cutscene(cutsceneId)           // Mostra cutscene
hide_cutscene()                      // Nascondi cutscene

// Effetti particellari
create_particle_effect(x, y, type)  // Crea effetto particellare
remove_particle_effect(effectId)    // Rimuovi effetto particellare
create_smoke_effect(x, y)            // Crea effetto fumo
create_sparkle_effect(x, y)          // Crea effetto scintille
create_explosion_effect(x, y)        // Crea effetto esplosione

// Gestione layer
show_layer(layerId)                 // Mostra layer
hide_layer(layerId)                 // Nascondi layer
set_layer_opacity(layerId, opacity)  // Imposta opacità layer
animate_layer(layerId, animation)    // Anima layer
```

### 🎯 **Sistema Oggetti**

#### Gestione Oggetti
```javascript
// ✅ Runtime
move_object(objectId, x, y)         // Sposta oggetto
enableObject(objectId)              // Abilita oggetto (GameAPI)
disableObject(objectId)             // Disabilita / nasconde (GameAPI)

// ✅ Runtime
spawn_object(objectId, x, y)        // Spawna oggetto
despawn_object(objectId)            // Rimuovi oggetto
rotate_object(objectId, angle)      // Ruota oggetto
scale_object(objectId, scaleX, scaleY) // Scala oggetto
set_object_visible(objectId, visible) // Mostra/nascondi oggetto

// ❌ Backlog — proprietà oggetti
get_object_position(objectId)       // Ottieni posizione oggetto
get_object_rotation(objectId)        // Ottieni rotazione oggetto
get_object_scale(objectId)          // Ottieni scala oggetto
set_object_property(objectId, prop, value) // Imposta proprietà oggetto
get_object_property(objectId, prop)  // Ottieni proprietà oggetto

// Interazioni oggetti
can_interact_with(objectId)          // Verifica se si può interagire
get_interaction_range(objectId)      // Ottieni raggio di interazione
set_object_interactive(objectId, interactive) // Imposta interattività
```

### 📍 **Sistema Hotspot**

#### Gestione Hotspot
```javascript
// ✅ Runtime (maggio 2026)
enableHotspot(hotspotIdOrName)      // Rende hotspot cliccabile (visible=true)
disableHotspot(hotspotIdOrName)     // Disattiva click (visible=false)

// Editor: checkbox "Is active?" in tab Rooms → stato iniziale nel JSON
// Evento: on_hotspot_click(hotspotId, x?, y?)
```

### 🚪 **Sistema Stanze**

#### Gestione Stanze
```javascript
// ✅ Runtime
load_room(roomId)                   // Carica stanza (ID o nome)
get_current_room()                  // Stanza corrente
getCurrentRoom()                    // Alias camelCase
get_room_objects()                  // Oggetti stanza corrente
set_room_background(image)          // Imposta sfondo stanza corrente

// ❌ Backlog
unload_room(roomId)                 // Scarica stanza
get_room_characters(roomId)         // Ottieni personaggi della stanza
set_room_lighting(roomId, level)    // Imposta illuminazione stanza
set_room_ambient_sound(roomId, sound) // Imposta suono ambientale
get_room_size(roomId)               // Ottieni dimensioni stanza
set_room_size(roomId, width, height) // Imposta dimensioni stanza

// Transizioni stanze
can_move_to_room(roomId)            // Verifica se si può andare alla stanza
set_room_accessible(roomId, accessible) // Imposta accessibilità stanza
get_connected_rooms(roomId)          // Ottieni stanze collegate
```

### 👤 **Sistema Personaggi**

#### Gestione Personaggi
```javascript
// ✅ Runtime
spawn_character(characterName, x, y, direction, characterId)
move_character(characterIdOrName, x, y)
walk_character(characterIdOrName, x, y)  // Pathfinding; coda comandi su window; wait opzionale
set_character_direction(characterIdOrName, direction)
animate_character(characterIdOrName, enabled)  // Hook (uso futuro)
play_character_animation(characterIdOrName, animationName, direction, wait?)  // Animazione custom (editor → animations.{nome}); un ciclo; Promise se wait

// ✅ Editor (non è API script, ma dati per play_character_animation)
// Tab Characters → Animation → "+" → nome (es. "wave") → frame per 8 direzioni
// Salvato in progetto: characters[].animations.wave.directions

// ❌ Backlog
despawn_character(characterId)       // Rimuovi personaggio
get_character_position(characterId)  // Ottieni posizione personaggio
get_character_animation(characterId) // Ottieni nome animazione in corso (stato runtime)
set_character_visible(characterId, visible) // Mostra/nascondi personaggio
get_character_health(characterId)    // Ottieni salute personaggio
set_character_health(characterId, health) // Imposta salute personaggio

// AI Personaggi
set_character_ai(characterId, aiType) // Imposta AI del personaggio
set_character_patrol(characterId, points) // Imposta pattugliamento
set_character_follow(characterId, targetId) // Imposta follow
stop_character_ai(characterId)       // Ferma AI personaggio
```

### 🎮 **Sistema Gioco**

#### Stato del Gioco
```javascript
// ✅ Runtime
getVariable(name) / setVariable(name, value)  // camelCase
get_var(name) / set_var(name, value)          // snake_case
Game.getVar / Game.setVar / Game.hasVar / Game.toggleVar

// ❌ Alias documentati solo in backlog
get_game_variable(name)             // Usare get_var / Game.getVar
set_game_variable(name, value)      // Usare set_var / Game.setVar

// ❌ Backlog
get_all_game_variables()            // Ottieni tutte le variabili
clear_game_variables()              // Pulisci tutte le variabili
save_game(slot)                     // Salva gioco
load_game(slot)                     // Carica gioco
delete_save(slot)                   // Elimina salvataggio
get_save_info(slot)                 // Ottieni info salvataggio
get_all_saves()                     // Ottieni tutti i salvataggi

// Sistema di punteggio
add_score(points)                   // Aggiungi punti
get_score()                         // Ottieni punteggio
set_score(points)                   // Imposta punteggio
get_high_score()                    // Ottieni miglior punteggio
reset_score()                       // Reset punteggio
```

### 🔧 **Sistema Utilità** — ❌ Backlog

#### Funzioni di Utilità
```javascript
// ❌ Backlog
distance(x1, y1, x2, y2)            // Calcola distanza tra due punti
angle_between(x1, y1, x2, y2)       // Calcola angolo tra due punti
point_in_rect(x, y, rect)           // Verifica se punto è in rettangolo
point_in_circle(x, y, circle)      // Verifica se punto è in cerchio
lerp(a, b, t)                       // Interpolazione lineare

// Stringhe e testo
format_string(template, values)     // Formatta stringa
parse_number(text)                   // Converte testo in numero
capitalize(text)                     // Capitalizza testo
trim_whitespace(text)                // Rimuovi spazi bianchi
split_string(text, delimiter)        // Dividi stringa

// Array e liste
shuffle_array(array)                 // Mescola array
get_random_item(array)               // Ottieni elemento casuale
remove_duplicates(array)             // Rimuovi duplicati
sort_array(array, key)               // Ordina array
filter_array(array, condition)        // Filtra array

// Tempo e date
get_current_time()                   // Ottieni tempo corrente
get_game_time()                      // Ottieni tempo di gioco
pause_game_time()                    // Pausa tempo di gioco
resume_game_time()                   // Riprendi tempo di gioco
format_time(seconds)                 // Formatta tempo
```

### 🎨 **Sistema UI**

#### Interfaccia Utente
```javascript
// ✅ Runtime
show_message(text)                    // Overlay messaggio (coda comandi)
show_dialogue(character, text)        // Balloon DialogBox sul personaggio (click per chiudere)
show_dialogue_text(text, speaker)     // Alias (testo, personaggio)
end_dialogue()                        // Chiude dialogo attivo
print(...)                            // Log script

// ❌ Backlog
show_message(text, duration)         // Durata custom non esposta
hide_message()                       // Nascondi messaggio
show_tooltip(text, x, y)            // Mostra tooltip
hide_tooltip()                       // Nascondi tooltip
show_notification(text, type)        // Mostra notifica
hide_notification()                  // Nascondi notifica

// Menu e finestre
open_menu(menuId)                    // Apri menu
close_menu(menuId)                    // Chiudi menu
show_modal(title, content)           // Mostra modale
hide_modal()                         // Nascondi modale
show_loading_screen()                // Mostra schermata caricamento
hide_loading_screen()                // Nascondi schermata caricamento

// Input utente
get_mouse_position()                 // Ottieni posizione mouse
get_key_pressed(key)                 // Verifica se tasto premuto
get_input_text()                     // Ottieni testo inserito
show_text_input(prompt)              // Mostra input testo
hide_text_input()                    // Nascondi input testo
```

### 🔍 **Sistema Debug**

#### Debug e Logging
```javascript
// Logging avanzato
log_info(message)                    // Log informativo
log_warning(message)                // Log di avviso
log_error(message)                   // Log di errore
log_debug(message)                   // Log di debug
set_log_level(level)                 // Imposta livello log

// Debug tools
show_debug_info()                    // Mostra info debug
hide_debug_info()                    // Nascondi info debug
toggle_debug_mode()                  // Attiva/disattiva modalità debug
get_performance_stats()              // Ottieni statistiche performance
clear_console()                      // Pulisci console
```

### 📜 **Sistema Scripting e Condizionali**

#### Condizionali IF
```javascript
// Condizionali base
if_condition(condition, trueAction, falseAction) // Esegue azione basata su condizione
if_variable_equals(varName, value, action)      // Se variabile = valore
if_variable_greater(varName, value, action)      // Se variabile > valore
if_variable_less(varName, value, action)         // Se variabile < valore
if_variable_not_empty(varName, action)           // Se variabile non è vuota

// Condizionali inventario
if_has_item(itemId, action)                      // Se ha oggetto nell'inventario
if_has_items(itemList, action)                   // Se ha tutti gli oggetti nella lista
if_inventory_empty(action)                        // Se inventario è vuoto
if_inventory_full(action)                        // Se inventario è pieno

// Condizionali personaggi
if_character_exists(characterId, action)         // Se personaggio esiste
if_character_in_room(characterId, roomId, action) // Se personaggio è in stanza
if_character_health_above(characterId, health, action) // Se salute personaggio > valore
if_character_mood_is(characterId, mood, action)  // Se umore personaggio è specifico

// Condizionali stanza
if_in_room(roomId, action)                       // Se si è nella stanza specifica
if_room_accessible(roomId, action)               // Se stanza è accessibile
if_room_contains_object(roomId, objectId, action) // Se stanza contiene oggetto

// Condizionali gioco
if_game_variable_exists(varName, action)         // Se variabile di gioco esiste
if_score_above(score, action)                     // Se punteggio > valore
if_first_time_playthrough(action)                 // Se è il primo gioco
if_save_exists(slot, action)                      // Se salvataggio esiste

// Condizionali temporali
if_time_elapsed(seconds, action)                  // Se è trascorso tempo specifico
if_game_time_between(start, end, action)         // Se tempo di gioco è tra valori
if_day_time_is(timeOfDay, action)                 // Se è un certo momento del giorno

// Condizionali multiple
if_and(conditions, action)                       // Se tutte le condizioni sono vere
if_or(conditions, action)                        // Se almeno una condizione è vera
if_not(condition, action)                         // Se condizione è falsa

// Condizionali complesse
if_random_chance(chance, action)                  // Esegue azione basata su probabilità
if_distance_less_than(object1, object2, distance, action) // Se distanza < valore
if_angle_between(object1, object2, minAngle, maxAngle, action) // Se angolo è nel range

// Condizionali UI
if_gui_element_visible(elementId, action)         // Se elemento UI è visibile
if_menu_is_open(menuId, action)                   // Se menu è aperto
if_dialogue_active(action)                        // Se dialogo è attivo

// Condizionali audio
if_music_playing(trackId, action)                  // Se musica specifica sta suonando
if_sound_playing(soundId, action)                 // Se suono specifico sta suonando
if_audio_muted(action)                            // Se audio è mutato

// Condizionali stato
if_game_paused(action)                            // Se gioco è in pausa
if_cutscene_playing(action)                       // Se cutscene è in riproduzione
if_loading_complete(action)                       // Se caricamento è completato
```

---

## 📝 Note per l'Implementazione

### Priorità aggiornate (giugno 2026)

1. **Immediata — Qualità:** test manuali Fase E; sync inventario `UPDATE_CONTEXT`; `GAME_API_COMPLETIONS` completo
2. **Alta — Gameplay:** cursori contestuali in **runtime**, inventario GUI (drag&drop), `show_dialogue_choices`
3. **Media:** API audio runtime, transizioni (`fade_in`), salvataggi gioco
4. **Bassa:** utility math, debug avanzato, condizionali helper, particelle

### Considerazioni Tecniche
- Ogni nuova API: `GameAPI` → `getScriptApiBindings()` → `GAME_API_COMPLETIONS` → test Play Test
- Non reintrodurre logica script in `main.js` (solo UI editor)
- Handler: `buildHandlerExecutionScope()` espone già tutte le binding

### Struttura attuale (runtime)
```javascript
// Fonte unica: GameAPI in JS/runtime.js
// Esposizione script: getScriptApiBindings() → compileScript / window
// Esempio estensione Fase B:
GameAPI.add_to_inventory = function(itemId, quantity) { /* gameState.inventory */ };
// Poi aggiungere { name: 'add_to_inventory', value: bindGameApiMethod(api, 'add_to_inventory') }
// in getScriptApiBindings()
```

---

*Ultimo aggiornamento: Giugno 2026 — Fasi A–D API; 8 eventi; inventario/use-with runtime; tab Resources; questo file = backlog futuro.*