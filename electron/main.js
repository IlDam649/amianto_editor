const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const isDev = !app.isPackaged;

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
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

const AMNT_FILTER = { name: 'Amianto Project', extensions: ['amnt'] };
const PROJECT_FILTER = { name: 'Amianto / JSON Project', extensions: ['amnt', 'json'] };

ipcMain.handle('amianto:show-save-dialog', async (event, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Amianto Project',
    defaultPath: defaultName || 'project.amnt',
    filters: [AMNT_FILTER]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!filePath.toLowerCase().endsWith('.amnt')) {
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

ipcMain.handle('amianto:write-file', async (_event, filePath, content) => {
  if (!filePath) throw new Error('Missing file path');
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

ipcMain.handle('amianto:read-file', async (_event, filePath) => {
  if (!filePath) throw new Error('Missing file path');
  return await fs.readFile(filePath, 'utf8');
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
