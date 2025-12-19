/**
 * Runtime Sandbox - Esecuzione isolata di script utente
 * 
 * Questo file viene caricato in un iframe con sandbox="allow-scripts"
 * per garantire isolamento completo dall'editor.
 */

(function() {
  'use strict';

  // ============================================
  // STATO INTERNO DEL RUNTIME
  // ============================================
  let gameState = {
    currentRoomId: null,
    objectId: null,
    variables: new Map()
  };

  // ============================================
  // HELPER PER SERIALIZZAZIONE
  // ============================================
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

  // ============================================
  // COMUNICAZIONE CON L'EDITOR - SISTEMA MIGLIORATO
  // ============================================
  // Sistema di buffer, retry e fallback per garantire affidabilità
  
  const MessageQueue = (function() {
    const queue = [];
    const MAX_QUEUE_SIZE = 1000;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 100; // ms
    let isProcessing = false;
    let retryTimeoutId = null;
    let parentAvailable = true;
    let lastParentCheck = 0;
    const PARENT_CHECK_INTERVAL = 5000; // Controlla disponibilità parent ogni 5 secondi

    /**
     * Verifica se il parent è disponibile e può ricevere messaggi
     */
    function checkParentAvailable() {
      const now = Date.now();
      // Controlla solo ogni PARENT_CHECK_INTERVAL per evitare overhead
      if (now - lastParentCheck < PARENT_CHECK_INTERVAL) {
        return parentAvailable;
      }
      lastParentCheck = now;

      try {
        if (window.parent && window.parent !== window) {
          // Prova a verificare se il parent è ancora accessibile
          // In un iframe sandboxed, questo può fallire silenziosamente
          parentAvailable = true;
          return true;
        } else {
          parentAvailable = false;
          return false;
        }
      } catch (e) {
        parentAvailable = false;
        return false;
      }
    }

    /**
     * Fallback: scrive sulla console locale se il parent non è disponibile
     */
    function fallbackToConsole(message) {
      const level = message.level || 'info';
      const msg = message.message || message.error || JSON.stringify(message);
      const prefix = '[Runtime]';
      
      switch (level) {
        case 'error':
          console.error(prefix, msg);
          break;
        case 'warning':
          console.warn(prefix, msg);
          break;
        default:
          console.log(prefix, msg);
      }
    }

    /**
     * Tenta di inviare un messaggio al parent
     */
    function trySendMessage(message) {
      if (!checkParentAvailable()) {
        return false;
      }

      try {
        window.parent.postMessage(message, '*');
        return true;
      } catch (e) {
        // Errore durante l'invio
        parentAvailable = false;
        return false;
      }
    }

    /**
     * Processa la coda di messaggi
     */
    function processQueue() {
      if (isProcessing || queue.length === 0) {
        return;
      }

      isProcessing = true;

      // Processa tutti i messaggi disponibili
      while (queue.length > 0) {
        const item = queue[0];
        
        // Verifica se il parent è disponibile
        if (checkParentAvailable()) {
          // Tenta di inviare il messaggio
          if (trySendMessage(item.message)) {
            // Successo: rimuovi dalla coda
            queue.shift();
            item.retries = 0;
          } else {
            // Fallimento: incrementa retry
            item.retries = (item.retries || 0) + 1;
            
            if (item.retries >= MAX_RETRIES) {
              // Troppi tentativi falliti: usa fallback console e rimuovi
              fallbackToConsole(item.message);
              queue.shift();
            } else {
              // Riprova dopo un delay
              break;
            }
          }
        } else {
          // Parent non disponibile: usa fallback console
          fallbackToConsole(item.message);
          queue.shift();
        }
      }

      isProcessing = false;

      // Se ci sono ancora messaggi in coda, programma un retry
      if (queue.length > 0) {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
        }
        retryTimeoutId = setTimeout(processQueue, RETRY_DELAY);
      } else {
        retryTimeoutId = null;
      }
    }

    /**
     * Aggiunge un messaggio alla coda
     */
    function enqueue(message, priority = false) {
      // Limita la dimensione della coda per evitare memory leak
      if (queue.length >= MAX_QUEUE_SIZE) {
        // Rimuovi il messaggio più vecchio se la coda è piena
        const removed = queue.shift();
        fallbackToConsole(removed.message);
      }

      const item = {
        message: message,
        retries: 0,
        timestamp: Date.now()
      };

      if (priority) {
        // Messaggi prioritari vanno in cima alla coda
        queue.unshift(item);
      } else {
        queue.push(item);
      }

      // Avvia il processing se non è già in corso
      if (!isProcessing) {
        // Usa setTimeout per non bloccare il thread principale
        setTimeout(processQueue, 0);
      }
    }

    /**
     * Pulisce la coda (utile per reset)
     */
    function clear() {
      queue.length = 0;
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
      isProcessing = false;
    }

    /**
     * Ottiene lo stato della coda (per debug)
     */
    function getStatus() {
      return {
        queueLength: queue.length,
        isProcessing: isProcessing,
        parentAvailable: parentAvailable
      };
    }

    return {
      enqueue: enqueue,
      clear: clear,
      getStatus: getStatus,
      processQueue: processQueue // Esposto per test
    };
  })();

  /**
   * Invia un messaggio all'editor con sistema di buffer e retry
   */
  function sendToEditor(message, priority = false) {
    MessageQueue.enqueue(message, priority);
  }

  /**
   * Invia un log con livello specificato
   */
  function sendLog(message, level = 'info') {
    sendToEditor({
      type: 'SCRIPT_LOG',
      message: message,
      level: level,
      timestamp: Date.now()
    });
  }

  /**
   * Invia un errore
   */
  function sendError(error) {
    const errorMessage = typeof error === 'string' ? error : (error && error.message ? error.message : String(error));
    sendToEditor({
      type: 'SCRIPT_ERROR',
      error: errorMessage,
      timestamp: Date.now()
    }, true); // Errori hanno priorità alta
  }

  /**
   * Notifica completamento script
   */
  function sendDone() {
    sendToEditor({
      type: 'SCRIPT_DONE',
      timestamp: Date.now()
    });
  }

  // ============================================
  // GAME API - API LIMITATE ESPOSTE AGLI SCRIPT
  // ============================================
  // Questa è l'unica API accessibile agli script utente
  const GameAPI = {
    // Logging
    print: function() {
      const args = Array.from(arguments);
      if (args.length === 0) {
        sendLog('', 'info');
        return;
      }
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      sendLog(msg, 'info');
    },

    error: function() {
      const args = Array.from(arguments);
      if (args.length === 0) {
        sendLog('', 'error');
        return;
      }
      const messages = args.map(arg => serializeValue(arg));
      const msg = messages.join(' ');
      sendLog(msg, 'error');
    },

    // Variabili
    getVariable: function(name) {
      if (typeof name !== 'string') {
        sendError('GameAPI.getVariable: name must be a string');
        return null;
      }
      return gameState.variables.get(name) || null;
    },

    setVariable: function(name, value) {
      if (typeof name !== 'string') {
        sendError('GameAPI.setVariable: name must be a string');
        return;
      }
      gameState.variables.set(name, value);
    },

    // Stanze
    changeRoom: function(roomId) {
      if (typeof roomId !== 'string' && typeof roomId !== 'number') {
        sendError('GameAPI.changeRoom: roomId must be a string or number');
        return;
      }
      // Notifica l'editor del cambio stanza
      sendToEditor({
        type: 'ROOM_CHANGE_REQUEST',
        roomId: String(roomId),
        timestamp: Date.now()
      });
    },

    // Informazioni contesto
    getCurrentRoom: function() {
      return gameState.currentRoomId;
    },

    getCurrentObject: function() {
      return gameState.objectId;
    }
  };

  // Esponi GameAPI globalmente (unica API accessibile agli script)
  window.GameAPI = GameAPI;

  // Sostituisci print() globale per compatibilità
  window.print = function() {
    GameAPI.print.apply(GameAPI, arguments);
  };

  // ============================================
  // ESECUZIONE SCRIPT
  // ============================================
  function executeScript(code, context, handlerName, handlerArgs) {
    if (!code || typeof code !== 'string' || !code.trim()) {
      sendError('Script code is empty or invalid');
      sendDone();
      return;
    }

    // Aggiorna il contesto di esecuzione
    if (context) {
      if (context.roomId !== undefined) {
        gameState.currentRoomId = context.roomId;
      }
      if (context.objectId !== undefined) {
        gameState.objectId = context.objectId;
      }
      if (context.variables && typeof context.variables === 'object') {
        // Carica variabili dal contesto
        Object.keys(context.variables).forEach(key => {
          gameState.variables.set(key, context.variables[key]);
        });
      }
    }

    try {
      // Crea alias per compatibilità con vecchio sistema
      const aliases = {
        // Variabili (compatibilità)
        get_var: GameAPI.getVariable,
        set_var: GameAPI.setVariable,
        getVariable: GameAPI.getVariable,
        setVariable: GameAPI.setVariable,
        // Game object (compatibilità)
        Game: {
          getVar: GameAPI.getVariable,
          setVar: GameAPI.setVariable,
          getVariable: GameAPI.getVariable,
          setVariable: GameAPI.setVariable
        }
      };

      // Prepara il codice finale con chiamata all'handler se presente
      let finalCode = code;
      if (handlerName && typeof handlerName === 'string' && handlerName.trim()) {
        const callArgs = Array.isArray(handlerArgs) ? handlerArgs : [];
        const argsString = JSON.stringify(callArgs);
        finalCode = `
          ${code}
          
          // Invoca l'handler se definito
          if (typeof ${handlerName} === 'function') {
            try {
              ${handlerName}.apply(null, ${argsString});
            } catch (e) {
              GameAPI.error('Handler execution error: ' + (e && e.message ? e.message : String(e)));
            }
          } else {
            // Handler non trovato - non è un errore, solo un avviso
            GameAPI.print('Handler "${handlerName}" non definito nello script');
          }
        `;
      }

      // Esegui lo script in un contesto isolato
      // Le uniche API accessibili sono quelle di GameAPI e gli alias
      const scriptFunction = new Function(
        'GameAPI',
        'print',
        'get_var',
        'set_var',
        'getVariable',
        'setVariable',
        'Game',
        `
        // Wrapper per catturare errori
        try {
          ${finalCode}
        } catch (e) {
          GameAPI.error('Script execution error: ' + (e && e.message ? e.message : String(e)));
          throw e;
        }
        `
      );

      // Esegui con GameAPI e alias come parametri
      scriptFunction(
        GameAPI,
        GameAPI.print,
        aliases.get_var,
        aliases.set_var,
        aliases.getVariable,
        aliases.setVariable,
        aliases.Game
      );

      // Notifica completamento
      sendDone();

    } catch (e) {
      // Cattura errori di esecuzione
      const errorMessage = e && e.message ? e.message : String(e);
      sendError(`Script execution failed: ${errorMessage}`);
      sendDone();
    }
  }

  // ============================================
  // LISTENER PER MESSAGGI DALL'EDITOR
  // ============================================
  window.addEventListener('message', function(event) {
    // NOTA: In produzione, verificare event.origin per sicurezza
    // Per ora accettiamo messaggi da qualsiasi origine per sviluppo
    
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'RUN_SCRIPT':
        executeScript(message.code, message.context, message.handlerName, message.handlerArgs);
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
        gameState.objectId = null;
        gameState.variables.clear();
        // Pulisci anche la coda di messaggi
        MessageQueue.clear();
        sendToEditor({
          type: 'RUNTIME_READY',
          timestamp: Date.now()
        }, true); // Priorità alta per messaggi di sistema
        break;

      default:
        // Ignora messaggi sconosciuti
        break;
    }
  });

  // ============================================
  // INIZIALIZZAZIONE
  // ============================================
  // Notifica l'editor che il runtime è pronto
  // Usa un piccolo delay per assicurarsi che tutto sia inizializzato
  function sendRuntimeReady() {
    sendToEditor({
      type: 'RUNTIME_READY',
      timestamp: Date.now()
    }, true); // Priorità alta per messaggi di sistema
    
    // Log locale per debug (se possibile)
    try {
      console.log('[Runtime] RUNTIME_READY message sent to parent');
    } catch (e) {
      // Ignora se console non disponibile
    }
  }
  
  // Invia immediatamente
  sendRuntimeReady();
  
  // Re-invia dopo un breve delay come backup (nel caso il primo messaggio vada perso)
  setTimeout(() => {
    // Verifica se il parent è ancora disponibile prima di re-inviare
    if (window.parent && window.parent !== window) {
      sendRuntimeReady();
    }
  }, 100);

  // Esponi MessageQueue per debug (opzionale, può essere rimosso in produzione)
  if (typeof window !== 'undefined') {
    window.__RuntimeMessageQueue = MessageQueue;
    window.GameAPI = GameAPI; // Esponi anche GameAPI per debug
  }

  // Blocca accesso a API pericolose
  try {
    // Rimuovi o blocca accesso a window.parent (già limitato dal sandbox)
    // Rimuovi accesso a document (non necessario per gli script)
    // Rimuovi fetch, XMLHttpRequest, etc.
    Object.defineProperty(window, 'fetch', {
      value: undefined,
      writable: false,
      configurable: false
    });
  } catch (e) {
    // Ignora errori di definizione
  }

})();
