const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const isDev = !app.isPackaged;

// Consenti audio senza gesture (play_music in on_room_change dopo load_room async)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Amianto Editor',
    icon: path.join(__dirname, '..', 'img', 'mnt.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Finestra Play Test (runtime.html): stessa policy autoplay del main
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1200,
        height: 800,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          autoplayPolicy: 'no-user-gesture-required'
        }
      }
    };
  });

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

const AMNT_FILTER = { name: 'Amianto Project', extensions: ['amnt'] };
const PROJECT_FILTER = { name: 'Amianto / JSON Project', extensions: ['amnt', 'json'] };
const HTML_FILTER = { name: 'HTML Game', extensions: ['html', 'htm'] };

ipcMain.handle('amianto:show-save-dialog', async (event, defaultName, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
  const kind = (options && options.kind) || 'amnt';
  const isHtml = kind === 'html';
  const result = await dialog.showSaveDialog(win || undefined, {
    title: isHtml ? 'Export Standalone Game' : 'Save Amianto Project',
    defaultPath: defaultName || (isHtml ? 'game.html' : 'project.amnt'),
    filters: isHtml ? [HTML_FILTER] : [AMNT_FILTER]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (isHtml) {
    if (!/\.html?$/i.test(filePath)) filePath += '.html';
  } else if (!filePath.toLowerCase().endsWith('.amnt')) {
    filePath += '.amnt';
  }
  return filePath;
});

ipcMain.handle('amianto:show-open-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Open Amianto Project',
    properties: ['openFile'],
    filters: [PROJECT_FILTER]
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

let runtimeWin = null;

ipcMain.handle('amianto:open-runtime-window', async (_event, runtimeUrl) => {
  const runtimePath = path.join(__dirname, '..', 'runtime.html');
  const loadRuntime = async (win) => {
    if (runtimeUrl && /^https?:/i.test(String(runtimeUrl))) {
      await win.loadURL(runtimeUrl);
    } else {
      await win.loadFile(runtimePath);
    }
  };

  if (runtimeWin && !runtimeWin.isDestroyed()) {
    runtimeWin.focus();
    try {
      await loadRuntime(runtimeWin);
    } catch (_) {}
    return { ok: true, reused: true };
  }

  runtimeWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Amianto Runtime',
    icon: path.join(__dirname, '..', 'img', 'mnt.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  runtimeWin.on('closed', () => {
    runtimeWin = null;
  });

  await loadRuntime(runtimeWin);
  return { ok: true, reused: false };
});

ipcMain.handle('amianto:close-runtime-window', async () => {
  if (runtimeWin && !runtimeWin.isDestroyed()) {
    runtimeWin.close();
  }
  runtimeWin = null;
  return true;
});

ipcMain.handle('amianto:runtime-window-closed', async () => {
  return !runtimeWin || runtimeWin.isDestroyed();
});

ipcMain.handle('amianto:focus-runtime-window', async () => {
  if (runtimeWin && !runtimeWin.isDestroyed()) {
    runtimeWin.focus();
    return true;
  }
  return false;
});

ipcMain.handle('amianto:post-to-runtime', async (_event, message) => {
  if (!runtimeWin || runtimeWin.isDestroyed()) return false;
  try {
    runtimeWin.webContents.send('amianto:runtime-message', message);
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('amianto:read-app-file', async (_event, relativePath) => {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..') || !rel.startsWith('JS/')) {
    throw new Error('Invalid app file path');
  }
  const fullPath = path.join(__dirname, '..', ...rel.split('/'));
  return await fs.readFile(fullPath, 'utf8');
});

ipcMain.handle('amianto:write-file', async (_event, filePath, content) => {
  if (!filePath) throw new Error('Missing file path');
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

/** Scrive file grandi a chunk (evita limiti IPC su HTML standalone con asset). */
const chunkedWrites = new Map();

ipcMain.handle('amianto:write-file-chunked-begin', async (_event, filePath) => {
  if (!filePath) throw new Error('Missing file path');
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const handle = await fs.open(filePath, 'w');
  chunkedWrites.set(id, { handle, filePath, bytes: 0 });
  return id;
});

ipcMain.handle('amianto:write-file-chunked-append', async (_event, id, chunk) => {
  const entry = chunkedWrites.get(id);
  if (!entry) throw new Error('Unknown chunked write id');
  const buf = Buffer.from(String(chunk == null ? '' : chunk), 'utf8');
  await entry.handle.write(buf);
  entry.bytes += buf.length;
  return entry.bytes;
});

ipcMain.handle('amianto:write-file-chunked-end', async (_event, id) => {
  const entry = chunkedWrites.get(id);
  if (!entry) throw new Error('Unknown chunked write id');
  await entry.handle.close();
  const result = { bytes: entry.bytes, filePath: entry.filePath };
  chunkedWrites.delete(id);
  return result;
});

/** Abort scrittura chunked: chiude handle e rimuove il file parziale. */
ipcMain.handle('amianto:write-file-chunked-abort', async (_event, id) => {
  const entry = chunkedWrites.get(id);
  if (!entry) return true;
  chunkedWrites.delete(id);
  try {
    await entry.handle.close();
  } catch (_) {}
  try {
    await fs.unlink(entry.filePath);
  } catch (_) {}
  return true;
});

ipcMain.handle('amianto:read-file', async (_event, filePath) => {
  if (!filePath) throw new Error('Missing file path');
  return await fs.readFile(filePath, 'utf8');
});

/** Lettura file grandi a chunk (evita limiti IPC su .amnt con asset embedded). */
const chunkedReads = new Map();

ipcMain.handle('amianto:read-file-chunked-begin', async (_event, filePath) => {
  if (!filePath) throw new Error('Missing file path');
  const text = await fs.readFile(filePath, 'utf8');
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  chunkedReads.set(id, { text, pos: 0, filePath });
  return { id, length: text.length };
});

ipcMain.handle('amianto:read-file-chunked-next', async (_event, id, maxChars) => {
  const entry = chunkedReads.get(id);
  if (!entry) throw new Error('Unknown chunked read id');
  const size = Math.max(1, Number(maxChars) || (512 * 1024));
  const chunk = entry.text.slice(entry.pos, entry.pos + size);
  entry.pos += chunk.length;
  const done = entry.pos >= entry.text.length;
  if (done) chunkedReads.delete(id);
  return { chunk, done, pos: entry.pos };
});

ipcMain.handle('amianto:read-file-chunked-abort', async (_event, id) => {
  chunkedReads.delete(id);
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
