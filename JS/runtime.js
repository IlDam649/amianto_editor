/**
 * Amianto Runtime - Runtime Interattivo Completo
 * 
 * Questo runtime carica progetti serializzati (JSON) e li esegue come giochi interattivi.
 * Supporta:
 * - Caricamento progetti JSON
 * - Ricostruzione room, background, foreground, oggetti, GUI
 * - Esecuzione script JavaScript
 * - Log runtime sempre visibile
 * - Interazione reale (click su oggetti, cambio room)
 * - GameAPI completa
 */

(function() {
  'use strict';

  // ============================================
  // STATO GLOBALE DEL RUNTIME
  // ============================================
  let gameState = {
    initialized: false,
    projectData: null,
    currentRoomId: null,
    currentRoom: null,
    variables: new Map(),
    objects: new Map(), // oggetti caricati con immagini
    guis: new Map(), // GUI caricate
    characters: new Map(), // Character attivi nel gioco: Map<characterId, {name, x, y, direction, currentFrame, frameTime, visible, roomId}>
    characterDefinitions: new Map(), // Definizioni dei character dal progetto: Map<characterName, {directions: {...}}>
    scripts: {}, // script del progetto
    attachments: {}, // script collegati a eventi
    isRunning: false,
    lastFrameTime: 0,
    animationFrameId: null,
    // ⚠️ CACHE SCRIPT COMPILATI: Memorizza gli handler estratti dagli script
    // Struttura: Map<scriptName, { on_hotspot_click: function, on_object_click: function, ... }>
    // Ogni script viene compilato UNA SOLA VOLTA, gli handler vengono estratti e cache-ati
    // Questo previene riesecuzione di codice JS a ogni evento
    compiledScripts: new Map()
  };

  // ⚠️ FLAG PROTEZIONE DOPPI EVENTI
  const runtime = {
    eventsBound: false
  };

  // Canvas e rendering
  let canvas = null;
  let ctx = null;
  let canvasWidth = 800;
  let canvasHeight = 600;

  // Assets caricati (immagini)
  const loadedImages = new Map(); // cache immagini (deprecato, mantenuto per compatibilità)
  
  // Asset Registry centralizzato - memorizza tutte le immagini caricate
  const AssetRegistry = {
    images: new Map(), // key: assetId/URL, value: Image object
    isLoading: false,
    loadComplete: false
  };

  // ============================================
  // UTILITY
  // ============================================
  function log(message, level = 'info') {
    if (window.addRuntimeLog) {
      window.addRuntimeLog(message, level);
    } else {
      console.log(`[Runtime ${level}]`, message);
    }
  }

  function updateLoadingMessage(message) {
    const loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) {
      loadingMsg.textContent = message;
    }
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  function showLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  // Funzione per mostrare messaggi visibili a schermo
  function showGameMessage(text, duration = 3000) {
    if (!text) return;
    
    // Rimuovi notifiche precedenti se ce ne sono troppe
    const existingNotifications = document.querySelectorAll('.game-notification');
    if (existingNotifications.length > 5) {
      existingNotifications[0].remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'game-notification';
    notification.innerHTML = `
      <button class="close-btn" onclick="this.parentElement.remove()" title="Chiudi">×</button>
      <div style="padding-right: 24px;">${escapeHtml(text)}</div>
    `;
    
    document.body.appendChild(notification);
    
    // Rimuovi automaticamente dopo la durata specificata
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('fade-out');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, duration);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // SISTEMA CODA COMANDI API SEQUENZIALE
  // ============================================
  // Coda globale per garantire esecuzione sequenziale dei comandi API
  // Impedisce che più comandi (show_message, move_object, ecc.) vengano eseguiti contemporaneamente
  const commandQueue = [];
  let isProcessingQueue = false;

  /**
   * Aggiunge un comando alla coda e avvia il processing se necessario
   * @param {Function} commandFn - Funzione async che esegue il comando
   * @param {number} delay - Delay opzionale dopo l'esecuzione (ms)
   * @returns {Promise} Promise che si risolve quando il comando è completato
   */
  function queueCommand(commandFn, delay = 0) {
    return new Promise((resolve, reject) => {
      commandQueue.push({
        execute: async () => {
          try {
            await commandFn();
            // Delay opzionale tra comandi (utile per animazioni o messaggi)
            if (delay > 0) {
              await new Promise(res => setTimeout(res, delay));
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
      
      // Avvia il processing se non è già in corso
      processCommandQueue();
    });
  }

  /**
   * Processa la coda di comandi sequenzialmente
   * Esegue un comando alla volta fino a svuotare la coda
   */
  async function processCommandQueue() {
    if (isProcessingQueue || commandQueue.length === 0) {
      return;
    }
    
    isProcessingQueue = true;
    log(`[Runtime] Inizio processing coda comandi (${commandQueue.length} comandi in attesa)`, 'info');
    
    while (commandQueue.length > 0) {
      const command = commandQueue.shift();
      try {
        await command.execute();
        log(`[Runtime] Comando completato (${commandQueue.length} rimanenti)`, 'info');
      } catch (error) {
        log(`[Runtime] Errore esecuzione comando: ${error.message}`, 'error');
      }
    }
    
    isProcessingQueue = false;
    log(`[Runtime] Coda comandi completata`, 'info');
  }

  // ============================================
  // CARICAMENTO IMMAGINI
  // ============================================
  // Informazioni progetto per risolvere assetId
  let projectInfo = {
    userId: null,
    projectId: null
  };

  // Risolve un assetId in URL Supabase
  async function resolveAssetId(assetId, category, roomName = null, characterName = null) {
    try {
      log(`[Runtime] resolveAssetId chiamato: assetId=${assetId}, category=${category}${roomName ? `, roomName=${roomName}` : ''}${characterName ? `, characterName=${characterName}` : ''}`, 'info');
      
      // PRIMA: Prova a recuperare URL da Firestore se disponibile (più affidabile)
      if (typeof window !== 'undefined' && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
        try {
          const userId = window.firebaseAuth.currentUser.uid;
          // Estrai projectId reale (potrebbe essere "username:projectname", dobbiamo usare solo il nome)
          let actualProjectId = projectInfo.projectId;
          if (actualProjectId && actualProjectId.includes(':')) {
            actualProjectId = actualProjectId.split(':')[1]; // Prendi solo la parte dopo ":"
          }
          
          if (actualProjectId) {
            log(`[Runtime] resolveAssetId: tentativo recupero da Firestore (userId: ${userId.substring(0, 20)}..., projectId: ${actualProjectId.substring(0, 30)}..., assetId: ${assetId})`, 'info');
            const assetRef = window.firebaseDB
              .collection('users')
              .doc(userId)
              .collection('projects')
              .doc(actualProjectId)
              .collection('assets')
              .doc(assetId);

            const doc = await assetRef.get();
            
            if (doc.exists) {
              const data = doc.data();
              log(`[Runtime] resolveAssetId: metadata trovato in Firestore per assetId '${assetId}'`, 'info');
              log(`[Runtime] resolveAssetId: hasPublicUrl=${!!data.publicUrl}, hasFileName=${!!data.fileName}, fileName='${data.fileName || 'N/A'}', type='${data.type || 'N/A'}'`, 'info');
              
              if (data.publicUrl) {
                log(`[Runtime] resolveAssetId: ✓ URL trovato in Firestore: ${data.publicUrl.substring(0, 80)}...`, 'success');
                return data.publicUrl;
              } else if (data.fileName) {
                // IMPORTANTE: Usa sempre il fileName da Firestore, è la fonte più affidabile
                // Il fileName include il baseName originale: assetId_baseName.ext
                // Esempio: asset_1766443609527_ml2znk9_occhio_n1.png
                // IMPORTANTE: Usa getSupabaseFolderForType per mappare correttamente la categoria
                // "foreground" -> "foregrounds", "background" -> "backgrounds", ecc.
                const folder = window.supabaseStorage.getSupabaseFolderForType ? window.supabaseStorage.getSupabaseFolderForType(category) : category;
                const subfolder = data.subfolder || null; // Usa subfolder dai metadati se presente
                log(`[Runtime] resolveAssetId: usando fileName da Firestore: '${data.fileName}', categoria '${category}' -> folder '${folder}'${subfolder ? `, subfolder '${subfolder}'` : ''}`, 'info');
                const url = window.supabaseStorage.getAssetPublicUrl(
                  userId, // Usa userId da Firebase Auth corrente
                  actualProjectId,
                  category, // Passa la categoria originale (getSupabaseFolderForType la mapperà internamente)
                  data.fileName, // Usa il fileName esatto salvato in Firestore (include baseName)
                  subfolder // Passa subfolder se presente (es: "rooms/roomname")
                );
                if (url) {
                  log(`[Runtime] resolveAssetId: ✓ URL costruito da fileName Firestore: ${url}`, 'success');
                  return url;
                } else {
                  log(`[Runtime] resolveAssetId: ⚠️ fileName trovato ma URL non generato. fileName='${data.fileName}', category='${category}', folder='${folder}', subfolder='${subfolder || 'N/A'}'`, 'warning');
                }
              } else {
                log(`[Runtime] resolveAssetId: ⚠️ ERRORE CRITICO - metadata trovato in Firestore ma publicUrl e fileName mancanti!`, 'error');
                log(`[Runtime] resolveAssetId: Questo significa che l'asset è stato caricato ma il metadata è incompleto.`, 'error');
                log(`[Runtime] resolveAssetId: Data completa:`, data, 'error');
                log(`[Runtime] resolveAssetId: Soluzione: ricarica l'asset o verifica che saveAssetMetadata venga chiamato correttamente.`, 'error');
              }
            } else {
              log(`[Runtime] resolveAssetId: ⚠️ ATTENZIONE - asset non trovato in Firestore (assetId: '${assetId}')`, 'warning');
              log(`[Runtime] resolveAssetId: Questo significa che il metadata dell'asset non è stato salvato correttamente.`, 'warning');
              log(`[Runtime] resolveAssetId: Proverò pattern di fallback, ma potrebbero non funzionare se il fileName include un baseName.`, 'warning');
              log(`[Runtime] resolveAssetId: Soluzione: assicurati che saveAssetMetadata venga chiamato dopo ogni upload.`, 'warning');
            }
          }
        } catch (firestoreError) {
          log(`[Runtime] resolveAssetId: errore Firestore (continuerò con Supabase): ${firestoreError.message}`, 'info');
        }
      }
      
      // SECONDO: Fallback a Supabase Storage diretto
      // Verifica se Supabase è disponibile
      if (typeof window === 'undefined' || !window.supabaseStorage) {
        log(`[Runtime] resolveAssetId: Supabase non disponibile (window.supabaseStorage mancante)`, 'warning');
        return null;
      }

      const isAvailable = window.supabaseStorage.isAvailable ? window.supabaseStorage.isAvailable() : false;
      if (!isAvailable) {
        log(`[Runtime] resolveAssetId: Supabase non disponibile (isAvailable() = false)`, 'warning');
        return null;
      }
      log(`[Runtime] resolveAssetId: Supabase disponibile, tentativo risoluzione diretta`, 'info');

      if (!projectInfo.projectId) {
        log(`[Runtime] resolveAssetId: projectInfo.projectId mancante, impossibile risolvere`, 'warning');
        return null;
      }

      // Estrai projectId reale (rimuovi "username:" se presente per path legacy)
      let actualProjectId = projectInfo.projectId;
      if (actualProjectId.includes(':')) {
        actualProjectId = actualProjectId.split(':')[1]; // Prendi solo la parte dopo ":"
        log(`[Runtime] resolveAssetId: projectId estratto da formato "username:name" -> ${actualProjectId}`, 'info');
      }

      const hasUserId = !!projectInfo.userId;
      if (!hasUserId) {
        log(`[Runtime] resolveAssetId: userId mancante in projectInfo, proverò comunque risoluzione diretta via Supabase (path legacy senza userId).`, 'warning');
      } else {
        log(`[Runtime] resolveAssetId: projectInfo disponibile (userId: ${projectInfo.userId.substring(0, 20)}..., projectId: ${actualProjectId.substring(0, 30)}...)`, 'info');
      }

      // PRIMO TENTATIVO: chiedi direttamente a Supabase lo storagePath reale,
      // evitando di indovinare l'estensione. Usa resolveAssetUrl che fa una list()
      // nella cartella del progetto e cerca un file che inizi con assetId.
      if (window.supabaseStorage.resolveAssetUrl) {
        try {
          log(`[Runtime] resolveAssetId: tentativo risoluzione diretta via Supabase.resolveAssetUrl${roomName ? ` (roomName: ${roomName})` : ''}${characterName ? ` (characterName: ${characterName})` : ''}`, 'info');
          // Se abbiamo roomName, costruisci il subfolder: rooms/{roomName}
          // Se abbiamo characterName, costruisci il subfolder: characters/{characterName}
          const subfolder = roomName ? `rooms/${roomName}` : (characterName ? `characters/${characterName}` : null);
          const directUrl = await window.supabaseStorage.resolveAssetUrl(
            actualProjectId,
            assetId,
            category,
            null,
            projectInfo.userId || null, // Passa esplicitamente l'userId del progetto
            subfolder // Passa subfolder se abbiamo roomId
          );
          if (directUrl) {
            log(
              `[Runtime] resolveAssetId: ✓ URL ottenuto direttamente da Supabase: ${directUrl.substring(0, 100)}${directUrl.length > 100 ? '...' : ''}`,
              'success'
            );
            return directUrl;
          } else {
            log(`[Runtime] resolveAssetId: resolveAssetUrl ha restituito null, interrompo risoluzione`, 'warning');
          }
        } catch (directErr) {
          log(`[Runtime] resolveAssetId: errore in resolveAssetUrl Supabase: ${directErr.message}`, 'warning');
        }
      } else {
        log(`[Runtime] resolveAssetId: window.supabaseStorage.resolveAssetUrl non disponibile`, 'warning');
      }

      // Se siamo arrivati qui significa che:
      // - Firestore non aveva un publicUrl/fileName utilizzabile, e
      // - Supabase.resolveAssetUrl non è riuscito a trovare un file reale.
      // Non proviamo più a "indovinare" l'URL con pattern: falliamo in modo esplicito.
      log(
        `[Runtime] resolveAssetId: ✗ Nessun URL trovato (Firestore+Supabase), interrompo senza tentare pattern di fallback`,
        'warning'
      );
      return null;
    } catch (error) {
      log(`[Runtime] resolveAssetId: errore: ${error.message}`, 'error');
      console.error('Errore resolveAssetId:', error);
      return null;
    }
  }

  function loadImage(src, categoryHint = null, roomName = null, characterName = null) {
    return new Promise(async (resolve) => {
      if (!src || typeof src !== 'string') {
        resolve(null);
        return;
      }

      // Controlla prima AssetRegistry (cache principale)
      if (AssetRegistry.images.has(src)) {
        const cachedImg = AssetRegistry.images.get(src);
        if (cachedImg && cachedImg.complete) {
          resolve(cachedImg);
          return;
        }
      }

      // Controlla cache legacy (per compatibilità)
      if (loadedImages.has(src)) {
        const legacyImg = loadedImages.get(src);
        if (legacyImg && legacyImg.complete) {
          AssetRegistry.images.set(src, legacyImg); // Migra alla registry
          resolve(legacyImg);
          return;
        }
      }

      let imageUrl = src;
      let resolvedCategory = null; // Variabile per tracciare la categoria risolta

      // Se l'URL inizia con "asset:", risolvi l'assetId
      if (src.startsWith('asset:')) {
        const assetId = src.substring(6); // Rimuovi prefisso "asset:"
        log(`[Runtime] Risoluzione assetId: ${assetId}${categoryHint ? ` (categoria suggerita: ${categoryHint})` : ''}${roomName ? ` (roomName: ${roomName})` : ''}${characterName ? ` (characterName: ${characterName})` : ''}`, 'info');
        
        let resolvedUrl = null;
        
        // Se abbiamo un hint sulla categoria, proviamo prima quella
        if (categoryHint) {
          try {
            resolvedUrl = await resolveAssetId(assetId, categoryHint, roomName, characterName);
            if (resolvedUrl) {
              resolvedCategory = categoryHint;
              log(`[Runtime] AssetId risolto in categoria '${categoryHint}': ${resolvedUrl.substring(0, 80)}${resolvedUrl.length > 80 ? '...' : ''}`, 'success');
            } else {
              log(`[Runtime] resolveAssetId ha restituito null per categoria '${categoryHint}'`, 'warning');
            }
          } catch (e) {
            log(`[Runtime] Tentativo risoluzione categoria '${categoryHint}' fallito: ${e.message}`, 'error');
          }
        }
        
        // Se non abbiamo ancora risolto, prova tutte le categorie in ordine
        // Ordine ottimizzato: background prima (ora sono in backgrounds, non più in sprites)
        // Poi foreground, sprite, gui (foreground prima di sprite perché potrebbe essere confuso)
        if (!resolvedUrl) {
          const categories = ['background', 'foreground', 'sprite', 'gui'];
          
          for (const category of categories) {
            // Salta la categoria già provata
            if (category === categoryHint) continue;
            
            try {
              resolvedUrl = await resolveAssetId(assetId, category, roomName, characterName);
              if (resolvedUrl) {
                resolvedCategory = category;
                log(`[Runtime] AssetId risolto in categoria '${category}': ${resolvedUrl.substring(0, 80)}${resolvedUrl.length > 80 ? '...' : ''}`, 'info');
                break;
              } else {
                log(`[Runtime] resolveAssetId ha restituito null per categoria '${category}'`, 'info');
              }
            } catch (e) {
              // Continua con la prossima categoria
              log(`[Runtime] Tentativo risoluzione categoria '${category}' fallito: ${e.message}`, 'error');
              continue;
            }
          }
        }

        if (resolvedUrl) {
          imageUrl = resolvedUrl;
          log(`[Runtime] URL finale per assetId '${assetId}': ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`, 'info');
        } else {
          // Se non riesce a risolvere, logga e restituisci null
          log(`[Runtime] Impossibile risolvere assetId '${assetId}' in nessuna categoria. Verifica che Supabase sia configurato correttamente.`, 'warning');
          resolve(null);
          return;
        }
      }

      // Timeout per evitare che il caricamento si blocchi indefinitamente
      const timeout = setTimeout(() => {
        log(`Timeout caricamento immagine: ${src}`, 'warning');
        resolve(null);
      }, 10000); // 10 secondi timeout

      const img = new Image();
      
      // Per Supabase Storage pubblico, non serve crossOrigin
      // Se l'URL è pubblico, il browser può caricarlo direttamente
      // crossOrigin può causare problemi se il server non supporta CORS correttamente
      // img.crossOrigin = 'anonymous'; // Commentato - prova senza se fallisce
      
      img.onload = () => {
        clearTimeout(timeout);
        // Verifica che l'immagine sia valida
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          log(`[Runtime] Immagine caricata ma dimensioni invalide (${img.naturalWidth}x${img.naturalHeight}): ${src}`, 'warning');
          resolve(null);
          return;
        }
        // Salva sia in AssetRegistry che in loadedImages (per compatibilità)
        // IMPORTANTE: Salva con ENTRAMBE le chiavi per garantire che la ricerca funzioni sempre
        // 1. Chiave originale (assetId o URL originale)
        AssetRegistry.images.set(src, img);
        loadedImages.set(src, img);
        // 2. Se abbiamo risolto un URL diverso da src, salva anche con quell'URL come chiave
        if (imageUrl !== src && imageUrl) {
          AssetRegistry.images.set(imageUrl, img);
          loadedImages.set(imageUrl, img);
          log(`[Runtime] Immagine salvata anche con URL risolto come chiave`, 'info');
        }
        log(`[Runtime] ✓ Immagine caricata con successo: ${src.substring(0, 50)}${src.length > 50 ? '...' : ''} (${img.naturalWidth}x${img.naturalHeight})`, 'success');
        resolve(img);
      };
      img.onerror = (error) => {
        clearTimeout(timeout);
        log(`[Runtime] ✗ Errore caricamento immagine '${src.substring(0, 50)}${src.length > 50 ? '...' : ''}'`, 'error');
        log(`[Runtime] URL tentato: ${imageUrl}`, 'error');
        log(`[Runtime] Categoria usata: ${resolvedCategory || categoryHint || 'sconosciuta'}`, 'error');
        log(`[Runtime] Possibili cause: CORS, file inesistente, formato non supportato, path errato`, 'warning');
        
        // Prova a verificare se l'URL è raggiungibile (solo per debug)
        log(`[Runtime] Tentativo verifica URL...`, 'info');
        fetch(imageUrl, { method: 'HEAD', mode: 'no-cors' })
          .then(() => {
            log(`[Runtime] URL raggiungibile (HEAD request inviata)`, 'info');
          })
          .catch((fetchError) => {
            log(`[Runtime] Errore fetch HEAD: ${fetchError.message}`, 'warning');
          });
        
        // Suggerimento: verifica manualmente l'URL nel browser
        log(`[Runtime] SUGGERIMENTO: Apri questo URL nel browser per verificare se il file esiste:`, 'info');
        log(`[Runtime] ${imageUrl}`, 'info');
        
        console.error('Errore caricamento immagine:', {
          src,
          imageUrl,
          category: resolvedCategory || categoryHint || 'sconosciuta',
          error,
          imgError: img.error,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete
        });
        resolve(null);
      };
      
      log(`[Runtime] Avvio caricamento immagine: ${src.substring(0, 50)}${src.length > 50 ? '...' : ''} -> ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`, 'info');
      img.src = imageUrl;
    });
  }

  // ============================================
  // INIZIALIZZAZIONE RUNTIME
  // ============================================
  window.initRuntime = async function(projectData) {
    try {
      log('[Runtime] initRuntime chiamato', 'info');
      
      // Validazione progetto
      if (!projectData || typeof projectData !== 'object') {
        throw new Error('Dati progetto non validi');
      }

      if (projectData.format !== 'amianto-game') {
        throw new Error('Formato progetto non supportato. Atteso: amianto-game');
      }

      // Se siamo in iframe, modalità playtest (sandboxed)
      if (isInIframe) {
        log('[Runtime] Modalità iframe (playtest) - inizializzazione sandboxed', 'info');
        
        // In modalità iframe, carica solo i dati necessari per gli script
        gameState.projectData = projectData;
        gameState.scripts = projectData.scripts || {};
        gameState.attachments = projectData.attachments || {};
        await initializeVariables(projectData.variables);
        
        // Invia conferma all'editor
        sendToEditor({
          type: 'PLAYTEST_STARTED',
          timestamp: Date.now()
        });
        
        log('[Runtime] Playtest avviato (sandboxed)', 'success');
        return;
      }

      // Modalità standalone - inizializzazione completa con rendering
      log('[Runtime] Modalità standalone - inizializzazione completa', 'info');
      showLoadingOverlay();
      updateLoadingMessage('Inizializzazione runtime...');

      // Validazione progetto
      if (!projectData || typeof projectData !== 'object') {
        throw new Error('Dati progetto non validi');
      }

      if (projectData.format !== 'amianto-game') {
        throw new Error('Formato progetto non supportato. Atteso: amianto-game');
      }

      // Reset stato
      gameState.projectData = projectData;
      gameState.variables.clear();
      gameState.objects.clear();
      gameState.guis.clear();
      gameState.characters.clear();
      gameState.characterDefinitions.clear();
      gameState.scripts = projectData.scripts || {};
      gameState.attachments = projectData.attachments || {};
      
      // ⚠️ RESET CACHE SCRIPT: Pulisci la cache degli script compilati quando viene caricato un nuovo progetto
      // Questo garantisce che gli script vengano ricompilati con il nuovo contenuto
      gameState.compiledScripts.clear();
      log('[Runtime] Cache script compilati resettata', 'info');
      
      // ⚠️ RESET FLAG EVENTI: Quando viene caricato un nuovo progetto, reset flag eventi
      // Questo permette di bindare nuovamente gli eventi dopo il cleanup
      runtime.eventsBound = false;
      log('[Runtime] Flag eventi resettato (runtime.eventsBound=false)', 'info');
      
      // Reset AssetRegistry
      AssetRegistry.images.clear();
      AssetRegistry.isLoading = false;
      AssetRegistry.loadComplete = false;

      // Salva informazioni progetto per risolvere assetId
      // Prova prima da _meta nel progetto
      if (projectData._meta && projectData._meta.userId && projectData._meta.projectId) {
        projectInfo.userId = projectData._meta.userId;
        projectInfo.projectId = projectData._meta.projectId;
        log(`[Runtime] projectInfo impostato da _meta: userId=${projectInfo.userId}, projectId=${projectInfo.projectId}`, 'info');
      } else {
        // Fallback: prova a recuperare da Firebase Auth se disponibile
        if (typeof window !== 'undefined' && window.firebaseAuth && window.firebaseAuth.currentUser) {
          projectInfo.userId = window.firebaseAuth.currentUser.uid;
          log(`[Runtime] projectInfo.userId recuperato da Firebase Auth: ${projectInfo.userId}`, 'info');
        }
        
        // Prova a recuperare projectId da settings, localStorage o nome progetto
        if (!projectInfo.projectId) {
          // Prova da settings se c'è un ID
          if (projectData.settings && projectData.settings.id) {
            projectInfo.projectId = projectData.settings.id;
            log(`[Runtime] projectInfo.projectId recuperato da settings.id: ${projectInfo.projectId}`, 'info');
          }
          // Prova da settings.name (normalizzato come viene fatto nel salvataggio)
          else if (projectData.settings && projectData.settings.name) {
            const projectName = projectData.settings.name;
            // Normalizza il nome come viene fatto in saveCurrentProject
            projectInfo.projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
            log(`[Runtime] projectInfo.projectId normalizzato da settings.name "${projectName}" -> "${projectInfo.projectId}"`, 'info');
          }
          // Prova da localStorage (fallback)
          else if (typeof localStorage !== 'undefined') {
            const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
            if (activeProjectName) {
              // Normalizza il nome come viene fatto in saveCurrentProject
              projectInfo.projectId = activeProjectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
              log(`[Runtime] projectInfo.projectId normalizzato da localStorage activeProjectName "${activeProjectName}" -> "${projectInfo.projectId}"`, 'info');
            }
          }
        }
        
        if (!projectInfo.userId || !projectInfo.projectId) {
          log(`[Runtime] ATTENZIONE: projectInfo incompleto (userId: ${projectInfo.userId ? 'ok' : 'mancante'}, projectId: ${projectInfo.projectId ? 'ok' : 'mancante'}). AssetId potrebbero non essere risolti.`, 'warning');
        } else {
          log(`[Runtime] projectInfo recuperato da fallback: userId=${projectInfo.userId}, projectId=${projectInfo.projectId}`, 'info');
        }
      }

      // Inizializza canvas (solo in modalità standalone)
      canvas = document.getElementById('game-canvas');
      if (!canvas) {
        throw new Error('Canvas non trovato');
      }

      ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Impossibile ottenere contesto canvas');
      }

      // Imposta dimensioni canvas
      const settings = projectData.settings || {};
      canvasWidth = settings.canvasWidth || 800;
      canvasHeight = settings.canvasHeight || 600;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      updateLoadingMessage('Caricamento variabili...');
      await initializeVariables(projectData.variables);

      updateLoadingMessage('Caricamento immagini...');
      let assetStats = { total: 0, loaded: 0, failed: 0 };
      try {
        assetStats = await preloadAssets(projectData);
        log(`[Runtime] Preload completato: ${assetStats.loaded}/${assetStats.total} asset caricati`, 
            assetStats.failed > 0 ? 'warning' : 'success');
      } catch (error) {
        log(`[Runtime] Errore preload assets: ${error.message}`, 'error');
        console.error(error);
        // Continua anche se il preload fallisce parzialmente
      }

      // Verifica che il preload sia completato prima di procedere
      if (!AssetRegistry.loadComplete) {
        log('[Runtime] ATTENZIONE: Preload non completato, potrebbe causare problemi di rendering', 'warning');
      }

      updateLoadingMessage('Caricamento character...');
      await loadCharacterDefinitions(projectData.characters || []);

      updateLoadingMessage('Caricamento room iniziale...');
      const startRoomId = settings.startRoom || settings.startRoomId || (projectData.rooms && projectData.rooms.length > 0 ? projectData.rooms[0].id : null);
      if (startRoomId) {
        await changeRoom(startRoomId);
      } else {
        log('[Runtime] Nessuna room iniziale specificata', 'warning');
      }

      // Spawn automatico player all'avvio se configurato
      // IMPORTANTE: Spawna DOPO il cambio room, così il player è nella room corretta
      // PRIORITÀ 1: spawnSettings.isPlayer (più specifico e moderno)
      const playerCharacter = (projectData.characters || []).find(char => 
        char.spawnSettings && char.spawnSettings.isPlayer === true
      );
      
      if (playerCharacter && playerCharacter.spawnSettings) {
        const spawn = playerCharacter.spawnSettings;
        // Verifica che il character esista nelle definizioni
        const charDef = gameState.characterDefinitions.get(playerCharacter.name);
        if (!charDef) {
          log(`[Runtime] Player "${playerCharacter.name}" non trovato nelle definizioni character`, 'error');
        } else {
          const playerId = GameAPI.spawn_character(
            playerCharacter.name,
            spawn.x || 0,
            spawn.y || 0,
            spawn.direction || 'south'
          );
          if (playerId) {
            GameAPI.setVariable('playerId', playerId);
            log(`[Runtime] Player "${playerCharacter.name}" spawnato automaticamente da spawnSettings a (${spawn.x || 0}, ${spawn.y || 0}) in room ${gameState.currentRoomId}`, 'info');
          } else {
            log(`[Runtime] Errore spawn player "${playerCharacter.name}"`, 'error');
          }
        }
      } else if (settings.startingPlayer && settings.startX !== undefined && settings.startY !== undefined) {
        // PRIORITÀ 2: settings legacy (per retrocompatibilità)
        const charDef = gameState.characterDefinitions.get(settings.startingPlayer);
        if (!charDef) {
          log(`[Runtime] Player "${settings.startingPlayer}" non trovato nelle definizioni character`, 'error');
        } else {
          const playerId = GameAPI.spawn_character(
            settings.startingPlayer,
            Number(settings.startX) || 0,
            Number(settings.startY) || 0,
            'south' // direzione di default
          );
          if (playerId) {
            GameAPI.setVariable('playerId', playerId);
            log(`[Runtime] Player "${settings.startingPlayer}" spawnato automaticamente da settings legacy a (${settings.startX}, ${settings.startY}) in room ${gameState.currentRoomId}`, 'info');
          } else {
            log(`[Runtime] Errore spawn player "${settings.startingPlayer}"`, 'error');
          }
        }
      }

      updateLoadingMessage('Caricamento GUI...');
      await loadGUIs(projectData.guis || []);

      updateLoadingMessage('Esecuzione script iniziali...');
      await executeGameStartScripts();

      gameState.initialized = true;
      hideLoadingOverlay();

      // ⚠️ SETUP INTERAZIONE: Configura listener click centralizzato
      // IMPORTANTE: setupInteraction() viene chiamato QUI, dopo che il canvas è pronto
      // e PRIMA di avviare il game loop. Questo garantisce che il listener sia
      // registrato solo quando il runtime è completamente inizializzato.
      setupInteraction();

      // Avvia game loop solo se tutto è pronto
      if (gameState.currentRoom && AssetRegistry.loadComplete) {
        log('[Runtime] Tutti gli asset caricati, avvio rendering...', 'info');
        startGameLoop();
        log('[Runtime] Runtime inizializzato con successo - game loop avviato', 'success');
      } else {
        if (!gameState.currentRoom) {
          log('[Runtime] Runtime inizializzato ma nessuna stanza disponibile', 'warning');
        }
        if (!AssetRegistry.loadComplete) {
          log('[Runtime] Runtime inizializzato ma preload non completato', 'warning');
        }
        // Avvia comunque il game loop, il rendering gestirà le immagini mancanti
        startGameLoop();
      }
    } catch (error) {
      log(`Errore inizializzazione runtime: ${error.message}`, 'error');
      console.error(error);
      hideLoadingOverlay();
    }
  };

  // ============================================
  // INIZIALIZZAZIONE VARIABILI
  // ============================================
  async function initializeVariables(variablesData) {
    if (!variablesData) return;

    // Inizializza variabili dalle definizioni
    if (variablesData.definitions && Array.isArray(variablesData.definitions)) {
      variablesData.definitions.forEach(def => {
        if (def.name) {
          let initialValue = def.initialValue;
          // Converti in base al tipo
          if (def.type === 'number') {
            initialValue = Number(initialValue) || 0;
          } else if (def.type === 'boolean') {
            initialValue = Boolean(initialValue);
          } else if (def.type === 'string') {
            initialValue = String(initialValue || '');
          }
          gameState.variables.set(def.name, initialValue);
        }
      });
    }

    // Carica stato variabili se presente
    if (variablesData.state && typeof variablesData.state === 'object') {
      Object.keys(variablesData.state).forEach(key => {
        gameState.variables.set(key, variablesData.state[key]);
      });
    }
  }

  // ============================================
  // PRELOAD ASSETS
  // ============================================
  /**
   * Precarica TUTTI gli asset del progetto e li salva in AssetRegistry
   * @param {Object} projectData - Dati del progetto serializzati
   * @returns {Promise<Object>} - Statistiche del caricamento
   */
  async function preloadAssets(projectData) {
    log('[Runtime] Inizio preload assets...', 'info');
    AssetRegistry.isLoading = true;
    AssetRegistry.loadComplete = false;
    
    // Usa una Map per associare asset alla loro categoria e roomId
    const assetsWithCategory = new Map(); // key: assetId/URL, value: { category, roomId }
    const assetStats = {
      total: 0,
      loaded: 0,
      failed: 0,
      skipped: 0
    };

    // Raccogli TUTTI gli asset con la loro categoria corretta, roomName e characterName
    // Room backgrounds e foregrounds
    if (projectData.rooms && Array.isArray(projectData.rooms)) {
      projectData.rooms.forEach(room => {
        const roomName = room.name || room.id;
        if (room.background && typeof room.background === 'string') {
          assetsWithCategory.set(room.background, { category: 'background', roomName, characterName: null });
        }
        if (room.foregrounds && Array.isArray(room.foregrounds)) {
          room.foregrounds.forEach(fg => {
            if (fg.image && typeof fg.image === 'string') {
              assetsWithCategory.set(fg.image, { category: 'foreground', roomName, characterName: null });
            }
          });
        }
        if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
          room.sceneObjects.forEach(obj => {
            if (obj.image && typeof obj.image === 'string') {
              assetsWithCategory.set(obj.image, { category: 'sprite', roomName, characterName: null });
            }
          });
        }
      });
    }

    // GUI backgrounds e button images (non hanno roomName)
    if (projectData.guis && Array.isArray(projectData.guis)) {
      projectData.guis.forEach(gui => {
        if (gui.background && typeof gui.background === 'string') {
          assetsWithCategory.set(gui.background, { category: 'gui', roomName: null, characterName: null });
        }
        if (gui.buttons && Array.isArray(gui.buttons)) {
          gui.buttons.forEach(btn => {
            if (btn.backgroundImage && typeof btn.backgroundImage === 'string') {
              assetsWithCategory.set(btn.backgroundImage, { category: 'gui', roomName: null, characterName: null });
            }
          });
        }
      });
    }

    // Character frames (hanno characterName invece di roomName)
    // NOTA: I frame specchiati (con proprietà mirror) non devono essere caricati come asset separati
    if (projectData.characters && Array.isArray(projectData.characters)) {
      projectData.characters.forEach(char => {
        const characterName = char.name || char.id;
        if (char.directions) {
          Object.values(char.directions).forEach(dirData => {
            if (dirData.frames && Array.isArray(dirData.frames)) {
              dirData.frames.forEach(frame => {
                // Salta i frame specchiati - non sono asset separati
                if (frame && typeof frame === 'object' && frame.mirror) {
                  // Frame specchiato, non caricare come asset
                  return;
                }
                if (frame && typeof frame === 'string') {
                  assetsWithCategory.set(frame, { category: 'character', roomName: null, characterName });
                }
              });
            }
          });
        }
      });
    }

    assetStats.total = assetsWithCategory.size;
    log(`[Runtime] Trovati ${assetStats.total} asset unici da caricare`, 'info');

    if (assetStats.total === 0) {
      log('[Runtime] Nessun asset da caricare', 'info');
      AssetRegistry.isLoading = false;
      AssetRegistry.loadComplete = true;
      return assetStats;
    }

    // Carica tutte le immagini in parallelo con la categoria corretta, roomName e characterName
    const loadPromises = Array.from(assetsWithCategory.entries()).map(async ([src, info]) => {
      try {
        const category = info.category;
        const roomName = info.roomName;
        const characterName = info.characterName;
        log(`[Runtime] Preload asset (${category}${roomName ? `, room: ${roomName}` : ''}${characterName ? `, character: ${characterName}` : ''}): ${src.substring(0, 50)}${src.length > 50 ? '...' : ''}`, 'info');
        const img = await loadImage(src, category, roomName, characterName);
        if (img && img.complete && img.naturalWidth > 0) {
          assetStats.loaded++;
          log(`[Runtime] ✓ Asset preload completato: ${src.substring(0, 50)}${src.length > 50 ? '...' : ''} (${img.naturalWidth}x${img.naturalHeight})`, 'success');
          return { src, img, success: true };
        } else {
          assetStats.failed++;
          const reason = !img ? 'immagine null' : !img.complete ? 'immagine non completa' : `dimensioni invalide (${img.naturalWidth}x${img.naturalHeight})`;
          log(`[Runtime] ✗ Asset fallito (${reason}): ${src.substring(0, 50)}${src.length > 50 ? '...' : ''}`, 'warning');
          return { src, img: null, success: false };
        }
      } catch (error) {
        assetStats.failed++;
        log(`[Runtime] ✗ Errore caricamento asset ${src.substring(0, 50)}${src.length > 50 ? '...' : ''}: ${error.message}`, 'warning');
        console.error('Errore preload asset:', error, { src });
        return { src, img: null, success: false };
      }
    });

    // Attendi il completamento di TUTTI i caricamenti
    const results = await Promise.allSettled(loadPromises);
    
    // Verifica risultati
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        assetStats.failed++;
        const assetEntry = Array.from(assetsWithCategory.entries())[index];
        log(`[Runtime] Promise rifiutata per asset ${assetEntry ? assetEntry[0] : 'unknown'}`, 'warning');
      }
    });

    AssetRegistry.isLoading = false;
    AssetRegistry.loadComplete = true;
    
    log(`[Runtime] Preload completato: ${assetStats.loaded}/${assetStats.total} asset caricati, ${assetStats.failed} falliti`, 
        assetStats.failed > 0 ? 'warning' : 'success');
    
    return assetStats;
  }

  // ============================================
  // GESTIONE ROOM
  // ============================================
  /**
   * Cambia la room corrente usando solo asset già caricati in AssetRegistry
   * NON carica nuove immagini, usa solo quelle pre-caricate
   */
  async function changeRoom(roomId) {
    if (!gameState.projectData || !gameState.projectData.rooms) {
      log('Nessun progetto caricato', 'error');
      return;
    }

    const room = gameState.projectData.rooms.find(r => r.id === roomId || r.name === roomId);
    if (!room) {
      log(`Room non trovata: ${roomId}`, 'error');
      return;
    }

    log(`[Runtime] Cambio room: ${roomId}`, 'info');

    const oldRoomId = gameState.currentRoomId;
    gameState.currentRoomId = roomId;

    // Recupera immagini dalla AssetRegistry (già caricate)
    let backgroundImg = null;
    if (room.background && typeof room.background === 'string') {
      backgroundImg = AssetRegistry.images.get(room.background);
      if (!backgroundImg || !backgroundImg.complete) {
        log(`[Runtime] Background non trovato in registry per room ${roomId}, URL: ${room.background.substring(0, 50)}`, 'warning');
        backgroundImg = null;
      }
    }

    const foregrounds = [];
    if (room.foregrounds && Array.isArray(room.foregrounds)) {
      for (const fg of room.foregrounds) {
        if (fg.image && typeof fg.image === 'string') {
          const img = AssetRegistry.images.get(fg.image);
          if (img && img.complete && img.naturalWidth > 0) {
            foregrounds.push({
              img,
              offsetX: Number(fg.offsetX) || 0,
              offsetY: Number(fg.offsetY) || 0
            });
          } else {
            log(`[Runtime] Foreground non trovato in registry per room ${roomId}, URL: ${fg.image.substring(0, 50)}`, 'warning');
          }
        }
      }
    }

    // Recupera oggetti della room dalla AssetRegistry
    const objects = [];
    if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
      for (const objData of room.sceneObjects) {
        if (objData.image && typeof objData.image === 'string') {
          const img = AssetRegistry.images.get(objData.image);
          if (img && img.complete && img.naturalWidth > 0) {
            objects.push({
              id: objData.id,
              name: objData.name || objData.id,
              type: objData.type || 'Interactive',
              x: Number(objData.x) || 0,
              y: Number(objData.y) || 0,
              img,
              visible: true,
              enabled: true
            });
          } else {
            log(`[Runtime] Immagine oggetto non trovata in registry: ${objData.id} (${objData.image.substring(0, 50)})`, 'warning');
          }
        }
      }
    }

    // ⚠️ NUOVA STRUTTURA: Carica hotspot con scripts.onClick integrato
    const hotspots = [];
    if (room.hotspots && Array.isArray(room.hotspots)) {
      for (const hotspotData of room.hotspots) {
        if (hotspotData.points && Array.isArray(hotspotData.points) && hotspotData.points.length >= 3) {
          // Ricostruisci hotspot con struttura scripts.onClick
          const hotspot = {
            id: hotspotData.id || `hotspot_${Date.now()}`,
            name: hotspotData.name || 'Hotspot',
            points: hotspotData.points.map(p => ({
              x: Number(p.x) || 0,
              y: Number(p.y) || 0
            })),
            visible: typeof hotspotData.visible === 'boolean' ? hotspotData.visible : true,
            scripts: {}
          };
          
          // ⚠️ NUOVA STRUTTURA: Carica scripts.onClick direttamente dall'hotspot (nessuna retrocompatibilità)
          if (hotspotData.scripts && hotspotData.scripts.onClick) {
            const onClickData = hotspotData.scripts.onClick;
            
            // DEBUG: Log dati raw per diagnosticare problemi
            log(`[Runtime] changeRoom: [DEBUG] Hotspot ${hotspot.id} - onClickData: ${JSON.stringify({ 
              hasCode: !!onClickData.code, 
              codeType: typeof onClickData.code, 
              codeLength: onClickData.code ? String(onClickData.code).length : 0,
              enabled: onClickData.enabled,
              enabledType: typeof onClickData.enabled
            })}`, 'info');
            
            const hasCode = onClickData.code && typeof onClickData.code === 'string' && onClickData.code.trim() !== '';
            
            // ⚠️ NORMALIZZAZIONE: enabled = true di default se non definito o undefined
            // BUG FIX: Garantisce che enabled=true quando c'è codice e enabled non è esplicitamente definito come false
            // - Se enabled è esplicitamente definito come boolean (true o false), usa quel valore
            // - Se enabled non è definito (undefined/null) e c'è codice, imposta true
            // - Se enabled non è definito e non c'è codice, imposta false
            let normalizedEnabled;
            if (typeof onClickData.enabled === 'boolean') {
              // enabled è esplicitamente true o false, rispetta il valore
              normalizedEnabled = onClickData.enabled;
            } else {
              // enabled non è definito: usa true se c'è codice, altrimenti false
              normalizedEnabled = hasCode ? true : false;
            }
            
            // BUG FIX CRITICO: Se c'è codice ma enabled è false, forza enabled=true
            // Questo risolve il caso in cui enabled=false viene salvato erroneamente quando c'è codice
            if (hasCode && normalizedEnabled === false) {
              log(`[Runtime] changeRoom: [BUG FIX] Hotspot ${hotspot.id} ha codice ma enabled=false, forzo enabled=true`, 'warning');
              normalizedEnabled = true;
            }
            
            hotspot.scripts.onClick = {
              code: String(onClickData.code || ''),
              enabled: normalizedEnabled
            };
            
            log(`[Runtime] changeRoom: Hotspot ${hotspot.id} caricato con script onClick (enabled: ${normalizedEnabled}, code length: ${hotspot.scripts.onClick.code.length}, wasUndefined: ${typeof onClickData.enabled !== 'boolean'})`, 'info');
          } else {
            // Nessuno script associato
            hotspot.scripts.onClick = {
              code: '',
              enabled: false
            };
            log(`[Runtime] changeRoom: Hotspot ${hotspot.id} caricato senza script onClick`, 'info');
          }
          
          hotspots.push(hotspot);
        } else {
          log(`[Runtime] Hotspot ${hotspotData.id || 'unknown'} ignorato: punti insufficienti (< 3)`, 'warning');
        }
      }
    }

    // Salva nello stato
    gameState.currentRoom = {
      ...room,
      backgroundImg,
      foregrounds,
      objects,
      hotspots,
      walkableArea: room.walkableArea || null,
      // Usa valori di default solo se non sono definiti, ma preserva 0 e null
      scalingMinScale: (typeof room.scalingMinScale === 'number' && !isNaN(room.scalingMinScale)) 
        ? room.scalingMinScale 
        : 0.5,
      scalingMaxScale: (typeof room.scalingMaxScale === 'number' && !isNaN(room.scalingMaxScale)) 
        ? room.scalingMaxScale 
        : 1.5,
      // Preserva null, undefined e valori numerici (incluso 0)
      scalingBackgroundY: (typeof room.scalingBackgroundY === 'number' && !isNaN(room.scalingBackgroundY)) 
        ? room.scalingBackgroundY 
        : (room.scalingBackgroundY === null ? null : undefined),
      scalingForegroundY: (typeof room.scalingForegroundY === 'number' && !isNaN(room.scalingForegroundY)) 
        ? room.scalingForegroundY 
        : (room.scalingForegroundY === null ? null : undefined)
    };

    // Rimuovi character della room precedente (solo NPC, non il player)
    // Aggiorna anche il roomId del player se presente
    const charactersToRemove = [];
    gameState.characters.forEach((character, characterId) => {
      // Verifica se è un player
      const charDef = gameState.characterDefinitions.get(character.name);
      const isPlayer = charDef && charDef.spawnSettings && charDef.spawnSettings.isPlayer === true;
      
      if (isPlayer) {
        // Aggiorna roomId del player
        character.roomId = roomId;
      } else {
        // Rimuovi solo se il character è nella room precedente e non è un player
        if (character.roomId === oldRoomId) {
          charactersToRemove.push(characterId);
        }
      }
    });
    charactersToRemove.forEach(id => {
      gameState.characters.delete(id);
      log(`[Runtime] Character ${id} rimosso (cambio room)`, 'info');
    });

    // Spawn automatico NPC per questa room
    if (gameState.projectData && gameState.projectData.characters) {
      const roomNPCs = gameState.projectData.characters.filter(char => {
        if (!char.spawnSettings) return false;
        const spawn = char.spawnSettings;
        // Spawna se: autoSpawn è true, non è player, e roomId corrisponde
        return spawn.autoSpawn === true && 
               spawn.isPlayer !== true && 
               spawn.roomId === roomId;
      });

      for (const npcData of roomNPCs) {
        const spawn = npcData.spawnSettings;
        // Verifica che il character non sia già spawnato
        let alreadySpawned = false;
        gameState.characters.forEach((character) => {
          if (character.name === npcData.name && character.roomId === roomId) {
            alreadySpawned = true;
          }
        });

        if (!alreadySpawned) {
          const npcId = GameAPI.spawn_character(
            npcData.name,
            spawn.x || 0,
            spawn.y || 0,
            spawn.direction || 'south'
          );
          if (npcId) {
            log(`[Runtime] NPC "${npcData.name}" spawnato automaticamente in room ${roomId} a (${spawn.x || 0}, ${spawn.y || 0})`, 'info');
          }
        }
      }
    }

    // Esegui script on_room_change se presente
    await executeRoomChangeScripts(oldRoomId, roomId);

    log(`[Runtime] Room cambiata: ${roomId} (bg: ${backgroundImg ? 'ok' : 'mancante'}, fg: ${foregrounds.length}, obj: ${objects.length}, hotspots: ${hotspots.length})`, 'info');
  }

  // ============================================
  // GESTIONE CHARACTER
  // ============================================
  /**
   * Carica le definizioni dei character dal progetto
   * I frame sono già stati caricati in AssetRegistry durante il preload
   */
  async function loadCharacterDefinitions(charactersData) {
    if (!charactersData || !Array.isArray(charactersData)) {
      log('[Runtime] Nessun character da caricare', 'info');
      return;
    }

    log(`[Runtime] Caricamento ${charactersData.length} definizioni character...`, 'info');
    gameState.characterDefinitions.clear();

    for (const charData of charactersData) {
      const characterName = charData.name || charData.id;
      if (!characterName) {
        log('[Runtime] Character ignorato: nome mancante', 'warning');
        continue;
      }

      const directions = {};
      if (charData.directions) {
        for (const [dir, dirData] of Object.entries(charData.directions)) {
          if (dirData && dirData.frames && Array.isArray(dirData.frames)) {
            const frames = [];
            for (const frame of dirData.frames) {
              // Gestisci frame specchiati
              if (frame && typeof frame === 'object' && frame.mirror) {
                // Frame specchiato: salva riferimento
                frames.push({ mirror: frame.mirror });
              } else if (frame && typeof frame === 'string') {
                // Frame normale: recupera immagine da AssetRegistry
                const img = AssetRegistry.images.get(frame);
                if (img && img.complete && img.naturalWidth > 0) {
                  frames.push(img);
                } else {
                  log(`[Runtime] Frame character non trovato in registry: ${characterName}/${dir} (${frame.substring(0, 50)})`, 'warning');
                }
              }
            }
            
            if (frames.length > 0) {
              directions[dir] = {
                fps: Number(dirData.fps) || 8,
                frames: frames
              };
            }
          }
        }
      }

      if (Object.keys(directions).length > 0) {
        const charDef = { directions };
        // Load pivot if it exists
        if (charData.pivotX !== undefined && charData.pivotY !== undefined) {
          charDef.pivotX = Number(charData.pivotX) || 0;
          charDef.pivotY = Number(charData.pivotY) || 0;
        }
        // Load spawnSettings if it exists (per spawn automatico)
        if (charData.spawnSettings) {
          charDef.spawnSettings = charData.spawnSettings;
        }
        gameState.characterDefinitions.set(characterName, charDef);
        log(`[Runtime] Character definizione caricata: ${characterName} (${Object.keys(directions).length} direzioni)`, 'info');
      } else {
        log(`[Runtime] Character ignorato: ${characterName} (nessuna direzione valida)`, 'warning');
      }
    }

    log(`[Runtime] Caricamento definizioni character completato: ${gameState.characterDefinitions.size} character caricati`, 'success');
  }

  // Cache per frame specchiati (per evitare di ricrearli ogni frame)
  const mirroredFrameCache = new Map(); // key: `${characterName}_${direction}_${frameIndex}`, value: HTMLCanvasElement

  /**
   * Renderizza un placeholder per un character quando non ci sono frame disponibili
   */
  function renderCharacterPlaceholder(ctx, character, charDef, scale) {
    try {
      // Dimensioni placeholder di default
      const defaultWidth = 32;
      const defaultHeight = 48;
      
      // Usa dimensioni dal pivot se disponibili, altrimenti usa dimensioni di default
      let placeholderWidth = defaultWidth;
      let placeholderHeight = defaultHeight;
      
      if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
        // Stima dimensioni basate sul pivot (assumendo che il pivot sia al centro in X e in basso in Y)
        placeholderWidth = charDef.pivotX * 2;
        placeholderHeight = charDef.pivotY;
      }
      
      const scaledWidth = placeholderWidth * scale;
      const scaledHeight = placeholderHeight * scale;
      
      let drawX = character.x;
      let drawY = character.y;
      
      // If character has a pivot, adjust drawing position
      if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
        drawX = character.x - (charDef.pivotX * scale);
        drawY = character.y - (charDef.pivotY * scale);
      }
      
      // Disegna un rettangolo semplice come placeholder
      ctx.save();
      ctx.fillStyle = '#ff00ff'; // Magenta per indicare che è un placeholder
      ctx.globalAlpha = 0.5;
      ctx.fillRect(drawX, drawY, scaledWidth, scaledHeight);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1.0;
      ctx.strokeRect(drawX, drawY, scaledWidth, scaledHeight);
      ctx.restore();
    } catch (error) {
      // Se anche il placeholder fallisce, almeno logga l'errore
      log(`[Runtime] Errore rendering placeholder per character ${character.id}: ${error.message}`, 'warning');
    }
  }

  // Mappa delle direzioni vicine per il fallback
  const directionFallbackMap = {
    'north': ['northeast', 'northwest', 'east', 'west', 'south', 'southeast', 'southwest'],
    'northeast': ['north', 'east', 'northwest', 'southeast', 'west', 'south', 'southwest'],
    'east': ['northeast', 'southeast', 'north', 'south', 'northwest', 'southwest', 'west'],
    'southeast': ['east', 'south', 'northeast', 'southwest', 'north', 'west', 'northwest'],
    'south': ['southeast', 'southwest', 'east', 'west', 'north', 'northeast', 'northwest'],
    'southwest': ['south', 'west', 'southeast', 'northwest', 'east', 'north', 'northeast'],
    'west': ['southwest', 'northwest', 'south', 'north', 'southeast', 'northeast', 'east'],
    'northwest': ['north', 'west', 'northeast', 'southwest', 'south', 'east', 'southeast']
  };

  /**
   * Cerca un frame valido tra le direzioni alternative (fallback)
   */
  function findFallbackFrame(charDef, preferredDirection, frameIndex, fallbackDirections) {
    for (const fallbackDir of fallbackDirections) {
      const dirData = charDef.directions[fallbackDir];
      if (!dirData || !dirData.frames || dirData.frames.length === 0) {
        continue;
      }

      const actualFrameIndex = frameIndex % dirData.frames.length;
      const frame = dirData.frames[actualFrameIndex];

      // Se è un frame specchiato, prova a ottenerlo
      if (frame && typeof frame === 'object' && frame.mirror) {
        const sourceDir = frame.mirror;
        const sourceDirData = charDef.directions[sourceDir];
        if (sourceDirData && sourceDirData.frames && sourceDirData.frames.length > 0) {
          const sourceFrame = sourceDirData.frames[actualFrameIndex % sourceDirData.frames.length];
          if (sourceFrame && sourceFrame.complete && sourceFrame.naturalWidth > 0) {
            // Crea un canvas per specchiare l'immagine
            const canvas = document.createElement('canvas');
            canvas.width = sourceFrame.width || sourceFrame.naturalWidth;
            canvas.height = sourceFrame.height || sourceFrame.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sourceFrame, 0, 0);
            return canvas;
          }
        }
        continue;
      }

      // Frame normale
      if (frame && frame.complete && frame.naturalWidth > 0) {
        return frame;
      }
    }
    return null;
  }

  /**
   * Ottiene il frame corrente di un character, gestendo anche frame specchiati
   * Se il frame richiesto non è disponibile, cerca frame di direzioni vicine (fallback)
   */
  function getCharacterFrame(characterName, direction, frameIndex) {
    const charDef = gameState.characterDefinitions.get(characterName);
    if (!charDef) {
      return null;
    }

    // Prova prima con la direzione richiesta
    if (charDef.directions[direction]) {
      const dirData = charDef.directions[direction];
      if (dirData.frames && dirData.frames.length > 0) {
        const actualFrameIndex = frameIndex % dirData.frames.length;
        const frame = dirData.frames[actualFrameIndex];

        // Se è un frame specchiato, ottieni il frame originale e specchialo
        if (frame && typeof frame === 'object' && frame.mirror) {
          const sourceDir = frame.mirror;
          const cacheKey = `${characterName}_${direction}_${actualFrameIndex}`;
          
          // Controlla se è già in cache
          if (mirroredFrameCache.has(cacheKey)) {
            return mirroredFrameCache.get(cacheKey);
          }

          const sourceDirData = charDef.directions[sourceDir];
          if (sourceDirData && sourceDirData.frames && sourceDirData.frames.length > 0) {
            const sourceFrame = sourceDirData.frames[actualFrameIndex % sourceDirData.frames.length];
            if (sourceFrame && sourceFrame.complete && sourceFrame.naturalWidth > 0) {
              // Crea un canvas per specchiare l'immagine e mettilo in cache
              const canvas = document.createElement('canvas');
              canvas.width = sourceFrame.width || sourceFrame.naturalWidth;
              canvas.height = sourceFrame.height || sourceFrame.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(sourceFrame, 0, 0);
              mirroredFrameCache.set(cacheKey, canvas);
              return canvas;
            }
          }
        } else {
          // Frame normale
          if (frame && frame.complete && frame.naturalWidth > 0) {
            return frame;
          }
        }
      }
    }

    // Se non abbiamo trovato un frame valido, cerca tra le direzioni alternative
    const fallbackDirections = directionFallbackMap[direction] || ['south', 'north', 'east', 'west'];
    const fallbackFrame = findFallbackFrame(charDef, direction, frameIndex, fallbackDirections);
    
    if (fallbackFrame) {
      // Log solo una volta per evitare spam (opzionale, può essere rimosso)
      // log(`[Runtime] Frame fallback usato per ${characterName}: ${direction} -> direzione alternativa`, 'info');
      return fallbackFrame;
    }

    // Se ancora non abbiamo trovato nulla, prova tutte le direzioni disponibili
    const allDirections = Object.keys(charDef.directions);
    if (allDirections.length > 0) {
      // Ordina per priorità: prima quelle cardinali, poi quelle diagonali
      const priorityOrder = ['south', 'north', 'east', 'west', 'southeast', 'southwest', 'northeast', 'northwest'];
      const sortedDirections = allDirections.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      const anyFrame = findFallbackFrame(charDef, direction, frameIndex, sortedDirections);
      if (anyFrame) {
        return anyFrame;
      }
    }

    return null;
  }

  // ============================================
  // GESTIONE GUI
  // ============================================
  /**
   * Carica le GUI usando solo asset già caricati in AssetRegistry
   * NON carica nuove immagini, usa solo quelle pre-caricate
   */
  async function loadGUIs(guisData) {
    if (!guisData || !Array.isArray(guisData)) {
      log('[Runtime] Nessuna GUI da caricare', 'info');
      return;
    }

    log(`[Runtime] Caricamento ${guisData.length} GUI...`, 'info');

    for (const guiData of guisData) {
      // Recupera background dalla AssetRegistry
      let backgroundImg = null;
      if (guiData.background && typeof guiData.background === 'string') {
        backgroundImg = AssetRegistry.images.get(guiData.background);
        if (!backgroundImg || !backgroundImg.complete) {
          log(`[Runtime] Background GUI non trovato in registry: ${guiData.id} (${guiData.background.substring(0, 50)})`, 'warning');
          backgroundImg = null;
        }
      }
      
      const buttons = [];
      if (guiData.buttons && Array.isArray(guiData.buttons)) {
        for (const btnData of guiData.buttons) {
          let btnImg = null;
          if (btnData.backgroundImage && typeof btnData.backgroundImage === 'string') {
            btnImg = AssetRegistry.images.get(btnData.backgroundImage);
            if (!btnImg || !btnImg.complete) {
              log(`[Runtime] Immagine pulsante non trovata in registry: ${btnData.id} (${btnData.backgroundImage.substring(0, 50)})`, 'warning');
              btnImg = null;
            }
          }
          
          buttons.push({
            id: btnData.id,
            name: btnData.name || btnData.id,
            x: Number(btnData.x) || 0,
            y: Number(btnData.y) || 0,
            w: Number(btnData.w) || 0,
            h: Number(btnData.h) || 0,
            text: btnData.text || '',
            backgroundImage: btnImg,
            enabled: true
          });
        }
      }

      gameState.guis.set(guiData.id, {
        id: guiData.id,
        name: guiData.name || guiData.id,
        type: guiData.type || 'MainInterface',
        settings: guiData.settings || {},
        background: backgroundImg,
        buttons
      });

      log(`[Runtime] GUI caricata: ${guiData.id} (bg: ${backgroundImg ? 'ok' : 'mancante'}, buttons: ${buttons.length})`, 'info');
    }

    log(`[Runtime] Caricamento GUI completato: ${guisData.length} GUI caricate`, 'success');
  }

  // ============================================
  // COMPILAZIONE E CACHE SCRIPT
  // ============================================
  // ⚠️ SISTEMA DI CACHE SCRIPT:
  // Ogni script viene compilato UNA SOLA VOLTA e gli handler vengono estratti e cache-ati.
  // Questo previene riesecuzione di codice JS a ogni evento, garantendo:
  // - Un click = una sola chiamata handler
  // - Nessun handler duplicato
  // - Nessuna riesecuzione di codice JS
  // - Runtime deterministico e stabile
  
  /**
   * Compila uno script UNA SOLA VOLTA e estrae solo gli handler.
   * Gli handler vengono cache-ati e riutilizzati senza rieseguire il codice.
   * @param {string} scriptName - Nome dello script (chiave nella cache)
   * @param {string} scriptContent - Contenuto dello script da compilare
   * @returns {Object|null} Oggetto con gli handler estratti: { on_hotspot_click: function, on_object_click: function, ... }
   */
  function compileScript(scriptName, scriptContent) {
    if (!scriptName || !scriptContent || typeof scriptContent !== 'string') {
      return null;
    }
    
    // ⚠️ PROTEZIONE: Se lo script è già stato compilato, restituisci la cache
    if (gameState.compiledScripts.has(scriptName)) {
      log(`[Runtime] compileScript: Script '${scriptName}' già compilato, uso cache`, 'info');
      return gameState.compiledScripts.get(scriptName);
    }
    
    log(`[Runtime] compileScript: Compilazione script '${scriptName}' (prima volta)`, 'info');
    
    try {
      // Crea un contesto isolato per eseguire lo script
      // Questo contesto cattura solo le definizioni di funzioni handler
      const handlers = {};
      
      // Lista degli handler supportati
      const supportedHandlers = [
        'on_game_start',
        'on_room_change',
        'on_object_click',
        'on_character_click',
        'on_hotspot_click',
        'on_gui_click'
      ];
      
      // ⚠️ STRATEGIA DI ESTRAZIONE HANDLER:
      // Creiamo un contesto isolato dove eseguire lo script.
      // Le funzioni handler definite nello script vengono catturate dopo l'esecuzione.
      // Questo garantisce che il codice libero venga eseguito UNA SOLA VOLTA durante la compilazione.
      // ⚠️ PROTEZIONE: Creiamo wrapper "no-op" per gli handler durante la compilazione
      // per prevenire esecuzione accidentale se lo script chiama direttamente gli handler.
      
      // Crea un oggetto per catturare gli handler definiti nello script
      const handlerContainer = {};
      
      // ⚠️ WRAPPER NO-OP: Crea funzioni wrapper che NON eseguono nulla durante la compilazione
      // Questo previene esecuzione accidentale se lo script chiama direttamente gli handler
      const noOpHandlers = {};
      supportedHandlers.forEach(h => {
        noOpHandlers[h] = function() {
          // Durante la compilazione, gli handler non vengono eseguiti
          // Vengono solo estratti e salvati nella cache
          // ⚠️ IMPORTANTE: Se lo script chiama direttamente l'handler durante la compilazione,
          // questa chiamata viene ignorata per prevenire doppia esecuzione
          log(`[Runtime] compileScript: Chiamata a ${h} ignorata durante compilazione (previene doppia esecuzione)`, 'warning');
        };
      });
      
      // Crea funzione wrapper che espone GameAPI e cattura gli handler
      const scriptFunction = new Function(
        'Game',
        'GameAPI',
        'print',
        'getVariable',
        'setVariable',
        'getCurrentRoom',
        'load_room',
        'enableObject',
        'disableObject',
        'showText',
        'show_message',
        'log',
        'on_game_start',
        'on_room_change',
        'on_object_click',
        'on_character_click',
        'on_hotspot_click',
        'on_gui_click',
        'handlerContainer', // Container per catturare gli handler
        `
        try {
          // Esegui lo script per definire le funzioni handler
          // ⚠️ IMPORTANTE: Se lo script contiene codice libero, viene eseguito UNA SOLA VOLTA qui
          // ⚠️ PROTEZIONE: Se lo script chiama direttamente gli handler (es: on_hotspot_click(...)),
          // quelli vengono ignorati durante la compilazione per prevenire doppia esecuzione
          ${scriptContent}
          
          // ⚠️ ESTRAZIONE HANDLER: Dopo l'esecuzione, estraiamo solo le funzioni handler
          // definite nello script e le salviamo nel container
          ${supportedHandlers.map(h => `
          if (typeof ${h} === 'function') {
            handlerContainer['${h}'] = ${h};
          }
          `).join('')}
        } catch (e) {
          GameAPI.error('Errore compilazione script: ' + (e && e.message ? e.message : String(e)));
        }
        `
      );
      
      // Esegui lo script per ottenere gli handler estratti
      // ⚠️ IMPORTANTE: Passa i wrapper no-op invece delle funzioni reali di GameAPI
      // Questo previene esecuzione accidentale durante la compilazione
      scriptFunction(
        GameAPI,
        GameAPI,
        GameAPI.print,
        GameAPI.getVariable,
        GameAPI.setVariable,
        GameAPI.getCurrentRoom,
        GameAPI.load_room,
        GameAPI.enableObject,
        GameAPI.disableObject,
        GameAPI.showText,
        GameAPI.show_message,
        GameAPI.log,
        noOpHandlers.on_game_start,      // ⚠️ NO-OP durante compilazione
        noOpHandlers.on_room_change,     // ⚠️ NO-OP durante compilazione
        noOpHandlers.on_object_click,    // ⚠️ NO-OP durante compilazione
        noOpHandlers.on_character_click, // ⚠️ NO-OP durante compilazione
        noOpHandlers.on_hotspot_click,   // ⚠️ NO-OP durante compilazione
        noOpHandlers.on_gui_click,       // ⚠️ NO-OP durante compilazione
        handlerContainer // Container per catturare gli handler
      );
      
      // Gli handler estratti sono ora in handlerContainer
      const extractedHandlers = handlerContainer;
      
      // ⚠️ NUOVO: Wrappare gli handler per iniettare le variabili come variabili accessibili direttamente
      // Ottieni la lista dei nomi delle variabili (per riferimento durante l'esecuzione)
      const varNames = Array.from(gameState.variables.keys());
      
      // Crea handler wrappati che espongono le variabili
      const wrappedHandlers = {};
      for (const [handlerName, handlerFunc] of Object.entries(extractedHandlers)) {
        if (typeof handlerFunc === 'function') {
          wrappedHandlers[handlerName] = function(...args) {
            // Crea un contesto di esecuzione isolato per questo handler
            const executionContext = {};
            
            // Esponi ogni variabile come proprietà del contesto usando getter/setter
            varNames.forEach(varName => {
              // Sanitizza il nome per essere valido in JavaScript
              const safeVarName = varName.replace(/[^a-zA-Z0-9_$]/g, '_');
              
              // Crea getter/setter che si collegano direttamente a gameState.variables
              Object.defineProperty(executionContext, safeVarName, {
                get: () => gameState.variables.get(varName),
                set: (value) => gameState.variables.set(varName, value),
                configurable: true,
                enumerable: true
              });
            });
            
            // Usa with statement per esporre le variabili nello scope
            // Nota: with è deprecato ma è l'unico modo affidabile per esporre variabili nello scope
            // senza modificare il codice dello script
            try {
              const handlerCode = handlerFunc.toString();
              
              // Crea una funzione wrapper che usa with per esporre le variabili
              const wrappedCode = `
                with (executionContext) {
                  return (${handlerCode}).apply(this, arguments);
                }
              `;
              
              const wrappedFunc = new Function('executionContext', 'handlerFunc', 'args', wrappedCode);
              return wrappedFunc.call(executionContext, executionContext, handlerFunc, args);
            } catch (e) {
              // Fallback: esegui normalmente senza iniezione variabili
              log(`[Runtime] compileScript: Errore iniezione variabili per ${handlerName}: ${e.message}. Usando fallback.`, 'warning');
              return handlerFunc.apply(executionContext, args);
            }
          };
        }
      }
      
      // Salva nella cache gli handler wrappati
      gameState.compiledScripts.set(scriptName, wrappedHandlers);
      
      const handlerCount = Object.keys(wrappedHandlers).length;
      log(`[Runtime] compileScript: Script '${scriptName}' compilato con successo (${handlerCount} handler estratti, variabili iniettate)`, 'success');
      
      if (handlerCount === 0) {
        log(`[Runtime] compileScript: ATTENZIONE - Script '${scriptName}' non contiene handler definiti`, 'warning');
      }
      
      return wrappedHandlers;
    } catch (error) {
      log(`[Runtime] compileScript: Errore compilazione script '${scriptName}': ${error.message}`, 'error');
      console.error(error);
      
      // Salva cache vuota per evitare tentativi ripetuti
      gameState.compiledScripts.set(scriptName, {});
      return {};
    }
  }
  
  /**
   * Ottiene un handler compilato dalla cache.
   * Se lo script non è ancora stato compilato, lo compila prima.
   * @param {string} scriptName - Nome dello script
   * @param {string} scriptContent - Contenuto dello script (usato solo se non in cache)
   * @param {string} handlerName - Nome dell'handler da recuperare (es: 'on_hotspot_click')
   * @returns {Function|null} Funzione handler o null se non trovata
   */
  function getCompiledHandler(scriptName, scriptContent, handlerName) {
    // Compila lo script se non è già in cache
    if (!gameState.compiledScripts.has(scriptName)) {
      compileScript(scriptName, scriptContent);
    }
    
    // Recupera gli handler dalla cache
    const handlers = gameState.compiledScripts.get(scriptName);
    if (!handlers || typeof handlers !== 'object') {
      return null;
    }
    
    // Restituisci l'handler richiesto
    const handler = handlers[handlerName];
    if (typeof handler === 'function') {
      // ⚠️ WRAPPER ANTI-DOPPIA-ESECUZIONE: Avvolge l'handler in un wrapper
      // che previene esecuzione multipla nello stesso tick
      // Usa un Map per tracciare gli handler in esecuzione per script
      if (!window._handlerExecutionTracker) {
        window._handlerExecutionTracker = new Map();
      }
      
      const executionKey = `${scriptName}_${handlerName}`;
      const wrappedHandler = function(...args) {
        const tracker = window._handlerExecutionTracker;
        const isExecuting = tracker.get(executionKey) || false;
        
        if (isExecuting) {
          log(`[Runtime] getCompiledHandler: Handler '${handlerName}' già in esecuzione (key: ${executionKey}), ignoro chiamata duplicata`, 'warning');
          console.trace('Stack trace chiamata duplicata:');
          return;
        }
        
        tracker.set(executionKey, true);
        log(`[Runtime] getCompiledHandler: Avvio esecuzione handler '${handlerName}' (key: ${executionKey})`, 'info');
        
        try {
          const result = handler.apply(this, args);
          return result;
        } finally {
          // Reset flag al prossimo tick per permettere chiamate successive
          setTimeout(() => {
            tracker.set(executionKey, false);
            log(`[Runtime] getCompiledHandler: Handler '${handlerName}' completato, flag reset (key: ${executionKey})`, 'info');
          }, 0);
        }
      };
      
      // Copia proprietà dell'handler originale (se presenti)
      Object.setPrototypeOf(wrappedHandler, Object.getPrototypeOf(handler));
      Object.defineProperty(wrappedHandler, 'name', { value: handler.name || handlerName });
      
      return wrappedHandler;
    }
    
    return null;
  }

  // ============================================
  // ESECUZIONE SCRIPT
  // ============================================
  async function executeScript(scriptName, context = {}) {
    if (!scriptName || !gameState.scripts[scriptName]) {
      return;
    }

    const code = gameState.scripts[scriptName];
    if (!code || typeof code !== 'string' || !code.trim()) {
      return;
    }

    try {
      // Prepara contesto di esecuzione
      const executionContext = {
        ...context,
        roomId: gameState.currentRoomId,
        variables: Object.fromEntries(gameState.variables)
      };

      // Crea funzione wrapper
      const scriptFunction = new Function(
        'Game',
        'GameAPI',
        'print',
        'getVariable',
        'setVariable',
        'getCurrentRoom',
        'load_room',
        'enableObject',
        'disableObject',
        'showText',
        'show_message',
        'log',
        'on_game_start',
        'on_room_change',
        'on_object_click',
        'on_character_click',
        'on_hotspot_click',
        'on_gui_click',
        `
        try {
          ${code}
        } catch (e) {
          GameAPI.error('Errore script: ' + (e && e.message ? e.message : String(e)));
          throw e;
        }
        `
      );

      // Esegui con GameAPI e funzioni helper eventi
      scriptFunction(
        GameAPI,
        GameAPI,
        GameAPI.print,
        GameAPI.getVariable,
        GameAPI.setVariable,
        GameAPI.getCurrentRoom,
        GameAPI.load_room,
        GameAPI.enableObject,
        GameAPI.disableObject,
        GameAPI.showText,
        GameAPI.show_message,
        GameAPI.log,
        GameAPI.on_game_start,
        GameAPI.on_room_change,
        GameAPI.on_object_click,
        GameAPI.on_character_click,
        GameAPI.on_hotspot_click,
        GameAPI.on_gui_click
      );
    } catch (error) {
      log(`Errore esecuzione script ${scriptName}: ${error.message}`, 'error');
      console.error(error);
    }
  }

  // ⚠️ SISTEMA DI ESECUZIONE HANDLER CON CACHE:
  // Questa funzione NON riesegue più lo script a ogni chiamata.
  // Usa la cache degli handler compilati per chiamare direttamente la funzione.
  // Questo garantisce: un click = una sola chiamata handler, nessuna riesecuzione di codice JS.
  
  /**
   * Esegue un handler specifico da uno script usando la cache compilata.
   * ⚠️ IMPORTANTE: Lo script viene compilato UNA SOLA VOLTA, gli handler vengono cache-ati.
   * A ogni chiamata, recupera l'handler dalla cache e lo esegue direttamente.
   * @param {string} scriptContent - Contenuto dello script (usato solo per compilazione iniziale)
   * @param {string} handlerName - Nome dell'handler da eseguire (es: 'on_hotspot_click')
   * @param {Array} argsArray - Argomenti da passare all'handler
   * @param {string} scriptName - Nome dello script (opzionale, usato come chiave cache)
   */
  async function executeScriptHandler(scriptContent, handlerName, argsArray = [], scriptName = null) {
    if (!scriptContent || !handlerName) {
      return;
    }
    
    // Se scriptName non è fornito, genera una chiave basata sul contenuto (hash semplice)
    // NOTA: Idealmente scriptName dovrebbe essere sempre fornito per garantire cache corretta
    if (!scriptName) {
      // Genera un nome basato su un hash semplice del contenuto
      // Questo non è ideale ma funziona per retrocompatibilità
      let hash = 0;
      for (let i = 0; i < scriptContent.length; i++) {
        const char = scriptContent.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      scriptName = `script_${Math.abs(hash)}`;
      log(`[Runtime] executeScriptHandler: ScriptName non fornito, uso hash: ${scriptName}`, 'warning');
    }

    try {
      log(`[Runtime] executeScriptHandler: Recupero handler '${handlerName}' da script '${scriptName}'`, 'info');
      
      // ⚠️ CORE: Recupera l'handler dalla cache (compila se necessario)
      // Questo NON riesegue lo script, usa solo la cache compilata
      const handlerFunction = getCompiledHandler(scriptName, scriptContent, handlerName);
      
      if (handlerFunction && typeof handlerFunction === 'function') {
        log(`[Runtime] executeScriptHandler: Esecuzione handler '${handlerName}' con ${argsArray.length} argomenti`, 'info');
        log(`[Runtime] executeScriptHandler: Handler function: ${handlerFunction.toString().substring(0, 100)}...`, 'info');
        
        // ⚠️ ESECUZIONE DIRETTA: Chiama direttamente l'handler dalla cache
        // NON riesegue lo script, NON ridefinisce handler, chiama solo la funzione
        // ⚠️ PROTEZIONE: Verifica che l'handler non sia già stato eseguito in questo contesto
        const handlerId = `${scriptName}_${handlerName}_${Date.now()}`;
        log(`[Runtime] executeScriptHandler: Esecuzione handler ID: ${handlerId}`, 'info');
        handlerFunction.apply(null, argsArray);
        
        log(`[Runtime] executeScriptHandler: Handler '${handlerName}' completato (ID: ${handlerId})`, 'info');
      } else {
        log(`[Runtime] executeScriptHandler: Handler '${handlerName}' non trovato nello script '${scriptName}'`, 'info');
      }
    } catch (error) {
      log(`[Runtime] executeScriptHandler: Errore esecuzione handler '${handlerName}': ${error.message}`, 'error');
      console.error(error);
    }
  }

  async function executeGameStartScripts() {
    // Set per tracciare gli script già eseguiti (evita doppia esecuzione)
    const executedScripts = new Set();
    
    // PRIORITÀ 1: Esegui script collegati esplicitamente tramite attachments
    const globalScripts = gameState.attachments.globalScripts || {};
    if (typeof globalScripts === 'object') {
      for (const [eventName, scriptName] of Object.entries(globalScripts)) {
        if (eventName === 'on_game_start' && scriptName && gameState.scripts[scriptName]) {
          executedScripts.add(scriptName);
          // ⚠️ Passa scriptName per garantire cache corretta
          await executeScriptHandler(gameState.scripts[scriptName], 'on_game_start', [], scriptName);
        }
      }
    }

    // PRIORITÀ 2: Cerca script con nome riservato "on_game_start" (solo se non già eseguito)
    if (gameState.scripts.on_game_start && !executedScripts.has('on_game_start')) {
      executedScripts.add('on_game_start');
      // ⚠️ Passa scriptName per garantire cache corretta
      await executeScriptHandler(gameState.scripts.on_game_start, 'on_game_start', [], 'on_game_start');
    }

    // PRIORITÀ 3: Scansione regex di tutti gli script (solo quelli non già eseguiti)
    // IMPORTANTE: Esegui questa scansione solo se necessario, evitando di scansionare
    // tutti gli script se abbiamo già trovato gli script tramite attachments
    for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
      // Salta script già eseguiti
      if (executedScripts.has(scriptName)) {
        continue;
      }
      
      if (scriptContent && typeof scriptContent === 'string') {
        // Controlla se lo script contiene la funzione on_game_start
        const hasHandler = /function\s+on_game_start\s*\(/.test(scriptContent);
        if (hasHandler) {
          executedScripts.add(scriptName);
          // ⚠️ Passa scriptName per garantire cache corretta
          await executeScriptHandler(scriptContent, 'on_game_start', [], scriptName);
        }
      }
    }

    // PRIORITÀ 4: Esegui handler registrati tramite on_game_start(function() {...})
    for (const handler of eventHandlers.game_start) {
      try {
        handler();
      } catch (error) {
        log(`Errore handler on_game_start: ${error.message}`, 'error');
      }
    }
  }

  async function executeRoomChangeScripts(oldRoomId, newRoomId) {
    // Set per tracciare gli script già eseguiti (evita doppia esecuzione)
    const executedScripts = new Set();
    
    // Set di script collegati a stanze specifiche (devono essere eseguiti SOLO quando si entra in quella stanza)
    const roomSpecificScripts = new Set();
    const roomScripts = gameState.attachments.roomScripts || {};
    if (typeof roomScripts === 'object') {
      for (const [roomId, scriptName] of Object.entries(roomScripts)) {
        if (scriptName) {
          roomSpecificScripts.add(scriptName);
        }
      }
    }
    
    // PRIORITÀ 1: Esegui script collegati esplicitamente alla room tramite attachments
    // ⚠️ IMPORTANTE: Esegue SOLO quando si entra nella stanza (newRoomId === roomId)
    if (typeof roomScripts === 'object') {
      for (const [roomId, scriptName] of Object.entries(roomScripts)) {
        if (roomId === newRoomId && scriptName && gameState.scripts[scriptName]) {
          executedScripts.add(scriptName);
          // ⚠️ Passa scriptName per garantire cache corretta
          await executeScriptHandler(gameState.scripts[scriptName], 'on_room_change', [oldRoomId, newRoomId], scriptName);
        }
      }
    }

    // PRIORITÀ 2: Cerca script con nome riservato "on_room_change" (solo se non già eseguito e non collegato a una stanza specifica)
    if (gameState.scripts.on_room_change && !executedScripts.has('on_room_change') && !roomSpecificScripts.has('on_room_change')) {
      executedScripts.add('on_room_change');
      // ⚠️ Passa scriptName per garantire cache corretta
      await executeScriptHandler(gameState.scripts.on_room_change, 'on_room_change', [oldRoomId, newRoomId], 'on_room_change');
    }

    // PRIORITÀ 3: Scansione regex di tutti gli script (solo quelli non già eseguiti e NON collegati a stanze specifiche)
    // ⚠️ IMPORTANTE: Salta gli script collegati a stanze specifiche - questi vengono eseguiti SOLO nella PRIORITÀ 1
    for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
      // Salta script già eseguiti
      if (executedScripts.has(scriptName)) {
        continue;
      }
      
      // ⚠️ Salta script collegati a stanze specifiche - devono essere eseguiti SOLO quando si entra in quella stanza
      if (roomSpecificScripts.has(scriptName)) {
        continue;
      }
      
      if (scriptContent && typeof scriptContent === 'string') {
        const hasHandler = /function\s+on_room_change\s*\(/.test(scriptContent);
        if (hasHandler) {
          executedScripts.add(scriptName);
          // ⚠️ Passa scriptName per garantire cache corretta
          await executeScriptHandler(scriptContent, 'on_room_change', [oldRoomId, newRoomId], scriptName);
        }
      }
    }

    // PRIORITÀ 4: Esegui handler registrati tramite on_room_change(function() {...})
    for (const handler of eventHandlers.room_change) {
      try {
        handler(oldRoomId, newRoomId);
      } catch (error) {
        log(`Errore handler on_room_change: ${error.message}`, 'error');
      }
    }
  }

  async function executeObjectClickScripts(objectId, x, y) {
    // ⚠️ MODIFICATO: Esegui SOLO lo script specifico dell'oggetto cliccato
    // Non eseguire script generici o script di altri oggetti
    
    // Esegui SOLO lo script collegato esplicitamente all'oggetto tramite attachments
    // Questo garantisce che ogni oggetto esegua solo il proprio script, non quello di altri oggetti
    const objectScripts = gameState.attachments.objectScripts || {};
    if (typeof objectScripts === 'object' && objectScripts[objectId]) {
      const scriptName = objectScripts[objectId];
      if (gameState.scripts[scriptName]) {
        // ⚠️ Passa scriptName per garantire cache corretta
        await executeScriptHandler(gameState.scripts[scriptName], 'on_object_click', [objectId, x, y], scriptName);
        return; // Esegui SOLO lo script specifico dell'oggetto, poi esci
      } else {
        log(`[executeObjectClickScripts] Script "${scriptName}" associato all'oggetto "${objectId}" non trovato`, 'warning');
      }
    } else {
      log(`[executeObjectClickScripts] Nessuno script associato all'oggetto "${objectId}"`, 'info');
    }
    
    // ⚠️ PRIORITÀ 2, 3 e 4 RIMOSSE: Non eseguire più script generici, scansioni o handler dinamici
    // Questo previene che script di altri oggetti vengano eseguiti quando si clicca su un oggetto specifico
    // Ogni oggetto deve avere il proprio script associato tramite attachments.objectScripts
  }

  // Verifica se un punto è dentro un poligono (ray casting algorithm)
  function isPointInPolygon(points, px, py) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ============================================
  // PATHFINDING E MOVIMENTO CHARACTER
  // ============================================

  // Calcola la direzione più simile basandosi su un vettore (dx, dy)
  // dx: differenza X (positivo = destra/east, negativo = sinistra/west)
  // dy: differenza Y (positivo = basso/south, negativo = alto/north)
  function getDirectionFromVector(dx, dy) {
    // Gestione casi speciali quando il vettore è troppo piccolo
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return 'south'; // Default se il vettore è troppo piccolo
    }
    
    // Gestione casi speciali per direzioni pure (evita calcoli angolari imprecisi)
    // North (verso l'alto): dy negativo, dx ≈ 0
    if (Math.abs(dx) < Math.abs(dy) * 0.5 && dy < 0) {
      return 'north';
    }
    // South (verso il basso): dy positivo, dx ≈ 0
    if (Math.abs(dx) < Math.abs(dy) * 0.5 && dy > 0) {
      return 'south';
    }
    // East (verso destra): dx positivo, dy ≈ 0
    if (Math.abs(dy) < Math.abs(dx) * 0.5 && dx > 0) {
      return 'east';
    }
    // West (verso sinistra): dx negativo, dy ≈ 0
    if (Math.abs(dy) < Math.abs(dx) * 0.5 && dx < 0) {
      return 'west';
    }
    
    // Calcola l'angolo usando atan2(dy, dx)
    const angle = Math.atan2(dy, dx);
    const degrees = (angle * 180) / Math.PI;
    
    // Normalizza a 0-360
    let normalized = (degrees + 360) % 360;
    
    // Mappatura corretta delle 8 direzioni
    if (normalized >= 337.5 || normalized < 22.5) {
      return 'east';
    } else if (normalized >= 22.5 && normalized < 67.5) {
      return 'southeast';
    } else if (normalized >= 67.5 && normalized < 112.5) {
      return 'south';
    } else if (normalized >= 112.5 && normalized < 157.5) {
      return 'southwest';
    } else if (normalized >= 157.5 && normalized < 202.5) {
      return 'west';
    } else if (normalized >= 202.5 && normalized < 247.5) {
      return 'northwest';
    } else if (normalized >= 247.5 && normalized < 292.5) {
      return 'north';
    } else {
      return 'northeast';
    }
  }

  // Calcola lo scaling del character basato sulla posizione Y e le impostazioni della room
  function calculateCharacterScale(characterY, room) {
    if (!room) {
      return 1.0; // Nessuno scaling se room non esiste
    }
    
    // Controlla se lo scaling è configurato (gestisce null, undefined e valori numerici validi)
    const backgroundY = room.scalingBackgroundY;
    const foregroundY = room.scalingForegroundY;
    
    // Se i valori non sono numeri validi, non applicare scaling
    if (typeof backgroundY !== 'number' || typeof foregroundY !== 'number' || 
        isNaN(backgroundY) || isNaN(foregroundY)) {
      return 1.0;
    }
    
    const minScale = (typeof room.scalingMinScale === 'number' && !isNaN(room.scalingMinScale)) 
      ? room.scalingMinScale 
      : 0.5;
    const maxScale = (typeof room.scalingMaxScale === 'number' && !isNaN(room.scalingMaxScale)) 
      ? room.scalingMaxScale 
      : 1.5;
    
    // Assicura che backgroundY < foregroundY
    if (backgroundY >= foregroundY) {
      return 1.0;
    }
    
    // Calcola lo scaling in base alla posizione Y
    // Y più alto (background) = scale minore
    // Y più basso (foreground) = scale maggiore
    if (characterY <= backgroundY) {
      return minScale;
    } else if (characterY >= foregroundY) {
      return maxScale;
    } else {
      // Interpolazione lineare tra backgroundY e foregroundY
      const t = (characterY - backgroundY) / (foregroundY - backgroundY);
      return minScale + (maxScale - minScale) * t;
    }
  }

  // Trova il punto più vicino sul bordo del poligono walkable
  function findClosestPointOnWalkableEdge(targetX, targetY, walkableArea) {
    let closestPoint = null;
    let minDistance = Infinity;
    
    // Cerca il punto più vicino lungo i bordi del poligono
    for (let i = 0; i < walkableArea.length; i++) {
      const p1 = walkableArea[i];
      const p2 = walkableArea[(i + 1) % walkableArea.length];
      
      // Trova il punto più vicino sul segmento p1-p2
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length > 0) {
        const t = Math.max(0, Math.min(1, ((targetX - p1.x) * dx + (targetY - p1.y) * dy) / (length * length)));
        const closestX = p1.x + t * dx;
        const closestY = p1.y + t * dy;
        const distance = Math.sqrt((targetX - closestX) ** 2 + (targetY - closestY) ** 2);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = { x: closestX, y: closestY };
        }
      }
    }
    
    return closestPoint;
  }

  // Verifica se un percorso (segmento) rimane dentro la walkable area
  function isPathInsideWalkableArea(startX, startY, endX, endY, walkableArea, steps = 10) {
    // Verifica punti intermedi lungo il segmento
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;
      
      if (!isPointInPolygon(walkableArea, x, y)) {
        return false;
      }
    }
    return true;
  }

  // Verifica se una posizione ha spazio per muoversi (evita dead ends)
  function hasMovementSpace(x, y, walkableArea, checkRadius = 30) {
    if (!walkableArea || walkableArea.length < 3) return true;
    
    // Controlla se ci sono almeno alcune direzioni in cui il personaggio può muoversi
    const directions = [
      { dx: 0, dy: -checkRadius }, // north
      { dx: checkRadius, dy: 0 }, // east
      { dx: 0, dy: checkRadius }, // south
      { dx: -checkRadius, dy: 0 }, // west
      { dx: checkRadius * 0.707, dy: -checkRadius * 0.707 }, // northeast
      { dx: checkRadius * 0.707, dy: checkRadius * 0.707 }, // southeast
      { dx: -checkRadius * 0.707, dy: checkRadius * 0.707 }, // southwest
      { dx: -checkRadius * 0.707, dy: -checkRadius * 0.707 } // northwest
    ];
    
    let validDirections = 0;
    for (const dir of directions) {
      const testX = x + dir.dx;
      const testY = y + dir.dy;
      if (isPointInPolygon(walkableArea, testX, testY)) {
        validDirections++;
      }
    }
    
    // Considera che c'è spazio se ci sono almeno 2 direzioni valide (più della direzione di arrivo)
    return validDirections >= 2;
  }

  // Trova una posizione sicura vicino a un punto target (evita dead ends)
  function findSafePositionNearTarget(targetX, targetY, startX, startY, walkableArea, maxDistance = 50) {
    if (!walkableArea || walkableArea.length < 3) {
      return { x: targetX, y: targetY };
    }
    
    // Se il target è già sicuro, usalo
    if (isPointInPolygon(walkableArea, targetX, targetY) && hasMovementSpace(targetX, targetY, walkableArea)) {
      return { x: targetX, y: targetY };
    }
    
    // Cerca punti vicini che siano sicuri
    const searchSteps = 8; // Cerca in 8 direzioni
    const stepDistance = maxDistance / searchSteps;
    
    for (let distance = stepDistance; distance <= maxDistance; distance += stepDistance) {
      for (let angle = 0; angle < Math.PI * 2; angle += (Math.PI * 2) / 8) {
        const testX = targetX + Math.cos(angle) * distance;
        const testY = targetY + Math.sin(angle) * distance;
        
        if (isPointInPolygon(walkableArea, testX, testY) && hasMovementSpace(testX, testY, walkableArea)) {
          // Verifica che sia raggiungibile dal punto di partenza
          if (isPathInsideWalkableArea(startX, startY, testX, testY, walkableArea, 10)) {
            return { x: testX, y: testY };
          }
        }
      }
    }
    
    // Se non troviamo una posizione sicura, restituisci almeno una valida sulla walkable area
    if (isPointInPolygon(walkableArea, targetX, targetY)) {
      return { x: targetX, y: targetY };
    }
    
    // Ultimo resort: punto più vicino sul bordo
    const closestPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
    if (closestPoint) {
      return closestPoint;
    }
    
    return { x: targetX, y: targetY };
  }

  // Pathfinding che garantisce che il pivot rimanga sempre nella walkable area e non si incastri
  function findPathOnWalkableArea(startX, startY, targetX, targetY, walkableArea) {
    if (!walkableArea || walkableArea.length < 3) {
      return null;
    }
    
    // Verifica che il punto di partenza sia sulla walkable area
    if (!isPointInPolygon(walkableArea, startX, startY)) {
      return null;
    }
    
    // Verifica che il punto target sia sulla walkable area, altrimenti trova il più vicino
    let finalTargetX = targetX;
    let finalTargetY = targetY;
    
    if (!isPointInPolygon(walkableArea, targetX, targetY)) {
      const closestPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
      if (closestPoint) {
        finalTargetX = closestPoint.x;
        finalTargetY = closestPoint.y;
      } else {
        return null;
      }
    }
    
    // Trova una posizione sicura vicino al target (evita dead ends)
    const safeTarget = findSafePositionNearTarget(finalTargetX, finalTargetY, startX, startY, walkableArea, 50);
    finalTargetX = safeTarget.x;
    finalTargetY = safeTarget.y;
    
    // Verifica se il percorso diretto rimane dentro la walkable area
    if (isPathInsideWalkableArea(startX, startY, finalTargetX, finalTargetY, walkableArea, 20)) {
      // Percorso diretto valido - verifica che il target sia una posizione sicura
      if (hasMovementSpace(finalTargetX, finalTargetY, walkableArea)) {
        return [{ x: finalTargetX, y: finalTargetY }];
      } else {
        // Il target è un dead end, trova una posizione sicura vicina
        const safePoint = findSafePositionNearTarget(finalTargetX, finalTargetY, startX, startY, walkableArea, 50);
        if (isPathInsideWalkableArea(startX, startY, safePoint.x, safePoint.y, walkableArea, 20)) {
          return [{ x: safePoint.x, y: safePoint.y }];
        }
      }
    }
    
    // Il percorso diretto esce dalla walkable area, trova un percorso alternativo
    // Strategia: dividi il percorso in segmenti più piccoli che rimangono dentro
    const maxSegmentLength = 50; // Lunghezza massima di ogni segmento
    const path = [];
    let currentX = startX;
    let currentY = startY;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const dx = finalTargetX - currentX;
      const dy = finalTargetY - currentY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Se siamo abbastanza vicini al target, aggiungilo e termina
      if (distance < maxSegmentLength) {
        // Verifica che il percorso finale sia valido
        if (isPathInsideWalkableArea(currentX, currentY, finalTargetX, finalTargetY, walkableArea, 10)) {
          // Verifica che il target finale sia sicuro (non dead end)
          if (hasMovementSpace(finalTargetX, finalTargetY, walkableArea)) {
            path.push({ x: finalTargetX, y: finalTargetY });
            return path;
          } else {
            // Il target è un dead end, trova una posizione sicura vicina
            const safePoint = findSafePositionNearTarget(finalTargetX, finalTargetY, currentX, currentY, walkableArea, 30);
            if (isPathInsideWalkableArea(currentX, currentY, safePoint.x, safePoint.y, walkableArea, 10)) {
              path.push({ x: safePoint.x, y: safePoint.y });
              return path;
            }
          }
        } else {
          // Il segmento finale non è valido, trova un punto intermedio più vicino e sicuro
          const midX = currentX + (dx / 2);
          const midY = currentY + (dy / 2);
          if (isPointInPolygon(walkableArea, midX, midY) && hasMovementSpace(midX, midY, walkableArea)) {
            path.push({ x: midX, y: midY });
            currentX = midX;
            currentY = midY;
            attempts++;
            continue;
          }
        }
        break;
      }
      
      // Calcola il prossimo punto intermedio
      const segmentLength = Math.min(maxSegmentLength, distance);
      let nextX = currentX + (dx / distance) * segmentLength;
      let nextY = currentY + (dy / distance) * segmentLength;
      
      // Verifica che il percorso verso il prossimo punto rimanga dentro la walkable area
      if (isPathInsideWalkableArea(currentX, currentY, nextX, nextY, walkableArea, 10)) {
        // Verifica che il prossimo punto non sia un dead end (a meno che non sia l'ultimo)
        const isLastSegment = distance < maxSegmentLength * 1.5;
        if (isLastSegment || hasMovementSpace(nextX, nextY, walkableArea)) {
          path.push({ x: nextX, y: nextY });
          currentX = nextX;
          currentY = nextY;
        } else {
          // Il punto è un dead end, prova un punto più vicino
          const shorterLength = segmentLength * 0.5;
          const shorterX = currentX + (dx / distance) * shorterLength;
          const shorterY = currentY + (dy / distance) * shorterLength;
          
          if (isPathInsideWalkableArea(currentX, currentY, shorterX, shorterY, walkableArea, 10) &&
              hasMovementSpace(shorterX, shorterY, walkableArea)) {
            path.push({ x: shorterX, y: shorterY });
            currentX = shorterX;
            currentY = shorterY;
          } else {
            break; // Non possiamo continuare
          }
        }
      } else {
        // Il percorso diretto non è valido, prova un punto più vicino
        const shorterLength = segmentLength * 0.5;
        const shorterX = currentX + (dx / distance) * shorterLength;
        const shorterY = currentY + (dy / distance) * shorterLength;
        
        if (isPathInsideWalkableArea(currentX, currentY, shorterX, shorterY, walkableArea, 10) &&
            hasMovementSpace(shorterX, shorterY, walkableArea)) {
          path.push({ x: shorterX, y: shorterY });
          currentX = shorterX;
          currentY = shorterY;
        } else {
          // Anche il percorso più corto non è valido, cerca un punto alternativo
          // Prova punti in direzioni diverse per trovare un percorso valido
          let found = false;
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const testX = currentX + Math.cos(angle) * (segmentLength * 0.5);
            const testY = currentY + Math.sin(angle) * (segmentLength * 0.5);
            
            if (isPointInPolygon(walkableArea, testX, testY) && 
                isPathInsideWalkableArea(currentX, currentY, testX, testY, walkableArea, 10) &&
                hasMovementSpace(testX, testY, walkableArea)) {
              // Verifica che questo punto ci avvicini al target
              const newDx = finalTargetX - testX;
              const newDy = finalTargetY - testY;
              const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
              if (newDistance < distance) {
                path.push({ x: testX, y: testY });
                currentX = testX;
                currentY = testY;
                found = true;
                break;
              }
            }
          }
          
          if (!found) {
            // Non è possibile continuare, termina il percorso
            break;
          }
        }
      }
      
      attempts++;
    }
    
    // Se abbiamo trovato almeno un punto, prova ad aggiungere il target finale se raggiungibile
    if (path.length > 0) {
      const lastPoint = path[path.length - 1];
      if (isPathInsideWalkableArea(lastPoint.x, lastPoint.y, finalTargetX, finalTargetY, walkableArea, 10)) {
        // Verifica che il target finale sia una posizione sicura (non dead end)
        if (hasMovementSpace(finalTargetX, finalTargetY, walkableArea)) {
          path.push({ x: finalTargetX, y: finalTargetY });
        } else {
          // Il target finale è un dead end, trova una posizione sicura vicina
          const safePoint = findSafePositionNearTarget(finalTargetX, finalTargetY, lastPoint.x, lastPoint.y, walkableArea, 30);
          if (isPathInsideWalkableArea(lastPoint.x, lastPoint.y, safePoint.x, safePoint.y, walkableArea, 10)) {
            path.push({ x: safePoint.x, y: safePoint.y });
          }
        }
      } else {
        // Non possiamo raggiungere il target direttamente, ma assicuriamoci che l'ultimo punto sia valido e sicuro
        if (!isPointInPolygon(walkableArea, lastPoint.x, lastPoint.y)) {
          // Questo non dovrebbe mai succedere, ma per sicurezza troviamo il punto più vicino
          const closestPoint = findClosestPointOnWalkableEdge(lastPoint.x, lastPoint.y, walkableArea);
          if (closestPoint && hasMovementSpace(closestPoint.x, closestPoint.y, walkableArea)) {
            path[path.length - 1] = closestPoint;
          }
        } else if (!hasMovementSpace(lastPoint.x, lastPoint.y, walkableArea)) {
          // L'ultimo punto è un dead end, trova una posizione sicura
          const safePoint = findSafePositionNearTarget(lastPoint.x, lastPoint.y, startX, startY, walkableArea, 30);
          if (isPointInPolygon(walkableArea, safePoint.x, safePoint.y)) {
            path[path.length - 1] = safePoint;
          }
        }
      }
      return path;
    }
    
    // Se non abbiamo trovato nessun percorso intermedio, prova almeno a trovare un punto raggiungibile e sicuro
    // Trova un punto sulla walkable area nella direzione del target finale ma più vicino
    const dx = finalTargetX - startX;
    const dy = finalTargetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Prova punti sempre più vicini al punto di partenza finché non troviamo uno valido e sicuro
      for (let factor = 0.9; factor > 0.1; factor -= 0.1) {
        const testX = startX + dx * factor;
        const testY = startY + dy * factor;
        
        if (isPointInPolygon(walkableArea, testX, testY) && 
            isPathInsideWalkableArea(startX, startY, testX, testY, walkableArea, 10) &&
            hasMovementSpace(testX, testY, walkableArea)) {
          return [{ x: testX, y: testY }];
        }
      }
    }
    
    // Ultimo resort: verifica che il punto di partenza sia sicuro, altrimenti trova uno vicino
    if (hasMovementSpace(startX, startY, walkableArea)) {
      return [{ x: startX, y: startY }];
    } else {
      // Il punto di partenza è un dead end, trova una posizione sicura vicina
      const safePoint = findSafePositionNearTarget(startX, startY, startX, startY, walkableArea, 50);
      if (isPointInPolygon(walkableArea, safePoint.x, safePoint.y)) {
        return [{ x: safePoint.x, y: safePoint.y }];
      }
    }
    
    // Se tutto fallisce, restituisci almeno il punto di partenza (meglio che scomparire)
    return [{ x: startX, y: startY }];
  }

  /**
   * ⚠️ NUOVA FUNZIONE: Esegue SOLO lo script dell'hotspot cliccato
   * Questa funzione riceve l'hotspot completo e esegue SOLO il suo script onClick
   * NON esegue script globali o altri script
   * 
   * DEBUG OBBLIGATORIO:
   * - Log quando viene bindato il click
   * - Log quando un hotspot viene rilevato
   * - Log ID hotspot cliccato
   * - Log script eseguito
   * - Errore se più di uno script viene eseguito
   */
  async function executeHotspotScript(hotspotId, hotspot, x, y) {
    log(`[Runtime] [DEBUG] executeHotspotScript: INIZIO esecuzione script hotspot ${hotspotId}`, 'info');
    log(`[Runtime] [DEBUG] executeHotspotScript: Hotspot name: ${hotspot.name || 'unnamed'}`, 'info');
    log(`[Runtime] [DEBUG] executeHotspotScript: Coordinate click: (${Math.round(x)}, ${Math.round(y)})`, 'info');
    
    // Verifica che l'hotspot abbia la struttura scripts.onClick
    if (!hotspot || !hotspot.scripts || !hotspot.scripts.onClick) {
      log(`[Runtime] [DEBUG] executeHotspotScript: ⚠️ Hotspot ${hotspotId} non ha struttura scripts.onClick`, 'warning');
      log(`[Runtime] [DEBUG] executeHotspotScript: Hotspot structure: ${JSON.stringify({ id: hotspot?.id, hasScripts: !!hotspot?.scripts, hasOnClick: !!hotspot?.scripts?.onClick })}`, 'info');
      return;
    }
    
    const onClickScript = hotspot.scripts.onClick;
    
    // ⚠️ LOG DI SICUREZZA: Logga stato enabled, hotspot id e script info prima dell'esecuzione
    const enabledStatus = typeof onClickScript.enabled === 'boolean' ? onClickScript.enabled : 'undefined';
    const hasCode = onClickScript.code && typeof onClickScript.code === 'string' && onClickScript.code.trim() !== '';
    log(`[Runtime] [DEBUG] executeHotspotScript: [SICUREZZA] Hotspot ID: ${hotspotId}, Enabled: ${enabledStatus}, Has Code: ${hasCode}, Code Length: ${onClickScript.code ? onClickScript.code.length : 0}`, 'info');
    
    // AUTOMATIZZAZIONE: Se c'è codice, lo script deve essere eseguito (ignorando enabled=false)
    // L'obiettivo è eliminare il blocco "enabled = false" per hotspot con codice
    if (!hasCode) {
      log(`[Runtime] [DEBUG] executeHotspotScript: Script onClick dell'hotspot ${hotspotId} è vuoto o non valido`, 'info');
      return;
    }
    
    // Se c'è codice, esegui sempre (ignorando enabled=false)
    // Questo permette agli hotspot di funzionare automaticamente quando hanno codice
    if (onClickScript.enabled === false) {
      log(`[Runtime] [DEBUG] executeHotspotScript: [AUTO-ENABLE] Hotspot ${hotspotId} ha codice ma enabled=false, esecuzione forzata per presenza codice`, 'warning');
    }
    
    log(`[Runtime] [DEBUG] executeHotspotScript: ✓ Script valido e abilitato per hotspot ${hotspotId}`, 'success');
    log(`[Runtime] [DEBUG] executeHotspotScript: Script code length: ${onClickScript.code.length} caratteri`, 'info');
    
    // ⚠️ CONTROLLO ANTI-DOPPIA ESECUZIONE: Traccia esecuzioni in corso
    if (!window._hotspotScriptExecutions) {
      window._hotspotScriptExecutions = new Set();
    }
    
    const executionKey = `${hotspotId}_${Date.now()}`;
    if (window._hotspotScriptExecutions.has(hotspotId)) {
      log(`[Runtime] [DEBUG] executeHotspotScript: ⚠️ ERRORE: Script per hotspot ${hotspotId} già in esecuzione!`, 'error');
      log(`[Runtime] [DEBUG] executeHotspotScript: Questo NON dovrebbe mai accadere con la nuova struttura`, 'error');
      return;
    }
    
    window._hotspotScriptExecutions.add(hotspotId);
    
    try {
      // Log di conferma esecuzione come richiesto
      const hotspotName = hotspot.name || hotspotId;
      log(`[Runtime] Esecuzione script per hotspot: ${hotspotName}`, 'info');
      log(`[Runtime] [DEBUG] executeHotspotScript: ✓ Esecuzione script onClick per hotspot ${hotspotId} (${hotspot.name})`, 'success');
      
      // Esegui SOLO lo script dell'hotspot cliccato
      // Usa uno scriptName univoco basato sull'hotspotId per la cache
      const scriptName = `hotspot_${hotspotId}_onClick`;
      log(`[Runtime] [DEBUG] executeHotspotScript: Script name: ${scriptName}`, 'info');
      
      await executeScriptHandler(onClickScript.code, 'on_hotspot_click', [hotspotId, x, y], scriptName);
      
      log(`[Runtime] [DEBUG] executeHotspotScript: ✓ Script completato con successo per hotspot ${hotspotId}`, 'success');
    } catch (error) {
      log(`[Runtime] [DEBUG] executeHotspotScript: ✗ Errore esecuzione script per hotspot ${hotspotId}: ${error.message}`, 'error');
      console.error('[Runtime] executeHotspotScript error:', error);
    } finally {
      // Rimuovi dal set dopo un breve delay per permettere eventuali callback asincroni
      setTimeout(() => {
        window._hotspotScriptExecutions.delete(hotspotId);
      }, 100);
    }
  }

  // ============================================
  // GAME API - API ESPOSTA AGLI SCRIPT
  // ============================================
  // Sistema di eventi registrati
  const eventHandlers = {
    game_start: [],
    room_change: [],
    object_click: [],
    character_click: [],
    hotspot_click: [],
    gui_click: []
  };

  // ⚠️ PROTEZIONE ANTI-DOPPIA-ESECUZIONE PER PRINT:
  // Traccia le chiamate a print per prevenire esecuzioni multiple nello stesso tick
  if (!window._printExecutionTracker) {
    window._printExecutionTracker = new Map();
  }
  
  const GameAPI = {
    // Logging
    print: function() {
      const args = Array.from(arguments);
      const message = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return '[object Object]';
          }
        }
        return String(arg);
      }).join(' ');
      
      // ⚠️ PROTEZIONE: Previene chiamate duplicate a print nello stesso tick
      // Usa un Set per tracciare i messaggi già stampati in questo tick
      const tracker = window._printExecutionTracker;
      const callId = `${message}_${performance.now()}`;
      const callKey = `print_${message}`;
      
      // Verifica se questo messaggio è già stato stampato negli ultimi 50ms
      const lastCallTime = tracker.get(callKey);
      const now = performance.now();
      
      if (lastCallTime && (now - lastCallTime) < 50) {
        // Chiamata duplicata nello stesso tick (entro 50ms), ignora
        log(`[Runtime] GameAPI.print: Chiamata duplicata BLOCCATA: "${message}" (ultima chiamata: ${(now - lastCallTime).toFixed(2)}ms fa)`, 'warning');
        console.trace('Stack trace chiamata print duplicata:');
        return;
      }
      
      // Registra questa chiamata
      tracker.set(callKey, now);
      log(`[Runtime] GameAPI.print: Chiamata registrata: "${message}" (ID: ${callId})`, 'info');
      
      // ⚠️ DEBUG: Log stack trace per capire da dove viene chiamato print
      if (window.DEBUG_PRINT_CALLS) {
        console.trace('Stack trace chiamata print:');
      }
      
      // Esegui il log
      log(message, 'info');
      
      // Pulisci tracker dopo 100ms per evitare accumulo
      setTimeout(() => {
        const currentTime = tracker.get(callKey);
        if (currentTime === now) {
          tracker.delete(callKey);
        }
      }, 100);
    },

    log: function() {
      GameAPI.print.apply(GameAPI, arguments);
    },

    error: function() {
      const args = Array.from(arguments);
      const message = args.map(arg => String(arg)).join(' ');
      log(message, 'error');
    },

    // Variabili
    getVariable: function(name) {
      if (typeof name !== 'string') {
        GameAPI.error('getVariable: name must be a string');
        return null;
      }
      return gameState.variables.get(name) || null;
    },

    setVariable: function(name, value) {
      if (typeof name !== 'string') {
        GameAPI.error('setVariable: name must be a string');
        return;
      }
      gameState.variables.set(name, value);
    },

    // Room
    getCurrentRoom: function() {
      return gameState.currentRoomId;
    },

    load_room: function(roomIdOrName) {
      if (typeof roomIdOrName !== 'string' && typeof roomIdOrName !== 'number') {
        GameAPI.error('load_room: roomIdOrName must be a string or number');
        return false;
      }
      changeRoom(String(roomIdOrName));
      return true;
    },

    // Oggetti
    enableObject: function(objectId) {
      if (!gameState.currentRoom || !gameState.currentRoom.objects) return;
      const obj = gameState.currentRoom.objects.find(o => o.id === objectId || o.name === objectId);
      if (obj) {
        obj.enabled = true;
        obj.visible = true;
      }
    },

    disableObject: function(objectId) {
      if (!gameState.currentRoom || !gameState.currentRoom.objects) return;
      const obj = gameState.currentRoom.objects.find(o => o.id === objectId || o.name === objectId);
      if (obj) {
        obj.enabled = false;
        obj.visible = false;
      }
    },

    move_object: function(objectId, x, y) {
      // Sposta un oggetto nella room corrente (con coda sequenziale)
      queueCommand(async () => {
        if (!gameState.currentRoom || !gameState.currentRoom.objects) {
          GameAPI.error('move_object: Nessuna room corrente o oggetti non disponibili');
          return;
        }
        
        const obj = gameState.currentRoom.objects.find(o => o.id === String(objectId) || o.name === String(objectId));
        if (!obj) {
          GameAPI.error(`move_object: Oggetto ${objectId} non trovato`);
          return;
        }
        
        obj.x = Number(x) || 0;
        obj.y = Number(y) || 0;
        
        // Il rendering avviene automaticamente nel game loop
        log(`[Runtime] Oggetto ${objectId} spostato a (${obj.x}, ${obj.y})`, 'info');
      });
    },

    // Character API
    spawn_character: function(characterName, x, y, direction = 'south', characterId = null) {
      if (!characterName) {
        GameAPI.error('spawn_character: characterName è richiesto');
        return null;
      }

      const charDef = gameState.characterDefinitions.get(characterName);
      if (!charDef) {
        GameAPI.error(`spawn_character: Character "${characterName}" non trovato nelle definizioni`);
        return null;
      }

      const id = characterId || `char_${characterName}_${Date.now()}`;
      const dir = direction || 'south';
      
      // Verifica che la direzione esista
      if (!charDef.directions[dir]) {
        log(`[Runtime] spawn_character: Direzione "${dir}" non disponibile per "${characterName}", uso "south"`, 'warning');
        direction = 'south';
      }

      // Leggi moveSpeed dalle spawnSettings se disponibile, altrimenti usa default
      let moveSpeed = 100; // pixel per secondo (default)
      if (charDef.spawnSettings && charDef.spawnSettings.moveSpeed !== undefined) {
        const speedValue = Number(charDef.spawnSettings.moveSpeed);
        if (!isNaN(speedValue) && speedValue > 0) {
          moveSpeed = speedValue;
          log(`[Runtime] Character "${characterName}" usa moveSpeed dalle spawnSettings: ${moveSpeed} pixel/sec`, 'info');
        } else {
          log(`[Runtime] Character "${characterName}": moveSpeed non valido (${charDef.spawnSettings.moveSpeed}), uso default: 100`, 'warning');
        }
      } else {
        log(`[Runtime] Character "${characterName}": moveSpeed non trovato nelle spawnSettings, uso default: 100`, 'info');
      }

      const character = {
        id: id,
        name: characterName,
        x: Number(x) || 0,
        y: Number(y) || 0,
        direction: direction,
        currentFrame: 0,
        frameTime: 0,
        visible: true,
        roomId: gameState.currentRoomId,
        isMoving: false,
        path: null,
        moveSpeed: moveSpeed // pixel per secondo
      };

      gameState.characters.set(id, character);
      log(`[Runtime] Character "${characterName}" spawnato a (${x}, ${y}) con direzione "${direction}"`, 'info');
      return id;
    },

    move_character: function(characterId, x, y) {
      const character = gameState.characters.get(characterId);
      if (!character) {
        GameAPI.error(`move_character: Character ${characterId} non trovato`);
        return;
      }

      character.x = Number(x) || 0;
      character.y = Number(y) || 0;
      log(`[Runtime] Character ${characterId} spostato a (${character.x}, ${character.y})`, 'info');
    },

    set_character_direction: function(characterId, direction) {
      const character = gameState.characters.get(characterId);
      if (!character) {
        GameAPI.error(`set_character_direction: Character ${characterId} non trovato`);
        return;
      }

      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || !charDef.directions[direction]) {
        GameAPI.error(`set_character_direction: Direzione "${direction}" non disponibile per character "${character.name}"`);
        return;
      }

      character.direction = direction;
      character.currentFrame = 0; // Reset frame quando cambia direzione
      character.frameTime = 0;
      log(`[Runtime] Character ${characterId} direzione cambiata a "${direction}"`, 'info');
    },

    animate_character: function(characterId, enabled = true) {
      const character = gameState.characters.get(characterId);
      if (!character) {
        GameAPI.error(`animate_character: Character ${characterId} non trovato`);
        return;
      }

      // L'animazione è sempre abilitata se il character ha frame
      // Questa funzione può essere usata per controlli futuri
      log(`[Runtime] Character ${characterId} animazione ${enabled ? 'abilitata' : 'disabilitata'}`, 'info');
    },

    // UI
    showText: function(text) {
      // Mostra testo come messaggio visibile (con coda sequenziale)
      const messageText = String(text);
      queueCommand(async () => {
        showGameMessage(messageText);
        // Attendi che il messaggio sia mostrato (durata default 3000ms)
        await new Promise(resolve => setTimeout(resolve, 3000));
      });
    },

    show_message: function(text) {
      // Alias di showText per compatibilità con l'editor (con coda sequenziale)
      GameAPI.showText(text);
    },

    // Event System - Funzioni helper per registrare handler
    on_game_start: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.game_start.push(handler);
        log('Handler on_game_start registrato', 'info');
      }
    },

    on_room_change: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.room_change.push(handler);
        log('Handler on_room_change registrato', 'info');
      }
    },

    on_object_click: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.object_click.push(handler);
        log('Handler on_object_click registrato', 'info');
      }
    },

    on_character_click: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.character_click.push(handler);
        log('Handler on_character_click registrato', 'info');
      }
    },

    on_hotspot_click: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.hotspot_click.push(handler);
        log('Handler on_hotspot_click registrato', 'info');
      }
    },

    on_gui_click: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.gui_click.push(handler);
        log('Handler on_gui_click registrato', 'info');
      }
    }
  };

  // Esponi GameAPI globalmente
  window.GameAPI = GameAPI;
  window.Game = GameAPI; // Alias per compatibilità

  // Override print() globale
  window.print = function() {
    GameAPI.print.apply(GameAPI, arguments);
  };

  // Esponi load_room globalmente per compatibilità con l'editor
  window.load_room = function(roomIdOrName) {
    return GameAPI.load_room(roomIdOrName);
  };

  // Esponi show_message globalmente per compatibilità con l'editor
  window.show_message = function(text) {
    return GameAPI.show_message(text);
  };

  // Esponi move_object globalmente per compatibilità con l'editor
  window.move_object = function(objectId, x, y) {
    return GameAPI.move_object(objectId, x, y);
  };

  // Esponi API character globalmente
  window.spawn_character = function(characterName, x, y, direction, characterId) {
    return GameAPI.spawn_character(characterName, x, y, direction, characterId);
  };
  window.move_character = function(characterId, x, y) {
    return GameAPI.move_character(characterId, x, y);
  };
  window.set_character_direction = function(characterId, direction) {
    return GameAPI.set_character_direction(characterId, direction);
  };
  window.animate_character = function(characterId, enabled) {
    return GameAPI.animate_character(characterId, enabled);
  };

  // Esponi funzioni helper eventi globalmente
  window.on_game_start = function(handler) {
    GameAPI.on_game_start(handler);
  };
  window.on_room_change = function(handler) {
    GameAPI.on_room_change(handler);
  };
  window.on_object_click = function(handler) {
    GameAPI.on_object_click(handler);
  };
  window.on_character_click = function(handler) {
    GameAPI.on_character_click(handler);
  };
  window.on_hotspot_click = function(handler) {
    GameAPI.on_hotspot_click(handler);
  };
  window.on_gui_click = function(handler) {
    GameAPI.on_gui_click(handler);
  };

  // ============================================
  // RENDERING
  // ============================================
  /**
   * Renderizza il frame corrente usando solo immagini già caricate e pronte
   * NON tenta di disegnare immagini non caricate
   */
  function render() {
    if (!ctx || !canvas) {
      return;
    }

    // Verifica che il preload sia completato prima di renderizzare
    if (!AssetRegistry.loadComplete && AssetRegistry.isLoading) {
      // Preload ancora in corso, non renderizzare ancora
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Renderizza room corrente
    if (gameState.currentRoom) {
      const room = gameState.currentRoom;

      // Background - verifica che l'immagine sia caricata e pronta
      if (room.backgroundImg && room.backgroundImg.complete && room.backgroundImg.naturalWidth > 0) {
        try {
          ctx.drawImage(room.backgroundImg, 0, 0, canvas.width, canvas.height);
        } catch (error) {
          log(`[Runtime] Errore rendering background: ${error.message}`, 'warning');
        }
      }

      // Oggetti di scena - verifica che le immagini siano caricate e pronte
      if (room.objects && Array.isArray(room.objects)) {
        room.objects.forEach(obj => {
          if (obj.visible && obj.img && obj.img.complete && obj.img.naturalWidth > 0) {
            try {
              ctx.drawImage(obj.img, obj.x, obj.y);
            } catch (error) {
              log(`[Runtime] Errore rendering oggetto ${obj.id}: ${error.message}`, 'warning');
            }
          }
        });
      }

      // Foregrounds - verifica che le immagini siano caricate e pronte
      if (room.foregrounds && Array.isArray(room.foregrounds)) {
        room.foregrounds.forEach(fg => {
          if (fg.img && fg.img.complete && fg.img.naturalWidth > 0) {
            try {
              ctx.drawImage(fg.img, fg.offsetX, fg.offsetY);
            } catch (error) {
              log(`[Runtime] Errore rendering foreground: ${error.message}`, 'warning');
            }
          }
        });
      }

      // Character - renderizza solo i character nella room corrente
      gameState.characters.forEach(character => {
        if (!character.visible || character.roomId !== gameState.currentRoomId) {
          return;
        }

        // Get character definition to check for pivot
        const charDef = gameState.characterDefinitions.get(character.name);
        
        // Calcola lo scaling basato sulla posizione Y e le impostazioni della room
        const scale = calculateCharacterScale(character.y, room);
        
        const frame = getCharacterFrame(character.name, character.direction, character.currentFrame);
        
        if (frame) {
          try {
            // Calcola dimensioni frame originali
            const frameWidth = frame instanceof HTMLCanvasElement ? frame.width : frame.width;
            const frameHeight = frame instanceof HTMLCanvasElement ? frame.height : frame.height;
            
            let drawX = character.x;
            let drawY = character.y;
            
            // If character has a pivot, adjust drawing position
            if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
              // The character.x and character.y represent the pivot position
              // Il pivot è relativo al frame originale, quindi calcoliamo l'offset considerando lo scaling
              drawX = character.x - (charDef.pivotX * scale);
              drawY = character.y - (charDef.pivotY * scale);
            } else {
              // Senza pivot, il character.x e character.y sono la posizione top-left
              drawX = character.x;
              drawY = character.y;
            }
            
            // Disegna il frame scalato
            const scaledWidth = frameWidth * scale;
            const scaledHeight = frameHeight * scale;
            
            // Se è un canvas (frame specchiato), disegna il canvas
            if (frame instanceof HTMLCanvasElement) {
              ctx.drawImage(frame, drawX, drawY, scaledWidth, scaledHeight);
            } else {
              // Frame normale (Image)
              ctx.drawImage(frame, drawX, drawY, scaledWidth, scaledHeight);
            }
          } catch (error) {
            log(`[Runtime] Errore rendering character ${character.id}: ${error.message}`, 'warning');
            // Se c'è un errore, renderizza comunque un placeholder
            renderCharacterPlaceholder(ctx, character, charDef, scale);
          }
        } else {
          // Nessun frame disponibile, renderizza un placeholder per non far scomparire il character
          renderCharacterPlaceholder(ctx, character, charDef, scale);
        }
      });
    }

    // Renderizza GUI - verifica che le immagini siano caricate e pronte
    gameState.guis.forEach(gui => {
      // Background GUI
      if (gui.background && gui.background.complete && gui.background.naturalWidth > 0) {
        try {
          ctx.drawImage(gui.background, 0, 0, canvas.width, canvas.height);
        } catch (error) {
          log(`[Runtime] Errore rendering GUI background ${gui.id}: ${error.message}`, 'warning');
        }
      }

      // Pulsanti GUI
      if (gui.buttons && Array.isArray(gui.buttons)) {
        gui.buttons.forEach(btn => {
          if (btn.enabled) {
            if (btn.backgroundImage && btn.backgroundImage.complete && btn.backgroundImage.naturalWidth > 0) {
              try {
                ctx.drawImage(btn.backgroundImage, btn.x, btn.y, btn.w, btn.h);
              } catch (error) {
                log(`[Runtime] Errore rendering pulsante ${btn.id}: ${error.message}`, 'warning');
              }
            } else {
              // Fallback: disegna rettangolo se l'immagine non è disponibile
              ctx.fillStyle = 'rgba(57, 255, 20, 0.3)';
              ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
              ctx.strokeStyle = '#39ff14';
              ctx.lineWidth = 2;
              ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
            }

            // Testo pulsante
            if (btn.text) {
              ctx.fillStyle = '#fff';
              ctx.font = '14px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2);
            }
          }
        });
      }
    });
  }

  // ============================================
  // GAME LOOP
  // ============================================
  function update(deltaTime) {
    // Aggiorna movimento e animazioni dei character
    gameState.characters.forEach(character => {
      if (!character.visible || character.roomId !== gameState.currentRoomId) {
        return;
      }

      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || !charDef.directions[character.direction]) {
        return;
      }

      const dirData = charDef.directions[character.direction];
      if (!dirData.frames || dirData.frames.length === 0) {
        return;
      }

      // Inizializza proprietà movimento se non presenti (retrocompatibilità)
      if (character.isMoving === undefined) {
        character.isMoving = false;
      }
      if (character.path === undefined) {
        character.path = null;
      }
      if (character.pathIndex === undefined) {
        character.pathIndex = 0;
      }
      if (character.moveSpeed === undefined) {
        // Prova a leggere dalle spawnSettings del character definition
        const charDef = gameState.characterDefinitions.get(character.name);
        if (charDef && charDef.spawnSettings && charDef.spawnSettings.moveSpeed !== undefined) {
          const speedValue = Number(charDef.spawnSettings.moveSpeed);
          character.moveSpeed = (!isNaN(speedValue) && speedValue > 0) ? speedValue : 100;
        } else {
          character.moveSpeed = 100; // pixel per secondo (default)
        }
      }

      // ============================================
      // GESTIONE MOVIMENTO LUNGO IL PATH
      // ============================================
      if (character.isMoving && character.path && Array.isArray(character.path) && character.path.length > 0) {
        // Assicurati che pathIndex sia valido
        if (character.pathIndex >= character.path.length) {
          // Path completato, ferma il movimento
          character.isMoving = false;
          character.path = null;
          character.pathIndex = 0;
          character.currentFrame = 0; // Torna a idle
          character.frameTime = 0;
          log(`[Runtime] Movimento completato per character ${character.name || character.id}`, 'info');
          return;
        }

        // Ottieni il punto target corrente
        const targetPoint = character.path[character.pathIndex];
        const currentX = character.x;
        const currentY = character.y;
        const targetX = targetPoint.x;
        const targetY = targetPoint.y;

        // Calcola distanza e direzione verso il target
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Soglia per considerare raggiunto il punto (5 pixel)
        const arrivalThreshold = 5;

        if (distance <= arrivalThreshold) {
          // Raggiunto il punto target, passa al prossimo
          character.x = targetX;
          character.y = targetY;
          character.pathIndex++;

          // Se abbiamo raggiunto l'ultimo punto, ferma il movimento
          if (character.pathIndex >= character.path.length) {
            character.isMoving = false;
            character.path = null;
            character.pathIndex = 0;
            character.currentFrame = 0; // Torna a idle
            character.frameTime = 0;
            log(`[Runtime] Movimento completato per character ${character.name || character.id}`, 'info');
            return;
          }

          // Aggiorna direzione verso il prossimo punto
          const nextTarget = character.path[character.pathIndex];
          const nextDx = nextTarget.x - character.x;
          const nextDy = nextTarget.y - character.y;
          character.direction = getDirectionFromVector(nextDx, nextDy);
        } else {
          // Muovi verso il target
          // Calcola velocità in pixel per frame (moveSpeed è in pixel per secondo)
          const speedPerFrame = (character.moveSpeed * deltaTime) / 1000;
          
          // Limita la velocità per non superare il target
          const moveDistance = Math.min(speedPerFrame, distance);
          
          // Calcola il vettore normalizzato
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          // Aggiorna posizione
          character.x += normalizedDx * moveDistance;
          character.y += normalizedDy * moveDistance;

          // Aggiorna direzione mentre si muove (per animazioni corrette)
          character.direction = getDirectionFromVector(dx, dy);
        }
      } else if (character.isMoving && (!character.path || character.path.length === 0)) {
        // Path non valido, ferma il movimento
        character.isMoving = false;
        character.path = null;
        character.pathIndex = 0;
        log(`[Runtime] Movimento fermato: path non valido per character ${character.name || character.id}`, 'warning');
      }

      // ============================================
      // GESTIONE ANIMAZIONI
      // ============================================
      // Se c'è solo un frame, non animare
      if (dirData.frames.length === 1) {
        character.currentFrame = 0;
        return;
      }

      // Se il personaggio è fermo (idle), mostra solo il frame 0 (primo frame = posa idle)
      if (!character.isMoving) {
        character.currentFrame = 0;
        character.frameTime = 0;
        return;
      }

      // Il personaggio sta camminando: anima solo i frame 1..length-1 (escludendo frame 0)
      // Se currentFrame è 0 (idle), passa al primo frame di movimento (1)
      if (character.currentFrame === 0) {
        character.currentFrame = 1;
      }

      // Aggiorna frame time
      character.frameTime += deltaTime;
      const frameDuration = 1000 / dirData.fps; // Durata di ogni frame in ms

      // Avanza al frame successivo se necessario
      // Loop solo tra frame 1 e length-1 (escludendo frame 0)
      if (character.frameTime >= frameDuration) {
        character.currentFrame++;
        // Se abbiamo raggiunto l'ultimo frame, torna al primo frame di movimento (1)
        if (character.currentFrame >= dirData.frames.length) {
          character.currentFrame = 1;
        }
        character.frameTime = 0;
      }
    });
  }

  function gameLoop(currentTime) {
    // Guardie: non eseguire se non inizializzato
    if (!gameState.isRunning) return;
    if (!gameState.initialized) return;
    if (!canvas || !ctx) return;

    const deltaTime = currentTime - gameState.lastFrameTime;
    gameState.lastFrameTime = currentTime;

    update(deltaTime);
    render(); // Renderizza solo se tutto è pronto (controlli interni in render())

    gameState.animationFrameId = requestAnimationFrame(gameLoop);
  }

  function startGameLoop() {
    // Guardie: non avviare se non inizializzato o senza stanza
    if (!gameState.initialized) {
      log('[Runtime] Game loop non avviato: runtime non inizializzato', 'warning');
      return;
    }
    if (!canvas || !ctx) {
      log('[Runtime] Game loop non avviato: canvas non disponibile', 'warning');
      return;
    }
    
    if (gameState.isRunning) {
      log('[Runtime] Game loop già in esecuzione', 'info');
      return;
    }
    
    log('[Runtime] Avvio game loop (rendering frame)...', 'info');
    gameState.isRunning = true;
    gameState.lastFrameTime = performance.now();
    gameState.animationFrameId = requestAnimationFrame(gameLoop);
    log('[Runtime] Game loop avviato con successo', 'success');
  }

  function stopGameLoop() {
    gameState.isRunning = false;
    if (gameState.animationFrameId) {
      cancelAnimationFrame(gameState.animationFrameId);
      gameState.animationFrameId = null;
    }
    
    // ⚠️ CLEANUP: Rimuovi listener quando il game loop si ferma
    // Questo previene listener persistenti tra start/stop playtest
    cleanupInteraction();
  }

  // ============================================
  // INTERAZIONE - SISTEMA CENTRALIZZATO
  // ============================================
  // ⚠️ CAUSA RADICE DEL BUG (RISOLTO):
  // Il doppio click era causato da:
  // 1. Listener in main.js che gestiva click sul canvas dell'editor durante playtest
  // 2. Listener in runtime.js che gestiva click sul canvas del runtime
  // 3. Entrambi i listener erano attivi contemporaneamente, causando doppia esecuzione
  //
  // SOLUZIONE IMPLEMENTATA:
  // - Rimossa gestione playtest dal listener dell'editor (main.js)
  // - Sistema centralizzato nel runtime con protezioni anti-double-fire
  // - Flag per frame, stopImmediatePropagation, cleanup automatico
  //
  // PERCHÉ ORA NON PUÒ PIÙ ACCADERE:
  // 1. ✅ Separazione responsabilità: Editor gestisce solo editing, Runtime gestisce solo playtest
  // 2. ✅ Un solo listener attivo: Il runtime registra UN SOLO listener con cleanup automatico
  // 3. ✅ Protezioni multiple:
  //    - stopImmediatePropagation() blocca propagazione eventi
  //    - Flag per frame previene doppia esecuzione nello stesso frame
  //    - Debounce previene click troppo ravvicinati
  //    - Cleanup automatico quando playtest termina
  // 4. ✅ Verifica stato: Il listener controlla che gameState.isRunning === true
  // 5. ✅ Rimozione preventiva: Listener esistente viene rimosso prima di aggiungerne uno nuovo
  //
  // ORA: Solo il runtime gestisce i click durante il playtest, garantendo
  // una singola esecuzione per click. Il sistema è estendibile per touch, mobile, controller.
  
  let clickListenerAttached = false;
  let clickHandlerFunction = null; // Riferimento alla funzione per cleanup
  let clickHandledThisFrame = false; // Flag anti-double-fire per frame
  let lastClickTime = 0; // Timestamp ultimo click per debounce
  const CLICK_DEBOUNCE_MS = 50; // Debounce di 50ms tra click
  
  function setupInteraction() {
    if (!canvas) {
      log('[Runtime] setupInteraction: Canvas non disponibile', 'warning');
      return;
    }

    // ⚠️ PROTEZIONE DOPPI EVENTI: Se già bindato, NON bindare di nuovo
    if (runtime.eventsBound) {
      log('[Runtime] setupInteraction: Eventi già bindati (runtime.eventsBound=true), skip', 'info');
      return;
    }

    // ⚠️ PROTEZIONE: Rimuovi listener esistente prima di aggiungerne uno nuovo
    // Questo previene registrazioni multiple durante reinizializzazioni
    if (clickListenerAttached && clickHandlerFunction) {
      log('[Runtime] setupInteraction: Rimozione listener esistente prima di riaggiungere', 'warning');
      canvas.removeEventListener('click', clickHandlerFunction);
      clickListenerAttached = false;
      clickHandlerFunction = null;
    }

    // Evita di aggiungere listener multipli
    if (clickListenerAttached) {
      log('[Runtime] setupInteraction: Listener già attaccato, skip', 'info');
      return;
    }

    log('[Runtime] setupInteraction: Registrazione listener click centralizzato', 'info');
    
    // Crea funzione handler con riferimento per cleanup
    clickHandlerFunction = function(e) {
      // ⚠️ PROTEZIONE 1: Blocca propagazione immediata per prevenire doppia esecuzione
      e.stopImmediatePropagation();
      
      // ⚠️ PROTEZIONE 2: Debounce - ignora click troppo ravvicinati
      const now = Date.now();
      if (now - lastClickTime < CLICK_DEBOUNCE_MS) {
        log(`[Runtime] Click handler: Click ignorato (debounce: ${now - lastClickTime}ms < ${CLICK_DEBOUNCE_MS}ms)`, 'warning');
        return;
      }
      lastClickTime = now;
      
      // ⚠️ PROTEZIONE 3: Flag per frame - previene doppia esecuzione nello stesso frame
      if (clickHandledThisFrame) {
        log('[Runtime] Click handler: Click ignorato (già gestito in questo frame)', 'warning');
        return;
      }
      clickHandledThisFrame = true;
      
      // Reset flag al prossimo frame (usando requestAnimationFrame)
      requestAnimationFrame(() => {
        clickHandledThisFrame = false;
      });

      if (!canvas) {
        log('[Runtime] Click handler: Canvas non disponibile', 'error');
        return;
      }

      // ⚠️ PROTEZIONE 4: Verifica che il runtime sia attivo
      if (!gameState.isRunning) {
        log('[Runtime] Click handler: Runtime non in esecuzione, ignoro click', 'info');
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        log('[Runtime] Click handler: Canvas rect invalido', 'error');
        return;
      }

      // Conversione coordinate: da coordinate viewport a coordinate canvas
      // Considera scaling CSS e devicePixelRatio
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      log(`[Runtime] Click handler: Coordinate viewport (${Math.round(e.clientX)}, ${Math.round(e.clientY)}), rect (${Math.round(rect.left)}, ${Math.round(rect.top)}, ${Math.round(rect.width)}x${Math.round(rect.height)}), canvas (${canvas.width}x${canvas.height}), scale (${scaleX.toFixed(2)}, ${scaleY.toFixed(2)}), coordinate canvas (${Math.round(x)}, ${Math.round(y)})`, 'info');
      
      // Log call stack per debug (solo in sviluppo)
      if (window.DEBUG_RUNTIME_CLICKS) {
        log('[Runtime] Click handler: Call stack:\n' + new Error().stack, 'info');
      }

      // Dispatch centralizzato
      handleCanvasClick(x, y);
    };
    
    canvas.addEventListener('click', clickHandlerFunction, { passive: false }); // passive: false per permettere stopImmediatePropagation

    canvas.style.cursor = 'pointer';
    clickListenerAttached = true;
    runtime.eventsBound = true; // ⚠️ Marca eventi come bindati
    log('[Runtime] setupInteraction: Listener click centralizzato registrato con successo (runtime.eventsBound=true)', 'success');
  }
  
  // Funzione di cleanup per rimuovere listener
  function cleanupInteraction() {
    if (canvas && clickHandlerFunction && clickListenerAttached) {
      log('[Runtime] cleanupInteraction: Rimozione listener click', 'info');
      canvas.removeEventListener('click', clickHandlerFunction);
      clickListenerAttached = false;
      clickHandlerFunction = null;
      clickHandledThisFrame = false;
      lastClickTime = 0;
      runtime.eventsBound = false; // ⚠️ Reset flag quando viene fatto cleanup
      log('[Runtime] cleanupInteraction: Listener rimosso con successo (runtime.eventsBound=false)', 'success');
    }
  }
  
  // Funzione dispatch centralizzata
  async function handleCanvasClick(x, y) {
    // Questa funzione è il punto di ingresso UNICO per tutti i click nel runtime
    // Garantisce che ogni click venga processato UNA SOLA VOLTA
    await handleClick(x, y);
  }

  async function handleClick(x, y) {
    if (!gameState.currentRoom) {
      log(`[Runtime] handleClick: Nessuna room corrente`, 'warning');
      return;
    }

    log(`[Runtime] handleClick: Click rilevato alle coordinate canvas (${Math.round(x)}, ${Math.round(y)})`, 'info');

    // ⚠️ NUOVA LOGICA: Usa find() invece di forEach per trovare UN SOLO hotspot
    // Questo garantisce che venga eseguito SOLO lo script dell'hotspot cliccato
    if (gameState.currentRoom.hotspots && Array.isArray(gameState.currentRoom.hotspots)) {
      const hotspotCount = gameState.currentRoom.hotspots.length;
      log(`[Runtime] handleClick: Verifica ${hotspotCount} hotspot(s)`, 'info');
      
      // Trova UN SOLO hotspot colpito (find si ferma al primo match)
      const clickedHotspot = gameState.currentRoom.hotspots.find(hotspot => {
        if (!hotspot.visible) {
          log(`[Runtime] handleClick: Hotspot ${hotspot.id} ignorato (visible=false)`, 'info');
          return false;
        }

        if (!hotspot.points || hotspot.points.length < 3) {
          log(`[Runtime] handleClick: Hotspot ${hotspot.id} ignorato (punti insufficienti: ${hotspot.points ? hotspot.points.length : 0})`, 'warning');
          return false;
        }

        const isInside = isPointInPolygon(hotspot.points, x, y);
        log(`[Runtime] handleClick: Hotspot ${hotspot.id} (${hotspot.name}): hit-test = ${isInside}`, 'info');
        return isInside;
      });
      
      if (clickedHotspot) {
        log(`[Runtime] [DEBUG] handleClick: ✓ Hotspot rilevato: ${clickedHotspot.name} (ID: ${clickedHotspot.id})`, 'success');
        log(`[Runtime] [DEBUG] handleClick: Esecuzione script per hotspot ${clickedHotspot.id}`, 'info');
        await executeHotspotScript(clickedHotspot.id, clickedHotspot, x, y);
        log(`[Runtime] [DEBUG] handleClick: ✓ Script completato per hotspot ${clickedHotspot.id}, uscita da handleClick`, 'success');
        return; // Hotspot ha priorità, esci subito
      }
      
      log(`[Runtime] handleClick: Nessun hotspot colpito`, 'info');
    } else {
      log(`[Runtime] handleClick: Nessun hotspot nella room corrente`, 'info');
    }

    // Controlla click su oggetti
    if (gameState.currentRoom.objects && Array.isArray(gameState.currentRoom.objects)) {
      const objectCount = gameState.currentRoom.objects.length;
      log(`[Runtime] handleClick: Verifica ${objectCount} oggetto/i`, 'info');
      
      for (const obj of gameState.currentRoom.objects) {
        if (!obj.visible || !obj.enabled || !obj.img) {
          log(`[Runtime] handleClick: Oggetto ${obj.id} ignorato (visible=${obj.visible}, enabled=${obj.enabled}, img=${!!obj.img})`, 'info');
          continue;
        }

        const isInside = x >= obj.x && x <= obj.x + obj.img.width &&
                         y >= obj.y && y <= obj.y + obj.img.height;
        log(`[Runtime] handleClick: Oggetto ${obj.id} (${obj.name}): hit-test = ${isInside}`, 'info');

        if (isInside) {
          log(`[Runtime] handleClick: ✓ Click su oggetto: ${obj.name} (${obj.id})`, 'success');
          await executeObjectClickScripts(obj.id, x, y);
          return;
        }
      }
      
      log(`[Runtime] handleClick: Nessun oggetto colpito`, 'info');
    } else {
      log(`[Runtime] handleClick: Nessun oggetto nella room corrente`, 'info');
    }

    // Controlla click su character
    let clickedCharacter = null;
    for (const character of gameState.characters.values()) {
      if (!character.visible || character.roomId !== gameState.currentRoomId) {
        continue;
      }

      const frame = getCharacterFrame(character.name, character.direction, character.currentFrame);
      if (!frame) {
        continue;
      }

      // Calcola dimensioni frame (può essere Image o Canvas)
      const frameWidth = frame.width || frame.naturalWidth || 0;
      const frameHeight = frame.height || frame.naturalHeight || 0;

      const isInside = x >= character.x && x <= character.x + frameWidth &&
                       y >= character.y && y <= character.y + frameHeight;
      log(`[Runtime] handleClick: Character ${character.id} (${character.name}): hit-test = ${isInside}`, 'info');

      if (isInside) {
        clickedCharacter = character;
        break; // Prendi il primo character colpito
      }
    }

    if (clickedCharacter) {
      log(`[Runtime] handleClick: ✓ Click su character: ${clickedCharacter.name} (${clickedCharacter.id})`, 'success');
      
      // Esegui script del character se presente
      const characterScripts = gameState.attachments.characterScripts || {};
      if (typeof characterScripts === 'object' && characterScripts[clickedCharacter.id]) {
        const scriptName = characterScripts[clickedCharacter.id];
        if (gameState.scripts[scriptName]) {
          await executeScriptHandler(gameState.scripts[scriptName], 'on_character_click', [clickedCharacter.id, x, y], scriptName);
        }
      }

      // Esegui handler registrati tramite on_character_click(function() {...})
      for (const handler of eventHandlers.character_click) {
        try {
          handler(clickedCharacter.id, x, y);
        } catch (error) {
          log(`Errore handler on_character_click: ${error.message}`, 'error');
        }
      }
      return;
    }

    // Controlla click su pulsanti GUI
    for (const gui of gameState.guis.values()) {
      if (gui.buttons && Array.isArray(gui.buttons)) {
        for (const btn of gui.buttons) {
          if (!btn.enabled) continue;

          if (x >= btn.x && x <= btn.x + btn.w &&
              y >= btn.y && y <= btn.y + btn.h) {
            log(`Click su pulsante GUI: ${btn.name}`, 'info');
            // Esegui script del pulsante se presente
            const guiScripts = gameState.attachments.guiScripts || {};
            if (typeof guiScripts === 'object' && guiScripts[btn.id]) {
              const scriptName = guiScripts[btn.id];
              if (gameState.scripts[scriptName]) {
                // ⚠️ Passa scriptName per garantire cache corretta
                await executeScriptHandler(gameState.scripts[scriptName], 'on_gui_click', [btn.id, x, y], scriptName);
              }
            }

            // Esegui handler registrati tramite on_gui_click(function() {...})
            for (const handler of eventHandlers.gui_click) {
              try {
                handler(btn.id, x, y);
              } catch (error) {
                log(`Errore handler on_gui_click: ${error.message}`, 'error');
              }
            }
            return;
          }
        }
      }
    }

    // Pathfinding: se non c'è stato click su hotspot/oggetto/character/GUI, prova a muovere il player
    const playerId = gameState.variables.get('playerId');
    if (playerId) {
      const player = gameState.characters.get(playerId);
      if (player && player.visible && player.roomId === gameState.currentRoomId) {
        // Inizializza proprietà movimento se mancanti (retrocompatibilità)
        if (player.isMoving === undefined) player.isMoving = false;
        if (player.path === undefined) player.path = null;
        if (player.moveSpeed === undefined) {
          // Prova a leggere dalle spawnSettings del character definition
          const charDef = gameState.characterDefinitions.get(player.name);
          if (charDef && charDef.spawnSettings && charDef.spawnSettings.moveSpeed !== undefined) {
            const speedValue = Number(charDef.spawnSettings.moveSpeed);
            player.moveSpeed = (!isNaN(speedValue) && speedValue > 0) ? speedValue : 100;
          } else {
            player.moveSpeed = 100; // pixel per secondo (default)
          }
        }
        
        // Verifica che il player abbia un pivot (necessario per il pathfinding)
        const charDef = gameState.characterDefinitions.get(player.name);
        if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
          // Calcola la posizione del pivot del player
          const playerPivotX = player.x;
          const playerPivotY = player.y;
          
          // Verifica se il pivot del player è sulla walkable area
          const walkableArea = gameState.currentRoom.walkableArea;
          if (walkableArea && Array.isArray(walkableArea) && walkableArea.length >= 3) {
            if (isPointInPolygon(walkableArea, playerPivotX, playerPivotY)) {
              // Il player è sulla walkable area, calcola il path verso il punto cliccato
              const path = findPathOnWalkableArea(playerPivotX, playerPivotY, x, y, walkableArea);
              
              if (path && path.length > 0) {
                // Avvia il movimento del player
                player.isMoving = true;
                player.path = path;
                player.pathIndex = 0; // Inizia dal primo punto del path
                player.moveSpeed = player.moveSpeed || 100; // pixel per secondo
                
                // Imposta la direzione iniziale verso il primo punto del path
                const firstTarget = path[0];
                const dx = firstTarget.x - playerPivotX;
                const dy = firstTarget.y - playerPivotY;
                player.direction = getDirectionFromVector(dx, dy);
                
                // Imposta il frame iniziale: se ci sono più di 1 frame, inizia dal frame 1 (non 0)
                const charDef = gameState.characterDefinitions.get(player.name);
                if (charDef && charDef.directions[player.direction]) {
                  const dirData = charDef.directions[player.direction];
                  if (dirData.frames && dirData.frames.length > 1) {
                    player.currentFrame = 1; // Inizia dal primo frame di movimento (escludendo idle)
                  } else {
                    player.currentFrame = 0;
                  }
                } else {
                  player.currentFrame = 0;
                }
                player.frameTime = 0;
                
                log(`[Runtime] Pathfinding: Player si muove verso (${Math.round(x)}, ${Math.round(y)})`, 'info');
                return;
              } else {
                log(`[Runtime] Pathfinding: Impossibile trovare un percorso valido verso (${Math.round(x)}, ${Math.round(y)})`, 'info');
              }
            } else {
              log(`[Runtime] Pathfinding: Player non è sulla walkable area (pivot: ${Math.round(playerPivotX)}, ${Math.round(playerPivotY)})`, 'info');
            }
          } else {
            log(`[Runtime] Pathfinding: Nessuna walkable area definita per questa room`, 'info');
          }
        }
      }
    }
  }

  // ⚠️ PROTEZIONE DOPPI EVENTI: Flag per prevenire registrazioni multiple
  // Se runtime.eventsBound === true, NON registrare di nuovo i listener

  // ============================================
  // RILEVAMENTO MODALITÀ
  // ============================================
  // Rileva dinamicamente se siamo in un iframe
  const isInIframe = window.self !== window.top;

  function sendToEditor(message, priority = false) {
    // Se siamo in un iframe, invia messaggio al parent
    if (isInIframe) {
      try {
        window.parent.postMessage(message, '*');
      } catch (e) {
        // Ignora errori di comunicazione (sandbox restrictions)
        if (window.addRuntimeLog) {
          window.addRuntimeLog(`Cannot send message to parent: ${e.message}`, 'warning');
        }
      }
    }
  }

  function sendRuntimeReady() {
    sendToEditor({
      type: 'RUNTIME_READY',
      timestamp: Date.now()
    }, true);
  }

  function sendScriptDone() {
    sendToEditor({
      type: 'SCRIPT_DONE',
      timestamp: Date.now()
    });
  }

  // Listener per messaggi dall'editor
  window.addEventListener('message', function(event) {
    // NOTA: In produzione, verificare event.origin per sicurezza
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'START_PLAYTEST':
        // Avvia playtest con progetto ricevuto dall'editor
        log('[Runtime] Ricevuto START_PLAYTEST', 'info');
        if (message.projectData) {
          (async () => {
            try {
              await window.initRuntime(message.projectData);
              log('[Runtime] Playtest avviato correttamente', 'success');
            } catch (error) {
              log(`[Runtime] Errore avvio playtest: ${error.message}`, 'error');
              sendToEditor({
                type: 'PLAYTEST_ERROR',
                error: error.message || String(error),
                timestamp: Date.now()
              }, true);
            }
          })();
        } else {
          log('[Runtime] START_PLAYTEST ricevuto ma projectData mancante', 'error');
          sendToEditor({
            type: 'PLAYTEST_ERROR',
            error: 'projectData mancante nel messaggio START_PLAYTEST',
            timestamp: Date.now()
          }, true);
        }
        break;

      case 'RUN_SCRIPT':
        // Esegui script ricevuto dall'editor
        if (message.code) {
          (async () => {
            try {
              // ⚠️ Per RUN_SCRIPT, usa un nome generato basato su timestamp o hash
              // Questo garantisce che script diversi vengano compilati separatamente
              const scriptName = message.scriptName || `run_script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await executeScriptHandler(message.code, message.handlerName || null, message.handlerArgs || [], scriptName);
              sendScriptDone();
            } catch (error) {
              sendToEditor({
                type: 'SCRIPT_ERROR',
                error: error.message || String(error),
                timestamp: Date.now()
              }, true);
              sendScriptDone();
            }
          })();
        }
        break;

      case 'UPDATE_CONTEXT':
        // Aggiorna contesto senza eseguire script
        if (message.context) {
          if (message.context.roomId !== undefined) {
            gameState.currentRoomId = message.context.roomId;
          }
          if (message.context.objectId !== undefined) {
            gameState.objectId = message.context.objectId;
          }
          if (message.context.variables && typeof message.context.variables === 'object') {
            Object.keys(message.context.variables).forEach(key => {
              gameState.variables.set(key, message.context.variables[key]);
            });
          }
        }
        break;

      case 'RESET':
        // Reset completo dello stato
        gameState.currentRoomId = null;
        gameState.currentRoom = null;
        gameState.objectId = null;
        gameState.variables.clear();
        gameState.objects.clear();
        gameState.guis.clear();
        gameState.scripts = {};
        gameState.attachments = {};
        gameState.initialized = false;
        
        // ⚠️ RESET CACHE SCRIPT: Pulisci la cache degli script compilati durante il reset
        gameState.compiledScripts.clear();
        
        // Reset AssetRegistry
        AssetRegistry.images.clear();
        AssetRegistry.isLoading = false;
        AssetRegistry.loadComplete = false;
        
        stopGameLoop();
        sendRuntimeReady();
        break;

      default:
        // Ignora messaggi sconosciuti
        break;
    }
  });

  // Override log per inviare anche all'editor se in iframe
  const originalLogFunction = function(message, level = 'info') {
    // Log locale (solo se non siamo in iframe o se addRuntimeLog è disponibile)
    if (!isInIframe && window.addRuntimeLog) {
      window.addRuntimeLog(message, level);
    } else if (!isInIframe) {
      console.log(`[Runtime ${level}]`, message);
    }

    // Invia sempre all'editor se in iframe
    if (isInIframe) {
      sendToEditor({
        type: 'SCRIPT_LOG',
        message: message,
        level: level,
        timestamp: Date.now()
      });
    }
  };

  // Sostituisci la funzione log
  log = originalLogFunction;

  // Override GameAPI.print per inviare anche all'editor
  // ⚠️ IMPORTANTE: originalPrint già chiama log() che chiama addRuntimeLog()
  // NON dobbiamo chiamare addRuntimeLog() di nuovo qui per evitare doppia esecuzione
  const originalPrint = GameAPI.print;
  GameAPI.print = function() {
    const args = Array.from(arguments);
    const message = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return '[object Object]';
        }
      }
      return String(arg);
    }).join(' ');

    // ⚠️ CORREZIONE: originalPrint già chiama log() che gestisce addRuntimeLog()
    // Chiamiamo originalPrint che gestisce tutto il logging
    if (!isInIframe) {
      // In modalità standalone, originalPrint chiama log() che chiama addRuntimeLog()
      originalPrint.apply(GameAPI, arguments);
    } else {
      // In modalità iframe, inviamo solo all'editor (originalPrint non chiama log in iframe)
      sendToEditor({
        type: 'SCRIPT_LOG',
        message: message,
        level: 'info',
        timestamp: Date.now()
      });
    }
    
    // ⚠️ RIMOSSO: Non chiamiamo più addRuntimeLog() qui perché originalPrint già lo fa
    // Questo previene doppia esecuzione
  };

  // Override GameAPI.error per inviare anche all'editor
  const originalError = GameAPI.error;
  GameAPI.error = function() {
    const args = Array.from(arguments);
    const message = args.map(arg => String(arg)).join(' ');

    // Log locale (solo se standalone)
    if (!isInIframe) {
      originalError.apply(GameAPI, arguments);
    }
    
    // Invia sempre all'editor se in iframe, altrimenti solo se addRuntimeLog disponibile
    if (isInIframe) {
      sendToEditor({
        type: 'SCRIPT_ERROR',
        error: message,
        timestamp: Date.now()
      }, true);
    } else if (window.addRuntimeLog) {
      window.addRuntimeLog(message, 'error');
    }
  };

  // ============================================
  // INIZIALIZZAZIONE AUTOMATICA
  // ============================================
  // ============================================
  // INIZIALIZZAZIONE AUTOMATICA
  // ============================================
  // Flag per tracciare se RUNTIME_READY è già stato inviato (evita invii multipli)
  let runtimeReadySent = false;
  
  function initializeRuntime() {
    if (isInIframe) {
      // Siamo in un iframe - modalità playtest (sandboxed)
      log('[Runtime] Modalità iframe rilevata - playtest mode', 'info');
      
      function initIframeMode() {
        // Invia RUNTIME_READY solo se non è già stato inviato
        if (!runtimeReadySent) {
          log('[Runtime] Invio RUNTIME_READY all\'editor', 'info');
          sendRuntimeReady();
          runtimeReadySent = true;
          
          // Re-invia dopo un breve delay come backup (solo una volta)
          setTimeout(() => {
            if (!runtimeReadySent) {
              log('[Runtime] Re-invio RUNTIME_READY (backup)', 'info');
              sendRuntimeReady();
              runtimeReadySent = true;
            }
          }, 200);
        } else {
          log('[Runtime] RUNTIME_READY già inviato, skip', 'info');
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initIframeMode);
      } else {
        // DOM già pronto
        initIframeMode();
      }
    } else {
      // Siamo standalone - modalità runtime completo
      // initRuntime() verrà chiamato manualmente per caricare il progetto
      log('[Runtime] Modalità standalone rilevata', 'info');
      if (window.addRuntimeLog) {
        window.addRuntimeLog('[Runtime] Runtime caricato e pronto (modalità standalone)', 'info');
      } else {
        console.log('[Runtime] Runtime caricato e pronto (modalità standalone)');
      }
    }
  }

  // Inizializza quando il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRuntime);
  } else {
    // DOM già pronto
    initializeRuntime();
  }

})();

