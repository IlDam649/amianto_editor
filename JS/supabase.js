/**
 * Supabase Storage Client Configuration
 * 
 * Questo modulo gestisce l'integrazione con Supabase Storage per gli asset
 * (immagini, audio, ecc.) dell'editor Amianto.
 * 
 * IMPORTANTE: Firebase Storage NON deve essere usato per gli asset.
 * Supabase Storage è usato SOLO per gli asset.
 * Firestore/Firebase DB può rimanere per i dati strutturali del progetto.
 */

// ============================================
// CONFIGURAZIONE SUPABASE
// ============================================
// IMPORTANTE: Configurare queste variabili con i valori del tuo progetto Supabase
// Puoi trovarli nel dashboard Supabase: Settings > API

const SUPABASE_CONFIG = {
  // URL del tuo progetto Supabase (es: https://xxxxx.supabase.co)
  url: window.SUPABASE_URL || "https://gejfmiuajdxejhyjdmkj.supabase.co",
  
  // Chiave anonima pubblica (anon key) del tuo progetto Supabase
  anonKey: window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlamZtaXVhamR4ZWpoeWpkbWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMDc4ODUsImV4cCI6MjA4MTc4Mzg4NX0.5ok9dhz7W3S2xjJ6MZVHh1X3oPBooZwXS10WJG56xgs"
};

// Nome del bucket Supabase Storage per gli asset
const SUPABASE_BUCKET_NAME = 'amianto-assets';

// ============================================
// INIZIALIZZAZIONE CLIENT SUPABASE
// ============================================

let supabaseClient = null;

/**
 * Inizializza il client Supabase
 * @returns {Object|null} - Client Supabase o null se non disponibile
 */
function initSupabaseClient() {
  try {
    // Se già inizializzato, restituisci il client esistente
    if (supabaseClient) {
      return supabaseClient;
    }

    // Verifica che Supabase JS SDK sia caricato
    if (typeof supabase === 'undefined') {
      console.warn('[Supabase] SDK non disponibile. Assicurati di aver incluso il CDN Supabase JS.');
      console.warn('[Supabase] CDN atteso: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js');
      return null;
    }

    // Verifica configurazione
    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
      console.warn('[Supabase] Configurazione mancante. Imposta SUPABASE_URL e SUPABASE_ANON_KEY.');
      console.warn('[Supabase] URL configurato:', SUPABASE_CONFIG.url ? 'Sì' : 'No');
      console.warn('[Supabase] AnonKey configurata:', SUPABASE_CONFIG.anonKey ? 'Sì' : 'No');
      return null;
    }

    // Verifica che l'URL non sia il placeholder
    if (SUPABASE_CONFIG.url === "https://xxxxx.supabase.co" || SUPABASE_CONFIG.url === '') {
      console.warn('[Supabase] ⚠️ URL non configurato correttamente. Usa il tuo Project URL da Supabase Dashboard.');
      return null;
    }

    // Crea client Supabase
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    
    console.log('[Supabase] ✅ Client inizializzato con successo');
    console.log('[Supabase] URL:', SUPABASE_CONFIG.url);
    console.log('[Supabase] Bucket:', SUPABASE_BUCKET_NAME);
    return supabaseClient;
  } catch (error) {
    console.error('[Supabase] ❌ Errore inizializzazione client:', error);
    console.error('[Supabase] Dettagli errore:', error.message);
    return null;
  }
}

/**
 * Verifica se Supabase è disponibile e configurato
 * @returns {boolean} - true se Supabase è disponibile
 */
function isSupabaseAvailable() {
  // Prova a inizializzare se non già fatto
  if (!supabaseClient) {
    supabaseClient = initSupabaseClient();
  }
  
  const isAvailable = supabaseClient !== null;
  
  // Log di debug se non disponibile
  if (!isAvailable) {
    console.warn('[Supabase] ⚠️ Supabase non disponibile. Verifica:');
    console.warn('  1. CDN Supabase caricato:', typeof supabase !== 'undefined' ? '✅' : '❌');
    console.warn('  2. URL configurato:', SUPABASE_CONFIG.url ? '✅' : '❌');
    console.warn('  3. AnonKey configurata:', SUPABASE_CONFIG.anonKey ? '✅' : '❌');
  }
  
  return isAvailable;
}

// ============================================
// FUNZIONI HELPER PER STORAGE
// ============================================

/**
 * Normalizza il nome del file per evitare conflitti
 * @param {string} fileName - Nome originale del file
 * @returns {string} - Nome normalizzato
 */
function normalizeFileName(fileName) {
  // Rimuovi caratteri speciali e normalizza
  const normalized = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
  
  return normalized || 'file';
}

/**
 * Genera un nome file univoco usando UUID o timestamp
 * @param {string} originalName - Nome originale del file
 * @param {string} assetId - ID univoco dell'asset
 * @returns {string} - Nome file univoco
 */
function generateUniqueFileName(originalName, assetId) {
  const ext = originalName.split('.').pop() || 'png';
  const baseName = normalizeFileName(originalName.replace(`.${ext}`, ''));
  
  // Usa assetId per garantire unicità
  return `${assetId}_${baseName}.${ext}`;
}

/**
 * Mappa il tipo di asset alla cartella corretta in Supabase Storage
 * @param {string} assetType - Tipo di asset (background, foreground, sprite, gui, character, cursor, audio)
 * @returns {string} - Nome della cartella
 */
function getSupabaseFolderForType(assetType) {
  switch (assetType) {
    case 'background':
      return 'backgrounds';
    case 'foreground':
      return 'foregrounds';
    case 'sprite':
      return 'sprites';
    case 'gui':
    case 'character':
    case 'cursor':
      // Questi tipi vanno in sprites per compatibilità
      return 'sprites';
    case 'audio':
      return 'audio';
    default:
      return 'sprites';
  }
}

/**
 * Costruisce il percorso completo del file in Supabase Storage
 * Struttura: {userId}/{projectId}/{category}/{fileName}
 * Questo permette alle Storage Policies di limitare l'accesso per userId
 * @param {string} userId - ID utente (da Firebase Auth)
 * @param {string} projectId - ID del progetto
 * @param {string} category - Categoria (backgrounds, foregrounds, sprites, audio)
 * @param {string} fileName - Nome del file
 * @returns {string} - Percorso completo
 */
function buildStoragePath(userId, projectId, category, fileName) {
  return `${userId}/${projectId}/${category}/${fileName}`;
}

// ============================================
// FUNZIONI PRINCIPALI PER UPLOAD/DOWNLOAD
// ============================================

/**
 * Carica un asset su Supabase Storage
 * REQUISITO: L'utente deve essere autenticato su Firebase Auth
 * @param {File} file - File da caricare
 * @param {string} projectId - ID del progetto
 * @param {string} category - Categoria (backgrounds, foregrounds, sprites, audio)
 * @param {string} assetId - ID univoco dell'asset (opzionale, generato se non fornito)
 * @param {boolean} overwrite - Se true sovrascrive il file esistente (upsert)
 * @param {string|null} fileNameOverride - Nome file forzato (usa per mantenere stesso path)
 * @returns {Promise<{id: string, name: string, type: string, url: string}>} - Metadata dell'asset caricato
 */
async function uploadAsset(file, projectId, category, assetId = null, overwrite = false, fileNameOverride = null) {
  try {
    // Verifica disponibilità Supabase
    if (!isSupabaseAvailable()) {
      throw new Error('Supabase non disponibile. Verifica la configurazione.');
    }

    // VERIFICA AUTENTICAZIONE FIREBASE - CONTROLLO LATO CLIENT
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
      const errorMsg = 'Autenticazione richiesta. Effettua il login per caricare asset.';
      console.error('[Supabase] ❌', errorMsg);
      throw new Error(errorMsg);
    }

    const firebaseUser = window.firebaseAuth.currentUser;
    const userId = firebaseUser.uid;
    
    console.log('[Supabase] Upload autorizzato per utente:', firebaseUser.email || userId);

    // Genera assetId se non fornito
    if (!assetId) {
      assetId = 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    // Determina cartella in base alla categoria
    const folder = getSupabaseFolderForType(category);
    
    // Genera nome file univoco
    const fileName = fileNameOverride || generateUniqueFileName(file.name, assetId);
    
    // Costruisci percorso completo con userId per sicurezza
    const storagePath = buildStoragePath(userId, projectId, folder, fileName);
    
    console.log('[Supabase] Upload asset...', { storagePath, userId, category, assetId, fileName });

    // Upload file su Supabase Storage
    const { data, error } = await supabaseClient.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: !!overwrite // Se true sovrascrive il file esistente
      });

    if (error) {
      console.error('[Supabase] ❌ Errore upload:', error);
      
      // Messaggio di errore più chiaro per problemi di policy
      if (error.statusCode === '403' || error.message?.includes('row-level security')) {
        const policyError = 'Errore Storage Policy: Il bucket "amianto-assets" non permette l\'upload.\n' +
          'Configura le Storage Policies nel dashboard Supabase:\n' +
          '1. Vai su Storage > Policies nel dashboard Supabase\n' +
          '2. Seleziona il bucket "amianto-assets"\n' +
          '3. Crea una policy INSERT (Write) che permetta upload anonimi o autenticati\n' +
          '4. Vedi SUPABASE_STORAGE_POLICIES.md per istruzioni dettagliate';
        console.error('[Supabase]', policyError);
        throw new Error(policyError);
      }
      
      throw error;
    }

    // Ottieni URL pubblico
    const { data: urlData } = supabaseClient.storage
      .from(SUPABASE_BUCKET_NAME)
      .getPublicUrl(storagePath);

    const publicURL = urlData.publicUrl;

    console.log('[Supabase] ✅ Asset caricato con successo:', { assetId, storagePath, publicURL, fileName });

    // Restituisci oggetto conforme alla specifica
    return {
      id: assetId,
      name: file.name, // Nome originale del file
      fileName: fileName, // Nome file generato (con assetId)
      type: category,
      url: publicURL
    };
  } catch (error) {
    console.error('[Supabase] ❌ Errore upload asset:', error);
    throw error;
  }
}

/**
 * Ottiene l'URL pubblico di un asset da Supabase Storage
 * @param {string} userId - ID utente (opzionale, per compatibilità con asset legacy)
 * @param {string} projectId - ID del progetto
 * @param {string} category - Categoria (backgrounds, foregrounds, sprites, audio)
 * @param {string} fileName - Nome del file
 * @returns {string|null} - URL pubblico o null se non trovato
 */
function getAssetPublicUrl(userId, projectId, category, fileName) {
  try {
    if (!isSupabaseAvailable()) {
      return null;
    }

    const folder = getSupabaseFolderForType(category);
    
    // Se userId non è fornito, prova a ottenerlo da Firebase Auth (per asset nuovi)
    // Per asset legacy senza userId, usa il path vecchio
    let storagePath;
    if (userId) {
      storagePath = buildStoragePath(userId, projectId, folder, fileName);
    } else {
      // Fallback per asset legacy (senza userId nel path)
      storagePath = `${projectId}/${folder}/${fileName}`;
    }

    const { data } = supabaseClient.storage
      .from(SUPABASE_BUCKET_NAME)
      .getPublicUrl(storagePath);

    return data.publicUrl || null;
  } catch (error) {
    console.error('[Supabase] ❌ Errore ottenimento URL:', error);
    return null;
  }
}

/**
 * Risolve un assetId in un URL pubblico
 * Nota: Questa funzione assume che il fileName contenga l'assetId
 * @param {string} projectId - ID del progetto
 * @param {string} assetId - ID dell'asset
 * @param {string} category - Categoria dell'asset
 * @param {string} originalFileName - Nome originale del file (opzionale)
 * @returns {Promise<string|null>} - URL pubblico o null
 */
async function resolveAssetUrl(projectId, assetId, category, originalFileName = null) {
  try {
    if (!isSupabaseAvailable()) {
      return null;
    }

    // Se abbiamo il nome originale, possiamo ricostruire il percorso
    if (originalFileName) {
      const fileName = generateUniqueFileName(originalFileName, assetId);
      return getAssetPublicUrl(projectId, category, fileName);
    }

    // Altrimenti, dobbiamo cercare il file nel bucket
    // Nota: Supabase Storage non supporta ricerca diretta per nome parziale,
    // quindi questa è una limitazione. In produzione, si dovrebbe salvare
    // il mapping assetId -> fileName in Firestore o nel JSON del progetto.
    
    console.warn('[Supabase] Risoluzione asset senza fileName. Assicurati di salvare il fileName nel progetto.');
    return null;
  } catch (error) {
    console.error('[Supabase] ❌ Errore risoluzione asset:', error);
    return null;
  }
}

/**
 * Elimina un asset da Supabase Storage
 * REQUISITO: L'utente deve essere autenticato su Firebase Auth
 * @param {string} projectId - ID del progetto
 * @param {string} category - Categoria
 * @param {string} fileName - Nome del file
 * @returns {Promise<boolean>} - true se eliminato con successo
 */
async function deleteAsset(projectId, category, fileName) {
  try {
    if (!isSupabaseAvailable()) {
      return false;
    }

    // Verifica autenticazione
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
      console.warn('[Supabase] ❌ Autenticazione richiesta per eliminare asset');
      return false;
    }

    const userId = window.firebaseAuth.currentUser.uid;
    const folder = getSupabaseFolderForType(category);
    const storagePath = buildStoragePath(userId, projectId, folder, fileName);

    const { error } = await supabaseClient.storage
      .from(SUPABASE_BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('[Supabase] ❌ Errore eliminazione asset:', error);
      return false;
    }

    console.log('[Supabase] ✅ Asset eliminato:', storagePath);
    return true;
  } catch (error) {
    console.error('[Supabase] ❌ Errore eliminazione asset:', error);
    return false;
  }
}

// ============================================
// ESPORTAZIONE FUNZIONI GLOBALI
// ============================================

// Inizializza automaticamente il client quando il modulo viene caricato
if (typeof window !== 'undefined') {
  // Esponi funzioni globalmente per compatibilità con il codice esistente
  window.supabaseStorage = {
    init: initSupabaseClient,
    isAvailable: isSupabaseAvailable,
    uploadAsset: uploadAsset,
    getAssetPublicUrl: getAssetPublicUrl,
    resolveAssetUrl: resolveAssetUrl,
    deleteAsset: deleteAsset,
    getSupabaseFolderForType: getSupabaseFolderForType,
    buildStoragePath: buildStoragePath
  };

  // Funzione per inizializzare quando tutto è pronto
  function tryInitialize() {
    // Se il DOM è già caricato, inizializza immediatamente
    if (document.readyState === 'loading') {
      // DOM non ancora caricato, aspetta DOMContentLoaded
      document.addEventListener('DOMContentLoaded', () => {
        initSupabaseClient();
      });
    } else {
      // DOM già caricato, inizializza immediatamente
      initSupabaseClient();
    }
  }

  // Prova a inizializzare immediatamente
  tryInitialize();
  
  // Se il CDN Supabase non è ancora caricato, riprova con retry multipli
  if (typeof supabase === 'undefined') {
    console.log('[Supabase] CDN non ancora caricato, attendo il caricamento...');
    
    let retryCount = 0;
    const maxRetries = 20; // Prova per 2 secondi (20 * 100ms)
    
    const checkCDN = setInterval(() => {
      retryCount++;
      
      if (typeof supabase !== 'undefined') {
        console.log('[Supabase] ✅ CDN caricato dopo', retryCount * 100, 'ms');
        clearInterval(checkCDN);
        initSupabaseClient();
      } else if (retryCount >= maxRetries) {
        console.error('[Supabase] ❌ CDN Supabase non trovato dopo', maxRetries * 100, 'ms');
        console.error('[Supabase] Verifica che il CDN sia incluso in index.html prima di supabase.js');
        console.error('[Supabase] CDN atteso: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js');
        console.error('[Supabase] Controlla la console per errori di caricamento del CDN');
        clearInterval(checkCDN);
      }
    }, 100);
  } else {
    // CDN già disponibile, inizializza subito
    console.log('[Supabase] CDN già disponibile al caricamento del modulo');
  }
  
  // Log di debug per verificare lo stato
  console.log('[Supabase] Modulo caricato. Stato iniziale:');
  console.log('  - CDN disponibile:', typeof supabase !== 'undefined' ? '✅' : '❌');
  console.log('  - URL configurato:', SUPABASE_CONFIG.url ? '✅ (' + SUPABASE_CONFIG.url.substring(0, 30) + '...)' : '❌');
  console.log('  - AnonKey configurata:', SUPABASE_CONFIG.anonKey ? '✅' : '❌');
}

