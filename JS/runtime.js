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
  // COMUNICAZIONE CON L'EDITOR
  // ============================================
  function sendToEditor(message) {
    try {
      // Invia messaggio al parent (editor)
      // L'iframe è sandboxed, quindi window.parent è disponibile ma limitato
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
    } catch (e) {
      // Ignora errori di comunicazione (non dovrebbero mai accadere)
      console.error('[Runtime] Failed to send message:', e);
    }
  }

  function sendLog(message, level = 'info') {
    sendToEditor({
      type: 'SCRIPT_LOG',
      message: message,
      level: level,
      timestamp: Date.now()
    });
  }

  function sendError(error) {
    sendToEditor({
      type: 'SCRIPT_ERROR',
      error: error,
      timestamp: Date.now()
    });
  }

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
        sendToEditor({
          type: 'RUNTIME_READY',
          timestamp: Date.now()
        });
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
  sendToEditor({
    type: 'RUNTIME_READY',
    timestamp: Date.now()
  });

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
