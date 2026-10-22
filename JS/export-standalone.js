/**
 * Amianto Editor — export gioco come HTML standalone (runtime + progetto + asset embedded).
 * Un solo file .html apribile in browser senza l'editor.
 */
(function () {
  'use strict';

  function escapeForScriptJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
  }

  function safeFileBase(projectName) {
    const safe = String(projectName || 'game')
      .trim()
      .replace(/[^a-z0-9-_\s]/gi, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return safe || 'game';
  }

  function buildEmbeddedAssetMap(assets) {
    const map = Object.create(null);
    if (!Array.isArray(assets)) return map;
    for (const entry of assets) {
      if (!entry || !entry.assetId || !entry.data) continue;
      map[entry.assetId] = {
        mimeType: entry.mimeType || 'application/octet-stream',
        fileName: entry.fileName || entry.name || '',
        name: entry.name || entry.fileName || entry.assetId,
        category: entry.category || entry.type || 'resource',
        subfolder: entry.subfolder || null,
        data: entry.data
      };
    }
    return map;
  }

  /**
   * Unwrap .amnt packages and always produce a runtime-ready amianto-game project.
   * Prevents "Unsupported project format. Expected: amianto-game" in standalone HTML.
   */
  function resolveProjectAndAssets(pkg) {
    if (!pkg || typeof pkg !== 'object') {
      throw new Error('Export package missing or invalid');
    }
    let project = pkg;
    let assets = [];
    if (pkg.format === 'amianto-amnt' || (pkg.project && typeof pkg.project === 'object' && Array.isArray(pkg.assets))) {
      if (!pkg.project || typeof pkg.project !== 'object') {
        throw new Error('Export package missing project data');
      }
      project = pkg.project;
      assets = Array.isArray(pkg.assets) ? pkg.assets : [];
    } else if (Array.isArray(pkg.assets)) {
      assets = pkg.assets;
    }
    if (!project.settings || typeof project.settings !== 'object') {
      project = Object.assign({}, project, { settings: project.settings || {} });
    } else {
      project = Object.assign({}, project);
    }
    project.format = 'amianto-game';
    if (project.version == null) project.version = 1;
    if (!Array.isArray(project.rooms)) project.rooms = [];
    return { project: project, assets: assets };
  }

  function buildStandaloneHtml(pkg, runtimeSource, options) {
    const opts = options || {};
    const resolved = resolveProjectAndAssets(pkg);
    const project = resolved.project;
    const assets = resolved.assets;
    const title = (project && project.settings && project.settings.name)
      ? String(project.settings.name)
      : (opts.title || 'Amianto Game');
    const canvasW = (project && project.settings && project.settings.canvasWidth) || 800;
    const canvasH = (project && project.settings && project.settings.canvasHeight) || 600;
    const assetMap = buildEmbeddedAssetMap(assets);
    let projectJson;
    let assetsJson;
    try {
      projectJson = escapeForScriptJson(project);
      assetsJson = escapeForScriptJson(assetMap);
    } catch (err) {
      throw new Error('Failed to serialize project for HTML export: ' + (err && err.message ? err.message : err));
    }
    // Runtime as JSON string — avoids HTML parser breaking on </script> inside runtime.js
    const runtimeJson = escapeForScriptJson(String(runtimeSource || ''));
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Amianto Editor">
  <title>${safeTitle}</title>
  ${opts.faviconDataUrl
    ? `<link rel="icon" type="image/png" href="${String(opts.faviconDataUrl).replace(/"/g, '')}">`
    : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #0a0a0a !important; overflow: hidden;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; color: #eee;
    }
    #game-container {
      position: relative; width: 100vw; height: 100vh;
      display: flex; flex-direction: column; background: #000;
    }
    #game-canvas-container {
      flex: 1; position: relative; background: #000; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    #game-canvas {
      display: block; max-width: 100%; max-height: 100%;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
      background: #000;
    }
    #loading-overlay {
      position: fixed; inset: 0; background: #000;
      display: flex; align-items: center; justify-content: center;
      z-index: 2000; flex-direction: column; gap: 16px;
    }
    #loading-overlay.hidden { display: none; }
    #loading-overlay h2 { color: #39ff14; font-size: 20px; font-weight: 500; }
    #loading-overlay p { color: #aaa; font-size: 14px; }
    #boot-error {
      display: none; position: fixed; inset: 0; z-index: 3000;
      background: #1a0505; color: #ffb4b4; padding: 24px;
      font-family: Consolas, monospace; font-size: 13px; white-space: pre-wrap;
      overflow: auto;
    }
    #boot-error.visible { display: block; }
    #runtime-log {
      position: fixed; bottom: 0; left: 0; right: 0; height: 180px;
      background: rgba(10,10,10,0.95); border-top: 2px solid #39ff14;
      display: none; flex-direction: column; z-index: 1000;
      font-family: "Courier New", monospace; font-size: 12px;
    }
    #runtime-log.visible { display: flex; }
    #runtime-log-header {
      background: #1a1a1a; padding: 6px 12px; border-bottom: 1px solid #333;
      display: flex; justify-content: space-between; align-items: center;
    }
    #runtime-log-header h4 { margin: 0; color: #39ff14; font-size: 13px; }
    #runtime-log-controls button {
      background: #2a2a2a; border: 1px solid #39ff14; color: #39ff14;
      padding: 3px 10px; cursor: pointer; font-size: 11px; border-radius: 4px;
    }
    #runtime-log-content { flex: 1; overflow-y: auto; padding: 8px 12px; }
    .log-entry { margin: 2px 0; line-height: 1.35; }
    .log-entry.warning { color: #ffaa00; }
    .log-entry.error { color: #ff4444; }
  </style>
</head>
<body style="background:#0a0a0a;margin:0;">
  <div id="boot-error"></div>
  <div id="game-container">
    <div id="game-canvas-container">
      <canvas id="game-canvas" width="${Number(canvasW) || 800}" height="${Number(canvasH) || 600}"></canvas>
    </div>
  </div>

  <div id="loading-overlay">
    <h2 id="loading-title">Loading…</h2>
    <p id="loading-message">Preparing game</p>
  </div>

  <div id="runtime-log">
    <div id="runtime-log-header">
      <h4>Runtime Log</h4>
      <div id="runtime-log-controls">
        <button type="button" id="btn-clear-log">Clear</button>
        <button type="button" id="btn-hide-log">Hide</button>
      </div>
    </div>
    <div id="runtime-log-content"></div>
  </div>

  <script type="application/json" id="amianto-embedded-project">${projectJson}</script>
  <script type="application/json" id="amianto-embedded-assets">${assetsJson}</script>
  <script type="application/json" id="amianto-embedded-runtime">${runtimeJson}</script>
  <script>
(function () {
  'use strict';

  function showBootError(err) {
    var el = document.getElementById('boot-error');
    if (!el) return;
    var msg = (err && err.stack) ? err.stack : String(err && err.message ? err.message : err);
    el.textContent = 'Amianto standalone failed to start:\\n\\n' + msg +
      '\\n\\nTip: re-export from the editor after updating Amianto, or press F12 for details.';
    el.className = 'visible';
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  window.addEventListener('error', function (e) {
    showBootError(e && e.error ? e.error : (e && e.message) || e);
  });
  window.addEventListener('unhandledrejection', function (e) {
    showBootError(e && e.reason ? e.reason : e);
  });

  function readJsonScript(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    return JSON.parse(el.textContent || 'null');
  }

  var projectData = readJsonScript('amianto-embedded-project');
  var assetMap = readJsonScript('amianto-embedded-assets') || {};
  var runtimeSource = readJsonScript('amianto-embedded-runtime');
  var urlCache = Object.create(null);

  function dataUrlFor(assetId) {
    if (!assetId && assetId !== 0) return null;
    var key = String(assetId);
    if (key.indexOf('asset:') === 0) key = key.slice(6);
    if (urlCache[key]) return urlCache[key];
    var entry = assetMap[key];
    if (!entry || !entry.data) {
      // Fallback: match by fileName / name (Resources picker often uses display names)
      var keys = Object.keys(assetMap);
      for (var i = 0; i < keys.length; i++) {
        var e = assetMap[keys[i]];
        if (!e) continue;
        if (e.fileName === key || e.name === key || e.fileName === assetId || e.name === assetId) {
          entry = e;
          key = keys[i];
          break;
        }
      }
    }
    if (!entry || !entry.data) return null;
    var mime = entry.mimeType || 'application/octet-stream';
    var url = 'data:' + mime + ';base64,' + entry.data;
    urlCache[key] = url;
    return url;
  }

  function listByCategory(category) {
    var out = [];
    Object.keys(assetMap).forEach(function (assetId) {
      var entry = assetMap[assetId];
      if (!entry) return;
      var cat = String(entry.category || '').toLowerCase();
      var name = entry.fileName || entry.name || '';
      if (category === 'audio') {
        if (cat !== 'audio' && !/\\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(name)) return;
      } else if (category === 'resource') {
        if (cat === 'audio') return;
      }
      out.push({
        assetId: assetId,
        name: entry.name || entry.fileName || assetId,
        fileName: entry.fileName || entry.name || assetId,
        displayName: entry.name || entry.fileName || assetId,
        publicUrl: dataUrlFor(assetId),
        size: 0,
        type: entry.category || category,
        subfolder: entry.subfolder || null,
        storagePath: null
      });
    });
    return out;
  }

  window.assetStorage = {
    isAvailable: function () { return true; },
    resolveAssetUrl: function (projectId, assetId) {
      return Promise.resolve(dataUrlFor(assetId));
    },
    listProjectResources: function () {
      return Promise.resolve(listByCategory('resource'));
    },
    listProjectAudio: function () {
      return Promise.resolve(listByCategory('audio'));
    }
  };
  window.getAmiantoAssetStorage = function () { return window.assetStorage; };
  window.getAmiantoLocalUser = function () {
    return { username: 'Local', email: '', uid: 'local' };
  };

  var logEl = document.getElementById('runtime-log-content');
  var logPanel = document.getElementById('runtime-log');

  function addRuntimeLog(message, level) {
    if (!logEl) return;
    var entry = document.createElement('div');
    entry.className = 'log-entry ' + (level || 'info');
    var ts = new Date().toLocaleTimeString();
    entry.appendChild(document.createTextNode('[' + ts + '] ' + String(message)));
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }
  window.addRuntimeLog = addRuntimeLog;

  function setLogVisible(visible) {
    if (!logPanel) return;
    logPanel.classList.toggle('visible', !!visible);
  }

  var hideBtn = document.getElementById('btn-hide-log');
  var clearBtn = document.getElementById('btn-clear-log');
  if (hideBtn) hideBtn.addEventListener('click', function () { setLogVisible(false); });
  if (clearBtn) clearBtn.addEventListener('click', function () { if (logEl) logEl.innerHTML = ''; });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'l' || e.key === 'L') {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      setLogVisible(!logPanel.classList.contains('visible'));
    }
  });

  function injectRuntimeAndBoot() {
    if (typeof runtimeSource !== 'string' || runtimeSource.length < 100) {
      throw new Error('Embedded runtime source missing or too short');
    }
    if (!projectData || typeof projectData !== 'object') {
      throw new Error('Embedded project missing or invalid');
    }

    var assetCount = Object.keys(assetMap).length;
    addRuntimeLog('Embedded assets: ' + assetCount, assetCount ? 'info' : 'warning');
    if (!assetCount) {
      addRuntimeLog('Warning: no assets embedded — rooms/characters may be blank. Re-export after Save Project.', 'warning');
    }

    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.textContent = runtimeSource;
    document.head.appendChild(s);

    if (typeof window.initRuntime !== 'function') {
      throw new Error('Runtime loaded but initRuntime is missing');
    }

    addRuntimeLog('Starting standalone game…', 'info');
    return Promise.resolve(window.initRuntime(projectData)).then(function () {
      addRuntimeLog('Game started', 'info');
      addRuntimeLog('Tip: press L to toggle the runtime log', 'info');
    });
  }

  try {
    Promise.resolve(injectRuntimeAndBoot()).catch(function (err) {
      showBootError(err);
      setLogVisible(true);
    });
  } catch (err) {
    showBootError(err);
    setLogVisible(true);
  }
})();
  </script>
</body>
</html>`;
  }

  window.AmiantoStandaloneExport = {
    buildStandaloneHtml,
    safeFileBase,
    buildEmbeddedAssetMap,
    resolveProjectAndAssets
  };
})();
