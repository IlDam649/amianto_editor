/**
 * Amianto Editor — Resources (centralized file browser on Supabase Storage)
 * Import images into Resources, then assign them from other editors.
 */
(function () {
  'use strict';

  let deps = {
    getProjectId: () => null,
    uploadImage: null,
    saveAssetMetadata: null,
    deleteFirestoreAsset: null,
    showNotification: (msg) => console.log(msg),
    generateAssetId: () => 'asset_' + Date.now()
  };

  const state = {
    entries: [],
    filtered: [],
    selectedIds: new Set(),
    loading: false,
    picker: null,
    activeSubTab: 'images'
  };

  const soundState = {
    entries: [],
    filtered: [],
    selectedIds: new Set(),
    loading: false,
    previewAudio: null
  };

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getProjectId() {
    return deps.getProjectId ? deps.getProjectId() : null;
  }

  async function mergeFirestoreMetadata(projectId, storageEntries, assetType = 'resource') {
    if (!window.firebaseDB || !window.firebaseAuth || !window.firebaseAuth.currentUser) {
      return storageEntries;
    }
    try {
      const userId = window.firebaseAuth.currentUser.uid;
      const snap = await window.firebaseDB
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('assets')
        .where('type', '==', assetType)
        .get();

      const metaById = new Map();
      snap.forEach(doc => {
        const d = doc.data();
        const id = d.assetId || doc.id;
        metaById.set(id, d);
      });

      return storageEntries.map(entry => {
        const meta = metaById.get(entry.assetId);
        if (!meta) return entry;
        return {
          ...entry,
          displayName: meta.name || entry.name,
          publicUrl: meta.publicUrl || entry.publicUrl,
          firestoreId: meta.assetId || entry.assetId
        };
      });
    } catch (err) {
      console.warn('[Resources] Could not load Firestore metadata:', err);
      return storageEntries;
    }
  }

  async function loadResources() {
    const projectId = getProjectId();
    const grid = document.getElementById('resources-grid');
    const status = document.getElementById('resources-status');

    if (!projectId) {
      state.entries = [];
      state.filtered = [];
      if (status) status.textContent = 'Open a project to manage resources.';
      if (grid) grid.innerHTML = '<div class="resources-empty">No project open</div>';
      return [];
    }

    if (!window.supabaseStorage || !window.supabaseStorage.isAvailable()) {
      if (status) status.textContent = 'Supabase Storage is not configured.';
      return [];
    }

    state.loading = true;
    if (status) status.textContent = 'Loading images from Supabase...';
    if (grid) grid.innerHTML = '<div class="resources-empty"><div class="spinner-border spinner-border-sm text-success"></div> Loading...</div>';

    try {
      let entries = await window.supabaseStorage.listProjectResources(projectId);
      entries = await mergeFirestoreMetadata(projectId, entries);
      entries.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
      state.entries = entries;
      applyResourcesFilter();
      if (status) {
        status.textContent = entries.length
          ? `${entries.length} image(s) in Resources`
          : 'No images yet. Use Import to add some.';
      }
      return entries;
    } catch (err) {
      console.error('[Resources] Load error:', err);
      if (status) status.textContent = 'Load error: ' + err.message;
      return [];
    } finally {
      state.loading = false;
    }
  }

  function applyResourcesFilter() {
    const q = (document.getElementById('resources-search')?.value || '').trim().toLowerCase();
    state.filtered = !q
      ? [...state.entries]
      : state.entries.filter(e =>
          (e.displayName || e.name || '').toLowerCase().includes(q) ||
          (e.relativePath || '').toLowerCase().includes(q)
        );
    renderResourcesGrid(state.filtered, 'resources-grid');
    const countEl = document.getElementById('resources-count');
    if (countEl) countEl.textContent = state.filtered.length + ' / ' + state.entries.length;
  }

  function getInspectorEls() {
    return {
      empty: document.getElementById('resources-inspector-empty'),
      emptyIcon: document.getElementById('resources-inspector-empty-icon'),
      emptyText: document.getElementById('resources-inspector-empty-text'),
      imagePanel: document.getElementById('resources-inspector-image'),
      soundPanel: document.getElementById('resources-inspector-sound'),
      img: document.getElementById('resources-inspector-img'),
      name: document.getElementById('resources-inspector-name'),
      dimensions: document.getElementById('resources-inspector-dimensions'),
      size: document.getElementById('resources-inspector-size'),
      id: document.getElementById('resources-inspector-id'),
      soundName: document.getElementById('resources-inspector-sound-name'),
      soundSize: document.getElementById('resources-inspector-sound-size'),
      soundId: document.getElementById('resources-inspector-sound-id'),
      audio: document.getElementById('resources-inspector-audio'),
      playBtn: document.getElementById('resources-inspector-play-btn')
    };
  }

  function clearResourceInspector() {
    const els = getInspectorEls();
    if (!els.empty) return;
    els.empty.hidden = false;
    if (els.imagePanel) els.imagePanel.hidden = true;
    if (els.soundPanel) els.soundPanel.hidden = true;
    if (els.audio) {
      els.audio.pause();
      els.audio.removeAttribute('src');
    }
    if (els.img) els.img.removeAttribute('src');
  }

  function setInspectorEmptyForTab(tab) {
    const els = getInspectorEls();
    if (!els.empty) return;
    const isSound = tab === 'sounds';
    if (els.emptyIcon) {
      els.emptyIcon.className = isSound ? 'fas fa-music' : 'fas fa-image';
    }
    if (els.emptyText) {
      els.emptyText.textContent = isSound
        ? 'Select an audio file in the grid to preview it here.'
        : 'Select an image in the grid to preview it here.';
    }
    clearResourceInspector();
  }

  function showImageInspector(entry) {
    const els = getInspectorEls();
    if (!els.empty || !entry) return;

    els.empty.hidden = true;
    if (els.soundPanel) els.soundPanel.hidden = true;
    if (els.imagePanel) els.imagePanel.hidden = false;

    const label = entry.displayName || entry.name || '—';
    if (els.name) els.name.textContent = label;
    if (els.size) els.size.textContent = formatBytes(entry.size);
    if (els.id) els.id.textContent = entry.assetId || '—';
    if (els.dimensions) els.dimensions.textContent = 'Loading...';

    if (els.img && entry.publicUrl) {
      els.img.alt = label;
      els.img.onload = () => {
        if (els.dimensions && els.img) {
          els.dimensions.textContent = `${els.img.naturalWidth} × ${els.img.naturalHeight} px`;
        }
      };
      els.img.onerror = () => {
        if (els.dimensions) els.dimensions.textContent = '—';
      };
      els.img.src = entry.publicUrl;
    }
  }

  function showSoundInspector(entry) {
    const els = getInspectorEls();
    if (!els.empty || !entry) return;

    els.empty.hidden = true;
    if (els.imagePanel) els.imagePanel.hidden = true;
    if (els.soundPanel) els.soundPanel.hidden = false;

    const label = entry.displayName || entry.name || '—';
    if (els.soundName) els.soundName.textContent = label;
    if (els.soundSize) els.soundSize.textContent = formatBytes(entry.size);
    if (els.soundId) els.soundId.textContent = entry.assetId || '—';
    if (els.audio && entry.publicUrl) {
      els.audio.src = entry.publicUrl;
      els.audio.load();
    }
  }

  function updateResourceInspector(entry, kind) {
    if (!entry) {
      setInspectorEmptyForTab(kind === 'sound' ? 'sounds' : 'images');
      return;
    }
    if (kind === 'sound') {
      showSoundInspector(entry);
    } else {
      showImageInspector(entry);
    }
  }

  function showResourceSubTab(tabId) {
    const tab = tabId === 'sounds' ? 'sounds' : 'images';
    state.activeSubTab = tab;

    const imagesPane = document.getElementById('resources-images-pane');
    const soundsPane = document.getElementById('resources-sounds-pane');
    if (imagesPane) imagesPane.style.display = tab === 'images' ? 'flex' : 'none';
    if (soundsPane) soundsPane.style.display = tab === 'sounds' ? 'flex' : 'none';

    document.querySelectorAll('[data-resource-tab]').forEach(btn => {
      const isActive = btn.getAttribute('data-resource-tab') === tab;
      if (btn.classList.contains('nav-link')) {
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      } else {
        btn.classList.toggle('active', isActive);
      }
    });

    setInspectorEmptyForTab(tab);

    if (tab === 'sounds') {
      loadSounds();
    } else {
      loadResources();
    }
  }

  async function loadSounds() {
    const projectId = getProjectId();
    const grid = document.getElementById('sounds-grid');
    const status = document.getElementById('sounds-status');

    if (!projectId) {
      soundState.entries = [];
      soundState.filtered = [];
      if (status) status.textContent = 'Open a project to manage sounds.';
      if (grid) grid.innerHTML = '<div class="resources-empty">No project open</div>';
      return [];
    }

    if (!window.supabaseStorage?.listProjectAudio) {
      if (status) status.textContent = 'Supabase Storage is not configured.';
      return [];
    }

    soundState.loading = true;
    if (status) status.textContent = 'Loading audio from Supabase...';
    if (grid) grid.innerHTML = '<div class="resources-empty"><div class="spinner-border spinner-border-sm text-success"></div> Loading...</div>';

    try {
      let entries = await window.supabaseStorage.listProjectAudio(projectId);
      entries = await mergeFirestoreMetadata(projectId, entries, 'audio');
      entries.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
      soundState.entries = entries;
      applySoundsFilter();
      if (status) {
        status.textContent = entries.length
          ? `${entries.length} audio file(s) in project`
          : 'No sounds yet. Use Import to add some.';
      }
      return entries;
    } catch (err) {
      console.error('[Resources] Errore caricamento audio:', err);
      if (status) status.textContent = 'Error: ' + err.message;
      return [];
    } finally {
      soundState.loading = false;
    }
  }

  function applySoundsFilter() {
    const q = (document.getElementById('sounds-search')?.value || '').trim().toLowerCase();
    soundState.filtered = !q
      ? [...soundState.entries]
      : soundState.entries.filter(e =>
          (e.displayName || e.name || '').toLowerCase().includes(q) ||
          (e.relativePath || '').toLowerCase().includes(q)
        );
    renderSoundsGrid(soundState.filtered);
    const countEl = document.getElementById('sounds-count');
    if (countEl) countEl.textContent = soundState.filtered.length + ' / ' + soundState.entries.length;
  }

  function stopSoundPreview() {
    if (soundState.previewAudio) {
      soundState.previewAudio.pause();
      soundState.previewAudio = null;
    }
  }

  function playSoundPreview(entry) {
    if (!entry?.publicUrl) return;
    stopSoundPreview();
    const audio = new Audio(entry.publicUrl);
    soundState.previewAudio = audio;
    audio.play().catch(() => {
      deps.showNotification('Could not play audio file', 'warning');
    });
  }

  function renderSoundsGrid(entries) {
    const grid = document.getElementById('sounds-grid');
    if (!grid) return;

    if (!entries.length) {
      grid.innerHTML = '<div class="resources-empty text-muted">No sounds found</div>';
      return;
    }

    grid.innerHTML = '';
    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'resource-card resource-sound-card';
      card.dataset.assetId = entry.assetId;
      card.title = entry.displayName || entry.name;

      if (soundState.selectedIds.has(entry.assetId)) {
        card.classList.add('selected');
      }

      const thumb = document.createElement('div');
      thumb.className = 'resource-thumb';
      thumb.innerHTML = '<i class="fas fa-volume-up" aria-hidden="true"></i>';

      const meta = document.createElement('div');
      meta.className = 'resource-meta';
      meta.innerHTML = `
        <span class="resource-name">${escapeHtml(entry.displayName || entry.name)}</span>
        <span class="resource-size">${formatBytes(entry.size)}</span>
      `;

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'btn btn-outline-success btn-sm resource-play-btn w-100';
      playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSoundPreview(entry);
      });

      card.appendChild(thumb);
      card.appendChild(meta);
      card.appendChild(playBtn);

      card.addEventListener('click', () => {
        soundState.selectedIds.clear();
        soundState.selectedIds.add(entry.assetId);
        grid.querySelectorAll('.resource-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        updateResourceInspector(entry, 'sound');
      });

      grid.appendChild(card);
    });

    if (soundState.selectedIds.size === 1) {
      const selectedId = soundState.selectedIds.values().next().value;
      const selectedEntry = soundState.entries.find(e => e.assetId === selectedId);
      if (selectedEntry) updateResourceInspector(selectedEntry, 'sound');
    }
  }

  function renderResourcesGrid(entries, containerId, options = {}) {
    const grid = document.getElementById(containerId);
    if (!grid) return;

    const { pickerMode = false, multi = false } = options;

    if (!entries.length) {
      grid.innerHTML = '<div class="resources-empty text-muted">No images found</div>';
      return;
    }

    grid.innerHTML = '';
    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'resource-card';
      card.dataset.assetId = entry.assetId;
      card.title = entry.displayName || entry.name;

      if (pickerMode && state.picker && state.picker.selected.has(entry.assetId)) {
        card.classList.add('selected');
      } else if (!pickerMode && state.selectedIds.has(entry.assetId)) {
        card.classList.add('selected');
      }

      const thumb = document.createElement('div');
      thumb.className = 'resource-thumb';
      const img = document.createElement('img');
      img.src = entry.publicUrl;
      img.alt = entry.displayName || entry.name;
      img.loading = 'lazy';
      img.onerror = () => { thumb.classList.add('broken'); };
      thumb.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'resource-meta';
      meta.innerHTML = `
        <span class="resource-name">${escapeHtml(entry.displayName || entry.name)}</span>
        <span class="resource-size">${formatBytes(entry.size)}</span>
      `;

      card.appendChild(thumb);
      card.appendChild(meta);

      card.addEventListener('click', () => {
        if (pickerMode) {
          togglePickerSelection(entry.assetId, card, multi);
        } else {
          state.selectedIds.clear();
          state.selectedIds.add(entry.assetId);
          grid.querySelectorAll('.resource-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          updateResourceInspector(entry, 'image');
        }
      });

      grid.appendChild(card);
    });

    if (!pickerMode && containerId === 'resources-grid' && state.selectedIds.size === 1) {
      const selectedId = state.selectedIds.values().next().value;
      const selectedEntry = state.entries.find(e => e.assetId === selectedId);
      if (selectedEntry) updateResourceInspector(selectedEntry, 'image');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function togglePickerSelection(assetId, cardEl, multi) {
    if (!state.picker) return;
    if (multi) {
      if (state.picker.selected.has(assetId)) {
        state.picker.selected.delete(assetId);
        cardEl.classList.remove('selected');
      } else {
        state.picker.selected.add(assetId);
        cardEl.classList.add('selected');
      }
    } else {
      state.picker.selected.clear();
      state.picker.selected.add(assetId);
      document.querySelectorAll('#resource-picker-grid .resource-card').forEach(c => c.classList.remove('selected'));
      cardEl.classList.add('selected');
    }
    updatePickerSelectionLabel();
  }

  function updatePickerSelectionLabel() {
    const label = document.getElementById('resource-picker-selection');
    if (!label || !state.picker) return;
    const n = state.picker.selected.size;
    if (state.picker.multiple) {
      label.textContent = n
        ? `${n} image${n === 1 ? '' : 's'} selected`
        : 'No selection';
    } else {
      label.textContent = n ? '1 image selected' : 'No selection';
    }
  }

  function getVisiblePickerEntries() {
    if (!state.picker) return [];
    const searchEl = document.getElementById('resource-picker-search');
    return filterPickerEntries(state.picker.entries, searchEl?.value || '');
  }

  function setPickerMultiUi(options = {}) {
    const { multiple = false, hint = '' } = options;
    const hintEl = document.getElementById('resource-picker-hint');
    const multiActions = document.getElementById('resource-picker-multi-actions');
    const modalEl = document.getElementById('resourcePickerModal');

    if (hintEl) {
      if (multiple && hint) {
        hintEl.textContent = hint;
        hintEl.style.display = '';
      } else {
        hintEl.textContent = '';
        hintEl.style.display = 'none';
      }
    }
    if (multiActions) {
      multiActions.style.display = multiple ? '' : 'none';
    }
    if (modalEl) {
      modalEl.classList.toggle('resource-picker-multi', multiple);
    }
  }

  function selectAllVisibleInPicker() {
    if (!state.picker?.multiple) return;
    getVisiblePickerEntries().forEach(entry => state.picker.selected.add(entry.assetId));
    renderPickerGrid(getVisiblePickerEntries());
    updatePickerSelectionLabel();
  }

  function clearPickerSelection() {
    if (!state.picker) return;
    state.picker.selected.clear();
    renderPickerGrid(getVisiblePickerEntries());
    updatePickerSelectionLabel();
  }

  function entryByAssetId(assetId) {
    return state.entries.find(e => e.assetId === assetId) || state.picker?.entries?.find(e => e.assetId === assetId);
  }

  function toResourcePayload(entry) {
    const projectId = getProjectId();
    return {
      assetId: entry.assetId,
      fileName: entry.name,
      publicUrl: entry.publicUrl,
      storagePath: entry.storagePath,
      displayName: entry.displayName || entry.name,
      projectId,
      type: 'resource',
      subfolder: null
    };
  }

  async function uploadResourceFile(file) {
    const projectId = getProjectId();
    if (!projectId) {
      deps.showNotification('Open a project before importing', 'warning');
      return null;
    }
    if (!deps.uploadImage) {
      deps.showNotification('Upload is not available', 'error');
      return null;
    }

    const assetId = deps.generateAssetId();
    deps.showNotification('Importing to Resources...', 'info');

    try {
      const { assetId: finalId, downloadURL, fileName } = await deps.uploadImage(file, projectId, 'resource', {
        assetId,
        overwriteExisting: false,
        subfolder: null
      });

      await loadResources();
      const entry = state.entries.find(e => e.assetId === finalId) || {
        assetId: finalId,
        name: fileName,
        displayName: file.name,
        publicUrl: downloadURL,
        storagePath: null,
        relativePath: 'resources/' + fileName
      };

      deps.showNotification('Image imported to Resources', 'success');
      if (typeof deps.updateProjectSizeIndicator === 'function') {
        deps.updateProjectSizeIndicator();
      }
      return toResourcePayload(entry);
    } catch (err) {
      console.error('[Resources] Upload failed:', err);
      deps.showNotification('Import failed: ' + err.message, 'error');
      return null;
    }
  }

  async function deleteSelectedResources() {
    const projectId = getProjectId();
    if (!projectId || !state.selectedIds.size) {
      deps.showNotification('Select at least one image to delete', 'warning');
      return;
    }

    if (!confirm(`Delete ${state.selectedIds.size} image(s) from Resources?`)) return;

    let deleted = 0;
    for (const assetId of state.selectedIds) {
      const entry = state.entries.find(e => e.assetId === assetId);
      if (!entry) continue;

      if (entry.storagePath && window.supabaseStorage.deleteFileByPath) {
        await window.supabaseStorage.deleteFileByPath(entry.storagePath);
      }

      if (deps.deleteFirestoreAsset) {
        await deps.deleteFirestoreAsset(projectId, assetId);
      }
      deleted++;
    }

    state.selectedIds.clear();
    setInspectorEmptyForTab('images');
    await loadResources();
    deps.showNotification(`Deleted ${deleted} resource(s)`, 'success');
    if (typeof deps.updateProjectSizeIndicator === 'function') {
      deps.updateProjectSizeIndicator();
    }
  }

  function triggerHiddenFileInput(multiple, onFiles) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = !!multiple;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length) onFiles(files);
    };
    input.click();
  }

  function triggerAudioFileInput(multiple, onFiles) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.webm';
    input.multiple = !!multiple;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length) onFiles(files);
    };
    input.click();
  }

  async function uploadSoundFile(file) {
    const projectId = getProjectId();
    if (!projectId) {
      deps.showNotification('Open a project before importing', 'warning');
      return null;
    }
    if (!deps.uploadImage) {
      deps.showNotification('Upload is not available', 'error');
      return null;
    }

    const assetId = deps.generateAssetId();
    deps.showNotification('Importing audio...', 'info');

    try {
      await deps.uploadImage(file, projectId, 'audio', {
        assetId,
        overwriteExisting: false,
        subfolder: null
      });
      await loadSounds();
      deps.showNotification('Audio imported', 'success');
      if (typeof deps.updateProjectSizeIndicator === 'function') {
        deps.updateProjectSizeIndicator();
      }
      return true;
    } catch (err) {
      console.error('[Resources] Upload audio fallito:', err);
      deps.showNotification('Import failed: ' + err.message, 'error');
      return null;
    }
  }

  async function deleteSelectedSounds() {
    const projectId = getProjectId();
    if (!projectId || !soundState.selectedIds.size) {
      deps.showNotification('Select at least one sound to delete', 'warning');
      return;
    }

    if (!confirm(`Delete ${soundState.selectedIds.size} audio file(s)?`)) return;

    let deleted = 0;
    for (const assetId of soundState.selectedIds) {
      const entry = soundState.entries.find(e => e.assetId === assetId);
      if (!entry) continue;

      if (entry.storagePath && window.supabaseStorage.deleteFileByPath) {
        await window.supabaseStorage.deleteFileByPath(entry.storagePath);
      }

      if (deps.deleteFirestoreAsset) {
        await deps.deleteFirestoreAsset(projectId, assetId);
      }
      deleted++;
    }

    soundState.selectedIds.clear();
    stopSoundPreview();
    setInspectorEmptyForTab('sounds');
    await loadSounds();
    deps.showNotification(`Deleted ${deleted} audio file(s)`, 'success');
    if (typeof deps.updateProjectSizeIndicator === 'function') {
      deps.updateProjectSizeIndicator();
    }
  }

  async function openPicker(options = {}) {
    const {
      title = 'Select image from Resources',
      multiple = false,
      allowUpload = true,
      hint = ''
    } = options;

    const projectId = getProjectId();
    if (!projectId) {
      deps.showNotification('Open a project to select resources', 'warning');
      return multiple ? [] : null;
    }

    const modalEl = document.getElementById('resourcePickerModal');
    if (!modalEl || typeof bootstrap === 'undefined') {
      deps.showNotification('Resource picker is not available', 'error');
      return multiple ? [] : null;
    }

    const titleEl = document.getElementById('resource-picker-title');
    const searchEl = document.getElementById('resource-picker-search');
    const uploadBtn = document.getElementById('resource-picker-upload-btn');
    const confirmBtn = document.getElementById('resource-picker-confirm-btn');
    const selectAllBtn = document.getElementById('resource-picker-select-all-btn');
    const clearBtn = document.getElementById('resource-picker-clear-btn');

    if (titleEl) titleEl.textContent = title;
    if (uploadBtn) uploadBtn.style.display = allowUpload ? '' : 'none';
    if (confirmBtn) {
      confirmBtn.textContent = multiple ? 'Add selection' : 'Use image';
    }
    setPickerMultiUi({ multiple, hint });

    const entries = await loadResourcesForPicker();
    state.picker = {
      selected: new Set(),
      entries,
      multiple,
      filter: '',
      hint
    };

    renderPickerGrid(entries);
    updatePickerSelectionLabel();
    if (searchEl) searchEl.value = '';

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const cleanup = () => {
        confirmBtn?.removeEventListener('click', onConfirm);
        uploadBtn?.removeEventListener('click', onUpload);
        searchEl?.removeEventListener('input', onSearch);
        selectAllBtn?.removeEventListener('click', onSelectAll);
        clearBtn?.removeEventListener('click', onClear);
        modalEl.removeEventListener('hidden.bs.modal', onHidden);
        state.picker = null;
        setPickerMultiUi({ multiple: false });
      };

      const onHidden = () => {
        cleanup();
        finish(multiple ? [] : null);
      };

      const onConfirm = () => {
        const selected = Array.from(state.picker.selected)
          .map(id => entryByAssetId(id))
          .filter(Boolean)
          .map(toResourcePayload);

        if (!selected.length) {
          deps.showNotification(
            multiple ? 'Select at least one image' : 'Select an image',
            'warning'
          );
          return;
        }

        cleanup();
        modal.hide();
        finish(multiple ? selected : selected[0]);
      };

      const onUpload = () => {
        triggerHiddenFileInput(multiple, async (files) => {
          for (const file of files) {
            await uploadResourceFile(file);
          }
          const refreshed = await loadResourcesForPicker();
          state.picker.entries = refreshed;
          renderPickerGrid(filterPickerEntries(refreshed, searchEl?.value || ''));
        });
      };

      const onSearch = () => {
        renderPickerGrid(filterPickerEntries(state.picker.entries, searchEl.value));
      };

      const onSelectAll = () => selectAllVisibleInPicker();
      const onClear = () => clearPickerSelection();

      confirmBtn?.addEventListener('click', onConfirm);
      uploadBtn?.addEventListener('click', onUpload);
      searchEl?.addEventListener('input', onSearch);
      selectAllBtn?.addEventListener('click', onSelectAll);
      clearBtn?.addEventListener('click', onClear);
      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });

      modal.show();
    });
  }

  async function loadResourcesForPicker() {
    if (!window.supabaseStorage?.listProjectResources) return [];
    const projectId = getProjectId();
    let entries = await window.supabaseStorage.listProjectResources(projectId);
    return mergeFirestoreMetadata(projectId, entries);
  }

  function filterPickerEntries(entries, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      (e.displayName || e.name || '').toLowerCase().includes(q) ||
      (e.relativePath || '').toLowerCase().includes(q)
    );
  }

  function renderPickerGrid(entries) {
    renderResourcesGrid(entries, 'resource-picker-grid', {
      pickerMode: true,
      multi: state.picker?.multiple
    });
  }

  function setupResourcesTabUI() {
    const search = document.getElementById('resources-search');
    const btnRefresh = document.getElementById('btn-resources-refresh');
    const btnImport = document.getElementById('btn-resources-import');
    const btnDelete = document.getElementById('btn-resources-delete');

    if (search) {
      search.addEventListener('input', applyResourcesFilter);
    }
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => loadResources());
    }
    if (btnImport) {
      btnImport.addEventListener('click', () => {
        triggerHiddenFileInput(true, async (files) => {
          for (const file of files) {
            await uploadResourceFile(file);
          }
        });
      });
    }
    if (btnDelete) {
      btnDelete.addEventListener('click', deleteSelectedResources);
    }

    const soundsSearch = document.getElementById('sounds-search');
    const btnSoundsRefresh = document.getElementById('btn-sounds-refresh');
    const btnSoundsImport = document.getElementById('btn-sounds-import');
    const btnSoundsDelete = document.getElementById('btn-sounds-delete');

    if (soundsSearch) {
      soundsSearch.addEventListener('input', applySoundsFilter);
    }
    if (btnSoundsRefresh) {
      btnSoundsRefresh.addEventListener('click', () => loadSounds());
    }
    if (btnSoundsImport) {
      btnSoundsImport.addEventListener('click', () => {
        triggerAudioFileInput(true, async (files) => {
          for (const file of files) {
            await uploadSoundFile(file);
          }
        });
      });
    }
    if (btnSoundsDelete) {
      btnSoundsDelete.addEventListener('click', deleteSelectedSounds);
    }

    document.querySelectorAll('[data-resource-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        showResourceSubTab(btn.getAttribute('data-resource-tab'));
      });
    });

    const inspectorPlayBtn = document.getElementById('resources-inspector-play-btn');
    if (inspectorPlayBtn) {
      inspectorPlayBtn.addEventListener('click', () => {
        const els = getInspectorEls();
        if (els.audio?.src) {
          els.audio.play().catch(() => {
            deps.showNotification('Could not play audio file', 'warning');
          });
          return;
        }
        const assetId = soundState.selectedIds.values().next().value;
        const entry = soundState.entries.find(e => e.assetId === assetId);
        if (entry) playSoundPreview(entry);
      });
    }

    document.addEventListener('tabChanged', (e) => {
      if (e.detail?.currentTab === 'resources') {
        showResourceSubTab(state.activeSubTab);
      } else {
        stopSoundPreview();
        const els = getInspectorEls();
        if (els.audio) {
          els.audio.pause();
        }
      }
    });

    setInspectorEmptyForTab('images');
  }

  window.initAmiantoResources = function (dependencies) {
    deps = { ...deps, ...dependencies };
    setupResourcesTabUI();
  };

  /** Snapshot per Play Test / runtime (nomi file → assetId + publicUrl). */
  function getResourcesCatalog() {
    return state.entries.map(entry => ({
      assetId: entry.assetId,
      name: entry.name || '',
      displayName: entry.displayName || entry.name || '',
      fileName: entry.fileName || entry.name || '',
      publicUrl: entry.publicUrl || null
    }));
  }

  window.amiantoResources = {
    refresh: loadResources,
    refreshSounds: loadSounds,
    getCatalog: getResourcesCatalog,
    showSubTab: showResourceSubTab,
    pick: openPicker,
    upload: uploadResourceFile,
    uploadSound: uploadSoundFile,
    loadImageFromResource: async function (resource) {
      if (!resource || !resource.publicUrl) return null;
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = resource.publicUrl;
      });
    },
    registerImageAsset: function (img, resource) {
      if (!img || !resource || !window.amiantoImageAssetMap) return;
      window.amiantoImageAssetMap.set(img, {
        assetId: resource.assetId,
        type: 'resource',
        projectId: resource.projectId,
        fileName: resource.fileName,
        subfolder: null
      });
    }
  };
})();
