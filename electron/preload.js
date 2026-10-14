const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amiantoElectron', true);

contextBridge.exposeInMainWorld('amiantoNativeFs', {
  showSaveDialog: (defaultName, options) => ipcRenderer.invoke('amianto:show-save-dialog', defaultName, options || {}),
  showOpenDialog: () => ipcRenderer.invoke('amianto:show-open-dialog'),
  writeFile: (filePath, content) => ipcRenderer.invoke('amianto:write-file', filePath, content),
  writeFileChunkedBegin: (filePath) => ipcRenderer.invoke('amianto:write-file-chunked-begin', filePath),
  writeFileChunkedAppend: (id, chunk) => ipcRenderer.invoke('amianto:write-file-chunked-append', id, chunk),
  writeFileChunkedEnd: (id) => ipcRenderer.invoke('amianto:write-file-chunked-end', id),
  writeFileChunkedAbort: (id) => ipcRenderer.invoke('amianto:write-file-chunked-abort', id),
  readFile: (filePath) => ipcRenderer.invoke('amianto:read-file', filePath),
  readFileChunkedBegin: (filePath) => ipcRenderer.invoke('amianto:read-file-chunked-begin', filePath),
  readFileChunkedNext: (id, maxChars) => ipcRenderer.invoke('amianto:read-file-chunked-next', id, maxChars),
  readFileChunkedAbort: (id) => ipcRenderer.invoke('amianto:read-file-chunked-abort', id),
  readAppFile: (relativePath) => ipcRenderer.invoke('amianto:read-app-file', relativePath),
  openRuntimeWindow: (runtimeUrl) => ipcRenderer.invoke('amianto:open-runtime-window', runtimeUrl),
  closeRuntimeWindow: () => ipcRenderer.invoke('amianto:close-runtime-window'),
  isRuntimeWindowClosed: () => ipcRenderer.invoke('amianto:runtime-window-closed'),
  focusRuntimeWindow: () => ipcRenderer.invoke('amianto:focus-runtime-window'),
  postToRuntime: (message) => ipcRenderer.invoke('amianto:post-to-runtime', message),
  onRuntimeMessage: (handler) => {
    const listener = (_event, message) => handler(message);
    ipcRenderer.on('amianto:runtime-message', listener);
    return () => ipcRenderer.removeListener('amianto:runtime-message', listener);
  }
});
