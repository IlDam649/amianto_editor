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
    scripts: {}, // script del progetto
    attachments: {}, // script collegati a eventi
    isRunning: false,
    lastFrameTime: 0,
    animationFrameId: null
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

  // ============================================
  // CARICAMENTO IMMAGINI
  // ============================================
  // Informazioni progetto per risolvere assetId
  let projectInfo = {
    userId: null,
    projectId: null
  };

  // Risolve un assetId in URL Supabase
  async function resolveAssetId(assetId, category) {
    try {
      log(`[Runtime] resolveAssetId chiamato: assetId=${assetId}, category=${category}`, 'info');
      
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
                log(`[Runtime] resolveAssetId: usando fileName da Firestore: '${data.fileName}', categoria '${category}' -> folder '${folder}'`, 'info');
                const url = window.supabaseStorage.getAssetPublicUrl(
                  userId, // Usa userId da Firebase Auth corrente
                  actualProjectId,
                  category, // Passa la categoria originale (getSupabaseFolderForType la mapperà internamente)
                  data.fileName // Usa il fileName esatto salvato in Firestore (include baseName)
                );
                if (url) {
                  log(`[Runtime] resolveAssetId: ✓ URL costruito da fileName Firestore: ${url}`, 'success');
                  return url;
                } else {
                  log(`[Runtime] resolveAssetId: ⚠️ fileName trovato ma URL non generato. fileName='${data.fileName}', category='${category}', folder='${folder}'`, 'warning');
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
        log(`[Runtime] resolveAssetId: ERRORE CRITICO - userId mancante. Gli asset sono salvati con userId nel path, impossibile risolvere senza userId.`, 'error');
        log(`[Runtime] resolveAssetId: Verifica che _meta.userId sia presente nel JSON del progetto o che Firebase Auth sia disponibile.`, 'error');
        return null; // Non provare path legacy, fallire in modo chiaro
      }
      log(`[Runtime] resolveAssetId: projectInfo disponibile (userId: ${projectInfo.userId.substring(0, 20)}..., projectId: ${actualProjectId.substring(0, 30)}...)`, 'info');

      // Prova con estensioni comuni e pattern alternativi
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      const folder = window.supabaseStorage.getSupabaseFolderForType ? window.supabaseStorage.getSupabaseFolderForType(category) : category;
      log(`[Runtime] resolveAssetId: folder=${folder}, testerò pattern alternativi`, 'info');

      // Pattern da provare (in ordine di probabilità basato su URL reale trovato)
      // IMPORTANTE: I fileName in Supabase sono generati come: ${assetId}_${baseName}.${ext}
      // Quindi se assetId è "asset_1766444323872_dtnhv7k", il fileName sarà "asset_1766444323872_dtnhv7k_${baseName}.png"
      // Ma proviamo anche pattern senza baseName per compatibilità
      const patterns = [
        // Pattern 1: assetId.ext (pattern più comune, come nell'URL reale: asset_1766438238305_wbpjsbf.png)
        // Questo funziona se il fileName è stato generato senza baseName o se il baseName è vuoto
        ...extensions.map(ext => `${assetId}.${ext}`),
        // Pattern 2: assetId_file.ext (pattern legacy)
        ...extensions.map(ext => `${assetId}_file.${ext}`),
        // Pattern 3: assetId_${category}.ext
        ...extensions.map(ext => `${assetId}_${category}.${ext}`),
        // Pattern 4: assetId_${normalizedCategory}.ext
        ...extensions.map(ext => `${assetId}_${folder}.${ext}`),
        // Pattern 5: Se assetId contiene già "asset_", proviamo anche senza quel prefisso
        // (per gestire casi dove l'assetId è stato salvato con prefisso ma il file no)
        ...(assetId.startsWith('asset_') ? extensions.map(ext => `${assetId.substring(6)}.${ext}`) : [])
      ];

      // Prova pattern e verifica se il file esiste effettivamente
      // NOTA: I pattern senza baseName potrebbero non funzionare se il file reale ha un baseName
      // Esempio: se il file è "asset_xxx_nomefile.png", il pattern "asset_xxx.png" non funzionerà
      log(`[Runtime] resolveAssetId: proverò ${patterns.length} pattern alternativi (senza baseName)`, 'info');
      log(`[Runtime] resolveAssetId: ⚠️ ATTENZIONE: Se il file ha un baseName, questi pattern potrebbero non funzionare.`, 'warning');
      log(`[Runtime] resolveAssetId: Soluzione: assicurati che Firestore abbia il fileName corretto per questo asset.`, 'warning');
      
      for (const fileName of patterns) {
        log(`[Runtime] resolveAssetId: tentativo fileName=${fileName}`, 'info');
        
        // Usa sempre userId (già verificato che esiste sopra)
        const url = window.supabaseStorage.getAssetPublicUrl(
          projectInfo.userId,
          actualProjectId,
          category,
          fileName
        );

        if (url) {
          log(`[Runtime] resolveAssetId: URL generato per ${fileName}: ${url.substring(0, 100)}...`, 'info');
          
          // Verifica se il file esiste effettivamente facendo una richiesta HEAD
          // NOTA: Con CORS potrebbe non funzionare, ma proviamo comunque
          try {
            log(`[Runtime] resolveAssetId: verifica esistenza file per ${fileName}...`, 'info');
            
            // Prova a verificare con una richiesta HEAD
            const testResponse = await fetch(url, { 
              method: 'HEAD',
              cache: 'no-cache',
              mode: 'cors' // Prova con CORS per leggere lo status
            }).catch(async () => {
              // Se CORS fallisce, prova senza CORS (ma non possiamo leggere lo status)
              log(`[Runtime] resolveAssetId: CORS fallito, provo senza CORS...`, 'info');
              return fetch(url, { method: 'HEAD', mode: 'no-cors' }).catch(() => null);
            });
            
            // Se la richiesta HEAD fallisce o restituisce 404, prova il prossimo pattern
            if (testResponse && testResponse.ok) {
              log(`[Runtime] resolveAssetId: ✓ File verificato esistente per ${fileName}`, 'success');
              return url;
            } else if (testResponse && testResponse.status === 404) {
              log(`[Runtime] resolveAssetId: ✗ File non trovato (404) per ${fileName}, provo prossimo pattern`, 'info');
              continue;
            } else {
              // Se non possiamo verificare (CORS o altro), restituiamo l'URL e lasciamo che loadImage verifichi
              // Questo è un fallback: loadImage verificherà se l'immagine si carica correttamente
              log(`[Runtime] resolveAssetId: ⚠️ Impossibile verificare esistenza file (CORS o altro), userò URL generato`, 'warning');
              log(`[Runtime] resolveAssetId: loadImage verificherà se l'immagine si carica correttamente: ${url}`, 'info');
              return url;
            }
          } catch (fetchError) {
            // Se la verifica fallisce, restituiamo l'URL comunque e lasciamo che loadImage verifichi
            log(`[Runtime] resolveAssetId: errore verifica file per ${fileName}: ${fetchError.message}`, 'warning');
            log(`[Runtime] resolveAssetId: userò URL generato e lascerò che loadImage verifichi: ${url}`, 'info');
            return url; // Restituiamo l'URL e lasciamo che loadImage verifichi
          }
        } else {
          log(`[Runtime] resolveAssetId: ✗ URL non generato per ${fileName}`, 'info');
        }
      }

      log(`[Runtime] resolveAssetId: ✗ Nessun URL generato con i pattern provati`, 'warning');
      return null;
    } catch (error) {
      log(`[Runtime] resolveAssetId: errore: ${error.message}`, 'error');
      console.error('Errore resolveAssetId:', error);
      return null;
    }
  }

  function loadImage(src, categoryHint = null) {
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
        log(`[Runtime] Risoluzione assetId: ${assetId}${categoryHint ? ` (categoria suggerita: ${categoryHint})` : ''}`, 'info');
        
        let resolvedUrl = null;
        
        // Se abbiamo un hint sulla categoria, proviamo prima quella
        if (categoryHint) {
          try {
            resolvedUrl = await resolveAssetId(assetId, categoryHint);
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
              resolvedUrl = await resolveAssetId(assetId, category);
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
      gameState.scripts = projectData.scripts || {};
      gameState.attachments = projectData.attachments || {};
      
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

      updateLoadingMessage('Caricamento room iniziale...');
      const startRoomId = settings.startRoom || settings.startRoomId || (projectData.rooms && projectData.rooms.length > 0 ? projectData.rooms[0].id : null);
      if (startRoomId) {
        await changeRoom(startRoomId);
      } else {
        log('[Runtime] Nessuna room iniziale specificata', 'warning');
      }

      updateLoadingMessage('Caricamento GUI...');
      await loadGUIs(projectData.guis || []);

      updateLoadingMessage('Esecuzione script iniziali...');
      await executeGameStartScripts();

      gameState.initialized = true;
      hideLoadingOverlay();

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
    
    // Usa una Map per associare asset alla loro categoria
    const assetsWithCategory = new Map(); // key: assetId/URL, value: category
    const assetStats = {
      total: 0,
      loaded: 0,
      failed: 0,
      skipped: 0
    };

    // Raccogli TUTTI gli asset con la loro categoria corretta
    // Room backgrounds e foregrounds
    if (projectData.rooms && Array.isArray(projectData.rooms)) {
      projectData.rooms.forEach(room => {
        if (room.background && typeof room.background === 'string') {
          assetsWithCategory.set(room.background, 'background');
        }
        if (room.foregrounds && Array.isArray(room.foregrounds)) {
          room.foregrounds.forEach(fg => {
            if (fg.image && typeof fg.image === 'string') {
              assetsWithCategory.set(fg.image, 'foreground');
            }
          });
        }
        if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
          room.sceneObjects.forEach(obj => {
            if (obj.image && typeof obj.image === 'string') {
              assetsWithCategory.set(obj.image, 'sprite');
            }
          });
        }
      });
    }

    // GUI backgrounds e button images
    if (projectData.guis && Array.isArray(projectData.guis)) {
      projectData.guis.forEach(gui => {
        if (gui.background && typeof gui.background === 'string') {
          assetsWithCategory.set(gui.background, 'gui');
        }
        if (gui.buttons && Array.isArray(gui.buttons)) {
          gui.buttons.forEach(btn => {
            if (btn.backgroundImage && typeof btn.backgroundImage === 'string') {
              assetsWithCategory.set(btn.backgroundImage, 'gui');
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

    // Carica tutte le immagini in parallelo con la categoria corretta
    const loadPromises = Array.from(assetsWithCategory.entries()).map(async ([src, category]) => {
      try {
        log(`[Runtime] Preload asset (${category}): ${src.substring(0, 50)}${src.length > 50 ? '...' : ''}`, 'info');
        const img = await loadImage(src, category);
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

    // Salva nello stato
    gameState.currentRoom = {
      ...room,
      backgroundImg,
      foregrounds,
      objects
    };

    // Esegui script on_room_change se presente
    await executeRoomChangeScripts(oldRoomId, roomId);

    log(`[Runtime] Room cambiata: ${roomId} (bg: ${backgroundImg ? 'ok' : 'mancante'}, fg: ${foregrounds.length}, obj: ${objects.length})`, 'info');
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
        'changeRoom',
        'enableObject',
        'disableObject',
        'showText',
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
        GameAPI.changeRoom,
        GameAPI.enableObject,
        GameAPI.disableObject,
        GameAPI.showText,
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

  // Esegue un handler specifico da uno script
  async function executeScriptHandler(scriptContent, handlerName, argsArray = []) {
    if (!scriptContent || !handlerName) return;

    try {
      // Crea funzione wrapper che espone GameAPI e cerca l'handler
      const scriptFunction = new Function(
        'Game',
        'GameAPI',
        'print',
        'getVariable',
        'setVariable',
        'getCurrentRoom',
        'changeRoom',
        'enableObject',
        'disableObject',
        'showText',
        'log',
        'on_game_start',
        'on_room_change',
        'on_object_click',
        'on_character_click',
        'on_hotspot_click',
        'on_gui_click',
        `
        try {
          ${scriptContent}
          
          // Cerca e chiama l'handler se esiste
          if (typeof ${handlerName} === 'function') {
            ${handlerName}.apply(null, ${JSON.stringify(argsArray)});
          }
        } catch (e) {
          GameAPI.error('Errore handler ${handlerName}: ' + (e && e.message ? e.message : String(e)));
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
        GameAPI.changeRoom,
        GameAPI.enableObject,
        GameAPI.disableObject,
        GameAPI.showText,
        GameAPI.log,
        GameAPI.on_game_start,
        GameAPI.on_room_change,
        GameAPI.on_object_click,
        GameAPI.on_character_click,
        GameAPI.on_hotspot_click,
        GameAPI.on_gui_click
      );
    } catch (error) {
      log(`Errore esecuzione handler ${handlerName}: ${error.message}`, 'error');
      console.error(error);
    }
  }

  async function executeGameStartScripts() {
    // Esegui script globali on_game_start
    const globalScripts = gameState.attachments.globalScripts || {};
    if (typeof globalScripts === 'object') {
      for (const [eventName, scriptName] of Object.entries(globalScripts)) {
        if (eventName === 'on_game_start' && scriptName && gameState.scripts[scriptName]) {
          await executeScriptHandler(gameState.scripts[scriptName], 'on_game_start', []);
        }
      }
    }

    // Cerca anche script chiamati "on_game_start" direttamente
    if (gameState.scripts.on_game_start) {
      await executeScriptHandler(gameState.scripts.on_game_start, 'on_game_start', []);
    }

    // Cerca tutti gli script per handler on_game_start
    for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
      if (scriptContent && typeof scriptContent === 'string') {
        // Controlla se lo script contiene la funzione on_game_start
        const hasHandler = /function\s+on_game_start\s*\(/.test(scriptContent);
        if (hasHandler) {
          await executeScriptHandler(scriptContent, 'on_game_start', []);
        }
      }
    }

    // Esegui handler registrati tramite on_game_start(function() {...})
    for (const handler of eventHandlers.game_start) {
      try {
        handler();
      } catch (error) {
        log(`Errore handler on_game_start: ${error.message}`, 'error');
      }
    }
  }

  async function executeRoomChangeScripts(oldRoomId, newRoomId) {
    // Esegui script collegati alla room
    const roomScripts = gameState.attachments.roomScripts || {};
    if (typeof roomScripts === 'object') {
      for (const [roomId, scriptName] of Object.entries(roomScripts)) {
        if (roomId === newRoomId && scriptName && gameState.scripts[scriptName]) {
          await executeScriptHandler(gameState.scripts[scriptName], 'on_room_change', [oldRoomId, newRoomId]);
        }
      }
    }

    // Cerca anche script on_room_change globale
    if (gameState.scripts.on_room_change) {
      await executeScriptHandler(gameState.scripts.on_room_change, 'on_room_change', [oldRoomId, newRoomId]);
    }

    // Cerca tutti gli script per handler on_room_change
    for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
      if (scriptContent && typeof scriptContent === 'string') {
        const hasHandler = /function\s+on_room_change\s*\(/.test(scriptContent);
        if (hasHandler) {
          await executeScriptHandler(scriptContent, 'on_room_change', [oldRoomId, newRoomId]);
        }
      }
    }

    // Esegui handler registrati tramite on_room_change(function() {...})
    for (const handler of eventHandlers.room_change) {
      try {
        handler(oldRoomId, newRoomId);
      } catch (error) {
        log(`Errore handler on_room_change: ${error.message}`, 'error');
      }
    }
  }

  async function executeObjectClickScripts(objectId, x, y) {
    // Esegui script collegati all'oggetto
    const objectScripts = gameState.attachments.objectScripts || {};
    if (typeof objectScripts === 'object' && objectScripts[objectId]) {
      const scriptName = objectScripts[objectId];
      if (gameState.scripts[scriptName]) {
        await executeScriptHandler(gameState.scripts[scriptName], 'on_object_click', [objectId, x, y]);
      }
    }

    // Cerca anche script on_object_click globale
    if (gameState.scripts.on_object_click) {
      await executeScriptHandler(gameState.scripts.on_object_click, 'on_object_click', [objectId, x, y]);
    }

    // Cerca tutti gli script per handler on_object_click
    for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
      if (scriptContent && typeof scriptContent === 'string') {
        const hasHandler = /function\s+on_object_click\s*\(/.test(scriptContent);
        if (hasHandler) {
          await executeScriptHandler(scriptContent, 'on_object_click', [objectId, x, y]);
        }
      }
    }

    // Esegui handler registrati tramite on_object_click(function() {...})
    for (const handler of eventHandlers.object_click) {
      try {
        handler(objectId, x, y);
      } catch (error) {
        log(`Errore handler on_object_click: ${error.message}`, 'error');
      }
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
      log(message, 'info');
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

    changeRoom: function(roomId) {
      if (typeof roomId !== 'string' && typeof roomId !== 'number') {
        GameAPI.error('changeRoom: roomId must be a string or number');
        return;
      }
      changeRoom(String(roomId));
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

    // UI
    showText: function(text) {
      // Mostra testo come messaggio (implementazione base)
      log(`[Messaggio] ${text}`, 'info');
      // TODO: Implementare sistema di messaggi UI più avanzato
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
    // Update logic qui (per ora vuoto, può essere esteso)
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
  }

  // ============================================
  // INTERAZIONE
  // ============================================
  function setupInteraction() {
    if (!canvas) return;

    canvas.addEventListener('click', function(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      handleClick(x, y);
    });

    canvas.style.cursor = 'pointer';
  }

  async function handleClick(x, y) {
    if (!gameState.currentRoom) return;

    // Controlla click su oggetti
    if (gameState.currentRoom.objects && Array.isArray(gameState.currentRoom.objects)) {
      for (const obj of gameState.currentRoom.objects) {
        if (!obj.visible || !obj.enabled || !obj.img) continue;

        if (x >= obj.x && x <= obj.x + obj.img.width &&
            y >= obj.y && y <= obj.y + obj.img.height) {
          log(`Click su oggetto: ${obj.name}`, 'info');
          await executeObjectClickScripts(obj.id, x, y);
      return;
        }
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
                await executeScriptHandler(gameState.scripts[scriptName], 'on_gui_click', [btn.id, x, y]);
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
  }

  // Setup interazione quando il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInteraction);
  } else {
    setupInteraction();
  }

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
              await executeScriptHandler(message.code, message.handlerName || null, message.handlerArgs || []);
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

    // Log locale (solo se standalone)
    if (!isInIframe) {
      originalPrint.apply(GameAPI, arguments);
    }
    
    // Invia sempre all'editor se in iframe, altrimenti solo se addRuntimeLog disponibile
    if (isInIframe) {
      sendToEditor({
        type: 'SCRIPT_LOG',
        message: message,
        level: 'info',
        timestamp: Date.now()
      });
    } else if (window.addRuntimeLog) {
      window.addRuntimeLog(message, 'info');
    }
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
  function initializeRuntime() {
    if (isInIframe) {
      // Siamo in un iframe - modalità playtest (sandboxed)
      log('[Runtime] Modalità iframe rilevata - playtest mode', 'info');
      
      function initIframeMode() {
        // Invia RUNTIME_READY immediatamente
        log('[Runtime] Invio RUNTIME_READY all\'editor', 'info');
        sendRuntimeReady();
        
        // Re-invia dopo un breve delay come backup
        setTimeout(() => {
          log('[Runtime] Re-invio RUNTIME_READY (backup)', 'info');
          sendRuntimeReady();
        }, 100);
        setTimeout(() => {
          log('[Runtime] Re-invio RUNTIME_READY (backup 2)', 'info');
          sendRuntimeReady();
        }, 500);
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

