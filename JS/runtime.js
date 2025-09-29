(function(){
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const logEl = document.getElementById('runtime-log');
  const projectNameEl = document.getElementById('runtime-project-name');

  let gameData = null; // parsed JSON
  let currentRoomIndex = 0;
  let loadedImagesCache = new Map(); // dataURL/src -> HTMLImageElement

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent += `[${t}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
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
        if (idx >= 0) currentRoomIndex = idx; else currentRoomIndex = 0;
      } else {
        currentRoomIndex = 0;
      }
    } catch(_) {
      currentRoomIndex = 0;
    }
    await renderRoom(currentRoomIndex);
    log('First room rendered');
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


