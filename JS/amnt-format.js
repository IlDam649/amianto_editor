/**
 * Amianto Editor — .amnt project file format
 * Single JSON document containing project structure + embedded assets (base64).
 */
(function () {
  'use strict';

  const AMNT_FORMAT = 'amianto-amnt';
  const AMNT_VERSION = 1;
  const AMNT_EXTENSION = '.amnt';

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  }

  function createPackage(projectObj, assets) {
    return {
      format: AMNT_FORMAT,
      version: AMNT_VERSION,
      meta: {
        savedAt: new Date().toISOString(),
        editor: 'Amianto Editor',
        editorVersion: '1.0.0'
      },
      project: projectObj,
      assets: Array.isArray(assets) ? assets : []
    };
  }

  function parse(textOrObject) {
    const pkg = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
    if (!pkg || typeof pkg !== 'object') {
      throw new Error('Invalid .amnt file: not an object');
    }
    if (pkg.format === AMNT_FORMAT) {
      if (!pkg.project || typeof pkg.project !== 'object') {
        throw new Error('Invalid .amnt file: missing project');
      }
      return {
        project: pkg.project,
        assets: Array.isArray(pkg.assets) ? pkg.assets : [],
        meta: pkg.meta || {}
      };
    }
    if (pkg.format === 'amianto-game') {
      return { project: pkg, assets: [], meta: {} };
    }
    throw new Error('Unrecognized project file format');
  }

  function stringify(pkg, pretty) {
    return pretty ? JSON.stringify(pkg, null, 2) : JSON.stringify(pkg);
  }

  function defaultFileName(projectName) {
    const safe = (projectName || 'project').trim().replace(/[^a-z0-9-_\s]/gi, '_').replace(/\s+/g, '_');
    return safe + AMNT_EXTENSION;
  }

  window.AmiantoAmnt = {
    FORMAT: AMNT_FORMAT,
    VERSION: AMNT_VERSION,
    EXTENSION: AMNT_EXTENSION,
    blobToBase64,
    base64ToBlob,
    createPackage,
    parse,
    stringify,
    defaultFileName
  };
})();
