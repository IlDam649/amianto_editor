/**
 * Amianto Editor — configurazione applicazione locale
 */
(function () {
  'use strict';

  const isElectron = !!(typeof window !== 'undefined' && (
    window.amiantoElectron === true ||
    (window.process && window.process.versions && window.process.versions.electron) ||
    /Electron/i.test(navigator.userAgent || '')
  ));

  window.AMIANTO_IS_ELECTRON = isElectron;

  window.getAmiantoLocalUser = function () {
    return { username: 'Local', email: '', uid: 'local' };
  };

  window.getAmiantoAssetStorage = function () {
    return window.assetStorage || null;
  };

  console.log('[AppMode] Electron:', isElectron);
})();
