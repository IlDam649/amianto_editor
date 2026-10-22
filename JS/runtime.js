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
    characters: new Map(), // Character attivi nel gioco: Map<characterId, {name, x, y, direction, currentFrame, frameTime, visible, opacity, roomId}>
    characterDefinitions: new Map(), // Definizioni dei character dal progetto: Map<characterName, {directions: {...}}>
    roomAnimationDefinitions: new Map(), // Definizioni animazioni stanza: Map<animId, {fps, loop, frames}>
    scripts: {}, // script del progetto
    attachments: {}, // script collegati a eventi
    isRunning: false,
    /** 'loading' | 'scripts' | 'ready' — input e gioco attivo solo in 'ready' */
    bootPhase: 'loading',
    lastFrameTime: 0,
    animationFrameId: null,
    // ⚠️ CACHE SCRIPT COMPILATI: Memorizza gli handler estratti dagli script
    // Struttura: Map<scriptName, { on_hotspot_click: function, on_object_click: function, ... }>
    // Ogni script viene compilato UNA SOLA VOLTA, gli handler vengono estratti e cache-ati
    // Questo previene riesecuzione di codice JS a ogni evento
    compiledScripts: new Map(),
    /** Hash contenuto script per invalidare cache compilazione quando il codice cambia (playtest senza chiudere finestra). */
    compiledScriptHashes: new Map(),
    inventory: null, // { enabled, displayMode, popupEdgeHeight, background, toggleIcon, toggleIconRect, slots, itemDefs, contents, visible, carriedItem, pointerX, pointerY }
    cursors: new Map(), // category -> { category, image, actionText, pivotX, pivotY }
    /** Ultimo hover cursore in playtest: category + actionText per overlay. */
    cursorHover: { x: 0, y: 0, category: 'default', actionText: '', visible: false },
    resourceFileIndex: null, // Map<filenameLower, "asset:assetId"> — cache Resources per spawn_object
    resourceFileIndexKey: null,
    audioFileIndex: null,
    audioFileIndexKey: null,
    audio: {
      music: null,
      sounds: new Map(),
      musicVolume: 1,
      soundVolume: 1
    },
    /** Dialoghi ramificati dal progetto: Map<id, dialogueDef> + indice per nome */
    dialogues: new Map(),
    dialogueNameIndex: new Map(),
    /** Choice once-only consumate in questa partita: Set<"dialogueId::optionId"> */
    dialogueConsumed: new Set(),
    /** Prefisso storage salvataggi gioco (per progetto) */
    saveGamePrefix: null
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

  /** Tipi di transizione tra stanze. `none` = taglio netto. */
  const ROOM_TRANSITION_TYPES = [
    'none',
    'fade',
    'fade_to_black',
    'fade_to_white',
    'slide',
    'dissolve',
    'iris'
  ];
  const ROOM_TRANSITION_DURATION_DEFAULT = 600;
  const ROOM_TRANSITION_DURATION_MAX = 10000;
  const ROOM_TRANSITION_TYPE_HINT = ROOM_TRANSITION_TYPES.join(', ');

  /**
   * Default di sessione (da settings progetto, sovrascrivibile con set_room_transition)
   * più stato del fotogramma in corso.
   */
  const roomTransitionRuntime = {
    type: 'none',
    duration: ROOM_TRANSITION_DURATION_DEFAULT,
    active: false,
    holdSnapshot: null,
    snapshot: null,
    effectType: 'none',
    effectDuration: 0,
    startedAt: 0,
    onComplete: null,
    inputLockHeld: false
  };
  let roomTransitionSerial = 0;
  let dissolveNoise = null;
  let dissolveNoiseW = 0;
  let dissolveNoiseH = 0;
  let dissolveMaskCanvas = null;
  let worldBuffer = null;
  let transitionBuffer = null;

  // Assets caricati (immagini)
  const loadedImages = new Map(); // cache immagini (deprecato, mantenuto per compatibilità)
  
  // Asset Registry centralizzato - memorizza tutte le immagini caricate
  const AssetRegistry = {
    images: new Map(), // key: assetId/URL, value: Image object
    fonts: new Map(), // key: font ref, value: loaded fontFamily string
    isLoading: false,
    loadComplete: false
  };

  // Categorie usate per risolvere asset: (include 'resource' per immagini da Resources centralizzate)
  const ASSET_RESOLVE_CATEGORIES = [
    'resource',
    'audio',
    'background',
    'foreground',
    'sprite',
    'gui',
    'character',
    'animation',
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

  function isPlaytestSession() {
    try {
      if (window.opener && window.opener !== window) return true;
      // Runtime aperto via Electron IPC (senza opener)
      if (window.amiantoElectron && !!(window.amiantoNativeFs && window.amiantoNativeFs.onRuntimeMessage)) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function isGamePlayable() {
    return gameState.bootPhase === 'ready' && gameState.isRunning;
  }

  function configureLoadingOverlayForSession() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const logo = document.getElementById('loading-logo');
    const title = document.getElementById('loading-title');
    const playtest = isPlaytestSession();
    overlay.classList.toggle('playtest-loading', playtest);
    if (logo) logo.hidden = !playtest;
    if (title) title.textContent = playtest ? 'Starting playtest...' : 'Loading Runtime...';
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
      configureLoadingOverlayForSession();
    }
  }

  function markBootReady() {
    gameState.bootPhase = 'ready';
    log('[Runtime] Boot completato — gioco giocabile', 'success');
  }

  // Funzione per mostrare messaggi visibili a schermo
  function ensureGameNotificationStyles() {
    if (document.getElementById('amianto-game-notification-styles')) return;
    const style = document.createElement('style');
    style.id = 'amianto-game-notification-styles';
    style.textContent = `
      .game-notification {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        min-width: 300px;
        max-width: 500px;
        background: #1a1a1a;
        border: 2px solid #39ff14;
        border-radius: 8px;
        padding: 16px 20px;
        color: #eee;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(57, 255, 20, 0.3);
        animation: amiantoSlideInCenter 0.3s ease-out;
        word-wrap: break-word;
      }
      @keyframes amiantoSlideInCenter {
        from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      .game-notification.fade-out {
        animation: amiantoFadeOutCenter 0.3s ease-out forwards;
      }
      @keyframes amiantoFadeOutCenter {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
      .game-notification .close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: transparent;
        border: none;
        color: #39ff14;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .game-notification .close-btn:hover { color: #fff; }
    `;
    document.head.appendChild(style);
  }

  /**
   * Mostra un messaggio overlay. Promise risolta a chiusura (click × o timeout).
   * @param {string} text
   * @param {number} [duration=3000]
   * @returns {Promise<void>}
   */
  function showGameMessage(text, duration = 3000) {
    if (!text) return Promise.resolve();
    ensureGameNotificationStyles();

    // Rimuovi notifiche precedenti se ce ne sono troppe
    const existingNotifications = document.querySelectorAll('.game-notification');
    if (existingNotifications.length > 5) {
      existingNotifications[0].remove();
    }

    return new Promise(resolve => {
      let settled = false;
      const notification = document.createElement('div');
      notification.className = 'game-notification';
      notification.innerHTML = `
        <button type="button" class="close-btn" title="Close">×</button>
        <div style="padding-right: 24px;">${escapeHtml(text)}</div>
      `;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (notification.parentNode) {
          notification.classList.add('fade-out');
          setTimeout(() => {
            if (notification.parentNode) notification.remove();
          }, 300);
        }
        resolve();
      };

      const closeBtn = notification.querySelector('.close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          finish();
        });
      }

      document.body.appendChild(notification);
      const ms = Math.max(0, Number(duration) || 0);
      if (ms > 0) setTimeout(finish, ms);
      else finish();
    });
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

  // Promise in sospeso da API sync-looking (load_room / play_music senza await nello script)
  // Stack per livello di executeScriptHandler: evita deadlock load_room → on_room_change → play_music
  let pendingScriptSideEffects = [];

  // Durante on_before_room_change / on_room_change: show_dialogue/start_dialogue non devono
  // tenere in sospeso changeRoom/load_room (il balloon resta in coda e aspetta il click).
  let roomTransitionScriptDepth = 0;

  function beginRoomTransitionScripts() {
    roomTransitionScriptDepth++;
  }

  function endRoomTransitionScripts() {
    roomTransitionScriptDepth = Math.max(0, roomTransitionScriptDepth - 1);
  }

  function isInsideRoomTransitionScript() {
    return roomTransitionScriptDepth > 0;
  }

  /**
   * Accoda un comando. Fuori dalle room-transition lo script può await-are il completamento;
   * dentro on_room_change / on_before_room_change restituisce subito così load_room non resta bloccato.
   */
  function enqueueScriptCommand(commandFn, delay = 0) {
    const queued = queueCommand(commandFn, delay);
    if (isInsideRoomTransitionScript()) {
      // Non blocca load_room / room scripts; il comando resta in coda
      return Promise.resolve();
    }
    return trackScriptSideEffect(queued);
  }

  /** API che devono sospendere lo script finché non completano (auto-await in compile). */
  const AUTO_AWAIT_BLOCKING_APIS = [
    'show_message',
    'showText',
    'show_dialogue',
    'show_dialogue_text',
    'start_dialogue',
    'show_image',
    'wait'
  ];

  /**
   * Inserisce `await` davanti alle API bloccanti se assente
   * (così show_message(...); comandoSuccessivo aspetta la chiusura del messaggio).
   */
  function injectAutoAwaitBlockingApis(code) {
    let out = String(code || '');
    AUTO_AWAIT_BLOCKING_APIS.forEach(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match show_message( / Game.show_message( / GameAPI.show_message(
      // Evita doppio await e property su altri oggetti (foo.show_message)
      const re = new RegExp(
        `(?<!\\bawait\\s)(?<![\\w.$])((?:Game(?:API)?\\.)?${escaped}\\s*\\()`,
        'g'
      );
      out = out.replace(re, 'await $1');
    });
    return out;
  }

  function trackScriptSideEffect(promise) {
    if (!promise || typeof promise.then !== 'function') return promise;
    const bucket = pendingScriptSideEffects;
    bucket.push(promise);
    promise.catch(() => {}).finally(() => {
      const i = bucket.indexOf(promise);
      if (i >= 0) bucket.splice(i, 1);
    });
    return promise;
  }

  async function flushScriptSideEffects() {
    while (pendingScriptSideEffects.length > 0) {
      const batch = pendingScriptSideEffects.splice(0, pendingScriptSideEffects.length);
      await Promise.allSettled(batch);
    }
  }
  let inputLockDepth = 0;

  function acquireInputLock(reason) {
    inputLockDepth++;
    log(`[Runtime] Input lock acquisito (${reason}, depth=${inputLockDepth})`, 'info');
    refreshCursorFromLastPointer();
  }

  function releaseInputLock(reason) {
    inputLockDepth = Math.max(0, inputLockDepth - 1);
    log(`[Runtime] Input lock rilasciato (${reason}, depth=${inputLockDepth})`, 'info');
    refreshCursorFromLastPointer();
  }

  function isInputLocked() {
    return inputLockDepth > 0;
  }

  function resetInputLock() {
    inputLockDepth = 0;
    refreshCursorFromLastPointer();
  }

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

  const RESOURCE_IMAGE_FILE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
  const AUDIO_FILE_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i;

  function guessAudioMimeFromRef(audioRef) {
    const name = String(audioRef || '').split(/[/\\]/).pop().toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    switch (ext) {
      case 'ogg':
      case 'oga':
      case 'opus':
        return 'audio/ogg';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
        return 'audio/mp4';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'webm':
        return 'audio/webm';
      default:
        return null;
    }
  }

  /**
   * @deprecated kept for compatibility; playback uses WebAudio decode on raw bytes.
   */
  async function ensurePlayableAudioUrl(url, audioRef) {
    if (!url || typeof url !== 'string') return url;
    if (!url.startsWith('blob:')) return url;

    let preferred = guessAudioMimeFromRef(audioRef);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const current = String(blob.type || '').toLowerCase();

      if (!preferred) {
        try {
          const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
          if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
            preferred = 'audio/ogg';
          }
        } catch (_) {}
      }

      const needsFix = !current ||
        current === 'application/octet-stream' ||
        current === 'application/ogg' ||
        current === 'binary/octet-stream' ||
        (preferred && current !== preferred && !current.startsWith('audio/'));

      if (!needsFix) return url;

      const mime = preferred || (current === 'application/ogg' ? 'audio/ogg' : null);
      if (!mime) return url;
      const buf = await blob.arrayBuffer();
      return URL.createObjectURL(new Blob([buf], { type: mime }));
    } catch (_) {
      return url;
    }
  }

  function getActualProjectId() {
    let id = projectInfo.projectId;
    if (id && String(id).includes(':')) {
      id = String(id).split(':')[1];
    }
    return id ? String(id) : null;
  }

  function invalidateResourceFileIndex() {
    gameState.resourceFileIndex = null;
    gameState.resourceFileIndexKey = null;
    invalidateAudioFileIndex();
  }

  function invalidateAudioFileIndex() {
    gameState.audioFileIndex = null;
    gameState.audioFileIndexKey = null;
  }

  /**
   * loop: true | 'loop' | 'infinite' → loop forever
   *       false | 'once' | 'none' | 0 | 1 → play once
   *       number N > 1 → play N times
   */
  function parseAudioLoopOption(loop, defaultInfinite) {
    if (loop === undefined || loop === null) {
      return defaultInfinite ? { mode: 'infinite' } : { mode: 'once' };
    }
    if (loop === true || loop === 'loop' || loop === 'infinite' || loop === 'repeat') {
      return { mode: 'infinite' };
    }
    if (loop === false || loop === 'once' || loop === 'none') {
      return { mode: 'once' };
    }
    const n = Number(loop);
    if (!Number.isNaN(n)) {
      if (n <= 1) return { mode: 'once' };
      return { mode: 'count', count: Math.floor(n) };
    }
    return defaultInfinite ? { mode: 'infinite' } : { mode: 'once' };
  }

  function applyAudioLoop(audio, loopOpt) {
    if (!audio || !loopOpt) return;
    audio.loop = loopOpt.mode === 'infinite';
    if (loopOpt.mode !== 'count') return;

    let remaining = loopOpt.count;
    const onEnded = () => {
      remaining -= 1;
      if (remaining > 0) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        audio.removeEventListener('ended', onEnded);
      }
    };
    audio.addEventListener('ended', onEnded);
  }

  let sharedAudioContext = null;
  const pendingAudioUnlockResolvers = [];

  function getSharedAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!sharedAudioContext) {
      try {
        sharedAudioContext = new AC();
      } catch (_) {
        return null;
      }
    }
    return sharedAudioContext;
  }

  function flushPendingAudioUnlock() {
    if (!pendingAudioUnlockResolvers.length) return;
    const list = pendingAudioUnlockResolvers.splice(0, pendingAudioUnlockResolvers.length);
    list.forEach((fn) => {
      try { fn(); } catch (_) {}
    });
  }

  async function ensureAudioContextRunning() {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (_) {}
    }

    if (ctx.state === 'running') {
      flushPendingAudioUnlock();
      return ctx;
    }

    // Non fare timeout che poi avvia audio in silenzio: resta suspended → caller usa HTMLAudio
    return ctx;
  }

  let htmlAudioUnlocked = false;
  let audioUnlockWaiters = [];
  const deferredHtmlAudioJobs = [];
  /** Solo per sbloccare l'autoplay — MAI usarlo per play_music/play_sound */
  let unlockedMediaEl = null;
  /** Player dedicato per la musica di sottofondo (loop fino a stop_music) */
  let musicAudioEl = null;
  let musicObjectUrl = null;
  /** WAV silenzioso (1 sample) per unlock autoplay senza gesture (Electron / policy permissiva) */
  const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  function notifyAudioUnlocked() {
    htmlAudioUnlocked = true;
    const waiters = audioUnlockWaiters.splice(0, audioUnlockWaiters.length);
    waiters.forEach((fn) => { try { fn(); } catch (_) {} });
    flushDeferredHtmlAudioJobs();
    flushDeferredAudioStarts();
  }

  /**
   * Tenta lo sblocco audio all'avvio (senza click).
   * Funziona in Electron con autoplay-policy=no-user-gesture-required;
   * in browser restrittivi fallisce in silenzio e resta il fallback al primo gesture.
   */
  async function tryAutoUnlockAudioAtBoot() {
    if (htmlAudioUnlocked) return true;
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (_) {}
      }
      if (!unlockedMediaEl) {
        unlockedMediaEl = document.createElement('audio');
        unlockedMediaEl.setAttribute('playsinline', '');
        unlockedMediaEl.setAttribute('data-amianto-unlocked', '1');
        unlockedMediaEl.preload = 'auto';
        unlockedMediaEl.volume = 0.001;
        unlockedMediaEl.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        if (document.body) document.body.appendChild(unlockedMediaEl);
      }
      unlockedMediaEl.src = SILENT_WAV_DATA_URI;
      await unlockedMediaEl.play();
      try { unlockedMediaEl.pause(); unlockedMediaEl.currentTime = 0; } catch (_) {}
      notifyAudioUnlocked();
      log('[Runtime] Audio sbloccato all\'avvio (nessun click richiesto)', 'info');
      return true;
    } catch (err) {
      log('[Runtime] Auto-unlock audio non disponibile — fallback al primo gesture', 'info');
      return false;
    }
  }

  function waitForAudioUnlock(timeoutMs) {
    if (htmlAudioUnlocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(!!ok);
      };
      audioUnlockWaiters.push(() => finish(true));
      if (timeoutMs > 0) setTimeout(() => finish(htmlAudioUnlocked), timeoutMs);
    });
  }

  function flushDeferredAudioStarts() {
    // no-op placeholder (legacy WebAudio deferral)
  }

  function flushDeferredHtmlAudioJobs() {
    if (!deferredHtmlAudioJobs.length) return;
    const list = deferredHtmlAudioJobs.splice(0, deferredHtmlAudioJobs.length);
    list.forEach((job) => {
      try { job(); } catch (_) {}
    });
  }

  /**
   * Chiamare IN SINCRONO dentro pointerdown/click (prima di await).
   * Invoca play() subito così il gesture è ancora valido.
   * Non tocca musicAudioEl.
   */
  function unlockAudioSyncFromUserGesture() {
    try {
      if (!unlockedMediaEl) {
        unlockedMediaEl = document.createElement('audio');
        unlockedMediaEl.setAttribute('playsinline', '');
        unlockedMediaEl.setAttribute('data-amianto-unlocked', '1');
        unlockedMediaEl.preload = 'auto';
        unlockedMediaEl.volume = 0.001;
        unlockedMediaEl.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(unlockedMediaEl);
      }
      unlockedMediaEl.src = SILENT_WAV_DATA_URI;
      const p = unlockedMediaEl.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          try { unlockedMediaEl.pause(); unlockedMediaEl.currentTime = 0; } catch (_) {}
          notifyAudioUnlocked();
        }).catch(() => {});
      } else {
        notifyAudioUnlocked();
      }
    } catch (_) {}

    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        flushPendingAudioUnlock();
        notifyAudioUnlocked();
      }).catch(() => {});
    }
    resumeMusicIfNeeded();
  }

  function unlockAudioContextFromGesture() {
    unlockAudioSyncFromUserGesture();
  }

  async function unlockHtmlAudioFromGestureAsync() {
    unlockAudioSyncFromUserGesture();
    if (htmlAudioUnlocked) return true;
    return waitForAudioUnlock(800);
  }

  function ensureMusicAudioElement() {
    if (musicAudioEl) return musicAudioEl;
    musicAudioEl = document.createElement('audio');
    musicAudioEl.preload = 'auto';
    musicAudioEl.autoplay = true;
    musicAudioEl.loop = true;
    musicAudioEl.setAttribute('playsinline', '');
    musicAudioEl.setAttribute('data-amianto-music', '1');
    musicAudioEl.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(musicAudioEl);
    // Rete di sicurezza: se loop nativo fallisce, riparti finché la musica è attiva
    musicAudioEl.addEventListener('ended', () => {
      if (!gameState.audio || !gameState.audio.music) return;
      if (gameState.audio.music.element !== musicAudioEl) return;
      try {
        musicAudioEl.loop = true;
        musicAudioEl.currentTime = 0;
        musicAudioEl.play().catch(() => {});
      } catch (_) {}
    });
    return musicAudioEl;
  }

  function revokeMusicObjectUrl() {
    if (musicObjectUrl) {
      try { URL.revokeObjectURL(musicObjectUrl); } catch (_) {}
      musicObjectUrl = null;
    }
  }

  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach((evt) => {
    window.addEventListener(evt, unlockAudioSyncFromUserGesture, { capture: true, passive: true });
  });

  function stopPlaybackHandle(handle) {
    if (!handle) return;
    try {
      // La musica si ferma SOLO via stopMusicPlayback / stop_music
      if (handle._isMusic || handle._sharedUnlocked || handle.kind === 'deferred') {
        return;
      }
      if (typeof handle._domCleanup === 'function') {
        try { handle._domCleanup(); } catch (_) {}
      }
      if (handle.kind === 'webaudio') {
        if (typeof handle._onEnded === 'function' && handle.source) {
          try { handle.source.removeEventListener('ended', handle._onEnded); } catch (_) {}
        }
        if (handle.source) {
          try { handle.source.stop(0); } catch (_) {}
          try { handle.source.disconnect(); } catch (_) {}
          handle.source = null;
        }
        if (handle.gain) {
          try { handle.gain.disconnect(); } catch (_) {}
          handle.gain = null;
        }
      } else if (handle.element) {
        handle.element.pause();
        handle.element.removeAttribute('src');
        while (handle.element.firstChild) {
          handle.element.removeChild(handle.element.firstChild);
        }
        handle.element.load();
        try {
          if (handle.element.parentNode) handle.element.parentNode.removeChild(handle.element);
        } catch (_) {}
      }
    } catch (_) {}
  }

  /** Adatta il handle al contratto usato da stop_* (.element.pause/load). */
  function asAudioElementProxy(handle) {
    if (!handle) return null;
    if (handle.kind === 'element' && handle.element) return handle.element;
    return {
      pause: () => stopPlaybackHandle(handle),
      removeAttribute: () => {},
      load: () => {},
      _amiantoAudioHandle: handle
    };
  }

  function startWebAudioPlayback(ctx, audioBuffer, options) {
    const loopOpt = options.loopOpt || { mode: 'once' };
    const volume = Math.max(0, Math.min(1, Number(options.volume) || 1));
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);

    const handle = {
      kind: 'webaudio',
      source: null,
      gain,
      _onEnded: null,
      _playsLeft: loopOpt.mode === 'count' ? loopOpt.count : 1
    };

    const startSource = () => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = loopOpt.mode === 'infinite';
      source.connect(gain);
      handle.source = source;

      if (loopOpt.mode === 'count') {
        handle._onEnded = () => {
          handle._playsLeft -= 1;
          if (handle._playsLeft > 0) {
            startSource();
          } else if (typeof options.onEnded === 'function') {
            options.onEnded();
          }
        };
        source.addEventListener('ended', handle._onEnded);
      } else if (loopOpt.mode === 'once' && typeof options.onEnded === 'function') {
        handle._onEnded = () => options.onEnded();
        source.addEventListener('ended', handle._onEnded);
      }

      source.start(0);
    };

    startSource();
    return handle;
  }

  function sniffContainerFormat(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 4) return null;
    const u8 = new Uint8Array(arrayBuffer.slice(0, 12));
    if (u8[0] === 0x4f && u8[1] === 0x67 && u8[2] === 0x67 && u8[3] === 0x53) return 'ogg';
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return 'wav';
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return 'mp3';
    if (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) return 'mp3';
    if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) return 'flac';
    return null;
  }

  async function playWithHtmlAudio(url, audioRef, options) {
    const loopOpt = options.loopOpt || { mode: 'once' };
    const volume = Math.max(0, Math.min(1, Number(options.volume) || 1));

    const attemptOnElement = (audio) => new Promise((resolve, reject) => {
      let settled = false;
      const cleanupDom = () => {
        try { audio.pause(); } catch (_) {}
        try { audio.removeAttribute('src'); audio.load(); } catch (_) {}
        try { if (audio.parentNode) audio.parentNode.removeChild(audio); } catch (_) {}
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve({ kind: 'element', element: audio, _domCleanup: cleanupDom });
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanupDom();
        reject(err || new Error('HTMLAudio play failed'));
      };

      audio.volume = volume;
      applyAudioLoop(audio, loopOpt);
      audio.src = url;

      audio.addEventListener('playing', () => ok(), { once: true });
      audio.addEventListener('error', () => {
        const mediaErr = audio.error;
        fail(new Error(mediaErr ? ('MediaError code ' + mediaErr.code) : 'audio element error'));
      }, { once: true });

      const tryPlay = () => {
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => { if (!settled && !audio.paused) ok(); }).catch(fail);
        }
      };
      tryPlay();
      setTimeout(() => { if (!settled) tryPlay(); }, 30);
      setTimeout(() => { if (!settled) fail(new Error('HTMLAudio play timeout')); }, 1200);
    });

    if (!htmlAudioUnlocked) {
      await waitForAudioUnlock(50);
    }

    const attemptNew = async () => {
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.setAttribute('data-amianto-audio', '1');
      audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(audio);
      return attemptOnElement(audio);
    };

    try {
      return await attemptNew();
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      const notAllowed = /NotAllowed|user didn't interact|user.*gesture/i.test(msg);
      if (!notAllowed) throw err;

      log('[Runtime] Audio blocked by autoplay — queued until user click (non-blocking)', 'warning');
      deferredHtmlAudioJobs.push(() => {
        attemptNew().catch(() => {});
      });
      return {
        kind: 'deferred',
        element: { pause() {}, removeAttribute() {}, load() {} },
        _domCleanup() {}
      };
    }
  }

  /**
   * Musica di sottofondo: sempre in loop su un elemento dedicato.
   * Non usa unlockedMediaEl (i click di unlock non devono interromperla).
   */
  async function playMusicFromRef(audioRef, options = {}) {
    const url = await resolveAudioUrl(audioRef);
    if (!url) return null;

    let arrayBuffer = null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      arrayBuffer = await res.arrayBuffer();
    } catch (err) {
      log('Could not load music "' + audioRef + '": ' + (err && err.message ? err.message : err), 'error');
      return null;
    }

    if (!arrayBuffer || arrayBuffer.byteLength < 4) {
      log('Music "' + audioRef + '" is empty or unreadable', 'error');
      return null;
    }

    const container = sniffContainerFormat(arrayBuffer);
    const preferredMime = guessAudioMimeFromRef(audioRef) ||
      (container === 'ogg' ? 'audio/ogg' : null) ||
      (container === 'mp3' ? 'audio/mpeg' : null) ||
      (container === 'wav' ? 'audio/wav' : null) ||
      'application/octet-stream';

    revokeMusicObjectUrl();
    musicObjectUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: preferredMime }));

    const audio = ensureMusicAudioElement();
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, Number(options.volume) || 1));
    audio.src = musicObjectUrl;

    const tryStart = async () => {
      // Non attendere il click: prova subito (Electron / autoplay policy).
      // Se il browser blocca, si fa retry dopo tryAutoUnlock o al primo gesture.
      if (!htmlAudioUnlocked) {
        await tryAutoUnlockAudioAtBoot();
      }
      await audio.play();
      if (!htmlAudioUnlocked) notifyAudioUnlocked();
      return {
        kind: 'element',
        element: audio,
        _isMusic: true,
        _domCleanup() {}
      };
    };

    try {
      const handle = await tryStart();
      log('[Runtime] Music via HTMLAudio loop (' + (container || preferredMime) + ')', 'info');
      return handle;
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      const notAllowed = /NotAllowed|user didn't interact|user.*gesture/i.test(msg);
      if (!notAllowed) {
        log('Could not play music "' + audioRef + '": ' + msg, 'error');
        return null;
      }

      // Secondo tentativo dopo unlock boot (a volte resume AudioContext basta)
      try {
        await tryAutoUnlockAudioAtBoot();
        await audio.play();
        if (!htmlAudioUnlocked) notifyAudioUnlocked();
        log('[Runtime] Music via HTMLAudio loop after boot unlock (' + (container || preferredMime) + ')', 'info');
        return {
          kind: 'element',
          element: audio,
          _isMusic: true,
          _domCleanup() {}
        };
      } catch (_) {}

      log('[Runtime] Music blocked by autoplay — will start on next click (loop)', 'warning');
      const pendingRef = audioRef;
      const pendingVol = audio.volume;
      deferredHtmlAudioJobs.push(() => {
        const el = ensureMusicAudioElement();
        el.loop = true;
        el.volume = pendingVol;
        if (musicObjectUrl) el.src = musicObjectUrl;
        el.play().then(() => {
          gameState.audio.music = {
            handle: { kind: 'element', element: el, _isMusic: true, _domCleanup() {} },
            element: el,
            ref: pendingRef,
            loopOpt: { mode: 'infinite' }
          };
          log('[Runtime] Music started after unlock (loop): "' + pendingRef + '"', 'info');
        }).catch(() => {});
      });
      return {
        kind: 'deferred',
        element: audio,
        _isMusic: true,
        _domCleanup() {}
      };
    }
  }

  /** Se il browser mette in pausa l'audio (tab nascosta, ecc.), riprendi finché stop_music non è stato chiamato. */
  function resumeMusicIfNeeded() {
    if (!musicAudioEl || !gameState.audio || !gameState.audio.music) return;
    if (gameState.audio.music.element !== musicAudioEl) return;
    try {
      musicAudioEl.loop = true;
      if (musicAudioEl.paused && musicAudioEl.src) {
        musicAudioEl.play().catch(() => {});
      }
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeMusicIfNeeded();
  });
  window.addEventListener('focus', resumeMusicIfNeeded);

  function stopMusicPlayback() {
    const music = gameState.audio && gameState.audio.music;
    if (music && music.handle && music.handle.kind === 'webaudio') {
      stopPlaybackHandle(music.handle);
    }
    if (musicAudioEl) {
      try {
        musicAudioEl.pause();
        musicAudioEl.removeAttribute('src');
        musicAudioEl.load();
      } catch (_) {}
    }
    revokeMusicObjectUrl();
    gameState.audio.music = null;
  }

  function stopSoundPlayback(soundKey) {
    if (!gameState.audio || !gameState.audio.sounds) return;
    const key = String(soundKey || '').trim().toLowerCase();
    if (!key) return;
    const entry = gameState.audio.sounds.get(key);
    if (!entry) return;
    stopPlaybackHandle(entry.handle || (entry.element && entry.element._amiantoAudioHandle) || { kind: 'element', element: entry.element });
    gameState.audio.sounds.delete(key);
  }

  function stopAllAudioPlayback() {
    stopMusicPlayback();
    if (gameState.audio && gameState.audio.sounds) {
      for (const key of [...gameState.audio.sounds.keys()]) {
        stopSoundPlayback(key);
      }
    }
  }

  async function refreshAudioFileIndex() {
    const projectId = getActualProjectId();
    if (!projectId) return new Map();

    const userId = projectInfo.userId || 'local';
    const cacheKey = `${userId}|${projectId}|audio`;
    if (gameState.audioFileIndex && gameState.audioFileIndexKey === cacheKey) {
      return gameState.audioFileIndex;
    }

    const index = new Map();

    if (window.assetStorage && typeof window.assetStorage.listProjectAudio === 'function') {
      try {
        const entries = await window.assetStorage.listProjectAudio(projectId, userId);
        for (const entry of entries || []) {
          const aid = entry.assetId || normalizeResourceFileKey(entry.name).replace(/\.[^.]+$/, '');
          const url = entry.publicUrl || null;
          registerResourceFileAlias(index, entry.name, aid, url);
          if (entry.fileName) registerResourceFileAlias(index, entry.fileName, aid, url);
          if (entry.displayName) registerResourceFileAlias(index, entry.displayName, aid, url);
          if (aid) {
            registerResourceFileAlias(index, aid, aid, url);
          }
        }
      } catch (err) {
        log(`[Runtime] refreshAudioFileIndex: ${err.message}`, 'warning');
      }
    }

    gameState.audioFileIndex = index;
    gameState.audioFileIndexKey = cacheKey;
    log(`[Runtime] Audio file index: ${index.size} alias`, 'info');
    return index;
  }

  async function resolveAudioUrl(audioRef) {
    const trimmed = String(audioRef == null ? '' : audioRef).trim();
    if (!trimmed) return null;

    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return trimmed;
    }

    let assetId = null;
    if (trimmed.startsWith('asset:')) {
      assetId = trimmed.slice(6);
    } else if (/^asset_[\w-]+$/i.test(trimmed)) {
      assetId = trimmed;
    }

    if (assetId) {
      const url = await resolveAssetId(assetId, 'audio');
      if (url) return url;
    }

    const key = normalizeResourceFileKey(trimmed);
    const index = await refreshAudioFileIndex();
    const fromIndex = index.get(key);
    if (fromIndex) {
      if (fromIndex.publicUrl) return fromIndex.publicUrl;
      if (fromIndex.assetRef && fromIndex.assetRef.startsWith('asset:')) {
        const id = fromIndex.assetRef.slice(6);
        const url = await resolveAssetId(id, 'audio');
        if (url) return url;
      }
    }

    const withoutExt = key.replace(/\.[^.]+$/, '');
    if (withoutExt && withoutExt !== key) {
      const fromStem = index.get(withoutExt);
      if (fromStem) {
        if (fromStem.publicUrl) return fromStem.publicUrl;
        if (fromStem.assetRef && fromStem.assetRef.startsWith('asset:')) {
          const id = fromStem.assetRef.slice(6);
          const url = await resolveAssetId(id, 'audio');
          if (url) return url;
        }
      }
    }

    if (AUDIO_FILE_EXT.test(key)) {
      log(
        `Audio "${trimmed}" not found. Import it in Resources → Audio and use the file name, asset id, or asset:... ref.`,
        'error'
      );
    } else {
      log(`Audio "${trimmed}" not found in project audio library.`, 'error');
    }
    return null;
  }

  async function playAudioFromRef(audioRef, options = {}) {
    const url = await resolveAudioUrl(audioRef);
    if (!url) return null;

    let arrayBuffer = null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      arrayBuffer = await res.arrayBuffer();
    } catch (err) {
      log('Could not load audio "' + audioRef + '": ' + (err && err.message ? err.message : err), 'error');
      return null;
    }

    if (!arrayBuffer || arrayBuffer.byteLength < 4) {
      log('Audio "' + audioRef + '" is empty or unreadable', 'error');
      return null;
    }

    const container = sniffContainerFormat(arrayBuffer);
    const preferredMime = guessAudioMimeFromRef(audioRef) ||
      (container === 'ogg' ? 'audio/ogg' : null) ||
      (container === 'mp3' ? 'audio/mpeg' : null) ||
      (container === 'wav' ? 'audio/wav' : null) ||
      (container === 'flac' ? 'audio/flac' : null) ||
      'application/octet-stream';

    const typedUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: preferredMime }));

    // 1) HTMLAudio PRIMA — non dipende da AudioContext (evita musica silenziosa fino al click)
    try {
      unlockAudioContextFromGesture();
      const handle = await playWithHtmlAudio(typedUrl, audioRef, options);
      log('[Runtime] Audio via HTMLAudio (' + (container || preferredMime) + ')', 'info');
      return handle;
    } catch (htmlErr) {
      log('HTMLAudio failed for "' + audioRef + '": ' + (htmlErr && htmlErr.message ? htmlErr.message : htmlErr), 'warning');
    }

    // 2) WebAudio SOLO se il context è già running (mai start in suspended = silenzio)
    const ctx = await ensureAudioContextRunning();
    if (ctx && ctx.state === 'running') {
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const handle = startWebAudioPlayback(ctx, audioBuffer, options);
        log('[Runtime] Audio via WebAudio (' + (container || 'unknown') + ', ' + audioBuffer.duration.toFixed(2) + 's)', 'info');
        return handle;
      } catch (decodeErr) {
        const hint = container === 'ogg'
          ? ' — OGG must be Vorbis or Opus'
          : '';
        log('WebAudio decode failed for "' + audioRef + '": ' + (decodeErr && decodeErr.message ? decodeErr.message : decodeErr) + hint, 'warning');
      }
    } else {
      log('AudioContext not running; cannot use WebAudio fallback for "' + audioRef + '"', 'warning');
    }

    log('Could not play audio "' + audioRef + '"', 'error');
    return null;
  }

  function normalizeResourceFileKey(fileRef) {
    const s = String(fileRef || '').trim();
    if (!s) return '';
    return s.split(/[/\\]/).pop().toLowerCase();
  }

  function makeResourceIndexEntry(assetId, publicUrl) {
    const id = String(assetId || '').trim();
    if (!id) return null;
    return {
      assetRef: id.startsWith('asset:') ? id : `asset:${id}`,
      publicUrl: publicUrl && String(publicUrl).trim() ? String(publicUrl).trim() : null
    };
  }

  function registerResourceFileAlias(index, fileName, assetId, publicUrl) {
    if (!index || !fileName || !assetId) return;
    const entry = makeResourceIndexEntry(assetId, publicUrl);
    if (!entry) return;
    const key = normalizeResourceFileKey(fileName);
    if (!key) return;
    index.set(key, entry);
    const withoutExt = key.replace(/\.[^.]+$/, '');
    if (withoutExt && withoutExt !== key) {
      index.set(withoutExt, entry);
    }
  }

  function loadResourcesCatalogIntoIndex(index, catalog) {
    if (!index || !Array.isArray(catalog)) return;
    for (const row of catalog) {
      if (!row || !row.assetId) continue;
      const url = row.publicUrl || null;
      registerResourceFileAlias(index, row.name, row.assetId, url);
      if (row.displayName) registerResourceFileAlias(index, row.displayName, row.assetId, url);
      if (row.fileName) registerResourceFileAlias(index, row.fileName, row.assetId, url);
    }
    if (catalog.length > 0 && catalog.every(r => !r.publicUrl)) {
      log('[Runtime] resourcesCatalog slim (senza publicUrl); URL da storage locale', 'info');
    }
  }

  /**
   * Indice nome file Resources (es. "chiave.png") → "asset:assetId".
   */
  async function refreshResourceFileIndex() {
    const projectId = getActualProjectId();
    if (!projectId) {
      return new Map();
    }

    const userId = projectInfo.userId || 'local';
    const cacheKey = `${userId}|${projectId}`;
    if (gameState.resourceFileIndex && gameState.resourceFileIndexKey === cacheKey) {
      return gameState.resourceFileIndex;
    }

    const index = new Map();

    if (gameState.projectData && Array.isArray(gameState.projectData.resourcesCatalog)) {
      loadResourcesCatalogIntoIndex(index, gameState.projectData.resourcesCatalog);
    }

    if (window.assetStorage && typeof window.assetStorage.listProjectResources === 'function') {
      try {
        const entries = await window.assetStorage.listProjectResources(projectId, userId);
        for (const entry of entries || []) {
          const aid = entry.assetId || normalizeResourceFileKey(entry.name).replace(/\.[^.]+$/, '');
          const url = entry.publicUrl || null;
          registerResourceFileAlias(index, entry.name, aid, url);
          if (entry.displayName) {
            registerResourceFileAlias(index, entry.displayName, aid, url);
          }
        }
      } catch (err) {
        log(`[Runtime] refreshResourceFileIndex: ${err.message}`, 'warning');
      }
    }

    gameState.resourceFileIndex = index;
    gameState.resourceFileIndexKey = cacheKey;
    log(`[Runtime] Resource file index: ${index.size} alias`, 'info');
    return index;
  }

  /**
   * Risolve il 4° parametro di spawn_object: asset:, URL, data: o nome file Resources ("sprite.png").
   */
  async function resolveSpawnObjectImageRef(imageRef) {
    const trimmed = String(imageRef == null ? '' : imageRef).trim();
    if (!trimmed) return '';

    if (
      trimmed.startsWith('asset:') ||
      trimmed.startsWith('data:') ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return trimmed;
    }

    const key = normalizeResourceFileKey(trimmed);
    const index = await refreshResourceFileIndex();
    const fromIndex = index.get(key);
    if (fromIndex) {
      const resolved = fromIndex.publicUrl || fromIndex.assetRef;
      log(`[Runtime] spawn_object: "${trimmed}" → ${resolved}`, 'info');
      return resolved;
    }

    const assetFileMatch = key.match(/^(asset_[\w-]+)\.(png|jpe?g|gif|webp|bmp|svg)$/);
    if (assetFileMatch) {
      return `asset:${assetFileMatch[1]}`;
    }

    if (RESOURCE_IMAGE_FILE_EXT.test(key)) {
      GameAPI.error(
        `spawn_object: immagine Resources "${trimmed}" non trovata. Controlla il nome in tab Resources (con estensione).`
      );
    }

    return trimmed;
  }

  function attachImageToRoomObject(objectId, imageSrc) {
    const url = imageSrc == null ? '' : String(imageSrc).trim();
    if (!url) return;

    const cached = AssetRegistry.images.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      const obj = findRoomObject(objectId);
      if (obj) obj.img = cached;
      return;
    }

    const categoryHint = url.startsWith('asset:') ? 'resource' : null;
    loadImage(url, categoryHint).then(img => {
      if (!img) {
        GameAPI.error(`spawn_object: impossibile caricare immagine (${url})`);
        return;
      }
      const obj = findRoomObject(objectId);
      if (obj) obj.img = img;
    }).catch(err => {
      GameAPI.error(`spawn_object: ${err && err.message ? err.message : err}`);
    });
  }

  async function resolveAssetId(assetId, category, roomName = null, characterName = null) {
    try {
      log(`[Runtime] resolveAssetId: assetId=${assetId}, category=${category}`, 'info');
      const storage = window.assetStorage;
      if (!storage || !storage.isAvailable()) return null;

      let actualProjectId = projectInfo.projectId;
      if (actualProjectId && actualProjectId.includes(':')) {
        actualProjectId = actualProjectId.split(':')[1];
      }
      if (!actualProjectId) return null;

      const useRoomSubfolder = category !== 'resource' && category !== 'gui' && category !== 'cursor';
      const subfolder = useRoomSubfolder
        ? (roomName ? `rooms/${roomName}` : (characterName ? `characters/${characterName}` : null))
        : null;

      const url = await storage.resolveAssetUrl(
        actualProjectId, assetId, category, null, projectInfo.userId || 'local', subfolder
      );
      if (url) {
        log(`[Runtime] resolveAssetId: URL da storage locale`, 'success');
        return url;
      }
      return null;
    } catch (error) {
      log(`[Runtime] resolveAssetId: error: ${error.message}`, 'error');
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

  /** Progetti legacy: script in scripts['Hotspot:id'] → rooms[].hotspots[].scripts.onClick */
  function mergeLegacyHotspotScriptsIntoRooms(projectObj) {
    if (!projectObj || !projectObj.scripts || !Array.isArray(projectObj.rooms)) return;
    for (const [key, content] of Object.entries(projectObj.scripts)) {
      if (!key.startsWith('Hotspot:')) continue;
      const hotspotId = key.slice('Hotspot:'.length);
      const legacyCode = String(content || '').trim();
      if (!legacyCode) continue;
      for (const room of projectObj.rooms) {
        if (!Array.isArray(room.hotspots)) continue;
        for (const h of room.hotspots) {
          if (String(h.id) !== hotspotId) continue;
          if (!h.scripts) h.scripts = {};
          if (!h.scripts.onClick) h.scripts.onClick = { code: '', enabled: false };
          const embedded = String(h.scripts.onClick.code || '').trim();
          if (!embedded) {
            h.scripts.onClick.code = legacyCode;
            h.scripts.onClick.enabled = true;
          }
        }
      }
    }
  }

  function resolveHotspotOnClickScript(hotspotId, hotspot) {
    let code = '';
    if (hotspot && hotspot.scripts && hotspot.scripts.onClick) {
      code = String(hotspot.scripts.onClick.code || '');
    }
    if (!code.trim()) {
      const legacyKey = `Hotspot:${hotspotId}`;
      if (gameState.scripts && gameState.scripts[legacyKey]) {
        code = String(gameState.scripts[legacyKey]);
        log(`[Runtime] Hotspot ${hotspotId}: codice da script legacy ${legacyKey}`, 'info');
      }
    }
    const hasCode = code.trim().length > 0;
    return { code, hasCode };
  }

  function isUseWithHandlerSuccess(outcome) {
    return !!(outcome && outcome.found && outcome.result === true);
  }

  // ============================================
  // INIZIALIZZAZIONE RUNTIME
  // ============================================
  function normalizeProjectDataForRuntime(projectData) {
    if (!projectData || typeof projectData !== 'object') {
      throw new Error('Invalid project data');
    }
    // Standalone HTML / .amnt mistake: unwrap package wrapper
    if (projectData.format === 'amianto-amnt' && projectData.project && typeof projectData.project === 'object') {
      projectData = projectData.project;
    }
    if (projectData.format !== 'amianto-game') {
      // Legacy / partial exports: accept game-shaped objects missing format
      const looksLikeGame = !!(projectData.settings || projectData.rooms || projectData.scripts);
      if (!looksLikeGame) {
        throw new Error('Unsupported project format. Expected: amianto-game');
      }
      projectData = Object.assign({}, projectData, { format: 'amianto-game' });
      if (projectData.version == null) projectData.version = 1;
      log('[Runtime] Project format missing — coerced to amianto-game', 'warning');
    }
    return projectData;
  }

  window.initRuntime = async function(projectData) {
    try {
      log('[Runtime] initRuntime chiamato', 'info');

      projectData = normalizeProjectDataForRuntime(projectData);

      mergeLegacyHotspotScriptsIntoRooms(projectData);

      // Se siamo in iframe, modalità playtest (sandboxed)
      if (isInIframe) {
        log('[Runtime] iframe mode (playtest) - sandboxed initialization', 'info');
        
        // In modalità iframe, carica solo i dati necessari per gli script
        gameState.projectData = projectData;
        gameState.scripts = projectData.scripts || {};
        gameState.attachments = projectData.attachments || {};
        invalidateResourceFileIndex();
        await initializeVariables(projectData.variables);
        loadInventory(projectData.inventory);

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

      // Ferma loop/interazione precedenti (reload playtest)
      stopGameLoop();
      gameState.initialized = false;

      // Reset stato
      gameState.projectData = projectData;
      gameState.variables.clear();
      gameState.variableDefinitions = new Map();
      gameState.objects.clear();
      gameState.guis.clear();
      gameState.inventory = createEmptyInventoryState();
      gameState.characters.clear();
      gameState.characterDefinitions.clear();
      gameState.cursors = new Map();
      gameState.scripts = projectData.scripts || {};
      gameState.attachments = projectData.attachments || {};
      
      // ⚠️ RESET CACHE SCRIPT: Pulisci la cache degli script compilati quando viene caricato un nuovo progetto
      // Questo garantisce che gli script vengano ricompilati con il nuovo contenuto
      gameState.compiledScripts.clear();
      gameState.compiledScriptHashes.clear();
      invalidateResourceFileIndex();
      stopAllAudioPlayback();
      resetInputLock();
      gameState.bootPhase = 'loading';
      log('[Runtime] Cache script compilati resettata', 'info');
      
      // ⚠️ RESET FLAG EVENTI: Quando viene caricato un nuovo progetto, reset flag eventi
      // Questo permette di bindare nuovamente gli eventi dopo il cleanup
      runtime.eventsBound = false;
      log('[Runtime] Flag eventi resettato (runtime.eventsBound=false)', 'info');
      
      // Reset AssetRegistry
      AssetRegistry.images.clear();
      AssetRegistry.fonts.clear();
      dialogFontLoadPromises.clear();
      AssetRegistry.isLoading = false;
      AssetRegistry.loadComplete = false;

      // Salva informazioni progetto per risolvere assetId
      // Prova prima da _meta nel progetto
      if (projectData._meta && projectData._meta.userId && projectData._meta.projectId) {
        projectInfo.userId = projectData._meta.userId;
        projectInfo.projectId = projectData._meta.projectId;
        log(`[Runtime] projectInfo impostato da _meta: userId=${projectInfo.userId}, projectId=${projectInfo.projectId}`, 'info');
      } else {
        projectInfo.userId = 'local';
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
            const activeProjectId = localStorage.getItem('amiantoActiveProjectId');
            if (activeProjectId) {
              projectInfo.projectId = activeProjectId;
              log(`[Runtime] projectInfo.projectId recuperato da localStorage amiantoActiveProjectId: ${projectInfo.projectId}`, 'info');
            } else {
              const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
              if (activeProjectName) {
                projectInfo.projectId = activeProjectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
                log(`[Runtime] projectInfo.projectId normalizzato da localStorage activeProjectName "${activeProjectName}" -> "${projectInfo.projectId}"`, 'info');
              }
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
      applyProjectRoomTransitionSettings(settings);

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

      try {
        await preloadDialogBoxFonts(projectData);
      } catch (fontErr) {
        log(`[Runtime] Dialog font preload: ${fontErr.message}`, 'warning');
      }

      // Verifica che il preload sia completato prima di procedere
      if (!AssetRegistry.loadComplete) {
        log('[Runtime] ATTENZIONE: Preload non completato, potrebbe causare problemi di rendering', 'warning');
      }

      updateLoadingMessage('Loading characters...');
      await loadCharacterDefinitions(projectData.characters || []);

      updateLoadingMessage('Loading cursors...');
      await loadCursors(projectData.cursors || []);

      updateLoadingMessage('Loading room animations...');
      await loadRoomAnimationDefinitions(projectData.roomAnimations || []);

      updateLoadingMessage('Loading dialogues...');
      loadDialogues(projectData.dialogues || []);

      updateLoadingMessage('Loading initial room...');
      const playerCharForStartRoom = (projectData.characters || []).find(char =>
        char.spawnSettings && char.spawnSettings.isPlayer === true
      );
      const playerStartRoomId = playerCharForStartRoom &&
        playerCharForStartRoom.spawnSettings &&
        playerCharForStartRoom.spawnSettings.roomId
        ? playerCharForStartRoom.spawnSettings.roomId
        : null;
      const startRoomId = settings.startRoom || settings.startRoomId || playerStartRoomId ||
        (projectData.rooms && projectData.rooms.length > 0 ? projectData.rooms[0].id : null);
      if (startRoomId) {
        await changeRoom(startRoomId, { skipRoomScripts: true });
      } else {
        log('[Runtime] No initial room specified', 'warning');
      }

      // Spawn automatico player all'avvio se configurato
      // IMPORTANTE: Spawna DOPO il cambio room, così il player è nella room corretta
      // Unifica spawnSettings (Characters) + settings.startX/Y legacy (stesso punto di spawn)
      const playerCharacter = (projectData.characters || []).find(char =>
        char.spawnSettings && char.spawnSettings.isPlayer === true
      );

      const legacyStartX = Number(settings.startX);
      const legacyStartY = Number(settings.startY);
      const hasLegacyStart = Number.isFinite(legacyStartX) && Number.isFinite(legacyStartY);

      if (playerCharacter && playerCharacter.spawnSettings) {
        const spawn = playerCharacter.spawnSettings;
        const charDef = gameState.characterDefinitions.get(playerCharacter.name);
        if (!charDef) {
          log(`[Runtime] Player "${playerCharacter.name}" not found in character definitions`, 'error');
        } else {
          let spawnX = Number(spawn.x);
          let spawnY = Number(spawn.y);
          if (!Number.isFinite(spawnX)) spawnX = 0;
          if (!Number.isFinite(spawnY)) spawnY = 0;
          // Se spawnSettings è ancora (0,0) ma esiste Start Position legacy, usala
          // (evita personaggio che "parte da un'altra parte" rispetto al marker in editor)
          let coordSource = 'spawnSettings';
          if (spawnX === 0 && spawnY === 0 && hasLegacyStart && (legacyStartX !== 0 || legacyStartY !== 0)) {
            const legacyName = settings.startingPlayer ? String(settings.startingPlayer) : '';
            if (!legacyName || legacyName === playerCharacter.name) {
              spawnX = legacyStartX;
              spawnY = legacyStartY;
              coordSource = 'settings.startX/Y (fallback)';
            }
          }
          const playerId = GameAPI.spawn_character(
            playerCharacter.name,
            spawnX,
            spawnY,
            spawn.direction || 'south'
          );
          if (playerId) {
            GameAPI.setVariable('playerId', playerId);
            log(`[Runtime] Player "${playerCharacter.name}" spawnato a (${spawnX}, ${spawnY}) via ${coordSource} in room ${gameState.currentRoomId}`, 'info');
          } else {
            log(`[Runtime] Error spawning player "${playerCharacter.name}"`, 'error');
          }
        }
      } else if (settings.startingPlayer && hasLegacyStart) {
        // PRIORITÀ 2: settings legacy (per retrocompatibilità)
        const charDef = gameState.characterDefinitions.get(settings.startingPlayer);
        if (!charDef) {
          log(`[Runtime] Player "${settings.startingPlayer}" not found in character definitions`, 'error');
        } else {
          const playerId = GameAPI.spawn_character(
            settings.startingPlayer,
            legacyStartX,
            legacyStartY,
            'south'
          );
          if (playerId) {
            GameAPI.setVariable('playerId', playerId);
            log(`[Runtime] Player "${settings.startingPlayer}" spawnato da settings legacy a (${legacyStartX}, ${legacyStartY}) in room ${gameState.currentRoomId}`, 'info');
          } else {
            log(`[Runtime] Error spawning player "${settings.startingPlayer}"`, 'error');
          }
        }
      }

      updateLoadingMessage('Loading GUI...');
      await loadGUIs(projectData.guis || []);

      updateLoadingMessage('Loading inventory...');
      loadInventory(projectData.inventory);

      gameState.initialized = true;

      // Game loop sotto l'overlay: gli script possono await / avanzare animazioni
      // PRIMA che il giocatore veda il canvas (così set_character_visibility in on_game_start
      // non lascia un frame col player ancora visibile).
      setupInteraction();
      startGameLoop();

      updateLoadingMessage('Compiling scripts...');
      compileAllProjectScripts();

      gameState.bootPhase = 'scripts';
      updateLoadingMessage('Running initial scripts...');

      // Sblocca audio prima di on_game_start / play_music (niente attesa del primo click in Electron)
      await tryAutoUnlockAudioAtBoot();

      await executeGameStartScripts();

      if (startRoomId) {
        await executeBeforeRoomChangeScripts(null, startRoomId);
        await executeRoomChangeScripts(null, startRoomId);
      }

      // Rivela il gioco solo dopo gli script iniziali (visibilità/opacity già applicate)
      hideLoadingOverlay();
      markBootReady();

      refreshResourceFileIndex().catch(err => {
        log(`[Runtime] Resource index preload: ${err.message}`, 'warning');
      });

      if (gameState.isRunning) {
        log('[Runtime] Runtime inizializzato con successo - game loop avviato', 'success');
      } else if (gameState.currentRoom) {
        log('[Runtime] All assets loaded, starting render...', 'info');
        startGameLoop();
      } else {
        if (!gameState.currentRoom) {
          log('[Runtime] Runtime initialized but no room available', 'warning');
        }
        if (!AssetRegistry.loadComplete) {
          log('[Runtime] Runtime initialized but preload not complete', 'warning');
        }
        startGameLoop();
      }

      if (window.opener && !isInIframe) {
        sendToEditor({
          type: 'PLAYTEST_RUNTIME_READY',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      log(`Runtime initialization error: ${error.message}`, 'error');
      console.error(error);
      gameState.bootPhase = 'error';
      hideLoadingOverlay();
      // Re-throw so standalone HTML boot can show #boot-error (playtest callers should .catch)
      throw error;
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
        if (gui.type === 'DialogBox' && gui.settings && typeof gui.settings.balloon === 'string' && gui.settings.balloon) {
          assetsWithCategory.set(gui.settings.balloon, { category: 'gui', roomName: null, characterName: null });
        }
      });
    }

    // Inventory (background, toggle icon, item images)
    // After prepareProjectPayloadForRepos / .amnt save, fields are often *Ref (imageRef, backgroundRef).
    const invData = projectData.inventory;
    if (invData && typeof invData === 'object' && !Array.isArray(invData)) {
      const invBg = invData.backgroundRef || invData.background;
      if (invBg && typeof invBg === 'string') {
        assetsWithCategory.set(invBg, { category: 'gui', roomName: null, characterName: null });
      }
      const invToggle = invData.toggleIconRef || invData.toggleIcon;
      if (invToggle && typeof invToggle === 'string') {
        assetsWithCategory.set(invToggle, { category: 'gui', roomName: null, characterName: null });
      }
      if (Array.isArray(invData.items)) {
        invData.items.forEach(item => {
          if (!item) return;
          const itemImg = item.imageRef || item.image;
          if (itemImg && typeof itemImg === 'string') {
            assetsWithCategory.set(itemImg, { category: 'gui', roomName: null, characterName: null });
          }
        });
      }
    }

    // Room animation catalog frames (tab Animations)
    if (projectData.roomAnimations && Array.isArray(projectData.roomAnimations)) {
      projectData.roomAnimations.forEach(anim => {
        const animName = anim && (anim.name || anim.id) ? String(anim.name || anim.id) : 'animation';
        if (anim.frames && Array.isArray(anim.frames)) {
          anim.frames.forEach(frameRef => {
            if (frameRef && typeof frameRef === 'string') {
              assetsWithCategory.set(frameRef, {
                category: 'animation',
                roomName: null,
                characterName: null,
                animationName: animName
              });
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
          const collectCharacterFrameAssets = (directionsMap) => {
            if (!directionsMap) return;
            Object.values(directionsMap).forEach(dirData => {
              if (dirData.frames && Array.isArray(dirData.frames)) {
                dirData.frames.forEach(frame => {
                  if (frame && typeof frame === 'object' && frame.mirror) return;
                  if (frame && typeof frame === 'string') {
                    assetsWithCategory.set(frame, { category: 'character', roomName: null, characterName });
                  }
                });
              }
            });
          };
          collectCharacterFrameAssets(char.directions);
          if (char.animations) {
            Object.values(char.animations).forEach(anim => collectCharacterFrameAssets(anim.directions));
          }
          if (char.portraits && typeof char.portraits === 'object') {
            Object.values(char.portraits).forEach(ref => {
              if (ref && typeof ref === 'string') {
                assetsWithCategory.set(ref, { category: 'character', roomName: null, characterName });
              }
            });
          }
        });
      }

      // Category cursors
      if (projectData.cursors && Array.isArray(projectData.cursors)) {
        projectData.cursors.forEach(c => {
          if (c && c.category && c.cursorImage && typeof c.cursorImage === 'string') {
            assetsWithCategory.set(c.cursorImage, { category: 'cursor', roomName: null, characterName: null });
          }
        });
      }

      // Dialogue line portraits (optional overrides on nodes)
      if (Array.isArray(projectData.dialogues)) {
        projectData.dialogues.forEach(dlg => {
          if (!dlg || !dlg.nodes || typeof dlg.nodes !== 'object') return;
          Object.values(dlg.nodes).forEach(node => {
            if (node && node.portrait && typeof node.portrait === 'string') {
              assetsWithCategory.set(node.portrait, { category: 'gui', roomName: null, characterName: null });
            }
          });
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
  async function changeRoom(roomId, options = {}) {
    const skipRoomScripts = options.skipRoomScripts === true;
    // load_room posiziona il player e poi gira on_room_change: non bloccare il load sugli after-script
    const skipAfterRoomScripts = options.skipAfterRoomScripts === true;
    if (!gameState.projectData || !gameState.projectData.rooms) {
      log('No project loaded', 'error');
      return;
    }

    const room = gameState.projectData.rooms.find(r => r.id === roomId || r.name === roomId);
    if (!room) {
      log(`Room not found: ${roomId}`, 'error');
      return;
    }

    // Canonico: sempre l'id di progetto (gli attachment Room: sono keyed per id)
    const resolvedRoomId = String(room.id || roomId);

    log(`[Runtime] Cambio room: ${resolvedRoomId}`, 'info');

    endAllDialogue();

    const oldRoomId = gameState.currentRoomId;

    // Prima del caricamento: stanza precedente ancora attiva
    if (!skipRoomScripts) {
      await executeBeforeRoomChangeScripts(oldRoomId, resolvedRoomId);
    }

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
    const animationInstances = [];
    if (room.animationInstances && Array.isArray(room.animationInstances)) {
      for (const instData of room.animationInstances) {
        const animDef = gameState.roomAnimationDefinitions.get(instData.animationId);
        if (!animDef || !animDef.frames || animDef.frames.length === 0) {
          log(`[Runtime] Room animation instance skipped (missing definition): ${instData.id || instData.name}`, 'warning');
          continue;
        }
        const loopDefault = animDef.loop !== false;
        animationInstances.push({
          id: instData.id || `ainst_${Date.now()}`,
          animationId: instData.animationId,
          name: instData.name || instData.id || 'Animation',
          x: Number(instData.x) || 0,
          y: Number(instData.y) || 0,
          layer: instData.layer === 'foreground' ? 'foreground' : 'background',
          visible: instData.visible !== false,
          loopDefault,
          loopOpt: parseAudioLoopOption(null, loopDefault),
          cyclesRemaining: null,
          currentFrame: 0,
          frameTime: 0,
          playing: instData.autoPlay === true
        });
      }
    }

    gameState.currentRoomId = resolvedRoomId;
    gameState.currentRoom = {
      ...room,
      backgroundImg,
      foregrounds,
      objects,
      animationInstances,
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
        character.roomId = resolvedRoomId;
        // Interrompi walk in corso (coordinate della stanza precedente non sono valide)
        character.isMoving = false;
        character.path = null;
        character.pathIndex = 0;
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
               (spawn.roomId === resolvedRoomId || spawn.roomId === roomId);
      });

      for (const npcData of roomNPCs) {
        const spawn = npcData.spawnSettings;
        // Verifica che il character non sia già spawnato
        let alreadySpawned = false;
        gameState.characters.forEach((character) => {
          if (character.name === npcData.name && character.roomId === resolvedRoomId) {
            alreadySpawned = true;
          }
        });

        if (!alreadySpawned) {
          const nx = Number(spawn.x);
          const ny = Number(spawn.y);
          const spawnX = Number.isFinite(nx) ? nx : 0;
          const spawnY = Number.isFinite(ny) ? ny : 0;
          const npcId = GameAPI.spawn_character(
            npcData.name,
            spawnX,
            spawnY,
            spawn.direction || 'south'
          );
          if (npcId) {
            log(`[Runtime] NPC "${npcData.name}" spawnato automaticamente in room ${resolvedRoomId} a (${spawnX}, ${spawnY})`, 'info');
          }
        }
      }
    }

    // Dopo il caricamento: on_room_change (saltato se load_room lo esegue dopo aver posizionato il player)
    if (!skipRoomScripts && !skipAfterRoomScripts) {
      await executeRoomChangeScripts(oldRoomId, resolvedRoomId);
    }

    log(`[Runtime] Room changed: ${resolvedRoomId} (bg: ${backgroundImg ? 'ok' : 'missing'}, fg: ${foregrounds.length}, obj: ${objects.length}, hotspots: ${hotspots.length}, anims: ${animationInstances.length})`, 'info');
  }

  /**
   * Carica stanza + animazioni per script (sandbox iframe / RUN_SCRIPT) quando manca currentRoom.
   */
  async function ensureCurrentRoomForScripts(roomId) {
    const targetRoomId = roomId || gameState.currentRoomId;
    if (!targetRoomId || !gameState.projectData) return;
    if (gameState.currentRoom && gameState.currentRoomId === targetRoomId &&
        Array.isArray(gameState.currentRoom.animationInstances)) {
      return;
    }

    if (gameState.roomAnimationDefinitions.size === 0) {
      if (!AssetRegistry.loadComplete && gameState.projectData) {
        try {
          await preloadAssets(gameState.projectData);
        } catch (preloadErr) {
          log(`[Runtime] ensureCurrentRoomForScripts preload: ${preloadErr.message}`, 'warning');
        }
      }
      await loadRoomAnimationDefinitions(gameState.projectData.roomAnimations || []);
    }

    await changeRoom(targetRoomId);
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
      // id === name sempre (se divergono in progetti legacy, vince name)
      const characterName = String(charData.name || charData.id || '').trim();
      if (!characterName) {
        log('[Runtime] Character ignorato: nome mancante', 'warning');
        continue;
      }
      if (charData.id && charData.name && String(charData.id) !== String(charData.name)) {
        log(`[Runtime] Character id "${charData.id}" ≠ name "${charData.name}" — uso name come id`, 'warning');
      }

      const loadDirectionsMap = (sourceDirections) => {
        const directions = {};
        if (!sourceDirections) return directions;
        for (const [dir, dirData] of Object.entries(sourceDirections)) {
          if (dirData && dirData.frames && Array.isArray(dirData.frames)) {
            const frames = [];
            for (const frame of dirData.frames) {
              if (frame && typeof frame === 'object' && frame.mirror) {
                frames.push({ mirror: frame.mirror });
              } else if (frame && typeof frame === 'string') {
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
        return directions;
      };

      const directions = loadDirectionsMap(charData.directions);
      const animations = {};
      if (charData.animations && typeof charData.animations === 'object') {
        for (const [animName, animData] of Object.entries(charData.animations)) {
          if (!animName || !animData) continue;
          const animDirections = loadDirectionsMap(animData.directions);
          if (Object.keys(animDirections).length > 0) {
            animations[animName] = { directions: animDirections };
          }
        }
      }

      if (Object.keys(directions).length > 0 || Object.keys(animations).length > 0) {
        const charDef = { directions };
        if (Object.keys(animations).length > 0) {
          charDef.animations = animations;
        }
        // Load pivot if it exists
        if (charData.pivotX !== undefined && charData.pivotY !== undefined) {
          charDef.pivotX = Number(charData.pivotX) || 0;
          charDef.pivotY = Number(charData.pivotY) || 0;
        }
        // Load spawnSettings if it exists (per spawn automatico)
        if (charData.spawnSettings) {
          charDef.spawnSettings = charData.spawnSettings;
        }
        charDef.id = characterName;
        charDef.name = characterName;
        // Optional dialogue portraits: { default: url, happy: url, ... }
        if (charData.portraits && typeof charData.portraits === 'object') {
          const portraits = {};
          Object.keys(charData.portraits).forEach(moodKey => {
            const ref = charData.portraits[moodKey];
            if (typeof ref === 'string' && ref.trim()) {
              portraits[String(moodKey).trim()] = ref.trim();
            }
          });
          if (Object.keys(portraits).length) charDef.portraits = portraits;
        }
        gameState.characterDefinitions.set(characterName, charDef);
        const animCount = Object.keys(animations).length;
        log(`[Runtime] Character definizione caricata: ${characterName} (${Object.keys(directions).length} walk dir${animCount ? `, ${animCount} custom anim` : ''})`, 'info');
      } else {
        log(`[Runtime] Character ignorato: ${characterName} (nessuna direzione valida)`, 'warning');
      }
    }

    log(`[Runtime] Character definitions loaded: ${gameState.characterDefinitions.size} character(s)`, 'success');
  }

  async function loadRoomAnimationDefinitions(animationsData) {
    gameState.roomAnimationDefinitions.clear();
    if (!Array.isArray(animationsData) || animationsData.length === 0) {
      log('[Runtime] No room animations to load', 'info');
      return;
    }

    log(`[Runtime] Loading ${animationsData.length} room animation definition(s)...`, 'info');
    for (const src of animationsData) {
      if (!src || !src.id) continue;
      const frames = [];
      if (Array.isArray(src.frames)) {
        for (const frameRef of src.frames) {
          if (frameRef && typeof frameRef === 'string') {
            let img = AssetRegistry.images.get(frameRef);
            if (!img || !img.complete || img.naturalWidth <= 0) {
              try {
                img = await loadImage(frameRef, 'animation');
              } catch (loadErr) {
                log(`[Runtime] Room animation frame load failed: ${src.id} (${String(frameRef).substring(0, 50)}) — ${loadErr.message}`, 'warning');
                img = null;
              }
            }
            if (img && img.complete && img.naturalWidth > 0) {
              frames.push(img);
            } else {
              log(`[Runtime] Room animation frame not found in registry: ${src.id} (${String(frameRef).substring(0, 50)})`, 'warning');
            }
          }
        }
      }
      if (frames.length > 0) {
        gameState.roomAnimationDefinitions.set(src.id, {
          id: src.id,
          name: src.name || src.id,
          fps: Number(src.fps) || 8,
          loop: src.loop !== false,
          layer: src.layer === 'foreground' ? 'foreground' : 'background',
          frames
        });
        log(`[Runtime] Room animation loaded: ${src.name || src.id} (${frames.length} frame(s))`, 'info');
      }
    }
    log(`[Runtime] Room animation definitions loaded: ${gameState.roomAnimationDefinitions.size}`, 'success');
  }

  function findRoomAnimationInstance(idOrName) {
    const room = gameState.currentRoom;
    if (!room || !Array.isArray(room.animationInstances)) return null;
    const key = String(idOrName).trim();
    if (!key) return null;

    const byIdOrName = room.animationInstances.find(i => i.id === key || i.name === key);
    if (byIdOrName) return byIdOrName;

    const byAnimRef = room.animationInstances.filter(i => {
      if (i.animationId === key) return true;
      const def = gameState.roomAnimationDefinitions.get(i.animationId);
      return def && (def.id === key || def.name === key);
    });
    if (byAnimRef.length === 1) return byAnimRef[0];
    if (byAnimRef.length > 1) {
      log(`[Runtime] play_animation: multiple instances match "${key}", using "${byAnimRef[0].name}"`, 'warning');
      return byAnimRef[0];
    }
    return null;
  }

  function getRoomAnimationFrameImage(animDef, frameIndex) {
    if (!animDef || !animDef.frames || !animDef.frames.length) return null;
    const idx = Math.max(0, Math.min(frameIndex, animDef.frames.length - 1));
    return animDef.frames[idx];
  }

  function updateRoomAnimationInstance(inst, animDef, deltaTime) {
    if (!inst.playing || inst.visible === false) return;
    if (!animDef || !animDef.frames || animDef.frames.length === 0) return;

    if (animDef.frames.length === 1) {
      inst.currentFrame = 0;
      if (inst.loopOpt && inst.loopOpt.mode === 'once') inst.playing = false;
      return;
    }

    inst.frameTime += deltaTime;
    const frameDuration = 1000 / (Number(animDef.fps) || 8);
    if (frameDuration <= 0) return;

    while (inst.frameTime >= frameDuration) {
      inst.frameTime -= frameDuration;
      inst.currentFrame++;

      if (inst.currentFrame < animDef.frames.length) {
        continue;
      }

      const loopOpt = inst.loopOpt || parseAudioLoopOption(null, animDef.loop !== false);
      if (loopOpt.mode === 'infinite') {
        inst.currentFrame = 0;
        break;
      }
      if (loopOpt.mode === 'count') {
        if (inst.cyclesRemaining == null) inst.cyclesRemaining = loopOpt.count;
        inst.cyclesRemaining -= 1;
        if (inst.cyclesRemaining > 0) {
          inst.currentFrame = 0;
          continue;
        }
      }
      inst.playing = false;
      inst.currentFrame = animDef.frames.length - 1;
      inst.cyclesRemaining = null;
      break;
    }
  }

  function drawRoomAnimationInstanceOnCanvas(ctx, inst) {
    if (!inst || inst.visible === false) return;
    const animDef = gameState.roomAnimationDefinitions.get(inst.animationId);
    if (!animDef) return;
    const frameIndex = inst.playing ? inst.currentFrame : 0;
    const frame = getRoomAnimationFrameImage(animDef, frameIndex);
    if (!frame || !frame.complete || frame.naturalWidth <= 0) return;
    try {
      ctx.drawImage(frame, inst.x, inst.y);
    } catch (error) {
      log(`[Runtime] Error rendering room animation ${inst.id}: ${error.message}`, 'warning');
    }
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

  function getCharacterDirectionsStore(charDef, animationName) {
    if (!charDef) return null;
    if (animationName && charDef.animations && charDef.animations[animationName]) {
      return charDef.animations[animationName].directions;
    }
    return charDef.directions;
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
  function findAvailableDirection(charDef, preferredDirection, animationName = null) {
    const directionsStore = getCharacterDirectionsStore(charDef, animationName);
    if (!directionsStore) return preferredDirection;

    // Se la direzione preferita è disponibile, usala
    if (directionsStore[preferredDirection]) {
      const dirData = directionsStore[preferredDirection];
      if (dirData.frames && dirData.frames.length > 0) {
        return preferredDirection;
      }
    }
    
    // Cerca tra le direzioni alternative (fallback)
    const fallbackDirections = directionFallbackMap[preferredDirection] || ['south', 'north', 'east', 'west'];
    for (const fallbackDir of fallbackDirections) {
      if (directionsStore[fallbackDir]) {
        const dirData = directionsStore[fallbackDir];
        if (dirData.frames && dirData.frames.length > 0) {
          return fallbackDir;
        }
      }
    }
    
    // Se non troviamo nulla tra le direzioni simili, prova tutte le direzioni disponibili
    const allDirections = Object.keys(directionsStore);
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
        const dirData = directionsStore[dir];
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
  function findFallbackFrame(charDef, preferredDirection, frameIndex, fallbackDirections, animationName = null) {
    const directionsStore = getCharacterDirectionsStore(charDef, animationName);
    if (!directionsStore) return null;

    for (const fallbackDir of fallbackDirections) {
      const dirData = directionsStore[fallbackDir];
      if (!dirData || !dirData.frames || dirData.frames.length === 0) {
        continue;
      }

      const actualFrameIndex = frameIndex % dirData.frames.length;
      const frame = dirData.frames[actualFrameIndex];

      // Se è un frame specchiato, prova a ottenerlo
      if (frame && typeof frame === 'object' && frame.mirror) {
        const sourceDir = frame.mirror;
        const sourceDirData = directionsStore[sourceDir];
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
   * @param {string|null} animationName - Nome animazione custom (da charDef.animations); null = walking
   */
  function getCharacterFrame(characterName, direction, frameIndex, animationName = null) {
    const charDef = gameState.characterDefinitions.get(characterName);
    if (!charDef) {
      return null;
    }

    const directionsStore = getCharacterDirectionsStore(charDef, animationName);
    if (!directionsStore) return null;

    const cachePrefix = animationName || 'walk';

    // Prova prima con la direzione richiesta
    if (directionsStore[direction]) {
      const dirData = directionsStore[direction];
      if (dirData.frames && dirData.frames.length > 0) {
        const actualFrameIndex = frameIndex % dirData.frames.length;
        const frame = dirData.frames[actualFrameIndex];

        // Se è un frame specchiato, ottieni il frame originale e specchialo
        if (frame && typeof frame === 'object' && frame.mirror) {
          const sourceDir = frame.mirror;
          const cacheKey = `${cachePrefix}_${characterName}_${direction}_${actualFrameIndex}`;
          
          if (mirroredFrameCache.has(cacheKey)) {
            return mirroredFrameCache.get(cacheKey);
          }

          const sourceDirData = directionsStore[sourceDir];
          if (sourceDirData && sourceDirData.frames && sourceDirData.frames.length > 0) {
            const sourceFrame = sourceDirData.frames[actualFrameIndex % sourceDirData.frames.length];
            if (sourceFrame && sourceFrame.complete && sourceFrame.naturalWidth > 0) {
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
        } else if (frame && frame.complete && frame.naturalWidth > 0) {
          return frame;
        }
      }
    }

    const fallbackDirections = directionFallbackMap[direction] || ['south', 'north', 'east', 'west'];
    const fallbackFrame = findFallbackFrame(charDef, direction, frameIndex, fallbackDirections, animationName);
    if (fallbackFrame) return fallbackFrame;

    const allDirections = Object.keys(directionsStore);
    if (allDirections.length > 0) {
      const priorityOrder = ['south', 'north', 'east', 'west', 'southeast', 'southwest', 'northeast', 'northwest'];
      const sortedDirections = allDirections.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      const anyFrame = findFallbackFrame(charDef, direction, frameIndex, sortedDirections, animationName);
      if (anyFrame) return anyFrame;
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
          
          const role = btnData.role === 'saveSlot' ? 'saveSlot' : (btnData.role || 'button');
          const btnOut = {
            id: btnData.id,
            name: btnData.name || btnData.id,
            x: Number(btnData.x) || 0,
            y: Number(btnData.y) || 0,
            w: Number(btnData.w) || 0,
            h: Number(btnData.h) || 0,
            text: btnData.text || '',
            backgroundImage: btnImg,
            enabled: true,
            role
          };
          if (role === 'saveSlot') {
            btnOut.slotKey = String(
              btnData.slotKey != null && btnData.slotKey !== ''
                ? btnData.slotKey
                : (buttons.filter(b => b.role === 'saveSlot').length + 1)
            );
          }
          buttons.push(btnOut);
        }
      }

      let balloonImage = null;
      const guiType = guiData.type || 'MainInterface';
      if (guiType === 'DialogBox' && guiData.settings && typeof guiData.settings.balloon === 'string' && guiData.settings.balloon) {
        balloonImage = AssetRegistry.images.get(guiData.settings.balloon);
        if (!balloonImage || !balloonImage.complete) {
          log(`[Runtime] Dialog balloon not found in registry: ${guiData.id}`, 'warning');
          balloonImage = null;
        }
      }

      const settings = guiData.settings || {};
      let visible = true;
      if (guiType === 'SaveLoad') {
        visible = settings.startVisible === true;
      } else if (typeof settings.startVisible === 'boolean') {
        visible = settings.startVisible;
      }

      gameState.guis.set(guiData.id, {
        id: guiData.id,
        name: guiData.name || guiData.id,
        type: guiType,
        settings,
        background: backgroundImg,
        balloonImage,
        buttons,
        visible
      });

      log(`[Runtime] GUI caricata: ${guiData.id} (type: ${guiType}, visible: ${visible}, bg: ${backgroundImg ? 'ok' : 'mancante'}, buttons: ${buttons.length})`, 'info');
    }

    log(`[Runtime] GUI loading complete: ${guisData.length} GUI(s) loaded`, 'success');
  }

  function resolveGuiByIdOrName(idOrName) {
    if (idOrName == null || idOrName === '') return null;
    const key = String(idOrName);
    if (gameState.guis.has(key)) return gameState.guis.get(key);
    for (const gui of gameState.guis.values()) {
      if (gui && gui.name === key) return gui;
    }
    return null;
  }

  function setGuiVisible(idOrName, visible) {
    const gui = resolveGuiByIdOrName(idOrName);
    if (!gui) {
      log(`[Runtime] setGuiVisible: GUI "${idOrName}" not found`, 'warning');
      return false;
    }
    gui.visible = !!visible;
    return true;
  }

  function formatSaveSlotLabel(info, emptyLabel, slotKey) {
    if (!info) return emptyLabel || 'Empty';
    const label = (info.label && String(info.label).trim()) ? String(info.label).trim() : '';
    const when = info.savedAt ? String(info.savedAt).replace('T', ' ').slice(0, 16) : '';
    if (label && when) return `${label}\n${when}`;
    if (label) return label;
    if (when) return when;
    return `Slot ${slotKey}`;
  }

  function getSaveLoadMode(gui) {
    const mode = gui && gui.settings && gui.settings.mode;
    if (mode === 'save' || mode === 'load' || mode === 'both') return mode;
    return 'both';
  }

  async function handleSaveLoadSlotClick(gui, btn) {
    const slotKey = String(btn.slotKey != null ? btn.slotKey : '1');
    const mode = getSaveLoadMode(gui);
    const info = (typeof GameAPI.get_save_info === 'function') ? GameAPI.get_save_info(slotKey) : null;
    const filled = !!(info && (info.savedAt || info.label || info.roomId));

    if (mode === 'load') {
      if (!filled) {
        if (typeof GameAPI.show_message === 'function') {
          await GameAPI.show_message('Empty save slot.');
        }
        return true;
      }
      const result = await GameAPI.load_game(slotKey);
      if (result && result.ok) gui.visible = false;
      return true;
    }

    if (mode === 'save') {
      const roomId = gameState.currentRoomId || '';
      const label = roomId ? `Room ${roomId}` : `Slot ${slotKey}`;
      GameAPI.save_game(slotKey, label);
      if (typeof GameAPI.show_message === 'function') {
        await GameAPI.show_message(`Saved to slot ${slotKey}.`);
      }
      return true;
    }

    // both: empty → save, filled → load
    if (filled) {
      const result = await GameAPI.load_game(slotKey);
      if (result && result.ok) gui.visible = false;
    } else {
      const roomId = gameState.currentRoomId || '';
      const label = roomId ? `Room ${roomId}` : `Slot ${slotKey}`;
      GameAPI.save_game(slotKey, label);
      if (typeof GameAPI.show_message === 'function') {
        await GameAPI.show_message(`Saved to slot ${slotKey}.`);
      }
    }
    return true;
  }

  async function handleVisibleSaveLoadGuiClick(x, y) {
    for (const gui of gameState.guis.values()) {
      if (gui.type !== 'SaveLoad' || gui.visible === false) continue;

      if (gui.buttons && Array.isArray(gui.buttons)) {
        for (const btn of gui.buttons) {
          if (!btn.enabled) continue;
          if (x < btn.x || x > btn.x + btn.w || y < btn.y || y > btn.y + btn.h) continue;

          if (btn.role === 'saveSlot') {
            log(`Click save slot GUI: ${btn.name} (key ${btn.slotKey})`, 'info');
            await handleSaveLoadSlotClick(gui, btn);
            return true;
          }

          log(`Click su pulsante GUI: ${btn.name}`, 'info');
          const guiScripts = gameState.attachments.guiScripts || {};
          if (typeof guiScripts === 'object' && guiScripts[btn.id]) {
            const scriptName = guiScripts[btn.id];
            if (gameState.scripts[scriptName]) {
              await executeScriptHandler(gameState.scripts[scriptName], 'on_gui_click', [btn.id, x, y], scriptName);
            }
          }
          for (const handler of eventHandlers.gui_click) {
            try {
              handler(btn.id, x, y);
            } catch (error) {
              log(`Errore handler on_gui_click: ${error.message}`, 'error');
            }
          }
          return true;
        }
      }

      if (gui.settings && gui.settings.closeOnClickOutside !== false) {
        log(`[Runtime] SaveLoad GUI "${gui.name}": click outside → hide`, 'info');
        gui.visible = false;
      }
      return true; // modal: swallow click even if close disabled
    }
    return false;
  }

  function renderSaveLoadSlot(ctx, gui, btn) {
    const emptyLabel = (gui.settings && gui.settings.emptyLabel) || 'Empty';
    const slotKey = String(btn.slotKey != null ? btn.slotKey : '1');
    let info = null;
    try {
      info = GameAPI.get_save_info(slotKey);
    } catch (_) {
      info = null;
    }
    const filled = !!(info && (info.savedAt || info.label || info.roomId));

    if (btn.backgroundImage && btn.backgroundImage.complete && btn.backgroundImage.naturalWidth > 0) {
      try {
        ctx.drawImage(btn.backgroundImage, btn.x, btn.y, btn.w, btn.h);
      } catch (_) { /* ignore */ }
    } else {
      ctx.fillStyle = filled ? 'rgba(180, 100, 255, 0.28)' : 'rgba(180, 100, 255, 0.12)';
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = '#b464ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
      ctx.setLineDash([]);
    }

    const lines = formatSaveSlotLabel(info, emptyLabel, slotKey).split('\n');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const midY = btn.y + btn.h / 2;
    if (lines.length === 1) {
      ctx.fillText(lines[0], btn.x + btn.w / 2, midY);
    } else {
      ctx.fillText(lines[0], btn.x + btn.w / 2, midY - 8);
      ctx.font = '11px Arial';
      ctx.fillText(lines[1], btn.x + btn.w / 2, midY + 10);
    }
  }

  // ============================================
  // SISTEMA DIALOGHI (DialogBox GUI + balloon)
  // ============================================
  const DIALOGUE_MAX_TEXT_WIDTH = 280;
  const DIALOGUE_PADDING = 14;
  const DIALOGUE_GAP_ABOVE_CHARACTER = 10;
  const DIALOGUE_FADE_MS = 250;
  const DIALOGUE_FONT_SIZE_MIN = 8;
  const DIALOGUE_FONT_SIZE_MAX = 96;
  const DIALOGUE_PORTRAIT_SIZE = 96;
  const DIALOGUE_PORTRAIT_GAP = 10;

  let activeDialogue = null;
  /**
   * Sessione di dialogo a grafo (start_dialogue).
   * { dialogueId, abortRequested, choiceState: null | { options, resolver } }
   */
  let activeDialogueSession = null;
  const dialogFontLoadPromises = new Map();

  const DIALOGUE_CHOICE_PAD_X = 16;
  const DIALOGUE_CHOICE_PAD_Y = 10;
  const DIALOGUE_CHOICE_GAP = 8;
  const DIALOGUE_CHOICE_BOTTOM_MARGIN = 24;

  function clampDialogueFontSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 16;
    return Math.max(DIALOGUE_FONT_SIZE_MIN, Math.min(DIALOGUE_FONT_SIZE_MAX, Math.round(n)));
  }

  function normalizeDialogBoxSettings(settings) {
    const s = settings || {};
    return {
      backgroundColor: s.backgroundColor || '#1a1a2e',
      textColor: s.textColor || '#ffffff',
      boxBorderColor: s.boxBorderColor || '#39ff14',
      fontSize: clampDialogueFontSize(s.fontSize),
      fontFamily: (typeof s.fontFamily === 'string' && s.fontFamily.trim()) ? s.fontFamily.trim() : '',
      customFont: (typeof s.customFont === 'string' && s.customFont.trim()) ? s.customFont.trim() : '',
      appear: s.appear || 'instant'
    };
  }

  function buildDialogueFontCss(settings) {
    const size = clampDialogueFontSize(settings && settings.fontSize);
    const hasCustom = settings && settings.customFont && settings.fontFamily;
    const family = hasCustom
      ? `"${settings.fontFamily}", Arial, sans-serif`
      : 'Arial, sans-serif';
    return `${size}px ${family}`;
  }

  function getDialogueLineHeight(fontSize) {
    return Math.max(12, Math.round(clampDialogueFontSize(fontSize) * 1.25));
  }

  async function resolveDialogueFontUrl(fontRef) {
    if (!fontRef || typeof fontRef !== 'string') return null;
    if (fontRef.startsWith('data:') || fontRef.startsWith('http')) return fontRef;
    if (fontRef.startsWith('asset:')) {
      const assetId = fontRef.replace('asset:', '');
      const url = await resolveAssetId(assetId, 'gui');
      return url || null;
    }
    return fontRef;
  }

  async function ensureDialogueFontLoaded(fontRef, fontFamily) {
    if (!fontRef || !fontFamily) return null;
    const key = `${fontRef}|${fontFamily}`;
    if (AssetRegistry.fonts.has(key)) {
      return AssetRegistry.fonts.get(key);
    }
    if (dialogFontLoadPromises.has(key)) {
      return dialogFontLoadPromises.get(key);
    }
    const promise = (async () => {
      try {
        if (typeof FontFace === 'undefined' || !document.fonts) {
          return null;
        }
        const url = await resolveDialogueFontUrl(fontRef);
        if (!url) return null;
        const face = new FontFace(fontFamily, `url(${url})`);
        await face.load();
        document.fonts.add(face);
        AssetRegistry.fonts.set(key, fontFamily);
        return fontFamily;
      } catch (err) {
        log(`[Runtime] Dialog font load failed (${fontFamily}): ${err.message}`, 'warning');
        return null;
      } finally {
        dialogFontLoadPromises.delete(key);
      }
    })();
    dialogFontLoadPromises.set(key, promise);
    return promise;
  }

  async function preloadDialogBoxFonts(projectData) {
    if (!projectData.guis || !Array.isArray(projectData.guis)) return;
    const tasks = [];
    projectData.guis.forEach(gui => {
      if (gui.type !== 'DialogBox' || !gui.settings) return;
      const st = normalizeDialogBoxSettings(gui.settings);
      if (st.customFont && st.fontFamily) {
        tasks.push(ensureDialogueFontLoaded(st.customFont, st.fontFamily));
      }
    });
    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
  }

  function getDialogBoxGui() {
    for (const gui of gameState.guis.values()) {
      if (gui.type === 'DialogBox') {
        return gui;
      }
    }
    return null;
  }

  function resolveCharacter(characterIdOrName) {
    let character = gameState.characters.get(characterIdOrName);
    if (character) {
      return character;
    }
    for (const char of gameState.characters.values()) {
      if (char.name === characterIdOrName && char.roomId === gameState.currentRoomId) {
        return char;
      }
    }
    return null;
  }

  function getCharacterSpriteBounds(character) {
    const room = gameState.currentRoom;
    if (!room) {
      return { x: character.renderX, y: character.renderY, width: 0, height: 0 };
    }

    const charDef = gameState.characterDefinitions.get(character.name);
    const scale = calculateCharacterScale(character.renderY, room);
    const playingAnimName = character.playingAnimation ? character.playingAnimation.name : null;
    const frame = getCharacterFrame(character.name, character.direction, character.currentFrame, playingAnimName);

    if (!frame) {
      return { x: character.renderX, y: character.renderY, width: 32 * scale, height: 64 * scale };
    }

    const frameWidth = frame instanceof HTMLCanvasElement ? frame.width : frame.width;
    const frameHeight = frame instanceof HTMLCanvasElement ? frame.height : frame.height;
    const scaledWidth = frameWidth * scale;
    const scaledHeight = frameHeight * scale;

    let drawX = character.renderX;
    let drawY = character.renderY;
    if (charDef && charDef.pivotX !== undefined && charDef.pivotY !== undefined) {
      drawX = character.renderX - (charDef.pivotX * scale);
      drawY = character.renderY - (charDef.pivotY * scale);
    }

    return { x: drawX, y: drawY, width: scaledWidth, height: scaledHeight };
  }

  function wrapDialogueText(ctx, text, maxWidth) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    if (!words.length || (words.length === 1 && words[0] === '')) {
      return [''];
    }

    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) {
          lines.push(line);
        }
        line = word;
      }
    });
    if (line) {
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  function dismissActiveDialogue() {
    if (!activeDialogue) {
      return;
    }
    if (activeDialogue.timeoutId) {
      clearTimeout(activeDialogue.timeoutId);
    }
    const resolve = activeDialogue.dismissResolver;
    activeDialogue = null;
    if (typeof resolve === 'function') {
      resolve();
    }
  }

  /**
   * Resolve portrait image for a dialogue line.
   * Priority: explicit portrait ref → character.portraits[mood] → character.portraits.default
   */
  async function resolveDialoguePortrait(characterName, mood, portraitRef) {
    const refs = [];
    if (portraitRef && String(portraitRef).trim()) refs.push(String(portraitRef).trim());
    const charDef = gameState.characterDefinitions.get(characterName)
      || (characterName ? gameState.characterDefinitions.get(String(characterName)) : null);
    // Also try by matching character instance name
    let portraits = charDef && charDef.portraits ? charDef.portraits : null;
    if (!portraits) {
      for (const def of gameState.characterDefinitions.values()) {
        if (def && def.name === characterName && def.portraits) {
          portraits = def.portraits;
          break;
        }
      }
    }
    if (portraits) {
      const moodKey = String(mood || '').trim();
      if (moodKey && portraits[moodKey]) refs.push(String(portraits[moodKey]).trim());
      if (portraits.default) refs.push(String(portraits.default).trim());
      if (portraits.neutral) refs.push(String(portraits.neutral).trim());
    }
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      if (!ref) continue;
      try {
        let img = AssetRegistry.images.get(ref);
        if (!img || !img.complete) {
          img = await loadImage(ref, 'gui');
        }
        if (img && img.complete && img.naturalWidth > 0) return img;
      } catch (_) { /* try next */ }
    }
    return null;
  }

  /**
   * @param {string} characterIdOrName
   * @param {string} text
   * @param {{ mood?: string, portrait?: string }} [opts]
   */
  function showDialogueAndWait(characterIdOrName, text, opts) {
    const character = resolveCharacter(characterIdOrName);
    if (!character) {
      GameAPI.error(`show_dialogue: character "${characterIdOrName}" not found (by ID or name in current room)`);
      return Promise.resolve();
    }
    if (!character.visible || character.roomId !== gameState.currentRoomId) {
      GameAPI.error(`show_dialogue: character "${characterIdOrName}" is not visible in the current room`);
      return Promise.resolve();
    }

    dismissActiveDialogue();

    const dialogGui = getDialogBoxGui();
    const settings = normalizeDialogBoxSettings(dialogGui ? dialogGui.settings : {});
    const balloonImage = dialogGui && dialogGui.balloonImage ? dialogGui.balloonImage : null;
    const messageText = String(text);
    const options = opts && typeof opts === 'object' ? opts : {};
    const mood = String(options.mood || '').trim();
    const portraitRef = String(options.portrait || '').trim();

    return (async () => {
      if (settings.customFont && settings.fontFamily) {
        await ensureDialogueFontLoaded(settings.customFont, settings.fontFamily);
      }
      const portraitImage = await resolveDialoguePortrait(character.name, mood, portraitRef);
      return new Promise(resolve => {
        activeDialogue = {
          characterId: character.id,
          text: messageText,
          settings,
          balloonImage,
          portraitImage,
          mood,
          dismissResolver: resolve,
          appear: settings.appear,
          opacity: settings.appear === 'fade' ? 0 : 1,
          slideOffset: settings.appear === 'slide' ? 12 : 0,
          appearStart: performance.now()
        };
        activeDialogue.timeoutId = setTimeout(() => dismissActiveDialogue(), 120000);
        log(`[Runtime] show_dialogue: "${character.name}"${mood ? ' [' + mood + ']' : ''} — ${messageText.substring(0, 60)}${messageText.length > 60 ? '…' : ''}`, 'info');
      });
    })();
  }

  function updateDialogueAppear(deltaTime) {
    if (!activeDialogue) {
      return;
    }
    const elapsed = performance.now() - activeDialogue.appearStart;
    if (activeDialogue.appear === 'fade') {
      activeDialogue.opacity = Math.min(1, elapsed / DIALOGUE_FADE_MS);
    } else if (activeDialogue.appear === 'slide') {
      const t = Math.min(1, elapsed / DIALOGUE_FADE_MS);
      activeDialogue.slideOffset = 12 * (1 - t);
      activeDialogue.opacity = 1;
    } else {
      activeDialogue.opacity = 1;
      activeDialogue.slideOffset = 0;
    }
  }

  function renderDialogueBalloon(ctx) {
    if (!activeDialogue || !gameState.currentRoom) {
      return;
    }

    const character = gameState.characters.get(activeDialogue.characterId);
    if (!character || !character.visible || character.roomId !== gameState.currentRoomId) {
      return;
    }

    const bounds = getCharacterSpriteBounds(character);
    const settings = activeDialogue.settings;
    const opacity = activeDialogue.opacity != null ? activeDialogue.opacity : 1;
    const slideOffset = activeDialogue.slideOffset || 0;

    ctx.save();
    ctx.globalAlpha = opacity;

    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    const lineHeight = getDialogueLineHeight(settings.fontSize);
    ctx.font = buildDialogueFontCss(settings);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const innerMaxWidth = DIALOGUE_MAX_TEXT_WIDTH;
    const lines = wrapDialogueText(ctx, activeDialogue.text, innerMaxWidth);
    const textWidth = Math.min(innerMaxWidth, Math.max(...lines.map(l => ctx.measureText(l).width), 40));
    const textHeight = lines.length * lineHeight;
    const boxWidth = textWidth + DIALOGUE_PADDING * 2;
    const boxHeight = textHeight + DIALOGUE_PADDING * 2;

    const portraitImg = activeDialogue.portraitImage;
    const hasPortrait = !!(portraitImg && portraitImg.complete && portraitImg.naturalWidth > 0);
    const portraitSize = hasPortrait ? DIALOGUE_PORTRAIT_SIZE : 0;
    const portraitGap = hasPortrait ? DIALOGUE_PORTRAIT_GAP : 0;
    const moodLabel = String(activeDialogue.mood || '').trim();
    const moodExtraH = moodLabel && hasPortrait ? 16 : 0;
    const totalWidth = portraitSize + portraitGap + boxWidth;
    const totalHeight = Math.max(boxHeight, portraitSize + moodExtraH);

    let groupX = bounds.x + bounds.width / 2 - totalWidth / 2;
    let groupY = bounds.y - totalHeight - DIALOGUE_GAP_ABOVE_CHARACTER - slideOffset;

    groupX = Math.max(4, Math.min(groupX, canvas.width - totalWidth - 4));
    groupY = Math.max(4, Math.min(groupY, canvas.height - totalHeight - 4));

    if (hasPortrait) {
      try {
        ctx.drawImage(portraitImg, groupX, groupY, portraitSize, portraitSize);
        ctx.strokeStyle = settings.boxBorderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(groupX, groupY, portraitSize, portraitSize);
        if (moodLabel) {
          const moodFontSize = Math.max(10, Math.round(clampDialogueFontSize(settings.fontSize) * 0.7));
          ctx.font = `${moodFontSize}px Arial, sans-serif`;
          ctx.fillStyle = settings.textColor;
          ctx.fillText(moodLabel, groupX + 2, groupY + portraitSize + 2);
        }
      } catch (error) {
        log(`[Runtime] Error rendering dialogue portrait: ${error.message}`, 'warning');
      }
    }

    const boxX = groupX + portraitSize + portraitGap;
    const boxY = groupY;

    const balloonImg = activeDialogue.balloonImage;
    if (balloonImg && balloonImg.complete && balloonImg.naturalWidth > 0) {
      try {
        ctx.drawImage(balloonImg, boxX, boxY, boxWidth, boxHeight);
      } catch (error) {
        log(`[Runtime] Error rendering dialog balloon image: ${error.message}`, 'warning');
      }
    } else {
      ctx.fillStyle = settings.backgroundColor;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = settings.boxBorderColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    }

    ctx.font = buildDialogueFontCss(settings);
    ctx.fillStyle = settings.textColor;
    const textX = boxX + DIALOGUE_PADDING;
    let textY = boxY + DIALOGUE_PADDING;
    lines.forEach(line => {
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    });

    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
    ctx.restore();
  }

  // ============================================
  // DIALOGHI RAMIFICATI (grafo line / choice / end / jump / action)
  // ============================================
  function getDialogueLogic() {
    return (typeof window !== 'undefined' && window.AmiantoDialogueLogic)
      ? window.AmiantoDialogueLogic
      : null;
  }

  function normalizeDialogueDef(raw) {
    const logic = getDialogueLogic();
    if (logic && typeof logic.normalizeDialogueDef === 'function') {
      return logic.normalizeDialogueDef(raw);
    }
    // Fallback minimale se il lib non è caricato (export legacy / test)
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const name = String(raw.name || id).trim() || id;
    const nodesIn = (raw.nodes && typeof raw.nodes === 'object') ? raw.nodes : {};
    const nodes = {};
    Object.keys(nodesIn).forEach(nid => {
      const src = nodesIn[nid];
      if (!src || typeof src !== 'object') return;
      const nodeId = String(src.id || nid).trim();
      if (!nodeId) return;
      const type = String(src.type || 'end').toLowerCase();
      if (type === 'line') {
        const lineNode = {
          id: nodeId, type: 'line',
          speaker: String(src.speaker || '').trim(),
          text: String(src.text != null ? src.text : ''),
          next: String(src.next || '').trim()
        };
        if (src.mood) lineNode.mood = String(src.mood).trim();
        if (src.portrait) lineNode.portrait = String(src.portrait).trim();
        nodes[nodeId] = lineNode;
      } else if (type === 'choice') {
        const options = Array.isArray(src.options) ? src.options.map((opt, i) => ({
          id: String((opt && opt.id) || `opt_${i}`).trim(),
          text: String((opt && opt.text) != null ? opt.text : '').trim(),
          next: String((opt && opt.next) || '').trim()
        })).filter(o => o.id) : [];
        nodes[nodeId] = { id: nodeId, type: 'choice', options };
      } else if (type === 'jump') {
        nodes[nodeId] = { id: nodeId, type: 'jump', target: String(src.target || src.next || '').trim() };
      } else if (type === 'action') {
        nodes[nodeId] = { id: nodeId, type: 'action', next: String(src.next || '').trim(), actions: [] };
      } else {
        nodes[nodeId] = { id: nodeId, type: 'end' };
      }
    });
    let startNodeId = String(raw.startNodeId || '').trim();
    if (!startNodeId || !nodes[startNodeId]) {
      const keys = Object.keys(nodes);
      startNodeId = keys.length ? keys[0] : '';
    }
    return { id, name, startNodeId, nodes };
  }

  function getDialogueConditionCtx() {
    return {
      hasItem: function(itemId) {
        try { return !!(GameAPI && typeof GameAPI.has_item === 'function' && GameAPI.has_item(itemId)); }
        catch (_) { return false; }
      },
      getVar: function(key) {
        try {
          if (GameAPI && typeof GameAPI.get_var === 'function') return GameAPI.get_var(key);
          if (gameState.variables && gameState.variables.has(key)) return gameState.variables.get(key);
        } catch (_) {}
        return undefined;
      }
    };
  }

  /**
   * Esegue azioni dichiarative di dialogo.
   * @param {object[]} actions
   * @param {{ dialogueId?: string, nodeId?: string, optionId?: string }} [ctx]
   */
  async function runDialogueActions(actions, ctx) {
    if (!Array.isArray(actions) || !actions.length) return;
    const context = ctx || {};
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action || !action.type) continue;
      try {
        if (action.type === 'set_var') {
          if (typeof GameAPI.set_var === 'function') GameAPI.set_var(action.key, action.value);
          else if (typeof GameAPI.setVariable === 'function') GameAPI.setVariable(action.key, action.value);
        } else if (action.type === 'add_item') {
          if (typeof GameAPI.add_to_inventory === 'function') {
            GameAPI.add_to_inventory(action.itemId, action.count || 1);
          }
        } else if (action.type === 'remove_item') {
          if (typeof GameAPI.remove_from_inventory === 'function') {
            GameAPI.remove_from_inventory(action.itemId, action.count || 1);
          }
        } else if (action.type === 'set_object_visible') {
          if (typeof GameAPI.set_object_visible === 'function') {
            GameAPI.set_object_visible(action.objectId, action.visible !== false);
          }
        } else if (action.type === 'run_script') {
          const code = String(action.code || '').trim();
          const handlerName = String(action.handler || 'on_dialogue_action').trim() || 'on_dialogue_action';
          if (!code) {
            log('[Runtime] dialogue action run_script: empty code', 'warning');
          } else {
            const cacheName = 'dlg_run_script:' + String(
              action.id || context.nodeId || context.dialogueId || 'anon'
            ) + ':' + String(i);
            await executeScriptHandler(
              code,
              handlerName,
              [context.dialogueId || null, context.nodeId || null, context.optionId || null],
              cacheName
            );
          }
        }
      } catch (err) {
        log(`[Runtime] dialogue action "${action.type}" failed: ${err && err.message ? err.message : err}`, 'warning');
      }
    }
  }

  function markDialogueChoiceConsumed(dialogueId, optionId) {
    if (!gameState.dialogueConsumed) gameState.dialogueConsumed = new Set();
    const logic = getDialogueLogic();
    const key = logic && logic.makeConsumedKey
      ? logic.makeConsumedKey(dialogueId, optionId)
      : `${dialogueId}::${optionId}`;
    if (key && key !== '::') gameState.dialogueConsumed.add(key);
  }

  function loadDialogues(dialoguesArray) {
    gameState.dialogues = new Map();
    gameState.dialogueNameIndex = new Map();
    // New game / project load: once-only choices start fresh (saves restore separately)
    gameState.dialogueConsumed = new Set();
    if (!Array.isArray(dialoguesArray)) return;
    dialoguesArray.forEach(raw => {
      const def = normalizeDialogueDef(raw);
      if (!def) return;
      gameState.dialogues.set(def.id, def);
      const nameKey = String(def.name || '').trim().toLowerCase();
      if (nameKey) {
        gameState.dialogueNameIndex.set(nameKey, def.id);
      }
    });
    log(`[Runtime] Loaded ${gameState.dialogues.size} dialogue(s)`, 'info');
  }

  function resolveDialogue(idOrName) {
    if (idOrName == null || idOrName === '') return null;
    const key = String(idOrName).trim();
    if (gameState.dialogues.has(key)) {
      return gameState.dialogues.get(key);
    }
    const byName = gameState.dialogueNameIndex.get(key.toLowerCase());
    if (byName && gameState.dialogues.has(byName)) {
      return gameState.dialogues.get(byName);
    }
    return null;
  }

  function abortDialogueSession() {
    if (!activeDialogueSession) return;
    activeDialogueSession.abortRequested = true;
    if (activeDialogueSession.choiceState && typeof activeDialogueSession.choiceState.resolver === 'function') {
      const resolve = activeDialogueSession.choiceState.resolver;
      activeDialogueSession.choiceState = null;
      resolve(null);
    }
  }

  function endAllDialogue() {
    dismissActiveDialogue();
    abortDialogueSession();
  }

  /** Stile testo scelte = stesso DialogBox dei balloon (fontSize / fontFamily). */
  function getDialogueChoiceTextStyle() {
    const dialogGui = getDialogBoxGui();
    const settings = normalizeDialogBoxSettings(dialogGui ? dialogGui.settings : {});
    return {
      settings,
      fontCss: buildDialogueFontCss(settings),
      lineHeight: getDialogueLineHeight(settings.fontSize)
    };
  }

  function layoutDialogueChoices(ctx, options) {
    const style = getDialogueChoiceTextStyle();
    const prevFont = ctx.font;
    ctx.font = style.fontCss;
    const maxTextW = Math.min(canvas.width - 80, 480);
    const items = [];
    let totalH = 0;
    options.forEach((opt, index) => {
      const lines = wrapDialogueText(ctx, opt.text || `Choice ${index + 1}`, maxTextW);
      const textW = Math.min(maxTextW, Math.max(...lines.map(l => ctx.measureText(l).width), 40));
      const boxW = textW + DIALOGUE_CHOICE_PAD_X * 2;
      const boxH = lines.length * style.lineHeight + DIALOGUE_CHOICE_PAD_Y * 2;
      items.push({ opt, lines, boxW, boxH, index });
      totalH += boxH + (index > 0 ? DIALOGUE_CHOICE_GAP : 0);
    });
    ctx.font = prevFont;

    let y = canvas.height - DIALOGUE_CHOICE_BOTTOM_MARGIN - totalH;
    y = Math.max(8, y);
    return items.map(item => {
      const x = Math.max(8, (canvas.width - item.boxW) / 2);
      const bounds = { x, y, w: item.boxW, h: item.boxH };
      y += item.boxH + DIALOGUE_CHOICE_GAP;
      return {
        id: item.opt.id,
        text: item.opt.text,
        next: item.opt.next,
        lines: item.lines,
        bounds,
        lineHeight: style.lineHeight
      };
    });
  }

  function renderDialogueChoices(ctx) {
    if (!activeDialogueSession || !activeDialogueSession.choiceState) return;
    const choiceState = activeDialogueSession.choiceState;
    if (!Array.isArray(choiceState.rendered) || !choiceState.rendered.length) return;

    const style = getDialogueChoiceTextStyle();
    const settings = style.settings;
    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    ctx.font = style.fontCss;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Dim background strip behind choices
    const first = choiceState.rendered[0].bounds;
    const last = choiceState.rendered[choiceState.rendered.length - 1].bounds;
    const panelY = first.y - 12;
    const panelH = (last.y + last.h) - panelY + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, panelY, canvas.width, panelH);

    choiceState.rendered.forEach((item) => {
      const b = item.bounds;
      const lineHeight = item.lineHeight || style.lineHeight;
      ctx.fillStyle = settings.backgroundColor || '#1a1a2e';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = settings.boxBorderColor || '#39ff14';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = settings.textColor || '#ffffff';
      let ty = b.y + DIALOGUE_CHOICE_PAD_Y;
      item.lines.forEach(line => {
        ctx.fillText(line, b.x + DIALOGUE_CHOICE_PAD_X, ty);
        ty += lineHeight;
      });
    });

    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
  }

  function showDialogueChoicesAndWait(options) {
    const opts = Array.isArray(options) ? options.filter(o => o && o.id) : [];
    if (!opts.length) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      if (!activeDialogueSession) {
        resolve(null);
        return;
      }
      const rendered = layoutDialogueChoices(ctx, opts);
      activeDialogueSession.choiceState = {
        options: opts,
        rendered,
        resolver: resolve
      };
      log(`[Runtime] Dialogue choice: ${opts.length} option(s)`, 'info');
    });
  }

  function tryHandleDialogueChoiceClick(x, y) {
    if (!activeDialogueSession || !activeDialogueSession.choiceState) return false;
    const choiceState = activeDialogueSession.choiceState;
    const hit = (choiceState.rendered || []).find(item => {
      const b = item.bounds;
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    });
    if (!hit) return true; // block world clicks while choices are open
    const resolve = choiceState.resolver;
    activeDialogueSession.choiceState = null;
    if (typeof resolve === 'function') {
      resolve({ id: hit.id, text: hit.text, next: hit.next });
    }
    return true;
  }

  async function runDialogueGraph(dialogueDef) {
    if (!dialogueDef || !dialogueDef.nodes) return;
    if (activeDialogueSession) {
      endAllDialogue();
    }

    activeDialogueSession = {
      dialogueId: dialogueDef.id,
      abortRequested: false,
      choiceState: null
    };

    log(`[Runtime] start_dialogue: "${dialogueDef.name}" (${dialogueDef.id})`, 'info');

    const logic = getDialogueLogic();
    const condCtx = getDialogueConditionCtx();
    let nodeId = dialogueDef.startNodeId;
    const visitCounts = new Map();
    let steps = 0;
    const MAX_STEPS = 500;
    const MAX_VISITS_PER_NODE = 8;

    try {
      while (nodeId && activeDialogueSession && !activeDialogueSession.abortRequested && steps < MAX_STEPS) {
        steps += 1;
        const visits = (visitCounts.get(nodeId) || 0) + 1;
        visitCounts.set(nodeId, visits);
        if (visits > MAX_VISITS_PER_NODE) {
          log(`[Runtime] start_dialogue: loop detected at node "${nodeId}" (${visits} visits), stopping`, 'warning');
          break;
        }

        const node = dialogueDef.nodes[nodeId];
        if (!node) {
          log(`[Runtime] start_dialogue: missing node "${nodeId}"`, 'warning');
          break;
        }

        if (node.type === 'end') {
          break;
        }

        if (node.type === 'jump') {
          const target = String(node.target || '').trim();
          if (!target) {
            log(`[Runtime] start_dialogue: jump node "${node.id}" has no target`, 'warning');
            break;
          }
          if (!dialogueDef.nodes[target]) {
            log(`[Runtime] start_dialogue: jump target "${target}" missing`, 'warning');
            break;
          }
          nodeId = target;
          continue;
        }

        if (node.type === 'action') {
          await runDialogueActions(node.actions || [], { dialogueId: dialogueDef.id, nodeId: node.id });
          nodeId = node.next;
          continue;
        }

        if (node.type === 'line') {
          await runDialogueActions(node.actions || [], { dialogueId: dialogueDef.id, nodeId: node.id });
          if (!node.speaker) {
            GameAPI.error(`start_dialogue: line node "${node.id}" has no speaker`);
            nodeId = node.next;
            continue;
          }
          await showDialogueAndWait(node.speaker, node.text, {
            mood: node.mood || '',
            portrait: node.portrait || ''
          });
          if (!activeDialogueSession || activeDialogueSession.abortRequested) break;
          nodeId = node.next;
          continue;
        }

        if (node.type === 'choice') {
          const rawOpts = node.options || [];
          const available = logic && logic.filterChoiceOptions
            ? logic.filterChoiceOptions(rawOpts, dialogueDef.id, gameState.dialogueConsumed, condCtx)
            : rawOpts;
          const selected = await showDialogueChoicesAndWait(available);
          if (!activeDialogueSession || activeDialogueSession.abortRequested) break;
          if (!selected) break;

          // Re-validate at click time (state may have changed)
          const stillOk = logic && logic.isOptionSelectable
            ? logic.isOptionSelectable(selected, dialogueDef.id, gameState.dialogueConsumed, condCtx)
            : true;
          if (!stillOk) {
            log(`[Runtime] start_dialogue: choice "${selected.id}" no longer valid, ignoring`, 'warning');
            break;
          }

          const fullOpt = rawOpts.find(o => o && o.id === selected.id) || selected;
          if (fullOpt.once === true) {
            markDialogueChoiceConsumed(dialogueDef.id, fullOpt.id);
          }
          await runDialogueActions(fullOpt.actions || [], {
            dialogueId: dialogueDef.id,
            nodeId: node.id,
            optionId: fullOpt.id || null
          });
          nodeId = fullOpt.next || selected.next;
          continue;
        }

        log(`[Runtime] start_dialogue: unsupported node type "${node.type}" on "${node.id}"`, 'warning');
        break;
      }
      if (steps >= MAX_STEPS) {
        log(`[Runtime] start_dialogue: hit MAX_STEPS (${MAX_STEPS}), stopping`, 'warning');
      }
    } finally {
      if (activeDialogueSession && activeDialogueSession.dialogueId === dialogueDef.id) {
        activeDialogueSession = null;
      }
      dismissActiveDialogue();
    }
  }

  // ============================================
  // SAVE / LOAD STATO GIOCO (player saves)
  // Separato dal salvataggio progetto editor (.amnt)
  // ============================================
  function getGameSaveHelpers() {
    return (typeof window !== 'undefined' && window.AmiantoGameSave) ? window.AmiantoGameSave : null;
  }

  const _gs = getGameSaveHelpers();
  const GAME_SAVE_FORMAT = (_gs && _gs.GAME_SAVE_FORMAT) || 'amianto-save';
  const GAME_SAVE_VERSION = (_gs && _gs.GAME_SAVE_VERSION) || 1;
  const GAME_SAVE_MAX_SLOTS = (_gs && _gs.GAME_SAVE_MAX_SLOTS) || 10;
  const GAME_SAVE_KEY_PREFIX = (_gs && _gs.GAME_SAVE_KEY_PREFIX) || 'amianto-gamesave:v1:';

  function getGameSaveProjectId() {
    const settings = (gameState.projectData && gameState.projectData.settings) || {};
    const meta = (gameState.projectData && gameState.projectData._meta) || {};
    const id = settings.id || meta.projectId || settings.name || 'default';
    const helpers = getGameSaveHelpers();
    if (helpers && helpers.sanitizeProjectId) return helpers.sanitizeProjectId(id);
    return String(id).trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'default';
  }

  function getGameSaveProjectName() {
    const settings = (gameState.projectData && gameState.projectData.settings) || {};
    return String(settings.name || getGameSaveProjectId());
  }

  function normalizeGameSaveSlot(slot, options) {
    const helpers = getGameSaveHelpers();
    if (helpers && helpers.normalizeGameSaveSlot) {
      return helpers.normalizeGameSaveSlot(slot, options);
    }
    if (options && options.requireExplicit && (slot == null || slot === '')) {
      throw new Error('save slot is required');
    }
    if (slot == null || slot === '') return '1';
    if (typeof slot === 'number' && Number.isFinite(slot)) {
      const n = Math.floor(slot);
      if (n < 1 || n > GAME_SAVE_MAX_SLOTS) {
        throw new Error(`save slot must be 1–${GAME_SAVE_MAX_SLOTS}`);
      }
      return String(n);
    }
    const s = String(slot).trim();
    if (!s) return '1';
    const asNum = Number(s);
    if (Number.isFinite(asNum) && String(asNum) === s) {
      const n = Math.floor(asNum);
      if (n < 1 || n > GAME_SAVE_MAX_SLOTS) {
        throw new Error(`save slot must be 1–${GAME_SAVE_MAX_SLOTS}`);
      }
      return String(n);
    }
    return s.slice(0, 64);
  }

  function gameSaveStorageKey(slot) {
    return GAME_SAVE_KEY_PREFIX + getGameSaveProjectId() + ':' + normalizeGameSaveSlot(slot);
  }

  function validateAndMigrateGameSave(data) {
    const helpers = getGameSaveHelpers();
    if (helpers && helpers.migrateGameSave) {
      return helpers.migrateGameSave(data);
    }
    if (!data || data.format !== GAME_SAVE_FORMAT) {
      throw new Error('Unrecognized save format');
    }
    if (!data.state || typeof data.state !== 'object') {
      throw new Error('Invalid save payload');
    }
    return data;
  }

  function syncLiveRoomEntitiesToProjectData() {
    if (!gameState.projectData || !gameState.currentRoomId || !gameState.currentRoom) return;
    const roomData = (gameState.projectData.rooms || []).find(
      r => r.id === gameState.currentRoomId || r.name === gameState.currentRoomId
    );
    if (!roomData) return;

    if (Array.isArray(gameState.currentRoom.objects) && Array.isArray(roomData.sceneObjects)) {
      gameState.currentRoom.objects.forEach(live => {
        const src = roomData.sceneObjects.find(o => o.id === live.id || o.name === live.name);
        if (!src) return;
        src.visible = live.visible !== false;
        src.enabled = live.enabled !== false;
        src.x = Number(live.x) || 0;
        src.y = Number(live.y) || 0;
        if (typeof live.rotationRad === 'number') src.rotationRad = live.rotationRad;
        if (typeof live.scaleX === 'number') src.scaleX = live.scaleX;
        if (typeof live.scaleY === 'number') src.scaleY = live.scaleY;
      });
    }

    if (Array.isArray(gameState.currentRoom.hotspots) && Array.isArray(roomData.hotspots)) {
      gameState.currentRoom.hotspots.forEach(live => {
        const src = roomData.hotspots.find(h => h.id === live.id || h.name === live.name);
        if (!src) return;
        src.visible = live.visible !== false;
      });
    }
  }

  function collectRoomEntitySnapshot() {
    syncLiveRoomEntitiesToProjectData();
    const rooms = {};
    const list = (gameState.projectData && gameState.projectData.rooms) || [];
    list.forEach(room => {
      if (!room || !room.id) return;
      const objects = {};
      (room.sceneObjects || []).forEach(o => {
        if (!o || !o.id) return;
        objects[o.id] = {
          visible: o.visible !== false,
          enabled: o.enabled !== false,
          x: Number(o.x) || 0,
          y: Number(o.y) || 0,
          rotationRad: Number(o.rotationRad) || 0,
          scaleX: Number(o.scaleX) > 0 ? Number(o.scaleX) : 1,
          scaleY: Number(o.scaleY) > 0 ? Number(o.scaleY) : 1
        };
      });
      const hotspots = {};
      (room.hotspots || []).forEach(h => {
        if (!h || !h.id) return;
        hotspots[h.id] = { visible: h.visible !== false };
      });
      rooms[room.id] = { objects, hotspots };
    });
    return rooms;
  }

  function applyRoomEntitySnapshot(roomsSnap) {
    if (!roomsSnap || typeof roomsSnap !== 'object' || !gameState.projectData) return;
    (gameState.projectData.rooms || []).forEach(room => {
      const snap = roomsSnap[room.id];
      if (!snap) return;
      if (snap.objects && Array.isArray(room.sceneObjects)) {
        room.sceneObjects.forEach(o => {
          const s = snap.objects[o.id];
          if (!s) return;
          if (typeof s.visible === 'boolean') o.visible = s.visible;
          if (typeof s.enabled === 'boolean') o.enabled = s.enabled;
          if (typeof s.x === 'number') o.x = s.x;
          if (typeof s.y === 'number') o.y = s.y;
          if (typeof s.rotationRad === 'number') o.rotationRad = s.rotationRad;
          if (typeof s.scaleX === 'number') o.scaleX = s.scaleX;
          if (typeof s.scaleY === 'number') o.scaleY = s.scaleY;
        });
      }
      if (snap.hotspots && Array.isArray(room.hotspots)) {
        room.hotspots.forEach(h => {
          const s = snap.hotspots[h.id];
          if (!s) return;
          if (typeof s.visible === 'boolean') h.visible = s.visible;
        });
      }
    });
  }

  function serializeGameStateForSave(label) {
    syncLiveRoomEntitiesToProjectData();
    const variables = {};
    gameState.variables.forEach((value, key) => {
      variables[key] = value;
    });

    const inv = ensureInventoryState();
    const contents = {};
    inv.contents.forEach((count, key) => {
      const c = Math.max(0, Number(count) || 0);
      if (c > 0) contents[key] = c;
    });

    const characters = [];
    gameState.characters.forEach(ch => {
      const name = ch.name || ch.id;
      characters.push({
        id: name, // id === name sempre
        name: name,
        x: Number(ch.renderX != null ? ch.renderX : ch.x) || 0,
        y: Number(ch.renderY != null ? ch.renderY : ch.y) || 0,
        direction: ch.direction || 'south',
        visible: ch.visible !== false,
        opacity: getCharacterDrawOpacity(ch),
        roomId: ch.roomId || gameState.currentRoomId
      });
    });

    if (!gameState.dialogueConsumed) gameState.dialogueConsumed = new Set();
    const dialogueConsumed = Array.from(gameState.dialogueConsumed);

    return {
      format: GAME_SAVE_FORMAT,
      version: GAME_SAVE_VERSION,
      label: label != null ? String(label).slice(0, 80) : '',
      savedAt: new Date().toISOString(),
      projectId: getGameSaveProjectId(),
      projectName: getGameSaveProjectName(),
      state: {
        currentRoomId: gameState.currentRoomId,
        variables,
        inventory: {
          contents,
          carriedItemKey: inv.carriedItem
            ? (resolveUseWithItemId(inv.carriedItem.key) || inv.carriedItem.key)
            : null,
          visible: !!inv.visible
        },
        characters,
        rooms: collectRoomEntitySnapshot(),
        dialogueConsumed
      }
    };
  }

  function writeGameSaveToStorage(slot, payload) {
    // Validate before write so a bad serialize never overwrites a valid save
    const migrated = validateAndMigrateGameSave(payload);
    const key = gameSaveStorageKey(slot);
    let json;
    try {
      json = JSON.stringify(migrated);
    } catch (serErr) {
      throw new Error('Failed to serialize save: ' + (serErr && serErr.message ? serErr.message : serErr));
    }
    if (!json || json.length < 2) {
      throw new Error('Refusing to write empty save');
    }
    // Two-phase write: temp key first, then commit to final key
    const tmpKey = key + ':tmp';
    try {
      localStorage.setItem(tmpKey, json);
      localStorage.setItem(key, json);
      try { localStorage.removeItem(tmpKey); } catch (_) {}
      return { ok: true, bytes: json.length, key };
    } catch (err) {
      try { localStorage.removeItem(tmpKey); } catch (_) {}
      const msg = (err && err.name === 'QuotaExceededError')
        ? 'Storage quota exceeded (browser localStorage full). Delete old saves or free space.'
        : (err && err.message ? err.message : String(err));
      throw new Error(msg);
    }
  }

  function readGameSaveFromStorage(slot) {
    const key = gameSaveStorageKey(slot);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return validateAndMigrateGameSave(data);
    } catch (err) {
      throw new Error('Corrupt save data: ' + (err.message || err));
    }
  }

  function deleteGameSaveFromStorage(slot) {
    const key = gameSaveStorageKey(slot);
    localStorage.removeItem(key);
    return true;
  }

  function listGameSavesFromStorage() {
    const prefix = GAME_SAVE_KEY_PREFIX + getGameSaveProjectId() + ':';
    const results = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const slot = key.slice(prefix.length);
      try {
        const raw = localStorage.getItem(key);
        const data = raw ? JSON.parse(raw) : null;
        if (!data || data.format !== GAME_SAVE_FORMAT) continue;
        results.push({
          slot,
          label: data.label || '',
          savedAt: data.savedAt || null,
          projectId: data.projectId || null,
          projectName: data.projectName || null,
          roomId: data.state && data.state.currentRoomId ? data.state.currentRoomId : null
        });
      } catch (_) {}
    }
    results.sort((a, b) => {
      const na = Number(a.slot);
      const nb = Number(b.slot);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.slot).localeCompare(String(b.slot));
    });
    return results;
  }

  async function restoreGameStateFromSave(data) {
    const migrated = validateAndMigrateGameSave(data);
    const st = migrated.state;
    endAllDialogue();
    resetInputLock();

    // Restore once-only dialogue choices before room/scripts side-effects
    gameState.dialogueConsumed = new Set();
    if (Array.isArray(st.dialogueConsumed)) {
      st.dialogueConsumed.forEach(k => {
        if (k != null && String(k).trim()) gameState.dialogueConsumed.add(String(k).trim());
      });
    }

    applyRoomEntitySnapshot(st.rooms);

    // Patch spawn positions so auto-spawn NPCs on room change match the save
    const chars = Array.isArray(st.characters) ? st.characters : [];
    if (gameState.projectData && Array.isArray(gameState.projectData.characters)) {
      chars.forEach(ch => {
        if (!ch || !ch.name) return;
        const def = gameState.projectData.characters.find(c => c.name === ch.name);
        if (!def) return;
        if (!def.spawnSettings || typeof def.spawnSettings !== 'object') {
          def.spawnSettings = {};
        }
        def.spawnSettings.x = Number(ch.x) || 0;
        def.spawnSettings.y = Number(ch.y) || 0;
        def.spawnSettings.direction = ch.direction || 'south';
        if (ch.roomId) def.spawnSettings.roomId = ch.roomId;
      });
    }

    // Variables (restore after room so playerId can be overwritten by spawn)
    const savedVars = (st.variables && typeof st.variables === 'object') ? { ...st.variables } : {};

    // Inventory
    const inv = ensureInventoryState();
    inv.contents.clear();
    clearCarriedInventoryItem();
    if (st.inventory && st.inventory.contents && typeof st.inventory.contents === 'object') {
      Object.keys(st.inventory.contents).forEach(key => {
        const c = Math.max(0, Number(st.inventory.contents[key]) || 0);
        if (c > 0) inv.contents.set(key, c);
      });
    }
    if (st.inventory && typeof st.inventory.visible === 'boolean') {
      inv.visible = st.inventory.visible;
    }

    const targetRoom = st.currentRoomId || gameState.currentRoomId;
    if (targetRoom) {
      await changeRoom(targetRoom, { skipRoomScripts: true });
    }

    // Replace live characters with save snapshot for the current room
    gameState.characters.clear();
    let restoredPlayerId = null;
    chars.forEach(ch => {
      if (!ch || !ch.name) return;
      const inThisRoom = !ch.roomId || ch.roomId === gameState.currentRoomId;
      if (!inThisRoom) return;
      const id = GameAPI.spawn_character(
        ch.name,
        ch.x || 0,
        ch.y || 0,
        ch.direction || 'south'
      );
      if (!id) return;
      const live = gameState.characters.get(id);
      if (live) {
        live.visible = ch.visible !== false;
        const op = clampCharacterOpacity(ch.opacity);
        live.opacity = op == null ? 1 : op;
        live.roomId = gameState.currentRoomId;
      }
      const charDef = gameState.characterDefinitions.get(ch.name);
      if (charDef && charDef.spawnSettings && charDef.spawnSettings.isPlayer === true) {
        restoredPlayerId = id;
      }
    });

    gameState.variables.clear();
    Object.keys(savedVars).forEach(key => {
      gameState.variables.set(key, savedVars[key]);
    });
    if (restoredPlayerId) {
      gameState.variables.set('playerId', restoredPlayerId);
    }

    if (st.inventory && st.inventory.carriedItemKey) {
      GameAPI.set_carried_item(st.inventory.carriedItemKey);
    }

    syncInventoryStateToEditor();
    log(`[Runtime] load_game: restored room "${targetRoom}" (${gameState.characters.size} character(s))`, 'success');
    return true;
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
      visible: false,
      carriedItem: null,
      pointerX: 0,
      pointerY: 0,
      suppressPanelUntilDrop: false,
      /** Popup: true dopo hover sul bordo inferiore, finché il puntatore non esce dal panel. */
      popupPanelEngaged: false
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
      const bgRef = (invData.backgroundRef && typeof invData.backgroundRef === 'string')
        ? invData.backgroundRef
        : (invData.background && typeof invData.background === 'string' ? invData.background : null);
      if (bgRef) {
        inv.backgroundRef = bgRef;
        inv.background = resolveInventoryItemImageFromRef(bgRef);
      }
      const toggleRef = (invData.toggleIconRef && typeof invData.toggleIconRef === 'string')
        ? invData.toggleIconRef
        : (invData.toggleIcon && typeof invData.toggleIcon === 'string' ? invData.toggleIcon : null);
      if (toggleRef) {
        inv.toggleIconRef = toggleRef;
        inv.toggleIcon = resolveInventoryItemImageFromRef(toggleRef);
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
      const imageRef = (item.imageRef && typeof item.imageRef === 'string')
        ? item.imageRef
        : (item.image && typeof item.image === 'string' ? item.image : null);
      const def = {
        id,
        name: item.name || id,
        scriptName: item.scriptName || item.name || id,
        imageRef,
        image: resolveInventoryItemImageFromRef(imageRef)
      };
      inv.itemDefs.set(id, def);
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

  function updateInventoryVisibilityFromPointer(canvasX, canvasY, inCanvas) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled) return;
    if (inv.carriedItem && inv.suppressPanelUntilDrop) {
      if (inv.displayMode !== 'always') {
        inv.visible = false;
      }
      return;
    }
    if (inv.displayMode === 'always') {
      inv.visible = true;
      return;
    }
    if (inv.displayMode === 'popup') {
      const edge = inv.popupEdgeHeight || 48;
      const panel = getInventoryPanelRect();
      const inBottomEdge = inCanvas && canvasY >= canvas.height - edge;
      const inPanelRect = inCanvas && isPointInInventoryRect(canvasX, canvasY, panel);
      const inSlot = inCanvas && findInventorySlotIndexAt(canvasX, canvasY, false) >= 0;
      const inPanel = inPanelRect || inSlot;

      if (inBottomEdge) {
        inv.popupPanelEngaged = true;
        inv.visible = true;
      } else if (inPanel && inv.popupPanelEngaged) {
        inv.visible = true;
      } else {
        if (!inPanel) {
          inv.popupPanelEngaged = false;
        }
        inv.visible = false;
      }
    } else if (inv.displayMode === 'toggle') {
      // visibility gestita dal click sull'icona toggle
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

  function resolveInventoryItemImageFromRef(imageRef) {
    if (!imageRef || typeof imageRef !== 'string') return null;
    return AssetRegistry.images.get(imageRef) || loadedImages.get(imageRef) || null;
  }

  /** Ricollega immagini item da AssetRegistry (utile se il preload termina dopo loadInventory). */
  function refreshInventoryItemImages() {
    const inv = gameState.inventory;
    if (!inv || !inv.itemDefs) return;
    const seen = new Set();
    inv.itemDefs.forEach(def => {
      if (!def || seen.has(def.id)) return;
      seen.add(def.id);
      if (def.imageRef) {
        const resolved = resolveInventoryItemImageFromRef(def.imageRef);
        if (resolved) def.image = resolved;
      }
    });
    if (inv.backgroundRef && !inv.background) {
      inv.background = resolveInventoryItemImageFromRef(inv.backgroundRef);
    }
    if (inv.toggleIconRef && !inv.toggleIcon) {
      inv.toggleIcon = resolveInventoryItemImageFromRef(inv.toggleIconRef);
    }
  }

  function isDrawableInventoryImage(img) {
    if (!img) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    return w > 0 && h > 0;
  }

  /** Disegna l'immagine nello slot mantenendo le proporzioni (fit contain, centrata). */
  function drawImageContainedInRect(ctx, img, x, y, maxW, maxH) {
    if (!isDrawableInventoryImage(img)) return;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (imgW <= 0 || imgH <= 0) return;
    const scale = Math.min(maxW / imgW, maxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = x + (maxW - drawW) / 2;
    const drawY = y + (maxH - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  function isPointInInventoryRect(x, y, rect) {
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function getInventoryPanelRect() {
    const inv = gameState.inventory;
    if (!inv) return null;
    return inv.panel || defaultRuntimeInventoryPanel();
  }

  /** Pannello nascosto finché l'oggetto è in mano dopo essere usciti dal panel (suppressPanelUntilDrop). */
  function shouldDrawInventoryPanel() {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || !inv.visible) return false;
    if (inv.carriedItem && inv.suppressPanelUntilDrop) return false;
    return true;
  }

  function findInventorySlotIndexAt(x, y, requireVisible) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled) return -1;
    if (requireVisible !== false && !inv.visible) return -1;
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      if (isPointInInventoryRect(x, y, slot)) return i;
    }
    return -1;
  }

  function getInventorySlotEntry(slotIndex) {
    const contents = getInventoryContentsList();
    return slotIndex >= 0 && slotIndex < contents.length ? contents[slotIndex] : null;
  }

  function startCarryingInventoryItem(slotIndex, entry, x, y) {
    const inv = gameState.inventory;
    if (!inv || !entry || !entry.def) return;
    const slot = inv.slots[slotIndex];
    inv.carriedItem = {
      key: entry.key,
      def: entry.def,
      sourceSlotIndex: slotIndex,
      slotW: slot ? Math.max(1, slot.w) : 48,
      slotH: slot ? Math.max(1, slot.h) : 48
    };
    inv.suppressPanelUntilDrop = false;
    inv.pointerX = x;
    inv.pointerY = y;
    updateInventoryCursorStyle();
    log(`[Runtime] Inventario: preso in mano "${entry.def.name || entry.key}"`, 'info');
    syncInventoryStateToEditor();
  }

  function releaseCarriedInventoryItem() {
    const inv = gameState.inventory;
    if (!inv || !inv.carriedItem) return;
    const name = inv.carriedItem.def && inv.carriedItem.def.name;
    inv.carriedItem = null;
    inv.suppressPanelUntilDrop = false;
    if (inv.displayMode === 'always') {
      inv.visible = true;
    }
    updateInventoryCursorStyle();
    log(`[Runtime] Inventario: oggetto rilasciato${name ? ` ("${name}")` : ''}`, 'info');
    syncInventoryStateToEditor();
  }

  /** Alias usato dalle API inventario / save-load */
  function clearCarriedInventoryItem() {
    releaseCarriedInventoryItem();
  }

  let suppressInventoryStateSync = false;
  let inventoryStateSyncTimer = null;

  /** Snapshot JSON-serializable dello stato inventario runtime (contenuti + oggetto in mano). */
  function serializeInventoryRuntimeSnapshot() {
    const inv = gameState.inventory;
    if (!inv) {
      return { contents: {}, carriedItemKey: null };
    }
    const contents = {};
    if (inv.contents && typeof inv.contents.forEach === 'function') {
      inv.contents.forEach((count, key) => {
        const c = Math.max(0, Number(count) || 0);
        if (c > 0) contents[key] = c;
      });
    }
    const carriedItemKey = inv.carriedItem && inv.carriedItem.key
      ? String(inv.carriedItem.key)
      : null;
    return { contents, carriedItemKey };
  }

  function applyCarriedItemFromSnapshot(carriedItemKey) {
    const inv = ensureInventoryState();
    refreshInventoryItemImages();
    if (!carriedItemKey) {
      if (inv.carriedItem) clearCarriedInventoryItem();
      return;
    }
    const key = resolveInventoryContentKey(carriedItemKey);
    if (!key || Number(inv.contents.get(key) || 0) <= 0) {
      if (inv.carriedItem) clearCarriedInventoryItem();
      return;
    }
    const def = resolveInventoryItemDef(key);
    if (!def) {
      if (inv.carriedItem) clearCarriedInventoryItem();
      return;
    }
    inv.carriedItem = {
      key,
      def,
      sourceSlotIndex: -1,
      slotW: 48,
      slotH: 48
    };
    inv.suppressPanelUntilDrop = true;
    if (inv.displayMode === 'toggle' || inv.displayMode === 'popup') {
      inv.visible = false;
    }
    updateInventoryCursorStyle();
  }

  /** Applica snapshot inventario da editor (UPDATE_CONTEXT / RUN_SCRIPT context). */
  function applyInventoryRuntimeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    suppressInventoryStateSync = true;
    try {
      const inv = ensureInventoryState();
      refreshInventoryItemImages();
      inv.contents.clear();
      if (snapshot.contents && typeof snapshot.contents === 'object') {
        Object.keys(snapshot.contents).forEach(key => {
          const count = Math.max(0, Number(snapshot.contents[key]) || 0);
          if (count > 0) {
            inv.contents.set(String(key), count);
          }
        });
      }
      const carriedKey = snapshot.carriedItemKey != null && snapshot.carriedItemKey !== ''
        ? String(snapshot.carriedItemKey)
        : null;
      applyCarriedItemFromSnapshot(carriedKey);
    } finally {
      suppressInventoryStateSync = false;
    }
  }

  function syncInventoryStateToEditor() {
    if (suppressInventoryStateSync) return;
    if (!isInIframe && !window.opener) return;
    if (inventoryStateSyncTimer) clearTimeout(inventoryStateSyncTimer);
    inventoryStateSyncTimer = setTimeout(() => {
      inventoryStateSyncTimer = null;
      sendToEditor({
        type: 'INVENTORY_STATE',
        inventory: serializeInventoryRuntimeSnapshot(),
        timestamp: Date.now()
      });
    }, 40);
  }

  function applyRuntimeContext(context) {
    if (!context || typeof context !== 'object') return;
    if (context.roomId !== undefined) {
      gameState.currentRoomId = context.roomId;
    }
    if (context.objectId !== undefined) {
      gameState.objectId = context.objectId;
    }
    if (context.variables && typeof context.variables === 'object') {
      Object.keys(context.variables).forEach(key => {
        gameState.variables.set(key, context.variables[key]);
      });
    }
    if (context.inventory !== undefined) {
      applyInventoryRuntimeSnapshot(context.inventory);
    }
  }

  function updateInventoryCursorStyle() {
    if (!canvas) return;
    const inv = gameState.inventory;
    if (inv && inv.carriedItem) {
      canvas.style.cursor = 'none';
      setCursorHoverState(inv.pointerX || 0, inv.pointerY || 0, 'grab', '', false);
      return;
    }
    const x = inv && typeof inv.pointerX === 'number' ? inv.pointerX : 0;
    const y = inv && typeof inv.pointerY === 'number' ? inv.pointerY : 0;
    updateGameCursorAt(x, y);
  }

  function refreshCursorFromLastPointer() {
    const inv = gameState.inventory;
    const x = inv && typeof inv.pointerX === 'number' ? inv.pointerX : (gameState.cursorHover && gameState.cursorHover.x) || 0;
    const y = inv && typeof inv.pointerY === 'number' ? inv.pointerY : (gameState.cursorHover && gameState.cursorHover.y) || 0;
    updateGameCursorAt(x, y);
  }

  function getCursorByCategory(category) {
    if (!gameState.cursors || !category) return null;
    return gameState.cursors.get(category) || null;
  }

  /** Prima categoria definita nell'elenco (con immagine), altrimenti `fallback`. */
  function pickDefinedCursorCategory(preferred, fallback) {
    const list = Array.isArray(preferred) ? preferred : [preferred];
    for (const cat of list) {
      const def = getCursorByCategory(cat);
      if (def && def.image) return cat;
    }
    if (fallback) {
      const fb = getCursorByCategory(fallback);
      if (fb && fb.image) return fallback;
    }
    return list[0] || fallback || 'default';
  }

  function setCursorHoverState(x, y, category, actionText, visible) {
    if (!gameState.cursorHover) {
      gameState.cursorHover = { x: 0, y: 0, category: 'default', actionText: '', visible: false };
    }
    gameState.cursorHover.x = x;
    gameState.cursorHover.y = y;
    gameState.cursorHover.category = category || 'default';
    gameState.cursorHover.actionText = actionText || '';
    gameState.cursorHover.visible = !!visible;
  }

  function applyCategoryCursorStyle(category) {
    if (!canvas) return false;
    let def = getCursorByCategory(category);
    if (!def || !def.image) {
      if (category !== 'default') def = getCursorByCategory('default');
    }
    if (def && def.image && def.image.src) {
      const px = typeof def.pivotX === 'number' ? def.pivotX : 0;
      const py = typeof def.pivotY === 'number' ? def.pivotY : 0;
      canvas.style.cursor = `url("${def.image.src}") ${px} ${py}, auto`;
      return true;
    }
    return false;
  }

  function isPointerOverInventoryInteractive(x, y) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled) return false;
    if (inv.displayMode === 'toggle' && inv.toggleIconRect && isPointInInventoryRect(x, y, inv.toggleIconRect)) {
      return true;
    }
    if (!shouldDrawInventoryPanel()) return false;
    const panel = getInventoryPanelRect();
    if (!isPointInInventoryRect(x, y, panel)) return false;
    return true;
  }

  function isPointerOverGuiButton(x, y) {
    if (!gameState.guis || gameState.guis.size === 0) return false;
    for (const gui of gameState.guis.values()) {
      if (!gui || gui.type === 'DialogBox' || gui.type === 'Inventory') continue;
      if (!Array.isArray(gui.buttons)) continue;
      for (const btn of gui.buttons) {
        if (!btn || btn.enabled === false) continue;
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          return true;
        }
      }
    }
    return false;
  }

  function isCursorActionTextEnabled() {
    const settings = gameState.projectData && gameState.projectData.settings;
    return !!(settings && settings.showCursorActionText);
  }

  /**
   * Risolve categoria cursore + action text sotto il puntatore.
   * Priorità allineata ai click: inventario → GUI → hotspot → oggetto → personaggio → walkable → default.
   * actionText: solo testo esplicito del cursore (mai nome oggetto), se abilitato in settings.
   */
  function resolvePointerCursorInfo(x, y) {
    const actionEnabled = isCursorActionTextEnabled();

    if (isInputLocked()) {
      const category = pickDefinedCursorCategory(['wait', 'inactive', 'default'], 'default');
      const def = getCursorByCategory(category);
      return {
        category,
        actionText: actionEnabled && def && def.actionText ? def.actionText : '',
        interactive: true
      };
    }

    if (isPointerOverInventoryInteractive(x, y)) {
      const category = pickDefinedCursorCategory(['grab', 'use', 'look', 'default'], 'default');
      const def = getCursorByCategory(category);
      return {
        category,
        actionText: actionEnabled && def && def.actionText ? def.actionText : '',
        interactive: true
      };
    }

    if (isPointerOverGuiButton(x, y)) {
      const category = pickDefinedCursorCategory(['use', 'look', 'default'], 'default');
      const def = getCursorByCategory(category);
      return {
        category,
        actionText: actionEnabled && def && def.actionText ? def.actionText : '',
        interactive: true
      };
    }

    const room = gameState.currentRoom;
    if (room) {
      if (Array.isArray(room.hotspots)) {
        for (const hotspot of room.hotspots) {
          if (!hotspot.visible || !hotspot.points || hotspot.points.length < 3) continue;
          if (!isPointInPolygon(hotspot.points, x, y)) continue;
          const nameHint = String(hotspot.name || hotspot.id || '').toLowerCase();
          const preferExit = /exit|door|uscita|porta/.test(nameHint);
          const category = pickDefinedCursorCategory(
            preferExit ? ['exit', 'use', 'look', 'default'] : ['use', 'look', 'default'],
            'default'
          );
          const def = getCursorByCategory(category);
          return {
            category,
            actionText: actionEnabled && def && def.actionText ? def.actionText : '',
            interactive: true
          };
        }
      }

      if (Array.isArray(room.objects)) {
        for (let i = room.objects.length - 1; i >= 0; i--) {
          const obj = room.objects[i];
          if (!obj.visible || !obj.enabled || !obj.img) continue;
          if (!isPointOnSceneObject(obj, x, y)) continue;
          const category = pickDefinedCursorCategory(['use', 'look', 'grab', 'default'], 'default');
          const def = getCursorByCategory(category);
          return {
            category,
            actionText: actionEnabled && def && def.actionText ? def.actionText : '',
            interactive: true
          };
        }
      }

      const playerId = gameState.variables.get('playerId');
      for (const character of gameState.characters.values()) {
        if (!character.visible || character.roomId !== gameState.currentRoomId) continue;
        if (getCharacterDrawOpacity(character) <= 0) continue;
        if (playerId && character.id === playerId) continue;
        const bounds = getCharacterSpriteBounds(character);
        if (x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height) {
          const category = pickDefinedCursorCategory(['talk', 'use', 'look', 'default'], 'default');
          const def = getCursorByCategory(category);
          return {
            category,
            actionText: actionEnabled && def && def.actionText ? def.actionText : '',
            interactive: true
          };
        }
      }

      const walkable = room.walkableArea;
      if (Array.isArray(walkable) && walkable.length >= 3 && isPointInPolygon(walkable, x, y)) {
        const category = pickDefinedCursorCategory(['walk', 'default'], 'default');
        const def = getCursorByCategory(category);
        return {
          category,
          actionText: actionEnabled && def && def.actionText ? def.actionText : '',
          interactive: false
        };
      }
    }

    const category = pickDefinedCursorCategory(['default'], 'default');
    const def = getCursorByCategory(category);
    return {
      category,
      actionText: actionEnabled && def && def.actionText ? def.actionText : '',
      interactive: false
    };
  }

  function updateGameCursorAt(x, y) {
    if (!canvas) return;
    const inv = gameState.inventory;
    if (inv && inv.carriedItem) {
      canvas.style.cursor = 'none';
      setCursorHoverState(x, y, 'grab', '', false);
      return;
    }

    const info = resolvePointerCursorInfo(x, y);
    const actionText = (info.actionText || '').trim();
    const showHint = isCursorActionTextEnabled() && !!actionText && info.interactive;
    setCursorHoverState(x, y, info.category, actionText, showHint);

    if (!applyCategoryCursorStyle(info.category)) {
      canvas.style.cursor = info.interactive ? 'pointer' : 'default';
    }
  }

  function renderCursorActionHint(ctx) {
    if (!isCursorActionTextEnabled()) return;
    const hover = gameState.cursorHover;
    if (!hover || !hover.visible || !hover.actionText) return;
    const inv = gameState.inventory;
    if (inv && inv.carriedItem) return;

    const text = String(hover.actionText);
    const padX = 8;
    const padY = 5;
    ctx.save();
    ctx.font = '13px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const metrics = ctx.measureText(text);
    const tw = Math.ceil(metrics.width);
    const th = 16;
    let bx = Math.round(hover.x + 18);
    let by = Math.round(hover.y + 18);
    if (bx + tw + padX * 2 > canvas.width) bx = Math.max(4, canvas.width - tw - padX * 2 - 4);
    if (by + th + padY * 2 > canvas.height) by = Math.max(4, hover.y - th - padY * 2 - 12);
    ctx.fillStyle = 'rgba(8, 12, 10, 0.82)';
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(bx, by, tw + padX * 2, th + padY * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8ffe8';
    ctx.fillText(text, bx + padX, by + padY);
    ctx.restore();
  }

  async function loadCursors(cursorsData) {
    gameState.cursors = new Map();
    if (!Array.isArray(cursorsData) || cursorsData.length === 0) {
      log('[Runtime] No category cursors defined', 'info');
      return;
    }

    for (const c of cursorsData) {
      if (!c || !c.category) continue;
      let img = null;
      if (c.cursorImage && typeof c.cursorImage === 'string') {
        img = AssetRegistry.images.get(c.cursorImage) || null;
        if (!img) {
          try {
            img = await loadImage(c.cursorImage, 'cursor');
          } catch (err) {
            log(`[Runtime] Cursor image failed (${c.category}): ${err.message}`, 'warning');
          }
        }
      }
      gameState.cursors.set(c.category, {
        category: c.category,
        image: img,
        actionText: c.actionText || '',
        pivotX: typeof c.pivotX === 'number' ? c.pivotX : 0,
        pivotY: typeof c.pivotY === 'number' ? c.pivotY : 0
      });
    }
    log(`[Runtime] Cursors loaded: ${gameState.cursors.size} categor${gameState.cursors.size === 1 ? 'y' : 'ies'}`, 'success');
  }

  function updateInventoryCarriedPointer(x, y) {
    const inv = gameState.inventory;
    if (!inv) return;
    inv.pointerX = x;
    inv.pointerY = y;

    if (!inv.carriedItem || inv.suppressPanelUntilDrop) return;

    const panel = getInventoryPanelRect();
    if (!isPointInInventoryRect(x, y, panel)) {
      inv.suppressPanelUntilDrop = true;
      if (inv.displayMode === 'toggle' || inv.displayMode === 'popup') {
        inv.visible = false;
      }
      log('[Runtime] Inventario: pannello chiuso (oggetto in mano)', 'info');
    }
  }

  function renderInventoryPanel(ctx) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || !inv.visible) return;
    if (!shouldDrawInventoryPanel()) return;

    refreshInventoryItemImages();

    const panel = inv.panel || defaultRuntimeInventoryPanel();
    if (isDrawableInventoryImage(inv.background)) {
      try {
        ctx.drawImage(inv.background, panel.x, panel.y, panel.w, panel.h);
      } catch (error) {
        log(`[Runtime] Error rendering inventario background: ${error.message}`, 'warning');
      }
    }

    const carriedSlot = inv.carriedItem ? inv.carriedItem.sourceSlotIndex : -1;
    const contents = getInventoryContentsList();
    inv.slots.forEach((slot, index) => {
      if (index === carriedSlot) return;
      const entry = contents[index];
      if (!entry || !entry.def) return;
      const img = entry.def.image;
      if (!isDrawableInventoryImage(img)) return;
      try {
        drawImageContainedInRect(ctx, img, slot.x, slot.y, slot.w, slot.h);
      } catch (error) {
        log(`[Runtime] Error rendering item inventario: ${error.message}`, 'warning');
      }
    });
  }

  function renderInventoryCarriedItem(ctx) {
    const inv = gameState.inventory;
    if (!inv || !inv.carriedItem || !inv.carriedItem.def) return;
    refreshInventoryItemImages();
    const img = inv.carriedItem.def.image;
    if (!isDrawableInventoryImage(img)) return;
    const slotW = inv.carriedItem.slotW || 48;
    const slotH = inv.carriedItem.slotH || 48;
    const x = inv.pointerX - slotW / 2;
    const y = inv.pointerY - slotH / 2;
    try {
      drawImageContainedInRect(ctx, img, x, y, slotW, slotH);
    } catch (error) {
      log(`[Runtime] Error rendering cursore inventario: ${error.message}`, 'warning');
    }
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
    renderInventoryCarriedItem(ctx);
  }

  /**
   * Id usato negli script use-with (nome item, come in Inventory:nome e negli esempi docs).
   * I contenuti inventario usano def.id interno; senza normalizzazione usedItemId non combacia.
   */
  function resolveUseWithItemId(itemKey) {
    const def = resolveInventoryItemDef(itemKey);
    if (def) {
      const name = String(def.name || '').trim();
      if (name) return name;
      if (def.id) return String(def.id);
    }
    return String(itemKey || '').trim();
  }

  function isUseWithMode(usedItemId) {
    return usedItemId !== undefined && usedItemId !== null && String(usedItemId).trim() !== '';
  }

  function resolveInventoryItemScriptName(itemKey) {
    const def = resolveInventoryItemDef(itemKey);
    const invScripts = gameState.attachments.inventoryScripts || {};
    if (def) {
      if (def.name && invScripts[def.name]) return invScripts[def.name];
      if (def.id && invScripts[def.id]) return invScripts[def.id];
      const scriptName = String(def.scriptName || '').trim();
      if (scriptName && gameState.scripts[scriptName]) return scriptName;
      if (def.name) {
        const byName = `Inventory:${def.name}`;
        if (gameState.scripts[byName]) return byName;
      }
      if (def.id) {
        const byId = `Inventory:${def.id}`;
        if (gameState.scripts[byId]) return byId;
      }
    }
    const key = String(itemKey || '').trim();
    if (key && invScripts[key]) return invScripts[key];
    const legacyKey = `Inventory:${key}`;
    if (legacyKey && gameState.scripts[legacyKey]) return legacyKey;
    return null;
  }

  /**
   * Esegue un handler se presente nello script; restituisce { found, result }.
   * result === true indica combinazione/use-with gestita con successo.
   */
  async function tryExecuteScriptHandler(scriptContent, handlerName, argsArray = [], scriptName = null) {
    if (!scriptContent || !handlerName) {
      return { found: false, result: undefined };
    }

    if (!scriptName) {
      let hash = 0;
      for (let i = 0; i < scriptContent.length; i++) {
        const char = scriptContent.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      scriptName = `script_${Math.abs(hash)}`;
    }

    try {
      const handlerFunction = getCompiledHandler(scriptName, scriptContent, handlerName);
      if (!handlerFunction || typeof handlerFunction !== 'function') {
        return { found: false, result: undefined };
      }
      const result = handlerFunction.apply(null, argsArray);
      if (result && typeof result.then === 'function') {
        return { found: true, result: await result };
      }
      return { found: true, result };
    } catch (error) {
      log(`[Runtime] tryExecuteScriptHandler: Error executing handler '${handlerName}': ${error.message}`, 'error');
      console.error(error);
      return { found: true, result: false };
    }
  }

  async function executeCharacterClickScripts(characterId, x, y, usedItemId) {
    const characterScripts = gameState.attachments.characterScripts || {};
    const useWithMode = isUseWithMode(usedItemId);
    const args = useWithMode
      ? [characterId, x, y, usedItemId]
      : [characterId, x, y];
    let handled = false;

    if (typeof characterScripts === 'object' && characterScripts[characterId]) {
      const scriptName = characterScripts[characterId];
      if (gameState.scripts[scriptName]) {
        if (useWithMode) {
          const outcome = await tryExecuteScriptHandler(
            gameState.scripts[scriptName],
            'on_character_click',
            args,
            scriptName
          );
          handled = isUseWithHandlerSuccess(outcome);
        } else {
          await executeScriptHandler(gameState.scripts[scriptName], 'on_character_click', args, scriptName);
        }
      }
    }

    if (!useWithMode) {
      for (const handler of eventHandlers.character_click) {
        try {
          handler(characterId, x, y);
        } catch (error) {
          log(`Errore handler on_character_click: ${error.message}`, 'error');
        }
      }
      return;
    }

    if (!handled) {
      for (const handler of eventHandlers.character_click) {
        try {
          const result = handler(characterId, x, y, usedItemId);
          const resolved = result && typeof result.then === 'function' ? await result : result;
          if (resolved === true) {
            handled = true;
            break;
          }
        } catch (error) {
          log(`Errore handler on_character_click: ${error.message}`, 'error');
        }
      }
    }

    return handled;
  }

  async function executeTargetUseWithScript(itemKey, targetType, targetId, x, y) {
    const usedItemId = resolveUseWithItemId(itemKey);
    if (targetType === 'hotspot') {
      if (!gameState.currentRoom || !Array.isArray(gameState.currentRoom.hotspots)) return false;
      const hotspot = gameState.currentRoom.hotspots.find(h => String(h.id) === String(targetId));
      if (!hotspot) return false;
      return await executeHotspotScript(targetId, hotspot, x, y, usedItemId);
    }
    if (targetType === 'object') {
      return await executeObjectClickScripts(targetId, x, y, usedItemId);
    }
    if (targetType === 'character') {
      return await executeCharacterClickScripts(targetId, x, y, usedItemId);
    }
    if (targetType === 'inventory') {
      const targetScriptName = resolveInventoryItemScriptName(targetId);
      if (!targetScriptName || !gameState.scripts[targetScriptName]) return false;
      const outcome = await tryExecuteScriptHandler(
        gameState.scripts[targetScriptName],
        'on_use_with',
        ['inventory', usedItemId, x, y],
        targetScriptName
      );
      return isUseWithHandlerSuccess(outcome);
    }
    return false;
  }

  async function tryExecuteItemScriptUseWith(itemKey, scriptName, scriptContent, targetType, targetId, x, y) {
    const useWith = await tryExecuteScriptHandler(
      scriptContent,
      'on_use_with',
      [targetType, targetId, x, y],
      scriptName
    );
    if (isUseWithHandlerSuccess(useWith)) {
      return true;
    }

    // Alias: accetta on_inventory_use_with anche nello script dell'item (itemId = oggetto in mano)
    const invUseWith = await tryExecuteScriptHandler(
      scriptContent,
      'on_inventory_use_with',
      [itemKey, targetType, targetId, x, y],
      scriptName
    );
    return isUseWithHandlerSuccess(invUseWith);
  }

  async function dispatchInventoryUseWith(itemKey, targetType, targetId, x, y) {
    const normalizedItemId = resolveUseWithItemId(itemKey);
    log(
      `[Runtime] dispatchInventoryUseWith: "${normalizedItemId}" (raw: "${itemKey}") → ${targetType}:${targetId}`,
      'info'
    );
    let handled = false;

    const itemScriptName = resolveInventoryItemScriptName(itemKey);
    if (itemScriptName && gameState.scripts[itemScriptName]) {
      handled = await tryExecuteItemScriptUseWith(
        normalizedItemId,
        itemScriptName,
        gameState.scripts[itemScriptName],
        targetType,
        targetId,
        x,
        y
      );
    }

    if (!handled) {
      const globalScripts = gameState.attachments.globalScripts || {};
      const globalScriptName = globalScripts.on_inventory_use_with;
      if (globalScriptName && gameState.scripts[globalScriptName]) {
        const outcome = await tryExecuteScriptHandler(
          gameState.scripts[globalScriptName],
          'on_inventory_use_with',
          [normalizedItemId, targetType, targetId, x, y],
          globalScriptName
        );
        if (isUseWithHandlerSuccess(outcome)) {
          handled = true;
        }
      }
    }

    if (!handled) {
      const globalCandidates = ['Global:main', 'main'];
      for (const gKey of globalCandidates) {
        if (!gameState.scripts[gKey]) continue;
        const outcome = await tryExecuteScriptHandler(
          gameState.scripts[gKey],
          'on_inventory_use_with',
          [normalizedItemId, targetType, targetId, x, y],
          gKey
        );
        if (isUseWithHandlerSuccess(outcome)) {
          handled = true;
          break;
        }
      }
    }

    if (!handled) {
      for (const handler of eventHandlers.inventory_use_with) {
        try {
          const result = handler(normalizedItemId, targetType, targetId, x, y);
          const resolved = result && typeof result.then === 'function' ? await result : result;
          if (resolved === true) {
            handled = true;
            break;
          }
        } catch (error) {
          log(`Errore handler on_inventory_use_with: ${error.message}`, 'error');
        }
      }
    }

    if (!handled) {
      handled = await executeTargetUseWithScript(itemKey, targetType, targetId, x, y);
    }

    if (handled) {
      clearCarriedInventoryItem();
      log('[Runtime] dispatchInventoryUseWith: combinazione riuscita', 'success');
    } else {
      showGameMessage("That doesn't work.");
      log('[Runtime] dispatchInventoryUseWith: combinazione non gestita', 'info');
    }
  }

  async function handleInventorySlotClick(x, y) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || !inv.visible) return false;

    updateInventoryCarriedPointer(x, y);
    const slotIndex = findInventorySlotIndexAt(x, y);

    if (inv.carriedItem) {
      if (slotIndex < 0) return false;
      const entry = getInventorySlotEntry(slotIndex);
      if (!entry || slotIndex === inv.carriedItem.sourceSlotIndex) {
        clearCarriedInventoryItem();
        return true;
      }
      await dispatchInventoryUseWith(inv.carriedItem.key, 'inventory', entry.key, x, y);
      return true;
    }

    if (slotIndex < 0) return false;
    const entry = getInventorySlotEntry(slotIndex);
    if (!entry || !entry.def) return false;
    startCarryingInventoryItem(slotIndex, entry, x, y);
    return true;
  }

  function handleInventoryToggleClick(x, y) {
    const inv = gameState.inventory;
    if (!inv || !inv.enabled || inv.displayMode !== 'toggle') return false;
    const r = inv.toggleIconRect;
    if (!r) return false;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      if (inv.carriedItem && inv.suppressPanelUntilDrop) {
        return true;
      }
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
    'on_before_room_change',
    'on_room_change',
    'on_object_click',
    'on_character_click',
    'on_hotspot_click',
    'on_gui_click',
    'on_use_with',
    'on_inventory_use_with',
    'on_dialogue_action',
    'on_dialogue_preview'
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
   * Ricompila un handler con API + variabili nello scope lessicale (non solo in this).
   * Necessario perché with() non influenza le lookup dentro funzioni già definite.
   */
  function rebindHandlerWithExecutionScope(handlerFunc, scriptScope) {
    if (typeof handlerFunc !== 'function') return handlerFunc;

    const apiBindings = getScriptApiBindings();
    const scopeKeys = Object.keys(scriptScope).filter(k => !apiBindings.some(b => b.name === k));
    const paramNames = [...apiBindings.map(b => b.name), ...scopeKeys];
    const paramValues = [...apiBindings.map(b => b.value), ...scopeKeys.map(k => scriptScope[k])];

    const src = Function.prototype.toString.call(handlerFunc).trim();
    let fnParams = '';
    let fnBody = '';
    let isAsync = false;

    let m = src.match(/^async\s+function(?:\s+[\w$]+)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/);
    if (m) {
      isAsync = true;
      fnParams = m[1];
      fnBody = m[2];
    } else {
      m = src.match(/^function(?:\s+[\w$]+)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/);
      if (m) {
        fnParams = m[1];
        fnBody = m[2];
      } else {
        m = src.match(/^async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*$/);
        if (m) {
          isAsync = true;
          fnParams = m[1];
          fnBody = m[2];
        } else {
          m = src.match(/^\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*$/);
          if (m) {
            fnParams = m[1];
            fnBody = m[2];
          } else {
            return handlerFunc;
          }
        }
      }
    }

    // Auto-await solo nel body dell'handler (non a top-level compile)
    const bodyWithAwait = injectAutoAwaitBlockingApis(fnBody);
    const factory = new Function(
      ...paramNames,
      `return ${isAsync ? 'async ' : ''}function(${fnParams}) { ${bodyWithAwait} };`
    );
    return factory(...paramValues);
  }

  /**
   * Esegue un handler utente con API + variabili nello scope lessicale.
   */
  async function runHandlerWithExecutionScope(handlerFunc, args) {
    const scriptScope = buildHandlerExecutionScope();
    const rebound = rebindHandlerWithExecutionScope(handlerFunc, scriptScope);
    const result = rebound.apply(scriptScope, args);
    if (result && typeof result.then === 'function') {
      return await result;
    }
    return result;
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
        // Evita "async async function" se l'handler è già dichiarato async
        processedScriptContent = processedScriptContent.replace(
          new RegExp(`(?<!async\\s)function\\s+${escapedName}\\s*\\(`, 'gm'),
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
          ${processedScriptContent}
          ${handlerExtractionBlock}
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
  function getScriptContentHash(scriptContent) {
    const s = String(scriptContent || '');
    if (!s) return '0';
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }

  function getCompiledHandler(scriptName, scriptContent, handlerName) {
    const contentHash = getScriptContentHash(scriptContent);
    const cachedHash = gameState.compiledScriptHashes.get(scriptName);
    if (cachedHash !== contentHash) {
      gameState.compiledScripts.delete(scriptName);
      gameState.compiledScriptHashes.set(scriptName, contentHash);
      compileScript(scriptName, scriptContent);
    } else if (!gameState.compiledScripts.has(scriptName)) {
      gameState.compiledScriptHashes.set(scriptName, contentHash);
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

        const parentSideEffects = pendingScriptSideEffects;
        pendingScriptSideEffects = [];
        try {
          const result = handlerFunction.apply(null, argsArray);
          if (result && typeof result.then === 'function') {
            await result;
          }
          // Attendi side-effect API anche se lo script non ha usato await (es. load_room / play_music)
          await flushScriptSideEffects();
        } finally {
          pendingScriptSideEffects = parentSideEffects;
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

  function compileAllProjectScripts() {
    const scripts = gameState.scripts || {};
    let count = 0;
    for (const [scriptName, scriptContent] of Object.entries(scripts)) {
      if (!scriptContent || typeof scriptContent !== 'string' || !scriptContent.trim()) continue;
      try {
        compileScript(scriptName, scriptContent);
        count++;
      } catch (error) {
        log(`[Runtime] compileAllProjectScripts: errore su '${scriptName}': ${error.message}`, 'error');
      }
    }
    log(`[Runtime] Pre-compilati ${count} script di progetto`, 'info');
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
        const result = handler();
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (error) {
        log(`Error in on_game_start handler: ${error.message}`, 'error');
      }
    }
  }

  function collectAttachedRoomScriptNames(roomScriptsAtt, roomId, handlerName) {
    const names = [];
    const push = (n) => {
      if (n && typeof n === 'string' && names.indexOf(n) < 0) names.push(n);
    };
    if (!roomScriptsAtt || typeof roomScriptsAtt !== 'object') {
      push(`Room:${roomId}:${handlerName}`);
      push(`Room:${roomId}`);
      return names;
    }
    const entry = roomScriptsAtt[roomId];
    if (typeof entry === 'string') {
      push(entry);
    } else if (entry && typeof entry === 'object') {
      if (entry[handlerName]) push(entry[handlerName]);
      if (entry.legacy) push(entry.legacy);
    }
    push(`Room:${roomId}:${handlerName}`);
    push(`Room:${roomId}`);
    return names;
  }

  function collectAllRoomAttachmentScriptNames(roomScriptsAtt) {
    const set = new Set();
    if (!roomScriptsAtt || typeof roomScriptsAtt !== 'object') return set;
    Object.values(roomScriptsAtt).forEach(entry => {
      if (typeof entry === 'string' && entry) set.add(entry);
      else if (entry && typeof entry === 'object') {
        Object.values(entry).forEach(v => {
          if (typeof v === 'string' && v) set.add(v);
        });
      }
    });
    return set;
  }

  async function executeRoomTransitionScripts(handlerName, registeredHandlersKey, oldRoomId, newRoomId) {
    beginRoomTransitionScripts();
    try {
      const executedScripts = new Set();
      const roomScripts = gameState.attachments.roomScripts || {};
      const roomSpecificScripts = collectAllRoomAttachmentScriptNames(roomScripts);

      const attachedForRoom = collectAttachedRoomScriptNames(roomScripts, newRoomId, handlerName);
      for (const scriptName of attachedForRoom) {
        if (!scriptName || executedScripts.has(scriptName)) continue;
        if (!gameState.scripts[scriptName]) continue;
        executedScripts.add(scriptName);
        await executeScriptHandler(gameState.scripts[scriptName], handlerName, [oldRoomId, newRoomId], scriptName);
      }

      // Global event-specific scripts (Global:on_before_room_change / Global:on_room_change)
      const globalEventKey = `Global:${handlerName}`;
      if (gameState.scripts[globalEventKey] && !executedScripts.has(globalEventKey)) {
        executedScripts.add(globalEventKey);
        await executeScriptHandler(gameState.scripts[globalEventKey], handlerName, [oldRoomId, newRoomId], globalEventKey);
      }

      const reservedScript = gameState.scripts[handlerName];
      if (reservedScript && !executedScripts.has(handlerName) && !roomSpecificScripts.has(handlerName)) {
        executedScripts.add(handlerName);
        await executeScriptHandler(reservedScript, handlerName, [oldRoomId, newRoomId], handlerName);
      }

      const handlerRegex = new RegExp(`(?:async\\s+)?function\\s+${handlerName}\\s*\\(`);
      for (const [scriptName, scriptContent] of Object.entries(gameState.scripts)) {
        if (executedScripts.has(scriptName)) continue;
        if (roomSpecificScripts.has(scriptName)) continue;
        // Evita di eseguire script Room: di altre stanze via scan generico
        if (String(scriptName).startsWith('Room:')) {
          const prefix = `Room:${newRoomId}`;
          const isThisRoom =
            scriptName === prefix ||
            scriptName === `${prefix}:${handlerName}` ||
            scriptName.startsWith(`${prefix}:`);
          if (!isThisRoom) continue;
        }
        if (scriptContent && typeof scriptContent === 'string' && handlerRegex.test(scriptContent)) {
          executedScripts.add(scriptName);
          await executeScriptHandler(scriptContent, handlerName, [oldRoomId, newRoomId], scriptName);
        }
      }

      const handlers = eventHandlers[registeredHandlersKey];
      if (Array.isArray(handlers)) {
        for (const handler of handlers) {
          try {
            const result = handler(oldRoomId, newRoomId);
            if (result && typeof result.then === 'function') {
              await result;
            }
          } catch (error) {
            log(`Error in ${handlerName} handler: ${error.message}`, 'error');
          }
        }
      }
    } finally {
      endRoomTransitionScripts();
    }
  }

  async function executeBeforeRoomChangeScripts(oldRoomId, newRoomId) {
    await executeRoomTransitionScripts('on_before_room_change', 'before_room_change', oldRoomId, newRoomId);
  }

  async function executeRoomChangeScripts(oldRoomId, newRoomId) {
    await executeRoomTransitionScripts('on_room_change', 'room_change', oldRoomId, newRoomId);
  }

  async function executeObjectClickScripts(objectId, x, y, usedItemId) {
    const useWithMode = isUseWithMode(usedItemId);
    const args = useWithMode
      ? [objectId, x, y, usedItemId]
      : [objectId, x, y];

    const objectScripts = gameState.attachments.objectScripts || {};
    if (typeof objectScripts === 'object' && objectScripts[objectId]) {
      const scriptName = objectScripts[objectId];
      if (gameState.scripts[scriptName]) {
        if (useWithMode) {
          const outcome = await tryExecuteScriptHandler(
            gameState.scripts[scriptName],
            'on_object_click',
            args,
            scriptName
          );
          return isUseWithHandlerSuccess(outcome);
        }
        await executeScriptHandler(gameState.scripts[scriptName], 'on_object_click', args, scriptName);
        return;
      }
      log(`[executeObjectClickScripts] Script "${scriptName}" associato to object "${objectId}" not found`, 'warning');
    } else {
      log(`[executeObjectClickScripts] No script associato to object "${objectId}"`, 'info');
    }

    if (useWithMode) {
      return false;
    }
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
   * Fattore di velocità in base alla profondità (scaling Y della room).
   * Alla linea di foreground (max scale) = 1; verso background rallenta proporzionalmente.
   * Se lo scaling non è configurato, restituisce 1.
   */
  function getDepthMoveSpeedFactor(characterY, room) {
    if (!room) return 1;
    const backgroundY = room.scalingBackgroundY;
    const foregroundY = room.scalingForegroundY;
    if (typeof backgroundY !== 'number' || typeof foregroundY !== 'number' ||
        isNaN(backgroundY) || isNaN(foregroundY) || backgroundY >= foregroundY) {
      return 1;
    }
    const maxScale = (typeof room.scalingMaxScale === 'number' && !isNaN(room.scalingMaxScale) && room.scalingMaxScale > 0)
      ? room.scalingMaxScale
      : 1.5;
    const scale = calculateCharacterScale(characterY, room);
    // Evita velocità troppo basse che bloccano il pathfinding
    return Math.max(0.15, scale / maxScale);
  }

  /**
   * Velocità effettiva in px/s: moveSpeed base × fattore profondità (se abilitato).
   * moveSpeed resta la velocità alla linea di foreground.
   */
  function getEffectiveMoveSpeed(character, room) {
    const base = (character && character.moveSpeed > 0) ? character.moveSpeed : 100;
    if (!character || character.scaleMoveSpeedWithDepth === false) {
      return base;
    }
    return base * getDepthMoveSpeedFactor(character.y, room);
  }

  function resolveScaleMoveSpeedWithDepth(charDef, existingValue) {
    if (existingValue === true || existingValue === false) return existingValue;
    if (charDef && charDef.spawnSettings && charDef.spawnSettings.scaleMoveSpeedWithDepth === false) {
      return false;
    }
    return true; // default: attiva
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

  /** Pending visibility/opacity set before the character instance exists (e.g. on_game_start). */
  const pendingCharacterVisualState = new Map(); // name/id -> { visible?, opacity? }

  function getPendingCharacterKey(characterIdOrName) {
    return String(characterIdOrName == null ? '' : characterIdOrName).trim();
  }

  function rememberPendingCharacterVisual(characterIdOrName, patch) {
    const key = getPendingCharacterKey(characterIdOrName);
    if (!key) return;
    const prev = pendingCharacterVisualState.get(key) || {};
    pendingCharacterVisualState.set(key, Object.assign({}, prev, patch || {}));
  }

  function applyPendingCharacterVisualState(character) {
    if (!character) return;
    const keys = [character.id, character.name].filter(Boolean).map(k => String(k));
    let patch = null;
    for (const key of keys) {
      if (pendingCharacterVisualState.has(key)) {
        patch = Object.assign({}, patch || {}, pendingCharacterVisualState.get(key));
        pendingCharacterVisualState.delete(key);
      }
    }
    if (!patch) return;
    if (typeof patch.visible === 'boolean') character.visible = patch.visible;
    if (patch.opacity != null && Number.isFinite(Number(patch.opacity))) {
      const clamped = clampCharacterOpacity(patch.opacity);
      if (clamped != null) character.opacity = clamped;
    }
    log(
      `[Runtime] Applied pending visual state on "${character.name}": visible=${character.visible}, opacity=${character.opacity}`,
      'info'
    );
  }

  /**
   * Find a live character by id or name.
   * Prefers current room, then any room (id===name instances may live across rooms).
   */
  function findCharacterInCurrentRoom(characterIdOrName) {
    const key = getPendingCharacterKey(characterIdOrName);
    if (!key) return null;

    // Direct Map lookup (id === name)
    let character = gameState.characters.get(key);
    if (character) {
      return { character, characterId: key };
    }

    // Prefer same room by name
    const currentRoomId = gameState.currentRoomId;
    for (const [id, char] of gameState.characters.entries()) {
      if (char && char.name === key && char.roomId === currentRoomId) {
        return { character: char, characterId: id };
      }
    }

    // Fallback: any room (useful in on_game_start / room transitions)
    for (const [id, char] of gameState.characters.entries()) {
      if (char && (char.name === key || id === key)) {
        return { character: char, characterId: id };
      }
    }

    return null;
  }

  function characterDefinitionExists(characterIdOrName) {
    const key = getPendingCharacterKey(characterIdOrName);
    if (!key) return false;
    if (gameState.characterDefinitions.has(key)) return true;
    for (const [name] of gameState.characterDefinitions.entries()) {
      if (name === key) return true;
    }
    if (gameState.projectData && Array.isArray(gameState.projectData.characters)) {
      return gameState.projectData.characters.some(
        c => c && (c.name === key || c.id === key)
      );
    }
    return false;
  }

  function clampCharacterOpacity(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
  }

  function getCharacterDrawOpacity(character) {
    if (!character) return 1;
    const clamped = clampCharacterOpacity(character.opacity);
    return clamped == null ? 1 : clamped;
  }

  function waitForCharacterAnimation(characterId) {
    return new Promise((resolve) => {
      const character = gameState.characters.get(characterId);
      if (!character || !character.playingAnimation) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        const currentCharacter = gameState.characters.get(characterId);
        if (!currentCharacter || !currentCharacter.playingAnimation) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        log(`[Runtime] waitForCharacterAnimation: Timeout per character ${characterId}`, 'warning');
        resolve();
      }, 30000);
    });
  }

  function estimateRoomAnimationMaxWaitMs(inst, animDef, loopOpt) {
    if (!animDef || !animDef.frames || animDef.frames.length === 0) return 30000;
    const frameDuration = 1000 / (Number(animDef.fps) || 8);
    const framesPerCycle = animDef.frames.length;
    const cycleMs = framesPerCycle * frameDuration;
    let cycles = 1;
    if (loopOpt && loopOpt.mode === 'count') cycles = Math.max(1, loopOpt.count);
    else if (loopOpt && loopOpt.mode === 'infinite') return 120000;
    return Math.min(120000, Math.ceil(cycleMs * cycles) + 2000);
  }

  function waitForRoomAnimationInstance(instanceOrKey) {
    const inst = (instanceOrKey && typeof instanceOrKey === 'object')
      ? instanceOrKey
      : findRoomAnimationInstance(instanceOrKey);
    return new Promise((resolve) => {
      if (!inst || !inst.playing) {
        resolve();
        return;
      }

      const animDef = gameState.roomAnimationDefinitions.get(inst.animationId);
      const loopOpt = inst.loopOpt || parseAudioLoopOption(null, inst.loopDefault);
      const maxMs = estimateRoomAnimationMaxWaitMs(inst, animDef, loopOpt);
      const startedAt = performance.now();

      function tick() {
        if (!inst.playing) {
          resolve();
          return;
        }
        if (performance.now() - startedAt >= maxMs) {
          log(`[Runtime] waitForRoomAnimationInstance: timeout "${inst.name}"`, 'warning');
          inst.playing = false;
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  function updateCharacterCustomAnimation(character, charDef, deltaTime) {
    const playing = character.playingAnimation;
    if (!playing || !playing.name) return;

    const animDef = charDef.animations && charDef.animations[playing.name];
    if (!animDef || !animDef.directions) {
      character.playingAnimation = null;
      character.currentFrame = 0;
      character.frameTime = 0;
      return;
    }

    const animDirection = findAvailableDirection(charDef, character.direction, playing.name);
    const animationDirData = animDef.directions[animDirection];
    if (!animationDirData || !animationDirData.frames || animationDirData.frames.length === 0) {
      character.playingAnimation = null;
      character.currentFrame = 0;
      character.frameTime = 0;
      return;
    }

    if (animationDirData.frames.length === 1) {
      character.currentFrame = 0;
      character.playingAnimation = null;
      character.frameTime = 0;
      return;
    }

    character.frameTime += deltaTime;
    const frameDuration = 1000 / (Number(animationDirData.fps) || 8);

    if (character.frameTime >= frameDuration) {
      character.currentFrame++;
      if (character.currentFrame >= animationDirData.frames.length) {
        character.playingAnimation = null;
        character.currentFrame = 0;
        character.frameTime = 0;
      } else {
        character.frameTime = 0;
      }
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
  async function executeHotspotScript(hotspotId, hotspot, x, y, usedItemId) {
    log(`[Runtime] [DEBUG] executeHotspotScript: INIZIO esecuzione script hotspot ${hotspotId}`, 'info');
    const useWithMode = isUseWithMode(usedItemId);

    const { code, hasCode } = resolveHotspotOnClickScript(hotspotId, hotspot);
    if (!hasCode) {
      log(`[Runtime] executeHotspotScript: nessun codice per hotspot ${hotspotId}`, 'info');
      return useWithMode ? false : undefined;
    }

    const onClick = hotspot && hotspot.scripts && hotspot.scripts.onClick;
    if (!useWithMode && onClick && onClick.enabled === false) {
      log(`[Runtime] executeHotspotScript: hotspot ${hotspotId} disabilitato (click normale)`, 'info');
      return undefined;
    }

    const normalizedUsedItemId = useWithMode ? resolveUseWithItemId(usedItemId) : usedItemId;
    const args = useWithMode
      ? [hotspotId, x, y, normalizedUsedItemId]
      : [hotspotId, x, y];
    const scriptName = `hotspot_${hotspotId}_onClick`;

    try {
      if (useWithMode) {
        const outcome = await tryExecuteScriptHandler(code, 'on_hotspot_click', args, scriptName);
        if (!outcome.found) {
          log(`[Runtime] executeHotspotScript: on_hotspot_click non trovato per ${hotspotId}`, 'warning');
          return false;
        }
        if (!isUseWithHandlerSuccess(outcome)) {
          log(`[Runtime] executeHotspotScript: combinazione non gestita su ${hotspotId} (item: ${normalizedUsedItemId})`, 'info');
          return false;
        }
        return true;
      }
      await executeScriptHandler(code, 'on_hotspot_click', args, scriptName);
    } catch (error) {
      log(`[Runtime] executeHotspotScript: errore ${hotspotId}: ${error.message}`, 'error');
      console.error('[Runtime] executeHotspotScript error:', error);
      if (useWithMode) return false;
    }
  }

  // ============================================
  // FULLSCREEN IMAGE OVERLAY (show_image / hide_image)
  // ============================================
  let fullscreenImageState = null; // { el, resolve, waitClick }

  function getFullscreenImageHost() {
    return document.getElementById('game-canvas-container') || document.getElementById('game-container') || document.body;
  }

  function dismissFullscreenImage(reason) {
    if (!fullscreenImageState) return;
    const state = fullscreenImageState;
    fullscreenImageState = null;
    if (state.el && state.el.parentNode) {
      try { state.el.parentNode.removeChild(state.el); } catch (_) {}
    }
    if (typeof state.resolve === 'function') {
      try { state.resolve({ ok: true, reason: reason || 'dismissed' }); } catch (_) {}
    }
    if (state.locked) releaseInputLock('show_image');
    log(`[Runtime] hide_image (${reason || 'dismissed'})`, 'info');
  }

  /**
   * Mostra un'immagine a tutto schermo (sopra il canvas).
   * @param {string} imageName - Nome file Resources (es. "cutscene.png"), asset:…, URL o data:
   * @param {{ waitClick?: boolean, fit?: 'contain'|'cover' }} [options]
   *   waitClick default true → Promise risolta al click (o hide_image)
   * @returns {Promise}
   */
  async function showFullscreenImage(imageName, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const waitClick = opts.waitClick !== false;
    const fit = opts.fit === 'cover' ? 'cover' : 'contain';
    const name = String(imageName == null ? '' : imageName).trim();
    if (!name) {
      GameAPI.error('show_image: image name is required (Resources file name, e.g. "photo.png")');
      return { ok: false, error: 'missing_name' };
    }

    if (fullscreenImageState) {
      dismissFullscreenImage('replaced');
    }

    let src = '';
    try {
      src = await resolveSpawnObjectImageRef(name);
    } catch (err) {
      GameAPI.error('show_image: resolve failed — ' + (err && err.message ? err.message : err));
      return { ok: false, error: 'resolve_failed' };
    }
    if (!src) {
      GameAPI.error(`show_image: image "${name}" not found in Resources`);
      return { ok: false, error: 'not_found' };
    }

    let img = null;
    try {
      const categoryHint = String(src).startsWith('asset:') ? 'resource' : null;
      img = await loadImage(src, categoryHint);
    } catch (err) {
      GameAPI.error('show_image: load failed — ' + (err && err.message ? err.message : err));
      return { ok: false, error: 'load_failed' };
    }
    if (!img || !img.src) {
      GameAPI.error(`show_image: could not load "${name}"`);
      return { ok: false, error: 'load_failed' };
    }

    const host = getFullscreenImageHost();
    const el = document.createElement('div');
    el.id = 'amianto-fullscreen-image';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Fullscreen image');
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:5000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:#000',
      'cursor:pointer',
      'user-select:none'
    ].join(';');

    const imgEl = document.createElement('img');
    imgEl.src = img.src;
    imgEl.alt = name;
    imgEl.draggable = false;
    imgEl.style.cssText = [
      'max-width:100%',
      'max-height:100%',
      'width:100%',
      'height:100%',
      'object-fit:' + fit,
      'pointer-events:none',
      'image-rendering:auto'
    ].join(';');
    el.appendChild(imgEl);

    if (waitClick) {
      const hint = document.createElement('div');
      hint.textContent = 'Click to continue';
      hint.style.cssText = [
        'position:absolute',
        'bottom:12px',
        'left:50%',
        'transform:translateX(-50%)',
        'color:#39ff14',
        'font:12px/1.2 monospace',
        'opacity:0.85',
        'pointer-events:none',
        'text-shadow:0 0 4px #000'
      ].join(';');
      el.appendChild(hint);
    }

    host.appendChild(el);

    return new Promise((resolve) => {
      fullscreenImageState = {
        el,
        resolve: waitClick ? resolve : null,
        waitClick,
        imageName: name,
        locked: false
      };
      if (waitClick) {
        acquireInputLock('show_image');
        fullscreenImageState.locked = true;
        const onClick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          el.removeEventListener('click', onClick);
          dismissFullscreenImage('click');
        };
        el.addEventListener('click', onClick);
      } else {
        // Overlay resta fino a hide_image(); Promise risolta subito
        resolve({ ok: true, reason: 'shown' });
      }
      log(`[Runtime] show_image: "${name}" (waitClick=${waitClick}, fit=${fit})`, 'info');
    });
  }

  // ============================================
  // GAME API - API ESPOSTA AGLI SCRIPT
  // ============================================
  // Sistema di eventi registrati
  const eventHandlers = {
    game_start: [],
    before_room_change: [],
    room_change: [],
    object_click: [],
    character_click: [],
    hotspot_click: [],
    gui_click: [],
    inventory_use_with: []
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

    /**
     * Pausa lo script per un tempo fisso (millisecondi).
     * Usare con await in handler async: await wait(1500);
     * @param {number} ms - Durata in millisecondi (>= 0)
     * @returns {Promise<void>}
     */
    wait: function(ms) {
      const n = Number(ms);
      if (!Number.isFinite(n) || n < 0) {
        GameAPI.error('wait: ms must be a non-negative number');
        return Promise.resolve();
      }
      if (n === 0) return Promise.resolve();
      return new Promise(resolve => setTimeout(resolve, n));
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

    /**
     * Carica una stanza.
     * Transizione: default da Impostazioni progetto / set_room_transition.
     * Override per questa chiamata:
     *   load_room(room, { transition, duration, x, y, direction })
     *   load_room(room, x, y, direction, { transition, duration })
     */
    load_room: function(roomIdOrName, playerX, playerY, playerDirection, transitionOptions) {
      if (typeof roomIdOrName !== 'string' && typeof roomIdOrName !== 'number') {
        GameAPI.error('load_room: roomIdOrName must be a string or number');
        return Promise.resolve(false);
      }

      const placement = parseLoadRoomCall(playerX, playerY, playerDirection, transitionOptions);
      const effect = resolveRoomTransitionEffect(placement.transition, placement.duration);
      const placeX = placement.playerX;
      const placeY = placement.playerY;
      const placeDirection = placement.playerDirection;

      const targetRoom = String(roomIdOrName);
      const previousRoomId = gameState.currentRoomId;

      // Ordine: before (vecchia stanza attiva) → snapshot → cambio stanza → posiziona player
      // → transizione visiva → after.
      // Dialoghi in before/after non bloccano (enqueueScriptCommand in room-transition).
      const roomPromise = (async () => {
        log(`[Runtime] load_room: inizio → "${targetRoom}" (da "${previousRoomId || ''}")`, 'info');

        // Risolvi id canonico per gli script Before della stanza di destinazione
        let resolvedTargetId = targetRoom;
        if (gameState.projectData && Array.isArray(gameState.projectData.rooms)) {
          const roomDef = gameState.projectData.rooms.find(r => r.id === targetRoom || r.name === targetRoom);
          if (roomDef) resolvedTargetId = String(roomDef.id || targetRoom);
        }

        // Before room load: stanza precedente ancora attiva (anche via load_room)
        try {
          await executeBeforeRoomChangeScripts(previousRoomId, resolvedTargetId);
        } catch (err) {
          log(`[Runtime] on_before_room_change before load_room: ${err && err.message ? err.message : err}`, 'error');
        }

        const sameRoom = previousRoomId && previousRoomId === resolvedTargetId;
        const useVisual = effect.type !== 'none' &&
          effect.duration > 0 &&
          !!previousRoomId &&
          !sameRoom &&
          !!canvas &&
          !!ctx;
        let transitionToken = null;

        try {
          if (useVisual) {
            transitionToken = beginRoomTransitionHold();
          }

          await changeRoom(targetRoom, { skipRoomScripts: true, skipAfterRoomScripts: true });

          const arrivedRoomId = gameState.currentRoomId || resolvedTargetId;
          const arrivedOk = String(gameState.currentRoomId || '') === resolvedTargetId;
          log(`[Runtime] load_room: stanza attiva "${arrivedRoomId}"`, 'info');

          if (!arrivedOk && transitionToken != null) {
            completeRoomTransition(transitionToken);
            transitionToken = null;
          }

          if (placeX !== undefined && placeY !== undefined) {
            let player = null;
            for (const [, char] of gameState.characters.entries()) {
              const charDef = gameState.characterDefinitions.get(char.name);
              const isPlayer = charDef && charDef.spawnSettings && charDef.spawnSettings.isPlayer === true;
              if (isPlayer) {
                player = char;
                break;
              }
            }

            if (!player) {
              log(`[Runtime] load_room: Player not found, impossibile posizionare`, 'warning');
            } else {
              player.x = Number(placeX) || 0;
              player.y = Number(placeY) || 0;
              player.renderX = player.x;
              player.renderY = player.y;
              player.targetY = player.y;
              player.velocityY = 0;
              player.isMoving = false;
              player.path = null;
              player.pathIndex = 0;
              player.roomId = arrivedRoomId;
              // Non forzare visible=true: rispetta set_character_visibility / opacity da script

              if (placeDirection !== undefined && placeDirection !== null) {
                const charDef = gameState.characterDefinitions.get(player.name);
                if (charDef && charDef.directions[placeDirection]) {
                  player.direction = placeDirection;
                  player.currentFrame = 0;
                  player.frameTime = 0;
                } else {
                  log(`[Runtime] load_room: Direzione "${placeDirection}" non disponibile per player "${player.name}"`, 'warning');
                }
              }

              log(`[Runtime] Player posizionato a (${player.x}, ${player.y}) in room ${arrivedRoomId}${placeDirection ? ` con direzione "${placeDirection}"` : ''}`, 'info');
            }
          }

          // After: la nuova stanza è già caricata ma ancora coperta dallo snapshot,
          // così visibilità e posizionamenti valgono dal primo frame visibile.
          try {
            await executeRoomChangeScripts(previousRoomId, arrivedRoomId);
          } catch (err) {
            log(`[Runtime] on_room_change after load_room: ${err && err.message ? err.message : err}`, 'error');
          }

          if (useVisual && transitionToken != null && transitionToken === roomTransitionSerial) {
            startRoomTransitionAnimation(effect.type, effect.duration);
            const done = waitRoomTransition(transitionToken);
            armRoomTransitionCompletion(transitionToken);
            await done;
          }
          return true;
        } finally {
          if (transitionToken != null) {
            completeRoomTransition(transitionToken);
          }
        }
      })().catch((err) => {
        GameAPI.error(`load_room: ${err && err.message ? err.message : err}`);
        return false;
      });

      return trackScriptSideEffect(roomPromise);
    },

    /**
     * Imposta la transizione usata dai load_room successivi in questa sessione.
     * Non riscrive le impostazioni progetto: al prossimo avvio torna il default del menu.
     * @param {string} type none | fade | fade_to_black | fade_to_white | slide | dissolve | iris
     * @param {number} [durationMs] millisecondi (0–10000)
     */
    set_room_transition: function(type, durationMs) {
      const normalized = normalizeRoomTransitionType(type);
      if (!normalized) {
        GameAPI.error(`set_room_transition: type must be ${ROOM_TRANSITION_TYPE_HINT}`);
        return false;
      }
      roomTransitionRuntime.type = normalized;
      if (durationMs !== undefined && durationMs !== null && String(durationMs).trim() !== '') {
        const duration = normalizeRoomTransitionDuration(durationMs);
        if (duration == null) {
          GameAPI.error('set_room_transition: duration must be a non-negative number of milliseconds');
          return false;
        }
        roomTransitionRuntime.duration = duration;
      }
      log(`[Runtime] Default transizione: ${roomTransitionRuntime.type}, ${roomTransitionRuntime.duration} ms`, 'info');
      return true;
    },

    get_room_transition: function() {
      return {
        type: roomTransitionRuntime.type,
        duration: roomTransitionRuntime.duration
      };
    },

    /**
     * Come load_room, con tipo e durata espliciti per questa sola chiamata.
     * transition_to_room(room, type?, durationMs?, playerX?, playerY?, playerDirection?)
     */
    transition_to_room: function(roomIdOrName, type, durationMs, playerX, playerY, playerDirection) {
      const opt = {};
      if (type !== undefined) opt.transition = type;
      if (durationMs !== undefined) opt.duration = durationMs;
      return GameAPI.load_room(roomIdOrName, playerX, playerY, playerDirection, opt);
    },

    // Oggetti
    enableObject: function(objectId) {
      if (!gameState.currentRoom || !gameState.currentRoom.objects) return;
      const obj = gameState.currentRoom.objects.find(o => o.id === objectId || o.name === objectId);
      if (obj) {
        obj.enabled = true;
        obj.visible = true;
        syncLiveRoomEntitiesToProjectData();
      }
    },

    disableObject: function(objectId) {
      if (!gameState.currentRoom || !gameState.currentRoom.objects) return;
      const obj = gameState.currentRoom.objects.find(o => o.id === objectId || o.name === objectId);
      if (obj) {
        obj.enabled = false;
        obj.visible = false;
        syncLiveRoomEntitiesToProjectData();
      }
    },

    enableHotspot: function(hotspotId) {
      if (!gameState.currentRoom || !gameState.currentRoom.hotspots) return false;
      const key = String(hotspotId);
      const hs = gameState.currentRoom.hotspots.find(h => h.id === key || h.name === key);
      if (!hs) {
        GameAPI.error(`enableHotspot: hotspot "${hotspotId}" not found in current room`);
        return false;
      }
      hs.visible = true;
      syncLiveRoomEntitiesToProjectData();
      log(`[Runtime] enableHotspot: "${hs.id}" active`, 'info');
      return true;
    },

    disableHotspot: function(hotspotId) {
      if (!gameState.currentRoom || !gameState.currentRoom.hotspots) return false;
      const key = String(hotspotId);
      const hs = gameState.currentRoom.hotspots.find(h => h.id === key || h.name === key);
      if (!hs) {
        GameAPI.error(`disableHotspot: hotspot "${hotspotId}" not found in current room`);
        return false;
      }
      hs.visible = false;
      syncLiveRoomEntitiesToProjectData();
      log(`[Runtime] disableHotspot: "${hs.id}" inactive`, 'info');
      return true;
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
      refreshInventoryItemImages();
      const current = Number(inv.contents.get(key) || 0);
      const next = current + q;
      inv.contents.set(key, next);
      log(`[Runtime] add_to_inventory: +${q} × "${key}" (totale: ${next})`, 'info');
      syncInventoryStateToEditor();
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
      syncInventoryStateToEditor();
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
      clearCarriedInventoryItem();
      log('[Runtime] clear_inventory: inventario svuotato', 'info');
      syncInventoryStateToEditor();
      return true;
    },

    get_carried_item: function() {
      const inv = gameState.inventory;
      if (!inv || !inv.carriedItem) return null;
      return resolveUseWithItemId(inv.carriedItem.key) || null;
    },

    clear_carried_item: function() {
      clearCarriedInventoryItem();
      syncInventoryStateToEditor();
    },

    set_carried_item: function(itemId) {
      const key = resolveInventoryContentKey(itemId);
      if (!key || !GameAPI.has_item(key)) return false;
      const def = resolveInventoryItemDef(itemId);
      if (!def) return false;
      const inv = ensureInventoryState();
      inv.carriedItem = {
        key,
        def,
        sourceSlotIndex: -1,
        slotW: 48,
        slotH: 48
      };
      inv.suppressPanelUntilDrop = true;
      if (inv.displayMode === 'toggle' || inv.displayMode === 'popup') {
        inv.visible = false;
      }
      updateInventoryCursorStyle();
      log(`[Runtime] set_carried_item: "${def.name || key}" preso in mano`, 'info');
      syncInventoryStateToEditor();
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
        img: null,
        visible: true,
        enabled: true,
        rotationRad: 0,
        scaleX: 1,
        scaleY: 1
      };
      gameState.currentRoom.objects.push(newObj);

      const imageRef = imageUrlOrDataUrl == null ? '' : String(imageUrlOrDataUrl).trim();
      if (imageRef) {
        resolveSpawnObjectImageRef(imageRef).then(resolvedUrl => {
          if (resolvedUrl) {
            attachImageToRoomObject(id, resolvedUrl);
          }
        });
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
      syncLiveRoomEntitiesToProjectData();
      log(`[Runtime] set_object_visible: "${obj.id}" → ${v}`, 'info');
      return true;
    },

    // Character API
    /**
     * Spawna un personaggio. L'id runtime è SEMPRE uguale al name (stabile tra sessioni/script).
     * @param {string} characterName
     * @param {number} x
     * @param {number} y
     * @param {string} [direction='south']
     * @param {string} [characterId] - ignorato se diverso dal name (mantenuto solo per compatibilità firma)
     * @returns {string|null} id (= name)
     */
    spawn_character: function(characterName, x, y, direction = 'south', characterId = null) {
      if (!characterName) {
        GameAPI.error('spawn_character: characterName is required');
        return null;
      }

      const name = String(characterName).trim();
      if (!name) {
        GameAPI.error('spawn_character: characterName is required');
        return null;
      }

      // id === name sempre (il 5° argomento non può creare id diversi)
      const id = name;
      if (characterId != null && String(characterId).trim() !== '' && String(characterId) !== id) {
        log(`[Runtime] spawn_character: characterId "${characterId}" ignorato — id forzato a name "${id}"`, 'warning');
      }

      const charDef = gameState.characterDefinitions.get(name);
      if (!charDef) {
        GameAPI.error(`spawn_character: character "${name}" not found in definitions`);
        return null;
      }

      // Rimuovi istanze legacy con stesso name ma chiave Map diversa (es. char_Name_timestamp)
      for (const [key, char] of [...gameState.characters.entries()]) {
        if (char && char.name === name && key !== id) {
          gameState.characters.delete(key);
          log(`[Runtime] spawn_character: removed legacy instance key "${key}" for "${name}"`, 'info');
        }
      }

      const dir = direction || 'south';
      let resolvedDirection = dir;
      if (!charDef.directions[resolvedDirection]) {
        log(`[Runtime] spawn_character: Direzione "${resolvedDirection}" non disponibile per "${name}", uso "south"`, 'warning');
        resolvedDirection = 'south';
      }

      let moveSpeed = 100;
      if (charDef.spawnSettings && charDef.spawnSettings.moveSpeed !== undefined) {
        const speedValue = Number(charDef.spawnSettings.moveSpeed);
        if (!isNaN(speedValue) && speedValue > 0) {
          moveSpeed = speedValue;
        }
      }
      const scaleMoveSpeedWithDepth = resolveScaleMoveSpeedWithDepth(charDef);

      const spawnX = Number(x);
      const spawnY = Number(y);
      const posX = Number.isFinite(spawnX) ? spawnX : 0;
      const posY = Number.isFinite(spawnY) ? spawnY : 0;

      // Se esiste già, riusa e aggiorna posizione (niente duplicati)
      if (gameState.characters.has(id)) {
        const existing = gameState.characters.get(id);
        existing.id = id;
        existing.name = name;
        existing.x = posX;
        existing.y = posY;
        existing.renderX = posX;
        existing.renderY = posY;
        existing.targetY = posY;
        existing.velocityY = 0;
        existing.direction = resolvedDirection;
        existing.roomId = gameState.currentRoomId;
        // Nuovo spawn: visibile; riuso: conserva visibility/opacity (es. nascosto in on_game_start)
        if (existing.visible === undefined) existing.visible = true;
        if (existing.opacity === undefined || !Number.isFinite(Number(existing.opacity))) {
          existing.opacity = 1;
        }
        existing.isMoving = false;
        existing.path = null;
        existing.pathIndex = 0;
        existing.moveSpeed = moveSpeed;
        existing.scaleMoveSpeedWithDepth = scaleMoveSpeedWithDepth;
        existing.playingAnimation = null;
        applyPendingCharacterVisualState(existing);
        log(`[Runtime] spawn_character: reused "${name}" (id=name) at (${posX}, ${posY})`, 'info');
        return id;
      }

      const character = {
        id: id,
        name: name,
        x: posX,
        y: posY,
        renderX: posX,
        renderY: posY,
        direction: resolvedDirection,
        currentFrame: 0,
        frameTime: 0,
        visible: true,
        opacity: 1,
        roomId: gameState.currentRoomId,
        isMoving: false,
        path: null,
        moveSpeed: moveSpeed,
        scaleMoveSpeedWithDepth: scaleMoveSpeedWithDepth,
        velocityY: 0,
        targetY: posY
      };

      applyPendingCharacterVisualState(character);
      gameState.characters.set(id, character);
      log(`[Runtime] Character "${name}" spawnato a (${posX}, ${posY}) id="${id}" (id=name)`, 'info');
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
      // Risolvi character: id esatto → playerId se nome coincide → primo match nome in room
      let character = gameState.characters.get(characterIdOrName);
      let characterId = characterIdOrName;

      if (!character) {
        const playerId = gameState.variables.get('playerId');
        if (playerId && gameState.characters.has(playerId)) {
          const playerChar = gameState.characters.get(playerId);
          if (playerChar && (playerChar.name === characterIdOrName || playerChar.id === characterIdOrName)) {
            character = playerChar;
            characterId = playerId;
          }
        }
      }

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

      // Allinea x/y logiche a renderX/Y (evita pathfinding da posizione "fantasma")
      if (typeof character.renderX === 'number' && Number.isFinite(character.renderX)) {
        character.x = character.renderX;
      }
      if (typeof character.renderY === 'number' && Number.isFinite(character.renderY)) {
        character.y = character.renderY;
      }

      // Inizializza proprietà movimento se mancanti
      if (character.isMoving === undefined) character.isMoving = false;
      if (character.path === undefined) character.path = null;
      if (character.pathIndex === undefined) character.pathIndex = 0;
      if (character.moveSpeed === undefined) {
        // Prova a leggere dalle spawnSettings del character definition
        const charDefForSpeed = gameState.characterDefinitions.get(character.name);
        if (charDefForSpeed && charDefForSpeed.spawnSettings && charDefForSpeed.spawnSettings.moveSpeed !== undefined) {
          const speedValue = Number(charDefForSpeed.spawnSettings.moveSpeed);
          character.moveSpeed = (!isNaN(speedValue) && speedValue > 0) ? speedValue : 100;
        } else {
          character.moveSpeed = 100; // pixel per secondo (default)
        }
      }
      if (character.scaleMoveSpeedWithDepth === undefined) {
        character.scaleMoveSpeedWithDepth = resolveScaleMoveSpeedWithDepth(
          gameState.characterDefinitions.get(character.name)
        );
      }

      // Verifica che il character abbia un pivot (necessario per il pathfinding)
      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || charDef.pivotX === undefined || charDef.pivotY === undefined) {
        GameAPI.error(`walk_character: character "${characterIdOrName}" has no pivot defined`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" non ha un pivot definito`));
      }

      // Posizione pivot = coordinate logiche (piedi), già allineate a renderX/Y
      const characterPivotX = character.x;
      const characterPivotY = character.y;
      log(`[Runtime] walk_character: "${character.name}" (${characterId}) from (${Math.round(characterPivotX)}, ${Math.round(characterPivotY)}) to (${Math.round(Number(x) || 0)}, ${Math.round(Number(y) || 0)})`, 'info');

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

      // Avvia il movimento del character (interrompe animazione custom e movimento precedente)
      character.playingAnimation = null;
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
      // e blocca nuovi click fino al termine (per await walk_character negli script)
      if (waitForCompletion) {
        acquireInputLock('walk_character');
        return waitForCharacterMovement(characterId).finally(() => {
          releaseInputLock('walk_character');
        });
      }
      return Promise.resolve();
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

    /**
     * Mostra/nasconde un personaggio (non cliccabile se nascosto).
     * @param {string} characterIdOrName
     * @param {boolean} visible
     * @returns {boolean}
     */
    set_character_visibility: function(characterIdOrName, visible) {
      const v = !!visible;
      const found = findCharacterInCurrentRoom(characterIdOrName);
      if (found) {
        found.character.visible = v;
        log(`[Runtime] set_character_visibility: "${found.characterId}" → ${v}`, 'info');
        return true;
      }
      // Not spawned yet (common in on_game_start before NPC auto-spawn) — remember and apply on spawn
      if (characterDefinitionExists(characterIdOrName)) {
        rememberPendingCharacterVisual(characterIdOrName, { visible: v });
        log(
          `[Runtime] set_character_visibility: "${characterIdOrName}" not spawned yet — queued (visible=${v})`,
          'info'
        );
        return true;
      }
      GameAPI.error(`set_character_visibility: character "${characterIdOrName}" not found`);
      return false;
    },

    /**
     * Imposta l'opacità di disegno di un personaggio (0–1). A 0 non è cliccabile.
     * @param {string} characterIdOrName
     * @param {number} opacity
     * @returns {boolean}
     */
    set_character_opacity: function(characterIdOrName, opacity) {
      const clamped = clampCharacterOpacity(opacity);
      if (clamped == null) {
        GameAPI.error('set_character_opacity: opacity must be a number (0–1)');
        return false;
      }
      const found = findCharacterInCurrentRoom(characterIdOrName);
      if (found) {
        found.character.opacity = clamped;
        log(`[Runtime] set_character_opacity: "${found.characterId}" → ${clamped}`, 'info');
        return true;
      }
      if (characterDefinitionExists(characterIdOrName)) {
        rememberPendingCharacterVisual(characterIdOrName, { opacity: clamped });
        log(
          `[Runtime] set_character_opacity: "${characterIdOrName}" not spawned yet — queued (opacity=${clamped})`,
          'info'
        );
        return true;
      }
      GameAPI.error(`set_character_opacity: character "${characterIdOrName}" not found`);
      return false;
    },

    animate_character: function(characterIdOrName, enabled = true) {
      const found = findCharacterInCurrentRoom(characterIdOrName);
      if (!found) {
        GameAPI.error(`animate_character: character "${characterIdOrName}" not found (by ID or name in current room)`);
        return;
      }
      log(`[Runtime] Character ${found.characterId} animazione ${enabled ? 'abilitata' : 'disabilitata'}`, 'info');
    },

    /**
     * Riproduce un'animazione custom definita in characterDefinitions.animations.
     * @param {string} characterIdOrName - ID o nome del personaggio nella room corrente
     * @param {string} animationName - Nome animazione (es. "wave")
     * @param {string} direction - Direzione (north, south, east, ...)
     * @param {boolean} waitForCompletion - Se true, attende la fine del ciclo (default true)
     */
    play_character_animation: function(characterIdOrName, animationName, direction, waitForCompletion = true) {
      const found = findCharacterInCurrentRoom(characterIdOrName);
      if (!found) {
        GameAPI.error(`play_character_animation: character "${characterIdOrName}" not found (by ID or name in current room)`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" not found`));
      }

      const { character, characterId } = found;
      const animKey = String(animationName || '').trim();
      const dirKey = String(direction || '').trim().toLowerCase();

      if (!animKey) {
        GameAPI.error('play_character_animation: animation name is required');
        return Promise.reject(new Error('Animation name is required'));
      }
      if (!dirKey) {
        GameAPI.error('play_character_animation: direction is required');
        return Promise.reject(new Error('Direction is required'));
      }

      if (character.roomId !== gameState.currentRoomId) {
        GameAPI.error(`play_character_animation: character "${characterIdOrName}" is not in the current room`);
        return Promise.reject(new Error(`Character "${characterIdOrName}" is not in the current room`));
      }

      const charDef = gameState.characterDefinitions.get(character.name);
      if (!charDef || !charDef.animations || !charDef.animations[animKey]) {
        GameAPI.error(`play_character_animation: animation "${animKey}" not found for character "${character.name}"`);
        return Promise.reject(new Error(`Animation "${animKey}" not found`));
      }

      const animDef = charDef.animations[animKey];
      const resolvedDirection = findAvailableDirection(charDef, dirKey, animKey);
      const dirData = animDef.directions[resolvedDirection];
      if (!dirData || !dirData.frames || dirData.frames.length === 0) {
        GameAPI.error(`play_character_animation: direction "${dirKey}" has no frames for animation "${animKey}"`);
        return Promise.reject(new Error(`Direction "${dirKey}" has no frames`));
      }

      character.isMoving = false;
      character.path = null;
      character.pathIndex = 0;
      character.direction = resolvedDirection;
      character.playingAnimation = { name: animKey };
      character.currentFrame = 0;
      character.frameTime = 0;

      log(`[Runtime] play_character_animation: "${character.name}" plays "${animKey}" (${resolvedDirection}, ${dirData.frames.length} frame(s))`, 'info');

      if (waitForCompletion) {
        acquireInputLock('play_character_animation');
        return waitForCharacterAnimation(characterId).finally(() => {
          releaseInputLock('play_character_animation');
        });
      }
      return Promise.resolve();
    },

    // UI
    showText: function(text) {
      // Messaggio overlay: blocca i comandi in coda finché non viene chiuso (× o ~3s)
      const messageText = String(text);
      return enqueueScriptCommand(async () => {
        await showGameMessage(messageText, 3000);
      });
    },

    show_message: function(text) {
      return GameAPI.showText(text);
    },

    /**
     * Mostra un balloon di dialogo sul personaggio indicato (ID o nome nella room corrente).
     * Usa le impostazioni della prima GUI DialogBox del progetto. Il balloon segue il personaggio.
     * Il giocatore chiude il dialogo con un click.
     * In on_room_change / on_before_room_change non blocca load_room (il balloon resta in coda).
     * Negli altri script aspetta la chiusura prima dei comandi successivi (anche senza await esplicito).
     * @param {string} characterIdOrName - ID (da spawn_character) o nome del personaggio
     * @param {string} text - Testo parlato
     */
    show_dialogue: function(characterIdOrName, text) {
      if (text === undefined || text === null) {
        GameAPI.error('show_dialogue: serve show_dialogue(personaggio, testo) — due argomenti');
        return Promise.resolve();
      }
      return enqueueScriptCommand(async () => {
        await showDialogueAndWait(characterIdOrName, text);
      });
    },

    /** Alias roadmap: show_dialogue_text(testo, personaggio) */
    show_dialogue_text: function(text, speaker) {
      return GameAPI.show_dialogue(speaker, text);
    },

    /**
     * Avvia un dialogo ramificato definito nel progetto (tab Dialogues).
     * Esegue nodi line/choice/end; Promise risolta a fine dialogo o end_dialogue().
     * In on_room_change / on_before_room_change non blocca load_room (il grafo resta in coda).
     * Negli altri script aspetta la fine del dialogo prima dei comandi successivi.
     * @param {string} dialogueIdOrName - id o name del dialogo
     */
    start_dialogue: function(dialogueIdOrName) {
      return enqueueScriptCommand(async () => {
        const def = resolveDialogue(dialogueIdOrName);
        if (!def) {
          GameAPI.error(`start_dialogue: dialogue "${dialogueIdOrName}" not found`);
          return;
        }
        await runDialogueGraph(def);
      });
    },

    /** Chiude immediatamente balloon e sessione grafo attiva */
    end_dialogue: function() {
      endAllDialogue();
    },

    /**
     * Mostra un'immagine a tutto schermo (Resources: nome file, es. "cutscene.png").
     * Di default aspetta un click del giocatore (Promise). Usa hide_image() per chiudere da script.
     * @param {string} imageName - Nome in Resources / asset:… / URL
     * @param {{ waitClick?: boolean, fit?: 'contain'|'cover' }} [options]
     * @returns {Promise}
     */
    show_image: function(imageName, options) {
      return enqueueScriptCommand(async () => {
        await showFullscreenImage(imageName, options);
      });
    },

    /** Nasconde l'overlay di show_image se presente. */
    hide_image: function() {
      dismissFullscreenImage('api');
    },

    /**
     * Salva lo stato di gioco del player (non il progetto editor).
     * Storage: localStorage keyed by project id + slot (1–10 or custom string).
     * @param {number|string} [slot=1]
     * @param {string} [label]
     * @returns {{ ok: boolean, slot: string, savedAt: string, bytes: number }}
     */
    save_game: function(slot, label) {
      try {
        if (!gameState.projectData || !isGamePlayable()) {
          GameAPI.error('save_game: game not ready');
          return { ok: false, error: 'not_ready' };
        }
        const slotKey = normalizeGameSaveSlot(slot == null ? 1 : slot);
        const payload = serializeGameStateForSave(label);
        payload.slot = slotKey;
        const written = writeGameSaveToStorage(slotKey, payload);
        log(`[Runtime] save_game: slot "${slotKey}" (${written.bytes} bytes)`, 'success');
        return { ok: true, slot: slotKey, savedAt: payload.savedAt, bytes: written.bytes, label: payload.label };
      } catch (err) {
        GameAPI.error('save_game: ' + (err && err.message ? err.message : err));
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    },

    /**
     * Carica uno slot di salvataggio (stanza, variabili, inventario, personaggi, oggetti/hotspot).
     * Non riesegue on_room_change / on_game_start.
     * @param {number|string} [slot=1]
     * @returns {Promise<{ ok: boolean, slot?: string, error?: string }>}
     */
    load_game: function(slot) {
      return queueCommand(async () => {
        try {
          if (!gameState.projectData) {
            GameAPI.error('load_game: no project loaded');
            return { ok: false, error: 'no_project' };
          }
          const slotKey = normalizeGameSaveSlot(slot == null ? 1 : slot);
          const data = readGameSaveFromStorage(slotKey);
          if (!data) {
            GameAPI.error(`load_game: no save in slot "${slotKey}"`);
            return { ok: false, error: 'not_found', slot: slotKey };
          }
          await restoreGameStateFromSave(data);
          return { ok: true, slot: slotKey, savedAt: data.savedAt || null };
        } catch (err) {
          GameAPI.error('load_game: ' + (err && err.message ? err.message : err));
          return { ok: false, error: String(err && err.message ? err.message : err) };
        }
      });
    },

    /**
     * Elimina uno slot di salvataggio.
     * @param {number|string} slot — obbligatorio (1–10 o id stringa)
     */
    delete_save: function(slot) {
      try {
        if (slot == null || slot === '') {
          GameAPI.error('delete_save: slot is required');
          return { ok: false, error: 'slot_required' };
        }
        const slotKey = normalizeGameSaveSlot(slot, { requireExplicit: true });
        deleteGameSaveFromStorage(slotKey);
        log(`[Runtime] delete_save: slot "${slotKey}"`, 'info');
        return { ok: true, slot: slotKey };
      } catch (err) {
        GameAPI.error('delete_save: ' + (err && err.message ? err.message : err));
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    },

    /**
     * Metadata di uno slot, o lista di tutti gli slot del progetto corrente se slot omesso.
     * @param {number|string} [slot]
     */
    get_save_info: function(slot) {
      try {
        if (slot == null || slot === '') {
          return listGameSavesFromStorage();
        }
        const slotKey = normalizeGameSaveSlot(slot);
        const data = readGameSaveFromStorage(slotKey);
        if (!data) return null;
        return {
          slot: slotKey,
          label: data.label || '',
          savedAt: data.savedAt || null,
          projectId: data.projectId || null,
          projectName: data.projectName || null,
          roomId: data.state && data.state.currentRoomId ? data.state.currentRoomId : null,
          version: data.version || null
        };
      } catch (err) {
        GameAPI.error('get_save_info: ' + (err && err.message ? err.message : err));
        return null;
      }
    },

    /**
     * Mostra una GUI per id o nome (es. SaveLoad menu).
     * @param {string} idOrName
     * @returns {boolean}
     */
    show_gui: function(idOrName) {
      const ok = setGuiVisible(idOrName, true);
      if (!ok) GameAPI.error(`show_gui: GUI "${idOrName}" not found`);
      return ok;
    },

    /**
     * Nasconde una GUI per id o nome.
     * @param {string} idOrName
     * @returns {boolean}
     */
    hide_gui: function(idOrName) {
      const ok = setGuiVisible(idOrName, false);
      if (!ok) GameAPI.error(`hide_gui: GUI "${idOrName}" not found`);
      return ok;
    },

    /**
     * Riproduce musica di sottofondo in loop infinito (una traccia alla volta).
     * Non si interrompe finché non viene chiamato stop_music() (o un nuovo play_music).
     * @param {string} trackId - Nome file, asset id, o "asset:..."
     * @param {boolean|string|number} [loop] - ignorato: la musica è sempre in loop
     */
    play_music: function(trackId, loop) {
      if (!trackId || !String(trackId).trim()) {
        GameAPI.error('play_music: trackId is required');
        return Promise.resolve(null);
      }
      const loopOpt = { mode: 'infinite' };
      const ref = String(trackId).trim();
      // Ferma solo la traccia precedente (nuovo play_music), non i click/unlock
      stopMusicPlayback();
      return trackScriptSideEffect(playMusicFromRef(ref, {
        volume: gameState.audio.musicVolume,
        loopOpt
      }).then(handle => {
        if (!handle) return null;
        const el = (handle.element && handle.element.nodeName === 'AUDIO')
          ? handle.element
          : (musicAudioEl || asAudioElementProxy(handle));
        if (el && el.loop !== undefined) el.loop = true;
        gameState.audio.music = {
          handle,
          element: el,
          ref,
          loopOpt
        };
        log(`[Runtime] play_music: "${ref}" (loop: infinite until stop_music)`, 'info');
        return handle;
      }));
    },

    /**
     * Riproduce un effetto sonoro (può sovrapporsi ad altri SFX).
     * @param {string} soundId - Nome file, asset id, o "asset:..."
     * @param {boolean|string|number} [loop=false] - true/'loop' = loop fino a stop_sound; false/'once' = una volta; N = N ripetizioni
     */
    play_sound: function(soundId, loop) {
      if (!soundId || !String(soundId).trim()) {
        GameAPI.error('play_sound: soundId is required');
        return Promise.resolve(null);
      }
      const loopOpt = parseAudioLoopOption(loop, false);
      const ref = String(soundId).trim();
      const trackKey = normalizeResourceFileKey(ref);

      if (loopOpt.mode === 'infinite') {
        stopSoundPlayback(trackKey);
      }

      return trackScriptSideEffect(playAudioFromRef(ref, {
        volume: gameState.audio.soundVolume,
        loopOpt
      }).then(handle => {
        if (!handle) return null;
        if (loopOpt.mode === 'infinite') {
          gameState.audio.sounds.set(trackKey, {
            handle,
            element: asAudioElementProxy(handle),
            ref,
            loopOpt
          });
        }
        log(`[Runtime] play_sound: "${ref}" (loop: ${loopOpt.mode === 'count' ? loopOpt.count : loopOpt.mode})`, 'info');
        return handle;
      }));
    },

    /** Ferma la musica di sottofondo */
    stop_music: function() {
      stopMusicPlayback();
      log('[Runtime] stop_music', 'info');
    },

    /**
     * Ferma un effetto sonoro in loop (stesso id usato in play_sound).
     * Senza argomenti ferma tutti i suoni in loop tracciati.
     */
    stop_sound: function(soundId) {
      if (soundId == null || soundId === '') {
        for (const key of [...gameState.audio.sounds.keys()]) {
          stopSoundPlayback(key);
        }
        log('[Runtime] stop_sound: all looping sounds stopped', 'info');
        return;
      }
      const trackKey = normalizeResourceFileKey(String(soundId).trim());
      stopSoundPlayback(trackKey);
      log(`[Runtime] stop_sound: "${soundId}"`, 'info');
    },

    /**
     * Avvia o riavvia un'animazione di stanza posizionata nell'editor.
     * @param {string} instanceIdOrName - ID o nome dell'istanza nella stanza corrente
     * @param {boolean|string|number} [loop] - true/'loop' = loop; false/'once' = una volta; N = N cicli; omit = default animazione
     * @param {boolean} [waitForCompletion] - Se true (o loop finito: once/count), attende la fine prima di proseguire lo script
     * @returns {Promise<void>}
     */
    play_animation: function(instanceIdOrName, loop, waitForCompletion) {
      if (!instanceIdOrName || !String(instanceIdOrName).trim()) {
        GameAPI.error('play_animation: instanceIdOrName is required');
        return Promise.resolve();
      }
      const inst = findRoomAnimationInstance(instanceIdOrName);
      if (!inst) {
        GameAPI.error(`play_animation: instance "${instanceIdOrName}" not found in current room`);
        return Promise.resolve();
      }
      const animDef = gameState.roomAnimationDefinitions.get(inst.animationId);
      if (!animDef) {
        GameAPI.error(`play_animation: animation definition missing for "${instanceIdOrName}"`);
        return Promise.resolve();
      }
      const loopOpt = parseAudioLoopOption(loop, inst.loopDefault);
      inst.loopOpt = loopOpt;
      inst.cyclesRemaining = loopOpt.mode === 'count' ? loopOpt.count : null;
      inst.visible = true;
      inst.playing = true;
      inst.currentFrame = 0;
      inst.frameTime = 0;
      log(`[Runtime] play_animation: "${inst.name}" (loop: ${loopOpt.mode === 'count' ? loopOpt.count : loopOpt.mode})`, 'info');

      const shouldWait = waitForCompletion === true ||
        (waitForCompletion !== false && loopOpt.mode !== 'infinite');
      if (shouldWait) {
        return waitForRoomAnimationInstance(inst);
      }
      return Promise.resolve();
    },

    /**
     * Ferma un'animazione di stanza. Senza argomenti ferma tutte le istanze della stanza corrente.
     */
    stop_animation: function(instanceIdOrName) {
      const room = gameState.currentRoom;
      if (!room || !Array.isArray(room.animationInstances)) return;

      if (instanceIdOrName == null || instanceIdOrName === '') {
        room.animationInstances.forEach(inst => {
          inst.playing = false;
          inst.currentFrame = 0;
          inst.frameTime = 0;
          inst.cyclesRemaining = null;
        });
        log('[Runtime] stop_animation: all room animations stopped', 'info');
        return;
      }

      const inst = findRoomAnimationInstance(instanceIdOrName);
      if (!inst) {
        GameAPI.error(`stop_animation: instance "${instanceIdOrName}" not found in current room`);
        return;
      }
      inst.playing = false;
      inst.currentFrame = 0;
      inst.frameTime = 0;
      inst.cyclesRemaining = null;
      log(`[Runtime] stop_animation: "${inst.name}"`, 'info');
    },

    /**
     * Mostra un'istanza di animazione di stanza (rendering riattivato).
     * @param {string} instanceIdOrName - ID o nome dell'istanza nella stanza corrente
     */
    show_animation: function(instanceIdOrName) {
      if (!instanceIdOrName || !String(instanceIdOrName).trim()) {
        GameAPI.error('show_animation: instanceIdOrName is required');
        return;
      }
      const inst = findRoomAnimationInstance(instanceIdOrName);
      if (!inst) {
        GameAPI.error(`show_animation: instance "${instanceIdOrName}" not found in current room`);
        return;
      }
      inst.visible = true;
      log(`[Runtime] show_animation: "${inst.name}"`, 'info');
    },

    /**
     * Nasconde un'istanza di animazione di stanza. Senza argomenti nasconde tutte le istanze della stanza.
     * @param {string} [instanceIdOrName] - ID o nome dell'istanza; omit = tutte
     */
    hide_animation: function(instanceIdOrName) {
      const room = gameState.currentRoom;
      if (!room || !Array.isArray(room.animationInstances)) return;

      if (instanceIdOrName == null || instanceIdOrName === '') {
        room.animationInstances.forEach(inst => {
          inst.visible = false;
          inst.playing = false;
          inst.currentFrame = 0;
          inst.frameTime = 0;
          inst.cyclesRemaining = null;
        });
        log('[Runtime] hide_animation: all room animations hidden', 'info');
        return;
      }

      const inst = findRoomAnimationInstance(instanceIdOrName);
      if (!inst) {
        GameAPI.error(`hide_animation: instance "${instanceIdOrName}" not found in current room`);
        return;
      }
      inst.visible = false;
      inst.playing = false;
      inst.currentFrame = 0;
      inst.frameTime = 0;
      inst.cyclesRemaining = null;
      log(`[Runtime] hide_animation: "${inst.name}"`, 'info');
    },

    // Event System - Funzioni helper per registrare handler
    on_game_start: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.game_start.push(handler);
        log('Handler on_game_start registrato', 'info');
      }
    },

    on_before_room_change: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.before_room_change.push(handler);
        log('Handler on_before_room_change registrato', 'info');
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
    },

    on_inventory_use_with: function(handler) {
      if (typeof handler === 'function') {
        eventHandlers.inventory_use_with.push(handler);
        log('Handler on_inventory_use_with registrato', 'info');
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
      { name: 'wait', value: bindGameApiMethod(api, 'wait') },
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
      { name: 'set_room_transition', value: bindGameApiMethod(api, 'set_room_transition') },
      { name: 'get_room_transition', value: bindGameApiMethod(api, 'get_room_transition') },
      { name: 'transition_to_room', value: bindGameApiMethod(api, 'transition_to_room') },
      { name: 'enableObject', value: bindGameApiMethod(api, 'enableObject') },
      { name: 'disableObject', value: bindGameApiMethod(api, 'disableObject') },
      { name: 'enableHotspot', value: bindGameApiMethod(api, 'enableHotspot') },
      { name: 'disableHotspot', value: bindGameApiMethod(api, 'disableHotspot') },
      { name: 'move_object', value: bindGameApiMethod(api, 'move_object') },
      { name: 'add_to_inventory', value: bindGameApiMethod(api, 'add_to_inventory') },
      { name: 'remove_from_inventory', value: bindGameApiMethod(api, 'remove_from_inventory') },
      { name: 'has_item', value: bindGameApiMethod(api, 'has_item') },
      { name: 'get_item_count', value: bindGameApiMethod(api, 'get_item_count') },
      { name: 'clear_inventory', value: bindGameApiMethod(api, 'clear_inventory') },
      { name: 'get_carried_item', value: bindGameApiMethod(api, 'get_carried_item') },
      { name: 'clear_carried_item', value: bindGameApiMethod(api, 'clear_carried_item') },
      { name: 'set_carried_item', value: bindGameApiMethod(api, 'set_carried_item') },
      { name: 'spawn_object', value: bindGameApiMethod(api, 'spawn_object') },
      { name: 'despawn_object', value: bindGameApiMethod(api, 'despawn_object') },
      { name: 'rotate_object', value: bindGameApiMethod(api, 'rotate_object') },
      { name: 'scale_object', value: bindGameApiMethod(api, 'scale_object') },
      { name: 'set_object_visible', value: bindGameApiMethod(api, 'set_object_visible') },
      { name: 'showText', value: bindGameApiMethod(api, 'showText') },
      { name: 'show_message', value: bindGameApiMethod(api, 'show_message') },
      { name: 'show_dialogue', value: bindGameApiMethod(api, 'show_dialogue') },
      { name: 'show_dialogue_text', value: bindGameApiMethod(api, 'show_dialogue_text') },
      { name: 'start_dialogue', value: bindGameApiMethod(api, 'start_dialogue') },
      { name: 'end_dialogue', value: bindGameApiMethod(api, 'end_dialogue') },
      { name: 'save_game', value: bindGameApiMethod(api, 'save_game') },
      { name: 'load_game', value: bindGameApiMethod(api, 'load_game') },
      { name: 'delete_save', value: bindGameApiMethod(api, 'delete_save') },
      { name: 'get_save_info', value: bindGameApiMethod(api, 'get_save_info') },
      { name: 'show_gui', value: bindGameApiMethod(api, 'show_gui') },
      { name: 'hide_gui', value: bindGameApiMethod(api, 'hide_gui') },
      { name: 'play_music', value: bindGameApiMethod(api, 'play_music') },
      { name: 'play_sound', value: bindGameApiMethod(api, 'play_sound') },
      { name: 'stop_music', value: bindGameApiMethod(api, 'stop_music') },
      { name: 'stop_sound', value: bindGameApiMethod(api, 'stop_sound') },
      { name: 'play_animation', value: bindGameApiMethod(api, 'play_animation') },
      { name: 'stop_animation', value: bindGameApiMethod(api, 'stop_animation') },
      { name: 'show_animation', value: bindGameApiMethod(api, 'show_animation') },
      { name: 'hide_animation', value: bindGameApiMethod(api, 'hide_animation') },
      { name: 'show_image', value: bindGameApiMethod(api, 'show_image') },
      { name: 'hide_image', value: bindGameApiMethod(api, 'hide_image') },
      { name: 'spawn_character', value: bindGameApiMethod(api, 'spawn_character') },
      { name: 'move_character', value: bindGameApiMethod(api, 'move_character') },
      { name: 'walk_character', value: bindGameApiMethod(api, 'walk_character') },
      { name: 'set_character_direction', value: bindGameApiMethod(api, 'set_character_direction') },
      { name: 'set_character_visibility', value: bindGameApiMethod(api, 'set_character_visibility') },
      { name: 'set_character_opacity', value: bindGameApiMethod(api, 'set_character_opacity') },
      { name: 'animate_character', value: bindGameApiMethod(api, 'animate_character') },
      { name: 'play_character_animation', value: bindGameApiMethod(api, 'play_character_animation') }
    ];
  }

  function createNoOpHandler(handlerName) {
    return function() {
      log(`[Runtime] compileScript: Chiamata a ${handlerName} ignorata durante compilazione (previene doppia esecuzione)`, 'warning');
    };
  }

  function eventHandlerParamName(handlerName) {
    return `__am_evt_${handlerName}__`;
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
      const sourceHandlers = SUPPORTED_SCRIPT_HANDLERS.slice();
      if (handlerMode === 'noop') {
        handlerNames = sourceHandlers.map(eventHandlerParamName);
        handlerArgs = sourceHandlers.map(createNoOpHandler);
      } else {
        handlerNames = sourceHandlers;
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

    window.play_character_animation = function(characterId, animationName, direction, waitForCompletion) {
      const wait = waitForCompletion !== false;
      if (wait) {
        return queueCommand(async () => {
          await api.play_character_animation(characterId, animationName, direction, true);
        });
      }
      return api.play_character_animation(characterId, animationName, direction, false);
    };

    window.play_animation = function(instanceIdOrName, loop, waitForCompletion) {
      return api.play_animation(instanceIdOrName, loop, waitForCompletion);
    };

    SUPPORTED_SCRIPT_HANDLERS.forEach(handlerName => {
      window[handlerName] = function(handler) {
        api[handlerName](handler);
      };
    });
  }

  exposeScriptGlobals();

  // ============================================
  // TRANSIZIONI TRA STANZE
  // ============================================
  function normalizeRoomTransitionType(value) {
    if (value == null) return null;
    const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (key === 'cut' || key === 'instant') return 'none';
    if (key === 'fadeblack' || key === 'fadetoblack' || key === 'black') return 'fade_to_black';
    if (key === 'fadewhite' || key === 'fadetowhite' || key === 'white') return 'fade_to_white';
    if (ROOM_TRANSITION_TYPES.indexOf(key) >= 0) return key;
    return null;
  }

  function normalizeRoomTransitionDuration(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(ROOM_TRANSITION_DURATION_MAX, Math.round(n));
  }

  function applyProjectRoomTransitionSettings(settings) {
    const s = settings || {};
    const type = normalizeRoomTransitionType(s.roomTransition);
    roomTransitionRuntime.type = type || 'none';
    const duration = normalizeRoomTransitionDuration(s.roomTransitionDuration);
    roomTransitionRuntime.duration = duration == null ? ROOM_TRANSITION_DURATION_DEFAULT : duration;
    cancelRoomTransitionVisual();
  }

  function parseLoadRoomCall(playerX, playerY, playerDirection, transitionOptions) {
    if (playerX && typeof playerX === 'object') {
      const opt = playerX;
      return {
        playerX: opt.x !== undefined ? opt.x : opt.playerX,
        playerY: opt.y !== undefined ? opt.y : opt.playerY,
        playerDirection: opt.direction !== undefined ? opt.direction : opt.playerDirection,
        transition: opt.transition,
        duration: opt.duration
      };
    }
    const extra = (transitionOptions && typeof transitionOptions === 'object') ? transitionOptions : null;
    return {
      playerX: playerX,
      playerY: playerY,
      playerDirection: playerDirection,
      transition: extra ? extra.transition : undefined,
      duration: extra ? extra.duration : undefined
    };
  }

  function resolveRoomTransitionEffect(transitionOverride, durationOverride) {
    let type = roomTransitionRuntime.type;
    if (transitionOverride !== undefined && transitionOverride !== null && String(transitionOverride).trim() !== '') {
      const normalized = normalizeRoomTransitionType(transitionOverride);
      if (!normalized) {
        GameAPI.error(`Transizione non valida: usa ${ROOM_TRANSITION_TYPE_HINT}`);
      } else {
        type = normalized;
      }
    }
    let duration = roomTransitionRuntime.duration;
    if (durationOverride !== undefined && durationOverride !== null && String(durationOverride).trim() !== '') {
      const normalizedDuration = normalizeRoomTransitionDuration(durationOverride);
      if (normalizedDuration == null) {
        GameAPI.error('Durata transizione non valida: serve un numero di millisecondi >= 0');
      } else {
        duration = normalizedDuration;
      }
    }
    return { type: type, duration: duration };
  }

  function ensureSizedCanvas(current, width, height) {
    if (current && current.width === width && current.height === height) return current;
    const next = document.createElement('canvas');
    next.width = width;
    next.height = height;
    return next;
  }

  function roomTransitionProgress() {
    const dur = roomTransitionRuntime.effectDuration;
    if (!(dur > 0)) return 1;
    const raw = (performance.now() - roomTransitionRuntime.startedAt) / dur;
    if (raw < 0) return 0;
    if (raw > 1) return 1;
    return raw;
  }

  function easeRoomTransition(t) {
    const x = t < 0 ? 0 : (t > 1 ? 1 : t);
    return x * x * (3 - 2 * x);
  }

  function captureWorldFrame() {
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    const snap = document.createElement('canvas');
    snap.width = w;
    snap.height = h;
    const sctx = snap.getContext('2d');
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, w, h);
    renderWorld(sctx);
    return snap;
  }

  function beginRoomTransitionHold() {
    roomTransitionSerial += 1;
    const token = roomTransitionSerial;
    const snap = captureWorldFrame();
    roomTransitionRuntime.snapshot = snap;
    roomTransitionRuntime.holdSnapshot = snap;
    roomTransitionRuntime.active = false;
    roomTransitionRuntime.onComplete = null;
    if (!roomTransitionRuntime.inputLockHeld) {
      acquireInputLock('room-transition');
      roomTransitionRuntime.inputLockHeld = true;
    }
    return token;
  }

  function startRoomTransitionAnimation(type, duration) {
    roomTransitionRuntime.holdSnapshot = null;
    roomTransitionRuntime.effectType = type;
    roomTransitionRuntime.effectDuration = duration;
    roomTransitionRuntime.startedAt = performance.now();
    roomTransitionRuntime.active = true;
    log(`[Runtime] Transizione stanza "${type}" (${duration} ms)`, 'info');
  }

  function completeRoomTransition(expectedToken) {
    if (expectedToken != null && expectedToken !== roomTransitionSerial) return;
    const cb = roomTransitionRuntime.onComplete;
    const held = roomTransitionRuntime.inputLockHeld;
    roomTransitionRuntime.active = false;
    roomTransitionRuntime.holdSnapshot = null;
    roomTransitionRuntime.snapshot = null;
    roomTransitionRuntime.onComplete = null;
    roomTransitionRuntime.inputLockHeld = false;
    if (held) releaseInputLock('room-transition');
    if (typeof cb === 'function') cb();
  }

  function cancelRoomTransitionVisual() {
    completeRoomTransition(roomTransitionSerial);
  }

  function waitRoomTransition(token) {
    if (!roomTransitionRuntime.active || token !== roomTransitionSerial) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      roomTransitionRuntime.onComplete = resolve;
    });
  }

  function armRoomTransitionCompletion(token) {
    const step = () => {
      if (token !== roomTransitionSerial) return;
      if (!roomTransitionRuntime.active) return;
      if (roomTransitionProgress() >= 1) {
        completeRoomTransition(token);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function tickRoomTransition() {
    if (!roomTransitionRuntime.active) return;
    if (roomTransitionProgress() >= 1) {
      completeRoomTransition(roomTransitionSerial);
    }
  }

  function ensureDissolveMask(progress) {
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    if (!dissolveNoise || dissolveNoiseW !== w || dissolveNoiseH !== h) {
      dissolveNoise = new Uint8Array(w * h);
      for (let i = 0; i < dissolveNoise.length; i++) {
        dissolveNoise[i] = (Math.random() * 256) | 0;
      }
      dissolveNoiseW = w;
      dissolveNoiseH = h;
      dissolveMaskCanvas = null;
    }
    dissolveMaskCanvas = ensureSizedCanvas(dissolveMaskCanvas, w, h);
    const mctx = dissolveMaskCanvas.getContext('2d');
    const img = mctx.createImageData(w, h);
    const data = img.data;
    const threshold = progress * 256;
    const noise = dissolveNoise;
    for (let i = 0, p = 0; i < noise.length; i++, p += 4) {
      data[p + 3] = noise[i] < threshold ? 255 : 0;
    }
    mctx.putImageData(img, 0, 0);
    return dissolveMaskCanvas;
  }

  function renderWorld(targetCtx) {
    if (!targetCtx) return;
    if (targetCtx === ctx) {
      renderWorldContents();
      return;
    }
    const previous = ctx;
    ctx = targetCtx;
    try {
      renderWorldContents();
    } finally {
      ctx = previous;
    }
  }

  function drawTransitionOverlay(targetCtx, progress) {
    const w = canvas.width;
    const h = canvas.height;
    if (!roomTransitionRuntime.snapshot || w <= 0 || h <= 0) return;
    transitionBuffer = ensureSizedCanvas(transitionBuffer, w, h);
    const bctx = transitionBuffer.getContext('2d');
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, w, h);

    const type = roomTransitionRuntime.effectType;
    if (type === 'fade') {
      bctx.globalAlpha = 1 - progress;
      bctx.drawImage(roomTransitionRuntime.snapshot, 0, 0);
    } else if (type === 'iris') {
      bctx.drawImage(roomTransitionRuntime.snapshot, 0, 0);
      bctx.globalCompositeOperation = 'destination-out';
      bctx.fillStyle = '#000';
      bctx.beginPath();
      const radius = (Math.hypot(w, h) / 2 + 2) * progress;
      bctx.arc(w / 2, h / 2, Math.max(0, radius), 0, Math.PI * 2);
      bctx.fill();
    } else if (type === 'dissolve') {
      bctx.drawImage(roomTransitionRuntime.snapshot, 0, 0);
      bctx.globalCompositeOperation = 'destination-out';
      bctx.drawImage(ensureDissolveMask(progress), 0, 0);
    } else {
      bctx.globalAlpha = 1 - progress;
      bctx.drawImage(roomTransitionRuntime.snapshot, 0, 0);
    }

    targetCtx.save();
    targetCtx.globalAlpha = 1;
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(transitionBuffer, 0, 0);
    targetCtx.restore();
  }

  function drawColorFadeTransition(color) {
    const tr = roomTransitionRuntime;
    const p = easeRoomTransition(roomTransitionProgress());
    const w = canvas.width;
    const h = canvas.height;
    // Prima metà: stanza vecchia → colore. Seconda metà: colore → stanza nuova.
    if (p < 0.5) {
      const cover = p / 0.5;
      if (tr.snapshot) ctx.drawImage(tr.snapshot, 0, 0);
      ctx.save();
      ctx.globalAlpha = cover;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    const uncover = (p - 0.5) / 0.5;
    renderWorld(ctx);
    ctx.save();
    ctx.globalAlpha = 1 - uncover;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawWorldWithRoomTransition() {
    const tr = roomTransitionRuntime;
    if (tr.holdSnapshot && !tr.active) {
      ctx.drawImage(tr.holdSnapshot, 0, 0);
      return;
    }
    if (tr.active && tr.effectType === 'fade_to_black') {
      drawColorFadeTransition('#000');
      return;
    }
    if (tr.active && tr.effectType === 'fade_to_white') {
      drawColorFadeTransition('#fff');
      return;
    }
    if (tr.active && tr.effectType === 'slide' && tr.snapshot) {
      const p = easeRoomTransition(roomTransitionProgress());
      const w = canvas.width;
      const h = canvas.height;
      worldBuffer = ensureSizedCanvas(worldBuffer, Math.max(1, w), Math.max(1, h));
      const bctx = worldBuffer.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      bctx.fillStyle = '#000';
      bctx.fillRect(0, 0, worldBuffer.width, worldBuffer.height);
      renderWorld(bctx);
      ctx.drawImage(tr.snapshot, Math.round(-p * w), 0);
      ctx.drawImage(worldBuffer, Math.round((1 - p) * w), 0);
      return;
    }
    renderWorld(ctx);
    if (tr.active && tr.snapshot) {
      drawTransitionOverlay(ctx, easeRoomTransition(roomTransitionProgress()));
    }
  }

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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawWorldWithRoomTransition();
    renderOverlayHud();
  }

  function renderWorldContents() {
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

      // Background-layer room animations
      if (room.animationInstances && Array.isArray(room.animationInstances)) {
        room.animationInstances
          .filter(inst => (inst.layer || 'background') !== 'foreground')
          .forEach(inst => drawRoomAnimationInstanceOnCanvas(ctx, inst));
      }

      // Oggetti di scena (supporto scale/rotazione)
      if (room.objects && Array.isArray(room.objects)) {
        room.objects.forEach(obj => drawSceneObject(ctx, obj));
      }

      // Foreground-layer room animations
      if (room.animationInstances && Array.isArray(room.animationInstances)) {
        room.animationInstances
          .filter(inst => (inst.layer || 'background') === 'foreground')
          .forEach(inst => drawRoomAnimationInstanceOnCanvas(ctx, inst));
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

        const drawOpacity = getCharacterDrawOpacity(character);
        if (drawOpacity <= 0) {
          return;
        }

        // Get character definition to check for pivot
        const charDef = gameState.characterDefinitions.get(character.name);
        
        // Calcola lo scaling basato sulla posizione Y di rendering (per movimento fluido)
        // Usa renderY invece di y per uno scaling più fluido durante il movimento
        const scale = calculateCharacterScale(character.renderY, room);
        
        const playingAnimName = character.playingAnimation ? character.playingAnimation.name : null;
        const frame = getCharacterFrame(character.name, character.direction, character.currentFrame, playingAnimName);

        ctx.save();
        ctx.globalAlpha = drawOpacity;
        
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

        ctx.restore();
      });
    }
  }

  function renderOverlayHud() {
    renderDialogueBalloon(ctx);
    renderDialogueChoices(ctx);

    // Renderizza GUI - verifica che le immagini siano caricate e pronte
    gameState.guis.forEach(gui => {
      if (gui.type === 'DialogBox') {
        return;
      }
      if (gui.visible === false) {
        return;
      }
      // Background GUI
      if (gui.background && gui.background.complete && gui.background.naturalWidth > 0) {
        try {
          ctx.drawImage(gui.background, 0, 0, canvas.width, canvas.height);
        } catch (error) {
          log(`[Runtime] Error rendering GUI background ${gui.id}: ${error.message}`, 'warning');
        }
      }

      // Pulsanti / save slots
      if (gui.buttons && Array.isArray(gui.buttons)) {
        gui.buttons.forEach(btn => {
          if (!btn.enabled) return;
          if (gui.type === 'SaveLoad' && btn.role === 'saveSlot') {
            renderSaveLoadSlot(ctx, gui, btn);
            return;
          }
          if (btn.backgroundImage && btn.backgroundImage.complete && btn.backgroundImage.naturalWidth > 0) {
            try {
              ctx.drawImage(btn.backgroundImage, btn.x, btn.y, btn.w, btn.h);
            } catch (error) {
              log(`[Runtime] Error rendering pulsante ${btn.id}: ${error.message}`, 'warning');
            }
          } else {
            ctx.fillStyle = 'rgba(57, 255, 20, 0.3)';
            ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
            ctx.strokeStyle = '#39ff14';
            ctx.lineWidth = 2;
            ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
          }

          if (btn.text) {
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2);
          }
        });
      }
    });

    renderInventory(ctx);
    renderCursorActionHint(ctx);
  }

  // ============================================
  // GAME LOOP
  // ============================================
  function update(deltaTime) {
    tickRoomTransition();
    updateDialogueAppear(deltaTime);

    if (gameState.currentRoom && Array.isArray(gameState.currentRoom.animationInstances)) {
      gameState.currentRoom.animationInstances.forEach(inst => {
        const animDef = gameState.roomAnimationDefinitions.get(inst.animationId);
        if (animDef) updateRoomAnimationInstance(inst, animDef, deltaTime);
      });
    }

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

      if (character.playingAnimation) {
        updateCharacterCustomAnimation(character, charDef, deltaTime);
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
        const charDefForSpeed = gameState.characterDefinitions.get(character.name);
        if (charDefForSpeed && charDefForSpeed.spawnSettings && charDefForSpeed.spawnSettings.moveSpeed !== undefined) {
          const speedValue = Number(charDefForSpeed.spawnSettings.moveSpeed);
          character.moveSpeed = (!isNaN(speedValue) && speedValue > 0) ? speedValue : 100;
        } else {
          character.moveSpeed = 100; // pixel per secondo (default)
        }
      }
      if (character.scaleMoveSpeedWithDepth === undefined) {
        character.scaleMoveSpeedWithDepth = resolveScaleMoveSpeedWithDepth(
          gameState.characterDefinitions.get(character.name)
        );
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
          // Velocità effettiva: base (px/s) × fattore profondità (rallenta verso background)
          const roomForSpeed = gameState.currentRoom;
          const effectiveSpeed = getEffectiveMoveSpeed(character, roomForSpeed);
          const speedPerFrame = (effectiveSpeed * deltaTime) / 1000;
          
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

      // Aggiorna frame time (FPS costanti: solo la velocità di spostamento scala con la profondità)
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

    const deltaTime = Math.min(Math.max(0, currentTime - gameState.lastFrameTime), 100);
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
    cancelRoomTransitionVisual();
    endAllDialogue();
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
  let inventoryCancelKeyHandler = null;
  let inventoryCancelContextHandler = null;
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
      unlockAudioSyncFromUserGesture();
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

      // ⚠️ PROTEZIONE 4: Verifica che il runtime sia attivo e boot completato
      if (!isGamePlayable()) {
        log('[Runtime] Click handler: Boot non completato o runtime non attivo, ignoro click', 'info');
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
      if (!isGamePlayable()) return;
      const coords = canvasCoordsFromClientEvent(e);
      if (gameState.inventory && gameState.inventory.enabled) {
        updateInventoryCarriedPointer(coords.x, coords.y);
        updateInventoryVisibilityFromPointer(coords.x, coords.y, coords.inCanvas);
      } else if (gameState.inventory) {
        gameState.inventory.pointerX = coords.x;
        gameState.inventory.pointerY = coords.y;
      }
      updateGameCursorAt(coords.x, coords.y);
    };
    inventoryLeaveHandler = function() {
      const inv = gameState.inventory;
      if (inv && inv.enabled && inv.displayMode === 'popup') {
        inv.visible = false;
        inv.popupPanelEngaged = false;
      }
      if (canvas) {
        applyCategoryCursorStyle('default') || (canvas.style.cursor = 'default');
      }
      setCursorHoverState(0, 0, 'default', '', false);
    };
    canvas.addEventListener('mousemove', inventoryPointerHandler, { passive: true });
    canvas.addEventListener('mouseleave', inventoryLeaveHandler, { passive: true });

    if (inventoryCancelKeyHandler) {
      window.removeEventListener('keydown', inventoryCancelKeyHandler);
    }
    inventoryCancelKeyHandler = function(e) {
      if (!isGamePlayable() || !gameState.inventory || !gameState.inventory.carriedItem) return;
      if (e.key === 'Escape') {
        clearCarriedInventoryItem();
        log('[Runtime] Inventario: oggetto rilasciato (Esc)', 'info');
      }
    };
    window.addEventListener('keydown', inventoryCancelKeyHandler);

    if (inventoryCancelContextHandler) {
      canvas.removeEventListener('contextmenu', inventoryCancelContextHandler);
    }
    inventoryCancelContextHandler = function(e) {
      if (!isGamePlayable() || !gameState.inventory || !gameState.inventory.carriedItem) return;
      e.preventDefault();
      clearCarriedInventoryItem();
      log('[Runtime] Inventario: oggetto rilasciato (click destro)', 'info');
    };
    canvas.addEventListener('contextmenu', inventoryCancelContextHandler);

    canvas.style.cursor = 'pointer';
    applyCategoryCursorStyle('default');
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
    if (inventoryCancelKeyHandler) {
      window.removeEventListener('keydown', inventoryCancelKeyHandler);
      inventoryCancelKeyHandler = null;
    }
    if (canvas && inventoryCancelContextHandler) {
      canvas.removeEventListener('contextmenu', inventoryCancelContextHandler);
      inventoryCancelContextHandler = null;
    }
    const inv = gameState.inventory;
    if (inv) {
      inv.carriedItem = null;
      inv.suppressPanelUntilDrop = false;
      inv.popupPanelEngaged = false;
      updateInventoryCursorStyle();
    }
  }
  
  // Funzione dispatch centralizzata
  async function handleCanvasClick(x, y) {
    // Questa funzione è il punto di ingresso UNICO per tutti i click nel runtime
    // Garantisce che ogni click venga processato UNA SOLA VOLTA
    await handleClick(x, y);
  }

  async function handleClick(x, y) {
    // Sblocca audio NEL gesto del click, prima di qualsiasi await (load_room → on_room_change → play_music)
    unlockAudioContextFromGesture();
    await unlockHtmlAudioFromGestureAsync();

    if (!isGamePlayable()) {
      log('[Runtime] handleClick: Boot non completato, click ignorato', 'info');
      return;
    }

    if (activeDialogueSession && activeDialogueSession.choiceState) {
      tryHandleDialogueChoiceClick(x, y);
      return;
    }

    if (activeDialogue) {
      log('[Runtime] handleClick: Dialogo chiuso (click)', 'info');
      dismissActiveDialogue();
      return;
    }

    if (isInputLocked()) {
      log(`[Runtime] handleClick: Click ignorato (input bloccato durante comando await)`, 'info');
      return;
    }

    if (!gameState.currentRoom) {
      log(`[Runtime] handleClick: Nessuna room corrente`, 'warning');
      return;
    }

    log(`[Runtime] handleClick: Click rilevato alle coordinate canvas (${Math.round(x)}, ${Math.round(y)})`, 'info');

    if (handleInventoryToggleClick(x, y)) {
      return;
    }

    if (await handleInventorySlotClick(x, y)) {
      return;
    }

    // SaveLoad menu is modal while visible: handle before room interactions
    if (await handleVisibleSaveLoadGuiClick(x, y)) {
      return;
    }

    const carriedItemKey = gameState.inventory && gameState.inventory.carriedItem
      ? gameState.inventory.carriedItem.key
      : null;

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
        if (carriedItemKey) {
          await dispatchInventoryUseWith(carriedItemKey, 'hotspot', clickedHotspot.id, x, y);
        } else {
          log(`[Runtime] [DEBUG] handleClick: Esecuzione script per hotspot ${clickedHotspot.id}`, 'info');
          await executeHotspotScript(clickedHotspot.id, clickedHotspot, x, y);
        }
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
          if (carriedItemKey) {
            await dispatchInventoryUseWith(carriedItemKey, 'object', obj.id, x, y);
          } else {
            await executeObjectClickScripts(obj.id, x, y);
          }
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
      if (getCharacterDrawOpacity(character) <= 0) {
        continue;
      }

      const playingAnimName = character.playingAnimation ? character.playingAnimation.name : null;
      const frame = getCharacterFrame(character.name, character.direction, character.currentFrame, playingAnimName);
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
        if (carriedItemKey) {
          await dispatchInventoryUseWith(carriedItemKey, 'character', clickedCharacter.id, x, y);
        } else {
          await executeCharacterClickScripts(clickedCharacter.id, x, y);
        }
        return;
      }
    }

    // Controlla click su pulsanti GUI (disabilitato mentre un oggetto è in mano)
    if (!carriedItemKey) {
    for (const gui of gameState.guis.values()) {
      if (gui.visible === false) continue;
      if (gui.type === 'SaveLoad') continue; // gestito da handleVisibleSaveLoadGuiClick
      if (gui.buttons && Array.isArray(gui.buttons)) {
        for (const btn of gui.buttons) {
          if (!btn.enabled) continue;

          if (x >= btn.x && x <= btn.x + btn.w &&
              y >= btn.y && y <= btn.y + btn.h) {
            log(`Click su pulsante GUI: ${btn.name}`, 'info');
            const guiScripts = gameState.attachments.guiScripts || {};
            if (typeof guiScripts === 'object' && guiScripts[btn.id]) {
              const scriptName = guiScripts[btn.id];
              if (gameState.scripts[scriptName]) {
                await executeScriptHandler(gameState.scripts[scriptName], 'on_gui_click', [btn.id, x, y], scriptName);
              }
            }

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

    // Oggetto in mano: click su punto vuoto (nessun target sopra) → rilascia
    const inv = gameState.inventory;
    if (inv && inv.carriedItem) {
      updateInventoryCarriedPointer(x, y);
      clearCarriedInventoryItem();
      log('[Runtime] Inventario: oggetto rilasciato (click su punto vuoto)', 'info');
      return;
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
        if (player.scaleMoveSpeedWithDepth === undefined) {
          player.scaleMoveSpeedWithDepth = resolveScaleMoveSpeedWithDepth(
            gameState.characterDefinitions.get(player.name)
          );
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
    const targets = [];
    if (isInIframe) {
      targets.push(window.parent);
    }
    if (window.opener && window.opener !== window.parent) {
      targets.push(window.opener);
    }
    targets.forEach(target => {
      try {
        target.postMessage(message, '*');
      } catch (e) {
        if (window.addRuntimeLog) {
          window.addRuntimeLog(`Cannot send message to editor: ${e.message}`, 'warning');
        }
      }
    });
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
  function handleEditorMessage(message) {
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
              if (message.context) {
                applyRuntimeContext(message.context);
              }
              const roomId = message.context && message.context.roomId
                ? message.context.roomId
                : gameState.currentRoomId;
              await ensureCurrentRoomForScripts(roomId);
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
        if (message.context) {
          applyRuntimeContext(message.context);
        }
        break;

      case 'SANDBOX_PING':
        if (isInIframe) {
          sendRuntimeReady();
        }
        break;

      case 'RESET':
        // Reset completo dello stato
        endAllDialogue();
        gameState.dialogues = new Map();
        gameState.dialogueNameIndex = new Map();
        gameState.dialogueConsumed = new Set();
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
        resetInputLock();
        
        // ⚠️ RESET CACHE SCRIPT: Pulisci la cache degli script compilati durante il reset
        gameState.compiledScripts.clear();
        gameState.compiledScriptHashes.clear();
        invalidateResourceFileIndex();
        stopAllAudioPlayback();
        
        // Reset AssetRegistry
        AssetRegistry.images.clear();
        AssetRegistry.fonts.clear();
        dialogFontLoadPromises.clear();
        AssetRegistry.isLoading = false;
        AssetRegistry.loadComplete = false;
        
        stopGameLoop();
        sendRuntimeReady();
        break;

      default:
        // Ignora messaggi sconosciuti
        break;
    }
  }

  window.addEventListener('message', function(event) {
    handleEditorMessage(event.data);
  });

  // Messaggi dall'editor via Electron IPC (finestra Play Test gestita dal main process)
  if (window.amiantoNativeFs && typeof window.amiantoNativeFs.onRuntimeMessage === 'function') {
    window.amiantoNativeFs.onRuntimeMessage((message) => handleEditorMessage(message));
  }

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
        if (!runtimeReadySent) {
          log('[Runtime] Sending RUNTIME_READY to editor', 'info');
          sendRuntimeReady();
          runtimeReadySent = true;
        }
        setTimeout(() => sendRuntimeReady(), 100);
        setTimeout(() => sendRuntimeReady(), 400);
        setTimeout(() => sendRuntimeReady(), 1000);
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

