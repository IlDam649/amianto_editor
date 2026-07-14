/**
 * Amianto Editor — storage locale (IndexedDB)
 * Sostituisce Supabase Storage in modalità offline.
 */
(function () {
  'use strict';

  const DB_NAME = 'amianto-local-v1';
  const DB_VERSION = 1;
  const STORE_ASSETS = 'assets';
  const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
  const AUDIO_FILE_PATTERN = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

  let dbPromise = null;
  const blobUrlCache = new Map();

  function getLocalUserId() {
    if (window.getAmiantoLocalUser) return window.getAmiantoLocalUser().uid;
    return 'local';
  }

  function assetKey(projectId, assetId) {
    return `${projectId}::${assetId}`;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const store = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('assetId', 'assetId', { unique: false });
        }
      };
    });
    return dbPromise;
  }

  function getSupabaseFolderForType(assetType) {
    switch (assetType) {
      case 'background': return 'backgrounds';
      case 'foreground': return 'foregrounds';
      case 'sprite': return 'sprites';
      case 'gui': return 'gui';
      case 'character': return 'characters';
      case 'cursor': return 'cursors';
      case 'audio': return 'audio';
      case 'resource': return 'resources';
      case 'animation': return 'animations';
      default: return assetType ? String(assetType).toLowerCase() : 'sprites';
    }
  }

  function buildStoragePath(userId, projectId, category, fileName, subfolder = null) {
    const folder = subfolder || category;
    return `${userId}/${projectId}/${folder}/${fileName}`;
  }

  function generateUniqueFileName(originalName, assetId) {
    const ext = (originalName && originalName.includes('.'))
      ? originalName.split('.').pop().toLowerCase()
      : 'png';
    const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'png';
    return `${assetId}.${safeExt}`;
  }

  function revokeBlobUrl(key) {
    const url = blobUrlCache.get(key);
    if (url) {
      try { URL.revokeObjectURL(url); } catch (_) {}
      blobUrlCache.delete(key);
    }
  }

  function getBlobUrl(record) {
    if (!record || !record.blob) return null;
    const key = record.id;
    if (blobUrlCache.has(key)) return blobUrlCache.get(key);
    const url = URL.createObjectURL(record.blob);
    blobUrlCache.set(key, url);
    return url;
  }

  async function putAsset(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAssetById(projectId, assetId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const req = tx.objectStore(STORE_ASSETS).get(assetKey(projectId, assetId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllProjectAssets(projectId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const index = tx.objectStore(STORE_ASSETS).index('projectId');
      const req = index.getAll(projectId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteAssetRecord(projectId, assetId) {
    const db = await openDb();
    const key = assetKey(projectId, assetId);
    revokeBlobUrl(key);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteProjectAssets(projectId) {
    const records = await getAllProjectAssets(projectId);
    for (const record of records) {
      await deleteAssetRecord(projectId, record.assetId);
    }
    return true;
  }

  function isAvailable() {
    return typeof indexedDB !== 'undefined';
  }

  async function init() {
    await openDb();
    return true;
  }

  async function uploadAsset(file, projectId, category, assetId = null, overwrite = false, fileNameOverride = null, subfolder = null) {
    if (!isAvailable()) throw new Error('IndexedDB non disponibile');
    if (!assetId) {
      assetId = 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    const userId = getLocalUserId();
    const folder = getSupabaseFolderForType(category);
    const fileName = fileNameOverride || generateUniqueFileName(file.name, assetId);
    const storagePath = buildStoragePath(userId, projectId, folder, fileName, subfolder);
    const id = assetKey(projectId, assetId);

    const existing = await getAssetById(projectId, assetId);
    if (existing && !overwrite) {
      return {
        id: assetId,
        name: file.name,
        type: category,
        url: getBlobUrl(existing),
        fileName: existing.fileName
      };
    }

    if (existing) revokeBlobUrl(id);

    const record = {
      id,
      projectId,
      assetId,
      userId,
      category,
      type: category,
      subfolder: subfolder || null,
      fileName,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      storagePath,
      storageProvider: 'local',
      blob: file,
      publicUrl: null,
      createdAt: new Date().toISOString()
    };

    await putAsset(record);
    const url = getBlobUrl(record);
    record.publicUrl = url;
    await putAsset(record);

    console.log('[LocalStorage] Asset salvato:', { assetId, storagePath });

    return {
      id: assetId,
      name: file.name,
      type: category,
      url,
      fileName
    };
  }

  function getAssetPublicUrl(userId, projectId, category, fileName, subfolder = null) {
    return null;
  }

  async function resolveAssetUrl(projectId, assetId, category, originalFileName = null, userIdOverride = null, subfolder = null) {
    const record = await getAssetById(projectId, assetId);
    if (record) {
      const url = getBlobUrl(record);
      if (url) return url;
    }

    const all = await getAllProjectAssets(projectId);
    const match = all.find(r => r.assetId === assetId);
    if (match) return getBlobUrl(match);

    if (originalFileName) {
      const fileName = generateUniqueFileName(originalFileName, assetId);
      const found = all.find(r => r.fileName === fileName);
      if (found) return getBlobUrl(found);
    }

    return null;
  }

  async function deleteAsset(projectId, category, fileName, userId = null, subfolder = null) {
    const all = await getAllProjectAssets(projectId);
    const folder = getSupabaseFolderForType(category);
    const actualFolder = subfolder || folder;
    const target = all.find(r =>
      r.fileName === fileName &&
      (r.subfolder === subfolder || (!r.subfolder && !subfolder)) &&
      (r.category === category || getSupabaseFolderForType(r.category) === actualFolder)
    );
    if (target) {
      await deleteAssetRecord(projectId, target.assetId);
      return true;
    }
    return false;
  }

  async function deleteProjectFolder(projectId, userId = null) {
    return deleteProjectAssets(projectId);
  }

  async function deleteCharacterFolder(projectId, characterName, userId = null) {
    const all = await getAllProjectAssets(projectId);
    const prefix = `characters/${characterName}`;
    for (const record of all) {
      if (record.subfolder && record.subfolder.startsWith(prefix)) {
        await deleteAssetRecord(projectId, record.assetId);
      }
    }
    return true;
  }

  async function getProjectStorageSize(projectId) {
    const all = await getAllProjectAssets(projectId);
    return all.reduce((sum, r) => sum + (r.blob ? r.blob.size : 0), 0);
  }

  function entryFromRecord(record, assetType) {
    return {
      assetId: record.assetId,
      name: record.name || record.fileName,
      fileName: record.fileName,
      publicUrl: getBlobUrl(record),
      size: record.blob ? record.blob.size : 0,
      type: assetType || record.type || record.category,
      subfolder: record.subfolder || null,
      storagePath: record.storagePath
    };
  }

  async function listImagesInFolder(storagePath, assetType) {
    const parts = String(storagePath || '').split('/');
    if (parts.length < 3) return [];
    const userId = parts[0];
    const projectId = parts[1];
    const folderPath = parts.slice(2).join('/');
    const all = await getAllProjectAssets(projectId);
    return all
      .filter(r => {
        const folder = r.subfolder || getSupabaseFolderForType(r.category);
        return folder === folderPath && IMAGE_FILE_PATTERN.test(r.fileName || '');
      })
      .map(r => entryFromRecord(r, assetType));
  }

  async function listMediaInFolder(storagePath, assetType, pattern) {
    const parts = String(storagePath || '').split('/');
    if (parts.length < 3) return [];
    const projectId = parts[1];
    const folderPath = parts.slice(2).join('/');
    const all = await getAllProjectAssets(projectId);
    const re = pattern || AUDIO_FILE_PATTERN;
    return all
      .filter(r => {
        const folder = r.subfolder || getSupabaseFolderForType(r.category);
        return folder === folderPath && re.test(r.fileName || '');
      })
      .map(r => entryFromRecord(r, assetType));
  }

  async function listProjectResources(projectId, userIdOverride = null) {
    const userId = userIdOverride || getLocalUserId();
    return listImagesInFolder(`${userId}/${projectId}/resources`, 'resource');
  }

  async function listProjectAudio(projectId) {
    const userId = getLocalUserId();
    return listMediaInFolder(`${userId}/${projectId}/audio`, 'audio', AUDIO_FILE_PATTERN);
  }

  async function deleteFileByPath(storagePath) {
    const parts = String(storagePath || '').split('/');
    if (parts.length < 4) return false;
    const projectId = parts[1];
    const fileName = parts[parts.length - 1];
    const all = await getAllProjectAssets(projectId);
    const found = all.find(r => r.storagePath === storagePath || r.fileName === fileName);
    if (found) {
      await deleteAssetRecord(projectId, found.assetId);
      return true;
    }
    return false;
  }

  async function saveAssetMetadata(projectId, assetId, metadata) {
    const record = await getAssetById(projectId, assetId);
    if (!record) {
      console.warn('[LocalStorage] Metadata senza blob per asset:', assetId);
      return false;
    }
    Object.assign(record, {
      name: metadata.name || record.name,
      type: metadata.type || record.type,
      publicUrl: getBlobUrl(record)
    });
    await putAsset(record);
    return true;
  }

  async function getAssetMetadata(projectId, assetId) {
    const record = await getAssetById(projectId, assetId);
    if (!record) return null;
    return {
      assetId: record.assetId,
      name: record.name,
      type: record.type,
      storagePath: record.storagePath,
      fileName: record.fileName,
      publicUrl: getBlobUrl(record),
      subfolder: record.subfolder,
      storageProvider: 'local'
    };
  }

  async function listProjectAssetMetadata(projectId) {
    const all = await getAllProjectAssets(projectId);
    return all.map(r => ({
      assetId: r.assetId,
      name: r.name,
      type: r.type,
      storagePath: r.storagePath,
      fileName: r.fileName,
      publicUrl: getBlobUrl(r),
      subfolder: r.subfolder,
      storageProvider: 'local'
    }));
  }

  async function blobToBase64(blob) {
    if (window.AmiantoAmnt && window.AmiantoAmnt.blobToBase64) {
      return window.AmiantoAmnt.blobToBase64(blob);
    }
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

  async function exportAllAssetsForProject(projectId) {
    const records = await getAllProjectAssets(projectId);
    const assets = [];
    for (const record of records) {
      if (!record.blob) continue;
      const data = await blobToBase64(record.blob);
      assets.push({
        assetId: record.assetId,
        fileName: record.fileName,
        mimeType: record.mimeType || record.blob.type || 'application/octet-stream',
        category: record.category || record.type,
        subfolder: record.subfolder || null,
        name: record.name || record.fileName,
        data
      });
    }
    return assets;
  }

  async function importAssetsFromPackage(projectId, assets) {
    if (!Array.isArray(assets) || assets.length === 0) return 0;
    let count = 0;
    for (const entry of assets) {
      if (!entry || !entry.assetId || !entry.data) continue;
      const mime = entry.mimeType || 'application/octet-stream';
      const blob = (window.AmiantoAmnt && window.AmiantoAmnt.base64ToBlob)
        ? window.AmiantoAmnt.base64ToBlob(entry.data, mime)
        : (() => {
          const binary = atob(entry.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: mime });
        })();
      const fileName = entry.fileName || entry.name || `${entry.assetId}.bin`;
      const file = new File([blob], fileName, { type: mime });
      await uploadAsset(
        file,
        projectId,
        entry.category || entry.type || 'resource',
        entry.assetId,
        true,
        entry.fileName,
        entry.subfolder || null
      );
      count++;
    }
    return count;
  }

  const api = {
    init,
    isAvailable,
    uploadAsset,
    getAssetPublicUrl,
    resolveAssetUrl,
    deleteAsset,
    deleteProjectFolder,
    deleteCharacterFolder,
    getProjectStorageSize,
    getFolderForType: getSupabaseFolderForType,
    buildStoragePath,
    listProjectResources,
    listProjectAudio,
    listImagesInFolder,
    listMediaInFolder,
    deleteFileByPath,
    saveAssetMetadata,
    getAssetMetadata,
    listProjectAssetMetadata,
    exportAllAssetsForProject,
    importAssetsFromPackage,
    IMAGE_FILE_PATTERN,
    AUDIO_FILE_PATTERN
  };

  window.assetStorage = api;

  init().catch(err => console.error('[LocalStorage] Errore init:', err));
})();
