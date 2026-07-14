const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amiantoElectron', true);

contextBridge.exposeInMainWorld('amiantoNativeFs', {
  showSaveDialog: (defaultName) => ipcRenderer.invoke('amianto:show-save-dialog', defaultName),
  showOpenDialog: () => ipcRenderer.invoke('amianto:show-open-dialog'),
  writeFile: (filePath, content) => ipcRenderer.invoke('amianto:write-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('amianto:read-file', filePath)
});
