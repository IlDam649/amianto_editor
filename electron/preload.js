const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amiantoElectron', true);
/** Bump when export IPC surface changes — renderer refuses export if too old. */
contextBridge.exposeInMainWorld('amiantoExportApiVersion', 3);

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
  getTempDir: () => ipcRenderer.invoke('amianto:get-temp-dir'),
  getExportApiInfo: () => ipcRenderer.invoke('amianto:get-export-api-info'),
  deleteFile: (filePath) => ipcRenderer.invoke('amianto:delete-file', filePath),
  /**
   * Build standalone HTML from an on-disk .amnt (Node child process).
   * @param {{ amntPath: string, htmlPath: string, title?: string }} payload
   */
  exportGame: (payload) => ipcRenderer.invoke('amianto:export-game', payload || {}),
  /** Alias used by older export code paths */
  exportStandaloneHtml: (payload) => ipcRenderer.invoke('amianto:export-game', payload || {}),
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
