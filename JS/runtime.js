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
    variableDefinitions: new Map(), // name -> { type, initialValue, ... } da projectData.variables
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
    compiledScripts: new Map(),
    inventory: null // { enabled, displayMode, popupEdgeHeight, background, toggleIcon, toggleIconRect, slots, itemDefs, contents, visible }
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

  // Categorie usate per risolvere asset: (include 'resource' per immagini da Resources centralizzate)
  const ASSET_RESOLVE_CATEGORIES = [
    'resource',
    'background',
    'foreground',
    'sprite',
    'gui',
    'character',
    'cursor'
  ];

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
      <button class="close-btn" onclick="this.parentElement.remove()" title="Close">×</button>
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
        log(`[Runtime] Command execution error: ${error.message}`, 'error');
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
                // Usa il tipo salvato in Firestore (es. 'resource' per Resources centralizzate)
                const metaCategory = data.type || category;
                const folder = window.supabaseStorage.getSupabaseFolderForType
                  ? window.supabaseStorage.getSupabaseFolderForType(metaCategory)
                  : metaCategory;
                const subfolder = data.subfolder || null;
                log(`[Runtime] resolveAssetId: usando fileName da Firestore: '${data.fileName}', tipo metadata '${metaCategory}' -> folder '${folder}'${subfolder ? `, subfolder '${subfolder}'` : ''}`, 'info');
                const url = window.supabaseStorage.getAssetPublicUrl(
                  userId,
                  actualProjectId,
                  metaCategory,
                  data.fileName,
                  subfolder
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
              log(`[Runtime] resolveAssetId: ⚠️ WARNING - asset not found in Firestore (assetId: '${assetId}')`, 'warning');
              log(`[Runtime] resolveAssetId: Questo significa che il metadata dell'asset non è stato salvato correttamente.`, 'warning');
              log(`[Runtime] resolveAssetId: Proverò pattern di fallback, ma potrebbero non funzionare se il fileName include un baseName.`, 'warning');
              log(`[Runtime] resolveAssetId: Soluzione: assicurati che saveAssetMetadata venga chiamato dopo ogni upload.`, 'warning');
            }
          }
        } catch (firestoreError) {
          log(`[Runtime] resolveAssetId: Firestore error (continuing with Supabase): ${firestoreError.message}`, 'info');
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
          // Resources/gui/cursor vivono nella cartella di categoria, non in rooms/characters
          const useRoomSubfolder = category !== 'resource' && category !== 'gui' && category !== 'cursor';
          const subfolder = useRoomSubfolder
            ? (roomName ? `rooms/${roomName}` : (characterName ? `characters/${characterName}` : null))
            : null;
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
        `[Runtime] resolveAssetId: ✗ No URL found (Firestore+Supabase), stopping without fallback patterns`,
        'warning'
      );
      return null;
    } catch (error) {
      log(`[Runtime] resolveAssetId: error: ${error.message}`, 'error');
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
        
        // Se non abbiamo ancora risolto, prova tutte le categorie (incluso 'resource' per Resources centralizzate)
        if (!resolvedUrl) {
          for (const category of ASSET_RESOLVE_CATEGORIES) {
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
          log(`[Runtime] Could not resolve assetId '${assetId}' in any category. Check that Supabase is configured correctly.`, 'warning');
          resolve(null);
          return;
        }
      }

      // Timeout per evitare che il caricamento si blocchi indefinitamente
      const timeout = setTimeout(() => {
        log(`Image load timeout: ${src}`, 'warning');
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
        log(`[Runtime] ✓ Image loaded successfully: ${src.substring(0, 50)}${src.length > 50 ? '...' : ''} (${img.naturalWidth}x${img.naturalHeight})`, 'success');
        resolve(img);
      };
      img.onerror = (error) => {
        clearTimeout(timeout);
        log(`[Runtime] ✗ Error loading image '${src.substring(0, 50)}${src.length > 50 ? '...' : ''}'`, 'error');
        log(`[Runtime] URL tentato: ${imageUrl}`, 'error');
        log(`[Runtime] Categoria usata: ${resolvedCategory || categoryHint || 'sconosciuta'}`, 'error');
        log(`[Runtime] Possible causes: CORS, missing file, unsupported format, wrong path`, 'warning');
        
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
        log(`[Runtime] TIP: Open this URL in the browser to check if the file exists:`, 'info');
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
        throw new Error('Invalid project data');
      }

      if (projectData.format !== 'amianto-game') {
        throw new Error('Unsupported project format. Expected: amianto-game');
      }

      // Se siamo in iframe, modalità playtest (sandboxed)
      if (isInIframe) {
        log('[Runtime] iframe mode (playtest) - sandboxed initialization', 'info');
        
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
      log('[Runtime] Standalone mode - full initialization', 'info');
      showLoadingOverlay();
      updateLoadingMessage('Initializing runtime...');

      // Validazione progetto
      if (!projectData || typeof projectData !== 'object') {
        throw new Error('Invalid project data');
      }

      if (projectData.format !== 'amianto-game') {
        throw new Error('Unsupported project format. Expected: amianto-game');
      }

      // Reset stato
      gameState.projectData = projectData;
      gameState.variables.clear();
      gameState.variableDefinitions = new Map();
      gameState.objects.clear();
      gameState.guis.clear();
      gameState.inventory = createEmptyInventoryState();
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
        throw new Error('Canvas not found');
      }

      ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Imposta dimensioni canvas
      const settings = projectData.settings || {};
      canvasWidth = settings.canvasWidth || 800;
      canvasHeight = settings.canvasHeight || 600;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      updateLoadingMessage('Loading variables...');
      await initializeVariables(projectData.variables);

      updateLoadingMessage('Loading images...');
      let assetStats = { total: 0, loaded: 0, failed: 0 };
      try {
        assetStats = await preloadAssets(projectData);
        log(`[Runtime] Preload completato: ${assetStats.loaded}/${assetStats.total} asset caricati`, 
            assetStats.failed > 0 ? 'warning' : 'success');
      } catch (error) {
        log(`[Runtime] Error preloading assets: ${error.message}`, 'error');
        console.error(error);
        // Continua anche se il preload fallisce parzialmente
      }

      // Verifica che il preload sia completato prima di procedere
      if (!AssetRegistry.loadComplete) {
        log('[Runtime] ATTENZIONE: Preload non completato, potrebbe causare problemi di rendering', 'warning');
      }

      updateLoadingMessage('Loading characters...');
      await loadCharacterDefinitions(projectData.characters || []);

      updateLoadingMessage('Loading initial room...');
      const startRoomId = settings.startRoom || settings.startRoomId || (projectData.rooms && projectData.rooms.length > 0 ? projectData.rooms[0].id : null);
      if (startRoomId) {
        await changeRoom(startRoomId);
      } else {
        log('[Runtime] No initial room specified', 'warning');
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
          log(`[Runtime] Player "${playerCharacter.name}" not found in character definitions`, 'error');
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
            log(`[Runtime] Error spawning player "${playerCharacter.name}"`, 'error');
          }
        }
      } else if (settings.startingPlayer && settings.startX !== undefined && settings.startY !== undefined) {
        // PRIORITÀ 2: settings legacy (per retrocompatibilità)
        const charDef = gameState.characterDefinitions.get(settings.startingPlayer);
        if (!charDef) {
          log(`[Runtime] Player "${settings.startingPlayer}" not found in character definitions`, 'error');
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
            log(`[Runtime] Error spawning player "${settings.startingPlayer}"`, 'error');
          }
        }
      }

      updateLoadingMessage('Loading GUI...');
      await loadGUIs(projectData.guis || []);

      updateLoadingMessage('Loading inventory...');
      loadInventory(projectData.inventory);

      updateLoadingMessage('Running initial scripts...');
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
        log('[Runtime] All assets loaded, starting render...', 'info');
        startGameLoop();
        log('[Runtime] Runtime inizializzato con successo - game loop avviato', 'success');
      } else {
        if (!gameState.currentRoom) {
          log('[Runtime] Runtime initialized but no room available', 'warning');
        }
        if (!AssetRegistry.loadComplete) {
          log('[Runtime] Runtime initialized but preload not complete', 'warning');
        }
        // Avvia comunque il game loop, il rendering gestirà le immagini mancanti
        startGameLoop();
      }
    } catch (error) {
      log(`Runtime initialization error: ${error.message}`, 'error');
      console.error(error);
      hideLoadingOverlay();
    }
  };

  // ============================================
  // INIZIALIZZAZIONE VARIABILI
  // ============================================
  function getVariableDefinition(name) {
    if (!name) return null;
    if (gameState.variableDefinitions && gameState.variableDefinitions.has(name)) {
      return gameState.variableDefinitions.get(name);
    }
    const defs = gameState.projectData && gameState.projectData.variables && gameState.projectData.variables.definitions;
    if (Array.isArray(defs)) {
      return defs.find(d => d.name === name) || null;
    }
    return null;
  }

  function coerceVariableValue(def, value) {
    if (!def || !def.type) return value;
    if (def.type === 'boolean') return !!value;
    if (def.type === 'number') return Number(value) || 0;
    if (def.type === 'string') return String(value);
    return value;
  }

  function findProjectRoomDefinition(roomId) {
    const rooms = gameState.projectData && gameState.projectData.rooms;
    if (!Array.isArray(rooms)) return null;
    const key = String(roomId || '');
    return rooms.find(r => String(r.id) === key || String(r.name) === key) || null;
  }

  async function initializeVariables(variablesData) {
    if (!variablesData) return;

    gameState.variableDefinitions = new Map();

    // Inizializza variabili dalle definizioni
    if (variablesData.definitions && Array.isArray(variablesData.definitions)) {
      variablesData.definitions.forEach(def => {
        if (def.name) {
          gameState.variableDefinitions.set(def.name, def);
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

    // Inventory (background, toggle icon, item images)
    const invData = projectData.inventory;
    if (invData && typeof invData === 'object' && !Array.isArray(invData)) {
      if (invData.background && typeof invData.background === 'string') {
        assetsWithCategory.set(invData.background, { category: 'gui', roomName: null, characterName: null });
      }
      if (invData.toggleIcon && typeof invData.toggleIcon === 'string') {
        assetsWithCategory.set(invData.toggleIcon, { category: 'gui', roomName: null, characterName: null });
      }
      if (Array.isArray(invData.items)) {
        invData.items.forEach(item => {
          if (item && item.image && typeof item.image === 'string') {
            assetsWithCategory.set(item.image, { category: 'gui', roomName: null, characterName: null });
          }
        });
      }
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
    log(`[Runtime] Found ${assetStats.total} unique asset(s) to load`, 'info');

    if (assetStats.total === 0) {
      log('[Runtime] No assets to load', 'info');
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
        log(`[Runtime] ✗ Error loading asset ${src.substring(0, 50)}${src.length > 50 ? '...' : ''}: ${error.message}`, 'warning');
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
      log('No project loaded', 'error');
      return;
    }

    const room = gameState.projectData.rooms.find(r => r.id === roomId || r.name === roomId);
    if (!room) {
      log(`Room not found: ${roomId}`, 'error');
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
        log(`[Runtime] Background not found in registry for room ${roomId}, URL: ${room.background.substring(0, 50)}`, 'warning');
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
            log(`[Runtime] Foreground not found in registry for room ${roomId}, URL: ${fg.image.substring(0, 50)}`, 'warning');
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
              visible: typeof objData.visible === 'boolean' ? objData.visible : true,
              enabled: typeof objData.enabled === 'boolean' ? objData.enabled : true,
              rotationRad: Number(objData.rotationRad) || 0,
              scaleX: Number(objData.scaleX) > 0 ? Number(objData.scaleX) : 1,
              scaleY: Number(objData.scaleY) > 0 ? Number(objData.scaleY) : 1
            });
          } else {
            log(`[Runtime] Object image not found in registry: ${objData.id} (${objData.image.substring(0, 50)})`, 'warning');
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
            // No script associato
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

    log(`[Runtime] Room changed: ${roomId} (bg: ${backgroundImg ? 'ok' : 'missing'}, fg: ${foregrounds.length}, obj: ${objects.length}, hotspots: ${hotspots.length})`, 'info');
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
      log('[Runtime] No characters to load', 'info');
      return;
    }

      log(`[Runtime] Loading ${charactersData.length} character definition(s)...`, 'info');
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
                  log(`[Runtime] Frame character not found in registry: ${characterName}/${dir} (${frame.substring(0, 50)})`, 'warning');
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

    log(`[Runtime] Character definitions loaded: ${gameState.characterDefinitions.size} character(s)`, 'success');
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
      
      // Usa le posizioni di rendering per movimento fluido
      let drawX = character.renderX !== undefined ? character.renderX : character.x;
      let drawY = character.renderY !== undefined ? character.renderY : character.y;
      
      // If character has a pivot, adjust drawing position
      if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
        drawX = drawX - (charDef.pivotX * scale);
        drawY = drawY - (charDef.pivotY * scale);
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
      log(`[Runtime] Error rendering placeholder per character ${character.id}: ${error.message}`, 'warning');
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
   * Trova una direzione alternativa disponibile quando la direzione richiesta non ha frame
   * Restituisce la direzione originale se disponibile, altrimenti una direzione alternativa
   */
  function findAvailableDirection(charDef, preferredDirection) {
    // Se la direzione preferita è disponibile, usala
    if (charDef.directions[preferredDirection]) {
      const dirData = charDef.directions[preferredDirection];
      if (dirData.frames && dirData.frames.length > 0) {
        return preferredDirection;
      }
    }
    
    // Cerca tra le direzioni alternative (fallback)
    const fallbackDirections = directionFallbackMap[preferredDirection] || ['south', 'north', 'east', 'west'];
    for (const fallbackDir of fallbackDirections) {
      if (charDef.directions[fallbackDir]) {
        const dirData = charDef.directions[fallbackDir];
        if (dirData.frames && dirData.frames.length > 0) {
          return fallbackDir;
        }
      }
    }
    
    // Se non troviamo nulla tra le direzioni simili, prova tutte le direzioni disponibili
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
      
      for (const dir of sortedDirections) {
        const dirData = charDef.directions[dir];
        if (dirData.frames && dirData.frames.length > 0) {
          return dir;
        }
      }
    }
    
    // Se non c'è nessuna direzione disponibile, restituisci quella preferita (sarà gestita altrove)
    return preferredDirection;
  }

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
      log('[Runtime] No GUI to load', 'info');
      return;
    }

    log(`[Runtime] Loading ${guisData.length} GUI(s)...`, 'info');

    for (const guiData of guisData) {
      // Recupera background dalla AssetRegistry
      let backgroundImg = null;
      if (guiData.background && typeof guiData.background === 'string') {
        backgroundImg = AssetRegistry.images.get(guiData.background);
        if (!backgroundImg || !backgroundImg.complete) {
          log(`[Runtime] Background GUI not found in registry: ${guiData.id} (${guiData.background.substring(0, 50)})`, 'warning');
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
              log(`[Runtime] Immagine pulsante not found in registry: ${btnData.id} (${btnData.backgroundImage.substring(0, 50)})`, 'warning');
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

    log(`[Runtime] GUI loading complete: ${guisData.length} GUI(s) loaded`, 'success');
  }

  // ============================================
  // GESTIONE INVENTARIO
  // ============================================
  function createEmptyInventoryState() {
    return {
      enabled: false,
      displayMode: 'popup',
      popupEdgeHeight: 48,
      panel: { x: 0, y: 0, w: 800, h: 600 },
      background: null,
      toggleIcon: null,
      toggleIconBounds: { x: 744, y: 544, w: 48, h: 48 },
      toggleIconRect: null,
      slots: [],
      itemDefs: new Map(),
      contents: new Map(),
      visible: false
    };
  }

  function normalizeInventoryDisplayMode(mode) {
    const m = String(mode || 'popup').toLowerCase();
    return (m === 'always' || m === 'toggle' || m === 'popup') ? m : 'popup';
  }

  function defaultRuntimeInventoryPanel() {
    const w = canvas ? canvas.width : 800;
    const h = canvas ? canvas.height : 600;
    return { x: 0, y: 0, w, h };
  }

  function defaultRuntimeToggleIconBounds() {
    const w = canvas ? canvas.width : 800;
    const h = canvas ? canvas.height : 600;
    const size = 48;
    const margin = 8;
    return {
      x: Math.max(0, w - size - margin),
      y: Math.max(0, h - size - margin),
      w: size,
      h: size
    };
  }

  function normalizeRuntimeInventoryRect(rect, fallback) {
    const fb = fallback || { x: 0, y: 0, w: 1, h: 1 };
    return {
      x: Math.round(Number(rect && rect.x != null ? rect.x : fb.x) || 0),
      y: Math.round(Number(rect && rect.y != null ? rect.y : fb.y) || 0),
      w: Math.max(1, Math.round(Number(rect && rect.w != null ? rect.w : fb.w) || fb.w)),
      h: Math.max(1, Math.round(Number(rect && rect.h != null ? rect.h : fb.h) || fb.h))
    };
  }

  function loadInventory(invData) {
    gameState.inventory = createEmptyInventoryState();
    const inv = gameState.inventory;

    if (!invData) {
      return;
    }

    const itemSources = [];
    if (Array.isArray(invData)) {
      itemSources.push(...invData);
    } else if (typeof invData === 'object') {
      inv.displayMode = normalizeInventoryDisplayMode(invData.displayMode);
      inv.popupEdgeHeight = Math.max(16, Math.min(200, Number(invData.popupEdgeHeight) || 48));
      inv.panel = normalizeRuntimeInventoryRect(invData.panel, defaultRuntimeInventoryPanel());
      inv.toggleIconBounds = normalizeRuntimeInventoryRect(
        invData.toggleIconBounds,
        defaultRuntimeToggleIconBounds()
      );
      if (invData.background && typeof invData.background === 'string') {
        inv.background = AssetRegistry.images.get(invData.background) || null;
      }
      if (invData.toggleIcon && typeof invData.toggleIcon === 'string') {
        inv.toggleIcon = AssetRegistry.images.get(invData.toggleIcon) || null;
      }
      if (Array.isArray(invData.slots)) {
        inv.slots = invData.slots.map(s => ({
          id: s.id,
          name: s.name || 'Slot',
          x: Number(s.x) || 0,
          y: Number(s.y) || 0,
          w: Number(s.w) || 0,
          h: Number(s.h) || 0
        }));
      }
      if (Array.isArray(invData.items)) {
        itemSources.push(...invData.items);
      }
    } else {
      return;
    }

    itemSources.forEach(item => {
      if (!item) return;
      const id = String(item.id || item.name || '').trim();
      if (!id) return;
      let image = null;
      if (item.image && typeof item.image === 'string') {
        image = AssetRegistry.images.get(item.image) || null;
      }
      inv.itemDefs.set(id, {
        id,
        name: item.name || id,
        scriptName: item.scriptName || item.name || id,
        image
      });
      if (item.name && item.name !== id) {
        inv.itemDefs.set(String(item.name), inv.itemDefs.get(id));
      }
      if (item.scriptName) {
        inv.itemDefs.set(String(item.scriptName), inv.itemDefs.get(id));
      }
    });

    const hasLayout = !!(inv.background || inv.slots.length > 0);
    inv.enabled = hasLayout || inv.itemDefs.size > 0;
    inv.visible = inv.displayMode === 'always';
    updateInventoryToggleIconRect();

        log(`[Runtime] Inventory loaded (mode: ${inv.displayMode}, slots: ${inv.slots.length}, items: ${inv.itemDefs.size})`, 'info');
  }

  function updateInventoryToggleIconRect() {
    const inv = gameState.inventory;
    if (!inv) {
      return;
    }
    if (!inv.toggleIconBounds) {
      inv.toggleIconBounds = defaultRuntimeToggleIconBounds();
    }
    inv.toggleIconRect = { ...inv.toggleIconBounds };
  }

  function updateInventoryVisibilityFromPointer(canvasY, inCanvas) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled) return;
    if (inv.displayMode === 'always') {
      inv.visible = true;
      return;
    }
    if (inv.displayMode === 'popup') {
      const edge = inv.popupEdgeHeight || 48;
      inv.visible = !!(inCanvas && canvasY >= canvas.height - edge);
    }
  }

  function resolveInventoryItemDef(itemKey) {
    const inv = gameState.inventory;
    if (!inv) return null;
    const key = String(itemKey || '').trim();
    if (!key) return null;
    return inv.itemDefs.get(key) || null;
  }

  /** Chiave canonica per gameState.inventory.contents (id definizione se noto). */
  function resolveInventoryContentKey(itemKey) {
    const def = resolveInventoryItemDef(itemKey);
    if (def && def.id) return def.id;
    return String(itemKey || '').trim();
  }

  function ensureInventoryState() {
    if (!gameState.inventory) {
      gameState.inventory = createEmptyInventoryState();
    }
    return gameState.inventory;
  }

  function getInventoryContentsList() {
    const inv = gameState.inventory;
    if (!inv) return [];
    const list = [];
    inv.contents.forEach((count, key) => {
      const c = Math.max(0, Number(count) || 0);
      if (c <= 0) return;
      const def = resolveInventoryItemDef(key);
      list.push({ key, count: c, def });
    });
    return list;
  }

  function renderInventoryPanel(ctx) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || !inv.visible) return;

    const panel = inv.panel || defaultRuntimeInventoryPanel();
    if (inv.background && inv.background.complete && inv.background.naturalWidth > 0) {
      try {
        ctx.drawImage(inv.background, panel.x, panel.y, panel.w, panel.h);
      } catch (error) {
        log(`[Runtime] Error rendering inventario background: ${error.message}`, 'warning');
      }
    }

    const contents = getInventoryContentsList();
    inv.slots.forEach((slot, index) => {
      const entry = contents[index];
      if (!entry || !entry.def || !entry.def.image) return;
      const img = entry.def.image;
      if (!img.complete || img.naturalWidth <= 0) return;
      try {
        ctx.drawImage(img, slot.x, slot.y, slot.w, slot.h);
      } catch (error) {
        log(`[Runtime] Error rendering item inventario: ${error.message}`, 'warning');
      }
    });
  }

  function renderInventoryToggleIcon(ctx) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || inv.displayMode !== 'toggle') return;
    if (!inv.toggleIcon || !inv.toggleIcon.complete || inv.toggleIcon.naturalWidth <= 0) return;
    updateInventoryToggleIconRect();
    const r = inv.toggleIconRect || inv.toggleIconBounds;
    if (!r) return;
    try {
      ctx.drawImage(inv.toggleIcon, r.x, r.y, r.w, r.h);
    } catch (error) {
      log(`[Runtime] Error rendering icona toggle inventario: ${error.message}`, 'warning');
    }
  }

  function renderInventory(ctx) {
    renderInventoryPanel(ctx);
    renderInventoryToggleIcon(ctx);
  }

  function handleInventoryToggleClick(x, y) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || inv.displayMode !== 'toggle') return false;
    const r = inv.toggleIconRect;
    if (!r) return false;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      inv.visible = !inv.visible;
      return true;
    }
    return false;
  }

  // ============================================
  // OGGETTI DI SCENA (runtime + Fase B.2)
  // ============================================
  function generateRuntimeObjectId() {
    return `scene_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createObjectPlaceholderCanvas() {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const t = c.getContext('2d');
    t.fillStyle = '#cc3333';
    t.fillRect(0, 0, 32, 32);
    t.fillStyle = '#ffffff';
    t.fillRect(4, 4, 24, 24);
    return c;
  }

  function getSceneObjectImageSize(obj) {
    if (!obj || !obj.img) return { w: 0, h: 0 };
    const rawW = obj.img.width || obj.img.naturalWidth || 0;
    const rawH = obj.img.height || obj.img.naturalHeight || 0;
    const scaleX = Number(obj.scaleX) > 0 ? Number(obj.scaleX) : 1;
    const scaleY = Number(obj.scaleY) > 0 ? Number(obj.scaleY) : 1;
    return { w: rawW * scaleX, h: rawH * scaleY };
  }

  function findRoomObject(objectIdOrName) {
    if (!gameState.currentRoom || !Array.isArray(gameState.currentRoom.objects)) {
      return null;
    }
    const key = String(objectIdOrName || '').trim();
    if (!key) return null;
    return gameState.currentRoom.objects.find(o => String(o.id) === key || String(o.name) === key) || null;
  }

  function isSceneObjectImageReady(obj) {
    if (!obj || !obj.img) return false;
    if (obj.img instanceof HTMLCanvasElement) return obj.img.width > 0 && obj.img.height > 0;
    return obj.img.complete && obj.img.naturalWidth > 0;
  }

  function drawSceneObject(ctx, obj) {
    if (!obj.visible || !isSceneObjectImageReady(obj)) return;
    const scaleX = Number(obj.scaleX) > 0 ? Number(obj.scaleX) : 1;
    const scaleY = Number(obj.scaleY) > 0 ? Number(obj.scaleY) : 1;
    const rawW = obj.img.width || obj.img.naturalWidth;
    const rawH = obj.img.height || obj.img.naturalHeight;
    const sw = rawW * scaleX;
    const sh = rawH * scaleY;
    const rot = Number(obj.rotationRad) || 0;

    try {
      if (rot !== 0) {
        const cx = obj.x + sw / 2;
        const cy = obj.y + sh / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.drawImage(obj.img, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
      } else if (scaleX !== 1 || scaleY !== 1) {
        ctx.drawImage(obj.img, obj.x, obj.y, sw, sh);
      } else {
        ctx.drawImage(obj.img, obj.x, obj.y);
      }
    } catch (error) {
      log(`[Runtime] Error rendering object ${obj.id}: ${error.message}`, 'warning');
    }
  }

  function isPointOnSceneObject(obj, x, y) {
    if (!obj.visible || !obj.enabled || !isSceneObjectImageReady(obj)) return false;
    const size = getSceneObjectImageSize(obj);
    return x >= obj.x && x <= obj.x + size.w && y >= obj.y && y <= obj.y + size.h;
  }

  // ============================================
  // COMPILAZIONE E CACHE SCRIPT
  // ============================================
  /** Handler estratti dagli script utente (compileScript / executeScriptHandler) */
  const SUPPORTED_SCRIPT_HANDLERS = [
    'on_game_start',
    'on_room_change',
    'on_object_click',
    'on_character_click',
    'on_hotspot_click',
    'on_gui_click'
  ];

  /**
   * Scope per esecuzione handler: API (getScriptApiBindings) + variabili di gioco.
   * Ricostruito a ogni invocazione così le variabili restano aggiornate dopo compile.
   */
  function buildHandlerExecutionScope() {
    const scriptScope = Object.create(null);

    getScriptApiBindings().forEach(binding => {
      scriptScope[binding.name] = binding.value;
    });

    Array.from(gameState.variables.keys()).forEach(varName => {
      const safeVarName = varName.replace(/[^a-zA-Z0-9_$]/g, '_');
      const attachVariable = key => {
        if (!key || Object.prototype.hasOwnProperty.call(scriptScope, key)) {
          return;
        }
        Object.defineProperty(scriptScope, key, {
          get: () => gameState.variables.get(varName),
          set: value => gameState.variables.set(varName, value),
          configurable: true,
          enumerable: true
        });
      };
      attachVariable(varName);
      if (safeVarName !== varName) {
        attachVariable(safeVarName);
      }
    });

    return scriptScope;
  }

  /**
   * Esegue un handler utente con with(scriptScope): API + variabili nello scope lessicale.
   */
  async function runHandlerWithExecutionScope(handlerFunc, args) {
    const scriptScope = buildHandlerExecutionScope();
    const runner = new Function(
      'scriptScope',
      'handlerFunc',
      'args',
      `
      return (async function() {
        with (scriptScope) {
          const result = handlerFunc.apply(scriptScope, args);
          if (result && typeof result.then === 'function') {
            return await result;
          }
          return result;
        }
      })();
      `
    );
    return await runner(scriptScope, handlerFunc, args);
  }

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
      
      // ⚠️ STRATEGIA DI ESTRAZIONE HANDLER:
      // Creiamo un contesto isolato dove eseguire lo script.
      // Le funzioni handler definite nello script vengono catturate dopo l'esecuzione.
      // Questo garantisce che il codice libero venga eseguito UNA SOLA VOLTA durante la compilazione.
      // ⚠️ PROTEZIONE: Creiamo wrapper "no-op" per gli handler durante la compilazione
      // per prevenire esecuzione accidentale se lo script chiama direttamente gli handler.
      
      // Crea un object per catturare gli handler definiti nello script
      const handlerContainer = {};

      // ⚠️ PRE-PROCESSING: Wrappiamo automaticamente gli handler come async per permettere await
      // Trasforma le definizioni di handler da function a async function
      let processedScriptContent = scriptContent;
      
      // Escape dei caratteri speciali per regex
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      SUPPORTED_SCRIPT_HANDLERS.forEach(handlerName => {
        const escapedName = escapeRegex(handlerName);
        
        // Pattern 1: handlerName = function(...) { ... }
        // Gestisce anche spazi variabili e caratteri speciali
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`(${escapedName}\\s*=\\s*)function\\s*\\(`, 'g'),
          '$1async function('
        );
        
        // Pattern 2: handlerName = async function(...) { ... } (già async, lascia invariato)
        // Non serve fare nulla
        
        // Pattern 3: handlerName = (...) => { ... }
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`(${escapedName}\\s*=\\s*)([^=]*?)\\s*=>\\s*{`, 'g'),
          '$1async $2 => {'
        );
        
        // Pattern 4: function handlerName(...) { ... } (dichiarazione funzione)
        // Questo è il pattern più importante per casi come "function on_hotspot_click(...)"
        // Usa il flag 'gm' per sostituire tutte le occorrenze e multiline
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`function\\s+${escapedName}\\s*\\(`, 'gm'),
          'async function ' + handlerName + '('
        );
        
        // Pattern 5: const handlerName = function(...) { ... }
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`(const|let|var)\\s+${escapedName}\\s*=\\s*function\\s*\\(`, 'g'),
          '$1 ' + handlerName + ' = async function('
        );
        
        // Pattern 6: const handlerName = (...) => { ... }
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`(const|let|var)\\s+${escapedName}\\s*=\\s*([^=]*?)\\s*=>\\s*{`, 'g'),
          '$1 ' + handlerName + ' = async $2 => {'
        );
      });
      
      // Log del preprocessing per debug
      if (processedScriptContent !== scriptContent) {
        log(`[Runtime] compileScript: Preprocessing applicato per permettere await negli handler`, 'info');
        // Log dettagliato per debug (solo se necessario)
        const diff = processedScriptContent.split('\n').filter((line, i) => 
          scriptContent.split('\n')[i] !== line
        );
        if (diff.length > 0) {
          log(`[Runtime] compileScript: Righe modificate: ${diff.length}`, 'info');
        }
      } else {
        // Se non ci sono modifiche, potrebbe essere che gli handler siano già async o usino una sintassi diversa
        log(`[Runtime] compileScript: Nessuna modifica al preprocessing (handler potrebbero essere già async o usare sintassi non supportata)`, 'warning');
      }
      
      const handlerExtractionBlock = SUPPORTED_SCRIPT_HANDLERS.map(h => `
          if (typeof ${h} === 'function') {
            handlerContainer['${h}'] = ${h};
          }
          `).join('');

      const compileBody = `
        try {
          (async () => {
            ${processedScriptContent}
            ${handlerExtractionBlock}
          })();
        } catch (e) {
          GameAPI.error('Script compile error: ' + (e && e.message ? e.message : String(e)));
        }
        `;

      const { fn: scriptFunction, args: scriptArgs } = buildScriptExecutor(compileBody, {
        handlerMode: 'noop',
        tailParamNames: ['handlerContainer']
      });
      scriptArgs.push(handlerContainer);
      scriptFunction(...scriptArgs);
      
      // Gli handler estratti sono ora in handlerContainer
      const extractedHandlers = handlerContainer;

      // Fase C: scope API + variabili (buildHandlerExecutionScope) a ogni invocazione handler
      const wrappedHandlers = {};
      for (const [handlerName, handlerFunc] of Object.entries(extractedHandlers)) {
        if (typeof handlerFunc === 'function') {
          wrappedHandlers[handlerName] = async function(...args) {
            try {
              return await runHandlerWithExecutionScope(handlerFunc, args);
            } catch (e) {
              log(
                `[Runtime] compileScript: Errore scope API/variabili per ${handlerName}: ${e.message}. Fallback globals.`,
                'warning'
              );
              const scriptScope = buildHandlerExecutionScope();
              const result = handlerFunc.apply(scriptScope, args);
              if (result && typeof result.then === 'function') {
                return await result;
              }
              return result;
            }
          };
        }
      }
      
      // Salva nella cache gli handler wrappati
      gameState.compiledScripts.set(scriptName, wrappedHandlers);
      
      const handlerCount = Object.keys(wrappedHandlers).length;
      log(`[Runtime] compileScript: Script '${scriptName}' compilato con successo (${handlerCount} handler, scope API+variabili)`, 'success');
      
      if (handlerCount === 0) {
        log(`[Runtime] compileScript: ATTENZIONE - Script '${scriptName}' non contiene handler definiti`, 'warning');
      }
      
      return wrappedHandlers;
    } catch (error) {
      log(`[Runtime] compileScript: Error compiling script '${scriptName}': ${error.message}`, 'error');
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
   * @returns {Function|null} Funzione handler o null se not found
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
          
          // ⚠️ GESTIONE PROMISE: Se l'handler restituisce una Promise (anche se non è async),
          // gestiscila correttamente per supportare await negli handler
          if (result && typeof result.then === 'function') {
            // È una Promise, gestiscila e resetta il flag quando completa
            return result.finally(() => {
              // Reset flag quando la Promise completa
              setTimeout(() => {
                tracker.set(executionKey, false);
                log(`[Runtime] getCompiledHandler: Handler '${handlerName}' (async) completato, flag reset (key: ${executionKey})`, 'info');
              }, 0);
            });
          } else {
            // Non è una Promise, reset flag immediatamente
            setTimeout(() => {
              tracker.set(executionKey, false);
              log(`[Runtime] getCompiledHandler: Handler '${handlerName}' completato, flag reset (key: ${executionKey})`, 'info');
            }, 0);
            return result;
          }
        } catch (error) {
          // Reset flag anche in caso di errore
          setTimeout(() => {
            tracker.set(executionKey, false);
            log(`[Runtime] getCompiledHandler: Handler '${handlerName}' errore, flag reset (key: ${executionKey})`, 'error');
          }, 0);
          throw error;
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

      const { fn: scriptFunction, args: scriptArgs } = buildScriptExecutor(
        `
        try {
          ${code}
        } catch (e) {
          GameAPI.error('Script error: ' + (e && e.message ? e.message : String(e)));
          throw e;
        }
        `,
        { handlerMode: 'real' }
      );
      scriptFunction(...scriptArgs);
    } catch (error) {
      log(`Error executing script ${scriptName}: ${error.message}`, 'error');
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
        const result = handlerFunction.apply(null, argsArray);
        if (result && typeof result.then === 'function') {
          await result;
        }

        log(`[Runtime] executeScriptHandler: Handler '${handlerName}' completato (ID: ${handlerId})`, 'info');
      } else {
        log(`[Runtime] executeScriptHandler: Handler '${handlerName}' not found nello script '${scriptName}'`, 'info');
      }
    } catch (error) {
      log(`[Runtime] executeScriptHandler: Error executing handler '${handlerName}': ${error.message}`, 'error');
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
        log(`Error in on_game_start handler: ${error.message}`, 'error');
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
        log(`Error in on_room_change handler: ${error.message}`, 'error');
      }
    }
  }

  async function executeObjectClickScripts(objectId, x, y) {
    // ⚠️ MODIFICATO: Esegui SOLO lo script specifico dell'object cliccato
    // Non eseguire script generici o script di altri oggetti
    
    // Esegui SOLO lo script collegato esplicitamente to object tramite attachments
    // Questo garantisce che ogni object esegua solo il proprio script, non quello di altri oggetti
    const objectScripts = gameState.attachments.objectScripts || {};
    if (typeof objectScripts === 'object' && objectScripts[objectId]) {
      const scriptName = objectScripts[objectId];
      if (gameState.scripts[scriptName]) {
        // ⚠️ Passa scriptName per garantire cache corretta
        await executeScriptHandler(gameState.scripts[scriptName], 'on_object_click', [objectId, x, y], scriptName);
        return; // Esegui SOLO lo script specifico dell'object, poi esci
      } else {
        log(`[executeObjectClickScripts] Script "${scriptName}" associato to object "${objectId}" not found`, 'warning');
      }
    } else {
      log(`[executeObjectClickScripts] No script associato to object "${objectId}"`, 'info');
    }
    
    // ⚠️ PRIORITÀ 2, 3 e 4 RIMOSSE: Non eseguire più script generici, scansioni o handler dinamici
    // Questo previene che script di altri oggetti vengano eseguiti quando si clicca su un object specifico
    // Ogni object deve avere il proprio script associato tramite attachments.objectScripts
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

  /**
   * Attende il completamento del movimento di un character
   * @param {string} characterId - ID del character
   * @returns {Promise} Promise che si risolve quando il movimento è completato
   */
  function waitForCharacterMovement(characterId) {
    return new Promise((resolve) => {
      const character = gameState.characters.get(characterId);
      if (!character || !character.isMoving) {
        // Il character non esiste o non si sta muovendo, risolvi immediatamente
        resolve();
        return;
      }

      // Polling per verificare quando il movimento è completato
      const checkInterval = setInterval(() => {
        const currentCharacter = gameState.characters.get(characterId);
        if (!currentCharacter || !currentCharacter.isMoving) {
          // Movimento completato
          clearInterval(checkInterval);
          resolve();
        }
      }, 50); // Controlla ogni 50ms

      // Timeout di sicurezza (max 30 secondi)
      setTimeout(() => {
        clearInterval(checkInterval);
        log(`[Runtime] waitForCharacterMovement: Timeout per character ${characterId}`, 'warning');
        resolve();
      }, 30000);
    });
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
      log(`[Runtime] [DEBUG] executeHotspotScript: ✗ Error executing script per hotspot ${hotspotId}: ${error.message}`, 'error');
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
      if (gameState.variables.has(name)) {
        return gameState.variables.get(name);
      }
      const def = getVariableDefinition(name);
      if (def && 'initialValue' in def) {
        return coerceVariableValue(def, def.initialValue);
      }
      return null;
    },

    setVariable: function(name, value) {
      if (typeof name !== 'string') {
        GameAPI.error('setVariable: name must be a string');
        return;
      }
      const def = getVariableDefinition(name);
      gameState.variables.set(name, coerceVariableValue(def, value));
    },

    getVar: function(key) {
      if (!key || typeof key !== 'string') {
        GameAPI.error('getVar: key must be a string');
        return undefined;
      }
      if (gameState.variables.has(key)) {
        return gameState.variables.get(key);
      }
      const def = getVariableDefinition(key);
      if (def && 'initialValue' in def) {
        return coerceVariableValue(def, def.initialValue);
      }
      return undefined;
    },

    setVar: function(key, value) {
      if (!key || typeof key !== 'string') {
        GameAPI.error('setVar: key must be a string');
        return false;
      }
      GameAPI.setVariable(key, value);
      return true;
    },

    hasVar: function(key) {
      if (!key || typeof key !== 'string') return false;
      if (gameState.variables.has(key)) return true;
      return !!getVariableDefinition(key);
    },

    toggleVar: function(key) {
      if (!key || typeof key !== 'string') {
        GameAPI.error('toggleVar: key must be a string');
        return false;
      }
      const current = GameAPI.getVar(key);
      if (typeof current === 'boolean') {
        GameAPI.setVar(key, !current);
        return true;
      }
      GameAPI.setVar(key, true);
      return true;
    },

    // Room
    getCurrentRoom: function() {
      return gameState.currentRoomId;
    },

    get_current_room: function() {
      return GameAPI.getCurrentRoom();
    },

    get_room_objects: function() {
      if (!gameState.currentRoom || !Array.isArray(gameState.currentRoom.objects)) {
        return [];
      }
      return gameState.currentRoom.objects.map(o => ({
        id: String(o.id || ''),
        name: String(o.name || ''),
        type: String(o.type || 'Interactive'),
        x: Number(o.x) || 0,
        y: Number(o.y) || 0,
        rotation: Number(o.rotationRad ? (o.rotationRad * 180 / Math.PI) : 0),
        scaleX: Number(o.scaleX) > 0 ? Number(o.scaleX) : 1,
        scaleY: Number(o.scaleY) > 0 ? Number(o.scaleY) : 1,
        visible: o.visible !== false,
        enabled: o.enabled !== false
      }));
    },

    set_room_background: function(imageUrlOrDataUrl) {
      if (!gameState.currentRoom) {
        GameAPI.error('set_room_background: no current room');
        return false;
      }

      const applyBackground = (img, srcKey) => {
        gameState.currentRoom.backgroundImg = img;
        if (srcKey) {
          gameState.currentRoom.background = srcKey;
        }
        const roomDef = findProjectRoomDefinition(gameState.currentRoomId);
        if (roomDef && srcKey) {
          roomDef.background = srcKey;
        }
        log('[Runtime] set_room_background: sfondo aggiornato', 'info');
      };

      const url = imageUrlOrDataUrl == null ? '' : String(imageUrlOrDataUrl).trim();
      if (!url) {
        gameState.currentRoom.backgroundImg = null;
        gameState.currentRoom.background = null;
        const roomDef = findProjectRoomDefinition(gameState.currentRoomId);
        if (roomDef) roomDef.background = null;
        log('[Runtime] set_room_background: sfondo rimosso', 'info');
        return true;
      }

      const cached = AssetRegistry.images.get(url);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        applyBackground(cached, url);
        return true;
      }

      loadImage(url).then(img => {
        if (!img) {
          GameAPI.error('set_room_background: image load failed');
          return;
        }
        applyBackground(img, url);
      }).catch(err => {
        GameAPI.error(`set_room_background: ${err && err.message ? err.message : err}`);
      });

      return true;
    },

    load_room: function(roomIdOrName, playerX, playerY, playerDirection) {
      if (typeof roomIdOrName !== 'string' && typeof roomIdOrName !== 'number') {
        GameAPI.error('load_room: roomIdOrName must be a string or number');
        return false;
      }
      
      // Cambia stanza
      changeRoom(String(roomIdOrName));
      
      // Se sono specificati parametri per il player, posizionalo
      if (playerX !== undefined && playerY !== undefined) {
        // Trova il player
        let player = null;
        let playerId = null;
        
        // Cerca il player tra i character
        for (const [id, char] of gameState.characters.entries()) {
          const charDef = gameState.characterDefinitions.get(char.name);
          const isPlayer = charDef && charDef.spawnSettings && charDef.spawnSettings.isPlayer === true;
          if (isPlayer) {
            player = char;
            playerId = id;
            break;
          }
        }
        
        if (player) {
          // Posiziona il player
          player.x = Number(playerX) || 0;
          player.y = Number(playerY) || 0;
          player.renderX = player.x;
          player.renderY = player.y;
          player.targetY = player.y;
          player.velocityY = 0;
          
          // Imposta direzione se specificata
          if (playerDirection !== undefined && playerDirection !== null) {
            const charDef = gameState.characterDefinitions.get(player.name);
            if (charDef && charDef.directions[playerDirection]) {
              player.direction = playerDirection;
              player.currentFrame = 0;
              player.frameTime = 0;
            } else {
              log(`[Runtime] load_room: Direzione "${playerDirection}" non disponibile per player "${player.name}"`, 'warning');
            }
          }
          
          log(`[Runtime] Player posizionato a (${player.x}, ${player.y}) in room ${roomIdOrName}${playerDirection ? ` con direzione "${playerDirection}"` : ''}`, 'info');
        } else {
          log(`[Runtime] load_room: Player not found, impossibile posizionare`, 'warning');
        }
      }
      
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
      // Sposta un object nella room corrente (con coda sequenziale)
      queueCommand(async () => {
        if (!gameState.currentRoom || !gameState.currentRoom.objects) {
          GameAPI.error('move_object: no current room or objects unavailable');
          return;
        }
        
        const obj = gameState.currentRoom.objects.find(o => o.id === String(objectId) || o.name === String(objectId));
        if (!obj) {
          GameAPI.error(`move_object: object ${objectId} not found`);
          return;
        }
        
        obj.x = Number(x) || 0;
        obj.y = Number(y) || 0;
        
        // Il rendering avviene automaticamente nel game loop
        log(`[Runtime] Object ${objectId} moved to (${obj.x}, ${obj.y})`, 'info');
      });
    },

    // Inventario (Fase B.1)
    add_to_inventory: function(itemId, quantity) {
      const key = resolveInventoryContentKey(itemId);
      const q = Math.max(1, Number(quantity) || 1);
      if (!key) {
        GameAPI.error('add_to_inventory: invalid itemId');
        return 0;
      }
      const inv = ensureInventoryState();
      const current = Number(inv.contents.get(key) || 0);
      const next = current + q;
      inv.contents.set(key, next);
      log(`[Runtime] add_to_inventory: +${q} × "${key}" (totale: ${next})`, 'info');
      return next;
    },

    remove_from_inventory: function(itemId, quantity) {
      const key = resolveInventoryContentKey(itemId);
      const q = Math.max(1, Number(quantity) || 1);
      if (!key) {
        GameAPI.error('remove_from_inventory: invalid itemId');
        return 0;
      }
      const inv = ensureInventoryState();
      const current = Number(inv.contents.get(key) || 0);
      const next = Math.max(0, current - q);
      if (next <= 0) {
        inv.contents.delete(key);
      } else {
        inv.contents.set(key, next);
      }
      log(`[Runtime] remove_from_inventory: -${q} × "${key}" (totale: ${next})`, 'info');
      return next;
    },

    has_item: function(itemId) {
      const key = resolveInventoryContentKey(itemId);
      if (!key) return false;
      const inv = gameState.inventory;
      if (!inv || !inv.contents) return false;
      return Number(inv.contents.get(key) || 0) > 0;
    },

    get_item_count: function(itemId) {
      const key = resolveInventoryContentKey(itemId);
      if (!key) return 0;
      const inv = gameState.inventory;
      if (!inv || !inv.contents) return 0;
      return Number(inv.contents.get(key) || 0);
    },

    clear_inventory: function() {
      const inv = ensureInventoryState();
      inv.contents.clear();
      log('[Runtime] clear_inventory: inventario svuotato', 'info');
      return true;
    },

    // Oggetti di scena (Fase B.2)
    spawn_object: function(objectNameOrId, x, y, imageUrlOrDataUrl) {
      if (!gameState.currentRoom) {
        GameAPI.error('spawn_object: no current room');
        return null;
      }
      if (!gameState.currentRoom.objects) {
        gameState.currentRoom.objects = [];
      }

      const name = String(objectNameOrId || '').trim() || 'Object';
      const objX = Number(x) || 0;
      const objY = Number(y) || 0;
      const id = generateRuntimeObjectId();

      const newObj = {
        id,
        name,
        type: 'Interactive',
        x: objX,
        y: objY,
        img: createObjectPlaceholderCanvas(),
        visible: true,
        enabled: true,
        rotationRad: 0,
        scaleX: 1,
        scaleY: 1
      };
      gameState.currentRoom.objects.push(newObj);

      const url = imageUrlOrDataUrl == null ? '' : String(imageUrlOrDataUrl).trim();
      if (url) {
        const cached = AssetRegistry.images.get(url);
        if (cached && cached.complete && cached.naturalWidth > 0) {
          newObj.img = cached;
        } else {
          loadImage(url).then(img => {
            if (!img) {
              GameAPI.error(`spawn_object: could not load image for "${name}"`);
              return;
            }
            const obj = findRoomObject(id);
            if (obj) obj.img = img;
          }).catch(err => {
            GameAPI.error(`spawn_object: ${err && err.message ? err.message : err}`);
          });
        }
      }

      log(`[Runtime] spawn_object: "${name}" (${id}) a (${objX}, ${objY})`, 'info');
      return id;
    },

    despawn_object: function(objectId) {
      if (!gameState.currentRoom || !Array.isArray(gameState.currentRoom.objects)) {
        GameAPI.error('despawn_object: no current room');
        return false;
      }
      const key = String(objectId || '').trim();
      if (!key) {
        GameAPI.error('despawn_object: invalid objectId');
        return false;
      }
      const before = gameState.currentRoom.objects.length;
      gameState.currentRoom.objects = gameState.currentRoom.objects.filter(
        o => String(o.id) !== key && String(o.name) !== key
      );
      const removed = before !== gameState.currentRoom.objects.length;
      if (removed) {
        log(`[Runtime] despawn_object: rimosso "${key}"`, 'info');
      } else {
        GameAPI.error(`despawn_object: object "${key}" not found`);
      }
      return removed;
    },

    rotate_object: function(objectId, degrees) {
      const obj = findRoomObject(objectId);
      if (!obj) {
        GameAPI.error(`rotate_object: object "${objectId}" not found`);
        return false;
      }
      const deg = Number(degrees) || 0;
      obj.rotationRad = deg * Math.PI / 180;
      log(`[Runtime] rotate_object: "${obj.id}" → ${deg}°`, 'info');
      return true;
    },

    scale_object: function(objectId, sx, sy) {
      const obj = findRoomObject(objectId);
      if (!obj) {
        GameAPI.error(`scale_object: object "${objectId}" not found`);
        return false;
      }
      let scaleX = Number(sx);
      let scaleY = (sy === undefined || sy === null) ? scaleX : Number(sy);
      if (!isFinite(scaleX)) scaleX = 1;
      if (!isFinite(scaleY)) scaleY = 1;
      obj.scaleX = Math.max(0.01, scaleX);
      obj.scaleY = Math.max(0.01, scaleY);
      log(`[Runtime] scale_object: "${obj.id}" → (${obj.scaleX}, ${obj.scaleY})`, 'info');
      return true;
    },

    set_object_visible: function(objectId, visible) {
      const obj = findRoomObject(objectId);
      if (!obj) {
        GameAPI.error(`set_object_visible: object "${objectId}" not found`);
        return false;
      }
      const v = !!visible;
      obj.visible = v;
      obj.enabled = v;
      log(`[Runtime] set_object_visible: "${obj.id}" → ${v}`, 'info');
      return true;
    },

    // Character API
    spawn_character: function(characterName, x, y, direction = 'south', characterId = null) {
      if (!characterName) {
        GameAPI.error('spawn_character: characterName is required');
        return null;
      }

      const charDef = gameState.characterDefinitions.get(characterName);
      if (!charDef) {
        GameAPI.error(`spawn_character: character "${characterName}" not found in definitions`);
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
        log(`[Runtime] Character "${characterName}": moveSpeed not found nelle spawnSettings, uso default: 100`, 'info');
      }

      const character = {
        id: id,
        name: characterName,
        x: Number(x) || 0,
        y: Number(y) || 0,
        // Posizioni frazionarie per movimento fluido (sub-pixel rendering)
        renderX: Number(x) || 0,
        renderY: Number(y) || 0,
        direction: direction,
        currentFrame: 0,
        frameTime: 0,
        visible: true,
        roomId: gameState.currentRoomId,
        isMoving: false,
        path: null,
        moveSpeed: moveSpeed, // pixel per secondo
        // Smoothing per movimento verticale più fluido
        velocityY: 0,
        targetY: Number(y) || 0
      };

      gameState.characters.set(id, character);
      log(`[Runtime] Character "${characterName}" spawnato a (${x}, ${y}) con direzione "${direction}"`, 'info');
      return id;
    },

    move_character: function(characterIdOrName, x, y) {
      // Prova prima a cercare per ID
      let character = gameState.characters.get(characterIdOrName);
      let characterId = characterIdOrName;
      
      // Se not found per ID, cerca per nome (trova il primo character con quel nome nella room corrente)
      if (!character) {
        for (const [id, char] of gameState.characters.entries()) {
          if (char.name === characterIdOrName && char.roomId === gameState.currentRoomId) {
            character = char;
            characterId = id;
            break;
          }
        }
      }
      
      if (!character) {
        GameAPI.error(`move_character: character "${characterIdOrName}" not found (by ID or name in current room)`);
        return;
      }

      character.x = Number(x) || 0;
      character.y = Number(y) || 0;
      // Aggiorna anche le posizioni di rendering per movimento fluido
      character.renderX = character.x;
      character.renderY = character.y;
      character.targetY = character.y;
      character.velocityY = 0;
      log(`[Runtime] Character ${characterId} moved to (${character.x}, ${character.y})`, 'info');
    },

    /**
     * Fa camminare un character verso una posizione usando pathfinding
     * @param {string} characterIdOrName - ID del character (da spawn_character) o nome del character
     * @param {number} x - Coordinata X target
     * @param {number} y - Coordinata Y target
     * @param {boolean} waitForCompletion - Se true, attende il completamento del movimento (default: true)
     * @returns {Promise} Promise che si risolve quando il movimento è completato (se waitForCompletion è true)
     */
    walk_character: function(characterIdOrName, x, y, waitForCompletion = true) {
      // Prova prima a cercare per ID
      let character = gameState.characters.get(characterIdOrName);
      let characterId = characterIdOrName;
      
      // Se not found per ID, cerca per nome (trova il primo character con quel nome nella room corrente)
      if (!character) {
        for (const [id, char] of gameState.characters.entries()) {
          if (char.name === characterIdOrName && char.roomId === gameState.currentRoomId) {
            character = char;
            characterId = id;
            break;
          }
        }
      }
      
      if (!character) {
        GameAPI.error(`walk_character: character "${characterIdOrName}" not found (by ID or name in current room)`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" not found`));
      }

      // Verifica che il character sia nella room corrente
      if (character.roomId !== gameState.currentRoomId) {
        GameAPI.error(`walk_character: character "${characterIdOrName}" is not in the current room`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" non è nella room corrente`));
      }

      // Verifica che ci sia una walkable area
      const walkableArea = gameState.currentRoom?.walkableArea;
      if (!walkableArea || !Array.isArray(walkableArea) || walkableArea.length < 3) {
        GameAPI.error(`walk_character: no walkable area defined for this room`);
        return Promise.reject(new Error(`No walkable area defined for this room`));
      }

      // Inizializza proprietà movimento se mancanti
      if (character.isMoving === undefined) character.isMoving = false;
      if (character.path === undefined) character.path = null;
      if (character.pathIndex === undefined) character.pathIndex = 0;
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

      // Verifica che il character abbia un pivot (necessario per il pathfinding)
      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || charDef.pivotX === undefined || charDef.pivotY === undefined) {
        GameAPI.error(`walk_character: character "${characterIdOrName}" has no pivot defined`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" non ha un pivot definito`));
      }

      // Calcola la posizione del pivot del character
      const characterPivotX = character.x;
      const characterPivotY = character.y;

      // Verifica se il pivot del character è sulla walkable area
      if (!isPointInPolygon(walkableArea, characterPivotX, characterPivotY)) {
        GameAPI.error(`walk_character: character "${characterIdOrName}" is not on the walkable area`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" non è sulla walkable area`));
      }

      // Se il click è molto vicino al pivot, sposta il target di una distanza minima
      let targetX = Number(x) || 0;
      let targetY = Number(y) || 0;
      const distanceToTarget = Math.sqrt((targetX - characterPivotX) ** 2 + (targetY - characterPivotY) ** 2);
      const minMovementDistance = 20; // Distanza minima per garantire movimento visibile

      if (distanceToTarget < minMovementDistance && distanceToTarget > 0.1) {
        // Normalizza il vettore direzione
        const dx = targetX - characterPivotX;
        const dy = targetY - characterPivotY;
        const normalizedDx = dx / distanceToTarget;
        const normalizedDy = dy / distanceToTarget;

        // Sposta il target di almeno minMovementDistance pixel nella direzione del target
        targetX = characterPivotX + normalizedDx * minMovementDistance;
        targetY = characterPivotY + normalizedDy * minMovementDistance;
      }

      // Calcola il path
      let path = findPathOnWalkableArea(characterPivotX, characterPivotY, targetX, targetY, walkableArea);

      // Se il pathfinding fallisce, trova comunque il punto più vicino sulla walkable area
      if (!path || path.length === 0) {
        // Trova il punto più vicino sul bordo della walkable area se il target è fuori
        if (!isPointInPolygon(walkableArea, targetX, targetY)) {
          const closestPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
          if (closestPoint) {
            targetX = closestPoint.x;
            targetY = closestPoint.y;
          }
        }

        // Trova una posizione sicura vicino al target
        const safeTarget = findSafePositionNearTarget(targetX, targetY, characterPivotX, characterPivotY, walkableArea, 50);

        // Crea un percorso diretto verso il punto sicuro più vicino
        if (isPointInPolygon(walkableArea, safeTarget.x, safeTarget.y)) {
          path = [{ x: safeTarget.x, y: safeTarget.y }];
        } else {
          // Se anche questo fallisce, prova almeno il punto più vicino sul bordo
          const fallbackPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
          if (fallbackPoint && isPointInPolygon(walkableArea, fallbackPoint.x, fallbackPoint.y)) {
            path = [{ x: fallbackPoint.x, y: fallbackPoint.y }];
          }
        }
      }

      if (!path || path.length === 0) {
        GameAPI.error(`walk_character: could not find a valid path to (${Math.round(targetX)}, ${Math.round(targetY)})`);
        return Promise.reject(new Error(`Could not find a valid path`));
      }

      // Avvia il movimento del character (interrompe qualsiasi movimento in corso)
      const wasMoving = character.isMoving;
      character.isMoving = true;
      character.path = path;
      character.pathIndex = 0; // Inizia dal primo punto del path

      // Imposta la direzione iniziale verso il primo punto del path
      const firstTarget = path[0];
      const dx = firstTarget.x - characterPivotX;
      const dy = firstTarget.y - characterPivotY;
      character.direction = getDirectionFromVector(dx, dy);

      // Imposta il frame iniziale: se ci sono più di 1 frame, inizia dal frame 1 (non 0)
      if (charDef) {
        // Trova una direzione disponibile per i frame (la direzione logica potrebbe non avere frame)
        const availableDirection = findAvailableDirection(charDef, character.direction);
        if (availableDirection && charDef.directions[availableDirection]) {
          const dirData = charDef.directions[availableDirection];
          if (dirData.frames && dirData.frames.length > 1) {
            character.currentFrame = 1; // Inizia dal primo frame di movimento (escludendo idle)
          } else {
            character.currentFrame = 0;
          }
        } else {
          character.currentFrame = 0;
        }
      } else {
        character.currentFrame = 0;
      }
      character.frameTime = 0;

      if (wasMoving) {
        log(`[Runtime] walk_character: Character "${character.name}" (${characterId}) interrompe movimento in corso e si muove verso (${Math.round(targetX)}, ${Math.round(targetY)})`, 'info');
      } else {
        log(`[Runtime] walk_character: Character "${character.name}" (${characterId}) si muove verso (${Math.round(targetX)}, ${Math.round(targetY)})`, 'info');
      }

      // Se waitForCompletion è true, attende il completamento del movimento
      // Usa characterId (l'ID reale) per waitForCharacterMovement
      if (waitForCompletion) {
        return waitForCharacterMovement(characterId);
      } else {
        return Promise.resolve();
      }
    },

    set_character_direction: function(characterIdOrName, direction) {
      // Prova prima a cercare per ID
      let character = gameState.characters.get(characterIdOrName);
      let characterId = characterIdOrName;
      
      // Se not found per ID, cerca per nome (trova il primo character con quel nome nella room corrente)
      if (!character) {
        for (const [id, char] of gameState.characters.entries()) {
          if (char.name === characterIdOrName && char.roomId === gameState.currentRoomId) {
            character = char;
            characterId = id;
            break;
          }
        }
      }
      
      if (!character) {
        GameAPI.error(`set_character_direction: character "${characterIdOrName}" not found (by ID or name in current room)`);
        return;
      }

      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || !charDef.directions[direction]) {
        GameAPI.error(`set_character_direction: direction "${direction}" not available for character "${character.name}"`);
        return;
      }

      character.direction = direction;
      character.currentFrame = 0; // Reset frame quando cambia direzione
      character.frameTime = 0;
      log(`[Runtime] Character ${characterId} direzione cambiata a "${direction}"`, 'info');
    },

    animate_character: function(characterIdOrName, enabled = true) {
      // Prova prima a cercare per ID
      let character = gameState.characters.get(characterIdOrName);
      let characterId = characterIdOrName;
      
      // Se not found per ID, cerca per nome (trova il primo character con quel nome nella room corrente)
      if (!character) {
        for (const [id, char] of gameState.characters.entries()) {
          if (char.name === characterIdOrName && char.roomId === gameState.currentRoomId) {
            character = char;
            characterId = id;
            break;
          }
        }
      }
      
      if (!character) {
        GameAPI.error(`animate_character: character "${characterIdOrName}" not found (by ID or name in current room)`);
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

  // ============================================
  // SCRIPT API — binding unificato (compileScript / window)
  // ============================================
  function bindGameApiMethod(api, methodName) {
    const fn = api[methodName];
    return typeof fn === 'function' ? fn.bind(api) : fn;
  }

  /**
   * Elenco unico delle API esposte agli script (parametri di new Function + window).
   * Estendere solo qui quando si aggiungono nuove funzioni a GameAPI.
   */
  function getScriptApiBindings() {
    const api = GameAPI;
    return [
      { name: 'Game', value: api },
      { name: 'GameAPI', value: api },
      { name: 'print', value: bindGameApiMethod(api, 'print') },
      { name: 'log', value: bindGameApiMethod(api, 'log') },
      { name: 'getVariable', value: bindGameApiMethod(api, 'getVariable') },
      { name: 'setVariable', value: bindGameApiMethod(api, 'setVariable') },
      { name: 'get_var', value: bindGameApiMethod(api, 'getVar') },
      { name: 'set_var', value: bindGameApiMethod(api, 'setVar') },
      { name: 'has_var', value: bindGameApiMethod(api, 'hasVar') },
      { name: 'toggle_var', value: bindGameApiMethod(api, 'toggleVar') },
      { name: 'getCurrentRoom', value: bindGameApiMethod(api, 'getCurrentRoom') },
      { name: 'get_current_room', value: bindGameApiMethod(api, 'get_current_room') },
      { name: 'get_room_objects', value: bindGameApiMethod(api, 'get_room_objects') },
      { name: 'set_room_background', value: bindGameApiMethod(api, 'set_room_background') },
      { name: 'load_room', value: bindGameApiMethod(api, 'load_room') },
      { name: 'enableObject', value: bindGameApiMethod(api, 'enableObject') },
      { name: 'disableObject', value: bindGameApiMethod(api, 'disableObject') },
      { name: 'move_object', value: bindGameApiMethod(api, 'move_object') },
      { name: 'add_to_inventory', value: bindGameApiMethod(api, 'add_to_inventory') },
      { name: 'remove_from_inventory', value: bindGameApiMethod(api, 'remove_from_inventory') },
      { name: 'has_item', value: bindGameApiMethod(api, 'has_item') },
      { name: 'get_item_count', value: bindGameApiMethod(api, 'get_item_count') },
      { name: 'clear_inventory', value: bindGameApiMethod(api, 'clear_inventory') },
      { name: 'spawn_object', value: bindGameApiMethod(api, 'spawn_object') },
      { name: 'despawn_object', value: bindGameApiMethod(api, 'despawn_object') },
      { name: 'rotate_object', value: bindGameApiMethod(api, 'rotate_object') },
      { name: 'scale_object', value: bindGameApiMethod(api, 'scale_object') },
      { name: 'set_object_visible', value: bindGameApiMethod(api, 'set_object_visible') },
      { name: 'showText', value: bindGameApiMethod(api, 'showText') },
      { name: 'show_message', value: bindGameApiMethod(api, 'show_message') },
      { name: 'spawn_character', value: bindGameApiMethod(api, 'spawn_character') },
      { name: 'move_character', value: bindGameApiMethod(api, 'move_character') },
      { name: 'walk_character', value: bindGameApiMethod(api, 'walk_character') },
      { name: 'set_character_direction', value: bindGameApiMethod(api, 'set_character_direction') },
      { name: 'animate_character', value: bindGameApiMethod(api, 'animate_character') }
    ];
  }

  function createNoOpHandler(handlerName) {
    return function() {
      log(`[Runtime] compileScript: Chiamata a ${handlerName} ignorata durante compilazione (previene doppia esecuzione)`, 'warning');
    };
  }

  /**
   * Costruisce new Function(...) con parametri API allineati a getScriptApiBindings().
   * @param {string} scriptBody - Corpo della funzione generata
   * @param {{ handlerMode?: 'none'|'noop'|'real', tailParamNames?: string[] }} options
   */
  function buildScriptExecutor(scriptBody, options) {
    const handlerMode = options.handlerMode || 'none';
    const tailParamNames = options.tailParamNames || [];

    const apiBindings = getScriptApiBindings();
    const apiNames = apiBindings.map(b => b.name);
    const apiArgs = apiBindings.map(b => b.value);

    let handlerNames = [];
    let handlerArgs = [];

    if (handlerMode === 'noop' || handlerMode === 'real') {
      handlerNames = SUPPORTED_SCRIPT_HANDLERS.slice();
      if (handlerMode === 'noop') {
        handlerArgs = handlerNames.map(createNoOpHandler);
      } else {
        const api = GameAPI;
        handlerArgs = handlerNames.map(h => bindGameApiMethod(api, h));
      }
    }

    const paramNames = [...apiNames, ...handlerNames, ...tailParamNames];
    const args = [...apiArgs, ...handlerArgs];

    const fn = new Function(...paramNames, scriptBody);
    return { fn, args, paramNames };
  }

  /** Espone su window le stesse API usate da compileScript (compatibilità script legacy). */
  function exposeScriptGlobals() {
    const api = GameAPI;
    window.GameAPI = api;
    window.Game = api;

    getScriptApiBindings().forEach(binding => {
      if (binding.name === 'Game' || binding.name === 'GameAPI') {
        return;
      }
      window[binding.name] = binding.value;
    });

    window.print = function() {
      api.print.apply(api, arguments);
    };

    window.walk_character = function(characterId, x, y, waitForCompletion) {
      const wait = waitForCompletion !== false;
      if (wait) {
        return queueCommand(async () => {
          await api.walk_character(characterId, x, y, true);
        });
      }
      return api.walk_character(characterId, x, y, false);
    };

    SUPPORTED_SCRIPT_HANDLERS.forEach(handlerName => {
      window[handlerName] = function(handler) {
        api[handlerName](handler);
      };
    });
  }

  exposeScriptGlobals();

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
          log(`[Runtime] Error rendering background: ${error.message}`, 'warning');
        }
      }

      // Oggetti di scena (supporto scale/rotazione)
      if (room.objects && Array.isArray(room.objects)) {
        room.objects.forEach(obj => drawSceneObject(ctx, obj));
      }

      // Foregrounds - verifica che le immagini siano caricate e pronte
      if (room.foregrounds && Array.isArray(room.foregrounds)) {
        room.foregrounds.forEach(fg => {
          if (fg.img && fg.img.complete && fg.img.naturalWidth > 0) {
            try {
              ctx.drawImage(fg.img, fg.offsetX, fg.offsetY);
            } catch (error) {
              log(`[Runtime] Error rendering foreground: ${error.message}`, 'warning');
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
        
        // Calcola lo scaling basato sulla posizione Y di rendering (per movimento fluido)
        // Usa renderY invece di y per uno scaling più fluido durante il movimento
        const scale = calculateCharacterScale(character.renderY, room);
        
        const frame = getCharacterFrame(character.name, character.direction, character.currentFrame);
        
        if (frame) {
          try {
            // Calcola dimensioni frame originali
            const frameWidth = frame instanceof HTMLCanvasElement ? frame.width : frame.width;
            const frameHeight = frame instanceof HTMLCanvasElement ? frame.height : frame.height;
            
            // Usa le posizioni di rendering (renderX, renderY) per movimento fluido con sub-pixel
            let drawX = character.renderX;
            let drawY = character.renderY;
            
            // If character has a pivot, adjust drawing position
            if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
              // The character.renderX e character.renderY rappresentano la posizione del pivot
              // Il pivot è relativo al frame originale, quindi calcoliamo l'offset considerando lo scaling
              drawX = character.renderX - (charDef.pivotX * scale);
              drawY = character.renderY - (charDef.pivotY * scale);
            } else {
              // Senza pivot, il character.renderX e renderY sono la posizione top-left
              drawX = character.renderX;
              drawY = character.renderY;
            }
            
            // Disegna il frame scalato
            const scaledWidth = frameWidth * scale;
            const scaledHeight = frameHeight * scale;
            
            // Abilita sub-pixel rendering per movimento più fluido
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Se è un canvas (frame specchiato), disegna il canvas
            if (frame instanceof HTMLCanvasElement) {
              ctx.drawImage(frame, drawX, drawY, scaledWidth, scaledHeight);
            } else {
              // Frame normale (Image)
              ctx.drawImage(frame, drawX, drawY, scaledWidth, scaledHeight);
            }
          } catch (error) {
            log(`[Runtime] Error rendering character ${character.id}: ${error.message}`, 'warning');
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
          log(`[Runtime] Error rendering GUI background ${gui.id}: ${error.message}`, 'warning');
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
                log(`[Runtime] Error rendering pulsante ${btn.id}: ${error.message}`, 'warning');
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

    renderInventory(ctx);
  }

  // ============================================
  // GAME LOOP
  // ============================================
  function update(deltaTime) {
    // Aggiorna movimento e animazioni dei character
    gameState.characters.forEach(character => {
      // Inizializza renderX/renderY se non esistono (retrocompatibilità)
      if (character.renderX === undefined) {
        character.renderX = character.x;
      }
      if (character.renderY === undefined) {
        character.renderY = character.y;
      }
      if (character.targetY === undefined) {
        character.targetY = character.y;
      }
      if (character.velocityY === undefined) {
        character.velocityY = 0;
      }
      
      if (!character.visible || character.roomId !== gameState.currentRoomId) {
        return;
      }

      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef) {
        return;
      }
      
      // Trova una direzione disponibile per i frame (la direzione logica potrebbe non avere frame)
      // Usa questa solo per l'animazione (fps, numero di frame), ma getCharacterFrame gestirà il fallback automaticamente
      let animationDirData = charDef.directions[character.direction];
      if (!animationDirData || !animationDirData.frames || animationDirData.frames.length === 0) {
        // La direzione logica non ha frame, trova una direzione alternativa per l'animazione
        const availableDirection = findAvailableDirection(charDef, character.direction);
        if (availableDirection && charDef.directions[availableDirection]) {
          animationDirData = charDef.directions[availableDirection];
        } else {
          // Nessuna direzione disponibile, non possiamo animare ma permettiamo il movimento
          return;
        }
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
          character.renderX = targetX;
          character.renderY = targetY;
          character.targetY = targetY;
          character.velocityY = 0;
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
          
          // Aggiorna posizione logica (per collisioni e pathfinding)
          character.x += normalizedDx * moveDistance;
          character.y += normalizedDy * moveDistance;
          
          // Sincronizza direttamente le posizioni di rendering con le posizioni logiche durante il movimento
          // Questo evita ritardi e mantiene X e Y sincronizzati
          character.renderX = character.x;
          character.renderY = character.y;
          character.targetY = character.y;

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
      if (animationDirData.frames.length === 1) {
        character.currentFrame = 0;
        return;
      }

      // Se il personaggio è fermo (idle), mostra solo il frame 0 (primo frame = posa idle)
      if (!character.isMoving) {
        character.currentFrame = 0;
        character.frameTime = 0;
        // Sincronizza posizioni di rendering quando fermo per evitare drift
        character.renderX = character.x;
        character.renderY = character.y;
        character.targetY = character.y;
        character.velocityY = 0;
        return;
      }

      // Il personaggio sta camminando: anima solo i frame 1..length-1 (escludendo frame 0)
      // Se currentFrame è 0 (idle), passa al primo frame di movimento (1)
      if (character.currentFrame === 0) {
        character.currentFrame = 1;
      }

      // Aggiorna frame time
      character.frameTime += deltaTime;
      const frameDuration = 1000 / animationDirData.fps; // Durata di ogni frame in ms

      // Avanza al frame successivo se necessario
      // Loop solo tra frame 1 e length-1 (escludendo frame 0)
      if (character.frameTime >= frameDuration) {
        character.currentFrame++;
        // Se abbiamo raggiunto l'ultimo frame, torna al primo frame di movimento (1)
        if (character.currentFrame >= animationDirData.frames.length) {
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
  let inventoryPointerHandler = null;
  let inventoryLeaveHandler = null;
  let clickHandledThisFrame = false; // Flag anti-double-fire per frame
  let lastClickTime = 0; // Timestamp ultimo click per debounce
  const CLICK_DEBOUNCE_MS = 50; // Debounce di 50ms tra click

  function canvasCoordsFromClientEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0, inCanvas: false };
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const inCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      inCanvas
    };
  }
  
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

    if (inventoryPointerHandler) {
      canvas.removeEventListener('mousemove', inventoryPointerHandler);
      canvas.removeEventListener('mouseleave', inventoryLeaveHandler);
    }
    inventoryPointerHandler = function(e) {
      if (!gameState.isRunning || !gameState.inventory || !gameState.inventory.enabled) return;
      const coords = canvasCoordsFromClientEvent(e);
      updateInventoryVisibilityFromPointer(coords.y, coords.inCanvas);
    };
    inventoryLeaveHandler = function() {
      const inv = gameState.inventory;
      if (!inv || !inv.enabled || inv.displayMode !== 'popup') return;
      inv.visible = false;
    };
    canvas.addEventListener('mousemove', inventoryPointerHandler, { passive: true });
    canvas.addEventListener('mouseleave', inventoryLeaveHandler, { passive: true });

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
    if (canvas && inventoryPointerHandler) {
      canvas.removeEventListener('mousemove', inventoryPointerHandler);
      inventoryPointerHandler = null;
    }
    if (canvas && inventoryLeaveHandler) {
      canvas.removeEventListener('mouseleave', inventoryLeaveHandler);
      inventoryLeaveHandler = null;
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

    if (handleInventoryToggleClick(x, y)) {
      return;
    }

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
      log(`[Runtime] handleClick: Verifica ${objectCount} object/i`, 'info');
      
      for (const obj of gameState.currentRoom.objects) {
        if (!obj.visible || !obj.enabled || !obj.img) {
          log(`[Runtime] handleClick: Oggetto ${obj.id} ignorato (visible=${obj.visible}, enabled=${obj.enabled}, img=${!!obj.img})`, 'info');
          continue;
        }

        const isInside = isPointOnSceneObject(obj, x, y);
        log(`[Runtime] handleClick: Oggetto ${obj.id} (${obj.name}): hit-test = ${isInside}`, 'info');

        if (isInside) {
          log(`[Runtime] handleClick: ✓ Click su object: ${obj.name} (${obj.id})`, 'success');
          await executeObjectClickScripts(obj.id, x, y);
          return;
        }
      }
      
      log(`[Runtime] handleClick: Nessun object colpito`, 'info');
    } else {
      log(`[Runtime] handleClick: Nessun object nella room corrente`, 'info');
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
      // Ignora il click se il character è il player principale
      const playerId = gameState.variables.get('playerId');
      if (playerId && clickedCharacter.id === playerId) {
        log(`[Runtime] handleClick: Click su player ignorato (${clickedCharacter.name})`, 'info');
        // Non ritornare, continua con il pathfinding
      } else {
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

    // Pathfinding: se non c'è stato click su hotspot/object/character/GUI, prova a muovere il player
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
          // Se il player si sta muovendo, usa la posizione corrente (sarà aggiornata durante il movimento)
          const playerPivotX = player.x;
          const playerPivotY = player.y;
          
          // Verifica se il pivot del player è sulla walkable area
          const walkableArea = gameState.currentRoom.walkableArea;
          if (walkableArea && Array.isArray(walkableArea) && walkableArea.length >= 3) {
            if (isPointInPolygon(walkableArea, playerPivotX, playerPivotY)) {
              // Il player è sulla walkable area, calcola il path verso il punto cliccato
              // Permetti di cliccare anche durante il movimento: interrompe il movimento corrente
              // e avvia un nuovo movimento verso il punto cliccato
              
              // Se il click è molto vicino al pivot, sposta il target di una distanza minima per garantire il movimento
              let targetX = x;
              let targetY = y;
              const distanceToClick = Math.sqrt((x - playerPivotX) ** 2 + (y - playerPivotY) ** 2);
              const minMovementDistance = 20; // Distanza minima per garantire movimento visibile
              
              if (distanceToClick < minMovementDistance && distanceToClick > 0.1) {
                // Normalizza il vettore direzione
                const dx = x - playerPivotX;
                const dy = y - playerPivotY;
                const normalizedDx = dx / distanceToClick;
                const normalizedDy = dy / distanceToClick;
                
                // Sposta il target di almeno minMovementDistance pixel nella direzione del click
                targetX = playerPivotX + normalizedDx * minMovementDistance;
                targetY = playerPivotY + normalizedDy * minMovementDistance;
              }
              
              let path = findPathOnWalkableArea(playerPivotX, playerPivotY, targetX, targetY, walkableArea);
              
              // Se il pathfinding fallisce, trova comunque il punto più vicino sulla walkable area
              if (!path || path.length === 0) {
                // Trova il punto più vicino sul bordo della walkable area se il click è fuori
                // (usa già targetX e targetY calcolati sopra, che includono la distanza minima se necessaria)
                if (!isPointInPolygon(walkableArea, targetX, targetY)) {
                  const closestPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
                  if (closestPoint) {
                    targetX = closestPoint.x;
                    targetY = closestPoint.y;
                  }
                }
                
                // Trova una posizione sicura vicino al target
                const safeTarget = findSafePositionNearTarget(targetX, targetY, playerPivotX, playerPivotY, walkableArea, 50);
                
                // Crea un percorso diretto verso il punto sicuro più vicino
                if (isPointInPolygon(walkableArea, safeTarget.x, safeTarget.y)) {
                  path = [{ x: safeTarget.x, y: safeTarget.y }];
                } else {
                  // Se anche questo fallisce, prova almeno il punto più vicino sul bordo
                  const fallbackPoint = findClosestPointOnWalkableEdge(targetX, targetY, walkableArea);
                  if (fallbackPoint && isPointInPolygon(walkableArea, fallbackPoint.x, fallbackPoint.y)) {
                    path = [{ x: fallbackPoint.x, y: fallbackPoint.y }];
                  }
                }
              }
              
              if (path && path.length > 0) {
                // Avvia il movimento del player (interrompe qualsiasi movimento in corso)
                const wasMoving = player.isMoving;
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
                if (charDef) {
                  // Trova una direzione disponibile per i frame (la direzione logica potrebbe non avere frame)
                  const availableDirection = findAvailableDirection(charDef, player.direction);
                  if (availableDirection && charDef.directions[availableDirection]) {
                    const dirData = charDef.directions[availableDirection];
                    if (dirData.frames && dirData.frames.length > 1) {
                      player.currentFrame = 1; // Inizia dal primo frame di movimento (escludendo idle)
                    } else {
                      player.currentFrame = 0;
                    }
                  } else {
                    player.currentFrame = 0;
                  }
                } else {
                  player.currentFrame = 0;
                }
                player.frameTime = 0;
                
                if (wasMoving) {
                  log(`[Runtime] Pathfinding: Player interrompe movimento in corso e si muove verso (${Math.round(targetX)}, ${Math.round(targetY)})`, 'info');
                } else {
                  log(`[Runtime] Pathfinding: Player si muove verso (${Math.round(targetX)}, ${Math.round(targetY)})`, 'info');
                }
                return;
              } else {
                log(`[Runtime] Pathfinding: Impossibile trovare un percorso valido verso (${Math.round(targetX)}, ${Math.round(targetY)})`, 'info');
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
        if (message.code && message.handlerName) {
          (async () => {
            try {
              const scriptName = message.scriptName || `run_script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await executeScriptHandler(message.code, message.handlerName, message.handlerArgs || [], scriptName);
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
        } else if (message.code) {
          log('[Runtime] RUN_SCRIPT ignorato: handlerName mancante', 'warning');
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
        gameState.variableDefinitions = new Map();
        gameState.objects.clear();
        gameState.guis.clear();
        gameState.inventory = createEmptyInventoryState();
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

