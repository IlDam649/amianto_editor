(function(){
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const logEl = document.getElementById('runtime-log');
  const projectNameEl = document.getElementById('runtime-project-name');

  let gameData = null; // parsed JSON
  let currentRoomIndex = 0;
  let loadedImagesCache = new Map(); // dataURL/src -> HTMLImageElement
  
  // ============================================
  // SISTEMA DI ESECUZIONE SCRIPT NEL RUNTIME
  // ============================================
  let runtimeScriptPlugins = new Map(); // name -> plugin instance
  let runtimeGameState = {
    currentRoomId: null,
    variables: new Map()
  };

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent += `[${t}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ============================================
  // SISTEMA DI COMUNICAZIONE EDITOR ↔ RUNTIME
  // ============================================
  // Funzione helper per serializzare valori in modo leggibile
  function serializeValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return '[object Object]';
      }
    }
    return String(value);
  }

  // Funzione print() globale per gli script del gioco nel runtime
  // NON scrive nel DOM, invia messaggi all'editor tramite postMessage
  window.print = function() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:49',message:'window.print() ENTRY',data:{argsCount:arguments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const args = Array.from(arguments);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:53',message:'window.print() args extracted',data:{argsLength:args.length,firstArg:args[0]?String(args[0]).substring(0,50):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (args.length === 0) {
        sendScriptLogToEditor('', 'info');
        return;
      }
      
      // Serializza ogni argomento e uniscili con spazi
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:63',message:'window.print() BEFORE sendScriptLogToEditor',data:{serializedMsg:msg.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Invia all'editor tramite postMessage (non manipola direttamente il DOM)
      sendScriptLogToEditor(msg, 'info');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:67',message:'window.print() AFTER sendScriptLogToEditor',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:70',message:'window.print() EXCEPTION',data:{error:e.message||String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Fallback in caso di errore
      sendScriptLogToEditor(`[Print Error] ${e && e.message ? e.message : String(e)}`, 'error');
    }
  };

  // Funzione error() globale per log di errori
  window.error = function() {
    try {
      const args = Array.from(arguments);
      if (args.length === 0) {
        sendScriptLogToEditor('', 'error');
        return;
      }
      
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      
      sendScriptLogToEditor(msg, 'error');
    } catch (e) {
      sendScriptLogToEditor(`[Error Log Error] ${e && e.message ? e.message : String(e)}`, 'error');
    }
  };

  // Funzione helper per inviare messaggi all'editor
  // Usa window.opener se il runtime è stato aperto dall'editor
  function sendScriptLogToEditor(message, level = 'info') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:80',message:'sendScriptLogToEditor() ENTRY',data:{message:message.substring(0,50),level,hasOpener:!!window.opener,openerClosed:window.opener?window.opener.closed:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      // Verifica se window.opener esiste (runtime aperto dall'editor)
      if (window.opener && !window.opener.closed) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:85',message:'sendScriptLogToEditor() BEFORE postMessage',data:{message:message.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Invia messaggio all'editor
        // TODO: Per sicurezza, verificare event.origin === location.origin
        // Attualmente usiamo "*" per sviluppo, in produzione verificare l'origin
        window.opener.postMessage({
          type: 'script-log',
          level: level,
          message: message
        }, '*'); // ⚠️ In produzione: sostituire "*" con location.origin dell'editor
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:94',message:'sendScriptLogToEditor() AFTER postMessage',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:97',message:'sendScriptLogToEditor() NO OPENER - fallback',data:{hasOpener:!!window.opener},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Fallback: se non c'è opener, log locale (per runtime standalone)
        log(`[Script ${level.toUpperCase()}] ${message}`);
      }
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:101',message:'sendScriptLogToEditor() EXCEPTION',data:{error:e.message||String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Fallback in caso di errore nella comunicazione
      log(`[Script Log Error] ${e && e.message ? e.message : String(e)}`);
    }
  }

  // ============================================
  // API ESPOSTE AGLI SCRIPT NEL RUNTIME
  // ============================================
  // API esposte agli script nel runtime (simile a sandboxApi nell'editor)
  const runtimeSandboxApi = {
    print: function() {
      const args = Array.from(arguments);
      if (args.length === 0) {
        sendScriptLogToEditor('', 'info');
        return;
      }
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      sendScriptLogToEditor(msg, 'info');
    },
    
    error: function() {
      const args = Array.from(arguments);
      if (args.length === 0) {
        sendScriptLogToEditor('', 'error');
        return;
      }
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      sendScriptLogToEditor(msg, 'error');
    },
    
    show_message: function(text) {
      log(`[Message] ${text}`);
    },
    
    // Game state APIs
    get_var: function(key) {
      return runtimeGameState.variables.get(key) || null;
    },
    
    set_var: function(key, value) {
      runtimeGameState.variables.set(key, value);
    },
    
    has_var: function(key) {
      return runtimeGameState.variables.has(key);
    },
    
    toggle_var: function(key) {
      const current = runtimeGameState.variables.get(key);
      const newValue = !current;
      runtimeGameState.variables.set(key, newValue);
      return newValue;
    },
    
    // Room APIs
    get_current_room: function() {
      return runtimeGameState.currentRoomId;
    },
    
    load_room: function(roomIdOrName) {
      // Implementa cambio stanza
      log(`[Script] load_room(${roomIdOrName}) called`);
      // TODO: implementare cambio stanza nel runtime
      // Per ora solo log
    },
    
    // Inventory APIs (placeholder - implementare se necessario)
    add_to_inventory: function(itemId, quantity) {
      log(`[Script] add_to_inventory(${itemId}, ${quantity}) called`);
    },
    
    remove_from_inventory: function(itemId, quantity) {
      log(`[Script] remove_from_inventory(${itemId}, ${quantity}) called`);
    },
    
    has_item: function(itemId) {
      return false; // Placeholder
    },
    
    get_item_count: function(itemId) {
      return 0; // Placeholder
    },
    
    clear_inventory: function() {
      log(`[Script] clear_inventory() called`);
    }
  };

  // Funzione per eseguire uno script nel runtime
  function executeRuntimeScript(scriptName, scriptContent, handlerName, argsArray) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:240',message:'executeRuntimeScript() ENTRY',data:{scriptName,hasContent:!!scriptContent,contentLength:scriptContent?.length,handlerName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (!scriptContent || !scriptContent.trim()) return;
    if (typeof jailed === 'undefined' || typeof jailed.DynamicPlugin === 'undefined') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:243',message:'executeRuntimeScript() JAILED NOT AVAILABLE',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      log(`[Script] Jailed not available, cannot execute script: ${scriptName}`);
      return;
    }
    
    const callArgs = Array.isArray(argsArray) ? argsArray : [];
    
    const wrapped = `
      function executeWhenReady() {
        // #region agent log
        var remoteExists = typeof application !== 'undefined' && application.remote;
        var printExists = remoteExists && typeof application.remote.print === 'function';
        fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime wrapper',message:'executeWhenReady: application.remote check',data:{remoteExists,printExists},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        if (typeof application === 'undefined' || !application.remote) {
          setTimeout(executeWhenReady, 10);
          return;
        }
        
        // Esponi tutte le API
        var print = application.remote.print;
        var error = application.remote.error;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime wrapper',message:'executeWhenReady: print assigned',data:{printType:typeof print},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        var show_message = application.remote.show_message;
        var get_var = application.remote.get_var;
        var set_var = application.remote.set_var;
        var has_var = application.remote.has_var;
        var toggle_var = application.remote.toggle_var;
        var get_current_room = application.remote.get_current_room;
        var load_room = application.remote.load_room;
        var add_to_inventory = application.remote.add_to_inventory;
        var remove_from_inventory = application.remote.remove_from_inventory;
        var has_item = application.remote.has_item;
        var get_item_count = application.remote.get_item_count;
        var clear_inventory = application.remote.clear_inventory;
        
        var Game = {
          getVar: application.remote.get_var,
          setVar: application.remote.set_var,
          hasVar: application.remote.has_var,
          toggleVar: application.remote.toggle_var
        };
        
        // Esegui lo script
        try {
          ${scriptContent}
        } catch(e) {
          application.remote.error('Script error: ' + (e && e.message ? e.message : e));
        }
        
        application.setInterface({});
        
        // Invoca l'handler se definito
        if (typeof ${handlerName} === 'function') {
          try {
            ${handlerName}.apply(null, ${JSON.stringify(callArgs)});
          } catch(e) {
            application.remote.error('Handler error: ' + (e && e.message ? e.message : e));
          }
        }
      }
      
      executeWhenReady();
    `;
    
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:305',message:'executeRuntimeScript() BEFORE new DynamicPlugin',data:{scriptName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      const plugin = new jailed.DynamicPlugin(wrapped, runtimeSandboxApi);
      runtimeScriptPlugins.set(scriptName, plugin);
      
      if (typeof plugin.whenConnected === 'function') {
        plugin.whenConnected(function() {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:312',message:'executeRuntimeScript() PLUGIN CONNECTED',data:{scriptName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          log(`[Script] ${scriptName} executed`);
        });
      }
      
      if (typeof plugin.onError === 'function') {
        plugin.onError(function(err) {
          log(`[Script Error] ${scriptName}: ${err && err.message ? err.message : err}`);
          sendScriptLogToEditor(`Script error in ${scriptName}: ${err && err.message ? err.message : err}`, 'error');
        });
      }
      
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cdc443e6-2350-4939-b056-f00f7870d822',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'runtime.js:325',message:'executeRuntimeScript() EXCEPTION',data:{error:e.message||String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      log(`[Script] Failed to execute ${scriptName}: ${e && e.message ? e.message : e}`);
    }
  }

  // Carica e inizializza gli script dal gameData
  function initializeRuntimeScripts() {
    // Pulisci plugin esistenti prima di ricaricare
    runtimeScriptPlugins.forEach((plugin, name) => {
      try {
        if (plugin && typeof plugin.disconnect === 'function') {
          plugin.disconnect();
        }
      } catch (_) {}
    });
    runtimeScriptPlugins.clear();
    
    if (!gameData || !gameData.scripts) {
      log('[Script] No scripts found in gameData');
      return;
    }
    
    const scripts = gameData.scripts;
    log(`[Script] Loading ${Object.keys(scripts).length} script(s)`);
    
    // Reset e carica variabili iniziali
    runtimeGameState.variables.clear();
    if (gameData.variables && Array.isArray(gameData.variables)) {
      gameData.variables.forEach(v => {
        if (v && v.name) {
          runtimeGameState.variables.set(v.name, v.initialValue || null);
        }
      });
      log(`[Script] Loaded ${runtimeGameState.variables.size} variable(s)`);
    }
    
    // Esegui script globali con on_game_start
    Object.keys(scripts).forEach(scriptName => {
      if (scriptName.startsWith('Global:') || scriptName === 'startup') {
        const content = scripts[scriptName];
        if (content && content.trim()) {
          // Cerca se contiene on_game_start
          if (content.includes('on_game_start') || content.includes('function on_game_start')) {
            log(`[Script] Executing global script: ${scriptName}`);
            executeRuntimeScript(scriptName, content, 'on_game_start', []);
          }
        }
      }
    });
  }

  function setCanvasSize(w, h) {
    canvas.width = w;
    canvas.height = h;
  }

  function setProjectName(name) {
    projectNameEl.textContent = name ? ` — ${name}` : '';
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      if (loadedImagesCache.has(src)) return resolve(loadedImagesCache.get(src));
      const img = new Image();
      img.onload = () => { loadedImagesCache.set(src, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function loadRoomAssets(room) {
    const out = { background: null, foregrounds: [], objects: [] };
    out.background = await loadImage(room.background);
    if (Array.isArray(room.foregrounds)) {
      for (const f of room.foregrounds) {
        const img = await loadImage(f.image);
        out.foregrounds.push({ img, offsetX: Number(f.offsetX)||0, offsetY: Number(f.offsetY)||0 });
      }
    }
    if (Array.isArray(room.sceneObjects)) {
      for (const o of room.sceneObjects) {
        const img = await loadImage(o.image);
        out.objects.push({ id: o.id, name: o.name, type: o.type||'Interactive', x: Number(o.x)||0, y: Number(o.y)||0, img });
      }
    }
    return out;
  }

  async function renderRoom(index) {
    if (!gameData || !Array.isArray(gameData.rooms) || index < 0 || index >= gameData.rooms.length) return;
    const room = gameData.rooms[index];
    const assets = await loadRoomAssets(room);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (assets.background) ctx.drawImage(assets.background, 0, 0);
    for (const o of assets.objects) {
      if (o.img) ctx.drawImage(o.img, o.x, o.y);
    }
    for (const f of assets.foregrounds) {
      if (f.img) ctx.drawImage(f.img, f.offsetX||0, f.offsetY||0);
    }

    // Draw starting position marker if this is the start room
    try {
      const s = gameData && gameData.settings ? gameData.settings : null;
      if (s && s.startRoomId) {
        const targetRoomIndex = (gameData.rooms || []).findIndex(r => r && (r.id === s.startRoomId || r.name === s.startRoomId));
        if (targetRoomIndex === index) {
          const px = Number(s.startX) || 0;
          const py = Number(s.startY) || 0;
          ctx.save();
          ctx.fillStyle = 'rgba(255, 64, 64, 0.9)';
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }
    } catch(_) {}
  }

  async function startRuntimeFromData(json) {
    try {
      gameData = (typeof json === 'string') ? JSON.parse(json) : json;
    } catch (e) {
      log('Invalid JSON: ' + e);
      return;
    }

    const w = (gameData && gameData.settings && gameData.settings.canvasWidth) || 800;
    const h = (gameData && gameData.settings && gameData.settings.canvasHeight) || 600;
    setCanvasSize(w, h);
    setProjectName(gameData && gameData.settings && gameData.settings.name);
    log('Runtime initialized');

    // Pick start room if specified in settings
    try {
      const s = gameData && gameData.settings ? gameData.settings : null;
      if (s && s.startRoomId && Array.isArray(gameData.rooms)) {
        const idx = gameData.rooms.findIndex(r => r && (r.id === s.startRoomId || r.name === s.startRoomId));
        if (idx >= 0) {
          currentRoomIndex = idx;
          runtimeGameState.currentRoomId = gameData.rooms[idx].id;
        } else {
          currentRoomIndex = 0;
          runtimeGameState.currentRoomId = gameData.rooms[0]?.id || null;
        }
      } else {
        currentRoomIndex = 0;
        runtimeGameState.currentRoomId = gameData.rooms[0]?.id || null;
      }
    } catch(_) {
      currentRoomIndex = 0;
      runtimeGameState.currentRoomId = gameData.rooms[0]?.id || null;
    }
    
    await renderRoom(currentRoomIndex);
    log('First room rendered');
    
    // Inizializza ed esegui gli script
    initializeRuntimeScripts();
  }

  // Public API: loadGame(data)
  window.loadGame = async function(data){
    await startRuntimeFromData(data);
  };

  async function pickJsonFileAndStart() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
        const file = await handle.getFile();
        const text = await file.text();
        await startRuntimeFromData(text);
        return;
      }
    } catch (e) {
      log('File open cancelled or failed: ' + e);
    }
    // Fallback input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const text = await f.text();
      await startRuntimeFromData(text);
    };
    input.click();
  }

  async function tryLoadFromOPFS() {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return null;
      const opfsPath = localStorage.getItem('amiantoLastProjectOPFSPath');
      if (!opfsPath) return null;
      const segments = opfsPath.split('/').filter(Boolean);
      let dir = await navigator.storage.getDirectory();
      for (let i = 0; i < segments.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }
      const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return text;
    } catch (_) {
      return null;
    }
  }

  async function loadLastSaved() {
    // Try OPFS first, then localStorage
    const opfsText = await tryLoadFromOPFS();
    if (opfsText) {
      await startRuntimeFromData(opfsText);
      return;
    }
    const ls = localStorage.getItem('amiantoLastSavedProjectJson');
    if (!ls) {
      log('No last saved project found');
      return;
    }
    await startRuntimeFromData(ls);
  }

  // Wire UI
  document.getElementById('btn-load-json').addEventListener('click', pickJsonFileAndStart);
  document.getElementById('btn-load-last').addEventListener('click', loadLastSaved);
  document.getElementById('btn-exit').addEventListener('click', () => window.close());
  document.getElementById('btn-restart').addEventListener('click', () => { if (gameData) startRuntimeFromData(gameData); });
  document.getElementById('btn-download-json').addEventListener('click', async () => {
    try {
      let text = null;
      if (gameData) {
        text = (typeof gameData === 'string') ? gameData : JSON.stringify(gameData, null, 2);
      } else {
        const res = await fetch('game.json', { cache: 'no-store' });
        if (res.ok) text = await res.text();
      }
      if (!text) { log('No project data to download'); return; }
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = (gameData && gameData.settings && gameData.settings.name) ? gameData.settings.name : 'game';
      a.download = `${name}.amianto.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    } catch (e) {
      log('Download failed: ' + e);
    }
  });

  // Try to fetch game.json from root (server/static) with graceful error
  (async function autoStart(){
    try {
      const res = await fetch('game.json', { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        await startRuntimeFromData(text);
        return;
      }
    } catch (e) {
      log('Could not fetch game.json: ' + e);
    }
    // Fallback: last saved from editor (localStorage/OPFS)
    await loadLastSaved();
  })();
})();


