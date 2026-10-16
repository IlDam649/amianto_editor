// main.js

/* ============================
   APP STATE - UNICA FONTE DI VERITÃ€
   ============================ */

/**
 * Stato globale dell'applicazione
 * Questa Ã¨ l'UNICA fonte di veritÃ  per:
 * - utente loggato
 * - lista progetti
 * - stato di caricamento
 * - errori
 */
const AppState = {
  initialized: false,
  loading: false,
  user: null,
  projects: [],
  error: null
};

/**
 * Aggiorna lo stato dell'app e notifica eventuali listener
 * @param {Object} updates - Oggetto con le proprietÃ  da aggiornare
 */
function updateAppState(updates) {
  Object.assign(AppState, updates);
  
  // Log per debug
  if (updates.loading !== undefined) {
    console.log(`[AppState] Loading: ${updates.loading}`);
  }
  if (updates.user !== undefined) {
    console.log(`[AppState] User: ${updates.user ? updates.user.username : 'null'}`);
  }
  if (updates.projects !== undefined) {
    console.log(`[AppState] Projects: ${updates.projects.length}`);
  }
  if (updates.initialized !== undefined) {
    console.log(`[AppState] Initialized: ${updates.initialized}`);
  }
  if (updates.error !== undefined && updates.error !== null) {
    console.error(`[AppState] Error:`, updates.error);
  }
}

function normalizeProject(project, index = null) {
  if (!project || typeof project !== 'object') {
    return {
      settings: { name: `Project ${index !== null ? index + 1 : 'Unknown'}` },
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'unknown'
    };
  }

  const settings = project.settings
    ? { ...project.settings }
    : { name: project.name || `Project ${index !== null ? index + 1 : 'Unknown'}` };
  const stableId = project.id || settings.id || normalizeProjectIdFromName(settings.name);
  if (stableId) settings.id = stableId;

  return {
    settings,
    updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
    createdAt: project.createdAt || project.updatedAt || new Date().toISOString(),
    source: project.source || 'unknown',
    id: stableId || null,
    filePath: project.filePath || null
  };
}

function normalizeProjectIdFromName(name) {
  if (!name) return null;
  return String(name).replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
}

function loadProjectsFromCache(username) {
  if (!username) {
    console.warn('[Cache] Username non disponibile per caricamento cache');
    return [];
  }

  try {
    const cacheKey = `amiantoProjects_${username}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) return [];

    const projects = JSON.parse(cachedData);
    if (!Array.isArray(projects)) {
      console.error('[Cache] Dati cache non sono un array:', typeof projects);
      return [];
    }

    return projects.map((p, i) => normalizeProject(p, i));
  } catch (error) {
    console.error('[Cache] Errore parsing cache:', error);
    return [];
  }
}

function saveProjectsToCache(username, projects) {
  if (!username) {
    console.warn('[Cache] Username non disponibile per salvataggio cache');
    return;
  }
  if (!Array.isArray(projects)) {
    console.error('[Cache] Tentativo di salvare dati non-array in cache');
    return;
  }

  try {
    localStorage.setItem(`amiantoProjects_${username}`, JSON.stringify(projects));
  } catch (error) {
    console.error('[Cache] Errore salvataggio cache:', error);
  }
}

function getLocalUser() {
  if (typeof window.getAmiantoLocalUser === 'function') {
    return window.getAmiantoLocalUser();
  }
  return { username: 'Local', email: '', uid: 'local' };
}

/**
 * Bootstrap globale dell'applicazione
 * 
 * ResponsabilitÃ :
 * - inizializzare l'utente locale
 * - caricare i progetti da cache locale (localStorage)
 * - popolare AppState.projects
 * - impostare AppState.initialized = true
 * 
 * La UI NON deve essere utilizzabile prima che bootstrapApp sia completata.
 * 
 * @returns {Promise<void>}
 */
async function bootstrapApp() {
  console.log('========================================');
  console.log('ðŸš€ BOOTSTRAP START');
  console.log('========================================');

  updateAppState({ loading: true, error: null });
  if (typeof window.showLoadingOverlay === 'function') {
    window.showLoadingOverlay('Loading application...');
  }

  try {
    const mappedUser = getLocalUser();
    updateAppState({ user: mappedUser });
    const projects = loadProjectsFromCache(mappedUser.username);
    updateAppState({
      projects,
      loading: false,
      initialized: true
    });
    console.log(`[BOOTSTRAP] âœ… ${projects.length} progetti locali`);
  } catch (error) {
    console.error('[BOOTSTRAP] âŒ Errore:', error);
    updateAppState({
      loading: false,
      initialized: true,
      error: error.message || 'Error during bootstrap'
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {

  /* ============================
     PART 1 - Sistema Tabs Avanzato
     ============================ */
  const sectionButtons = document.querySelectorAll(".section-btn[data-section]");
  const playtestBtn = document.getElementById('nav-playtest-btn');
  const sections = document.querySelectorAll(".section");
  
  // Stato globale per le tabs
  const tabState = {
    currentTab: null,
    tabHistory: [],
    notifications: new Map()
  };

  function launchPlaytest() {
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProjectName) {
      showNotification('Please select or create a project first', 'warning');
      return;
    }
    if (typeof window.startPlayTest === 'function') {
      window.startPlayTest();
    }
  }

  // Funzione migliorata per mostrare una sezione
  function showSectionById(id, addToHistory = true) {
    if (!id || tabState.currentTab === id) return;
    
    // Blocca cambio tab se non c'Ã¨ progetto aperto (tranne Projects e Docs)
    if (id !== 'projects' && id !== 'docs') {
      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (!activeProjectName) {
        showNotification('Please select or create a project first', 'warning');
        // Torna alla tab Projects
        const projectsButton = document.querySelector(`[data-section="projects"]`);
        if (projectsButton && !projectsButton.disabled) {
          projectsButton.click();
        }
        return;
      }
    }
    
    const targetSection = document.getElementById(id);
    const targetButton = document.querySelector(`[data-section="${id}"]`);
    
    if (!targetSection || !targetButton) {
      console.warn(`Section "${id}" not found`);
      return;
    }
    
    // Blocca cambio se il bottone Ã¨ disabilitato
    if (targetButton.disabled) {
      return;
    }

    // Add loading state
    targetSection.classList.add('loading');
    
    // Remove active state from all sections
    sections.forEach(sec => {
      sec.classList.remove("active", "loading");
    });
    sectionButtons.forEach(btn => {
      btn.classList.remove("active-btn");
    });

    // Add active state to target section
    setTimeout(() => {
      targetSection.classList.add("active");
      targetButton.classList.add("active-btn");
      targetSection.classList.remove('loading');
      
      // Update state
      if (addToHistory && tabState.currentTab) {
        tabState.tabHistory.push(tabState.currentTab);
        // Keep only the last 10 elements in history
        if (tabState.tabHistory.length > 10) {
          tabState.tabHistory.shift();
        }
      }
      tabState.currentTab = id;
      
      // Trigger custom event
      document.dispatchEvent(new CustomEvent('tabChanged', {
        detail: { 
          currentTab: id, 
          previousTab: tabState.tabHistory[tabState.tabHistory.length - 1] 
        }
      }));
      
      // Focus management for accessibility
      targetButton.focus();
    }, 150);
  }

  // Keyboard navigation
  function handleKeyboardNavigation(e) {
    const currentIndex = Array.from(sectionButtons).findIndex(btn => 
      btn.classList.contains('active-btn'));
    
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;

    switch(e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        targetIndex = currentIndex > 0 ? currentIndex - 1 : sectionButtons.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        targetIndex = currentIndex < sectionButtons.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        e.preventDefault();
        targetIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        targetIndex = sectionButtons.length - 1;
        break;
      case 'Escape':
        // Return to previous tab if there's a history
        if (tabState.tabHistory.length > 0) {
          e.preventDefault();
          const previousTab = tabState.tabHistory.pop();
          showSectionById(previousTab, false);
        }
        break;
    }

    if (targetIndex !== currentIndex) {
      const targetButton = sectionButtons[targetIndex];
      const targetSection = targetButton.getAttribute("data-section");
      showSectionById(targetSection);
    }
  }

  // Tab notification management
  function setTabNotification(tabId, count = 1) {
    const button = document.querySelector(`[data-section="${tabId}"]`);
    if (!button) return;

    // Remove existing notification
    const existingNotification = button.querySelector('.tab-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    if (count > 0) {
      const notification = document.createElement('span');
      notification.className = 'tab-notification';
      notification.textContent = count > 99 ? '99+' : count.toString();
      notification.setAttribute('aria-label', `${count} notifications`);
      button.style.position = 'relative';
      button.appendChild(notification);
      tabState.notifications.set(tabId, count);
    } else {
      tabState.notifications.delete(tabId);
    }
  }

  // Improved initialization
  function initializeTabs() {
    // Controlla se c'Ã¨ un progetto aperto e abilita/disabilita tab di conseguenza
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    enableOtherTabs(!!activeProjectName);
    
    // Find initial active tab
    const initiallyActiveBtn = document.querySelector(".section-btn.active-btn") || sectionButtons[0];
    if (initiallyActiveBtn) {
      const initialTab = initiallyActiveBtn.getAttribute("data-section");
      showSectionById(initialTab, false);
    }

    // Event listeners for buttons
    sectionButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const target = btn.getAttribute("data-section");
        if (!target) return;
        showSectionById(target);
      });

      // Support for keyboard navigation
      btn.addEventListener("keydown", handleKeyboardNavigation);
    });

    if (playtestBtn) {
      playtestBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (playtestBtn.disabled) return;
        launchPlaytest();
      });
    }

    // Support for keyboard shortcuts (Ctrl + number)
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.key === '9') {
        e.preventDefault();
        if (playtestBtn && !playtestBtn.disabled) {
          launchPlaytest();
        }
        return;
      }
      if (e.key === '8') {
        e.preventDefault();
        showSectionById('docs');
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < sectionButtons.length) {
          e.preventDefault();
          const targetSection = sectionButtons[index].getAttribute("data-section");
          showSectionById(targetSection);
        }
      }
    });

    // Resize handling for responsive
    window.addEventListener('resize', () => {
      // Update tab layout if necessary
      const activeTab = document.querySelector('.section.active');
      if (activeTab) {
        activeTab.style.minHeight = 'auto';
      }
    });
  }

  // Initialize tab system
  initializeTabs();

  // Listener per tabChanged - carica progetti quando si entra nella tab Projects
  document.addEventListener('tabChanged', async (e) => {
    const currentTab = e.detail?.currentTab;
    if (currentTab === 'projects') {
      await loadAndRenderProjectsTab();
    }
  });

  // Event listeners per pulsanti nella tab Projects
  // Usa un listener che si attiva dopo che il DOM Ã¨ caricato e le funzioni sono disponibili
  setTimeout(() => {
    // Pulsante Create Project
    const btnCreateProject = document.getElementById('btn-create-project-in-tab');
    if (btnCreateProject && !btnCreateProject.hasAttribute('data-listener-attached')) {
      btnCreateProject.setAttribute('data-listener-attached', 'true');
      btnCreateProject.addEventListener('click', async () => {
        try {
          const created = await window.createNewProject(null, true);
          if (created && created.ok) {
            await loadAndRenderProjectsTab();
          }
        } catch (error) {
          console.error('[ProjectsTab] Errore creazione progetto:', error);
          showNotification('Error creating project', 'error');
        }
      });
    }
    
    // Pulsante Load Project
    const btnLoadProject = document.getElementById('btn-load-project');
    if (btnLoadProject && !btnLoadProject.hasAttribute('data-listener-attached')) {
      btnLoadProject.setAttribute('data-listener-attached', 'true');
      btnLoadProject.addEventListener('click', async () => {
        btnLoadProject.disabled = true;
        try {
          await window.loadProjectFromFile();
        } catch (error) {
          if (error && error.name !== 'AbortError') {
            console.error('[ProjectsTab] Errore caricamento progetto:', error);
            showNotification('Error loading project', 'error');
          }
        } finally {
          btnLoadProject.disabled = false;
        }
      });
    }

    // Export Game: bound via onclick on #btn-export-standalone (avoids double-fire / missed setTimeout)
  }, 1000);

  // Expose global functions for external use
  window.__amiantoTabs = {
    showSection: showSectionById,
    setNotification: setTabNotification,
    getCurrentTab: () => tabState.currentTab,
    getTabHistory: () => [...tabState.tabHistory]
  };

  // Safe stub to avoid early ReferenceError when tabs fire before full initialization
  let updateCursorTargets = function() {}; // legacy no-op (cursors are per-category now)
  window.updateCursorTargets = updateCursorTargets;


  /* ============================
     PART 2 - Canvas & Layers
     ============================ */

  const canvas = document.getElementById("editorCanvas");
  if (!canvas) {
    console.error("Canvas with id 'editorCanvas' not found.");
    return;
  }
  const ctx = canvas.getContext("2d");

  // Rooms state: each room keeps its own layers and walkable
  let rooms = new Map();
  let currentRoomId = null;
  /** Incrementato a ogni cambio progetto: ignora callback async del caricamento precedente. */
  let projectLoadGeneration = 0;
  // convenient references to current room data
  let background = null;
  let foregrounds = [];
  let sceneObjects = [];
  let animationInstances = [];
  let selectedForegroundId = null;
  let selectedSceneObjectId = null;
  let selectedAnimationInstanceId = null;
  // GUI overlay: background image and button rectangles
  let guiBackground = null;
  let guiButtons = []; // { id, name, x, y, w, h, backgroundImage: Image|null, text: string }
  let selectedGuiButtonId = null;
  let isDrawingGuiButton = false;
  let guiDrawStart = null;
  let isDraggingGuiButton = false;
  let draggedGuiButton = null;
  let guiButtonDragOffset = { x: 0, y: 0 };
  let isResizingGuiButton = false;

  // Inventory editor (layout + items)
  let inventoryDefinition = {
    background: null,
    slots: [],
    displayMode: 'popup',
    popupEdgeHeight: 48,
    panel: null,
    toggleIcon: null,
    toggleIconBounds: null
  };
  let inventoryItems = []; // { id, name, scriptName, image: Image|null }
  let selectedInventorySlotId = null;
  let selectedInventoryItemId = null;
  let isDrawingInventorySlot = false;
  let inventorySlotDrawStart = null;
  let isDraggingInventorySlot = false;
  let isResizingInventorySlot = false;
  let draggedInventorySlot = null;
  let inventorySlotDragOffset = { x: 0, y: 0 };
  let resizeInventoryHandle = null;
  let pendingInventoryItemImage = null;

  function getEditorActiveTab() {
    return window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
  }

  function isRoomCanvasActive() {
    return getEditorActiveTab() === 'rooms';
  }

  function disableRoomCanvasEditing() {
    isDrawingWalkable = false;
    isDrawingHotspot = false;
    isDraggingWalkableVertex = false;
    isDraggingHotspotVertex = false;
    draggedWalkableVertexIndex = -1;
    draggedHotspotVertexIndex = -1;
    selectedWalkableVertexIndex = -1;
    selectedHotspotVertexIndex = -1;
    isDraggingObject = false;
    draggedObject = null;
    isDraggingAnimationInstance = false;
    draggedAnimationInstance = null;
    isDraggingScalingLine = false;
    draggedScalingLineType = null;
  }
  
  // Multiple GUI management
  let guis = []; // Array of GUI objects: { id, name, background, buttons }
  let currentGuiId = null;

  // Asset management: mappa per tracciare assetId associati alle immagini
  // Struttura: Map<Image, {assetId, type, projectId}>
  // Usata per serializzare assetId invece di dataURL
  const imageAssetMap = new Map();
  window.amiantoImageAssetMap = imageAssetMap;
  
  // Category cursors: one definition per interaction category
  // { id, category, cursorImage, actionText, scriptName, pivotX, pivotY }
  const CURSOR_CATEGORIES = ['default', 'look', 'use', 'talk', 'grab', 'exit', 'walk', 'wait', 'inactive'];
  const CURSOR_CATEGORY_LABELS = {
    default: 'default — normal pointer',
    look: 'look — examine',
    use: 'use — interact',
    talk: 'talk — speak',
    grab: 'grab — take / hold',
    exit: 'exit — leave room',
    walk: 'walk — move',
    wait: 'wait — busy',
    inactive: 'inactive — not interactive'
  };
  let contextualCursors = [];
  let selectedCursorId = null;
  let resizeHandle = null; // 'nw', 'ne', 'sw', 'se'
  // Walkable area polygon and visibility
  let walkableArea = [];
  let isDrawingWalkable = false;
  let showWalkable = true;
  let isDraggingWalkableVertex = false;
  let selectedWalkableVertexIndex = -1;
  let draggedWalkableVertexIndex = -1;

  // Hotspots (multiple polygons per room)
  // Each hotspot: { id, name, points: [{x,y}], visible (active/clickable), scripts }
  let hotspots = [];
  let activeHotspotId = null;
  let isDrawingHotspot = false;
  let showHotspots = true;
  let isDraggingHotspotVertex = false;
  let draggedHotspotVertexIndex = -1;
  let selectedHotspotVertexIndex = -1;

  // Character scaling system
  let scalingForegroundY = null; // Y coordinate for foreground (first plane) - max scale - must be BELOW background
  let scalingBackgroundY = null; // Y coordinate for background (second plane) - min scale - must be ABOVE foreground
  let isDraggingScalingLine = false;
  let draggedScalingLineType = null; // 'foreground' or 'background'
  let showScalingLines = true;
  let scalingMinScale = 0.5;
  let scalingMaxScale = 1.5;

  // Scene object drag & drop state
  let isDraggingObject = false;
  let draggedObject = null;
  let dragOffset = { x: 0, y: 0 };

  // Room animation catalog and editor preview
  const roomAnimationsCatalog = new Map(); // animId -> { id, name, fps, loop, layer, frames: [{ img, name, orderIndex }] }
  let selectedRoomAnimationId = null;
  let roomAnimationPreviewTimer = null;
  let roomAnimationPreviewIndex = 0;

  // Room animation instance drag state
  let isDraggingAnimationInstance = false;
  let draggedAnimationInstance = null;
  let animationInstanceDragOffset = { x: 0, y: 0 };
  
  // Character pivot management

  // Container for foreground layers list (in rooms tab)
  const fgListContainer = document.getElementById("foreground-list-container");
  if (!fgListContainer) {
    console.warn("foreground-list-container not found. Create it in the rooms tab to see the layer list.");
  }

  // Game viewport state (fixed dimensions for the actual game)
  let gameViewport = {
    width: 800,
    height: 600
  };

  // Editor visualization state (for editing purposes only)
  let editorState = {
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastPanX: 0,
    lastPanY: 0
  };

  // Letterbox offset to center game viewport in the CSS-sized canvas (rooms / inventory / characters)
  function getCanvasCenterOffset() {
    const rect = canvas.getBoundingClientRect();
    let centerOffsetX = 0;
    let centerOffsetY = 0;
    if (rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0) {
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const scaledContentWidth = gameViewport.width * editorState.zoom;
      const scaledContentHeight = gameViewport.height * editorState.zoom;
      const cssOffsetX = (rect.width - scaledContentWidth) / 2;
      const cssOffsetY = (rect.height - scaledContentHeight) / 2;
      centerOffsetX = cssOffsetX * scaleX;
      centerOffsetY = cssOffsetY * scaleY;
    }
    return { x: centerOffsetX, y: centerOffsetY };
  }

  function resetEditorViewCentered(options = {}) {
    const fit = options.fit === true;
    if (fit) {
      const container = document.getElementById('canvasContainer');
      if (container) {
        const containerWidth = container.clientWidth - 20;
        const containerHeight = container.clientHeight - 20;
        const zoomX = containerWidth / gameViewport.width;
        const zoomY = containerHeight / gameViewport.height;
        editorState.zoom = Math.min(zoomX, zoomY, 1.0);
      } else {
        editorState.zoom = 1.0;
      }
    } else if (typeof options.zoom === 'number') {
      editorState.zoom = options.zoom;
    } else {
      editorState.zoom = 1.0;
    }
    editorState.panX = 0;
    editorState.panY = 0;
    updateEditorDisplay();
    redraw();
  }

  // Allinea l'angolo (0,0) del viewport all'angolo visibile in alto a sinistra del canvas
  function alignEditorViewTopLeft() {
    editorState.zoom = 1.0;
    const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
    editorState.panX = -centerOffsetX;
    editorState.panY = -centerOffsetY;
    updateEditorDisplay();
    redraw();
  }

  // Initialize canvas with game viewport size
  function initializeCanvas() {
    canvas.width = gameViewport.width;
    canvas.height = gameViewport.height;
    updateEditorDisplay();
    // ensure at least one room exists
    if (!currentRoomId) {
      const rid = uid('room');
      rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], animationInstances: [], walkableArea: [], hotspots: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
      currentRoomId = rid;
      bindRoomRefs();
      refreshRoomsSelector();
    }
    requestAnimationFrame(() => alignEditorViewTopLeft());
  }

  // ===== Character scaling controls & UI =====
  // Define these functions early so they're available when bindRoomRefs is called
  function updateScalingUI() {
    try {
      const minInput = document.getElementById('scaling-min-scale');
      const maxInput = document.getElementById('scaling-max-scale');
      if (minInput) minInput.value = scalingMinScale;
      if (maxInput) maxInput.value = scalingMaxScale;
    } catch (error) {
      // Silently fail if elements don't exist yet (e.g., during initial load)
      console.debug('[Scaling] UI elements not available yet:', error);
    }
  }

  function isStaleProjectLoad(loadGen) {
    return loadGen !== projectLoadGeneration;
  }

  /** Azzera stato canvas stanza (walkable, hotspot, layer) prima di caricare un altro progetto. */
  function resetEditorRoomGlobals() {
    background = null;
    foregrounds = [];
    sceneObjects = [];
    selectedForegroundId = null;
    selectedSceneObjectId = null;
    walkableArea = [];
    hotspots = [];
    activeHotspotId = null;
    selectedWalkableVertexIndex = -1;
    selectedHotspotVertexIndex = -1;
    draggedWalkableVertexIndex = -1;
    draggedHotspotVertexIndex = -1;
    scalingForegroundY = null;
    scalingBackgroundY = null;
    isDrawingWalkable = false;
    isDrawingHotspot = false;
    disableRoomCanvasEditing();
  }

  async function refreshResourcesForActiveProject() {
    if (!window.amiantoResources) return;
    try {
      if (typeof window.amiantoResources.refresh === 'function') {
        await window.amiantoResources.refresh();
      }
      if (typeof window.amiantoResources.refreshSounds === 'function') {
        await window.amiantoResources.refreshSounds();
      }
    } catch (err) {
      console.warn('[Project] Resources refresh failed:', err);
    }
  }

  function bindRoomRefs() {
    try {
      // Safety check: ensure rooms Map is initialized
      if (!rooms || typeof rooms.get !== 'function') {
        console.debug('[bindRoomRefs] Rooms not initialized yet');
        return;
      }
      if (!currentRoomId) {
        console.debug('[bindRoomRefs] No current room selected');
        return;
      }
      const r = rooms.get(currentRoomId);
      if (!r) {
        console.warn(`[bindRoomRefs] Room ${currentRoomId} non trovata`);
        return;
      }
      
      background = r.background || null;
      foregrounds = Array.isArray(r.foregrounds) ? r.foregrounds : [];
    
    sceneObjects = Array.isArray(r.sceneObjects) ? r.sceneObjects : [];
    animationInstances = Array.isArray(r.animationInstances) ? r.animationInstances : [];
    // Keep selection only if still valid; do not auto-select (toggle must allow empty selection)
    if (selectedForegroundId && !foregrounds.some(f => f.id === selectedForegroundId)) {
      selectedForegroundId = null;
    }
    if (selectedSceneObjectId && !sceneObjects.some(o => o.id === selectedSceneObjectId)) {
      selectedSceneObjectId = null;
    }
    if (selectedAnimationInstanceId && !animationInstances.some(i => i.id === selectedAnimationInstanceId)) {
      selectedAnimationInstanceId = null;
    }
    walkableArea = Array.isArray(r.walkableArea) ? r.walkableArea : [];
    if (!Array.isArray(r.hotspots)) r.hotspots = [];
    hotspots = r.hotspots;
    if (activeHotspotId && !hotspots.some(h => h.id === activeHotspotId)) {
      activeHotspotId = null;
    }
    // Load character scaling data
    try {
      scalingForegroundY = (typeof r.scalingForegroundY === 'number') ? r.scalingForegroundY : null;
      scalingBackgroundY = (typeof r.scalingBackgroundY === 'number') ? r.scalingBackgroundY : null;
      scalingMinScale = (typeof r.scalingMinScale === 'number') ? r.scalingMinScale : 0.5;
      scalingMaxScale = (typeof r.scalingMaxScale === 'number') ? r.scalingMaxScale : 1.5;
      // Ensure constraints: foreground must be below background
      if (scalingBackgroundY !== null && scalingForegroundY !== null && scalingForegroundY <= scalingBackgroundY) {
        // Fix invalid state: separate them
        const mid = Math.round((scalingBackgroundY + scalingForegroundY) / 2);
        scalingBackgroundY = mid - 1;
        scalingForegroundY = mid + 1;
        r.scalingBackgroundY = scalingBackgroundY;
        r.scalingForegroundY = scalingForegroundY;
      }
      // Update UI (safely, may not exist during initial load or before login)
      if (typeof updateScalingUI === 'function') {
        try {
          updateScalingUI();
        } catch (uiError) {
          // Silently fail if UI elements don't exist yet
          console.debug('[Scaling] UI update skipped (elements not available)');
        }
      }
    } catch (error) {
      // Silently fail if there's any error loading scaling data
      console.debug('[Scaling] Error loading scaling data (non-critical):', error);
    }
    } catch (bindError) {
      // Catch any unexpected errors in bindRoomRefs to prevent blocking execution
      console.error('[bindRoomRefs] Unexpected error (non-critical):', bindError);
      // Don't throw - allow execution to continue
    }
  }

  // Update editor display (zoom and info)
  function updateEditorDisplay() {
    // Don't force canvas CSS dimensions - let CSS handle responsive sizing
    // The internal canvas dimensions are set correctly in initializeCanvas()
    
    // Update displays
    document.getElementById('zoomLevel').textContent = Math.round(editorState.zoom * 100) + '%';
    document.getElementById('viewportSize').textContent = `${gameViewport.width}Ã—${gameViewport.height}`;
  }

  // Draw image at original size with offset
  function drawImageAtOriginalSize(img, offsetX = 0, offsetY = 0) {
    if (!img) {
      console.warn('[drawImageAtOriginalSize] img is null or undefined');
      return;
    }
    
    // Controlla se l'immagine Ã¨ completamente caricata
    // Usa naturalWidth/naturalHeight per maggiore affidabilitÃ 
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    if (!width || !height) {
      // Se l'immagine non Ã¨ ancora caricata, aspetta e ridisegna
      if (!img.complete) {
        console.warn('[drawImageAtOriginalSize] Image not fully loaded yet, waiting...', {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          width: img.width,
          height: img.height
        });
        
        // Se non c'Ã¨ giÃ  un handler onload, aggiungilo per ridisegnare quando l'immagine Ã¨ pronta
        if (!img._onloadHandlerAdded) {
          img._onloadHandlerAdded = true;
          const originalOnload = img.onload;
          img.onload = () => {
            if (originalOnload) originalOnload.call(img);
            // Ridisegna quando l'immagine Ã¨ caricata
            setTimeout(() => redraw(), 10);
          };
        }
        return;
      } else {
        console.warn('[drawImageAtOriginalSize] Image has no dimensions:', {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          width: img.width,
          height: img.height
        });
        return;
      }
    }
    
    // Draw image at its original size with offset
    ctx.drawImage(img, offsetX, offsetY, width, height);
  }

  // Convert screen coordinates to world coordinates (all editor tabs)
  function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const internalX = canvasX * scaleX;
    const internalY = canvasY * scaleY;
    const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
    
    const worldX = (internalX - centerOffsetX - editorState.panX) / editorState.zoom;
    const worldY = (internalY - centerOffsetY - editorState.panY) / editorState.zoom;
    
    if (window.debugCoordinates) {
      console.log('Coordinate conversion:', {
        screen: { x: screenX, y: screenY },
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        canvas: { width: canvas.width, height: canvas.height },
        scale: { x: scaleX, y: scaleY },
        internal: { x: internalX, y: internalY },
        centerOffset: { x: centerOffsetX, y: centerOffsetY },
        pan: { x: editorState.panX, y: editorState.panY },
        zoom: editorState.zoom,
        world: { x: worldX, y: worldY }
      });
    }
    
    return { x: worldX, y: worldY };
  }

  // Convert world coordinates to screen coordinates
  function worldToScreen(worldX, worldY) {
    const rect = canvas.getBoundingClientRect();
    const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
    
    const internalX = worldX * editorState.zoom + editorState.panX + centerOffsetX;
    const internalY = worldY * editorState.zoom + editorState.panY + centerOffsetY;
    
    // Convert internal canvas coordinates to CSS coordinates
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const cssX = internalX * scaleX;
    const cssY = internalY * scaleY;
    
    return { x: cssX, y: cssY };
  }

  // Convert mouse event to room-space coordinates (compensates zoom/pan and editor offsets)
  function eventToRoomCoordinates(clientX, clientY) {
    const worldPos = screenToWorld(clientX, clientY);
    // Don't round coordinates to avoid offset issues - keep precision
    const x = worldPos.x;
    const y = worldPos.y;
    return { x, y };
  }

  // Parse position string "x, y" to {x, y} object
  function parsePositionString(str) {
    if (!str || typeof str !== 'string') return { x: 0, y: 0 };
    const parts = str.split(',').map(p => p.trim());
    const x = parts.length > 0 ? (Number(parts[0]) || 0) : 0;
    const y = parts.length > 1 ? (Number(parts[1]) || 0) : 0;
    return { x, y };
  }

  // Format position object {x, y} to "x, y" string
  function formatPositionString(x, y) {
    const px = Math.round(Number(x) || 0);
    const py = Math.round(Number(y) || 0);
    return `${px}, ${py}`;
  }

  /** VisibilitÃ /interattivitÃ  a runtime (playtest); in editor si disegna sempre. */
  function isSceneObjectRuntimeVisible(obj) {
    return obj && obj.visible !== false;
  }

  function setSceneObjectRuntimeVisible(obj, visible) {
    if (!obj) return;
    const v = !!visible;
    obj.visible = v;
    obj.enabled = v;
  }

  /** Hotspot cliccabile a runtime; in editor il poligono resta sempre visibile. */
  function isHotspotRuntimeActive(hs) {
    return hs && hs.visible !== false;
  }

  function setHotspotRuntimeActive(hs, active) {
    if (!hs) return;
    hs.visible = !!active;
  }

  // Check if a point is inside a scene object
  function getObjectAtPoint(worldX, worldY) {
    // Check objects in reverse order (top to bottom)
    for (let i = sceneObjects.length - 1; i >= 0; i--) {
      const obj = sceneObjects[i];
      if (!obj.img) continue;
      
      const objX = obj.x || 0;
      const objY = obj.y || 0;
      
      if (worldX >= objX && worldX <= objX + obj.img.width &&
          worldY >= objY && worldY <= objY + obj.img.height) {
        return obj;
      }
    }
    return null;
  }

  function getRoomAnimationDef(animationId) {
    if (!animationId) return null;
    return roomAnimationsCatalog.get(animationId) || null;
  }

  function getRoomAnimationFirstFrameImg(animDefOrId) {
    const animDef = typeof animDefOrId === 'string' ? getRoomAnimationDef(animDefOrId) : animDefOrId;
    if (!animDef || !Array.isArray(animDef.frames) || !animDef.frames.length) return null;
    const frame = animDef.frames[0];
    return frame && frame.img ? frame.img : null;
  }

  function getImageDrawSize(img) {
    if (!img) return { w: 0, h: 0 };
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    return { w, h };
  }

  function findAnimationInListAtPoint(list, worldX, worldY) {
    for (let i = list.length - 1; i >= 0; i--) {
      const inst = list[i];
      if (!inst || inst.visible === false) continue;
      const img = getRoomAnimationFirstFrameImg(inst.animationId);
      if (!img) continue;
      const { w, h } = getImageDrawSize(img);
      if (!w || !h) continue;
      const ix = inst.x || 0;
      const iy = inst.y || 0;
      if (worldX >= ix && worldX <= ix + w && worldY >= iy && worldY <= iy + h) {
        return inst;
      }
    }
    return null;
  }

  function getAnimationInstanceAtPoint(worldX, worldY) {
    const fgInstances = animationInstances.filter(i => (i.layer || 'background') === 'foreground');
    const bgInstances = animationInstances.filter(i => (i.layer || 'background') !== 'foreground');
    return findAnimationInListAtPoint(fgInstances, worldX, worldY)
      || findAnimationInListAtPoint(bgInstances, worldX, worldY);
  }

  /** Hit-test in draw order: foreground anims → scene objects → background anims */
  function getTopRoomDraggableAtPoint(worldX, worldY) {
    const fgInstances = animationInstances.filter(i => (i.layer || 'background') === 'foreground');
    const fgAnim = findAnimationInListAtPoint(fgInstances, worldX, worldY);
    if (fgAnim) return { type: 'animation', target: fgAnim };
    const obj = getObjectAtPoint(worldX, worldY);
    if (obj) return { type: 'object', target: obj };
    const bgInstances = animationInstances.filter(i => (i.layer || 'background') !== 'foreground');
    const bgAnim = findAnimationInListAtPoint(bgInstances, worldX, worldY);
    if (bgAnim) return { type: 'animation', target: bgAnim };
    return null;
  }

  function drawRoomAnimationInstance(inst, frameIndex) {
    if (!inst || inst.visible === false) return;
    const animDef = getRoomAnimationDef(inst.animationId);
    if (!animDef || !animDef.frames || !animDef.frames.length) return;
    const idx = Math.max(0, Math.min(frameIndex, animDef.frames.length - 1));
    const frame = animDef.frames[idx];
    const img = frame && frame.img ? frame.img : null;
    if (!img) return;
    const { w, h } = getImageDrawSize(img);
    if (!w || !h) return;
    const ix = inst.x || 0;
    const iy = inst.y || 0;
    ctx.drawImage(img, ix, iy, w, h);
    if (inst.id === selectedAnimationInstanceId) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ix, iy, w, h);
      ctx.restore();
    }
    if (isDraggingAnimationInstance && draggedAnimationInstance && draggedAnimationInstance.id === inst.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(ix, iy, w, h);
      ctx.restore();
    }
  }

  function updateAnimationInstanceUI(inst) {
    const listItem = document.querySelector(`[data-animation-instance-id="${inst.id}"]`);
    if (!listItem) return;
    const positionInfo = listItem.querySelector('.animation-instance-position');
    if (positionInfo) {
      positionInfo.textContent = `Position: ${Math.round(inst.x)}, ${Math.round(inst.y)}`;
    }
  }

  // Update scene object UI position info
  function updateSceneObjectUI(sceneObject) {
    const listItem = document.querySelector(`[data-object-id="${sceneObject.id}"]`);
    if (listItem) {
      const positionInfo = listItem.querySelector('small[style*="color: #888"]');
      if (positionInfo) {
        positionInfo.textContent = `Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}`;
      }
    }
  }

  // Redraw scene: background, scene objects, and foregrounds at original sizes
  function redraw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Decide what to render based on active tab
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';

    if (activeTab === 'characters') {
      // Characters tab: show character animation preview on main canvas
      const sel = document.getElementById('character-selector');
      const who = sel ? sel.value : '';
      const charData = who ? characterFrames.get(who) : null;
      
      // Ensure canvas is set to game viewport (no stretching by CSS)
      if (canvas.width !== gameViewport.width || canvas.height !== gameViewport.height) {
        canvas.width = gameViewport.width;
        canvas.height = gameViewport.height;
      }

      // Background (no transform)
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
      // Verifica che ci siano dati validi prima di procedere
      if (!charData || !activeDirections || !activeDirections[currentDirection]) {
        // Nessun character selezionato o direzione non valida
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 150, gameViewport.height / 2 - 20, 300, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(who ? 'No frames loaded for this direction' : 'Select a character to preview', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
        return; // skip rooms rendering
      }

      const dirData = activeDirections[currentDirection];
      
      // Verifica che ci siano frame
      if (!dirData.frames || dirData.frames.length === 0) {
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 150, gameViewport.height / 2 - 20, 300, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No frames loaded for this direction', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
        return; // skip rooms rendering
      }

      // Prepare current frame
      const frameIndex = characterPreviewIndex % dirData.frames.length;
      const frame = dirData.frames[frameIndex];

      const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
      ctx.save();
      ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
      ctx.scale(editorState.zoom, editorState.zoom);

      // Draw current frame at original size, positioned at top-left corner (0,0)
      // Usa getFrameImage per gestire sia frame normali che frame specchiati
      const frameResult = getFrameImage(frame, activeDirections, frameIndex, currentDirection);
      
      if (frameResult && frameResult.img) {
        const frameImg = frameResult.img;
        
        // Verifica che l'immagine sia caricata
        if (frameImg.complete && frameImg.naturalWidth > 0 && frameImg.naturalHeight > 0) {
          // Posiziona l'immagine con l'angolo in alto a sinistra a (0,0)
          const dx = 0;
          const dy = 0;
          
          // Se il frame deve essere specchiato, applica la trasformazione
          if (frameResult.mirrored) {
            ctx.save();
            // Specchia orizzontalmente: trasla, scala negativo su X, e ri-trasla
            ctx.translate(dx + frameImg.width, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(frameImg, 0, 0);
            ctx.restore();
          } else {
            ctx.drawImage(frameImg, Math.round(dx), Math.round(dy));
          }
          
          // Draw pivot point if it exists (one pivot per character, relative to current frame)
          if (charData.pivotX !== undefined && charData.pivotY !== undefined) {
            // Pivot is relative to frame, so draw it at frame position + pivot offset
            let pivotX = dx + charData.pivotX;
            let pivotY = dy + charData.pivotY;
            
            // If frame is mirrored, adjust pivot X coordinate
            if (frameResult.mirrored) {
              pivotX = dx + frameImg.width - charData.pivotX;
            }
            
            // Scale pivot size with zoom for better visibility
            const pivotRadius = 8 / editorState.zoom;
            const crosshairSize = 12 / editorState.zoom;
            const pivotLineWidth = Math.max(1, 2 / editorState.zoom);
            const crosshairLineWidth = Math.max(0.5, 1.5 / editorState.zoom);
            
            ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.arc(Math.round(pivotX), Math.round(pivotY), pivotRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = pivotLineWidth;
            ctx.stroke();
            // Draw crosshair
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = crosshairLineWidth;
            ctx.beginPath();
            ctx.moveTo(Math.round(pivotX - crosshairSize), Math.round(pivotY));
            ctx.lineTo(Math.round(pivotX + crosshairSize), Math.round(pivotY));
            ctx.moveTo(Math.round(pivotX), Math.round(pivotY - crosshairSize));
            ctx.lineTo(Math.round(pivotX), Math.round(pivotY + crosshairSize));
            ctx.stroke();
          }
          
          // Mostra informazioni sull'animazione (opzionale, per debug)
          if (characterPreviewTimer) {
            ctx.save();
            ctx.resetTransform(); // Reset per testo senza zoom/pan
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(10, 10, 300, 80);
            ctx.fillStyle = '#39ff14';
            ctx.font = '12px monospace';
            const currentFrameNum = frameIndex + 1;
            const animLabel = getSelectedCharacterAnimationKey() === 'walking' ? 'Walking' : getSelectedCharacterAnimationKey();
            ctx.fillText(`Animation: ${animLabel}`, 15, 28);
            ctx.fillText(`Frame: ${currentFrameNum}/${dirData.frames.length}`, 15, 45);
            ctx.fillText(`FPS: ${dirData.fps || 8}`, 15, 62);
            ctx.fillText(`Direction: ${currentDirection}`, 15, 79);
            ctx.restore();
          }
        } else {
          // Immagine non ancora caricata
          ctx.save();
          ctx.resetTransform();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(gameViewport.width / 2 - 150, gameViewport.height / 2 - 20, 300, 40);
          ctx.fillStyle = '#ffff00';
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Loading frame...', gameViewport.width / 2, gameViewport.height / 2);
          ctx.restore();
        }
      } else {
        // Frame non valido
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 150, gameViewport.height / 2 - 20, 300, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Invalid frame', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
      }

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, gameViewport.width, gameViewport.height);
      ctx.restore();
      return; // skip rooms rendering
    }

    if (activeTab === 'cursors') {
      if (canvas.width !== gameViewport.width || canvas.height !== gameViewport.height) {
        canvas.width = gameViewport.width;
        canvas.height = gameViewport.height;
      }

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cursor = selectedCursorId
        ? contextualCursors.find(c => c.id === selectedCursorId)
        : null;
      const cursorImg = cursor && cursor.cursorImage ? cursor.cursorImage : null;

      if (!cursor) {
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 180, gameViewport.height / 2 - 20, 360, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Select or create a cursor category to preview', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
        return;
      }

      if (!cursorImg || !cursorImg.complete || cursorImg.naturalWidth <= 0) {
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 180, gameViewport.height / 2 - 20, 360, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(cursorImg ? 'Loading cursor image...' : 'Browse Resources to set a cursor image', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
        return;
      }

      const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
      ctx.save();
      ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
      ctx.scale(editorState.zoom, editorState.zoom);

      // Draw cursor image at (0,0) like character frames
      const dx = 0;
      const dy = 0;
      ctx.drawImage(cursorImg, Math.round(dx), Math.round(dy));

      // Ensure pivot defaults (click point) — top-left is CSS cursor default
      if (cursor.pivotX === undefined || cursor.pivotY === undefined) {
        cursor.pivotX = 0;
        cursor.pivotY = 0;
      }

      const pivotX = dx + cursor.pivotX;
      const pivotY = dy + cursor.pivotY;
      const pivotRadius = 8 / editorState.zoom;
      const crosshairSize = 12 / editorState.zoom;
      const pivotLineWidth = Math.max(1, 2 / editorState.zoom);
      const crosshairLineWidth = Math.max(0.5, 1.5 / editorState.zoom);

      ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(Math.round(pivotX), Math.round(pivotY), pivotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = pivotLineWidth;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = crosshairLineWidth;
      ctx.beginPath();
      ctx.moveTo(Math.round(pivotX - crosshairSize), Math.round(pivotY));
      ctx.lineTo(Math.round(pivotX + crosshairSize), Math.round(pivotY));
      ctx.moveTo(Math.round(pivotX), Math.round(pivotY - crosshairSize));
      ctx.lineTo(Math.round(pivotX), Math.round(pivotY + crosshairSize));
      ctx.stroke();

      // Overlay info
      ctx.save();
      ctx.resetTransform();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 280, 65);
      ctx.fillStyle = '#39ff14';
      ctx.font = '12px monospace';
      ctx.fillText(`Category: ${cursor.category}`, 15, 28);
      ctx.fillText(`Size: ${cursorImg.naturalWidth}×${cursorImg.naturalHeight}`, 15, 45);
      ctx.fillText(`Click point: (${cursor.pivotX}, ${cursor.pivotY})`, 15, 62);
      ctx.restore();

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, gameViewport.width, gameViewport.height);
      ctx.restore();
      return;
    }

    if (activeTab === 'animations') {
      const animDef = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;

      if (canvas.width !== gameViewport.width || canvas.height !== gameViewport.height) {
        canvas.width = gameViewport.width;
        canvas.height = gameViewport.height;
      }

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!animDef || !animDef.frames || !animDef.frames.length) {
        ctx.save();
        ctx.resetTransform();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(gameViewport.width / 2 - 180, gameViewport.height / 2 - 20, 360, 40);
        ctx.fillStyle = '#ffff00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(animDef ? 'No frames loaded for this animation' : 'Select an animation to preview', gameViewport.width / 2, gameViewport.height / 2);
        ctx.restore();
        return;
      }

      const frameIndex = roomAnimationPreviewIndex % animDef.frames.length;
      const frame = animDef.frames[frameIndex];
      const frameImg = frame && frame.img ? frame.img : null;

      const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
      ctx.save();
      ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
      ctx.scale(editorState.zoom, editorState.zoom);

      if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
        ctx.drawImage(frameImg, 0, 0);
        if (roomAnimationPreviewTimer) {
          ctx.save();
          ctx.resetTransform();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(10, 10, 280, 65);
          ctx.fillStyle = '#39ff14';
          ctx.font = '12px monospace';
          ctx.fillText(`Animation: ${animDef.name}`, 15, 28);
          ctx.fillText(`Frame: ${frameIndex + 1}/${animDef.frames.length}`, 15, 45);
          ctx.fillText(`FPS: ${animDef.fps || 8} | Layer: ${animDef.layer || 'background'}`, 15, 62);
          ctx.restore();
        }
      }

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, gameViewport.width, gameViewport.height);
      ctx.restore();
      return;
    }

    if (activeTab === 'inventory') {
      if (canvas.width !== gameViewport.width || canvas.height !== gameViewport.height) {
        canvas.width = gameViewport.width;
        canvas.height = gameViewport.height;
      }

      const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
      ctx.save();
      ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
      ctx.scale(editorState.zoom, editorState.zoom);

      ensureInventoryRects();
      const panel = inventoryDefinition.panel;
      if (inventoryDefinition.background) {
        ctx.drawImage(inventoryDefinition.background, panel.x, panel.y, panel.w, panel.h);
      } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Load the inventory background from the panel on the right', panel.x + panel.w / 2, panel.y + panel.h / 2);
      }
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
      ctx.setLineDash([]);

      if (inventoryDefinition.displayMode === 'toggle' && inventoryDefinition.toggleIcon) {
        const tb = inventoryDefinition.toggleIconBounds;
        try {
          ctx.drawImage(inventoryDefinition.toggleIcon, tb.x, tb.y, tb.w, tb.h);
        } catch (_) {}
        ctx.strokeStyle = 'rgba(255, 200, 80, 0.7)';
        ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
      }

      for (const slot of inventoryDefinition.slots) {
        if (!slot || slot.id === '__drawing__') continue;
        const isSelected = slot.id === selectedInventorySlotId;
        ctx.strokeStyle = isSelected ? 'rgba(180, 80, 255, 1)' : 'rgba(180, 80, 255, 0.85)';
        ctx.fillStyle = isSelected ? 'rgba(180, 80, 255, 0.2)' : 'rgba(180, 80, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.rect(slot.x, slot.y, slot.w, slot.h);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ddd';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slot.name || 'Slot', slot.x + slot.w / 2, slot.y + slot.h / 2);

        if (isSelected) {
          const handleSize = 8;
          ctx.fillStyle = 'rgba(180, 80, 255, 0.9)';
          const handles = [
            { x: slot.x - handleSize / 2, y: slot.y - handleSize / 2 },
            { x: slot.x + slot.w - handleSize / 2, y: slot.y - handleSize / 2 },
            { x: slot.x - handleSize / 2, y: slot.y + slot.h - handleSize / 2 },
            { x: slot.x + slot.w - handleSize / 2, y: slot.y + slot.h - handleSize / 2 }
          ];
          handles.forEach(h => ctx.fillRect(h.x, h.y, handleSize, handleSize));
        }
      }

      const previewSlots = inventoryDefinition.slots.filter(s => s && s.id !== '__drawing__');
      inventoryItems.forEach((item, index) => {
        const slot = previewSlots[index];
        const img = item && item.image;
        if (!slot || !img) return;
        const imgW = img.naturalWidth || img.width || 0;
        const imgH = img.naturalHeight || img.height || 0;
        if (imgW <= 0 || imgH <= 0) return;
        const maxW = Math.max(1, slot.w);
        const maxH = Math.max(1, slot.h);
        const scale = Math.min(maxW / imgW, maxH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = slot.x + (maxW - drawW) / 2;
        const drawY = slot.y + (maxH - drawH) / 2;
        try {
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch (_) {}
      });

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(0, 0, gameViewport.width, gameViewport.height);
      ctx.restore();
      return;
    }

    const { x: centerOffsetX, y: centerOffsetY } = getCanvasCenterOffset();
    ctx.save();
    ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
    ctx.scale(editorState.zoom, editorState.zoom);

    // Default (Rooms tab): draw scene
    // Draw background scaled to viewport size (always matches the green rectangle)
    // L'origine (0,0) Ã¨ ora nell'angolo in alto a sinistra del contenuto centrato
    if (background) {
      // Draw background scaled to viewport dimensions
      ctx.drawImage(background, 0, 0, gameViewport.width, gameViewport.height);
    } else {
      // Placeholder background
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, gameViewport.width, gameViewport.height);
    }

    // Background-layer room animations (after background, before scene objects)
    animationInstances
      .filter(inst => (inst.layer || 'background') !== 'foreground')
      .forEach(inst => drawRoomAnimationInstance(inst, 0));

    // Draw scene objects at their positions (sempre in editor; attenuati se off a runtime)
    for (let obj of sceneObjects) {
      if (obj && obj.img) {
        const runtimeVisible = isSceneObjectRuntimeVisible(obj);
        const objX = (obj.x || 0);
        const objY = (obj.y || 0);
        const rot = Number(obj.rotationRad || 0);
        const sx = (typeof obj.scaleX === 'number') ? obj.scaleX : 1;
        const sy = (typeof obj.scaleY === 'number') ? obj.scaleY : 1;

        ctx.save();
        if (!runtimeVisible) ctx.globalAlpha = 0.42;
        if (rot !== 0 || sx !== 1 || sy !== 1) {
          ctx.translate(objX, objY);
          if (rot !== 0) ctx.rotate(rot);
          if (sx !== 1 || sy !== 1) ctx.scale(Math.max(0.01, sx), Math.max(0.01, sy));
          ctx.drawImage(obj.img, 0, 0, obj.img.width, obj.img.height);
        } else {
          drawImageAtOriginalSize(obj.img, objX, objY);
        }
        ctx.restore();

        if (!runtimeVisible) {
          ctx.save();
          ctx.strokeStyle = 'rgba(160,160,160,0.85)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(objX, objY, obj.img.width, obj.img.height);
          ctx.restore();
        }

        // Draw selection / drag outline for scene objects
        const isObjSelected = !activeHotspotId && obj.id === selectedSceneObjectId;
        const isObjDragging = !activeHotspotId && isDraggingObject && draggedObject && draggedObject.id === obj.id;
        if (isObjSelected || isObjDragging) {
          ctx.save();
          ctx.strokeStyle = runtimeVisible
            ? (isObjDragging ? 'rgba(57,255,20,0.8)' : 'rgba(57,255,20,0.9)')
            : 'rgba(160,160,160,0.9)';
          ctx.lineWidth = isObjDragging ? 3 : 2;
          ctx.setLineDash(isObjDragging ? [5, 5] : [4, 4]);
          ctx.strokeRect(objX, objY, obj.img.width, obj.img.height);
          ctx.restore();
        }
      }
    }

    // Foreground-layer room animations (after scene objects, before foreground layers)
    animationInstances
      .filter(inst => (inst.layer || 'background') === 'foreground')
      .forEach(inst => drawRoomAnimationInstance(inst, 0));

    // Draw foregrounds - after scene objects, before GUI
    // Support same transforms as scene objects: x, y, rotationRad, scaleX, scaleY, visible
    for (let layer of foregrounds) {
      if (!layer || !layer.img) continue;
      if (layer.visible === false) continue;
      
      // Support both x/y and offsetX/offsetY for backward compatibility
      const layerX = (typeof layer.x === 'number') ? layer.x : (layer.offsetX || 0);
      const layerY = (typeof layer.y === 'number') ? layer.y : (layer.offsetY || 0);
      const rot = Number(layer.rotationRad || 0);
      const sx = (typeof layer.scaleX === 'number') ? layer.scaleX : 1;
      const sy = (typeof layer.scaleY === 'number') ? layer.scaleY : 1;

      if (rot !== 0 || sx !== 1 || sy !== 1) {
        ctx.save();
        ctx.translate(layerX, layerY);
        if (rot !== 0) ctx.rotate(rot);
        if (sx !== 1 || sy !== 1) ctx.scale(Math.max(0.01, sx), Math.max(0.01, sy));
        // draw image at origin with its natural size
        ctx.drawImage(layer.img, 0, 0, layer.img.width, layer.img.height);
        ctx.restore();
      } else {
        // Draw layer without transforms
        drawImageAtOriginalSize(layer.img, layerX, layerY);
      }
      
      // Draw selection outline if this is the selected foreground layer
      if (selectedForegroundId === layer.id) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(layerX, layerY, layer.img.width, layer.img.height);
        ctx.restore();
      }
    }

    // GUI overlay (drawn on top of scene)
    if (guiBackground) {
      drawImageAtOriginalSize(guiBackground, 0, 0);
    }
    if (guiButtons.length > 0) {
      ctx.save();
      for (const btn of guiButtons) {
        // Draw button background image if available
        if (btn.backgroundImage) {
          // Draw image maintaining aspect ratio (no stretch)
          const imgAspect = btn.backgroundImage.width / btn.backgroundImage.height;
          const btnAspect = btn.w / btn.h;
          
          let drawW = btn.w;
          let drawH = btn.h;
          let drawX = btn.x;
          let drawY = btn.y;
          
          if (imgAspect > btnAspect) {
            // Image is wider, fit to width
            drawH = btn.w / imgAspect;
            drawY = btn.y + (btn.h - drawH) / 2;
          } else {
            // Image is taller, fit to height
            drawW = btn.h * imgAspect;
            drawX = btn.x + (btn.w - drawW) / 2;
          }
          
          ctx.drawImage(btn.backgroundImage, drawX, drawY, drawW, drawH);
        } else {
          // Default button appearance
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.9)';
          ctx.fillStyle = 'rgba(0, 200, 255, 0.12)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(btn.x, btn.y, btn.w, btn.h);
          ctx.fill();
          ctx.stroke();
        }
        
        // Draw button text if available
        if (btn.text && btn.text.trim() !== '') {
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(btn.text, btn.x + btn.w/2, btn.y + btn.h/2);
          ctx.restore();
        }
        
        // Selection highlight and resize handles
        if (btn.id === selectedGuiButtonId) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,0,0.9)';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(btn.x-2, btn.y-2, btn.w+4, btn.h+4);
          
          // Draw resize handles
          const handleSize = 8;
          ctx.fillStyle = 'rgba(255,255,0,0.8)';
          ctx.strokeStyle = 'rgba(255,255,0,1)';
          ctx.lineWidth = 1;
          
          // Corner handles
          const handles = [
            {x: btn.x - handleSize/2, y: btn.y - handleSize/2, type: 'nw'},
            {x: btn.x + btn.w - handleSize/2, y: btn.y - handleSize/2, type: 'ne'},
            {x: btn.x - handleSize/2, y: btn.y + btn.h - handleSize/2, type: 'sw'},
            {x: btn.x + btn.w - handleSize/2, y: btn.y + btn.h - handleSize/2, type: 'se'}
          ];
          
          handles.forEach(handle => {
            ctx.beginPath();
            ctx.rect(handle.x, handle.y, handleSize, handleSize);
            ctx.fill();
            ctx.stroke();
          });
          
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // Walkable area overlay (after objects, before UI)
    if (showWalkable && walkableArea.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(57,255,20,0.9)';
      ctx.fillStyle = 'rgba(57,255,20,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(walkableArea[0].x, walkableArea[0].y);
      for (let i = 1; i < walkableArea.length; i++) ctx.lineTo(walkableArea[i].x, walkableArea[i].y);
      if (!isDrawingWalkable && walkableArea.length > 2) ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // vertices with selection highlight
      for (let i = 0; i < walkableArea.length; i++) {
        const p = walkableArea[i];
        ctx.beginPath();
        const isSelected = i === selectedWalkableVertexIndex;
        const r = isSelected ? 5 : 3;
        ctx.arc(p.x, p.y, r, 0, Math.PI*2);
        ctx.fillStyle = isSelected ? 'rgba(57,255,20,1.0)' : 'rgba(57,255,20,0.9)';
        ctx.fill();
      }
      ctx.restore();
    }

    // Hotspots overlay (sempre visibili in editor; grigi tratteggiati se inattivi a runtime)
    if (showHotspots && hotspots.length > 0) {
      ctx.save();
      for (const hs of hotspots) {
        if (!hs) continue;
        const pts = Array.isArray(hs.points) ? hs.points : [];
        if (pts.length <= 1) continue;
        const isSelected = hs.id === activeHotspotId;
        const runtimeActive = isHotspotRuntimeActive(hs);
        if (runtimeActive) {
          ctx.setLineDash([]);
          ctx.strokeStyle = isSelected ? 'rgba(255,165,0,1.0)' : 'rgba(255,165,0,0.9)';
          ctx.fillStyle = isSelected ? 'rgba(255,165,0,0.18)' : 'rgba(255,165,0,0.12)';
        } else {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = isSelected ? 'rgba(180,180,180,1.0)' : 'rgba(140,140,140,0.85)';
          ctx.fillStyle = isSelected ? 'rgba(140,140,140,0.14)' : 'rgba(120,120,120,0.08)';
        }
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (!isDrawingHotspot && pts.length > 2) ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          ctx.beginPath();
          const isSelectedVertex = isSelected && i === selectedHotspotVertexIndex;
          const radius = isSelectedVertex ? 5 : 3;
          ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
          ctx.fillStyle = isSelectedVertex
            ? (runtimeActive ? 'rgba(255,215,0,1.0)' : 'rgba(200,200,200,1.0)')
            : (runtimeActive ? 'rgba(255,165,0,0.95)' : 'rgba(150,150,150,0.9)');
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Character scaling lines overlay
    if (showScalingLines) {
      ctx.save();
      // Draw background line (second plane - min scale) - red/orange color - UPPER line
      if (scalingBackgroundY !== null) {
        ctx.strokeStyle = 'rgba(255, 100, 0, 1.0)';
        ctx.lineWidth = 4 / editorState.zoom;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, scalingBackgroundY);
        ctx.lineTo(gameViewport.width, scalingBackgroundY);
        ctx.stroke();
        // Draw label with background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(5, scalingBackgroundY - 22, 280, 18);
        ctx.fillStyle = 'rgba(255, 100, 0, 1.0)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Background (Min: ' + scalingMinScale + ') - Top line', 10, scalingBackgroundY - 13);
        ctx.restore();
      }
      // Draw foreground line (first plane - max scale) - blue/cyan color - LOWER line
      if (scalingForegroundY !== null) {
        ctx.strokeStyle = 'rgba(0, 200, 255, 1.0)';
        ctx.lineWidth = 4 / editorState.zoom;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, scalingForegroundY);
        ctx.lineTo(gameViewport.width, scalingForegroundY);
        ctx.stroke();
        // Draw label with background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(5, scalingForegroundY + 4, 280, 18);
        ctx.fillStyle = 'rgba(0, 200, 255, 1.0)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Foreground (Max: ' + scalingMaxScale + ') - Bottom line', 10, scalingForegroundY + 13);
        ctx.restore();
      }
      ctx.restore();
    }

    // Draw green rectangle representing the current viewport resolution
    // This rectangle is drawn in the same transformed context as the background image
    // so it will always align perfectly with the background (both at position 0,0 with viewport dimensions)
    ctx.save();
    ctx.strokeStyle = '#39ff14'; // Green color
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    // Draw the rectangle at the same position and size as the background image
    // Both are at (0,0) with gameViewport dimensions, so they will perfectly overlap
    ctx.strokeRect(0, 0, gameViewport.width, gameViewport.height);
    ctx.restore();

    // Restore transformations
    ctx.restore();
  }

  // Mouse wheel zoom functionality with panning support
  function setupMouseWheelZoom() {
    const canvasContainer = document.getElementById('canvasContainer');
    
    canvasContainer.addEventListener('wheel', function(e) {
      e.preventDefault();
      
      // Get mouse position relative to canvas using corrected coordinates
      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      
      // Calculate scaling factor between CSS dimensions and internal canvas dimensions
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      // Convert CSS coordinates to internal canvas coordinates
      const mouseX = canvasX * scaleX;
      const mouseY = canvasY * scaleY;
      
      // Calculate zoom direction
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldZoom = editorState.zoom;
      const newZoom = Math.max(0.1, Math.min(3.0, oldZoom * zoomFactor));
      
      if (newZoom !== oldZoom) {
        // Calculate zoom center point
        const zoomCenterX = mouseX;
        const zoomCenterY = mouseY;
        
        // Adjust pan to keep zoom center stable
        editorState.panX = zoomCenterX - (zoomCenterX - editorState.panX) * (newZoom / oldZoom);
        editorState.panY = zoomCenterY - (zoomCenterY - editorState.panY) * (newZoom / oldZoom);
        
        editorState.zoom = newZoom;
        
        // Update display
        updateEditorDisplay();
        redraw();
      }
    }, { passive: false });
  }

  // Setup mouse panning and object dragging functionality
  function setupMousePanning() {
    canvas.addEventListener('mousedown', function(e) {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) { // Middle mouse or Ctrl+Left
        e.preventDefault();
        editorState.isPanning = true;
        editorState.lastPanX = e.clientX;
        editorState.lastPanY = e.clientY;
        canvas.style.cursor = 'grabbing';
      } else if (e.button === 0 && isDrawingGuiButton) {
        // avvio disegno GUI
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        guiDrawStart = { x: worldPos.x, y: worldPos.y };
        // se non esiste placeholder, crealo ora
        if (!(guiButtons.length && guiButtons[guiButtons.length-1].id === '__drawing__')) {
          guiButtons.push({ id: '__drawing__', name: 'Drawing...', x: Math.round(worldPos.x), y: Math.round(worldPos.y), w: 0, h: 0, backgroundImage: null });
        }
        canvas.style.cursor = 'crosshair';
      } else if (e.button === 0 && isDrawingInventorySlot) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        inventorySlotDrawStart = { x: worldPos.x, y: worldPos.y };
        if (!(inventoryDefinition.slots.length && inventoryDefinition.slots[inventoryDefinition.slots.length - 1].id === '__drawing__')) {
          inventoryDefinition.slots.push({ id: '__drawing__', name: 'Drawing...', x: Math.round(worldPos.x), y: Math.round(worldPos.y), w: 0, h: 0 });
        }
        canvas.style.cursor = 'crosshair';
      } else if (e.button === 0 && !e.ctrlKey && !isDrawingWalkable && !isDrawingGuiButton && !isDrawingInventorySlot) { // Left click without Ctrl
        // Check for character pivot interaction (only in characters tab)
        const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
        if (activeTab === 'cursors') {
          const cursor = selectedCursorId
            ? contextualCursors.find(c => c.id === selectedCursorId)
            : null;
          if (cursor && cursor.cursorImage && cursor.cursorImage.complete && cursor.cursorImage.naturalWidth > 0) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            e.preventDefault();
            e.stopPropagation();
            cursor.pivotX = Math.round(worldPos.x);
            cursor.pivotY = Math.round(worldPos.y);
            updateCursorPivotLabel(cursor);
            redraw();
            return;
          }
        }
        if (activeTab === 'characters') {
          const sel = document.getElementById('character-selector');
          const who = sel ? sel.value : '';
          if (who) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            const charData = characterFrames.get(who);
            if (charData) {
              const activeDirections = getCharacterDirectionsStore(charData);
              const dirData = activeDirections ? activeDirections[currentDirection] : null;
              if (dirData && dirData.frames && dirData.frames.length > 0) {
                const frameResult = getFrameImage(dirData.frames[0], activeDirections, 0, currentDirection);
                if (frameResult && frameResult.img) {
                  const frameImg = frameResult.img;
                  // Frame position in viewport coordinates (now at 0,0)
                  const frameDx = 0;
                  const frameDy = 0;
                  
                  // Initialize pivot if it doesn't exist
                  if (charData.pivotX === undefined || charData.pivotY === undefined) {
                    charData.pivotX = Math.round(frameImg.width / 2);
                    charData.pivotY = Math.round(frameImg.height);
                    characterFrames.set(who, charData);
                  }
                  
                  // Move pivot to click position (relative to frame top-left)
                  // Works like polygon points - always moves pivot on click
                  e.preventDefault();
                  e.stopPropagation();
                  // If frame is mirrored, adjust pivot X coordinate to match visual position
                  if (frameResult.mirrored) {
                    charData.pivotX = Math.round(frameImg.width - (worldPos.x - frameDx));
                  } else {
                    charData.pivotX = Math.round(worldPos.x - frameDx);
                  }
                  charData.pivotY = Math.round(worldPos.y - frameDy);
                  characterFrames.set(who, charData);
                  redraw();
                  return;
                }
              }
            }
          }
        }
        // Check for GUI button interaction
        if (activeTab === 'gui') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          const clickedGuiButton = guiButtons.find(btn => 
            worldPos.x >= btn.x && worldPos.x <= btn.x + btn.w &&
            worldPos.y >= btn.y && worldPos.y <= btn.y + btn.h
          );
          
          if (clickedGuiButton) {
            e.preventDefault();
            selectedGuiButtonId = clickedGuiButton.id;
            
            // Check if clicking on resize handle
            const handleSize = 8;
            const handles = [
              {x: clickedGuiButton.x - handleSize/2, y: clickedGuiButton.y - handleSize/2, type: 'nw'},
              {x: clickedGuiButton.x + clickedGuiButton.w - handleSize/2, y: clickedGuiButton.y - handleSize/2, type: 'ne'},
              {x: clickedGuiButton.x - handleSize/2, y: clickedGuiButton.y + clickedGuiButton.h - handleSize/2, type: 'sw'},
              {x: clickedGuiButton.x + clickedGuiButton.w - handleSize/2, y: clickedGuiButton.y + clickedGuiButton.h - handleSize/2, type: 'se'}
            ];
            
            const clickedHandle = handles.find(handle => 
              worldPos.x >= handle.x && worldPos.x <= handle.x + handleSize &&
              worldPos.y >= handle.y && worldPos.y <= handle.y + handleSize
            );
            
            if (clickedHandle) {
              isResizingGuiButton = true;
              resizeHandle = clickedHandle.type;
              draggedGuiButton = clickedGuiButton; // Set draggedGuiButton for resize
              canvas.style.cursor = getResizeCursor(clickedHandle.type);
            } else {
              isDraggingGuiButton = true;
              draggedGuiButton = clickedGuiButton;
              guiButtonDragOffset.x = worldPos.x - clickedGuiButton.x;
              guiButtonDragOffset.y = worldPos.y - clickedGuiButton.y;
              canvas.style.cursor = 'grabbing';
            }
            
            refreshGuiButtonsList();
            redraw();
            return;
          }
        }
        if (activeTab === 'inventory') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          const slots = inventoryDefinition.slots.filter(s => s.id !== '__drawing__');
          const clickedSlot = [...slots].reverse().find(slot =>
            worldPos.x >= slot.x && worldPos.x <= slot.x + slot.w &&
            worldPos.y >= slot.y && worldPos.y <= slot.y + slot.h
          );
          if (clickedSlot) {
            e.preventDefault();
            selectedInventorySlotId = clickedSlot.id;
            const handleSize = 8;
            const handles = [
              { x: clickedSlot.x - handleSize / 2, y: clickedSlot.y - handleSize / 2, type: 'nw' },
              { x: clickedSlot.x + clickedSlot.w - handleSize / 2, y: clickedSlot.y - handleSize / 2, type: 'ne' },
              { x: clickedSlot.x - handleSize / 2, y: clickedSlot.y + clickedSlot.h - handleSize / 2, type: 'sw' },
              { x: clickedSlot.x + clickedSlot.w - handleSize / 2, y: clickedSlot.y + clickedSlot.h - handleSize / 2, type: 'se' }
            ];
            const clickedHandle = handles.find(h =>
              worldPos.x >= h.x && worldPos.x <= h.x + handleSize &&
              worldPos.y >= h.y && worldPos.y <= h.y + handleSize
            );
            if (clickedHandle) {
              isResizingInventorySlot = true;
              resizeInventoryHandle = clickedHandle.type;
              draggedInventorySlot = clickedSlot;
              canvas.style.cursor = getResizeCursor(clickedHandle.type);
            } else {
              isDraggingInventorySlot = true;
              draggedInventorySlot = clickedSlot;
              inventorySlotDragOffset.x = worldPos.x - clickedSlot.x;
              inventorySlotDragOffset.y = worldPos.y - clickedSlot.y;
              canvas.style.cursor = 'grabbing';
            }
            refreshInventorySlotsListUI();
            redraw();
            return;
          }
          if (!isDrawingInventorySlot) {
            return;
          }
        }
        // Check for scaling line drag (only in rooms tab, before scene objects)
        // Reuse activeTab already declared above
        if (activeTab === 'rooms' && showScalingLines && !isDrawingWalkable && !isDrawingHotspot) {
          const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
          const lineType = findScalingLineNear(x, y);
          if (lineType) {
            e.preventDefault();
            isDraggingScalingLine = true;
            draggedScalingLineType = lineType;
            canvas.style.cursor = 'ns-resize';
            redraw();
            return; // Exit early to prevent other handlers
          }
        }
        // Check if clicking on a scene object or room animation (rooms tab only)
        if (activeTab === 'rooms') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          // Lock scene objects / animations if a hotspot is selected
          if (activeHotspotId) {
            return;
          }

          // Selection locks the other type so overlapping items don't steal the drag
          const animLocked = !!selectedSceneObjectId;
          const objectLocked = !!selectedAnimationInstanceId;

          let hit = null;
          if (objectLocked && !animLocked) {
            const animHit = getAnimationInstanceAtPoint(worldPos.x, worldPos.y);
            if (animHit) hit = { type: 'animation', target: animHit };
          } else if (animLocked && !objectLocked) {
            const objHit = getObjectAtPoint(worldPos.x, worldPos.y);
            if (objHit) hit = { type: 'object', target: objHit };
          } else {
            hit = getTopRoomDraggableAtPoint(worldPos.x, worldPos.y);
          }

          // Prefer the currently selected item when the click is on it
          if (selectedAnimationInstanceId && !animLocked) {
            const selectedAnim = animationInstances.find(i => i.id === selectedAnimationInstanceId);
            if (selectedAnim && findAnimationInListAtPoint([selectedAnim], worldPos.x, worldPos.y)) {
              hit = { type: 'animation', target: selectedAnim };
            }
          } else if (selectedSceneObjectId && !objectLocked) {
            const selectedObj = sceneObjects.find(o => o.id === selectedSceneObjectId);
            if (selectedObj && selectedObj.img) {
              const ox = selectedObj.x || 0;
              const oy = selectedObj.y || 0;
              const { w, h } = getImageDrawSize(selectedObj.img);
              if (w && h && worldPos.x >= ox && worldPos.x <= ox + w && worldPos.y >= oy && worldPos.y <= oy + h) {
                hit = { type: 'object', target: selectedObj };
              }
            }
          }

          if (hit && hit.type === 'object') {
            const clickedObject = hit.target;
            e.preventDefault();
            isDraggingObject = true;
            draggedObject = clickedObject;
            selectedSceneObjectId = clickedObject.id;
            selectedAnimationInstanceId = null;
            const objX = (clickedObject.x || 0);
            const objY = (clickedObject.y || 0);
            dragOffset.x = worldPos.x - objX;
            dragOffset.y = worldPos.y - objY;
            refreshSceneObjectsListUI();
            refreshRoomAnimationInstancesListUI();
            canvas.style.cursor = 'grabbing';
            redraw();
          } else if (hit && hit.type === 'animation') {
            const clickedAnim = hit.target;
            e.preventDefault();
            isDraggingAnimationInstance = true;
            draggedAnimationInstance = clickedAnim;
            selectedAnimationInstanceId = clickedAnim.id;
            selectedSceneObjectId = null;
            animationInstanceDragOffset.x = worldPos.x - (clickedAnim.x || 0);
            animationInstanceDragOffset.y = worldPos.y - (clickedAnim.y || 0);
            refreshSceneObjectsListUI();
            refreshRoomAnimationInstancesListUI();
            canvas.style.cursor = 'grabbing';
            redraw();
          }
        }
      }
    });

    canvas.addEventListener('mousemove', function(e) {
      // Don't override cursor / hit hints while dragging room items
      if (!isDraggingObject && !isDraggingAnimationInstance && !isDraggingScalingLine && !editorState.isPanning) {
        checkContextualCursor(e);
        const scalingCursorSet = updateScalingCursor(e);
        if (!scalingCursorSet) {
          updateHotspotCursor(e);
        }
      }
      
      if (editorState.isPanning) {
        e.preventDefault();
        const deltaX = e.clientX - editorState.lastPanX;
        const deltaY = e.clientY - editorState.lastPanY;
        
        editorState.panX += deltaX;
        editorState.panY += deltaY;
        
        editorState.lastPanX = e.clientX;
        editorState.lastPanY = e.clientY;
        
        redraw();
      } else if (isDraggingScalingLine && draggedScalingLineType) {
        if (!isRoomCanvasActive()) {
          isDraggingScalingLine = false;
          draggedScalingLineType = null;
          return;
        }
        // Handle scaling line drag
        e.preventDefault();
        const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
        // Clamp Y to viewport bounds
        const clampedY = Math.max(0, Math.min(gameViewport.height, y));
        
        if (draggedScalingLineType === 'background') {
          // Background line (upper line) - must stay above foreground
          scalingBackgroundY = clampedY;
          // Ensure background is above foreground (background Y < foreground Y)
          if (scalingForegroundY !== null && scalingBackgroundY >= scalingForegroundY) {
            scalingBackgroundY = scalingForegroundY - 1;
          }
        } else if (draggedScalingLineType === 'foreground') {
          // Foreground line (lower line) - must stay below background
          scalingForegroundY = clampedY;
          // Ensure foreground is below background (foreground Y > background Y)
          if (scalingBackgroundY !== null && scalingForegroundY <= scalingBackgroundY) {
            scalingForegroundY = scalingBackgroundY + 1;
          }
        }
        // Save to room
        const r = rooms.get(currentRoomId);
        if (r) {
          r.scalingForegroundY = scalingForegroundY;
          r.scalingBackgroundY = scalingBackgroundY;
        }
        canvas.style.cursor = 'ns-resize';
        redraw();
      } else if (isDraggingObject && draggedObject) {
        if (!isRoomCanvasActive()) {
          isDraggingObject = false;
          draggedObject = null;
          canvas.style.cursor = 'default';
          return;
        }
        // Lock scene objects if a hotspot is selected
        if (activeHotspotId) {
          isDraggingObject = false;
          draggedObject = null;
          canvas.style.cursor = 'default';
          return;
        }
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        
        // Update object position
        draggedObject.x = Math.round(worldPos.x - dragOffset.x);
        draggedObject.y = Math.round(worldPos.y - dragOffset.y);
        
        // Update room data
        const r = rooms.get(currentRoomId); 
        if (r) r.sceneObjects = sceneObjects;
        
        // Update UI position info
        updateSceneObjectUI(draggedObject);
        
        canvas.style.cursor = 'grabbing';
        redraw();
      } else if (isDraggingAnimationInstance && draggedAnimationInstance) {
        if (!isRoomCanvasActive()) {
          isDraggingAnimationInstance = false;
          draggedAnimationInstance = null;
          canvas.style.cursor = 'default';
          return;
        }
        if (activeHotspotId) {
          isDraggingAnimationInstance = false;
          draggedAnimationInstance = null;
          canvas.style.cursor = 'default';
          return;
        }
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        draggedAnimationInstance.x = Math.round(worldPos.x - animationInstanceDragOffset.x);
        draggedAnimationInstance.y = Math.round(worldPos.y - animationInstanceDragOffset.y);
        const r = rooms.get(currentRoomId);
        if (r) r.animationInstances = animationInstances;
        updateAnimationInstanceUI(draggedAnimationInstance);
        canvas.style.cursor = 'grabbing';
        redraw();
      } else if (isDraggingGuiButton && draggedGuiButton) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        
        // Update GUI button position
        draggedGuiButton.x = Math.round(worldPos.x - guiButtonDragOffset.x);
        draggedGuiButton.y = Math.round(worldPos.y - guiButtonDragOffset.y);
        
        refreshGuiButtonsList();
        redraw();
      } else if (isResizingGuiButton && draggedGuiButton) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        
        // Update GUI button size based on resize handle
        const minSize = 20;
        const originalX = draggedGuiButton.x;
        const originalY = draggedGuiButton.y;
        const originalW = draggedGuiButton.w;
        const originalH = draggedGuiButton.h;
        
        switch(resizeHandle) {
          case 'nw':
            const newW_nw = originalW + (originalX - worldPos.x);
            const newH_nw = originalH + (originalY - worldPos.y);
            if (newW_nw >= minSize) { 
              draggedGuiButton.x = worldPos.x; 
              draggedGuiButton.w = newW_nw; 
            }
            if (newH_nw >= minSize) { 
              draggedGuiButton.y = worldPos.y; 
              draggedGuiButton.h = newH_nw; 
            }
            break;
          case 'ne':
            const newW_ne = worldPos.x - originalX;
            const newH_ne = originalH + (originalY - worldPos.y);
            if (newW_ne >= minSize) draggedGuiButton.w = newW_ne;
            if (newH_ne >= minSize) { 
              draggedGuiButton.y = worldPos.y; 
              draggedGuiButton.h = newH_ne; 
            }
            break;
          case 'sw':
            const newW_sw = originalW + (originalX - worldPos.x);
            const newH_sw = worldPos.y - originalY;
            if (newW_sw >= minSize) { 
              draggedGuiButton.x = worldPos.x; 
              draggedGuiButton.w = newW_sw; 
            }
            if (newH_sw >= minSize) draggedGuiButton.h = newH_sw;
            break;
          case 'se':
            draggedGuiButton.w = Math.max(minSize, worldPos.x - originalX);
            draggedGuiButton.h = Math.max(minSize, worldPos.y - originalY);
            break;
        }
        
        refreshGuiButtonsList();
        redraw();
      } else if (isDraggingInventorySlot && draggedInventorySlot) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        draggedInventorySlot.x = Math.round(worldPos.x - inventorySlotDragOffset.x);
        draggedInventorySlot.y = Math.round(worldPos.y - inventorySlotDragOffset.y);
        refreshInventorySlotsListUI();
        redraw();
      } else if (isResizingInventorySlot && draggedInventorySlot) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const minSize = 20;
        const ox = draggedInventorySlot.x;
        const oy = draggedInventorySlot.y;
        const ow = draggedInventorySlot.w;
        const oh = draggedInventorySlot.h;
        switch (resizeInventoryHandle) {
          case 'nw':
            if (ow + (ox - worldPos.x) >= minSize) { draggedInventorySlot.x = worldPos.x; draggedInventorySlot.w = ow + (ox - worldPos.x); }
            if (oh + (oy - worldPos.y) >= minSize) { draggedInventorySlot.y = worldPos.y; draggedInventorySlot.h = oh + (oy - worldPos.y); }
            break;
          case 'ne':
            draggedInventorySlot.w = Math.max(minSize, worldPos.x - ox);
            if (oh + (oy - worldPos.y) >= minSize) { draggedInventorySlot.y = worldPos.y; draggedInventorySlot.h = oh + (oy - worldPos.y); }
            break;
          case 'sw':
            if (ow + (ox - worldPos.x) >= minSize) { draggedInventorySlot.x = worldPos.x; draggedInventorySlot.w = ow + (ox - worldPos.x); }
            draggedInventorySlot.h = Math.max(minSize, worldPos.y - oy);
            break;
          case 'se':
            draggedInventorySlot.w = Math.max(minSize, worldPos.x - ox);
            draggedInventorySlot.h = Math.max(minSize, worldPos.y - oy);
            break;
        }
        refreshInventorySlotsListUI();
        redraw();
      } else if (isDrawingInventorySlot && inventorySlotDrawStart) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const x0 = Math.min(inventorySlotDrawStart.x, worldPos.x);
        const y0 = Math.min(inventorySlotDrawStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - inventorySlotDrawStart.x);
        const h = Math.abs(worldPos.y - inventorySlotDrawStart.y);
        const slots = inventoryDefinition.slots;
        if (slots.length && slots[slots.length - 1].id === '__drawing__') {
          const tmp = slots[slots.length - 1];
          tmp.x = Math.round(x0);
          tmp.y = Math.round(y0);
          tmp.w = Math.round(w);
          tmp.h = Math.round(h);
        }
        redraw();
      } else if (isDrawingGuiButton && guiDrawStart) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const x0 = Math.min(guiDrawStart.x, worldPos.x);
        const y0 = Math.min(guiDrawStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - guiDrawStart.x);
        const h = Math.abs(worldPos.y - guiDrawStart.y);
        if (guiButtons.length && guiButtons[guiButtons.length-1].id === '__drawing__') {
          const tmp = guiButtons[guiButtons.length-1];
          tmp.x = Math.round(x0); tmp.y = Math.round(y0); tmp.w = Math.round(w); tmp.h = Math.round(h);
        }
        redraw();
      }
    });

    canvas.addEventListener('mouseup', function(e) {
      if (editorState.isPanning) {
        editorState.isPanning = false;
        canvas.style.cursor = 'default';
      } else if (isDraggingScalingLine) {
        // Round final coordinates when drag ends
        if (draggedScalingLineType === 'foreground' && scalingForegroundY !== null) {
          scalingForegroundY = Math.round(scalingForegroundY);
        } else if (draggedScalingLineType === 'background' && scalingBackgroundY !== null) {
          scalingBackgroundY = Math.round(scalingBackgroundY);
        }
        // Ensure constraints are still valid after rounding
        if (scalingBackgroundY !== null && scalingForegroundY !== null) {
          if (scalingBackgroundY >= scalingForegroundY) {
            // If they're too close, separate them
            const mid = Math.round((scalingBackgroundY + scalingForegroundY) / 2);
            scalingBackgroundY = mid - 1;
            scalingForegroundY = mid + 1;
          }
        }
        // Save to room
        const r = rooms.get(currentRoomId);
        if (r) {
          r.scalingForegroundY = scalingForegroundY;
          r.scalingBackgroundY = scalingBackgroundY;
        }
        isDraggingScalingLine = false;
        draggedScalingLineType = null;
        canvas.style.cursor = 'default';
        redraw();
      } else if (isDraggingObject) {
        isDraggingObject = false;
        draggedObject = null;
        canvas.style.cursor = 'default';
        redraw();
      } else if (isDraggingAnimationInstance) {
        isDraggingAnimationInstance = false;
        draggedAnimationInstance = null;
        canvas.style.cursor = 'default';
        redraw();
      } else if (isDraggingGuiButton) {
        isDraggingGuiButton = false;
        draggedGuiButton = null;
        canvas.style.cursor = 'default';
        saveCurrentGUI();
        redraw();
      } else if (isResizingGuiButton) {
        isResizingGuiButton = false;
        resizeHandle = null;
        draggedGuiButton = null;
        canvas.style.cursor = 'default';
        saveCurrentGUI();
        redraw();
      } else if (isDraggingInventorySlot) {
        isDraggingInventorySlot = false;
        draggedInventorySlot = null;
        canvas.style.cursor = 'default';
        refreshInventorySlotsListUI();
        redraw();
      } else if (isResizingInventorySlot) {
        isResizingInventorySlot = false;
        resizeInventoryHandle = null;
        draggedInventorySlot = null;
        canvas.style.cursor = 'default';
        refreshInventorySlotsListUI();
        redraw();
      } else if (isDrawingInventorySlot && inventorySlotDrawStart) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const x0 = Math.min(inventorySlotDrawStart.x, worldPos.x);
        const y0 = Math.min(inventorySlotDrawStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - inventorySlotDrawStart.x);
        const h = Math.abs(worldPos.y - inventorySlotDrawStart.y);
        let slot = inventoryDefinition.slots.pop();
        const slotNum = inventoryDefinition.slots.filter(s => s.id !== '__drawing__').length + 1;
        slot = { id: uid('invslot'), name: 'Slot ' + slotNum, x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) };
        if (slot.w >= 8 && slot.h >= 8) {
          inventoryDefinition.slots.push(slot);
          selectedInventorySlotId = slot.id;
          showNotification('Inventory slot created (' + slot.w + 'x' + slot.h + ')', 'success');
        }
        isDrawingInventorySlot = false;
        inventorySlotDrawStart = null;
        refreshInventorySlotsListUI();
        redraw();
      } else if (isDrawingGuiButton && guiDrawStart) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const x0 = Math.min(guiDrawStart.x, worldPos.x);
        const y0 = Math.min(guiDrawStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - guiDrawStart.x);
        const h = Math.abs(worldPos.y - guiDrawStart.y);
        // finalize button
        let btn = guiButtons.pop();
        const name = `Button ${guiButtons.length + 1}`;
        btn = { id: uid('gui'), name, x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h), backgroundImage: null, text: '' };
        guiButtons.push(btn);
        selectedGuiButtonId = btn.id;
        isDrawingGuiButton = false;
        guiDrawStart = null;
        refreshGuiButtonsList();
        if (typeof refreshGuiScriptTargets === 'function') refreshGuiScriptTargets();
        saveCurrentGUI();
        showNotification(`GUI button created (${btn.w}Ã—${btn.h})`, 'success');
        redraw();
      }
    });

    canvas.addEventListener('mouseleave', function(e) {
      if (editorState.isPanning) {
        editorState.isPanning = false;
        canvas.style.cursor = 'default';
      } else if (isDraggingObject) {
        isDraggingObject = false;
        draggedObject = null;
        canvas.style.cursor = 'default';
        redraw();
      } else if (isDraggingAnimationInstance) {
        isDraggingAnimationInstance = false;
        draggedAnimationInstance = null;
        canvas.style.cursor = 'default';
        redraw();
      }
    });

    // Handle right click: copy coordinates to clipboard when in rooms tab
    canvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      
      // Check if we're in the rooms tab
      const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
      if (activeTab === 'rooms') {
        const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);
        
        // Format coordinates as "x, y"
        const coordString = `${roundedX}, ${roundedY}`;
        
        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(coordString).then(() => {
            showNotification(`Coordinates copied: ${coordString}`, 'success');
          }).catch(err => {
            console.error('Errore copia negli appunti:', err);
            showNotification('Error while copying', 'error');
          });
        } else {
          // Fallback per browser che non supportano Clipboard API
          const textArea = document.createElement('textarea');
          textArea.value = coordString;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            showNotification(`Coordinates copied: ${coordString}`, 'success');
          } catch (err) {
            console.error('Errore copia negli appunti (fallback):', err);
            showNotification('Error while copying', 'error');
          }
          document.body.removeChild(textArea);
        }
      }
    });
  }

  // Canvas clicks: add vertices while drawing walkable or hotspot
  canvas.addEventListener('click', (e) => {
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    
    // Handle character / cursor pivot movement first
    if (activeTab === 'cursors' && !e.ctrlKey) {
      const cursor = selectedCursorId
        ? contextualCursors.find(c => c.id === selectedCursorId)
        : null;
      if (cursor && cursor.cursorImage && cursor.cursorImage.complete && cursor.cursorImage.naturalWidth > 0) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
        cursor.pivotX = Math.round(worldPos.x);
        cursor.pivotY = Math.round(worldPos.y);
        updateCursorPivotLabel(cursor);
        redraw();
        showNotification(`Click point moved to (${cursor.pivotX}, ${cursor.pivotY})`, 'info');
        return;
      }
    }

    if (activeTab === 'characters' && !e.ctrlKey) {
      const sel = document.getElementById('character-selector');
      const who = sel ? sel.value : '';
      if (who) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const charData = characterFrames.get(who);
        if (charData) {
          const activeDirections = getCharacterDirectionsStore(charData);
          const dirData = activeDirections ? activeDirections[currentDirection] : null;
          if (dirData && dirData.frames && dirData.frames.length > 0) {
            const frameResult = getFrameImage(dirData.frames[0], activeDirections, 0, currentDirection);
            if (frameResult && frameResult.img) {
              const frameImg = frameResult.img;
              // Frame position in viewport coordinates (now at 0,0)
              const frameDx = 0;
              const frameDy = 0;
              
              // Initialize pivot if it doesn't exist
              if (charData.pivotX === undefined || charData.pivotY === undefined) {
                charData.pivotX = Math.round(frameImg.width / 2);
                charData.pivotY = Math.round(frameImg.height);
                characterFrames.set(who, charData);
              }
              
              // Move pivot to click position (relative to frame top-left)
              // Works like polygon points - always moves pivot on click
              e.preventDefault();
              e.stopPropagation();
              // If frame is mirrored, adjust pivot X coordinate to match visual position
              if (frameResult.mirrored) {
                charData.pivotX = Math.round(frameImg.width - (worldPos.x - frameDx));
              } else {
                charData.pivotX = Math.round(worldPos.x - frameDx);
              }
              charData.pivotY = Math.round(worldPos.y - frameDy);
              characterFrames.set(who, charData);
              redraw();
              showNotification(`Pivot moved to (${charData.pivotX}, ${charData.pivotY})`, 'info');
              return;
            }
          }
        }
      }
    }

    if (activeTab === 'gui') {
      const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
      const hit = guiButtons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (hit) {
        selectedGuiButtonId = hit.id;
        refreshGuiButtonsList();
        redraw();
      }
      return;
    }

    if (!isRoomCanvasActive()) {
      return;
    }
    
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    if (isDrawingWalkable) {
      // Round coordinates only when saving to avoid precision issues
      walkableArea.push({ x: Math.round(x), y: Math.round(y) });
      const r = rooms.get(currentRoomId); if (r) r.walkableArea = walkableArea;
      redraw();
      return;
    }

    if (isDrawingHotspot) {
      if (!activeHotspotId) return; // no target hotspot
      const hs = hotspots.find(h => h.id === activeHotspotId);
      if (!hs) return;
      if (!Array.isArray(hs.points)) hs.points = [];
      // Round coordinates only when saving to avoid precision issues
      hs.points.push({ x: Math.round(x), y: Math.round(y) });
      const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
      refreshHotspotsListUI();
      redraw();
      return;
    }

    // âš ï¸ CAUSA RADICE DEL BUG: Questo blocco gestiva i click durante il playtest
    // sul canvas dell'EDITOR, causando doppia esecuzione perchÃ©:
    // 1. Il listener in main.js gestiva i click sul canvas dell'editor
    // 2. Il listener in runtime.js gestiva i click sul canvas del runtime (finestra separata)
    // 3. Quando il playtest Ã¨ attivo, il runtime dovrebbe essere l'unico a gestire i click
    // 
    // SOLUZIONE: Rimuoviamo completamente la gestione playtest dal listener dell'editor.
    // Il runtime nella finestra separata gestirÃ  TUTTI i click durante il playtest.
    // L'editor gestisce solo click per editing (walkable, hotspot drawing, GUI selection).
    //
    // NOTA: executeScriptHandler() Ã¨ vuoto (non esegue nulla), quindi non causava
    // doppia esecuzione di script, ma triggerObjectClick() e triggerHotspotClick()
    // potevano comunque causare effetti collaterali indesiderati.
    //
    // ORA: Durante il playtest, i click sul canvas dell'editor vengono ignorati
    // per oggetti/hotspot, e solo il runtime gestisce l'interazione.
    if (playTestState && playTestState.isRunning) {
      // Durante il playtest, NON gestiamo click su oggetti/hotspot nel canvas dell'editor.
      // Il runtime nella finestra separata gestisce TUTTA l'interazione durante il playtest.
      // Questo previene doppia esecuzione e conflitti tra editor e runtime.
      return;
    }
  });

  // ===== Walkable vertex interactions =====
  function findWalkableVertexNear(x, y, tolerance = 6) {
    for (let i = 0; i < walkableArea.length; i++) {
      const p = walkableArea[i];
      const dx = p.x - x, dy = p.y - y;
      if (Math.sqrt(dx*dx + dy*dy) <= tolerance) return i;
    }
    return -1;
  }

  // ===== Character scaling line interactions =====
  function findScalingLineNear(x, y, tolerance = 10) {
    if (scalingBackgroundY !== null && Math.abs(y - scalingBackgroundY) <= tolerance) {
      return 'background';
    }
    if (scalingForegroundY !== null && Math.abs(y - scalingForegroundY) <= tolerance) {
      return 'foreground';
    }
    return null;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (editorState.isPanning) return;
    if (!isRoomCanvasActive()) return;
    if (isDrawingWalkable) return; // click aggiunge punti, niente drag mentre disegniamo
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    const idx = findWalkableVertexNear(x, y);
    if (idx >= 0) {
      isDraggingWalkableVertex = true;
      draggedWalkableVertexIndex = idx;
      selectedWalkableVertexIndex = idx;
      canvas.style.cursor = 'grabbing';
      redraw();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDraggingWalkableVertex) return;
    if (!isRoomCanvasActive()) return;
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    const idx = draggedWalkableVertexIndex;
    if (idx < 0 || idx >= walkableArea.length) return;
    // Keep precision during drag, round only when saving
    walkableArea[idx].x = x;
    walkableArea[idx].y = y;
    const r = rooms.get(currentRoomId); if (r) r.walkableArea = walkableArea;
    redraw();
  });

  canvas.addEventListener('mouseup', () => {
    if (isDraggingWalkableVertex) {
      // Round final coordinates when drag ends
      if (draggedWalkableVertexIndex >= 0 && walkableArea[draggedWalkableVertexIndex]) {
        walkableArea[draggedWalkableVertexIndex].x = Math.round(walkableArea[draggedWalkableVertexIndex].x);
        walkableArea[draggedWalkableVertexIndex].y = Math.round(walkableArea[draggedWalkableVertexIndex].y);
        const r = rooms.get(currentRoomId); 
        if (r) r.walkableArea = walkableArea;
      }
      isDraggingWalkableVertex = false;
      draggedWalkableVertexIndex = -1;
      canvas.style.cursor = 'default';
      redraw();
    }
  });

  // Click per selezionare un vertice walkable quando non stiamo disegnando
  canvas.addEventListener('click', (e) => {
    if (!isRoomCanvasActive()) return;
    if (isDrawingWalkable) return; // giÃ  gestito sopra
    if (isDraggingWalkableVertex) return;
    // evita conflitti con hotspot: se stai disegnando hotspot non selezionare walkable
    if (isDrawingHotspot) return;
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    const idx = findWalkableVertexNear(x, y);
    if (idx >= 0) {
      selectedWalkableVertexIndex = idx;
      redraw();
    }
  });

  window.deleteSelectedWalkableVertex = function() {
    if (selectedWalkableVertexIndex < 0) return;
    walkableArea.splice(selectedWalkableVertexIndex, 1);
    selectedWalkableVertexIndex = -1;
    const r = rooms.get(currentRoomId); if (r) r.walkableArea = walkableArea;
    redraw();
  };

  // Walkable area controls
  window.startWalkableDrawing = function() {
    if (!isRoomCanvasActive()) return;
    isDrawingWalkable = true; showWalkable = true; redraw();
  };
  window.finishWalkableDrawing = function() {
    if (!isRoomCanvasActive()) return;
    isDrawingWalkable = false; redraw();
  };
  window.clearWalkableArea = function() {
    if (!isRoomCanvasActive()) return;
    walkableArea = []; redraw();
  };
  window.toggleWalkableVisibility = function() {
    if (!isRoomCanvasActive()) return;
    showWalkable = !showWalkable; redraw();
  };

  // ===== Character scaling controls & UI =====
  // updateScalingUI is defined earlier, before bindRoomRefs

  window.updateScalingValues = function() {
    const minInput = document.getElementById('scaling-min-scale');
    const maxInput = document.getElementById('scaling-max-scale');
    if (minInput) {
      const val = parseFloat(minInput.value);
      if (!isNaN(val) && val >= 0.1 && val <= 2.0) {
        scalingMinScale = val;
      }
    }
    if (maxInput) {
      const val = parseFloat(maxInput.value);
      if (!isNaN(val) && val >= 0.1 && val <= 2.0) {
        scalingMaxScale = val;
      }
    }
    // Save to room
    const r = rooms.get(currentRoomId);
    if (r) {
      r.scalingMinScale = scalingMinScale;
      r.scalingMaxScale = scalingMaxScale;
    }
    redraw();
  };

  window.toggleScalingVisibility = function() {
    try {
      showScalingLines = !showScalingLines;
      if (typeof redraw === 'function') {
        redraw();
      }
    } catch (error) {
      console.error('[Scaling] Error toggling visibility:', error);
    }
  };

  window.initializeScalingLines = function() {
    try {
      // Initialize lines with default positions
      // Background (upper line) at 25% of viewport height
      // Foreground (lower line) at 75% of viewport height
      // Foreground must be BELOW background (foreground Y > background Y)
      if (typeof gameViewport === 'undefined' || !gameViewport) {
        console.error('[Scaling] gameViewport not available');
        return;
      }
      scalingBackgroundY = Math.round(gameViewport.height * 0.25);
      scalingForegroundY = Math.round(gameViewport.height * 0.75);
      // Ensure foreground is below background
      if (scalingForegroundY <= scalingBackgroundY) {
        scalingBackgroundY = Math.round(gameViewport.height * 0.25);
        scalingForegroundY = Math.round(gameViewport.height * 0.75);
      }
      // Save to room
      const r = rooms.get(currentRoomId);
      if (r) {
        r.scalingForegroundY = scalingForegroundY;
        r.scalingBackgroundY = scalingBackgroundY;
      }
      if (typeof redraw === 'function') {
        redraw();
      }
      if (typeof showNotification === 'function') {
        showNotification('Scaling lines initialized', 'success');
      }
    } catch (error) {
      console.error('[Scaling] Error initializing lines:', error);
    }
  };

  // ===== Hotspots controls & UI =====
  const hotspotsListContainer = document.getElementById('hotspots-list');

  function isPointInPolygon(points, px, py){
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function refreshHotspotsListUI() {
    if (!hotspotsListContainer) return;
    hotspotsListContainer.innerHTML = '';

    // Header row with create button can be in HTML; list items here
    hotspots.forEach((hs, idx) => {
      const item = document.createElement('div');
      item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      item.dataset.hotspotId = hs.id;
      const isSelected = activeHotspotId === hs.id;

      const name = document.createElement('div');
      name.innerHTML = `<strong>${hs.name || 'Hotspot'}</strong>`;
      const idRow = document.createElement('div');
      idRow.className = 'd-flex align-items-center gap-1 mt-1 hotspot-id-row';
      const idInput = document.createElement('input');
      idInput.type = 'text';
      idInput.readOnly = true;
      idInput.className = 'form-control form-control-sm hotspot-id-input';
      idInput.value = hs.id;
      idInput.title = 'Hotspot ID â€” select and copy';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-outline-secondary btn-sm btn-copy-hotspot-id py-0 px-1';
      copyBtn.title = 'Copy ID';
      copyBtn.innerHTML = 'Copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = hs.id;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showNotification('Hotspot ID copied!', 'success');
          }).catch(() => {
            idInput.select();
            idInput.setSelectionRange(0, text.length);
            try {
              document.execCommand('copy');
              showNotification('Hotspot ID copied!', 'success');
            } catch (_) {
              showNotification('Failed to copy Hotspot ID', 'error');
            }
          });
        } else {
          idInput.select();
          idInput.setSelectionRange(0, text.length);
          try {
            document.execCommand('copy');
            showNotification('Hotspot ID copied!', 'success');
          } catch (_) {
            showNotification('Failed to copy Hotspot ID', 'error');
          }
        }
      });
      idRow.appendChild(idInput);
      idRow.appendChild(copyBtn);
      name.appendChild(idRow);

      const activeWrap = document.createElement('div');
      activeWrap.className = 'form-check form-check-inline small mt-1';
      const activeChk = document.createElement('input');
      activeChk.type = 'checkbox';
      activeChk.className = 'form-check-input';
      activeChk.id = `hotspot-active-${hs.id}`;
      activeChk.checked = isHotspotRuntimeActive(hs);
      const activeLbl = document.createElement('label');
      activeLbl.className = 'form-check-label text-light';
      activeLbl.htmlFor = activeChk.id;
      activeLbl.textContent = 'Is active?';
      activeLbl.title = 'Active (clickable) in playtest; always visible in editor';
      activeChk.title = activeLbl.title;
      activeChk.addEventListener('change', () => {
        setHotspotRuntimeActive(hs, activeChk.checked);
        const r = rooms.get(currentRoomId);
        if (r) r.hotspots = hotspots;
        item.style.opacity = activeChk.checked ? '1' : '0.55';
        redraw();
      });
      activeWrap.appendChild(activeChk);
      activeWrap.appendChild(activeLbl);
      name.appendChild(activeWrap);
      if (!isHotspotRuntimeActive(hs)) {
        item.style.opacity = '0.55';
      }

      const controls = document.createElement('div');

      const btnSelect = document.createElement('button');
      btnSelect.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
      btnSelect.title = isSelected ? 'Click to deselect' : 'Select hotspot (locks objects & animations)';
      btnSelect.textContent = isSelected ? 'Selected' : 'Select';
      btnSelect.addEventListener('click', () => {
        if (activeHotspotId === hs.id) {
          activeHotspotId = null;
          selectedHotspotVertexIndex = -1;
        } else {
          activeHotspotId = hs.id;
          selectedSceneObjectId = null;
          selectedAnimationInstanceId = null;
          isDrawingHotspot = false;
          selectedHotspotVertexIndex = -1;
        }
        refreshHotspotsListUI();
        refreshSceneObjectsListUI();
        refreshRoomAnimationInstancesListUI();
        redraw();
      });

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-outline-light me-1';
      btnEdit.title = isSelected ? 'Rename' : 'Select before editing';
      btnEdit.textContent = 'Rename';
      btnEdit.disabled = !isSelected;
      btnEdit.addEventListener('click', () => {
        if (!isSelected) {
          showNotification('Select the hotspot before editing it', 'warning');
          return;
        }
        const newName = prompt('Hotspot name:', hs.name || 'Hotspot');
        if (newName && newName.trim() !== '') {
          hs.name = newName.trim();
          const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
          refreshHotspotsListUI();
        }
      });


      const btnClear = document.createElement('button');
      btnClear.className = 'btn btn-sm btn-outline-danger me-1';
      btnClear.title = isSelected ? 'Clear points' : 'Select before editing';
      btnClear.textContent = 'Clear';
      btnClear.disabled = !isSelected;
      btnClear.addEventListener('click', () => {
        if (!isSelected) {
          showNotification('Select the hotspot before editing it', 'warning');
          return;
        }
        hs.points = [];
        if (activeHotspotId === hs.id) selectedHotspotVertexIndex = -1;
        const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
        refreshHotspotsListUI();
        redraw();
      });

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn btn-sm btn-danger';
      btnDelete.title = isSelected ? 'Delete' : 'Select before editing';
      btnDelete.textContent = 'Delete';
      btnDelete.disabled = !isSelected;
      btnDelete.addEventListener('click', () => {
        if (!isSelected) {
          showNotification('Select the hotspot before editing it', 'warning');
          return;
        }
        if (!confirm('Delete this hotspot?')) return;
        const index = hotspots.findIndex(h => h.id === hs.id);
        if (index >= 0) hotspots.splice(index, 1);
        if (activeHotspotId === hs.id) activeHotspotId = hotspots[0] ? hotspots[0].id : null;
        selectedHotspotVertexIndex = -1;
        const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
        refreshHotspotsListUI();
        if (typeof refreshHotspotScriptTargets === 'function') refreshHotspotScriptTargets();
        redraw();
      });

      controls.appendChild(btnSelect);
      controls.appendChild(btnEdit);
      controls.appendChild(btnClear);
      controls.appendChild(btnDelete);

      item.appendChild(name);
      item.appendChild(controls);
      hotspotsListContainer.appendChild(item);
    });

    // Make sortable if SortableJS is available
    if (typeof Sortable !== 'undefined') {
      Sortable.create(hotspotsListContainer, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        filter: 'input,button,label,.form-check',
        preventOnFilter: false,
        onEnd: (evt) => {
          const oldI = evt.oldIndex;
          const newI = evt.newIndex;
          if (oldI === newI) return;
          const moved = hotspots.splice(oldI, 1)[0];
          hotspots.splice(newI, 0, moved);
          const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
          refreshHotspotsListUI();
          redraw();
        }
      });
    }
  }

  window.addHotspot = function() {
    const name = prompt('Hotspot name:', `Hotspot ${hotspots.length + 1}`);
    const hs = {
      id: uid('hotspot'),
      name: name && name.trim() !== '' ? name.trim() : `Hotspot ${hotspots.length + 1}`,
      points: [],
      visible: true,
      scripts: {
        onClick: {
          code: '',
          enabled: false
        }
      }
    };
    hotspots.push(hs);
    activeHotspotId = hs.id;
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    refreshHotspotsListUI();
    if (typeof refreshHotspotScriptTargets === 'function') refreshHotspotScriptTargets();
    redraw();
  };

  window.startHotspotDrawing = function() {
    if (!isRoomCanvasActive()) return;
    if (!activeHotspotId) {
      showNotification('No hotspot selected. Create one first.', 'warning');
      return;
    }
    isDrawingWalkable = false; // ensure mutually exclusive
    isDrawingHotspot = true;
    showHotspots = true;
    redraw();
  };

  window.finishHotspotDrawing = function() {
    if (!isRoomCanvasActive()) return;
    isDrawingHotspot = false;
    redraw();
  };

  window.clearActiveHotspot = function() {
    if (!activeHotspotId) return;
    const hs = hotspots.find(h => h.id === activeHotspotId);
    if (!hs) return;
    hs.points = [];
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    refreshHotspotsListUI();
    redraw();
  };

  window.toggleHotspotsVisibility = function() {
    showHotspots = !showHotspots;
    redraw();
  };

  window.deleteSelectedHotspotVertex = function() {
    if (!activeHotspotId) return;
    if (selectedHotspotVertexIndex < 0) return;
    const hs = hotspots.find(h => h.id === activeHotspotId);
    if (!hs || !Array.isArray(hs.points)) return;
    
    // Don't allow deletion if it would make the polygon invalid (less than 3 points)
    if (hs.points.length <= 3) {
      showNotification('A hotspot must have at least 3 vertices', 'warning');
      return;
    }
    
    hs.points.splice(selectedHotspotVertexIndex, 1);
    selectedHotspotVertexIndex = -1;
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    refreshHotspotsListUI();
    redraw();
    showNotification('Vertex removed from hotspot', 'success');
  };

  // ===== Hotspot vertex interactions (select, drag, delete) =====
  function getActiveHotspotAndLocalXY(clientX, clientY) {
    if (!activeHotspotId) return { hs: null, x: 0, y: 0 };
    const hs = hotspots.find(h => h.id === activeHotspotId);
    if (!hs) return { hs: null, x: 0, y: 0 };
    
    // Use consistent coordinate conversion without rounding for precise positioning
    const worldPos = screenToWorld(clientX, clientY);
    return { hs, x: worldPos.x, y: worldPos.y };
  }

  function findVertexIndexNear(hotspot, x, y, threshold = 10) {
    if (!hotspot.points || hotspot.points.length === 0) return -1;
    
    for (let i = 0; i < hotspot.points.length; i++) {
      const point = hotspot.points[i];
      const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
      if (distance <= threshold) {
        return i;
      }
    }
    return -1;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // only left button for dragging vertices
    if (editorState.isPanning) return; // already handled by panning
    if (!isRoomCanvasActive()) return;
    if (isDrawingWalkable) return; // hotspot vertex editing disabled while drawing walkable

    const { hs, x, y } = getActiveHotspotAndLocalXY(e.clientX, e.clientY);
    if (!hs) return;

    // If currently drawing hotspot, ignore mousedown (click will add points)
    if (isDrawingHotspot) return;

    const idx = findVertexIndexNear(hs, x, y);
    if (idx >= 0) {
      isDraggingHotspotVertex = true;
      draggedHotspotVertexIndex = idx;
      selectedHotspotVertexIndex = idx;
      canvas.style.cursor = 'grabbing';
      redraw();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDraggingHotspotVertex) return;
    if (!isRoomCanvasActive()) return;
    const { hs, x, y } = getActiveHotspotAndLocalXY(e.clientX, e.clientY);
    if (!hs) return;
    const idx = draggedHotspotVertexIndex;
    if (idx < 0 || idx >= hs.points.length) return;
    // Keep precision during drag, round only when saving
    hs.points[idx].x = x;
    hs.points[idx].y = y;
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    redraw();
  });

  canvas.addEventListener('mouseup', () => {
    if (isDraggingHotspotVertex) {
      // Round final coordinates when drag ends
      if (draggedHotspotVertexIndex >= 0) {
        const hs = hotspots.find(h => h.id === activeHotspotId);
        if (hs && hs.points[draggedHotspotVertexIndex]) {
          hs.points[draggedHotspotVertexIndex].x = Math.round(hs.points[draggedHotspotVertexIndex].x);
          hs.points[draggedHotspotVertexIndex].y = Math.round(hs.points[draggedHotspotVertexIndex].y);
          const r = rooms.get(currentRoomId); 
          if (r) r.hotspots = hotspots;
        }
      }
      isDraggingHotspotVertex = false;
      draggedHotspotVertexIndex = -1;
      canvas.style.cursor = 'default';
      redraw();
    }
  });

  // Helper function to find the closest edge of a hotspot polygon
  function findClosestEdgeIndex(hotspot, x, y, threshold = 15) {
    if (!hotspot.points || hotspot.points.length < 2) return -1;
    
    let closestEdgeIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < hotspot.points.length; i++) {
      const p1 = hotspot.points[i];
      const p2 = hotspot.points[(i + 1) % hotspot.points.length];
      
      // Calculate distance from point to line segment
      const distance = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
      
      if (distance < minDistance && distance <= threshold) {
        minDistance = distance;
        closestEdgeIndex = i;
      }
    }
    
    return closestEdgeIndex;
  }

  // Helper function to calculate distance from point to line segment
  function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Line segment is actually a point
      return Math.sqrt(A * A + B * B);
    }
    
    const param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Click to select a vertex when not drawing
  canvas.addEventListener('click', (e) => {
    if (!isRoomCanvasActive()) return;
    if (isDrawingWalkable) return; // handled earlier
    if (isDrawingHotspot) return; // handled earlier for adding points
    if (isDraggingHotspotVertex) return; // avoid double triggering after drag
    
    const { hs, x, y } = getActiveHotspotAndLocalXY(e.clientX, e.clientY);
    if (!hs) return;
    
    // First check if clicking near an existing vertex
    const vertexIdx = findVertexIndexNear(hs, x, y);
    if (vertexIdx >= 0) {
      selectedHotspotVertexIndex = vertexIdx;
      redraw();
      return;
    }
    
    // If not near a vertex, check if clicking on an edge to add a new vertex
    const edgeIdx = findClosestEdgeIndex(hs, x, y);
    if (edgeIdx >= 0) {
      // Add new vertex after the edge
      const newVertex = { x: Math.round(x), y: Math.round(y) };
      hs.points.splice(edgeIdx + 1, 0, newVertex);
      selectedHotspotVertexIndex = edgeIdx + 1;
      
      // Update room data
      const r = rooms.get(currentRoomId); 
      if (r) r.hotspots = hotspots;
      
      redraw();
      showNotification('Vertex added to hotspot', 'success');
    }
  });

  // Update cursor based on hotspot editing context
  function updateHotspotCursor(e) {
    // Only update cursor if we're in the rooms tab and not currently dragging
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    if (activeTab !== 'rooms' || isDraggingHotspotVertex || editorState.isPanning) return;
    
    const { hs, x, y } = getActiveHotspotAndLocalXY(e.clientX, e.clientY);
    if (!hs) {
      canvas.style.cursor = 'default';
      return;
    }
    
    // Check if mouse is over a vertex
    const vertexIdx = findVertexIndexNear(hs, x, y);
    if (vertexIdx >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    
    // Check if mouse is over an edge
    const edgeIdx = findClosestEdgeIndex(hs, x, y);
    if (edgeIdx >= 0) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    
    // Default cursor
    canvas.style.cursor = 'default';
  }

  function updateScalingCursor(e) {
    // Only update cursor if we're in the rooms tab and not currently dragging
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    if (activeTab !== 'rooms' || isDraggingScalingLine || editorState.isPanning || !showScalingLines) {
      return false; // Return false to indicate cursor was not set
    }
    
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    const lineType = findScalingLineNear(x, y);
    if (lineType) {
      canvas.style.cursor = 'ns-resize';
      return true; // Return true to indicate cursor was set
    }
    
    return false; // Return false to indicate cursor was not set
  }

  // Keyboard shortcuts for hotspot vertex editing
  document.addEventListener('keydown', (e) => {
    // Only handle if we're in the rooms tab and have an active hotspot
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    if (activeTab !== 'rooms' || !activeHotspotId) return;
    
    // Delete key - delete selected hotspot vertex
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedHotspotVertexIndex >= 0) {
        e.preventDefault();
        deleteSelectedHotspotVertex();
      }
    }
    
    // Escape key - deselect vertex
    if (e.key === 'Escape') {
      if (selectedHotspotVertexIndex >= 0) {
        e.preventDefault();
        selectedHotspotVertexIndex = -1;
        redraw();
      }
    }
  });

  // Fit canvas to screen (centered, like inventory preview)
  window.fitToScreen = function() {
    resetEditorViewCentered({ fit: true });
    showNotification(`Canvas fitted to screen (${Math.round(editorState.zoom * 100)}%)`, 'info');
  };

  // Reset editor zoom and pan â€” 100% con (0,0) in alto a sinistra
  window.resetEditorZoom = function() {
    alignEditorViewTopLeft();
    showNotification('Viewport at 100% with top-left corner aligned', 'info');
  };

  // Zoom in function
  window.zoomIn = function() {
    const oldZoom = editorState.zoom;
    editorState.zoom = Math.min(3.0, editorState.zoom * 1.2);
    if (editorState.zoom !== oldZoom) {
      updateEditorDisplay();
      redraw();
      showNotification(`Zoom: ${Math.round(editorState.zoom * 100)}%`, 'info');
    }
  };

  // Zoom out function
  window.zoomOut = function() {
    const oldZoom = editorState.zoom;
    editorState.zoom = Math.max(0.1, editorState.zoom / 1.2);
    if (editorState.zoom !== oldZoom) {
      updateEditorDisplay();
      redraw();
      showNotification(`Zoom: ${Math.round(editorState.zoom * 100)}%`, 'info');
    }
  };

  // Center view function
  window.centerView = function() {
    resetEditorViewCentered({ zoom: editorState.zoom });
    showNotification('View centered', 'info');
  };

  // Foreground UI list management (sortable and with delete)
  function refreshForegroundListUI() {
    if (!fgListContainer) return;

    fgListContainer.innerHTML = ""; // reset
    const title = document.createElement("h6");
    title.textContent = "Foreground Layers";
    title.style.color = "#eee";
    fgListContainer.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "list-group";
    ul.style.background = "transparent";

    if (foregrounds.length > 0 && selectedForegroundId && !foregrounds.some(f => f.id === selectedForegroundId)) {
      selectedForegroundId = null;
    }
    if (foregrounds.length === 0) {
      selectedForegroundId = null;
    }
    // Assicura che i foreground siano sempre sincronizzati con la room
    const r = rooms.get(currentRoomId);
    if (r) r.foregrounds = foregrounds;

    foregrounds.forEach((layer, idx) => {
      const layerId = layer.id || uid("fg");
      layer.id = layerId;
      const isSelected = selectedForegroundId === layerId;

      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center bg-secondary text-light";
      li.dataset.index = idx;
      if (isSelected) {
        li.classList.add('border', 'border-info');
      }

      const label = document.createElement("span");
      label.textContent = layer.name || `Layer ${idx + 1}`;
      label.style.userSelect = "none";

      const controls = document.createElement("div");

      const selectBtn = document.createElement("button");
      selectBtn.className = isSelected ? "btn btn-sm btn-success me-1" : "btn btn-sm btn-outline-success me-1";
      selectBtn.textContent = isSelected ? "Selected" : "Select";
      selectBtn.title = isSelected ? "Click to deselect" : "Make this layer editable";
      selectBtn.addEventListener("click", () => {
        selectedForegroundId = isSelected ? null : layerId;
        refreshForegroundListUI();
        redraw();
      });

      // delete
      const del = document.createElement("button");
      del.className = "btn btn-sm btn-danger ms-2";
      del.textContent = "Delete";
      del.title = "Delete layer";
      del.addEventListener("click", async () => {
        if (!isSelected) {
          showNotification('Select the layer before modifying it', 'warning');
          return;
        }
        
        // Salva il layer prima di eliminarlo per poter eliminare l'asset
        const layerToDelete = foregrounds[idx];
        
        // Elimina l'asset dallo storage locale se presente
        if (layerToDelete && layerToDelete.img) {
          try {
            await deleteAssetFromImage(layerToDelete.img);
          } catch (error) {
            console.error('[Asset] Errore eliminazione asset foreground:', error);
            // Continua comunque con l'eliminazione del layer anche se l'asset non viene eliminato
          }
        }
        
        foregrounds.splice(idx, 1);
        const r = rooms.get(currentRoomId);
        if (r) r.foregrounds = foregrounds;
        if (selectedForegroundId === layerId) {
          selectedForegroundId = foregrounds[0] ? foregrounds[0].id : null;
        }
        refreshForegroundListUI();
        redraw();
      });

      // optional: move up/down buttons (keyboard users)
      const up = document.createElement("button");
      up.className = "btn btn-sm btn-outline-light me-1";
      up.textContent = "Up";
      up.title = "Move up";
      up.addEventListener("click", () => {
        if (!isSelected) {
          showNotification('Select the layer before modifying it', 'warning');
          return;
        }
        if (idx <= 0) return;
        [foregrounds[idx - 1], foregrounds[idx]] = [foregrounds[idx], foregrounds[idx - 1]];
        const r = rooms.get(currentRoomId);
        if (r) r.foregrounds = foregrounds;
        refreshForegroundListUI();
        redraw();
      });

      const down = document.createElement("button");
      down.className = "btn btn-sm btn-outline-light me-1";
      down.textContent = "Down";
      down.title = "Move down";
      down.addEventListener("click", () => {
        if (!isSelected) {
          showNotification('Select the layer before modifying it', 'warning');
          return;
        }
        if (idx >= foregrounds.length - 1) return;
        [foregrounds[idx + 1], foregrounds[idx]] = [foregrounds[idx], foregrounds[idx + 1]];
        const r = rooms.get(currentRoomId);
        if (r) r.foregrounds = foregrounds;
        refreshForegroundListUI();
        redraw();
      });

      if (!isSelected) {
        up.disabled = true;
        down.disabled = true;
        del.disabled = true;
        up.title = down.title = del.title = "Select the layer to modify it";
      }

      controls.appendChild(selectBtn);
      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(del);

      li.appendChild(label);
      li.appendChild(controls);
      ul.appendChild(li);
    });

    fgListContainer.appendChild(ul);

    // make sortable with SortableJS if available
    if (typeof Sortable !== "undefined") {
      Sortable.create(ul, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
          const oldI = evt.oldIndex;
          const newI = evt.newIndex;
          if (oldI === newI) return;
          const moved = foregrounds.splice(oldI, 1)[0];
          foregrounds.splice(newI, 0, moved);
          const r = rooms.get(currentRoomId);
          if (r) r.foregrounds = foregrounds;
          refreshForegroundListUI();
          redraw();
        }
      });
    } else {
      // If Sortable not loaded, just warn
      // console.warn("SortableJS not found: drag & drop disabled for layers.");
    }
  }

  // ===== Rooms Manager (create/rename/delete/select) =====
  function refreshRoomsSelector() {
    const sel = document.getElementById('rooms-selector');
    if (!sel) return;
    sel.innerHTML = '';
    rooms.forEach((room) => {
      const opt = document.createElement('option');
      opt.value = room.id;
      opt.textContent = room.name || room.id;
      if (room.id === currentRoomId) opt.selected = true;
      sel.appendChild(opt);
    });
    refreshRoomIdDisplay();
  }

  function refreshRoomIdDisplay() {
    const roomIdInput = document.getElementById('room-id-display');
    if (!roomIdInput) return;
    if (currentRoomId) {
      roomIdInput.value = currentRoomId;
    } else {
      roomIdInput.value = '';
    }
  }

  window.copyRoomId = function() {
    const roomIdInput = document.getElementById('room-id-display');
    if (!roomIdInput || !roomIdInput.value) {
      showNotification('No room selected', 'warning');
      return;
    }
    roomIdInput.select();
    roomIdInput.setSelectionRange(0, 99999); // Per mobile
    try {
      document.execCommand('copy');
      showNotification('Room ID copied to clipboard!', 'success');
    } catch (err) {
      // Fallback per browser moderni
      navigator.clipboard.writeText(roomIdInput.value).then(() => {
        showNotification('Room ID copied to clipboard!', 'success');
      }).catch(() => {
        showNotification('Failed to copy Room ID', 'error');
      });
    }
  };

  window.createRoom = function() {
    const name = prompt('Room name:', `Room ${rooms.size + 1}`);
    if (!name) return;
    const rid = uid('room');
    const prevRoomId = currentRoomId;
    rooms.set(rid, { id: rid, name, background: null, foregrounds: [], sceneObjects: [], animationInstances: [], walkableArea: [], hotspots: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
    currentRoomId = rid;
    bindRoomRefs();
    refreshForegroundListUI();
    refreshSceneObjectsListUI();
    refreshHotspotsListUI();
    refreshRoomsSelector();
    refreshRoomIdDisplay();
    redraw();
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch(_) {}
    const roomScript = roomScripts.get(rid);
    if (roomScript) {
      const content = jsScripts.get(roomScript);
      executeScriptHandler(content, 'on_room_change', [prevRoomId, rid]);
    }
    notifyEditorProjectChanged();
  };

  window.renameRoom = function() {
    const r = rooms.get(currentRoomId); if (!r) return;
    const name = prompt('New room name:', r.name || 'Room');
    if (!name) return;
    r.name = name;
    refreshRoomsSelector();
    notifyEditorProjectChanged();
  };

  window.deleteRoom = async function() {
    if (rooms.size <= 1) { showNotification('At least one room is required', 'warning'); return; }
    if (!confirm('Delete current room?')) return;
    
    const prevRoomId = currentRoomId;
    const roomToDelete = rooms.get(currentRoomId);
    
    // Elimina tutti gli asset della stanza dallo storage locale
    if (roomToDelete) {
      try {
        // Elimina background
        if (roomToDelete.background) {
          await deleteAssetFromImage(roomToDelete.background);
        }
        
        // Elimina foregrounds
        if (roomToDelete.foregrounds && Array.isArray(roomToDelete.foregrounds)) {
          for (const fg of roomToDelete.foregrounds) {
            if (fg.img) {
              await deleteAssetFromImage(fg.img);
            }
          }
        }
        
        // Elimina scene objects
        if (roomToDelete.sceneObjects && Array.isArray(roomToDelete.sceneObjects)) {
          for (const obj of roomToDelete.sceneObjects) {
            if (obj.img) {
              await deleteAssetFromImage(obj.img);
            }
          }
        }
      } catch (error) {
        console.error('[Asset] Errore eliminazione asset stanza:', error);
        // Continua comunque con l'eliminazione della stanza
      }
    }
    
    rooms.delete(currentRoomId);
    // pick another existing room
    const first = rooms.keys().next().value;
    currentRoomId = first;
    bindRoomRefs();
    refreshForegroundListUI();
    refreshSceneObjectsListUI();
    refreshHotspotsListUI();
    refreshRoomsSelector();
    refreshRoomIdDisplay();
    redraw();
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch(_) {}
    const roomScript = roomScripts.get(first);
    if (roomScript) {
      const content = jsScripts.get(roomScript);
      executeScriptHandler(content, 'on_room_change', [prevRoomId, first]);
    }
    notifyEditorProjectChanged();
  };

window.selectRoom = function(roomId) {
    if (!rooms.has(roomId)) return;
    const prevRoomId = currentRoomId;
    const roomScript = roomScripts.get(roomId);
    if (prevRoomId !== roomId && roomScript) {
      const content = jsScripts.get(roomScript);
      executeScriptHandler(content, 'on_before_room_change', [prevRoomId, roomId]);
    }
    currentRoomId = roomId;
    bindRoomRefs();
    refreshForegroundListUI();
    refreshSceneObjectsListUI();
    refreshRoomAnimationInstancesListUI();
    refreshRoomAnimationPickerUI();
    refreshHotspotsListUI();
    refreshRoomsSelector();
    refreshRoomIdDisplay();
    redraw();
    
    // Trigger global room change event
    if (prevRoomId !== roomId) {
      triggerRoomChange(prevRoomId, roomId);
    }
    
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch(_) {}
    if (roomScript) {
      const content = jsScripts.get(roomScript);
      executeScriptHandler(content, 'on_room_change', [prevRoomId, roomId]);
    }
  };

  // Util helper to create unique id
  function uid(prefix = "id") {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function getStableProjectId(settings, fallbackName) {
    if (settings && settings.id) return String(settings.id);
    if (fallbackName) return normalizeProjectIdFromName(fallbackName);
    return null;
  }

  function findProjectCacheIndex(projects, { name, id }) {
    if (!Array.isArray(projects)) return -1;
    return projects.findIndex((p) => {
      if (!p) return false;
      const pName = (p.settings && p.settings.name) ? p.settings.name : '';
      const pId = p.id || (p.settings && p.settings.id) || normalizeProjectIdFromName(pName);
      if (id && pId === id) return true;
      if (name && pName === name) return true;
      return false;
    });
  }

  function removeProjectFromEditorCache(projectName, projectId) {
    if (!currentUser || !projectName) return;

    const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
    const deletedFilePath = getProjectFilePath(projectName);
    const activeName = localStorage.getItem('amiantoActiveProjectName');
    const activeId = localStorage.getItem('amiantoActiveProjectId');
    const isActiveProject = activeName === projectName
      || (projectId && activeId && activeId === projectId);

    try { localStorage.removeItem(projectKey); } catch (_) {}
    try { localStorage.removeItem(`${projectKey}_meta`); } catch (_) {}
    try { localStorage.removeItem(getProjectFilePathKey(projectName)); } catch (_) {}
    projectFileHandles.delete(projectName);

    if (isActiveProject) {
      const activeFile = localStorage.getItem('amiantoActiveProjectFile');
      if (deletedFilePath && activeFile === deletedFilePath) {
        try { localStorage.removeItem('amiantoActiveProjectFile'); } catch (_) {}
      }
      try { localStorage.removeItem('amiantoActiveProjectName'); } catch (_) {}
      try { localStorage.removeItem('amiantoActiveProjectOwner'); } catch (_) {}
      try { localStorage.removeItem('amiantoActiveProjectId'); } catch (_) {}
      try { localStorage.removeItem('amiantoLastSavedProjectJson'); } catch (_) {}
      try { localStorage.removeItem('amiantoProjectSettings'); } catch (_) {}
    }
  }

  function removeProjectLocalBackup(username, projectName) {
    if (!username || !projectName) return;
    removeProjectFromEditorCache(projectName);
  }

  function clearInMemoryProjectState() {
    jsScripts.clear();
    objectScripts.clear();
    roomScripts.clear();
    characterScripts.clear();
    inventoryScripts.clear();
    hotspotScripts.clear();
    if (typeof guiScripts !== 'undefined' && guiScripts.clear) guiScripts.clear();
    refreshScriptSelector();
    rebuildScriptsTree();
  }

  function clearEditorWorkspaceAfterProjectRemoved() {
    rooms = new Map();
    currentRoomId = null;
    background = null;
    foregrounds = [];
    sceneObjects = [];
    animationInstances = [];
    guis = [];
    roomAnimationsCatalog.clear();
    selectedRoomAnimationId = null;
    characters = [];
    contextualCursors = [];
    selectedCursorId = null;
    enableOtherTabs(false);
    const indicator = document.getElementById('projectSizeIndicator');
    if (indicator) indicator.style.display = 'none';
  }

  function refreshActiveProjectNameInUi() {
    const el = document.getElementById('current-project-name');
    const activeName = localStorage.getItem('amiantoActiveProjectName');
    if (el && activeName) el.textContent = activeName;
  }

  function getProjectIdFromCacheByName(projectName) {
    try {
      if (!currentUser || !currentUser.username || !projectName) return null;
      const projects = loadProjectsFromCache(currentUser.username);
      const idx = findProjectCacheIndex(projects, { name: projectName, id: null });
      if (idx < 0) return null;
      const p = projects[idx];
      const id = (p && (p.id || (p.settings && p.settings.id))) ? String(p.id || p.settings.id) : null;
      return id || null;
    } catch (_) {
      return null;
    }
  }

  function getActiveProjectId() {
    const stored = localStorage.getItem('amiantoActiveProjectId');
    if (stored) return stored;
    const projectName = localStorage.getItem('amiantoActiveProjectName');
    if (!projectName) return null;
    return normalizeProjectIdFromName(projectName);
  }

  async function pickResourceImage(options = {}) {
    if (!window.amiantoResources || !window.amiantoResources.pick) {
      showNotification('Resources unavailable. Reload the page.', 'warning');
      return options.multiple ? [] : null;
    }
    return window.amiantoResources.pick(options);
  }
  window.pickAmiantoResourceImage = pickResourceImage;

  async function loadImageFromResourceEntry(resource) {
    if (!resource) return null;
    const img = await window.amiantoResources.loadImageFromResource(resource);
    window.amiantoResources.registerImageAsset(img, resource);
    return img;
  }

  async function deleteFirestoreAssetDoc(projectId, assetId) {
    if (!projectId || !assetId) return true;
    const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
    if (!storage || !storage.deleteAsset) return true;
    try {
      let metadata = null;
      if (storage.getAssetMetadata) {
        metadata = await storage.getAssetMetadata(projectId, assetId);
      } else if (storage.listProjectAssetMetadata) {
        const all = await storage.listProjectAssetMetadata(projectId);
        metadata = all.find((entry) => entry.assetId === assetId) || null;
      }
      if (!metadata) return true;
      return await storage.deleteAsset(
        projectId,
        metadata.type || 'sprite',
        metadata.fileName || `${assetId}.png`,
        null,
        metadata.subfolder || null
      );
    } catch (err) {
      console.warn('[Asset] Errore eliminazione metadata locale:', err);
      return false;
    }
  }

  // ==== Handlers for Add Background / Add Foreground buttons ====
  const btnAddBg = document.getElementById("btn-add-bg");
  const btnAddFg = document.getElementById("btn-add-fg");

  if (btnAddBg) {
    btnAddBg.addEventListener("click", async () => {
        if (!currentUser || !currentUser.uid) {
          showNotification('Open a project to select images', 'warning');
          return;
        }
        const projectId = getActiveProjectId();
        if (!projectId) return;

        const resource = await pickResourceImage({ title: 'Select background from Resources' });
        if (!resource) return;
        
        try {
          showNotification('Loading background...', 'info');

          const room = rooms.get(currentRoomId);
          if (room && room.background) {
            imageAssetMap.delete(room.background);
          }
          
          const img = await loadImageFromResourceEntry(resource);
          if (!img) {
            throw new Error('Failed to load image from Resources');
          }
          
          // Verifica che l'immagine sia completamente caricata
          if (!img.complete || (img.naturalWidth === 0 && img.width === 0) || (img.naturalHeight === 0 && img.height === 0)) {
            console.warn('[Background] Immagine non completamente caricata, aspetto...', {
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              width: img.width,
              height: img.height
            });
            
            // Aspetta che l'immagine sia caricata
            await new Promise((resolve, reject) => {
              if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                resolve();
              } else {
                const timeout = setTimeout(() => {
                  reject(new Error('Timeout waiting for image to load'));
                }, 10000);
                
                img.onload = () => {
                  clearTimeout(timeout);
                  resolve();
                };
                img.onerror = (error) => {
                  clearTimeout(timeout);
                  reject(new Error('Failed to load image'));
                };
              }
            });
          }
          
          // Verifica le dimensioni finali
          const finalWidth = img.naturalWidth || img.width;
          const finalHeight = img.naturalHeight || img.height;
          
          if (!finalWidth || !finalHeight) {
            throw new Error(`Image loaded but has invalid dimensions: ${finalWidth}Ã—${finalHeight}`);
          }
          
          console.log('[Background] Immagine caricata con successo:', {
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            width: img.width,
            height: img.height,
            finalWidth,
            finalHeight
          });
          
          // Imposta come background corrente (riferimento a Resources)
          background = img;
          if (room) room.background = img;
          
          showNotification(`Background set: ${finalWidth}Ã—${finalHeight}`, 'success');
          redraw();
        } catch (error) {
          console.error('[Asset] Errore background da Resources:', error);
          showNotification(`Background error: ${error.message}`, 'error');
        }
    });
  } else {
    // console.warn("btn-add-bg not found");
  }

  if (btnAddFg) {
    btnAddFg.addEventListener("click", async () => {
        if (!currentUser || !currentUser.uid) {
          showNotification('Open a project to select images', 'warning');
          return;
        }
        if (!getActiveProjectId()) return;

        const resource = await pickResourceImage({ title: 'Select foreground from Resources' });
        if (!resource) return;

        try {
          showNotification('Loading foreground...', 'info');
          const selectedLayer = foregrounds.find(fg => fg.id === selectedForegroundId);
          const img = await loadImageFromResourceEntry(resource);
          if (!img) throw new Error('Failed to load image from Resources');

          const r = rooms.get(currentRoomId);
          if (selectedLayer) {
            selectedLayer.img = img;
            if (r) r.foregrounds = foregrounds;
          } else {
            const layer = {
              id: uid("fg"),
              name: resource.displayName || `Layer ${foregrounds.length + 1}`,
              img: img,
              offsetX: 0,
              offsetY: 0
            };
            foregrounds.push(layer);
            if (r) r.foregrounds = foregrounds;
            selectedForegroundId = layer.id;
          }

          refreshForegroundListUI();
          showNotification(selectedLayer ? 'Foreground replaced' : 'Foreground added', 'success');
          redraw();
        } catch (error) {
          console.error('[Asset] Errore foreground da Resources:', error);
          showNotification(`Foreground error: ${error.message}`, 'error');
        }
    });
  } else {
    // console.warn("btn-add-fg not found");
  }

  // Helper function for resize cursor
  function getResizeCursor(handle) {
    switch(handle) {
      case 'nw': return 'nw-resize';
      case 'ne': return 'ne-resize';
      case 'sw': return 'sw-resize';
      case 'se': return 'se-resize';
      default: return 'default';
    }
  }

  // initial UI refresh if container exists
  refreshForegroundListUI();
  // Bind GUI buttons
  const btnAddGuiBg = document.getElementById('btn-add-gui-bg');
  const btnNewGuiButton = document.getElementById('btn-new-gui-button');
  const btnDeleteGuiButton = document.getElementById('btn-delete-gui-button');
  const guiTypeSelect = document.getElementById('gui-type-select');
  const guiSettingsContainer = document.getElementById('gui-settings-container');

  function cancelGuiButtonDrawing() {
    if (!isDrawingGuiButton) return;
    isDrawingGuiButton = false;
    guiDrawStart = null;
    if (guiButtons.length && guiButtons[guiButtons.length - 1].id === '__drawing__') {
      guiButtons.pop();
    }
  }

  function updateGuiToolbarForType(guiType) {
    const isDialogBox = guiType === 'DialogBox';
    [btnAddGuiBg, btnNewGuiButton, btnDeleteGuiButton].forEach((btn) => {
      if (btn) btn.disabled = isDialogBox;
    });
    if (isDialogBox) cancelGuiButtonDrawing();
  }

  if (btnAddGuiBg) {
    btnAddGuiBg.addEventListener('click', async () => {
        if (guiTypeSelect && guiTypeSelect.value === 'DialogBox') return;
        if (!currentUser) {
          showNotification('Open a project to select images', 'warning');
          return;
        }
        if (!getActiveProjectId()) {
          showNotification('No project is open', 'warning');
          return;
        }

        const resource = await pickResourceImage({ title: 'Select GUI background from Resources' });
        if (!resource) return;

        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        try {
          const img = await loadImageFromResourceEntry(resource);
          if (!img) throw new Error('Failed to load image from Resources');
          guiBackground = img;
          if (gui) gui.background = img;
          saveCurrentGUI();
          showNotification('GUI background set', 'success');
          redraw();
        } catch (error) {
          console.error('[Asset] Errore GUI background da Resources:', error);
          showNotification(`GUI background error: ${error.message}`, 'error');
        }
    });
  }

  if (btnNewGuiButton) {
    btnNewGuiButton.addEventListener('click', () => {
      if (guiTypeSelect && guiTypeSelect.value === 'DialogBox') return;
      // start drawing mode
      isDrawingGuiButton = true;
      guiDrawStart = null;
      // add a temporary placeholder for live preview
      guiButtons.push({ id: '__drawing__', name: 'Drawing...', x: 0, y: 0, w: 0, h: 0 });
      showNotification('Click and drag on canvas to draw a GUI button', 'info');
    });
  }
  if (guiTypeSelect) {
    guiTypeSelect.addEventListener('change', () => {
      const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
      const newType = guiTypeSelect.value || 'MainInterface';
      const existingSettings = gui && gui.settings ? gui.settings : {};
      renderGuiSettingsPanel(newType, existingSettings);
      if (gui) {
        gui.type = newType;
        gui.settings = collectGuiSettingsFromUI(newType);
        saveCurrentGUI();
      }
      updateGuiToolbarForType(newType);
    });
  }
  if (guiSettingsContainer) {
    const onChange = () => {
      const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
      const type = (guiTypeSelect && guiTypeSelect.value) ? guiTypeSelect.value : (gui && gui.type) || 'MainInterface';
      const settings = collectGuiSettingsFromUI(type);
      if (gui) {
        gui.settings = settings;
        saveCurrentGUI();
      }
    };
    guiSettingsContainer.addEventListener('input', onChange);
    guiSettingsContainer.addEventListener('change', onChange);
  }

  const DIALOG_FONT_SIZE_MIN = 8;
  const DIALOG_FONT_SIZE_MAX = 96;
  const DIALOG_FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

  function clampDialogFontSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 16;
    return Math.max(DIALOG_FONT_SIZE_MIN, Math.min(DIALOG_FONT_SIZE_MAX, Math.round(n)));
  }

  function fontFamilyFromFileName(fileName) {
    const base = String(fileName || 'CustomFont').replace(/\.[^.]+$/, '');
    const safe = base.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'CustomFont';
    return `Amianto_${safe}`;
  }

  const dialogFontFaceRegistry = new Set();

  async function resolveDialogFontUrl(fontRef, projectId) {
    if (!fontRef || typeof fontRef !== 'string') return null;
    if (fontRef.startsWith('data:') || fontRef.startsWith('http')) return fontRef;
    if (fontRef.startsWith('asset:')) {
      const assetId = fontRef.replace('asset:', '');
      return await resolveAssetUrl(projectId, assetId);
    }
    return fontRef;
  }

  async function registerDialogFontFace(fontFamily, fontUrl) {
    if (!fontFamily || !fontUrl) return false;
    const regKey = `${fontFamily}|${fontUrl}`;
    if (dialogFontFaceRegistry.has(regKey)) return true;
    try {
      if (typeof FontFace !== 'undefined' && document.fonts) {
        const face = new FontFace(fontFamily, `url(${fontUrl})`);
        await face.load();
        document.fonts.add(face);
        dialogFontFaceRegistry.add(regKey);
        return true;
      }
    } catch (err) {
      console.warn('[GUI] Dialog font load failed:', err);
    }
    return false;
  }

  async function hydrateDialogBoxFont(settings, projectId) {
    if (!settings || !settings.customFont || !settings.fontFamily) return;
    const url = await resolveDialogFontUrl(settings.customFont, projectId);
    if (url) await registerDialogFontFace(settings.fontFamily, url);
  }

  function normalizeDialogBoxSettings(settings) {
    const s = settings || {};
    const legacyBg = s.background || s.backgroundColor;
    return {
      balloon: s.balloon || '',
      balloonImage: s.balloonImage || null,
      backgroundColor: s.backgroundColor || cssColorToHex(legacyBg, '#1a1a2e'),
      textColor: s.textColor || '#ffffff',
      boxBorderColor: s.boxBorderColor || '#39ff14',
      fontSize: clampDialogFontSize(s.fontSize),
      fontFamily: (typeof s.fontFamily === 'string' && s.fontFamily.trim()) ? s.fontFamily.trim() : '',
      customFont: (typeof s.customFont === 'string' && s.customFont.trim()) ? s.customFont.trim() : '',
      appear: s.appear || 'instant'
    };
  }

  function cssColorToHex(color, fallback = '#000000') {
    if (!color || typeof color !== 'string') return fallback;
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const r = trimmed[1], g = trimmed[2], b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const toHex = (n) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, '0');
      return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
    }
    return fallback;
  }

  function bindColorPickerSync(colorInput, hexInput) {
    if (!colorInput || !hexInput) return;
    const applyFromColor = () => {
      hexInput.value = colorInput.value;
      hexInput.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const applyFromHex = () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        colorInput.value = v;
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    colorInput.addEventListener('input', applyFromColor);
    colorInput.addEventListener('change', applyFromColor);
    hexInput.addEventListener('change', applyFromHex);
    hexInput.addEventListener('input', applyFromHex);
  }

  function renderGuiSettingsPanel(type, settings) {
    if (!guiSettingsContainer) return;
    guiSettingsContainer.innerHTML = '';
    const frag = document.createDocumentFragment();
    const makeInput = (label, id, typeAttr = 'text', value = '', extra = {}) => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = label;
      const inp = document.createElement('input');
      inp.className = 'form-control form-control-sm';
      inp.id = id;
      inp.type = typeAttr;
      if (value !== undefined) inp.value = value;
      Object.assign(inp, extra);
      wrap.appendChild(lab);
      wrap.appendChild(inp);
      return wrap;
    };
    const makeTextarea = (label, id, value = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = label;
      const ta = document.createElement('textarea');
      ta.className = 'form-control form-control-sm';
      ta.id = id;
      ta.rows = 3;
      ta.value = value || '';
      wrap.appendChild(lab);
      wrap.appendChild(ta);
      return wrap;
    };
    const makeSelect = (label, id, options, value = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = label;
      const sel = document.createElement('select');
      sel.className = 'form-select form-select-sm';
      sel.id = id;
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        sel.appendChild(o);
      });
      wrap.appendChild(lab);
      wrap.appendChild(sel);
      return wrap;
    };
    const makeColorPicker = (label, id, value, fallback = '#ffffff') => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = label;
      const group = document.createElement('div');
      group.className = 'input-group input-group-sm';
      const colorInp = document.createElement('input');
      colorInp.type = 'color';
      colorInp.className = 'form-control form-control-color';
      colorInp.id = id;
      colorInp.title = label;
      const hexVal = cssColorToHex(value, fallback);
      colorInp.value = hexVal;
      const hexInp = document.createElement('input');
      hexInp.type = 'text';
      hexInp.className = 'form-control';
      hexInp.id = `${id}-hex`;
      hexInp.value = hexVal;
      hexInp.spellcheck = false;
      bindColorPickerSync(colorInp, hexInp);
      group.appendChild(colorInp);
      group.appendChild(hexInp);
      wrap.appendChild(lab);
      wrap.appendChild(group);
      return wrap;
    };
    const makeBalloonPicker = (dialogSettings) => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = 'Dialog balloon (image)';
      const row = document.createElement('div');
      row.className = 'd-flex gap-1 flex-wrap align-items-center';
      const btnBrowse = document.createElement('button');
      btnBrowse.type = 'button';
      btnBrowse.className = 'btn btn-outline-info btn-sm';
      btnBrowse.textContent = 'Browseâ€¦';
      const btnClear = document.createElement('button');
      btnClear.type = 'button';
      btnClear.className = 'btn btn-outline-secondary btn-sm';
      btnClear.textContent = 'Clear';
      const status = document.createElement('small');
      status.className = 'text-muted';
      status.id = 'gui-set-balloon-label';
      const updateLabel = () => {
        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        const img = (gui && gui.settings && gui.settings.balloonImage) || dialogSettings.balloonImage;
        status.textContent = img ? 'Balloon image set' : 'No balloon (uses colored box)';
      };
      updateLabel();
      btnBrowse.addEventListener('click', async () => {
        if (!currentUser) {
          showNotification('Open a project to select images', 'warning');
          return;
        }
        if (!getActiveProjectId()) {
          showNotification('No project is open', 'warning');
          return;
        }
        const resource = await pickResourceImage({ title: 'Dialog balloon from Resources' });
        if (!resource) return;
        try {
          const img = await loadImageFromResourceEntry(resource);
          const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
          if (!gui) return;
          const collected = collectGuiSettingsFromUI('DialogBox');
          collected.balloonImage = img;
          gui.settings = collected;
          updateLabel();
          saveCurrentGUI();
          showNotification('Dialog balloon set', 'success');
        } catch (err) {
          showNotification('Balloon error: ' + err.message, 'error');
        }
      });
      btnClear.addEventListener('click', () => {
        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        if (!gui) return;
        const collected = collectGuiSettingsFromUI('DialogBox');
        collected.balloonImage = null;
        collected.balloon = '';
        gui.settings = collected;
        updateLabel();
        saveCurrentGUI();
        showNotification('Dialog balloon removed', 'info');
      });
      row.appendChild(btnBrowse);
      row.appendChild(btnClear);
      row.appendChild(status);
      wrap.appendChild(lab);
      wrap.appendChild(row);
      return wrap;
    };
    const makeCustomFontPicker = (dialogSettings) => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const lab = document.createElement('label');
      lab.className = 'form-label text-light';
      lab.textContent = 'Custom font';
      const row = document.createElement('div');
      row.className = 'd-flex gap-1 flex-wrap align-items-center mb-1';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = DIALOG_FONT_ACCEPT;
      fileInput.className = 'd-none';
      fileInput.id = 'gui-set-font-file';
      const btnImport = document.createElement('button');
      btnImport.type = 'button';
      btnImport.className = 'btn btn-outline-info btn-sm';
      btnImport.textContent = 'Import fontâ€¦';
      const btnClear = document.createElement('button');
      btnClear.type = 'button';
      btnClear.className = 'btn btn-outline-secondary btn-sm';
      btnClear.textContent = 'Clear';
      const status = document.createElement('small');
      status.className = 'text-muted';
      status.id = 'gui-set-font-label';
      const updateLabel = () => {
        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        const cf = (gui && gui.settings && gui.settings.customFont) || dialogSettings.customFont;
        const ff = (gui && gui.settings && gui.settings.fontFamily) || dialogSettings.fontFamily;
        status.textContent = cf ? `Font: ${ff || 'custom'}` : 'Default font (Arial)';
      };
      updateLabel();
      btnImport.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
          showNotification('Unsupported font format. Use .ttf, .otf, .woff or .woff2', 'warning');
          return;
        }
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Read failed'));
            reader.readAsDataURL(file);
          });
          const familyInput = document.getElementById('gui-set-font-family');
          const fontFamily = (familyInput && familyInput.value.trim())
            ? familyInput.value.trim()
            : fontFamilyFromFileName(file.name);
          const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
          if (!gui) return;
          const collected = collectGuiSettingsFromUI('DialogBox');
          collected.customFont = dataUrl;
          collected.fontFamily = fontFamily;
          gui.settings = collected;
          await registerDialogFontFace(fontFamily, dataUrl);
          if (familyInput) familyInput.value = fontFamily;
          updateLabel();
          saveCurrentGUI();
          showNotification('Custom font imported', 'success');
        } catch (err) {
          showNotification('Font import error: ' + err.message, 'error');
        }
      });
      btnClear.addEventListener('click', () => {
        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        if (!gui) return;
        const collected = collectGuiSettingsFromUI('DialogBox');
        collected.customFont = '';
        collected.fontFamily = '';
        gui.settings = collected;
        const familyInput = document.getElementById('gui-set-font-family');
        if (familyInput) familyInput.value = '';
        updateLabel();
        saveCurrentGUI();
        showNotification('Custom font removed', 'info');
      });
      row.appendChild(fileInput);
      row.appendChild(btnImport);
      row.appendChild(btnClear);
      row.appendChild(status);
      wrap.appendChild(lab);
      wrap.appendChild(row);
      wrap.appendChild(makeInput('Font family name (optional)', 'gui-set-font-family', 'text', dialogSettings.fontFamily || '', {
        placeholder: 'Auto from file name if empty'
      }));
      return wrap;
    };

    switch(type) {
      case 'DialogBox': {
        const dlg = normalizeDialogBoxSettings(settings);
        frag.appendChild(makeBalloonPicker(dlg));
        frag.appendChild(makeInput('Font size (px)', 'gui-set-font-size', 'number', dlg.fontSize, {
          min: DIALOG_FONT_SIZE_MIN,
          max: DIALOG_FONT_SIZE_MAX,
          step: 1
        }));
        frag.appendChild(makeCustomFontPicker(dlg));
        frag.appendChild(makeColorPicker('Background color', 'gui-set-bg-color', dlg.backgroundColor, '#1a1a2e'));
        frag.appendChild(makeColorPicker('Text color', 'gui-set-text-color', dlg.textColor, '#ffffff'));
        frag.appendChild(makeColorPicker('Box border color', 'gui-set-border-color', dlg.boxBorderColor, '#39ff14'));
        frag.appendChild(makeSelect('Appear behavior', 'gui-set-appear', [
          {value:'instant', label:'Instant'},
          {value:'fade', label:'Fade'},
          {value:'slide', label:'Slide'}
        ], dlg.appear));
        const hint = document.createElement('p');
        hint.className = 'text-muted small mb-0';
        hint.textContent = 'In game the balloon follows the speaking character and sizes to the text. Without a custom font, Arial is used.';
        frag.appendChild(hint);
        break;
      }
      case 'VerbGUI': {
        frag.appendChild(makeTextarea('Verb list (one per line)', 'gui-set-verbs', Array.isArray(settings.verbs) ? settings.verbs.join('\n') : 'Look\nUse\nTalk'));
        frag.appendChild(makeInput('Position X', 'gui-set-x', 'number', settings.x ?? 0));
        frag.appendChild(makeInput('Position Y', 'gui-set-y', 'number', settings.y ?? 0));
        frag.appendChild(makeSelect('Style', 'gui-set-style', [
          {value:'icons', label:'Icons'},
          {value:'text', label:'Text'}
        ], settings.style || 'text'));
        break;
      }
      case 'Menu': {
        frag.appendChild(makeTextarea('Menu entries (one per line)', 'gui-set-menu-items', Array.isArray(settings.items) ? settings.items.join('\n') : 'Start\nLoad\nOptions\nQuit'));
        frag.appendChild(makeSelect('Layout', 'gui-set-menu-layout', [
          {value:'vertical', label:'Vertical'},
          {value:'horizontal', label:'Horizontal'},
          {value:'grid', label:'Grid'}
        ], settings.layout || 'vertical'));
        frag.appendChild(makeSelect('Buttons style', 'gui-set-btn-style', [
          {value:'primary', label:'Primary'},
          {value:'outline', label:'Outline'},
          {value:'ghost', label:'Ghost'}
        ], settings.buttonStyle || 'primary'));
        break;
      }
      case 'VerbCoin': {
        frag.appendChild(makeTextarea('Verb coin list (one per line)', 'gui-set-verbs', Array.isArray(settings.verbs) ? settings.verbs.join('\n') : 'Look\nUse\nTalk'));
        break;
      }
      case 'OverlayCustom': {
        frag.appendChild(makeTextarea('Note/JSON custom (opzionale)', 'gui-set-custom', settings.custom || ''));
        break;
      }
      case 'MainInterface':
      default: {
        // MainInterface: nessun campo obbligatorio
        frag.appendChild(makeInput('Descrizione (opzionale)', 'gui-set-desc', 'text', settings.desc || ''));
        break;
      }
    }
    guiSettingsContainer.appendChild(frag);
  }

  function collectGuiSettingsFromUI(type) {
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? (el.type === 'number' ? Number(el.value || 0) : el.value) : undefined;
    };
    switch(type) {
      case 'DialogBox': {
        const gui = currentGuiId ? guis.find(g => g.id === currentGuiId) : null;
        const existing = (gui && gui.settings) ? gui.settings : {};
        const bgHex = get('gui-set-bg-color-hex') || get('gui-set-bg-color') || '#1a1a2e';
        const textHex = get('gui-set-text-color-hex') || get('gui-set-text-color') || '#ffffff';
        const borderHex = get('gui-set-border-color-hex') || get('gui-set-border-color') || '#39ff14';
        const fontFamilyEl = document.getElementById('gui-set-font-family');
        const fontFamilyVal = fontFamilyEl ? fontFamilyEl.value.trim() : (existing.fontFamily || '');
        return {
          balloon: existing.balloon || '',
          balloonImage: existing.balloonImage || null,
          backgroundColor: cssColorToHex(bgHex, '#1a1a2e'),
          textColor: cssColorToHex(textHex, '#ffffff'),
          boxBorderColor: cssColorToHex(borderHex, '#39ff14'),
          fontSize: clampDialogFontSize(get('gui-set-font-size')),
          fontFamily: fontFamilyVal,
          customFont: existing.customFont || '',
          appear: get('gui-set-appear') || 'instant'
        };
      }
      case 'VerbGUI': {
        const verbsStr = get('gui-set-verbs') || '';
        const verbs = String(verbsStr).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
        return {
          verbs,
          x: get('gui-set-x') || 0,
          y: get('gui-set-y') || 0,
          style: get('gui-set-style') || 'text'
        };
      }
      case 'Menu': {
        const itemsStr = get('gui-set-menu-items') || '';
        const items = String(itemsStr).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
        return {
          items,
          layout: get('gui-set-menu-layout') || 'vertical',
          buttonStyle: get('gui-set-btn-style') || 'primary'
        };
      }
      case 'VerbCoin': {
        const verbsStr = get('gui-set-verbs') || '';
        const verbs = String(verbsStr).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
        return { verbs };
      }
      case 'OverlayCustom':
        return { custom: get('gui-set-custom') || '' };
      case 'MainInterface':
      default:
        return { desc: get('gui-set-desc') || '' };
    }
  }

  if (btnDeleteGuiButton) {
    btnDeleteGuiButton.addEventListener('click', () => {
      if (guiTypeSelect && guiTypeSelect.value === 'DialogBox') return;
      if (!selectedGuiButtonId) { showNotification('No GUI button selected', 'warning'); return; }
      guiButtons = guiButtons.filter(b => b.id !== selectedGuiButtonId);
      selectedGuiButtonId = null;
      refreshGuiButtonsList();
      if (typeof refreshGuiScriptTargets === 'function') refreshGuiScriptTargets();
      saveCurrentGUI();
      redraw();
    });
  }
  // GUI buttons list UI
  function refreshGuiButtonsList() {
    const list = document.getElementById('gui-buttons-list');
    if (!list) return;
    list.innerHTML = '';
    guiButtons.forEach(btn => {
      const item = document.createElement('div');
      item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      item.dataset.guiId = btn.id;
      item.innerHTML = `
        <div>
          <strong>${btn.name}</strong>
          <br><small>${btn.x}, ${btn.y} â€” ${btn.w}Ã—${btn.h}</small>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-light me-1" title="Rename">Rename</button>
          <button class="btn btn-sm btn-outline-info me-1" title="Set Background Image">Image</button>
          <button class="btn btn-sm btn-outline-warning me-1" title="Set Text">Text</button>
          <button class="btn btn-sm btn-outline-danger" title="Delete">Delete</button>
        </div>
      `;
      const [btnEdit, btnImage, btnText, btnDel] = item.querySelectorAll('button');
      btnEdit.addEventListener('click', () => {
        const newName = prompt('GUI button name:', btn.name);
        if (newName && newName.trim() !== '') { btn.name = newName.trim(); saveCurrentGUI(); refreshGuiButtonsList(); }
      });
      btnImage.addEventListener('click', async () => {
          if (!currentUser) {
            showNotification('Open a project to select images', 'warning');
            return;
          }
          if (!getActiveProjectId()) {
            showNotification('No project is open', 'warning');
            return;
          }

          const resource = await pickResourceImage({ title: `Button image: ${btn.name}` });
          if (!resource) return;

          try {
            const img = await loadImageFromResourceEntry(resource);
            if (!img) throw new Error('Failed to load image from Resources');
            btn.backgroundImage = img;
            saveCurrentGUI();
            showNotification(`Image set for ${btn.name}`, 'success');
            redraw();
          } catch (error) {
            console.error('[Asset] Errore immagine pulsante GUI:', error);
            showNotification(`Error: ${error.message}`, 'error');
          }
      });
      btnText.addEventListener('click', () => {
        const newText = prompt('Button text:', btn.text || '');
        if (newText !== null) { 
          btn.text = newText; 
          saveCurrentGUI();
          showNotification(`Text set for ${btn.name}`, 'success'); 
          redraw(); 
        }
      });
      btnDel.addEventListener('click', () => {
        guiButtons = guiButtons.filter(b => b.id !== btn.id);
        if (selectedGuiButtonId === btn.id) selectedGuiButtonId = null;
        refreshGuiButtonsList();
        if (typeof refreshGuiScriptTargets === 'function') refreshGuiScriptTargets();
        saveCurrentGUI();
        redraw();
      });
      item.addEventListener('click', () => { selectedGuiButtonId = btn.id; refreshGuiButtonsList(); redraw(); });
      list.appendChild(item);
    });
  }

  // Initialize canvas
  initializeCanvas();

  // Setup mouse wheel zoom and panning
  setupMouseWheelZoom();
  setupMousePanning();

  // Handle window resize â€” ridisegna per aggiornare letterbox; pan 0 mantiene il viewport centrato
  window.addEventListener("resize", () => {
    updateEditorDisplay();
    redraw();
  });

  // Keyboard controls for panning
  document.addEventListener('keydown', function(e) {
    const panSpeed = 20;
    let panned = false;
    
    switch(e.key) {
      case 'ArrowLeft':
        editorState.panX += panSpeed;
        panned = true;
        break;
      case 'ArrowRight':
        editorState.panX -= panSpeed;
        panned = true;
        break;
      case 'ArrowUp':
        editorState.panY += panSpeed;
        panned = true;
        break;
      case 'ArrowDown':
        editorState.panY -= panSpeed;
        panned = true;
        break;
    }
    
    if (panned) {
      e.preventDefault();
      redraw();
    }
  });

  // expose some helpers globally for debugging (optional)
  window.__amianto = {
    getForegrounds: () => foregrounds,
    getBackground: () => background,
    getSceneObjects: () => sceneObjects,
    redraw,
    gameViewport: () => gameViewport,
    editorState: () => editorState,
    fitToScreen,
    resetEditorZoom,
    zoomIn,
    zoomOut,
    centerView,
    screenToWorld,
    getObjectAtPoint,
    updateSceneObjectUI,
    setZoom: (zoom) => {
      editorState.zoom = Math.max(0.1, Math.min(3.0, zoom));
      updateEditorDisplay();
      redraw();
    },
    setPan: (x, y) => {
      editorState.panX = x;
      editorState.panY = y;
      redraw();
    },
    // Drag & drop helpers
    isDraggingObject: () => isDraggingObject,
    getDraggedObject: () => draggedObject
  };

  /* ============================
     PART 3 - Funzioni per le Tabs
     ============================ */

  // ===== Inventory tab =====
  /** Chiave script effettiva per un item (scriptName utente > attachment > default Inventory:nome). */
  function getInventoryItemScriptKey(itemOrName) {
    const name = typeof itemOrName === 'string' ? itemOrName : (itemOrName && itemOrName.name);
    if (!name) return '';
    const item = typeof itemOrName === 'object' && itemOrName
      ? itemOrName
      : inventoryItems.find(i => i.name === name);
    const userKey = item && String(item.scriptName || '').trim();
    if (userKey) {
      const k = migrateLegacyScriptKey(userKey);
      return editorScriptExists(k) ? k : '';
    }
    if (inventoryScripts.has(name)) {
      const k = migrateLegacyScriptKey(inventoryScripts.get(name));
      return editorScriptExists(k) ? k : '';
    }
    const defaultKey = migrateLegacyScriptKey(normalizeScriptKey('Inventory', name));
    return editorScriptExists(defaultKey) ? defaultKey : '';
  }

  function syncInventoryItemScript(item) {
    if (!item) return;
    const scriptName = String(item.scriptName || '').trim();
    if (scriptName) {
      inventoryScripts.set(item.name, migrateLegacyScriptKey(scriptName));
    } else {
      inventoryScripts.delete(item.name);
    }
  }

  /** Collega script a item inventario (solo Map attachments; non modifica item.scriptName). */
  function attachInventoryItemScript(itemName, scriptKey) {
    const name = String(itemName || '').trim();
    const key = migrateLegacyScriptKey(String(scriptKey || ''));
    if (!name || !key) return false;
    inventoryScripts.set(name, key);
    refreshInventoryItemsListUI();
    return true;
  }

  function updateInventoryItemFormImageLabel() {
    const label = document.getElementById('inventory-item-image-label');
    if (!label) return;
    if (pendingInventoryItemImage) {
      label.textContent = 'Image selected';
    } else if (selectedInventoryItemId) {
      const item = inventoryItems.find(i => i.id === selectedInventoryItemId);
      label.textContent = item && item.image ? 'Current image' : 'No image';
    } else {
      label.textContent = 'No image';
    }
  }

  function clearInventoryItemForm() {
    selectedInventoryItemId = null;
    pendingInventoryItemImage = null;
    pendingInventoryItemImageResource = null;
    const nameEl = document.getElementById('inventory-item-name');
    const scriptEl = document.getElementById('inventory-item-script-name');
    const updateBtn = document.getElementById('btn-inventory-item-update');
    if (nameEl) nameEl.value = '';
    if (scriptEl) scriptEl.value = '';
    if (updateBtn) updateBtn.disabled = true;
    updateInventoryItemFormImageLabel();
    refreshInventoryItemsListUI();
  }

  function selectInventoryItem(itemId) {
    selectedInventoryItemId = itemId;
    const item = inventoryItems.find(i => i.id === itemId);
    const nameEl = document.getElementById('inventory-item-name');
    const scriptEl = document.getElementById('inventory-item-script-name');
    const updateBtn = document.getElementById('btn-inventory-item-update');
    pendingInventoryItemImage = null;
    if (item) {
      if (nameEl) nameEl.value = item.name || '';
      if (scriptEl) scriptEl.value = item.scriptName || '';
    }
    if (updateBtn) updateBtn.disabled = !item;
    updateInventoryItemFormImageLabel();
    refreshInventoryItemsListUI();
  }

  function refreshInventoryItemsListUI() {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';
    inventoryItems.forEach((item) => {
      const isSelected = item.id === selectedInventoryItemId;
      const el = document.createElement('div');
      el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      if (isSelected) el.classList.add('border', 'border-info');
      el.dataset.itemId = item.id;
      const info = document.createElement('div');
      const scriptLabel = getDisplayScriptLabel('Inventory', item.name, item);
      const hasImg = item.image ? 'with image' : 'no image';
      info.innerHTML = '<strong>' + item.name + '</strong><br><small class="text-info">Script: ' + scriptLabel + '</small><br><small class="text-muted">' + hasImg + '</small>';
      const controls = document.createElement('div');
      const selectBtn = document.createElement('button');
      selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
      selectBtn.textContent = isSelected ? 'Selected' : 'Select';
      selectBtn.addEventListener('click', () => selectInventoryItem(item.id));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-outline-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => removeInventoryItemById(item.id));
      controls.appendChild(selectBtn);
      controls.appendChild(delBtn);
      el.appendChild(info);
      el.appendChild(controls);
      list.appendChild(el);
    });
    refreshInventoryScriptTargets();
  }

  function refreshInventorySlotsListUI() {
    const list = document.getElementById('inventory-slots-list');
    if (!list) return;
    list.innerHTML = '';
    inventoryDefinition.slots.filter(s => s.id !== '__drawing__').forEach((slot, index) => {
      const isSelected = slot.id === selectedInventorySlotId;
      const el = document.createElement('div');
      el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      if (isSelected) el.classList.add('border', 'border-warning');
      el.innerHTML = '<div><strong>' + (slot.name || ('Slot ' + (index + 1))) + '</strong><br><small>' + slot.w + 'x' + slot.h + ' @ ' + slot.x + ', ' + slot.y + '</small></div>';
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-light';
      btn.textContent = isSelected ? 'Active' : 'Select';
      btn.addEventListener('click', () => {
        selectedInventorySlotId = slot.id;
        refreshInventorySlotsListUI();
        redraw();
      });
      el.appendChild(btn);
      list.appendChild(el);
    });
  }

  window.filterInventoryObjects = function(searchTerm) {
    const objects = document.querySelectorAll('#inventory-list .list-group-item');
    const q = (searchTerm || '').toLowerCase();
    objects.forEach(obj => {
      obj.style.display = obj.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  };

  window.removeInventoryObject = function(button) {
    const row = button.closest('.list-group-item');
    const id = row && row.dataset.itemId;
    if (id) removeInventoryItemById(id);
  };

  function removeInventoryItemById(itemId) {
    const item = inventoryItems.find(i => i.id === itemId);
    if (!item) return;
    if (!confirm('Delete this inventory item?')) return;
    inventoryScripts.delete(item.name);
    inventoryItems = inventoryItems.filter(i => i.id !== itemId);
    if (selectedInventoryItemId === itemId) clearInventoryItemForm();
    else refreshInventoryItemsListUI();
    redraw();
    showNotification('Inventory item deleted', 'info');
  }

  window.createInventoryItemFromForm = function() {
    const name = (document.getElementById('inventory-item-name')?.value || '').trim();
    const scriptName = (document.getElementById('inventory-item-script-name')?.value || '').trim();
    if (!name) { showNotification('Enter a name for the item', 'warning'); return; }
    if (inventoryItems.some(i => i.name === name)) { showNotification('Name already in use', 'warning'); return; }
    const item = { id: uid('invitem'), name, scriptName, image: pendingInventoryItemImage || null };
    syncInventoryItemScript(item);
    inventoryItems.push(item);
    pendingInventoryItemImage = null;
    clearInventoryItemForm();
    showNotification('Item created: ' + name, 'success');
    redraw();
  };

  window.updateInventoryItemFromForm = function() {
    const item = inventoryItems.find(i => i.id === selectedInventoryItemId);
    if (!item) { showNotification('Select an item to edit', 'warning'); return; }
    const oldName = item.name;
    const name = (document.getElementById('inventory-item-name')?.value || '').trim();
    const scriptName = (document.getElementById('inventory-item-script-name')?.value || '').trim();
    if (!name) { showNotification('Name cannot be empty', 'warning'); return; }
    if (inventoryItems.some(i => i.id !== item.id && i.name === name)) { showNotification('Name already in use', 'warning'); return; }
    if (oldName !== name && inventoryScripts.has(oldName)) inventoryScripts.delete(oldName);
    item.name = name;
    item.scriptName = scriptName;
    if (pendingInventoryItemImage) item.image = pendingInventoryItemImage;
    syncInventoryItemScript(item);
    pendingInventoryItemImage = null;
    selectInventoryItem(item.id);
    showNotification('Item updated: ' + name, 'success');
    redraw();
  };

  window.browseInventoryItemImage = async function() {
    const resource = await pickResourceImage({ title: 'Inventory item image' });
    if (!resource) return;
    try {
      const img = await loadImageFromResourceEntry(resource);
      pendingInventoryItemImage = img;
      pendingInventoryItemImageResource = resource;
      updateInventoryItemFormImageLabel();
    } catch (err) {
      showNotification('Error loading image: ' + err.message, 'error');
    }
  };
  let pendingInventoryItemImageResource = null;

  window.clearPendingInventoryItemImage = function() {
    pendingInventoryItemImage = null;
    pendingInventoryItemImageResource = null;
    updateInventoryItemFormImageLabel();
  };

  const INVENTORY_DISPLAY_MODES = ['popup', 'always', 'toggle'];

  function normalizeInventoryDisplayMode(mode) {
    const m = String(mode || 'popup').toLowerCase();
    return INVENTORY_DISPLAY_MODES.includes(m) ? m : 'popup';
  }

  function defaultInventoryPanel() {
    return { x: 0, y: 0, w: gameViewport.width, h: gameViewport.height };
  }

  function defaultInventoryToggleIconBounds() {
    const size = 48;
    const margin = 8;
    return {
      x: Math.max(0, gameViewport.width - size - margin),
      y: Math.max(0, gameViewport.height - size - margin),
      w: size,
      h: size
    };
  }

  function normalizeInventoryRect(rect, fallback) {
    const fb = fallback || { x: 0, y: 0, w: 1, h: 1 };
    return {
      x: Math.round(Number(rect && rect.x != null ? rect.x : fb.x) || 0),
      y: Math.round(Number(rect && rect.y != null ? rect.y : fb.y) || 0),
      w: Math.max(1, Math.round(Number(rect && rect.w != null ? rect.w : fb.w) || fb.w)),
      h: Math.max(1, Math.round(Number(rect && rect.h != null ? rect.h : fb.h) || fb.h))
    };
  }

  function ensureInventoryRects() {
    inventoryDefinition.panel = normalizeInventoryRect(
      inventoryDefinition.panel,
      defaultInventoryPanel()
    );
    inventoryDefinition.toggleIconBounds = normalizeInventoryRect(
      inventoryDefinition.toggleIconBounds,
      defaultInventoryToggleIconBounds()
    );
  }

  function readInventoryPanelFromUI() {
    ensureInventoryRects();
    const get = (id) => document.getElementById(id);
    const xEl = get('inventory-panel-x');
    const yEl = get('inventory-panel-y');
    const wEl = get('inventory-panel-w');
    const hEl = get('inventory-panel-h');
    if (!xEl || !yEl || !wEl || !hEl) return;
    inventoryDefinition.panel = normalizeInventoryRect({
      x: xEl.value,
      y: yEl.value,
      w: wEl.value,
      h: hEl.value
    }, defaultInventoryPanel());
    redraw();
  }

  function readInventoryToggleBoundsFromUI() {
    ensureInventoryRects();
    const get = (id) => document.getElementById(id);
    const xEl = get('inventory-toggle-x');
    const yEl = get('inventory-toggle-y');
    const wEl = get('inventory-toggle-w');
    const hEl = get('inventory-toggle-h');
    if (!xEl || !yEl || !wEl || !hEl) return;
    inventoryDefinition.toggleIconBounds = normalizeInventoryRect({
      x: xEl.value,
      y: yEl.value,
      w: wEl.value,
      h: hEl.value
    }, defaultInventoryToggleIconBounds());
    redraw();
  }

  function applyInventoryRectsToUI() {
    ensureInventoryRects();
    const panel = inventoryDefinition.panel;
    const toggle = inventoryDefinition.toggleIconBounds;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = String(val);
    };
    set('inventory-panel-x', panel.x);
    set('inventory-panel-y', panel.y);
    set('inventory-panel-w', panel.w);
    set('inventory-panel-h', panel.h);
    set('inventory-toggle-x', toggle.x);
    set('inventory-toggle-y', toggle.y);
    set('inventory-toggle-w', toggle.w);
    set('inventory-toggle-h', toggle.h);
  }

  function bindInventoryRectInputs(ids, onChange) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', onChange);
      el.addEventListener('input', onChange);
    });
  }

  function updateInventoryToggleIconLabel() {
    const label = document.getElementById('inventory-toggle-icon-label');
    if (!label) return;
    if (inventoryDefinition.toggleIcon) {
      label.textContent = 'Icon set';
    } else {
      label.textContent = 'No icon';
    }
  }

  function refreshInventoryDisplayModeUI() {
    const modeSel = document.getElementById('inventory-display-mode');
    const toggleWrap = document.getElementById('inventory-toggle-icon-wrap');
    const popupEdgeWrap = document.getElementById('inventory-popup-edge-wrap');
    const popupHint = document.getElementById('inventory-popup-hint');
    const popupEdgeInput = document.getElementById('inventory-popup-edge-height');
    const mode = normalizeInventoryDisplayMode(inventoryDefinition.displayMode);
    inventoryDefinition.displayMode = mode;
    if (modeSel) modeSel.value = mode;
    if (toggleWrap) toggleWrap.style.display = mode === 'toggle' ? '' : 'none';
    const isPopup = mode === 'popup';
    if (popupEdgeWrap) popupEdgeWrap.style.display = isPopup ? '' : 'none';
    if (popupHint) popupHint.style.display = isPopup ? '' : 'none';
    const edgeH = Math.max(16, Math.min(200, Number(inventoryDefinition.popupEdgeHeight) || 48));
    inventoryDefinition.popupEdgeHeight = edgeH;
    if (popupEdgeInput) popupEdgeInput.value = String(edgeH);
    applyInventoryRectsToUI();
    updateInventoryToggleIconLabel();
  }

  function setInventoryPopupEdgeHeight(px) {
    inventoryDefinition.popupEdgeHeight = Math.max(16, Math.min(200, Number(px) || 48));
  }

  function setInventoryDisplayMode(mode) {
    inventoryDefinition.displayMode = normalizeInventoryDisplayMode(mode);
    refreshInventoryDisplayModeUI();
  }

  async function browseInventoryToggleIcon() {
    const resource = await pickResourceImage({ title: 'Inventory toggle icon from Resources' });
    if (!resource) return;
    try {
      const img = await loadImageFromResourceEntry(resource);
      inventoryDefinition.toggleIcon = img;
      inventoryDefinition._toggleIconResource = resource;
      updateInventoryToggleIconLabel();
      showNotification('Toggle icon set', 'success');
    } catch (err) {
      showNotification('Error: ' + err.message, 'error');
    }
  }

  function clearInventoryToggleIcon() {
    inventoryDefinition.toggleIcon = null;
    inventoryDefinition._toggleIconResource = null;
    updateInventoryToggleIconLabel();
    showNotification('Toggle icon removed', 'info');
  }

  function setupInventoryEditorUI() {
    const btnBg = document.getElementById('btn-inventory-bg');
    const btnSlot = document.getElementById('btn-inventory-slot');
    const btnSlotDel = document.getElementById('btn-inventory-slot-delete');
    const btnCreate = document.getElementById('btn-inventory-item-create');
    const btnUpdate = document.getElementById('btn-inventory-item-update');
    const btnBrowseImg = document.getElementById('btn-inventory-item-browse-image');
    const btnClearImg = document.getElementById('btn-inventory-item-clear-image');
    const displayModeSel = document.getElementById('inventory-display-mode');
    const popupEdgeInput = document.getElementById('inventory-popup-edge-height');
    const btnToggleIconBrowse = document.getElementById('btn-inventory-toggle-icon-browse');
    const btnToggleIconClear = document.getElementById('btn-inventory-toggle-icon-clear');
    if (btnBg) btnBg.addEventListener('click', uploadInventoryBackground);
    if (btnSlot) btnSlot.addEventListener('click', startDrawInventorySlot);
    if (btnSlotDel) btnSlotDel.addEventListener('click', deleteSelectedInventorySlot);
    if (btnCreate) btnCreate.addEventListener('click', () => window.createInventoryItemFromForm());
    if (btnUpdate) btnUpdate.addEventListener('click', () => window.updateInventoryItemFromForm());
    if (btnBrowseImg) btnBrowseImg.addEventListener('click', () => window.browseInventoryItemImage());
    if (btnClearImg) btnClearImg.addEventListener('click', () => window.clearPendingInventoryItemImage());
    if (displayModeSel) {
      displayModeSel.addEventListener('change', () => setInventoryDisplayMode(displayModeSel.value));
    }
    if (popupEdgeInput) {
      popupEdgeInput.addEventListener('change', () => setInventoryPopupEdgeHeight(popupEdgeInput.value));
      popupEdgeInput.addEventListener('input', () => setInventoryPopupEdgeHeight(popupEdgeInput.value));
    }
    if (btnToggleIconBrowse) btnToggleIconBrowse.addEventListener('click', () => browseInventoryToggleIcon());
    if (btnToggleIconClear) btnToggleIconClear.addEventListener('click', () => clearInventoryToggleIcon());
    bindInventoryRectInputs(
      ['inventory-panel-x', 'inventory-panel-y', 'inventory-panel-w', 'inventory-panel-h'],
      () => readInventoryPanelFromUI()
    );
    bindInventoryRectInputs(
      ['inventory-toggle-x', 'inventory-toggle-y', 'inventory-toggle-w', 'inventory-toggle-h'],
      () => readInventoryToggleBoundsFromUI()
    );
    refreshInventoryDisplayModeUI();
  }

  async function uploadInventoryBackground() {
    const resource = await pickResourceImage({ title: 'Inventory background from Resources' });
    if (!resource) return;
    try {
      const img = await loadImageFromResourceEntry(resource);
      inventoryDefinition.background = img;
      showNotification('Inventory background set', 'success');
      redraw();
    } catch (err) {
      showNotification('Error: ' + err.message, 'error');
    }
  }

  function startDrawInventorySlot() {
    isDrawingInventorySlot = true;
    inventorySlotDrawStart = null;
    inventoryDefinition.slots.push({ id: '__drawing__', name: 'Drawing...', x: 0, y: 0, w: 0, h: 0 });
    showNotification('Drag on the canvas to draw a slot', 'info');
  }

  function deleteSelectedInventorySlot() {
    if (!selectedInventorySlotId) { showNotification('No slot selected', 'warning'); return; }
    inventoryDefinition.slots = inventoryDefinition.slots.filter(s => s.id !== selectedInventorySlotId);
    selectedInventorySlotId = null;
    refreshInventorySlotsListUI();
    redraw();
    showNotification('Slot deleted', 'info');
  }

  setupInventoryEditorUI();
  // Functions for Scene Objects (in Rooms tab)
  function ensureSceneObjectSelection() {
    // Mutual exclusion: hotspot or animation selection locks scene objects
    if (activeHotspotId || selectedAnimationInstanceId) {
      selectedSceneObjectId = null;
      return;
    }
    if (selectedSceneObjectId && !sceneObjects.some(o => o.id === selectedSceneObjectId)) {
      selectedSceneObjectId = null;
    }
  }

  function refreshRoomSelectionLists() {
    refreshSceneObjectsListUI();
    refreshRoomAnimationInstancesListUI();
    refreshHotspotsListUI();
    if (typeof refreshForegroundListUI === 'function') refreshForegroundListUI();
  }

  function selectSceneObject(objectId) {
    // Toggle: click Selected again to deselect
    if (selectedSceneObjectId === objectId) {
      selectedSceneObjectId = null;
    } else {
      selectedSceneObjectId = objectId;
      selectedAnimationInstanceId = null;
      activeHotspotId = null;
      selectedHotspotVertexIndex = -1;
      isDrawingHotspot = false;
    }
    refreshRoomSelectionLists();
    redraw();
  }

  function createSceneObjectListItem(sceneObject) {
    const isSelected = sceneObject.id === selectedSceneObjectId;
    const item = document.createElement('div');
    item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
    if (isSelected) {
      item.classList.add('border', 'border-info');
    }
    item.dataset.objectId = sceneObject.id;

    const info = document.createElement('div');
    info.innerHTML = `<strong>${sceneObject.name}</strong>`;

    const visibleWrap = document.createElement('div');
    visibleWrap.className = 'form-check form-check-inline small mt-1';
    const visibleChk = document.createElement('input');
    visibleChk.type = 'checkbox';
    visibleChk.className = 'form-check-input';
    visibleChk.id = `scene-visible-${sceneObject.id}`;
    visibleChk.checked = isSceneObjectRuntimeVisible(sceneObject);
    const visibleLbl = document.createElement('label');
    visibleLbl.className = 'form-check-label text-light';
    visibleLbl.htmlFor = visibleChk.id;
    visibleLbl.textContent = 'Is visible?';
    visibleLbl.title = 'Visible and interactive in playtest; always shown in editor when off';
    visibleChk.title = visibleLbl.title;
    visibleChk.addEventListener('change', () => {
      setSceneObjectRuntimeVisible(sceneObject, visibleChk.checked);
      const r = rooms.get(currentRoomId);
      if (r) r.sceneObjects = sceneObjects;
      item.style.opacity = visibleChk.checked ? '1' : '0.55';
      redraw();
    });
    visibleWrap.appendChild(visibleChk);
    visibleWrap.appendChild(visibleLbl);
    info.appendChild(visibleWrap);
    if (!isSceneObjectRuntimeVisible(sceneObject)) {
      item.style.opacity = '0.55';
    }

    const controls = document.createElement('div');

    const selectBtn = document.createElement('button');
    selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
    selectBtn.title = isSelected ? 'Click to deselect' : 'Select to edit / drag (locks animations)';
    selectBtn.textContent = isSelected ? 'Selected' : 'Select';
    selectBtn.addEventListener('click', () => selectSceneObject(sceneObject.id));

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outline-light me-1';
    editBtn.title = isSelected ? 'Edit' : 'Select before editing';
    editBtn.textContent = 'Edit';
    editBtn.disabled = !isSelected;
    editBtn.addEventListener('click', () => {
      if (!isSelected) {
        showNotification('Select the object before editing it', 'warning');
        return;
      }
      editSceneObject(editBtn);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-outline-danger';
    deleteBtn.title = isSelected ? 'Delete' : 'Select before editing';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = !isSelected;
    deleteBtn.addEventListener('click', () => {
      if (!isSelected) {
        showNotification('Select the object before editing it', 'warning');
        return;
      }
      removeSceneObject(deleteBtn);
    });

    controls.appendChild(selectBtn);
    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(controls);
    return item;
  }

  function refreshSceneObjectsListUI() {
    const sceneObjectsList = document.getElementById('scene-objects-list');
    if (!sceneObjectsList) return;
    ensureSceneObjectSelection();
    sceneObjectsList.innerHTML = '';
    sceneObjects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uid('scene');
      }
      sceneObjectsList.appendChild(createSceneObjectListItem(obj));
    });
  }

  window.addSceneObject = async function() {
    if (!currentUser || !currentUser.uid) {
      showNotification('Open a project to select images', 'warning');
      return;
    }
    if (!getActiveProjectId()) return;

    const resource = await pickResourceImage({ title: 'Scene object from Resources' });
    if (!resource) return;

    try {
      showNotification('Adding scene object...', 'info');
      
      const objectId = uid("scene");
      const img = await loadImageFromResourceEntry(resource);
      if (!img) throw new Error('Failed to load image from Resources');

      const baseName = (resource.displayName || resource.fileName || 'object').replace(/\.[^/.]+$/, '');
      const objectName = `${baseName}_${Date.now()}`;

      const sceneObject = {
        id: objectId,
        name: objectName,
        img: img,
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        type: "Interactive",
        rotationRad: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        enabled: true
      };

      sceneObjects.push(sceneObject);
      const r = rooms.get(currentRoomId);
      if (r) r.sceneObjects = sceneObjects;
      selectedSceneObjectId = sceneObject.id;
      selectedAnimationInstanceId = null;
      activeHotspotId = null;

      refreshRoomSelectionLists();
      redraw();
      showNotification(`Scene object "${objectName}" added`, 'success');
      notifyEditorProjectChanged();
    } catch (error) {
      console.error('[Asset] Errore scene object da Resources:', error);
      showNotification(`Scene object error: ${error.message}`, 'error');
    }
  };

  window.filterSceneObjects = function(searchTerm) {
    const objects = document.querySelectorAll('#scene-objects-list .list-group-item');
    objects.forEach(obj => {
      const text = obj.textContent.toLowerCase();
      const matches = text.includes(searchTerm.toLowerCase());
      obj.style.display = matches ? 'flex' : 'none';
    });
  };

  window.removeSceneObject = async function(button) {
    if (confirm('Are you sure you want to delete this scene object?')) {
      const listItem = button.closest('.list-group-item');
      const objectId = listItem.dataset.objectId;
      if (objectId !== selectedSceneObjectId) {
        showNotification('Select the object before deleting it', 'warning');
        return;
      }
      
      // Rimuove solo dall'editor; i file nello storage locale restano (eliminabili da Resources)
      // Remove from scene objects array (room-scoped)
      sceneObjects = sceneObjects.filter(obj => obj.id !== objectId);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      selectedSceneObjectId = null;
      
      // Remove from UI
      refreshSceneObjectsListUI();
      
      // Redraw canvas
      redraw();
      
      showNotification('Scene object deleted!', 'info');
    }
  };

  window.editSceneObject = async function(button) {
    const listItem = button.closest('.list-group-item');
    const objectId = listItem.dataset.objectId;
    const sceneObject = sceneObjects.find(obj => obj.id === objectId);
    if (objectId !== selectedSceneObjectId) {
      showNotification('Select the object before editing it', 'warning');
      return;
    }
    
    if (!sceneObject) return;
    
    const nameElement = listItem.querySelector('strong');
    const currentName = nameElement.textContent;
    
    // Semplice menu di scelta: rinomina o cambia immagine
    const action = window.prompt(
      `Edit scene object "${currentName}"\n` +
      `Type:\n` +
      `- "name" to rename\n` +
      `- "image" to replace the image`,
      'name'
    );

    if (!action) return;

    const normalized = String(action).toLowerCase().trim();

    if (normalized === 'name') {
      const newName = prompt(`Edit scene object name (current: "${currentName}"):`, currentName);
      if (newName && newName.trim() !== '') {
        sceneObject.name = newName.trim();
        nameElement.textContent = newName.trim();
        
        // Update position info in UI
        const positionInfo = listItem.querySelector('small[style*="color: #888"]');
        if (positionInfo) {
          positionInfo.textContent = `Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}`;
        }
        
        showNotification(`Scene object renamed to "${newName.trim()}"`, 'success');
      }
    } else if (normalized === 'image') {
      if (!currentUser?.uid) {
        showNotification('Open a project first', 'warning');
        return;
      }
      const resource = await pickResourceImage({ title: 'New scene object image' });
      if (!resource) return;
      try {
        const img = await loadImageFromResourceEntry(resource);
        if (!img) throw new Error('Failed to load image');
        sceneObject.img = img;
        redraw();
        showNotification('Scene object image updated', 'success');
      } catch (err) {
        showNotification('Error: ' + err.message, 'error');
      }
    }
    
    // Ask for position change
    const newX = prompt(`Edit X position (current: ${Math.round(sceneObject.x)}):`, Math.round(sceneObject.x));
    if (newX && !isNaN(newX)) {
      sceneObject.x = parseInt(newX);
      const positionInfo = listItem.querySelector('small[style*="color: #888"]');
      if (positionInfo) {
        positionInfo.textContent = `Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}`;
      }
      redraw();
    }
    
    const newY = prompt(`Edit Y position (current: ${Math.round(sceneObject.y)}):`, Math.round(sceneObject.y));
    if (newY && !isNaN(newY)) {
      sceneObject.y = parseInt(newY);
      const positionInfo = listItem.querySelector('small[style*="color: #888"]');
      if (positionInfo) {
        positionInfo.textContent = `Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}`;
      }
      redraw();
    }
    refreshSceneObjectsListUI();
  };

  // Functions for Characters tab
  function getCharacterFrameCount(charData) {
    if (!charData) return 0;
    const countDirFrames = (dirs) => {
      if (!dirs) return 0;
      return Object.values(dirs).reduce((sum, dir) => sum + (dir.frames ? dir.frames.length : 0), 0);
    };
    let total = countDirFrames(charData.directions);
    if (charData.animations) {
      Object.values(charData.animations).forEach((anim) => {
        total += countDirFrames(anim.directions);
      });
    }
    return total;
  }

  function selectCharacterFromList(characterName) {
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
      characterSelector.value = characterName;
      loadCharacterDirections();
    }
    refreshCharactersListUI();
    redraw();
  }

  function refreshCharactersListUI() {
    const charactersList = document.getElementById('characters-list');
    if (!charactersList) return;
    const sel = document.getElementById('character-selector');
    const selectedName = sel ? sel.value : '';
    const names = [];
    characterFrames.forEach((_, name) => names.push(name));
    names.sort((a, b) => a.localeCompare(b));
    charactersList.innerHTML = '';
    names.forEach((characterName) => {
      const charData = characterFrames.get(characterName);
      ensureCharacterSpawnSettings(charData);
      const totalFrames = getCharacterFrameCount(charData);
      const isSelected = characterName === selectedName;
      const el = document.createElement('div');
      el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      if (isSelected) el.classList.add('border', 'border-info');
      el.dataset.characterName = characterName;
      const info = document.createElement('div');
      const scriptLabel = getDisplayScriptLabel('Character', characterName);
      info.innerHTML = '<strong>' + characterName + '</strong><br><small class="text-muted">' + totalFrames + ' frame' + (totalFrames !== 1 ? 's' : '') + '</small><br><small class="character-script-name text-info">Script: ' + scriptLabel + '</small>';
      const controls = document.createElement('div');
      const selectBtn = document.createElement('button');
      selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
      selectBtn.textContent = isSelected ? 'Selected' : 'Select';
      selectBtn.addEventListener('click', () => selectCharacterFromList(characterName));
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-outline-light me-1';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => window.editCharacter(editBtn));
      const dialogBtn = document.createElement('button');
      dialogBtn.className = 'btn btn-sm btn-outline-warning me-1';
      dialogBtn.textContent = 'Dialog';
      dialogBtn.addEventListener('click', () => window.editCharacterDialogs(dialogBtn));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-outline-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => window.removeCharacter(delBtn));
      controls.appendChild(selectBtn);
      controls.appendChild(editBtn);
      controls.appendChild(dialogBtn);
      controls.appendChild(delBtn);
      el.appendChild(info);
      el.appendChild(controls);
      charactersList.appendChild(el);
    });
    refreshCharacterSelector();
    refreshStartingPlayerUI();
    refreshCharacterScriptTargets();
  }

  // Helper function per aggiornare la visualizzazione del nome del character per gli script
  function updateCharacterScriptDisplay(characterName) {
    const charactersList = document.getElementById('characters-list');
    if (!charactersList) return;
    
    const characterElements = charactersList.querySelectorAll('.list-group-item');
    characterElements.forEach(element => {
      const nameElement = element.querySelector('strong');
      if (nameElement && nameElement.textContent.trim() === characterName) {
        let scriptNameDisplay = element.querySelector('.character-script-name');
        
        if (!scriptNameDisplay) {
          // Crea l'elemento se non esiste
          scriptNameDisplay = document.createElement('small');
          scriptNameDisplay.className = 'character-script-name d-block text-info';
          const framesInfo = element.querySelector('small:not(.character-script-name)');
          if (framesInfo) {
            framesInfo.insertAdjacentElement('afterend', scriptNameDisplay);
          } else {
            nameElement.insertAdjacentElement('afterend', scriptNameDisplay);
          }
        }
        scriptNameDisplay.textContent = 'Script: ' + getDisplayScriptLabel('Character', characterName);
        scriptNameDisplay.style.display = 'block';
      }
    });
  }

  function getDefaultCharacterSpawnSettings() {
    const firstRoom = rooms && rooms.length > 0 ? rooms[0] : null;
    return {
      isPlayer: false,
      autoSpawn: false,
      roomId: firstRoom ? firstRoom.id : null,
      x: 0,
      y: 0,
      direction: 'south',
      moveSpeed: 100
    };
  }

  function normalizeCharacterSpawnSettings(spawn) {
    const defaults = getDefaultCharacterSpawnSettings();
    if (!spawn || typeof spawn !== 'object') return { ...defaults };
    return {
      isPlayer: spawn.isPlayer === true,
      autoSpawn: spawn.autoSpawn === true,
      roomId: spawn.roomId != null ? spawn.roomId : defaults.roomId,
      x: typeof spawn.x === 'number' && !isNaN(spawn.x) ? spawn.x : defaults.x,
      y: typeof spawn.y === 'number' && !isNaN(spawn.y) ? spawn.y : defaults.y,
      direction: spawn.direction || defaults.direction,
      moveSpeed: typeof spawn.moveSpeed === 'number' && spawn.moveSpeed > 0 ? spawn.moveSpeed : defaults.moveSpeed
    };
  }

  function createEmptyCharacterData(name) {
    const n = name != null ? String(name).trim() : '';
    return {
      id: n, // sempre uguale al name (chiave Map / runtime)
      name: n,
      directions: {},
      animations: {},
      currentFrame: 0,
      spawnSettings: getDefaultCharacterSpawnSettings()
    };
  }

  /** Garantisce id === name sul record character in editor */
  function ensureCharacterIdEqualsName(charData, name) {
    if (!charData) return;
    const n = String(name || charData.name || charData.id || '').trim();
    charData.id = n;
    charData.name = n;
  }

  function ensureCharacterSpawnSettings(charData) {
    if (!charData) return;
    charData.spawnSettings = normalizeCharacterSpawnSettings(charData.spawnSettings);
  }

  window.addCharacter = function() {
    const name = (prompt('Character name:') || '').trim();
    if (!name) return;
    if (characterFrames.has(name)) {
      showNotification('Character name already in use', 'warning');
      return;
    }
    characterFrames.set(name, createEmptyCharacterData(name));
    selectCharacterFromList(name);
    showNotification(`Character "${name}" added!`, 'success');
    notifyEditorProjectChanged();
  };

  window.removeCharacter = async function(button) {
    if (confirm('Are you sure you want to delete this character?')) {
      const characterElement = button.closest('.list-group-item');
      const characterName = characterElement.querySelector('strong').textContent.trim();
      
      // Ferma la preview se Ã¨ attiva per questo character
      const sel = document.getElementById('character-selector');
      const currentCharacter = sel ? sel.value : '';
      if (currentCharacter === characterName) {
        stopCharacterPreview();
      }
      
      const charData = characterFrames.get(characterName);

      // Pulisce i riferimenti in memoria (i file nello storage locale restano; eliminabili da Resources)
      // Questo pulisce la mappa anche se alcuni frame non sono stati trovati
      const clearDirectionFramesFromMap = (directionsMap) => {
        if (!directionsMap) return;
        for (const dirData of Object.values(directionsMap)) {
          if (dirData.frames && Array.isArray(dirData.frames)) {
            for (const frame of dirData.frames) {
              let frameImage = null;
              if (frame && typeof frame === 'object' && frame.img) {
                frameImage = frame.img;
              } else if (frame && typeof frame === 'object' && frame.src) {
                frameImage = frame;
              }
              if (frameImage && imageAssetMap.has(frameImage)) {
                const assetInfo = imageAssetMap.get(frameImage);
                if (assetInfo && assetInfo.type === 'character') {
                  imageAssetMap.delete(frameImage);
                }
              }
            }
          }
        }
      };
      if (charData) {
        try {
          clearDirectionFramesFromMap(charData.directions);
          if (charData.animations) {
            Object.values(charData.animations).forEach(anim => clearDirectionFramesFromMap(anim.directions));
          }
        } catch (mapError) {
          console.warn('[Character] Errore pulizia imageAssetMap (non critico):', mapError);
        }
      }
      
      // Terzo: rimuovi il character da characterFrames per evitare che venga ricreato durante il salvataggio
      if (characterFrames.has(characterName)) {
        characterFrames.delete(characterName);
        console.log(`[Character] Character rimosso da characterFrames: ${characterName}`);
      }
      
      // Quarto: rimuovi anche eventuali frame non salvati associati a questo character
      if (unsavedCharacterFrames.size > 0) {
        const framesToRemove = [];
        for (const frameImg of unsavedCharacterFrames) {
          const assetInfo = imageAssetMap.get(frameImg);
          if (assetInfo && assetInfo.type === 'character' && assetInfo.subfolder === `characters/${characterName}`) {
            framesToRemove.push(frameImg);
          }
        }
        framesToRemove.forEach(img => {
          unsavedCharacterFrames.delete(img);
          unsavedCharacterAssetIds.delete(imageAssetMap.get(img)?.assetId);
        });
        if (framesToRemove.length > 0) {
          console.log(`[Character] Rimossi ${framesToRemove.length} frame non salvati associati a ${characterName}`);
        }
      }
      
      const characterSelector = document.getElementById('character-selector');
      if (characterSelector && characterSelector.value === characterName) {
        characterSelector.value = '';
        loadCharacterDirections();
      }
      refreshCharactersListUI();
      
      showNotification('Character deleted!', 'info');
      console.log(`[Character] âœ… Character "${characterName}" rimosso dall'editor`);
    }
  };

  window.editCharacter = function(button) {
    const listItem = button.closest('.list-group-item');
    const nameElement = listItem.querySelector('strong');
    const currentName = nameElement.textContent.trim();
    
    const newName = prompt('Edit character name:', currentName);
    if (newName && newName.trim() !== '') {
      const oldName = currentName;
      const trimmedNewName = newName.trim();
      if (trimmedNewName === oldName) return;
      if (characterFrames.has(trimmedNewName)) {
        showNotification('Character name already in use', 'warning');
        return;
      }
      if (characterFrames.has(oldName)) {
        const data = characterFrames.get(oldName);
        ensureCharacterIdEqualsName(data, trimmedNewName);
        characterFrames.delete(oldName);
        characterFrames.set(trimmedNewName, data);
      }
      if (characterScripts.has(oldName)) {
        const script = characterScripts.get(oldName);
        characterScripts.delete(oldName);
        characterScripts.set(trimmedNewName, script);
      }
      // Rinomina script key Character:old → Character:new
      try {
        const oldKey = `Character:${oldName}`;
        const newKey = `Character:${trimmedNewName}`;
        if (jsScripts && jsScripts.has(oldKey)) {
          jsScripts.set(newKey, jsScripts.get(oldKey));
          jsScripts.delete(oldKey);
        }
      } catch (_) {}
      // Sync starting player / spawn id=name
      try {
        let s = null;
        try { s = JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) { s = null; }
        if (s && s.startingPlayer === oldName) {
          persistStartSettings({ startingPlayer: trimmedNewName });
        }
      } catch (_) {}
      const characterSelector = document.getElementById('character-selector');
      if (characterSelector && characterSelector.value === oldName) {
        characterSelector.value = trimmedNewName;
        loadCharacterDirections();
      }
      refreshCharactersListUI();
      try { if (typeof refreshScriptsTree === 'function') refreshScriptsTree(); } catch (_) {}
      notifyEditorProjectChanged();
      showNotification(`Character renamed to "${trimmedNewName}" (id=name)`, 'success');
    }
  };

  window.editCharacterDialogs = function(button) {
    const listItem = button.closest('.list-group-item');
    const nameElement = listItem.querySelector('strong');
    const characterName = nameElement.textContent;
    
    // Simple dialog editor - in a real app this would open a more complex dialog
    const dialogText = prompt(`Edit dialogs for "${characterName}":`, 'Hello! How can I help you?');
    if (dialogText && dialogText.trim() !== '') {
      showNotification(`Dialog updated for "${characterName}"`, 'success');
      console.log(`Dialog for ${characterName}: ${dialogText}`);
    }
  };

  // Functions for Scripts tab
  // Character animation frames state and preview
  const characterFrames = new Map(); // characterName -> { directions: {...}, animations: { name: { directions: {...} } }, currentFrame: 0 }
  let characterPreviewTimer = null;
  let characterPreviewIndex = 0;
  let currentDirection = 'south'; // Default direction

  const DIRECTION_LABELS = {
    north: 'North',
    northeast: 'Northeast',
    east: 'East',
    southeast: 'Southeast',
    south: 'South',
    southwest: 'Southwest',
    west: 'West',
    northwest: 'Northwest'
  };

  function getSelectedCharacterAnimationKey() {
    const animSel = document.getElementById('character-animation-selector');
    const val = animSel ? animSel.value : 'walking';
    return val || 'walking';
  }

  function getCharacterDirectionsStore(charData) {
    if (!charData) return null;
    const animKey = getSelectedCharacterAnimationKey();
    if (animKey === 'walking') {
      if (!charData.directions) charData.directions = {};
      return charData.directions;
    }
    if (!charData.animations) charData.animations = {};
    if (!charData.animations[animKey]) charData.animations[animKey] = { directions: {} };
    if (!charData.animations[animKey].directions) charData.animations[animKey].directions = {};
    return charData.animations[animKey].directions;
  }

  function resetDirectionSelectorLabels() {
    const dirSel = document.getElementById('direction-selector');
    if (!dirSel) return;
    dirSel.querySelectorAll('option').forEach(opt => {
      if (DIRECTION_LABELS[opt.value]) opt.textContent = DIRECTION_LABELS[opt.value];
    });
  }

  function refreshCharacterAnimationSelector(characterName) {
    const sel = document.getElementById('character-animation-selector');
    const removeBtn = document.getElementById('btn-remove-character-animation');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const walkOpt = document.createElement('option');
    walkOpt.value = 'walking';
    walkOpt.textContent = 'Walking (standard)';
    sel.appendChild(walkOpt);
    const charData = characterName ? characterFrames.get(characterName) : null;
    if (charData && charData.animations) {
      Object.keys(charData.animations).sort((a, b) => a.localeCompare(b)).forEach(name => {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
    }
    if (prev && Array.from(sel.options).some(o => o.value === prev)) {
      sel.value = prev;
    } else {
      sel.value = 'walking';
    }
    if (removeBtn) {
      removeBtn.disabled = sel.value === 'walking';
    }
    updateCharacterAnimationUILabel();
  }

  function updateCharacterAnimationUILabel() {
    const label = document.getElementById('character-animation-direction-label');
    const isWalking = getSelectedCharacterAnimationKey() === 'walking';
    if (label) {
      label.textContent = isWalking
        ? 'Select direction (8 directions):'
        : 'Select direction for this animation (8 directions):';
    }
    const removeBtn = document.getElementById('btn-remove-character-animation');
    if (removeBtn) {
      removeBtn.disabled = getSelectedCharacterAnimationKey() === 'walking';
    }
  }

  window.onCharacterAnimationChange = function() {
    stopCharacterPreview();
    resetDirectionSelectorLabels();
    updateCharacterAnimationUILabel();
    updateDirectionInfo();
    redraw();
  };

  window.addCharacterAnimation = async function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      showNotification('Select a character first', 'warning');
      return;
    }
    const name = await showInputPrompt({
      title: 'New Character Animation',
      message: 'Animation name (e.g. idle, talk, pick_up):',
      defaultValue: ''
    });
    if (!name || !name.trim()) return;
    const animName = name.trim();
    if (animName.toLowerCase() === 'walking') {
      showNotification('"walking" is reserved for the standard walk cycle', 'warning');
      return;
    }
    let charData = characterFrames.get(who);
    if (!charData) {
      charData = createEmptyCharacterData(who);
      characterFrames.set(who, charData);
    }
    if (!charData.animations) charData.animations = {};
    if (charData.animations[animName]) {
      showNotification(`Animation "${animName}" already exists`, 'warning');
      return;
    }
    charData.animations[animName] = { directions: {} };
    characterFrames.set(who, charData);
    refreshCharacterAnimationSelector(who);
    const animSel = document.getElementById('character-animation-selector');
    if (animSel) animSel.value = animName;
    onCharacterAnimationChange();
    showNotification(`Animation "${animName}" added`, 'success');
    notifyEditorProjectChanged();
  };

  window.removeCharacterAnimation = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      showNotification('Select a character first', 'warning');
      return;
    }
    const animKey = getSelectedCharacterAnimationKey();
    if (animKey === 'walking') {
      showNotification('Cannot remove the standard walking animation', 'warning');
      return;
    }
    if (!confirm(`Remove animation "${animKey}" and all its frames?`)) return;
    const charData = characterFrames.get(who);
    if (charData && charData.animations) {
      delete charData.animations[animKey];
      characterFrames.set(who, charData);
    }
    refreshCharacterAnimationSelector(who);
    onCharacterAnimationChange();
    showNotification(`Animation "${animKey}" removed`, 'info');
  };

  async function loadCharacterDirectionsFromData(directionsSource, projectId, characterName) {
    const directions = {};
    if (directionsSource) {
      for (const [dir, data] of Object.entries(directionsSource)) {
        const frames = [];
        if (Array.isArray(data.frames)) {
          for (const f of data.frames) {
            if (f && typeof f === 'object' && f.mirror && typeof f.mirror === 'string') {
              frames.push({ mirror: f.mirror });
            } else {
              const img = await createImageFromDataUrl(f, projectId);
              if (img) {
                frames.push(img);
                if (f && typeof f === 'string' && f.startsWith('asset:')) {
                  const assetId = f.replace('asset:', '');
                  imageAssetMap.set(img, {
                    assetId,
                    type: 'character',
                    projectId,
                    subfolder: `characters/${characterName}`
                  });
                }
              }
            }
          }
        }
        directions[dir] = { fps: Number(data.fps) || 8, frames };
      }
    }
    return directions;
  }

  function serializeDirectionsMap(directionsMap) {
    const out = {};
    if (!directionsMap) return out;
    const directionsList = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    directionsList.forEach(dir => {
      const d = directionsMap[dir];
      if (d) {
        const frames = Array.isArray(d.frames) ? d.frames.map(fr => {
          if (!fr) return null;
          if (fr.mirror && typeof fr.mirror === 'string') return { mirror: fr.mirror };
          if (fr.img && typeof fr.img === 'object') return serializeImage(fr.img);
          if (typeof fr === 'object' && (fr.src || (fr.width && fr.height))) return serializeImage(fr);
          if (typeof fr === 'string') return fr;
          return null;
        }).filter(Boolean) : [];
        out[dir] = { fps: Number(d.fps) || 8, frames };
      }
    });
    return out;
  }
  
  // Traccia i frame caricati durante la sessione corrente che non sono stati ancora salvati nel progetto
  // Questo permette di eliminarli dallo storage locale se si chiude il browser o si fa logout senza salvare
  const unsavedCharacterFrames = new Set(); // Set di Image objects caricati ma non ancora salvati nel progetto
  const unsavedCharacterAssetIds = new Set(); // Set di assetId di frame character non ancora salvati nel progetto

  function refreshCharacterSelector() {
    const sel = document.getElementById('character-selector');
    if (!sel) return;
    const previous = sel.value;
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Select character...';
    sel.appendChild(opt);
    const names = [];
    characterFrames.forEach((_, name) => names.push(name));
    names.sort((a, b) => a.localeCompare(b));
    names.forEach((name) => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (previous && names.includes(previous)) {
      sel.value = previous;
    }
  }

  // Persist a subset of start settings into localStorage
  function persistStartSettings(partial) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (Object.prototype.hasOwnProperty.call(partial, 'startingPlayer')) s.startingPlayer = partial.startingPlayer;
    if (Object.prototype.hasOwnProperty.call(partial, 'startRoomId')) s.startRoomId = partial.startRoomId;
    if (Object.prototype.hasOwnProperty.call(partial, 'startX')) s.startX = Number(partial.startX) || 0;
    if (Object.prototype.hasOwnProperty.call(partial, 'startY')) s.startY = Number(partial.startY) || 0;
    localStorage.setItem('amiantoProjectSettings', JSON.stringify(s));

    // Mantieni allineati spawnSettings del player (runtime usa quelli se isPlayer)
    try {
      const playerName = s.startingPlayer
        || [...characterFrames.keys()].find(n => {
          const d = characterFrames.get(n);
          return d && d.spawnSettings && d.spawnSettings.isPlayer === true;
        });
      if (playerName && characterFrames.has(playerName)) {
        const charData = characterFrames.get(playerName);
        ensureCharacterSpawnSettings(charData);
        if (Object.prototype.hasOwnProperty.call(partial, 'startX')) charData.spawnSettings.x = s.startX;
        if (Object.prototype.hasOwnProperty.call(partial, 'startY')) charData.spawnSettings.y = s.startY;
        if (Object.prototype.hasOwnProperty.call(partial, 'startRoomId')) charData.spawnSettings.roomId = s.startRoomId || charData.spawnSettings.roomId;
        if (Object.prototype.hasOwnProperty.call(partial, 'startingPlayer')) {
          charData.spawnSettings.isPlayer = true;
        }
      }
    } catch (_) {}
  }

  // Build radio list of characters for selecting the starting player
  function refreshStartingPlayerUI() {
    const container = document.getElementById('starting-player-list');
    if (!container) return;
    container.innerHTML = '';

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) { saved = null; }
    const selectedName = saved && saved.startingPlayer ? String(saved.startingPlayer) : null;

    const names = [];
    try {
      document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => names.push(s.textContent.trim()));
    } catch (_) {}

    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-muted small';
      empty.textContent = 'No characters available';
      container.appendChild(empty);
      return;
    }

    names.forEach((name, i) => {
      const id = `starting-player-${i}`;
      const label = document.createElement('label');
      label.className = 'list-group-item d-flex align-items-center';
      label.innerHTML = `<input class="form-check-input me-2" type="radio" name="starting-player" id="${id}" value="${name}"> <span>${name}</span>`;
      container.appendChild(label);
    });

    // Set selection
    const radios = container.querySelectorAll('input[name="starting-player"]');
    let matched = false;
    radios.forEach(r => { if (selectedName && r.value === selectedName) { r.checked = true; matched = true; } });
    if (!matched && radios[0]) radios[0].checked = true;

    // Bind change (overwrite previous)
    container.onchange = function(e) {
      const t = e && e.target;
      if (t && t.name === 'starting-player') persistStartSettings({ startingPlayer: t.value });
    };
  }

  // Populate start room selector and bind position input
  function refreshStartRoomSelector() {
    const sel = document.getElementById('start-room-selector');
    if (!sel) return;
    sel.innerHTML = '';

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) { saved = null; }
    const savedRoomId = saved && saved.startRoomId ? String(saved.startRoomId) : null;

    rooms.forEach((room) => {
      const opt = document.createElement('option');
      opt.value = room.id;
      opt.textContent = room.name || room.id;
      if ((savedRoomId && room.id === savedRoomId) || (!savedRoomId && room.id === currentRoomId)) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.onchange = function() { persistStartSettings({ startRoomId: sel.value }); };

    const startPositionInput = document.getElementById('start-position');
    if (startPositionInput) {
      if (saved && (typeof saved.startX !== 'undefined' || typeof saved.startY !== 'undefined')) {
        const x = Number(saved.startX) || 0;
        const y = Number(saved.startY) || 0;
        startPositionInput.value = formatPositionString(x, y);
      } else {
        startPositionInput.value = '0, 0';
      }
      startPositionInput.oninput = function() {
        const parsed = parsePositionString(startPositionInput.value);
        persistStartSettings({ startX: parsed.x, startY: parsed.y });
      };
    }
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail.currentTab === 'characters') {
      refreshCharactersListUI();
      refreshStartRoomSelector();
    }
  });

  window.loadCharacterDirections = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      // Reset toggle a "upload" quando non c'Ã¨ character selezionato
      const uploadRadio = document.getElementById('frame-source-upload');
      if (uploadRadio) uploadRadio.checked = true;
      toggleFrameSource();
      return;
    }

    const dirSel = document.getElementById('direction-selector');
    if (!dirSel) return;

    refreshCharacterAnimationSelector(who);
    resetDirectionSelectorLabels();
    const charData = characterFrames.get(who);
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (activeDirections) {
      const directions = Object.keys(activeDirections);
      if (directions.length > 0) {
        dirSel.value = directions[0];
        currentDirection = directions[0];
      }
    }
    updateDirectionInfo(); // Update direction info display
    // Initialize pivot if needed
    if (charData) {
      initializePivotForCharacter(charData, currentDirection);
    }
    // Assicura che il toggle sia inizializzato
    toggleFrameSource();
    refreshCharactersListUI();
    redraw(); // Redraw to show pivot if it exists
    refreshFramesPreview();
    
    // Carica spawn settings per questo character
    loadCharacterSpawnSettings(who);
  };

  // Carica le impostazioni di spawn per un character
  function loadCharacterSpawnSettings(characterName) {
    const spawnSettings = document.getElementById('character-spawn-settings');
    if (!spawnSettings) {
      console.warn('[Character] spawn-settings element non trovato');
      return;
    }
    
    const charData = characterFrames.get(characterName);
    ensureCharacterSpawnSettings(charData);
    const spawnData = charData ? charData.spawnSettings : getDefaultCharacterSpawnSettings();
    
    // Debug: log per verificare il caricamento
    console.log(`[Character] Caricamento spawnSettings per "${characterName}":`, spawnData);
    
    // Mostra la sezione
    spawnSettings.style.display = 'block';
    
    // Carica checkbox isPlayer
    const isPlayerCheck = document.getElementById('character-spawn-is-player');
    if (isPlayerCheck) {
      const isPlayerValue = spawnData.isPlayer === true;
      isPlayerCheck.checked = isPlayerValue;
      console.log(`[Character] isPlayer checkbox impostata a: ${isPlayerValue}`);
    } else {
      console.warn('[Character] isPlayer checkbox non trovata');
    }
    
    // Carica checkbox autoSpawn
    const autoSpawnCheck = document.getElementById('character-spawn-auto');
    if (autoSpawnCheck) {
      const autoSpawnValue = spawnData.autoSpawn === true;
      autoSpawnCheck.checked = autoSpawnValue;
      console.log(`[Character] autoSpawn checkbox impostata a: ${autoSpawnValue}`);
    } else {
      console.warn('[Character] autoSpawn checkbox non trovata');
    }
    
    // Aggiorna visibilitÃ  dei campi (dopo aver caricato entrambe le checkbox)
    updateSpawnSettingsVisibility();
    
    // Carica room selector
    const roomSelect = document.getElementById('character-spawn-room');
    if (roomSelect) {
      roomSelect.innerHTML = '';
      rooms.forEach((room) => {
        const opt = document.createElement('option');
        opt.value = room.id;
        opt.textContent = room.name || room.id;
        if (spawnData.roomId && room.id === spawnData.roomId) opt.selected = true;
        roomSelect.appendChild(opt);
      });
      if (spawnData.roomId) {
        roomSelect.value = spawnData.roomId;
      }
    }
    
    // Carica position
    const positionInput = document.getElementById('character-spawn-position');
    if (positionInput) {
      if (spawnData.x !== undefined && spawnData.y !== undefined) {
        positionInput.value = formatPositionString(spawnData.x, spawnData.y);
      } else {
        positionInput.value = '0, 0';
      }
    }
    
    // Carica direction
    const directionSelect = document.getElementById('character-spawn-direction');
    if (directionSelect && spawnData.direction) {
      directionSelect.value = spawnData.direction;
    }
    
    // Carica moveSpeed
    const speedInput = document.getElementById('character-spawn-speed');
    if (speedInput) {
      if (spawnData.moveSpeed !== undefined && spawnData.moveSpeed !== null) {
        speedInput.value = spawnData.moveSpeed;
      } else {
        speedInput.value = 100; // valore di default
      }
    }

    refreshCharacterPortraitsUI(characterName);
  }

  function refreshCharacterPortraitsUI(characterName) {
    const list = document.getElementById('character-portraits-list');
    if (!list) return;
    const charData = characterName ? characterFrames.get(characterName) : null;
    const portraits = (charData && charData.portraits && typeof charData.portraits === 'object')
      ? charData.portraits
      : {};
    const keys = Object.keys(portraits);
    if (!keys.length) {
      list.innerHTML = '<div class="text-muted small">No portraits yet.</div>';
      return;
    }
    list.innerHTML = keys.map(mood => {
      const hasImg = !!(portraits[mood]);
      return `<div class="d-flex justify-content-between align-items-center mb-1" data-portrait-mood="${escapeHtmlAttr(mood)}">
        <span class="text-light small"><code style="color:#39ff14">${escapeHtmlAttr(mood)}</code> ${hasImg ? '✓' : ''}</span>
        <button type="button" class="btn btn-outline-danger btn-sm py-0" data-del-portrait="${escapeHtmlAttr(mood)}">×</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-del-portrait]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mood = btn.getAttribute('data-del-portrait');
        const cd = characterFrames.get(characterName);
        if (!cd || !cd.portraits) return;
        delete cd.portraits[mood];
        if (!Object.keys(cd.portraits).length) delete cd.portraits;
        characterFrames.set(characterName, cd);
        if (typeof window.markAmiantoProjectDirty === 'function') window.markAmiantoProjectDirty();
        refreshCharacterPortraitsUI(characterName);
      });
    });
  }

  // Salva le impostazioni di spawn per il character corrente
  function saveCharacterSpawnSettings() {
    const sel = document.getElementById('character-selector');
    const characterName = sel ? sel.value : '';
    if (!characterName) return;
    
    const charData = characterFrames.get(characterName);
    if (!charData) return;
    
    ensureCharacterSpawnSettings(charData);
    
    // Leggi i valori dall'UI
    const isPlayerCheck = document.getElementById('character-spawn-is-player');
    const autoSpawnCheck = document.getElementById('character-spawn-auto');
    const roomSelect = document.getElementById('character-spawn-room');
    const positionInput = document.getElementById('character-spawn-position');
    const directionSelect = document.getElementById('character-spawn-direction');
    
    if (isPlayerCheck) {
      charData.spawnSettings.isPlayer = isPlayerCheck.checked;
      console.log(`[Character] Salvataggio isPlayer per "${characterName}": ${isPlayerCheck.checked}`);
    }
    
    if (autoSpawnCheck) {
      charData.spawnSettings.autoSpawn = autoSpawnCheck.checked;
      console.log(`[Character] Salvataggio autoSpawn per "${characterName}": ${autoSpawnCheck.checked}`);
    }
    
    if (roomSelect) {
      charData.spawnSettings.roomId = roomSelect.value || null;
    }
    
    if (positionInput) {
      const parsed = parsePositionString(positionInput.value);
      charData.spawnSettings.x = parsed.x;
      charData.spawnSettings.y = parsed.y;
    }
    
    if (directionSelect) {
      charData.spawnSettings.direction = directionSelect.value || 'south';
    }
    
    // Salva moveSpeed
    const speedInput = document.getElementById('character-spawn-speed');
    if (speedInput) {
      const speedValue = Number(speedInput.value);
      if (!isNaN(speedValue) && speedValue > 0) {
        charData.spawnSettings.moveSpeed = speedValue;
        console.log(`[Character] Salvataggio moveSpeed per "${characterName}": ${speedValue}`);
      } else {
        charData.spawnSettings.moveSpeed = 100; // valore di default se non valido
      }
    }

    // Se è il player, sincronizza anche Start Position legacy (settings.startX/Y)
    if (charData.spawnSettings.isPlayer === true) {
      // Un solo player: spegni isPlayer sugli altri
      characterFrames.forEach((other, otherName) => {
        if (otherName !== characterName && other && other.spawnSettings) {
          other.spawnSettings.isPlayer = false;
        }
      });
      persistStartSettings({
        startingPlayer: characterName,
        startRoomId: charData.spawnSettings.roomId || null,
        startX: charData.spawnSettings.x,
        startY: charData.spawnSettings.y
      });
      const startPositionInput = document.getElementById('start-position');
      if (startPositionInput) {
        startPositionInput.value = formatPositionString(charData.spawnSettings.x, charData.spawnSettings.y);
      }
      try { refreshStartingPlayerUI(); } catch (_) {}
      try { refreshStartRoomSelector(); } catch (_) {}
    }
    
    // Salva nel characterFrames
    characterFrames.set(characterName, charData);
  }

  // Aggiorna la visibilitÃ  dei campi spawn (Starting Room, posizione, direzione e velocitÃ  sempre visibili)
  function updateSpawnSettingsVisibility() {
    const roomContainer = document.getElementById('character-spawn-room-container');
    const positionContainer = document.getElementById('character-spawn-position-container');
    const directionContainer = document.getElementById('character-spawn-direction-container');
    const speedContainer = document.getElementById('character-spawn-speed-container');
    
    if (roomContainer) roomContainer.style.display = 'block';
    if (positionContainer) positionContainer.style.display = 'block';
    if (directionContainer) directionContainer.style.display = 'block';
    if (speedContainer) speedContainer.style.display = 'block';
  }

  // Character spawn / portrait UI (already inside outer DOMContentLoaded — do not nest another)
  {
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
      characterSelector.addEventListener('change', function() {
        loadCharacterDirections();
      });
    }

    const isPlayerCheck = document.getElementById('character-spawn-is-player');
    const autoSpawnCheck = document.getElementById('character-spawn-auto');
    const roomSelect = document.getElementById('character-spawn-room');
    const positionInput = document.getElementById('character-spawn-position');
    const directionSelect = document.getElementById('character-spawn-direction');

    if (isPlayerCheck) {
      isPlayerCheck.addEventListener('change', function() {
        saveCharacterSpawnSettings();
        updateSpawnSettingsVisibility();
      });
    }

    if (autoSpawnCheck) {
      autoSpawnCheck.addEventListener('change', function() {
        saveCharacterSpawnSettings();
        updateSpawnSettingsVisibility();
      });
    }

    if (roomSelect) {
      roomSelect.addEventListener('change', saveCharacterSpawnSettings);
    }

    if (positionInput) {
      positionInput.addEventListener('input', function() {
        const parsed = parsePositionString(positionInput.value);
        if (parsed.valid) {
          saveCharacterSpawnSettings();
        }
      });
    }

    if (directionSelect) {
      directionSelect.addEventListener('change', saveCharacterSpawnSettings);
    }

    const speedInput = document.getElementById('character-spawn-speed');
    if (speedInput) {
      speedInput.addEventListener('change', saveCharacterSpawnSettings);
      speedInput.addEventListener('input', function() {
        const value = Number(speedInput.value);
        if (!isNaN(value) && value > 0 && value <= 1000) {
          saveCharacterSpawnSettings();
        }
      });
    }

    const portraitAddBtn = document.getElementById('character-portrait-add-btn');
    if (portraitAddBtn && !portraitAddBtn._amiantoBound) {
      portraitAddBtn._amiantoBound = true;
      portraitAddBtn.addEventListener('click', async function() {
        const sel = document.getElementById('character-selector');
        const characterName = sel ? sel.value : '';
        if (!characterName) {
          showNotification('Select a character first', 'warning');
          return;
        }
        const moodInput = document.getElementById('character-portrait-mood');
        const mood = String(moodInput && moodInput.value ? moodInput.value : '').trim() || 'default';
        const resource = await pickResourceImage({ title: 'Portrait for mood: ' + mood });
        if (!resource) return;
        const img = await loadImageFromResourceEntry(resource);
        if (!img) {
          showNotification('Could not load portrait image', 'warning');
          return;
        }
        let charData = characterFrames.get(characterName);
        if (!charData) {
          charData = createEmptyCharacterData(characterName);
        }
        if (!charData.portraits) charData.portraits = {};
        const serialized = typeof serializeImage === 'function' ? serializeImage(img) : (img.src || '');
        charData.portraits[mood] = serialized || img.src || resource.publicUrl || '';
        characterFrames.set(characterName, charData);
        if (moodInput) moodInput.value = '';
        if (typeof window.markAmiantoProjectDirty === 'function') window.markAmiantoProjectDirty();
        refreshCharacterPortraitsUI(characterName);
        showNotification(`Portrait "${mood}" set for ${characterName}`, 'success');
      });
    }

    if (canvas) {
      canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();

        const worldPos = screenToWorld(e.clientX, e.clientY);
        const roundedX = Math.round(worldPos.x);
        const roundedY = Math.round(worldPos.y);

        const sel = document.getElementById('character-selector');
        if (sel && sel.value) {
          const currentTab = document.querySelector('.nav-link.active');
          if (currentTab && currentTab.getAttribute('data-tab') === 'characters') {
            const posInput = document.getElementById('character-spawn-position');
            if (posInput) {
              posInput.value = formatPositionString(roundedX, roundedY);
              const parsed = parsePositionString(posInput.value);
              if (parsed.valid) {
                posInput.style.backgroundColor = '#2d5016';
                setTimeout(() => {
                  posInput.style.backgroundColor = '';
                }, 500);
                saveCharacterSpawnSettings();
              }
            }
          }
        }
      });
    }
  }

  window.uploadCharacterFrames = async function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }

    const animLabel = getSelectedCharacterAnimationKey() === 'walking' ? 'walking' : getSelectedCharacterAnimationKey();
    const resources = await pickResourceImage({
      title: `Animation frames â€” ${who} [${animLabel}]`,
      multiple: true,
      hint: 'Click multiple images to select them. Confirm with Â«Add selectionÂ». Frame order follows numbers in the file name.'
    });
    if (!resources || !resources.length) return;

    const dirSel = document.getElementById('direction-selector');
    const direction = dirSel ? dirSel.value : 'south';

    if (!currentUser) {
      showNotification('Open a project first', 'warning');
      return;
    }

    const projectId = getActiveProjectId();
    if (!projectId) {
      showNotification('No project is open', 'warning');
      return;
    }

    let charData = characterFrames.get(who);
    if (!charData) {
      charData = createEmptyCharacterData(who);
      characterFrames.set(who, charData);
    }

    const activeDirections = getCharacterDirectionsStore(charData);
    if (!activeDirections[direction]) {
      activeDirections[direction] = { frames: [], fps: 8 };
    }

    const dirData = activeDirections[direction];
    
    // Calcola l'indice di partenza per i nuovi frame (aggiungi alla fine invece di sovrascrivere)
    const existingFrameCount = dirData.frames ? dirData.frames.length : 0;
    
    // Funzione helper per estrarre il numero dal nome del file
    // Supporta qualsiasi pattern: frame_01.png, file.001.png, walk-1.png, etc.
    const extractNumberFromFileName = (fileName) => {
      // Rimuovi l'estensione per analizzare solo il nome
      const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
      
      // Estrai tutti i numeri dal nome del file (mantenendo le posizioni)
      const numberMatches = [];
      let match;
      const numberRegex = /\d+/g;
      
      while ((match = numberRegex.exec(nameWithoutExt)) !== null) {
        numberMatches.push({
          value: parseInt(match[0], 10),
          original: match[0], // Mantieni il valore originale con padding
          position: match.index,
          length: match[0].length
        });
      }
      
      if (numberMatches.length === 0) {
        // Se non trova numeri, usa un numero molto grande per metterli alla fine
        return Infinity;
      }
      
      // Se c'Ã¨ un solo numero, usalo
      if (numberMatches.length === 1) {
        return numberMatches[0].value;
      }
      
      // Se ci sono piÃ¹ numeri, preferisci quello con padding (001, 002, 01, etc.)
      // perchÃ© di solito Ã¨ il frame number
      const paddedNumbers = numberMatches.filter(n => n.original.length >= 2 && n.original.startsWith('0'));
      
      if (paddedNumbers.length > 0) {
        // Se ci sono numeri con padding, usa quello con piÃ¹ cifre (001 > 01)
        // o se hanno la stessa lunghezza, usa l'ultimo
        paddedNumbers.sort((a, b) => {
          if (b.length !== a.length) return b.length - a.length; // Preferisci piÃ¹ cifre
          return b.position - a.position; // Se stessa lunghezza, usa l'ultimo
        });
        return paddedNumbers[0].value;
      }
      
      // Se non ci sono numeri con padding, usa l'ultimo numero trovato
      // (spesso Ã¨ il frame number quando ci sono altri numeri nel nome)
      return numberMatches[numberMatches.length - 1].value;
    };
    
    // Ordina le risorse in base al numero presente nel nome (ordine crescente)
    const sortedFiles = [...resources].sort((a, b) => {
      const numA = extractNumberFromFileName(a.displayName || a.fileName || a.name);
      const numB = extractNumberFromFileName(b.displayName || b.fileName || b.name);
      
      // Se entrambi hanno numeri, ordina per numero (crescente)
      if (numA !== Infinity && numB !== Infinity) {
        return numA - numB;
      }
      
      // Se solo uno ha un numero, quello con numero viene prima
      if (numA !== Infinity) return -1;
      if (numB !== Infinity) return 1;
      
      // Se nessuno ha numeri, ordina alfabeticamente
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    });
    
    console.log(`[Frame] ðŸ“ Resources (${resources.length}):`, resources.map(f => f.displayName || f.name));
    console.log(`[Frame] âœ… Ordinati (${sortedFiles.length}):`, sortedFiles.map(f => {
      const num = extractNumberFromFileName(f.displayName || f.fileName || f.name);
      return `${f.displayName || f.name} â†’ num: ${num !== Infinity ? num : 'N/A'}`;
    }));
    
    // Verifica che l'ordinamento sia corretto
    const orderCheck = sortedFiles.map((f, idx) => {
      const label = f.displayName || f.name;
      const num = extractNumberFromFileName(label);
      const prevNum = idx > 0 ? extractNumberFromFileName(sortedFiles[idx - 1].displayName || sortedFiles[idx - 1].name) : -1;
      const isOrdered = num === Infinity || prevNum === Infinity || num >= prevNum;
      return { file: label, num, isOrdered };
    });
    console.log(`[Frame] ðŸ” Verifica ordine:`, orderCheck);
    
    // Carica i frame su storage e registra nella mappa
    showNotification(`Loading ${sortedFiles.length} frame(s) from Resources...`, 'info');
    
    try {
      const framePromises = sortedFiles.map(async (resource, index) => {
        try {
          const actualFrameIndex = existingFrameCount + index;
          const img = await loadImageFromResourceEntry(resource);
          if (!img) throw new Error('Failed to load image from Resources');

          const frameData = {
            img: img,
            name: resource.displayName || resource.fileName || resource.name,
            orderIndex: actualFrameIndex
          };
          
          return { frameData, index: actualFrameIndex, assetId: resource.assetId };
        } catch (error) {
          console.error(`[Frame] âŒ Errore frame ${resource.displayName || resource.name}:`, error);
          return { frameData: null, index: existingFrameCount + index, error: error.message };
        }
      });
      
      const results = await Promise.all(framePromises);
      
      // Ordina per indice e aggiungi i frame nell'ordine corretto
      results.sort((a, b) => a.index - b.index);
      
      let successCount = 0;
      let errorCount = 0;
      
      results.forEach(({ frameData, index, assetId, error }) => {
        if (frameData) {
          dirData.frames.push(frameData);
          successCount++;
          console.log(`[Frame] âœ… Frame ${index} caricato: ${assetId}`);
        } else {
          errorCount++;
          console.error(`[Frame] âŒ Frame ${index} fallito: ${error || 'Unknown error'}`);
        }
      });
      
      // Aggiorna la mappa characterFrames
      characterFrames.set(who, charData);
      
      if (successCount > 0) {
        showNotification(`${successCount} frame(s) uploaded and saved to storage`, 'success');
        updateDirectionInfo();
        // Initialize pivot if it doesn't exist
        initializePivotForCharacter(charData, direction);
        redraw();
      }
      
      if (errorCount > 0) {
        showNotification(`âš ï¸ ${errorCount} frame(s) failed to upload`, 'warning');
      }
      
    } catch (error) {
      console.error('[Frame] âŒ Errore durante upload frame:', error);
      showNotification('Error uploading frames', 'error');
    }
  };

  const btnCharacterFramesBrowse = document.getElementById('btn-character-frames-browse');
  if (btnCharacterFramesBrowse) {
    btnCharacterFramesBrowse.addEventListener('click', () => window.uploadCharacterFrames());
  }

  window.startCharacterPreview = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }
    const charData = characterFrames.get(who);
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (!charData || !activeDirections || !activeDirections[currentDirection] || !activeDirections[currentDirection].frames.length) {
      showNotification('No frames loaded for this character and direction', 'warning');
      return;
    }

    // Ferma la preview precedente se attiva
    if (characterPreviewTimer) {
      clearInterval(characterPreviewTimer);
      characterPreviewTimer = null;
    }

    const dirData = activeDirections[currentDirection];
    const totalFrames = dirData.frames.length;
    const fps = Number(dirData.fps) || 8;
    
    // Calcola l'intervallo in millisecondi con maggiore precisione
    // FPS = frames per secondo, quindi intervallo = 1000ms / fps
    const interval = Math.max(1, Math.round(1000 / fps));
    
    // Reset dell'indice all'inizio
    characterPreviewIndex = 0;
    
    // Ridisegna immediatamente il primo frame
    redraw();
    
    // Avvia il timer per l'animazione
    characterPreviewTimer = setInterval(() => {
      // Incrementa l'indice
      characterPreviewIndex++;
      
      // Loop: quando raggiunge il numero totale di frame, riparte da 0
      if (characterPreviewIndex >= totalFrames) {
        characterPreviewIndex = 0;
      }
      
      // Verifica che ci siano ancora frame (potrebbero essere stati eliminati)
      const currentCharData = characterFrames.get(who);
      const currentDirs = currentCharData ? getCharacterDirectionsStore(currentCharData) : null;
      if (!currentCharData || !currentDirs || !currentDirs[currentDirection] ||
          !currentDirs[currentDirection].frames.length) {
        stopCharacterPreview();
        return;
      }
      
      // Ridisegna il frame corrente
      redraw();
    }, interval);
    
    const animLabel = getSelectedCharacterAnimationKey() === 'walking' ? 'walking' : getSelectedCharacterAnimationKey();
    showNotification(`Preview started: ${who} [${animLabel}] (${currentDirection}) - ${totalFrames} frame${totalFrames !== 1 ? 's' : ''} @ ${fps} FPS (${interval}ms/frame)`, 'info');
  };

  window.stopCharacterPreview = function() {
    if (characterPreviewTimer) {
      clearInterval(characterPreviewTimer);
      characterPreviewTimer = null;
      showNotification('Preview stopped', 'info');
    }
  };

  window.clearCharacterFrames = async function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }

    const animLabel = getSelectedCharacterAnimationKey() === 'walking' ? 'walking' : getSelectedCharacterAnimationKey();
    if (confirm(`Clear all frames for animation "${animLabel}"?`)) {
      // Ferma la preview se Ã¨ attiva
      stopCharacterPreview();

      const charData = characterFrames.get(who);
      const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;

      // Pulisce tutti i frame per tutte le direzioni dell'animazione corrente
      if (activeDirections) {
        for (const dirData of Object.values(activeDirections)) {
          if (dirData.frames) dirData.frames = [];
        }
        if (charData) characterFrames.set(who, charData);
      } else if (charData) {
        ensureCharacterSpawnSettings(charData);
        characterFrames.set(who, charData);
      } else {
        characterFrames.set(who, createEmptyCharacterData(who));
      }
      
      // Reset dell'indice della preview
      characterPreviewIndex = 0;
      
      // Aggiorna thumbnails, canvas e informazioni
      updateDirectionInfo();
      refreshFramesPreview();
      // Initialize pivot if frames exist
      if (charData) {
        initializePivotForCharacter(charData, currentDirection);
      }
      redraw();
      
      showNotification(`Frames cleared for ${who} (${animLabel})`, 'success');
    }
  };

  // ============================================
  // Room Animations (catalog + room placements)
  // ============================================

  function notifyEditorProjectChanged() {
    if (typeof window.markAmiantoProjectDirty === 'function') {
      window.markAmiantoProjectDirty();
    }
  }

  /**
   * Prompt testuale compatibile con Electron (window.prompt non è supportato nel renderer).
   * @returns {Promise<string|null>}
   */
  function showInputPrompt({ title = 'Input', message = '', defaultValue = '', okLabel = 'OK' } = {}) {
    if (!window.AMIANTO_IS_ELECTRON && typeof window.prompt === 'function') {
      const result = window.prompt(message || title, defaultValue);
      return Promise.resolve(result === null ? null : result);
    }

    return new Promise((resolve) => {
      const modalId = `amianto-input-prompt-${Date.now()}`;
      const inputId = `${modalId}-field`;
      const modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = modalId;
      modal.setAttribute('tabindex', '-1');
      modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content bg-dark text-light border-secondary">
            <div class="modal-header border-secondary">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              ${message ? `<label class="form-label text-light" for="${inputId}">${message}</label>` : ''}
              <input type="text" class="form-control bg-secondary text-light border-secondary" id="${inputId}" value="">
            </div>
            <div class="modal-footer border-secondary">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-success btn-sm" id="${modalId}-ok">${okLabel}</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const input = modal.querySelector(`#${inputId}`);
      const okBtn = modal.querySelector(`#${modalId}-ok`);
      if (input) input.value = defaultValue;

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const inst = bootstrap.Modal.getInstance(modal);
          if (inst) inst.hide();
        } else {
          modal.remove();
        }
      };

      modal.addEventListener('hidden.bs.modal', () => {
        if (!settled) finish(null);
        modal.remove();
      });

      okBtn.addEventListener('click', () => finish(input ? input.value : ''));
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(input.value);
          }
        });
      }

      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        setTimeout(() => {
          if (input) {
            input.focus();
            input.select();
          }
        }, 150);
      } else {
        finish(window.prompt(message || title, defaultValue));
      }
    });
  }

  function createEmptyRoomAnimationData(name) {
    return {
      id: uid('anim'),
      name: name || 'Animation',
      fps: 8,
      loop: true,
      layer: 'background',
      frames: []
    };
  }

  function extractNumberFromFileName(fileName) {
    const nameWithoutExt = String(fileName || '').replace(/\.[^.]*$/, '');
    const numberMatches = [];
    let match;
    const numberRegex = /\d+/g;
    while ((match = numberRegex.exec(nameWithoutExt)) !== null) {
      numberMatches.push({
        value: parseInt(match[0], 10),
        original: match[0],
        position: match.index,
        length: match[0].length
      });
    }
    if (numberMatches.length === 0) return Infinity;
    if (numberMatches.length === 1) return numberMatches[0].value;
    const paddedNumbers = numberMatches.filter(n => n.original.length >= 2 && n.original.startsWith('0'));
    if (paddedNumbers.length > 0) {
      paddedNumbers.sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return b.position - a.position;
      });
      return paddedNumbers[0].value;
    }
    return numberMatches[numberMatches.length - 1].value;
  }

  function selectRoomAnimationFromList(animId) {
    selectedRoomAnimationId = animId;
    const sel = document.getElementById('room-animation-selector');
    if (sel) sel.value = animId || '';
    onRoomAnimationSelect();
    refreshRoomAnimationsCatalogListUI();
  }

  window.onRoomAnimationSelect = function() {
    const sel = document.getElementById('room-animation-selector');
    selectedRoomAnimationId = sel && sel.value ? sel.value : null;
    const animDef = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
    const fpsInput = document.getElementById('room-animation-fps');
    const layerSel = document.getElementById('room-animation-layer');
    const loopChk = document.getElementById('room-animation-loop');
    if (fpsInput) fpsInput.value = animDef ? (Number(animDef.fps) || 8) : 8;
    if (layerSel) layerSel.value = animDef && animDef.layer === 'foreground' ? 'foreground' : 'background';
    if (loopChk) loopChk.checked = animDef ? animDef.loop !== false : true;
    stopRoomAnimationPreview();
    roomAnimationPreviewIndex = 0;
    refreshRoomAnimationFramesPreview();
    refreshRoomAnimationsCatalogListUI();
    refreshRoomAnimationPickerUI();
    redraw();
  };

  function refreshRoomAnimationSelector() {
    const sel = document.getElementById('room-animation-selector');
    if (!sel) return;
    const previous = sel.value;
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Select animation...';
    sel.appendChild(opt);
    const ids = [];
    roomAnimationsCatalog.forEach((_, id) => ids.push(id));
    ids.sort((a, b) => {
      const na = (roomAnimationsCatalog.get(a) || {}).name || a;
      const nb = (roomAnimationsCatalog.get(b) || {}).name || b;
      return na.localeCompare(nb);
    });
    ids.forEach((id) => {
      const anim = roomAnimationsCatalog.get(id);
      const o = document.createElement('option');
      o.value = id;
      o.textContent = anim ? anim.name : id;
      sel.appendChild(o);
    });
    if (previous && ids.includes(previous)) sel.value = previous;
    else if (selectedRoomAnimationId && ids.includes(selectedRoomAnimationId)) sel.value = selectedRoomAnimationId;
  }

  function refreshRoomAnimationPickerUI() {
    const picker = document.getElementById('room-animation-picker');
    if (!picker) return;
    const previous = picker.value;
    picker.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Select animation...';
    picker.appendChild(opt);
    const ids = [];
    roomAnimationsCatalog.forEach((anim, id) => {
      if (anim && anim.frames && anim.frames.length > 0) ids.push(id);
    });
    ids.sort((a, b) => {
      const na = (roomAnimationsCatalog.get(a) || {}).name || a;
      const nb = (roomAnimationsCatalog.get(b) || {}).name || b;
      return na.localeCompare(nb);
    });
    ids.forEach((id) => {
      const anim = roomAnimationsCatalog.get(id);
      const o = document.createElement('option');
      o.value = id;
      o.textContent = anim ? anim.name : id;
      picker.appendChild(o);
    });
    if (previous && ids.includes(previous)) picker.value = previous;
  }

  function refreshRoomAnimationsCatalogListUI() {
    const list = document.getElementById('room-animations-catalog-list');
    if (!list) return;
    list.innerHTML = '';
    const ids = [];
    roomAnimationsCatalog.forEach((_, id) => ids.push(id));
    ids.sort((a, b) => {
      const na = (roomAnimationsCatalog.get(a) || {}).name || a;
      const nb = (roomAnimationsCatalog.get(b) || {}).name || b;
      return na.localeCompare(nb);
    });
    ids.forEach((id) => {
      const anim = roomAnimationsCatalog.get(id);
      if (!anim) return;
      const isSelected = id === selectedRoomAnimationId;
      const el = document.createElement('div');
      el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      if (isSelected) el.classList.add('border', 'border-info');
      const frameCount = anim.frames ? anim.frames.length : 0;
      const info = document.createElement('div');
      info.innerHTML = `<strong>${anim.name}</strong><br><small class="text-muted">${frameCount} frame${frameCount !== 1 ? 's' : ''} | ${anim.layer || 'background'}</small>`;
      const controls = document.createElement('div');
      const selectBtn = document.createElement('button');
      selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
      selectBtn.textContent = isSelected ? 'Selected' : 'Select';
      selectBtn.addEventListener('click', () => selectRoomAnimationFromList(id));
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn btn-sm btn-outline-light me-1';
      renameBtn.textContent = 'Rename';
      renameBtn.addEventListener('click', () => window.renameRoomAnimation(id));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-outline-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => window.removeRoomAnimation(id));
      controls.appendChild(selectBtn);
      controls.appendChild(renameBtn);
      controls.appendChild(delBtn);
      el.appendChild(info);
      el.appendChild(controls);
      list.appendChild(el);
    });
    refreshRoomAnimationSelector();
    refreshRoomAnimationPickerUI();
  }

  function refreshRoomAnimationFramesPreview() {
    const container = document.getElementById('room-animation-frames-preview');
    if (!container) return;
    const animDef = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
    if (!animDef || !animDef.frames || !animDef.frames.length) {
      container.innerHTML = '<div class="text-muted">No frames loaded</div>';
      return;
    }
    container.innerHTML = '';
    animDef.frames.forEach((frameData, index) => {
      const frameItem = document.createElement('div');
      frameItem.className = 'frame-item';
      frameItem.draggable = true;
      frameItem.dataset.frameIndex = index;
      const img = document.createElement('img');
      img.draggable = false;
      if (frameData && frameData.img) {
        img.src = frameData.img.src || frameData.img;
      }
      const frameLabel = `Frame ${index + 1}`;
      img.alt = frameLabel;

      const frameNumber = document.createElement('div');
      frameNumber.className = 'frame-number';
      frameNumber.textContent = index + 1;

      const frameFileName = document.createElement('div');
      frameFileName.className = 'frame-filename';
      frameFileName.textContent = frameLabel;
      if (frameData && frameData.name) {
        frameFileName.title = frameData.name;
      }

      frameItem.appendChild(img);
      frameItem.appendChild(frameNumber);
      frameItem.appendChild(frameFileName);
      container.appendChild(frameItem);
    });
    initializeRoomAnimationFrameDragDrop();
  }

  function initializeRoomAnimationFrameDragDrop() {
    const container = document.getElementById('room-animation-frames-preview');
    if (!container) return;

    let draggedIndex = null;

    container.querySelectorAll('.frame-item').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(item.dataset.frameIndex, 10);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(draggedIndex)); } catch (_) {}
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedIndex = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIndex = parseInt(item.dataset.frameIndex, 10);
        const fromIndex = draggedIndex;
        if (fromIndex === null || Number.isNaN(targetIndex) || fromIndex === targetIndex) return;
        const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
        if (!anim || !Array.isArray(anim.frames)) return;
        const frames = anim.frames;
        const [draggedFrame] = frames.splice(fromIndex, 1);
        frames.splice(targetIndex, 0, draggedFrame);
        frames.forEach((f, i) => { if (f && typeof f === 'object') f.orderIndex = i; });
        refreshRoomAnimationFramesPreview();
        redraw();
        showNotification(`Frame moved from position ${fromIndex + 1} to ${targetIndex + 1}`, 'success');
        notifyEditorProjectChanged();
      });
    });
  }

  window.addRoomAnimation = async function() {
    const name = (await showInputPrompt({
      title: 'New Animation',
      message: 'Animation name:',
      defaultValue: ''
    }) || '').trim();
    if (!name) return;
    for (const anim of roomAnimationsCatalog.values()) {
      if (anim.name === name) {
        showNotification('Animation name already in use', 'warning');
        return;
      }
    }
    const animData = createEmptyRoomAnimationData(name);
    roomAnimationsCatalog.set(animData.id, animData);
    selectRoomAnimationFromList(animData.id);
    showNotification(`Animation "${name}" added`, 'success');
    notifyEditorProjectChanged();
  };

  window.renameRoomAnimation = async function(animId) {
    const anim = getRoomAnimationDef(animId);
    if (!anim) return;
    const newName = (await showInputPrompt({
      title: 'Rename Animation',
      message: 'New animation name:',
      defaultValue: anim.name
    }) || '').trim();
    if (!newName || newName === anim.name) return;
    for (const [id, other] of roomAnimationsCatalog.entries()) {
      if (id !== animId && other.name === newName) {
        showNotification('Animation name already in use', 'warning');
        return;
      }
    }
    anim.name = newName;
    refreshRoomAnimationsCatalogListUI();
    showNotification(`Animation renamed to "${newName}"`, 'success');
    notifyEditorProjectChanged();
  };

  window.removeRoomAnimation = function(animId) {
    const anim = getRoomAnimationDef(animId);
    if (!anim) return;
    if (!confirm(`Delete animation "${anim.name}"? Room placements using it will also be removed.`)) return;
    stopRoomAnimationPreview();
    roomAnimationsCatalog.delete(animId);
    rooms.forEach((room) => {
      if (Array.isArray(room.animationInstances)) {
        room.animationInstances = room.animationInstances.filter(inst => inst.animationId !== animId);
      }
    });
    if (selectedRoomAnimationId === animId) {
      selectedRoomAnimationId = roomAnimationsCatalog.keys().next().value || null;
    }
    bindRoomRefs();
    refreshRoomAnimationInstancesListUI();
    refreshRoomAnimationsCatalogListUI();
    onRoomAnimationSelect();
    redraw();
    showNotification(`Animation "${anim.name}" deleted`, 'info');
    notifyEditorProjectChanged();
  };

  window.updateRoomAnimationFPS = function() {
    const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
    if (!anim) { showNotification('Select an animation first', 'warning'); return; }
    const fpsInput = document.getElementById('room-animation-fps');
    const fps = fpsInput ? Number(fpsInput.value) : 8;
    anim.fps = Math.max(1, Math.min(60, fps || 8));
    if (fpsInput) fpsInput.value = anim.fps;
    showNotification(`FPS updated to ${anim.fps}`, 'success');
    notifyEditorProjectChanged();
  };

  window.uploadRoomAnimationFrames = async function() {
    if (!selectedRoomAnimationId) {
      showNotification('Select an animation first', 'warning');
      return;
    }
    const anim = getRoomAnimationDef(selectedRoomAnimationId);
    if (!anim) return;

    const resources = await pickResourceImage({
      title: `Animation frames — ${anim.name}`,
      multiple: true,
      hint: 'Click multiple images to select them. Frame order follows numbers in the file name.'
    });
    if (!resources || !resources.length) return;
    if (!currentUser || !getActiveProjectId()) {
      showNotification('Open a project first', 'warning');
      return;
    }

    const existingFrameCount = anim.frames ? anim.frames.length : 0;
    const sortedFiles = [...resources].sort((a, b) => {
      const numA = extractNumberFromFileName(a.displayName || a.fileName || a.name);
      const numB = extractNumberFromFileName(b.displayName || b.fileName || b.name);
      if (numA !== Infinity && numB !== Infinity) return numA - numB;
      if (numA !== Infinity) return -1;
      if (numB !== Infinity) return 1;
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    });

    showNotification(`Loading ${sortedFiles.length} frame(s)...`, 'info');
    try {
      for (let index = 0; index < sortedFiles.length; index++) {
        const resource = sortedFiles[index];
        const img = await loadImageFromResourceEntry(resource);
        if (!img) continue;
        anim.frames.push({
          img,
          name: resource.displayName || resource.fileName || resource.name,
          orderIndex: existingFrameCount + index
        });
        if (resource.assetId) {
          imageAssetMap.set(img, {
            assetId: resource.assetId,
            type: 'animation',
            projectId: getActiveProjectId()
          });
        }
      }
      roomAnimationsCatalog.set(anim.id, anim);
      refreshRoomAnimationFramesPreview();
      refreshRoomAnimationsCatalogListUI();
      refreshRoomAnimationPickerUI();
      redraw();
      showNotification(`${sortedFiles.length} frame(s) added`, 'success');
      notifyEditorProjectChanged();
    } catch (error) {
      console.error('[Animation] Frame upload error:', error);
      showNotification('Error uploading frames', 'error');
    }
  };

  const btnRoomAnimationFramesBrowse = document.getElementById('btn-room-animation-frames-browse');
  if (btnRoomAnimationFramesBrowse) {
    btnRoomAnimationFramesBrowse.addEventListener('click', () => window.uploadRoomAnimationFrames());
  }

  const roomAnimationLayerSel = document.getElementById('room-animation-layer');
  if (roomAnimationLayerSel) {
    roomAnimationLayerSel.addEventListener('change', () => {
      const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
      if (!anim) return;
      anim.layer = roomAnimationLayerSel.value === 'foreground' ? 'foreground' : 'background';
      refreshRoomAnimationsCatalogListUI();
      notifyEditorProjectChanged();
    });
  }

  const roomAnimationLoopChk = document.getElementById('room-animation-loop');
  if (roomAnimationLoopChk) {
    roomAnimationLoopChk.addEventListener('change', () => {
      const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
      if (!anim) return;
      anim.loop = !!roomAnimationLoopChk.checked;
      notifyEditorProjectChanged();
    });
  }

  window.startRoomAnimationPreview = function() {
    const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
    if (!anim || !anim.frames || !anim.frames.length) {
      showNotification('No frames loaded for this animation', 'warning');
      return;
    }
    stopRoomAnimationPreview();
    roomAnimationPreviewIndex = 0;
    const fps = Number(anim.fps) || 8;
    const interval = Math.max(1, Math.round(1000 / fps));
    redraw();
    roomAnimationPreviewTimer = setInterval(() => {
      roomAnimationPreviewIndex = (roomAnimationPreviewIndex + 1) % anim.frames.length;
      redraw();
    }, interval);
    showNotification(`Preview started: ${anim.name} (${anim.frames.length} frames @ ${fps} FPS)`, 'info');
  };

  window.stopRoomAnimationPreview = function() {
    if (roomAnimationPreviewTimer) {
      clearInterval(roomAnimationPreviewTimer);
      roomAnimationPreviewTimer = null;
      showNotification('Preview stopped', 'info');
    }
  };

  window.clearRoomAnimationFrames = function() {
    const anim = selectedRoomAnimationId ? getRoomAnimationDef(selectedRoomAnimationId) : null;
    if (!anim) { showNotification('Select an animation first', 'warning'); return; }
    if (!confirm(`Clear all frames for "${anim.name}"?`)) return;
    stopRoomAnimationPreview();
    anim.frames = [];
    roomAnimationPreviewIndex = 0;
    refreshRoomAnimationFramesPreview();
    refreshRoomAnimationsCatalogListUI();
    refreshRoomAnimationPickerUI();
    redraw();
    showNotification('Frames cleared', 'success');
    notifyEditorProjectChanged();
  };

  function selectRoomAnimationInstance(instanceId) {
    // Toggle: click Selected again to deselect
    if (selectedAnimationInstanceId === instanceId) {
      selectedAnimationInstanceId = null;
    } else {
      selectedAnimationInstanceId = instanceId;
      selectedSceneObjectId = null;
      activeHotspotId = null;
      selectedHotspotVertexIndex = -1;
      isDrawingHotspot = false;
    }
    refreshRoomSelectionLists();
    redraw();
  }

  function createRoomAnimationInstanceListItem(inst) {
    const animDef = getRoomAnimationDef(inst.animationId);
    const isSelected = inst.id === selectedAnimationInstanceId;
    const item = document.createElement('div');
    item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
    if (isSelected) item.classList.add('border', 'border-info');
    item.dataset.animationInstanceId = inst.id;
    const info = document.createElement('div');
    const animName = animDef ? animDef.name : inst.animationId;
    info.innerHTML = `<strong>${inst.name || animName}</strong><br><small class="text-muted">Script name: <code>${inst.name || inst.id}</code></small><br><small class="text-muted">${inst.layer || 'background'} layer</small><br><small class="animation-instance-position text-muted">Position: ${Math.round(inst.x || 0)}, ${Math.round(inst.y || 0)}</small>`;
    const visibleWrap = document.createElement('div');
    visibleWrap.className = 'form-check form-check-inline small mt-1';
    const visibleChk = document.createElement('input');
    visibleChk.type = 'checkbox';
    visibleChk.className = 'form-check-input';
    visibleChk.checked = inst.visible !== false;
    visibleChk.addEventListener('change', () => {
      inst.visible = visibleChk.checked;
      const r = rooms.get(currentRoomId);
      if (r) r.animationInstances = animationInstances;
      redraw();
    });
    const visibleLbl = document.createElement('label');
    visibleLbl.className = 'form-check-label text-light';
    visibleLbl.textContent = 'Visible';
    visibleWrap.appendChild(visibleChk);
    visibleWrap.appendChild(visibleLbl);
    info.appendChild(visibleWrap);
    const controls = document.createElement('div');
    const selectBtn = document.createElement('button');
    selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
    selectBtn.title = isSelected ? 'Click to deselect' : 'Select to drag (locks scene objects)';
    selectBtn.textContent = isSelected ? 'Selected' : 'Select';
    selectBtn.addEventListener('click', () => selectRoomAnimationInstance(inst.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-outline-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => window.removeRoomAnimationInstance(inst.id));
    controls.appendChild(selectBtn);
    controls.appendChild(delBtn);
    item.appendChild(info);
    item.appendChild(controls);
    return item;
  }

  function refreshRoomAnimationInstancesListUI() {
    const list = document.getElementById('room-animations-list');
    if (!list) return;
    list.innerHTML = '';
    animationInstances.forEach((inst) => {
      if (!inst.id) inst.id = uid('ainst');
      list.appendChild(createRoomAnimationInstanceListItem(inst));
    });
  }

  window.addRoomAnimationInstance = function() {
    const picker = document.getElementById('room-animation-picker');
    const animationId = picker ? picker.value : '';
    if (!animationId) {
      showNotification('Select an animation with frames first', 'warning');
      return;
    }
    const animDef = getRoomAnimationDef(animationId);
    if (!animDef || !animDef.frames || !animDef.frames.length) {
      showNotification('Selected animation has no frames', 'warning');
      return;
    }
    const instance = {
      id: uid('ainst'),
      animationId,
      name: `${animDef.name}_${Date.now()}`,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      layer: animDef.layer === 'foreground' ? 'foreground' : 'background',
      visible: true,
      autoPlay: false
    };
    animationInstances.push(instance);
    const r = rooms.get(currentRoomId);
    if (r) r.animationInstances = animationInstances;
    selectedAnimationInstanceId = instance.id;
    selectedSceneObjectId = null;
    activeHotspotId = null;
    refreshRoomSelectionLists();
    redraw();
    showNotification(`Animation "${animDef.name}" placed in room`, 'success');
    notifyEditorProjectChanged();
  };

  window.removeRoomAnimationInstance = function(instanceId) {
    if (!confirm('Delete this animation placement from the room?')) return;
    animationInstances = animationInstances.filter(inst => inst.id !== instanceId);
    const r = rooms.get(currentRoomId);
    if (r) r.animationInstances = animationInstances;
    selectedAnimationInstanceId = null;
    refreshRoomAnimationInstancesListUI();
    redraw();
    showNotification('Animation placement removed', 'info');
    notifyEditorProjectChanged();
  };

  function serializeRoomAnimationsCatalog() {
    const result = [];
    roomAnimationsCatalog.forEach((anim) => {
      result.push({
        id: anim.id,
        name: anim.name,
        fps: Number(anim.fps) || 8,
        loop: anim.loop !== false,
        layer: anim.layer === 'foreground' ? 'foreground' : 'background',
        frames: Array.isArray(anim.frames) ? anim.frames.map(fr => {
          if (fr && fr.img) return serializeImage(fr.img);
          return null;
        }).filter(Boolean) : []
      });
    });
    return result;
  }

  async function loadRoomAnimationsCatalogFromData(animationsData, projectId) {
    roomAnimationsCatalog.clear();
    if (!Array.isArray(animationsData)) return;
    for (const src of animationsData) {
      if (!src || !src.id) continue;
      const frames = [];
      if (Array.isArray(src.frames)) {
        for (let i = 0; i < src.frames.length; i++) {
          const frameRef = src.frames[i];
          if (!frameRef) continue;
          const img = await createImageFromDataUrl(frameRef, projectId);
          if (img) {
            frames.push({ img, name: `frame_${i + 1}`, orderIndex: i });
            if (typeof frameRef === 'string' && frameRef.startsWith('asset:')) {
              imageAssetMap.set(img, { assetId: frameRef.replace('asset:', ''), type: 'animation', projectId });
            }
          }
        }
      }
      roomAnimationsCatalog.set(src.id, {
        id: src.id,
        name: src.name || src.id,
        fps: Number(src.fps) || 8,
        loop: src.loop !== false,
        layer: src.layer === 'foreground' ? 'foreground' : 'background',
        frames
      });
    }
    selectedRoomAnimationId = roomAnimationsCatalog.keys().next().value || null;
    refreshRoomAnimationsCatalogListUI();
    refreshRoomAnimationPickerUI();
    onRoomAnimationSelect();
  }

  // Character Pivot Management - Automatic initialization
  function initializePivotForCharacter(charData, direction) {
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (!charData || !activeDirections || !activeDirections[direction]) {
      return;
    }
    
    // If pivot already exists, don't override it
    if (charData.pivotX !== undefined && charData.pivotY !== undefined) {
      return;
    }
    
    const dirData = activeDirections[direction];
    if (dirData && dirData.frames && dirData.frames.length > 0) {
      const frameResult = getFrameImage(dirData.frames[0], activeDirections, 0, direction);
      if (frameResult && frameResult.img) {
        const frameImg = frameResult.img;
        // Set pivot at center bottom of frame
        charData.pivotX = Math.round(frameImg.width / 2);
        charData.pivotY = Math.round(frameImg.height);
        
        // Get character name from selector to save properly
        const sel = document.getElementById('character-selector');
        const who = sel ? sel.value : '';
        if (who) {
          characterFrames.set(who, charData);
        }
      }
    }
  }

  // Function to handle direction change
  window.changeCharacterDirection = function() {
    const dirSel = document.getElementById('direction-selector');
    if (dirSel) {
      currentDirection = dirSel.value;
      characterPreviewIndex = 0; // Reset animation index
      
      // Initialize pivot if needed
      const sel = document.getElementById('character-selector');
      const who = sel ? sel.value : '';
      if (who) {
        const charData = characterFrames.get(who);
        if (charData) {
          initializePivotForCharacter(charData, currentDirection);
        }
      }
      
      updateDirectionInfo(); // Update frame count info
      redraw(); // Update canvas preview
      
      // Reset il selector della direzione mirror quando si cambia direzione
      const mirrorSel = document.getElementById('mirror-direction-selector');
      if (mirrorSel) {
        mirrorSel.value = '';
      }
    }
  };

  // Function to toggle between upload and mirror frame source
  window.toggleFrameSource = function() {
    const uploadRadio = document.getElementById('frame-source-upload');
    const mirrorRadio = document.getElementById('frame-source-mirror');
    const uploadContainer = document.getElementById('frame-upload-container');
    const mirrorContainer = document.getElementById('frame-mirror-container');
    const framesPreview = document.getElementById('frames-preview');
    const framesPreviewContainer = framesPreview ? framesPreview.closest('.mb-3') : null;
    
    if (uploadRadio && uploadRadio.checked) {
      // Mostra upload, nascondi mirror
      if (uploadContainer) uploadContainer.style.display = 'block';
      if (mirrorContainer) mirrorContainer.style.display = 'none';
      if (framesPreviewContainer) framesPreviewContainer.style.display = 'block';
    } else if (mirrorRadio && mirrorRadio.checked) {
      // Mostra mirror, nascondi upload
      if (uploadContainer) uploadContainer.style.display = 'none';
      if (mirrorContainer) mirrorContainer.style.display = 'block';
      if (framesPreviewContainer) framesPreviewContainer.style.display = 'none';
    }
  };

  // Helper function per ottenere l'immagine di un frame e se deve essere specchiata
  // Gestisce sia frame normali che frame specchiati (con proprietÃ  mirror)
  function getFrameImage(frame, directionsStore, frameIndex, direction) {
    if (!frame || !directionsStore) {
      return { img: null, mirrored: false };
    }

    // Se il frame Ã¨ un riferimento specchiato
    if (frame.mirror && typeof frame.mirror === 'string') {
      const sourceDirection = frame.mirror;
      const sourceDirData = directionsStore[sourceDirection];
      
      if (sourceDirData && sourceDirData.frames && sourceDirData.frames[frameIndex]) {
        // Recursivamente ottieni l'immagine dalla direzione sorgente
        // (potrebbe essere un'altra direzione specchiata, ma alla fine arriveremo a un frame reale)
        const sourceResult = getFrameImage(sourceDirData.frames[frameIndex], directionsStore, frameIndex, sourceDirection);
        
        // Se abbiamo trovato un'immagine, restituiscila con flag mirrored = true
        if (sourceResult.img) {
          return { img: sourceResult.img, mirrored: true };
        }
      }
      
      // Se non troviamo la direzione sorgente, restituisci null
      return { img: null, mirrored: false };
    }
    
    // Frame normale: estrai l'immagine (gestisce entrambi i formati)
    let frameImg = null;
    if (frame.img && typeof frame.img === 'object') {
      // Formato nuovo: oggetto con proprietÃ  img
      frameImg = frame.img;
    } else if (frame.src || (frame.width && frame.height)) {
      // Formato salvato: oggetto Image direttamente
      frameImg = frame;
    }
    
    return { img: frameImg, mirrored: false };
  }

  // Function to mirror frames horizontally from another direction
  // Ora salva solo un riferimento invece di creare frame specchiati separati
  window.applyMirrorDirection = async function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { 
      showNotification('Select a character first', 'warning'); 
      return; 
    }

    const mirrorSel = document.getElementById('mirror-direction-selector');
    const sourceDirection = mirrorSel ? mirrorSel.value : '';
    if (!sourceDirection) {
      return; // Nessuna direzione selezionata, non fare nulla
    }

    const charData = characterFrames.get(who);
    if (!charData) {
      showNotification('Character not found', 'warning');
      return;
    }

    const activeDirections = getCharacterDirectionsStore(charData);

    // Verifica che la direzione sorgente abbia frame
    if (!activeDirections[sourceDirection] || !activeDirections[sourceDirection].frames.length) {
      showNotification(`No frames found in ${sourceDirection} direction`, 'warning');
      return;
    }

    const sourceFrames = activeDirections[sourceDirection].frames;
    const sourceFPS = activeDirections[sourceDirection].fps || 8;

    // Inizializza la direzione corrente se non esiste
    if (!activeDirections[currentDirection]) {
      activeDirections[currentDirection] = { frames: [], fps: sourceFPS };
    }

    // Pulisce i frame esistenti per la direzione corrente
    activeDirections[currentDirection].frames = [];
    activeDirections[currentDirection].fps = sourceFPS;

    // Crea riferimenti specchiati invece di copiare le immagini
    for (let i = 0; i < sourceFrames.length; i++) {
      activeDirections[currentDirection].frames.push({ mirror: sourceDirection });
    }

    characterFrames.set(who, charData);

    const fpsInput = document.getElementById('character-fps');
    if (fpsInput) fpsInput.value = sourceFPS;

    updateDirectionInfo();
    redraw();

    showNotification(`Mirrored ${activeDirections[currentDirection].frames.length} frame(s) from ${sourceDirection} to ${currentDirection} (referenced, not duplicated)`, 'success');
  };

  // Function to update direction info display
  function updateDirectionInfo() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) return;

    const charData = characterFrames.get(who);
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (charData && activeDirections && activeDirections[currentDirection]) {
      const frameCount = activeDirections[currentDirection].frames.length;
      const fps = activeDirections[currentDirection].fps;
      
      // Update direction selector with frame count
      const dirSel = document.getElementById('direction-selector');
      const option = dirSel.querySelector(`option[value="${currentDirection}"]`);
      if (option) {
        const baseText = option.textContent.split(' (')[0]; // Remove existing frame count
        option.textContent = `${baseText} (${frameCount} frames @ ${fps}fps)`;
      }

      // Update FPS input field
      const fpsInput = document.getElementById('character-fps');
      if (fpsInput) {
        fpsInput.value = fps;
      }
    } else {
      // Reset FPS input if no frames loaded for this direction
      const fpsInput = document.getElementById('character-fps');
      if (fpsInput) {
        fpsInput.value = 8;
      }
    }
    
    // Update frames preview
    refreshFramesPreview();
  }

  // Function to update character FPS
  window.updateCharacterFPS = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }

    const fpsInput = document.getElementById('character-fps');
    const newFPS = parseInt(fpsInput.value);
    if (isNaN(newFPS) || newFPS < 1 || newFPS > 60) {
      showNotification('FPS must be between 1 and 60', 'warning');
      return;
    }

    let charData = characterFrames.get(who);
    if (!charData) {
      charData = createEmptyCharacterData(who);
      characterFrames.set(who, charData);
    }

    const activeDirections = getCharacterDirectionsStore(charData);
    if (!activeDirections[currentDirection]) {
      activeDirections[currentDirection] = { frames: [], fps: 8 };
    }

    activeDirections[currentDirection].fps = newFPS;
    updateDirectionInfo();
    showNotification(`FPS updated to ${newFPS} for ${who} (${currentDirection})`, 'success');
  };

  // Function to refresh frames preview
  function refreshFramesPreview() {
    const container = document.getElementById('frames-preview');
    if (!container) return;
    
    // Verifica se il toggle Ã¨ su "mirror" - in quel caso non mostrare i thumbnails
    const mirrorRadio = document.getElementById('frame-source-mirror');
    if (mirrorRadio && mirrorRadio.checked) {
      container.innerHTML = '<div class="text-muted">Thumbnails hidden when using mirror mode</div>';
      return;
    }
    
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      container.innerHTML = '<div class="text-muted">Select a character to view frames</div>';
      return;
    }

    const charData = characterFrames.get(who);
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (!charData || !activeDirections || !activeDirections[currentDirection]) {
      container.innerHTML = '<div class="text-muted">No frames loaded for this direction</div>';
      return;
    }

    const frames = activeDirections[currentDirection].frames;
    if (frames.length === 0) {
      container.innerHTML = '<div class="text-muted">No frames loaded</div>';
      return;
    }

    container.innerHTML = '';
    frames.forEach((frameData, index) => {
      const frameItem = document.createElement('div');
      frameItem.className = 'frame-item';
      frameItem.draggable = true;
      frameItem.dataset.frameIndex = index;
      
      const img = document.createElement('img');
      img.draggable = false;
      let frameName = `Frame ${index + 1}`; // Nome di default
      let isMirrored = false;
      
      // Usa getFrameImage per gestire sia frame normali che specchiati
      const frameResult = getFrameImage(frameData, activeDirections, index, currentDirection);
      
      if (frameResult.img) {
        // Frame valido trovato
        img.src = frameResult.img.src || frameResult.img;
        isMirrored = frameResult.mirrored;
        
        // Se Ã¨ specchiato, aggiungi un indicatore nel nome
        if (isMirrored) {
          frameName = `Frame ${index + 1} (mirrored from ${frameData.mirror})`;
        }
      } else if (frameData && typeof frameData === 'object' && frameData.mirror) {
        // Frame specchiato ma non riuscito a risolvere l'immagine
        frameName = `Frame ${index + 1} (mirrored from ${frameData.mirror} - source not found)`;
        // Usa un'immagine placeholder o salta questo frame
        console.warn(`Frame ${index + 1} Ã¨ specchiato ma la direzione sorgente non Ã¨ stata trovata`);
        return; // Salta questo frame se non possiamo risolverlo
      } else {
        // Gestisce frame normali (compatibilitÃ  con codice precedente)
        if (frameData && typeof frameData === 'object' && frameData.img) {
          // Formato nuovo: oggetto con proprietÃ  img
          img.src = frameData.img.src || frameData.img;
          if (frameData.name) {
            frameName = frameData.name;
          }
        } else if (frameData && typeof frameData === 'object' && frameData.src) {
          // Formato salvato: oggetto Image direttamente
          img.src = frameData.src;
          if (frameData.name) {
            frameName = frameData.name;
          } else if (frameData.src && typeof frameData.src === 'string') {
            const urlParts = frameData.src.split('/');
            const fileName = urlParts[urlParts.length - 1];
            if (fileName && fileName !== frameData.src) {
              frameName = fileName.split('?')[0];
            }
          }
        } else if (typeof frameData === 'string') {
          // Formato stringa URL
          img.src = frameData;
          const urlParts = frameData.split('/');
          const fileName = urlParts[urlParts.length - 1];
          if (fileName && fileName !== frameData) {
            frameName = fileName.split('?')[0];
          }
        } else {
          console.warn(`Frame ${index + 1} ha formato non riconosciuto:`, frameData);
          return; // Salta questo frame se non Ã¨ valido
        }
      }
      
      img.alt = frameName;
      
      // Se Ã¨ specchiato, applica CSS transform per mostrarlo specchiato nella preview
      if (isMirrored) {
        img.style.transform = 'scaleX(-1)';
      }
      
      const frameNumber = document.createElement('div');
      frameNumber.className = 'frame-number';
      frameNumber.textContent = index + 1;
      
      // Aggiunge il nome del file sotto il numero del frame
      const frameFileName = document.createElement('div');
      frameFileName.className = 'frame-filename';
      frameFileName.style.cssText = 'font-size: 9px; color: #888; margin-top: 3px; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; line-height: 1.2;';
      frameFileName.textContent = frameName;
      frameFileName.title = frameName; // Tooltip con nome completo
      
      const frameControls = document.createElement('div');
      frameControls.className = 'frame-controls';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'frame-delete';
      deleteBtn.innerHTML = 'Ã—';
      deleteBtn.title = 'Delete frame';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteFrame(index);
      };
      
      frameControls.appendChild(deleteBtn);
      frameItem.appendChild(img);
      frameItem.appendChild(frameNumber);
      frameItem.appendChild(frameFileName);
      frameItem.appendChild(frameControls);
      container.appendChild(frameItem);
    });

    // Initialize drag and drop
    initializeFrameDragDrop();
    refreshCharactersListUI();
  }

  // Function to delete a frame
  async function deleteFrame(frameIndex) {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) return;

    const charData = characterFrames.get(who);
    const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
    if (!charData || !activeDirections || !activeDirections[currentDirection]) return;

    if (confirm(`Delete frame ${frameIndex + 1}?`)) {
      const frameToDelete = activeDirections[currentDirection].frames[frameIndex];
      
      // Se Ã¨ un frame specchiato, non eliminare asset (non ne ha uno)
      if (frameToDelete && typeof frameToDelete === 'object' && frameToDelete.mirror) {
        activeDirections[currentDirection].frames.splice(frameIndex, 1);
        characterFrames.set(who, charData);
        updateDirectionInfo();
        refreshFramesPreview();
        redraw();
        showNotification(`Mirrored frame removed`, 'success');
        return;
      }
      
      activeDirections[currentDirection].frames.splice(frameIndex, 1);
      
      // Aggiorna i thumbnails e il canvas dopo l'eliminazione
      updateDirectionInfo();
      refreshFramesPreview();
      redraw();
      
      showNotification(`Frame ${frameIndex + 1} deleted`, 'info');
    }
  }

  // Function to initialize drag and drop for frames
  function initializeFrameDragDrop() {
    const container = document.getElementById('frames-preview');
    if (!container) return;

    let draggedElement = null;
    let draggedIndex = null;

    // Add event listeners to all frame items
    const frameItems = container.querySelectorAll('.frame-item');
    frameItems.forEach((item, index) => {
      item.addEventListener('dragstart', (e) => {
        draggedElement = item;
        draggedIndex = parseInt(item.dataset.frameIndex);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(draggedIndex)); } catch (_) {}
      });

      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        draggedElement = null;
        draggedIndex = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetIndex = parseInt(item.dataset.frameIndex);
        
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
          // Reorder frames in the character data
          const sel = document.getElementById('character-selector');
          const who = sel ? sel.value : '';
          if (who) {
            const charData = characterFrames.get(who);
            const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;
            if (charData && activeDirections && activeDirections[currentDirection]) {
              const frames = activeDirections[currentDirection].frames;
              const fromIndex = draggedIndex;
              const draggedFrame = frames.splice(fromIndex, 1)[0];
              frames.splice(targetIndex, 0, draggedFrame);
              
              // Refresh the preview
              refreshFramesPreview();
              redraw();
              showNotification(`Frame moved from position ${fromIndex + 1} to ${targetIndex + 1}`, 'success');
            }
          }
        }
      });
    });
  }

  // JS sandbox runtime (iframe sandboxed) e editor
  let codeMirrorEditor = null;
  let largeCodeMirrorEditor = null;
  let currentScriptName = 'Global:main';
  const jsScripts = new Map(); // name -> content
  const objectScripts = new Map(); // sceneObjectId -> scriptName
  const roomScripts = new Map(); // roomId -> scriptName
  const characterScripts = new Map(); // characterName -> scriptName
  const inventoryScripts = new Map(); // inventory item name -> scriptName
  const hotspotScripts = new Map(); // hotspotId -> scriptName

  /** Chiave canonica script da scope + target (dropdown / albero). */
  function normalizeScriptKey(scope, target) {
    const s = String(scope || '');
    let t = String(target == null ? '' : target).trim();
    if (s === 'Global') return 'Global:main';
    if (s === 'Hotspot') {
      if (t.startsWith('hotspot:')) t = t.slice('hotspot:'.length);
      return `Hotspot:${t}`;
    }
    return `${s}:${t}`;
  }

  /** Risolve la chiave effettiva (attachment custom o chiave standard). */
  function resolveScriptKey(scope, target) {
    const defaultKey = normalizeScriptKey(scope, target);
    if (scope === 'Room' && roomScripts.has(target)) return roomScripts.get(target);
    if (scope === 'Object' && objectScripts.has(target)) return objectScripts.get(target);
    if (scope === 'Character' && characterScripts.has(target)) return characterScripts.get(target);
    if (scope === 'Inventory') {
      const item = inventoryItems.find(i => i.name === target);
      const userKey = item && String(item.scriptName || '').trim();
      if (userKey) return migrateLegacyScriptKey(userKey);
      if (inventoryScripts.has(target)) return inventoryScripts.get(target);
    }
    if (scope === 'GUI' && typeof guiScripts !== 'undefined' && guiScripts.has && guiScripts.has(target)) {
      return guiScripts.get(target);
    }
    return defaultKey;
  }

  /** Migra chiavi hotspot legacy (Hotspot:hotspot:id â†’ Hotspot:id). */
  function migrateLegacyScriptKey(key) {
    const k = String(key || '');
    const m = k.match(/^Hotspot:hotspot:(.+)$/);
    if (!m) return k;
    const canonical = `Hotspot:${m[1]}`;
    const legacyContent = jsScripts.get(k);
    const legacyLs = (() => { try { return localStorage.getItem(`script-${k}`); } catch (_) { return null; } })();
    const content = legacyContent !== undefined ? legacyContent : legacyLs;
    if (content !== null && content !== undefined) {
      if (!jsScripts.has(canonical)) jsScripts.set(canonical, content);
      try { localStorage.setItem(`script-${canonical}`, content); } catch (_) {}
      jsScripts.delete(k);
      try { localStorage.removeItem(`script-${k}`); } catch (_) {}
    }
    return canonical;
  }

  function getScriptContent(scriptKey) {
    const key = migrateLegacyScriptKey(String(scriptKey || ''));
    if (!key) return '';
    return jsScripts.get(key) || (() => { try { return localStorage.getItem(`script-${key}`); } catch (_) { return ''; } })() || '';
  }

  /** Chiave canonica 1:1 per la tab Scripts (Scope:target). */
  function getEditorScriptKey(scope, target) {
    return migrateLegacyScriptKey(normalizeScriptKey(scope, target));
  }

  /** Nome script da mostrare in liste UI (sempre visibile, mai "(no script)"). */
  function getDisplayScriptLabel(scope, target, itemOrName) {
    if (scope === 'Inventory') {
      const name = typeof itemOrName === 'string' ? itemOrName : (itemOrName && itemOrName.name);
      if (!name) return '';
      const item = typeof itemOrName === 'object' && itemOrName
        ? itemOrName
        : inventoryItems.find(i => i.name === name);
      const userKey = item && String(item.scriptName || '').trim();
      if (userKey) return migrateLegacyScriptKey(userKey);
      if (inventoryScripts.has(name)) return migrateLegacyScriptKey(inventoryScripts.get(name));
      return getEditorScriptKey('Inventory', name);
    }
    return migrateLegacyScriptKey(resolveScriptKey(scope, target));
  }

  function editorScriptExists(scriptKey) {
    const key = migrateLegacyScriptKey(String(scriptKey || ''));
    if (!key) return false;
    if (jsScripts.has(key)) return true;
    try {
      return localStorage.getItem(`script-${key}`) != null;
    } catch (_) {
      return false;
    }
  }

  function parseScriptKeyScopeTarget(scriptName) {
    const key = migrateLegacyScriptKey(String(scriptName || ''));
    const sep = key.indexOf(':');
    if (sep <= 0) return null;
    return { scope: key.slice(0, sep), target: key.slice(sep + 1) };
  }

  function clearEditorScriptAttachment(scope, target) {
    if (scope === 'Room') {
      roomScripts.delete(target);
      return;
    }
    if (scope === 'Object') {
      objectScripts.delete(target);
      return;
    }
    if (scope === 'Character') {
      characterScripts.delete(target);
      return;
    }
    if (scope === 'Inventory') {
      inventoryScripts.delete(target);
      const item = inventoryItems.find(i => i.name === target);
      if (item) {
        const canonical = getEditorScriptKey('Inventory', target);
        const userKey = migrateLegacyScriptKey(String(item.scriptName || '').trim());
        if (!userKey || userKey === canonical) {
          item.scriptName = '';
        }
      }
      refreshInventoryItemsListUI();
      return;
    }
    if (scope === 'GUI' && typeof guiScripts !== 'undefined' && guiScripts.delete) {
      guiScripts.delete(target);
    }
  }

  function syncEditorScriptAttachment(scope, target, canonicalKey) {
    const key = migrateLegacyScriptKey(String(canonicalKey || ''));
    if (!key) return;
    if (scope === 'Room') roomScripts.set(target, key);
    else if (scope === 'Object') objectScripts.set(target, key);
    else if (scope === 'Character') characterScripts.set(target, key);
    else if (scope === 'Inventory') attachInventoryItemScript(target, key);
    else if (scope === 'GUI' && typeof guiScripts !== 'undefined' && guiScripts.set) guiScripts.set(target, key);
  }

  function hasEditorScriptLink(scope, target) {
    if (scope === 'Room') return roomScripts.has(target);
    if (scope === 'Object') return objectScripts.has(target);
    if (scope === 'Character') return characterScripts.has(target);
    if (scope === 'Inventory') return inventoryScripts.has(target);
    if (scope === 'GUI') return typeof guiScripts !== 'undefined' && guiScripts.has && guiScripts.has(target);
    if (scope === 'Hotspot') {
      const hotspotId = String(target || '').replace(/^hotspot:/, '');
      const key = getEditorScriptKey('Hotspot', hotspotId);
      if (jsScripts.has(key)) return true;
      let linked = false;
      let embedded = false;
      rooms.forEach((room) => {
        if (!room.hotspots) return;
        const hs = room.hotspots.find(h => h.id === hotspotId);
        if (!hs) return;
        if (hs._meta && hs._meta.linkedScriptName) linked = true;
        if (hs.scripts && hs.scripts.onClick && String(hs.scripts.onClick.code || '').trim()) embedded = true;
      });
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        const hs = hotspots.find(h => h.id === hotspotId);
        if (hs) {
          if (hs._meta && hs._meta.linkedScriptName) linked = true;
          if (hs.scripts && hs.scripts.onClick && String(hs.scripts.onClick.code || '').trim()) embedded = true;
        }
      }
      return linked || embedded;
    }
    if (scope === 'Global') {
      const key = getEditorScriptKey('Global', 'main');
      return jsScripts.has(key);
    }
    return false;
  }

  function loadEditorScriptContent(scope, target) {
    const canonicalKey = getEditorScriptKey(scope, target);
    let content = getScriptContent(canonicalKey);

    if (!String(content || '').trim()) {
      const legacyKey = migrateLegacyScriptKey(resolveScriptKey(scope, target));
      if (legacyKey && legacyKey !== canonicalKey) {
        const legacyContent = getScriptContent(legacyKey);
        if (String(legacyContent || '').trim()) {
          content = legacyContent;
          jsScripts.set(canonicalKey, content);
          try { localStorage.setItem(`script-${canonicalKey}`, content); } catch (_) {}
          syncEditorScriptAttachment(scope, target, canonicalKey);
        }
      }
    }

    if (scope === 'Hotspot' && !String(content || '').trim()) {
      const hotspotId = String(target || '').replace(/^hotspot:/, '');
      let embedded = '';
      rooms.forEach((room) => {
        if (embedded) return;
        if (!room.hotspots) return;
        const hs = room.hotspots.find(h => h.id === hotspotId);
        if (hs && hs.scripts && hs.scripts.onClick && hs.scripts.onClick.code) {
          embedded = String(hs.scripts.onClick.code);
        }
      });
      if (!embedded && typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        const hs = hotspots.find(h => h.id === hotspotId);
        if (hs && hs.scripts && hs.scripts.onClick && hs.scripts.onClick.code) {
          embedded = String(hs.scripts.onClick.code);
        }
      }
      if (embedded.trim()) {
        content = embedded;
        jsScripts.set(canonicalKey, content);
        try { localStorage.setItem(`script-${canonicalKey}`, content); } catch (_) {}
      }
    }

    return { key: canonicalKey, content: String(content || '') };
  }

  function shouldShowEditorScript(scope, target, content, seenKeys) {
    const key = getEditorScriptKey(scope, target);
    if (seenKeys.has(key)) return false;
    const hasContent = String(content || '').trim().length > 0;
    if (!hasContent) {
      if (hasEditorScriptLink(scope, target)) {
        clearEditorScriptAttachment(scope, target);
      }
      return false;
    }
    seenKeys.add(key);
    return true;
  }

  // Event conditions storage
  const objectEventConditions = new Map(); // sceneObjectId -> { onClick: [conditions], onUse: [conditions], ... }
  const hotspotEventConditions = new Map(); // hotspotId -> { onClick: [conditions], onUse: [conditions], ... }
  const characterEventConditions = new Map(); // characterName -> { onClick: [conditions], onUse: [conditions], ... }
  const guiButtonEventConditions = new Map(); // buttonId -> { onClick: [conditions], ... }
  const inventoryEventConditions = new Map(); // itemName -> { onClick: [conditions], onUse: [conditions], ... }

  // Inventario gameplay: solo in runtime (gameState.inventory via iframe Play Test)

  // Initialize CodeMirror when scripts tab is opened the first time
  function ensureScriptEditor() {
    if (codeMirrorEditor) return;
    const ta = document.getElementById('script-editor');
    if (!ta || typeof CodeMirror === 'undefined') return;
    codeMirrorEditor = CodeMirror.fromTextArea(ta, {
      mode: 'javascript',
      theme: 'dracula',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      extraKeys: { 'Ctrl-Space': 'autocomplete' },
      hintOptions: { hint: cmGameApiHint, completeSingle: false }
    });
    attachAutoHint(codeMirrorEditor, 'small');
  }

  // Editor grande nel pannello principale (area canvas)
  function ensureLargeScriptEditor() {
    if (largeCodeMirrorEditor) return;
    const ta = document.getElementById('script-editor-large');
    if (!ta || typeof CodeMirror === 'undefined') return;
    largeCodeMirrorEditor = CodeMirror.fromTextArea(ta, {
      mode: 'javascript',
      theme: 'dracula',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      extraKeys: { 'Ctrl-Space': 'autocomplete' },
      hintOptions: { hint: cmGameApiHint, completeSingle: false }
    });
    attachAutoHint(largeCodeMirrorEditor, 'large');
  }

  // CodeMirror autocomplete â€” keep in sync with JS/runtime.js:
  // getScriptApiBindings() + SUPPORTED_SCRIPT_HANDLERS (on_*)
  const GAME_API_COMPLETIONS = [
    'Game', 'GameAPI',
    'Game.getVar', 'Game.setVar', 'Game.hasVar', 'Game.toggleVar',
    'GameAPI.print', 'GameAPI.error', 'GameAPI.getVariable', 'GameAPI.setVariable',
    'on_game_start', 'on_before_room_change', 'on_room_change', 'on_object_click', 'on_character_click',
    'on_hotspot_click', 'on_gui_click', 'on_use_with', 'on_inventory_use_with', 'on_dialogue_action',
    'print', 'log', 'wait', 'show_message', 'showText',
    'show_dialogue', 'show_dialogue_text', 'end_dialogue', 'start_dialogue',
    'save_game', 'load_game', 'delete_save', 'get_save_info',
    'play_music', 'play_sound', 'stop_music', 'stop_sound',
    'play_animation', 'stop_animation', 'show_animation', 'hide_animation',
    'show_image', 'hide_image',
    'getVariable', 'setVariable', 'get_var', 'set_var', 'has_var', 'toggle_var',
    'load_room', 'get_current_room', 'getCurrentRoom', 'get_room_objects', 'set_room_background',
    'move_object', 'spawn_object', 'despawn_object', 'rotate_object', 'scale_object', 'set_object_visible',
    'enableObject', 'disableObject', 'enableHotspot', 'disableHotspot',
    'add_to_inventory', 'remove_from_inventory', 'has_item', 'get_item_count', 'clear_inventory',
    'get_carried_item', 'set_carried_item', 'clear_carried_item',
    'spawn_character', 'move_character', 'walk_character', 'set_character_direction',
    'animate_character', 'play_character_animation'
  ];

  const GAME_DOT_METHODS = ['getVar', 'setVar', 'hasVar', 'toggleVar'];
  const GAMEAPI_DOT_METHODS = ['print', 'error', 'getVariable', 'setVariable'];

  function cmGameApiHint(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const start = token.start;
    const end = cursor.ch;
    const line = cm.getLine(cursor.line);
    const before = line.slice(0, start);
    const currentWord = token.string || '';

    const dotMatch = before.match(/(Game|GameAPI)\.(\w*)$/);
    if (dotMatch) {
      const ns = dotMatch[1];
      const partial = dotMatch[2] || '';
      const methods = ns === 'Game' ? GAME_DOT_METHODS : GAMEAPI_DOT_METHODS;
      const fromCh = start - partial.length;
      let list = methods
        .filter(m => m.toLowerCase().startsWith(partial.toLowerCase()))
        .map(m => ns + '.' + m);
      if (!list.length) list = methods.map(m => ns + '.' + m);
      return {
        list,
        from: CodeMirror.Pos(cursor.line, fromCh),
        to: CodeMirror.Pos(cursor.line, end)
      };
    }

    const list = GAME_API_COMPLETIONS.filter(name =>
      name.toLowerCase().startsWith(currentWord.toLowerCase())
    );
    return {
      list: list.length ? list : GAME_API_COMPLETIONS,
      from: CodeMirror.Pos(cursor.line, start),
      to: CodeMirror.Pos(cursor.line, end)
    };
  }

  // Attach auto-hint on typing for CodeMirror editors (WeakSet → più istanze, es. dialoghi Visual)
  const autoHintAttachedEditors = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  let autoHintAttachedToSmall = false;
  let autoHintAttachedToLarge = false;
  function attachAutoHint(cm, which = 'small') {
    if (!cm || typeof cm.on !== 'function') return;
    if (autoHintAttachedEditors) {
      if (autoHintAttachedEditors.has(cm)) return;
      autoHintAttachedEditors.add(cm);
    } else if (which === 'large') {
      if (autoHintAttachedToLarge) return;
      autoHintAttachedToLarge = true;
    } else if (which === 'small') {
      if (autoHintAttachedToSmall) return;
      autoHintAttachedToSmall = true;
    }
    cm.on('inputRead', function(editor, change) {
      if (!change) return;
      // Ignore programmatic changes and bulk edits
      if (change.origin === 'setValue' || change.origin === 'paste' || change.origin === 'undo' || change.origin === 'redo') return;
      // If a completion is already active, don't re-trigger
      if (editor.state && editor.state.completionActive) return;
      const inserted = Array.isArray(change.text) ? change.text.join('\n') : String(change.text || '');
      if (!inserted) return;
      // Trigger only for word characters to avoid noise
      if (!/^[A-Za-z0-9_]$/.test(inserted)) return;
      if (typeof editor.showHint === 'function') {
        editor.showHint({ hint: cmGameApiHint, completeSingle: false });
      }
    });
  }

  /**
   * Monta CodeMirror + hint API su un <textarea> (usato dall'editor dialoghi Visual per run_script).
   * @returns {object|null} istanza CodeMirror
   */
  window.amiantoMountScriptCodeMirror = function(textarea, options = {}) {
    if (!textarea || typeof CodeMirror === 'undefined') return null;
    if (textarea._amiantoCm) return textarea._amiantoCm;
    const height = options.height != null ? options.height : 180;
    const cm = CodeMirror.fromTextArea(textarea, {
      mode: 'javascript',
      theme: 'dracula',
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      hintOptions: { hint: cmGameApiHint, completeSingle: false }
    });
    cm.setSize('100%', height);
    attachAutoHint(cm, 'dialogue');
    textarea._amiantoCm = cm;
    return cm;
  };

  // Events per scope: id = handler name in runtime, label = human-readable
  const SCRIPT_EVENTS = {
    Global: [
      { id: 'on_game_start', label: 'onGameStart' },
      { id: 'on_before_room_change', label: 'Before room load' },
      { id: 'on_room_change', label: 'After room load' },
      { id: 'on_inventory_use_with', label: 'onInventoryUseWith' }
    ],
    Room: [
      { id: 'on_before_room_change', label: 'Before room load' },
      { id: 'on_room_change', label: 'After room load' }
    ],
    Object: [{ id: 'on_object_click', label: 'onClick' }],
    Character: [{ id: 'on_character_click', label: 'onClick' }],
    Inventory: [{ id: 'on_use_with', label: 'onUseWith' }],
    Hotspot: [{ id: 'on_hotspot_click', label: 'onClick' }]
    // Nessun evento GUI: runtime non ancora collegato
  };

  function populateEventsForScope(scope) {
    const sel = document.getElementById('script-event');
    if (!sel) return;
    sel.innerHTML = '';
    const defs = SCRIPT_EVENTS[scope] || [];
    defs.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.label;
      sel.appendChild(opt);
    });
  }

  function populateTargetsForScope(scope) {
    const sel = document.getElementById('script-target');
    if (!sel) return;
    sel.innerHTML = '';

    if (scope === 'Global') {
      sel.disabled = true;
      const opt = document.createElement('option');
      opt.value = 'main';
      opt.textContent = 'Global (project-wide)';
      sel.appendChild(opt);
      return;
    }

    sel.disabled = false;
    const addPlaceholder = (text) => {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = text;
      sel.appendChild(opt);
    };

    if (scope === 'Room') {
      addPlaceholder('Select room...');
      rooms.forEach((room) => {
        const opt = document.createElement('option');
        opt.value = room.id;
        opt.textContent = room.name || room.id;
        sel.appendChild(opt);
      });
      return;
    }

    if (scope === 'Object') {
      addPlaceholder('Select scene object...');
      (sceneObjects || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name || o.id;
        sel.appendChild(opt);
      });
      return;
    }

    if (scope === 'Character') {
      addPlaceholder('Select character...');
      document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => {
        const name = s.textContent.trim();
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      return;
    }

    if (scope === 'Inventory') {
      addPlaceholder('Select inventory item...');
      (inventoryItems || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        sel.appendChild(opt);
      });
      return;
    }

    if (scope === 'Hotspot') {
      addPlaceholder('Select hotspot...');
      (Array.isArray(hotspots) ? hotspots : []).forEach(hs => {
        const opt = document.createElement('option');
        opt.value = `hotspot:${hs.id}`;
        opt.textContent = hs.name || hs.id;
        sel.appendChild(opt);
      });
      return;
    }

    if (scope === 'GUI') {
      addPlaceholder('Select GUI button...');
      (typeof guiButtons !== 'undefined' ? guiButtons : []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name || b.id;
        sel.appendChild(opt);
      });
      return;
    }
  }

  function initScriptsUI() {
    const scopeSel = document.getElementById('script-scope');
    const targetSel = document.getElementById('script-target');
    const eventSel = document.getElementById('script-event');
    const lock = document.getElementById('lock-script-scope');
    if (!scopeSel || !targetSel || !eventSel) return;

    // Initialize once per tab open
    populateEventsForScope(scopeSel.value || 'Global');
    populateTargetsForScope(scopeSel.value || 'Global');

    scopeSel.addEventListener('change', () => {
      populateEventsForScope(scopeSel.value);
      populateTargetsForScope(scopeSel.value);
      // Quando l'utente cambia lo scope, riabilita i dropdown per permettere la creazione di un nuovo script
      if (!lock || !lock.checked) {
        scopeSel.disabled = false;
        if (scopeSel.value === 'Global') {
          targetSel.disabled = true;
        } else {
          targetSel.disabled = false;
        }
      }
    });

    // Listener sul checkbox per gestire lo stato dei dropdown
    if (lock) {
      lock.addEventListener('change', () => {
        if (!lock.checked) {
          // Quando il lock viene deselezionato, riabilita i dropdown
          scopeSel.disabled = false;
          if (scopeSel.value === 'Global') {
            targetSel.disabled = true;
          } else {
            targetSel.disabled = false;
          }
        }
      });
    }
  }

  function extractHandlersFromScript(content) {
    if (!content) return new Set();
    const handlers = new Set();
    [
      'on_game_start',
      'on_before_room_change',
      'on_room_change',
      'on_object_click',
      'on_character_click',
      'on_hotspot_click',
      'on_gui_click',
      'on_use_with',
      'on_inventory_use_with',
      'on_dialogue_action'
    ].forEach(h => {
      const re = new RegExp(`(?:async\\s+)?function\\s+${h}\\s*\\(`);
      if (re.test(content)) handlers.add(h);
    });
    return handlers;
  }

  function rebuildScriptsTree() {
    const tree = document.getElementById('scripts-tree');
    if (!tree) return;
    Array.from(jsScripts.keys()).forEach(k => migrateLegacyScriptKey(k));
    tree.innerHTML = '';

    const container = document.createElement('div');
    const seenScriptKeys = new Set();

    // Helper per creare un elemento script nella lista
    const createScriptItem = (scriptInfo, onClickHandler) => {
      const li = document.createElement('li');
      li.style.margin = '4px 0';
      li.style.padding = '4px 0';
      
      const label = document.createElement('span');
      label.textContent = scriptInfo.label;
      label.style.cursor = 'pointer';
      label.style.color = scriptInfo.hasContent ? '#eee' : '#888';
      label.style.display = 'inline-block';
      label.style.width = '100%';
      label.onclick = onClickHandler;
      
      // Aggiungi badge con numero di handler se presenti
      if (scriptInfo.handlers && scriptInfo.handlers.length > 0) {
        const badge = document.createElement('span');
        badge.textContent = ` (${scriptInfo.handlers.length})`;
        badge.style.color = '#39ff14';
        badge.style.fontSize = '11px';
        badge.style.marginLeft = '4px';
        label.appendChild(badge);
      }
      
      li.appendChild(label);
      
      // Mostra gli handler come sottolista
      if (scriptInfo.handlers && scriptInfo.handlers.length > 0) {
        const sub = document.createElement('ul');
        sub.style.paddingLeft = '20px';
        sub.style.marginTop = '2px';
        sub.style.listStyleType = 'disc';
        scriptInfo.handlers.forEach(handlerId => {
          const evLi = document.createElement('li');
          evLi.style.margin = '2px 0';
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = handlerId;
          a.style.color = '#39ff14';
          a.style.textDecoration = 'none';
          a.onclick = (e) => {
            e.preventDefault();
            onClickHandler(handlerId);
          };
          evLi.appendChild(a);
          sub.appendChild(evLi);
        });
        li.appendChild(sub);
      }
      
      return li;
    };

    // Helper per aprire script hotspot (gestione speciale)
    const openHotspotScript = (roomId, hotspotId) => {
      // Salva il contenuto dello script corrente prima di aprire un nuovo script
      saveCurrentScriptIfNeeded();
      
      // Imposta currentScriptName PRIMA di qualsiasi controllo, cosÃ¬ deleteScript funziona anche se l'hotspot non viene trovato
      const hotspotKey = `Hotspot:${hotspotId}`;
      currentScriptName = hotspotKey;
      
      // Cerca l'hotspot nella room specificata
      const room = rooms.get(roomId);
      let hotspot = null;
      if (room && room.hotspots) {
        hotspot = room.hotspots.find(h => h.id === hotspotId);
      }
      
      // Se non trovato nella room, cerca nell'array globale hotspots
      if (!hotspot && typeof hotspots !== 'undefined') {
        hotspot = hotspots.find(h => h.id === hotspotId);
      }
      
      if (!hotspot) {
        // Anche se l'hotspot non viene trovato, carica lo script se esiste
        const content = getScriptContent(hotspotKey);
        if (content) {
          ensureLargeScriptEditor();
          ensureScriptEditor();
          if (largeCodeMirrorEditor) {
            largeCodeMirrorEditor.setValue(content);
            setTimeout(() => {
              if (largeCodeMirrorEditor && typeof largeCodeMirrorEditor.refresh === 'function') {
                largeCodeMirrorEditor.refresh();
              }
            }, 10);
          }
          if (codeMirrorEditor) {
            codeMirrorEditor.setValue(content);
            setTimeout(() => {
              if (codeMirrorEditor && typeof codeMirrorEditor.refresh === 'function') {
                codeMirrorEditor.refresh();
              }
            }, 10);
          }
          // Imposta i dropdown
          const scopeSel = document.getElementById('script-scope');
          const targetSel = document.getElementById('script-target');
          if (scopeSel && targetSel) {
            scopeSel.value = 'Hotspot';
            populateTargetsForScope('Hotspot');
            const hotspotValue = `hotspot:${hotspotId}`;
            if (targetSel.querySelector(`option[value="${hotspotValue}"]`)) {
              targetSel.value = hotspotValue;
            }
          }
          return;
        }
        showNotification('Hotspot not found', 'warning');
        return;
      }
      
      const fromHotspot = (hotspot.scripts && hotspot.scripts.onClick && hotspot.scripts.onClick.code)
        ? String(hotspot.scripts.onClick.code) : '';
      const fromStore = getScriptContent(hotspotKey);
      const content = fromHotspot.trim() ? fromHotspot : fromStore;
      
      ensureLargeScriptEditor();
      ensureScriptEditor();
      
      // Aggiorna l'editor con il contenuto corrente dell'hotspot
      if (largeCodeMirrorEditor) {
        largeCodeMirrorEditor.setValue(content);
        // Refresh per assicurarsi che l'editor si aggiorni visivamente
        setTimeout(() => {
          if (largeCodeMirrorEditor && typeof largeCodeMirrorEditor.refresh === 'function') {
            largeCodeMirrorEditor.refresh();
          }
        }, 0);
      }
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue(content);
        // Refresh per assicurarsi che l'editor si aggiorni visivamente
        setTimeout(() => {
          if (codeMirrorEditor && typeof codeMirrorEditor.refresh === 'function') {
            codeMirrorEditor.refresh();
          }
        }, 0);
      }
      
      // Sincronizza anche in jsScripts per coerenza
      jsScripts.set(`Hotspot:${hotspotId}`, content);
      try { localStorage.setItem(`script-Hotspot:${hotspotId}`, content); } catch(_) {}
      
      // Imposta i dropdown
      const scopeSel = document.getElementById('script-scope');
      const targetSel = document.getElementById('script-target');
      if (scopeSel && targetSel) {
        scopeSel.value = 'Hotspot';
        populateTargetsForScope('Hotspot');
        const hotspotValue = `hotspot:${hotspotId}`;
        if (targetSel.querySelector(`option[value="${hotspotValue}"]`)) {
          targetSel.value = hotspotValue;
        }
      }
    };

    // Global (single)
    const globalKey = getEditorScriptKey('Global', 'main');
    const { content: globalContent } = loadEditorScriptContent('Global', 'main');
    const globalHandlers = extractHandlersFromScript(globalContent);
    const globalHandlerNames = Array.from(globalHandlers).sort();

    if (globalContent.trim().length > 0 && !seenScriptKeys.has(globalKey)) {
      seenScriptKeys.add(globalKey);
      const globalGroup = document.createElement('div');
      globalGroup.className = 'mb-3';
      const h = document.createElement('div');
      h.textContent = 'Global';
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      h.style.fontSize = '14px';
      h.style.marginBottom = '8px';
      globalGroup.appendChild(h);
      
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';
      ul.style.listStyleType = 'none';
      
      const scriptItem = createScriptItem({
        label: 'Global',
        handlers: globalHandlerNames,
        hasContent: globalContent.trim().length > 0
      }, (handlerId) => {
        openScriptFromTree('Global', 'main', handlerId || null);
      });
      ul.appendChild(scriptItem);
      
      globalGroup.appendChild(ul);
      container.appendChild(globalGroup);
    }

    // Scripts organizzati per stanza
    const roomsWithScripts = [];
    rooms.forEach((room, roomId) => {
      const scriptsInRoom = [];
      
      // Script della stanza
      const { content: roomContent } = loadEditorScriptContent('Room', roomId);
      if (shouldShowEditorScript('Room', roomId, roomContent, seenScriptKeys)) {
        const handlers = extractHandlersFromScript(roomContent);
        const handlerNames = Array.from(handlers).sort();
        scriptsInRoom.push({
          type: 'room',
          scope: 'Room',
          target: roomId,
          label: `Room: ${room.name || roomId}`,
          handlers: handlerNames,
          hasContent: roomContent.trim().length > 0
        });
      }
      
      // Oggetti nella stanza con script
      if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
        room.sceneObjects.forEach(obj => {
          const { content: objContent } = loadEditorScriptContent('Object', obj.id);
          if (shouldShowEditorScript('Object', obj.id, objContent, seenScriptKeys)) {
            const handlers = extractHandlersFromScript(objContent);
            const handlerNames = Array.from(handlers).sort();
            scriptsInRoom.push({
              type: 'object',
              scope: 'Object',
              target: obj.id,
              label: `Object: ${obj.name || obj.id}`,
              handlers: handlerNames,
              hasContent: objContent.trim().length > 0
            });
          }
        });
      }
      
      // Hotspot nella stanza con script
      if (room.hotspots && Array.isArray(room.hotspots)) {
        room.hotspots.forEach(hotspot => {
          const { content: hotspotCode } = loadEditorScriptContent('Hotspot', hotspot.id);
          if (shouldShowEditorScript('Hotspot', hotspot.id, hotspotCode, seenScriptKeys)) {
            const handlers = extractHandlersFromScript(hotspotCode);
            const handlerNames = Array.from(handlers).sort();
            scriptsInRoom.push({
              type: 'hotspot',
              scope: 'Hotspot',
              target: hotspot.id,
              roomId: roomId,
              label: `Hotspot: ${hotspot.name || hotspot.id}`,
              handlers: handlerNames,
              hasContent: hotspotCode.trim().length > 0
            });
          }
        });
      }
      
      if (scriptsInRoom.length > 0) {
        roomsWithScripts.push({
          roomId: roomId,
          roomName: room.name || roomId,
          scripts: scriptsInRoom
        });
      }
    });
    
    // Ordina le stanze per nome
    roomsWithScripts.sort((a, b) => {
      const nameA = a.roomName.toLowerCase();
      const nameB = b.roomName.toLowerCase();
      return nameA.localeCompare(nameB, 'en', { numeric: true, sensitivity: 'base' });
    });
    
    // Crea gruppo per ogni stanza
    roomsWithScripts.forEach(roomData => {
      const roomGroup = document.createElement('div');
      roomGroup.className = 'mb-3';
      const h = document.createElement('div');
      h.textContent = roomData.roomName;
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      h.style.fontSize = '14px';
      h.style.marginBottom = '8px';
      roomGroup.appendChild(h);
      
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';
      ul.style.listStyleType = 'none';
      
      roomData.scripts.forEach(scriptInfo => {
        let onClickHandler;
        if (scriptInfo.type === 'hotspot') {
          // Gestione speciale per hotspot
          onClickHandler = (handlerId) => {
            openHotspotScript(scriptInfo.roomId, scriptInfo.target);
          };
        } else {
          onClickHandler = (handlerId) => {
            openScriptFromTree(scriptInfo.scope, scriptInfo.target, handlerId || null);
          };
        }
        
        const scriptItem = createScriptItem(scriptInfo, onClickHandler);
        ul.appendChild(scriptItem);
      });
      
      roomGroup.appendChild(ul);
      container.appendChild(roomGroup);
    });

    // Inventory items with scripts
    const inventoryScriptItems = [];
    (inventoryItems || []).forEach(item => {
      const { content } = loadEditorScriptContent('Inventory', item.name);
      if (shouldShowEditorScript('Inventory', item.name, content, seenScriptKeys)) {
        const handlers = extractHandlersFromScript(content);
        const handlerNames = Array.from(handlers).sort();
        inventoryScriptItems.push({
          scope: 'Inventory',
          target: item.name,
          label: `Item: ${item.name}`,
          handlers: handlerNames,
          hasContent: content.trim().length > 0
        });
      }
    });

    if (inventoryScriptItems.length > 0) {
      const invGroup = document.createElement('div');
      invGroup.className = 'mb-3';
      const h = document.createElement('div');
      h.textContent = 'Inventory';
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      h.style.fontSize = '14px';
      h.style.marginBottom = '8px';
      invGroup.appendChild(h);

      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';
      ul.style.listStyleType = 'none';

      inventoryScriptItems.forEach(scriptInfo => {
        const scriptItem = createScriptItem(scriptInfo, (handlerId) => {
          openScriptFromTree(scriptInfo.scope, scriptInfo.target, handlerId || null);
        });
        ul.appendChild(scriptItem);
      });

      invGroup.appendChild(ul);
      container.appendChild(invGroup);
    }

    // Characters with scripts
    const characterScriptItems = [];
    const characterNames = [];
    characterFrames.forEach((_, name) => characterNames.push(name));
    characterNames.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
    characterNames.forEach(charName => {
      const { content } = loadEditorScriptContent('Character', charName);
      if (shouldShowEditorScript('Character', charName, content, seenScriptKeys)) {
        const handlers = extractHandlersFromScript(content);
        const handlerNames = Array.from(handlers).sort();
        characterScriptItems.push({
          scope: 'Character',
          target: charName,
          label: `Character: ${charName}`,
          handlers: handlerNames,
          hasContent: content.trim().length > 0
        });
      }
    });

    if (characterScriptItems.length > 0) {
      const charGroup = document.createElement('div');
      charGroup.className = 'mb-3';
      const h = document.createElement('div');
      h.textContent = 'Characters';
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      h.style.fontSize = '14px';
      h.style.marginBottom = '8px';
      charGroup.appendChild(h);

      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';
      ul.style.listStyleType = 'none';

      characterScriptItems.forEach(scriptInfo => {
        const scriptItem = createScriptItem(scriptInfo, (handlerId) => {
          openScriptFromTree(scriptInfo.scope, scriptInfo.target, handlerId || null);
        });
        ul.appendChild(scriptItem);
      });

      charGroup.appendChild(ul);
      container.appendChild(charGroup);
    }

    // GUI attached
    const guiItems = [];
    (typeof guiButtons !== 'undefined' ? guiButtons : []).forEach(b => {
      const { content } = loadEditorScriptContent('GUI', b.id);
      if (shouldShowEditorScript('GUI', b.id, content, seenScriptKeys)) {
        const handlers = extractHandlersFromScript(content);
        const handlerNames = Array.from(handlers).sort();
        guiItems.push({ scope: 'GUI', target: b.id, label: `GUI: ${b.name || b.id}`, handlers: handlerNames, hasContent: content.trim().length > 0 });
      }
    });
    
    if (guiItems.length > 0) {
      const guiGroup = document.createElement('div');
      guiGroup.className = 'mb-3';
      const h = document.createElement('div');
      h.textContent = 'GUI';
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      h.style.fontSize = '14px';
      h.style.marginBottom = '8px';
      guiGroup.appendChild(h);
      
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';
      ul.style.listStyleType = 'none';
      
      guiItems.forEach(item => {
        const scriptItem = createScriptItem(item, (handlerId) => {
          openScriptFromTree(item.scope, item.target, handlerId || null);
        });
        ul.appendChild(scriptItem);
      });
      
      guiGroup.appendChild(ul);
      container.appendChild(guiGroup);
    }

    tree.appendChild(container);
  }

  // Flag persist condivisi (dichiarati qui perché usati da script flush + autosave)
  let amiantoDiskSaveTimer = null;
  let amiantoPersistInProgress = false;
  const AMIANTO_DISK_SAVE_DEBOUNCE_MS = 2500;

  // Helper function per salvare il contenuto dello script corrente
  // options.markDirty: se false non marca il progetto (es. flush durante persist)
  function saveCurrentScriptIfNeeded(options = {}) {
    if (!currentScriptName) return;
    const allowMarkDirty = options.markDirty !== false && !amiantoPersistInProgress;
    
    ensureLargeScriptEditor();
    ensureScriptEditor();
    let currentContent = '';
    if (largeCodeMirrorEditor) {
      currentContent = largeCodeMirrorEditor.getValue();
    } else if (codeMirrorEditor) {
      currentContent = codeMirrorEditor.getValue();
    } else {
      const taLarge = document.getElementById('script-editor-large');
      const taSmall = document.getElementById('script-editor');
      currentContent = (taLarge && taLarge.value) || (taSmall && taSmall.value) || '';
    }
    
    // Salva il contenuto corrente
    const currentKey = migrateLegacyScriptKey(String(currentScriptName));
    if (currentKey !== currentScriptName) currentScriptName = currentKey;
    if (currentContent.trim().length > 0 || jsScripts.has(currentKey)) {
      const prevContent = jsScripts.has(currentKey) ? String(jsScripts.get(currentKey)) : '';
      const contentChanged = prevContent !== String(currentContent);
      jsScripts.set(currentKey, currentContent);
      try { localStorage.setItem(`script-${currentKey}`, currentContent); } catch(_) {}
      
      if (currentKey.startsWith('Hotspot:')) {
        const hotspotId = currentKey.slice('Hotspot:'.length);
        syncHotspotScriptToAllRooms(hotspotId, currentContent, currentKey);
        // Solo se il testo è davvero cambiato — altrimenti crea un loop
        // dirty → autosave → flush script → dirty → …
        if (allowMarkDirty && contentChanged && typeof window.markAmiantoProjectDirty === 'function') {
          window.markAmiantoProjectDirty();
        }
      }
      
      // Se Ã¨ uno script oggetto, mantieni l'attachment in objectScripts
      if (currentKey.startsWith('Object:')) {
        const objId = currentKey.replace('Object:', '');
        // Verifica che l'oggetto esista
        let objectExists = false;
        rooms.forEach((room) => {
          if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
            if (room.sceneObjects.find(o => o.id === objId)) {
              objectExists = true;
            }
          }
        });
        if (objectExists) {
          objectScripts.set(objId, currentKey);
        }
      }

      if (currentKey.startsWith('Inventory:')) {
        const itemName = currentKey.slice('Inventory:'.length);
        attachInventoryItemScript(itemName, currentKey);
      }
      if (currentKey.startsWith('Room:')) {
        roomScripts.set(currentKey.slice('Room:'.length), currentKey);
      }
      if (currentKey.startsWith('Character:')) {
        characterScripts.set(currentKey.slice('Character:'.length), currentKey);
      }
      if (currentKey.startsWith('GUI:')) {
        const btnId = currentKey.slice('GUI:'.length);
        if (typeof guiScripts !== 'undefined' && guiScripts.set) guiScripts.set(btnId, currentKey);
      }
    }
  }

  function openScriptFromTree(scope, target, handlerId) {
    // Salva il contenuto dello script corrente prima di aprire un nuovo script
    saveCurrentScriptIfNeeded();
    
    ensureLargeScriptEditor();
    ensureScriptEditor();
    const { key: scriptKeyToUse, content: loadedContent } = loadEditorScriptContent(scope, target);
    let content = loadedContent;
    // Permetti di aprire script vuoti (potrebbero essere appena creati)
    // Se lo script non esiste affatto, crealo vuoto
    if (content === '' && !jsScripts.has(scriptKeyToUse) && !localStorage.getItem(`script-${scriptKeyToUse}`)) {
      const hasAttachment = hasEditorScriptLink(scope, target);
      // Per oggetti/inventario/personaggi, permetti sempre di creare uno script vuoto (l'attachment verrÃ  creato al salvataggio)
      if (!hasAttachment && scope !== 'Object' && scope !== 'Inventory' && scope !== 'Character') {
        showNotification('Script not found', 'warning');
        return;
      }
      // Crea lo script vuoto se ha un attachment o se Ã¨ un oggetto/inventario/personaggio
      content = '';
      jsScripts.set(scriptKeyToUse, content);
      try { localStorage.setItem(`script-${scriptKeyToUse}`, content); } catch(_) {}
      
      if (scope === 'Object' && !hasAttachment) {
        objectScripts.set(target, scriptKeyToUse);
      }
      if (scope === 'Inventory' && !hasAttachment) {
        attachInventoryItemScript(target, scriptKeyToUse);
      }
      if (scope === 'Character' && !hasAttachment) {
        characterScripts.set(target, scriptKeyToUse);
      }
    }
    currentScriptName = scriptKeyToUse;
    
    // Aggiorna entrambi gli editor con il nuovo contenuto
    if (largeCodeMirrorEditor) {
      largeCodeMirrorEditor.setValue(content);
      // Refresh e focus per assicurarsi che l'editor si aggiorni visivamente
      setTimeout(() => {
        if (largeCodeMirrorEditor) {
          if (typeof largeCodeMirrorEditor.refresh === 'function') {
            largeCodeMirrorEditor.refresh();
          }
          // Forza il focus se l'editor Ã¨ visibile
          const editorContainer = document.getElementById('codeEditorContainer');
          if (editorContainer && editorContainer.style.display !== 'none') {
            largeCodeMirrorEditor.focus();
          }
        }
      }, 10);
    }
    if (codeMirrorEditor) {
      codeMirrorEditor.setValue(content);
      // Refresh per assicurarsi che l'editor si aggiorni visivamente
      setTimeout(() => {
        if (codeMirrorEditor && typeof codeMirrorEditor.refresh === 'function') {
          codeMirrorEditor.refresh();
        }
      }, 10);
    }

    // Reflect dropdowns and optionally lock
    const scopeSel = document.getElementById('script-scope');
    const targetSel = document.getElementById('script-target');
    if (scopeSel && targetSel) {
      scopeSel.value = scope;
      populateTargetsForScope(scope);
      if (targetSel.querySelector(`option[value="${target}"]`)) targetSel.value = target;
      const lock = document.getElementById('lock-script-scope');
      if (lock && lock.checked) {
        targetSel.disabled = (scope !== 'Global');
        scopeSel.disabled = true;
      }
    }

    // Scroll to handler if provided
    if (handlerId && largeCodeMirrorEditor) {
      const re = new RegExp(`function\\s+${handlerId}\\s*\\(`);
      for (let i = 0; i < largeCodeMirrorEditor.lineCount(); i++) {
        if (re.test(largeCodeMirrorEditor.getLine(i))) {
          largeCodeMirrorEditor.setCursor({ line: i, ch: 0 });
          largeCodeMirrorEditor.focus();
          break;
        }
      }
    }
  }

  window.createScriptFromDropdown = function() {
    ensureLargeScriptEditor();
    const scopeSel = document.getElementById('script-scope');
    const targetSel = document.getElementById('script-target');
    const eventSel = document.getElementById('script-event');
    if (!scopeSel || !targetSel || !eventSel) return;

    const scope = scopeSel.value || 'Global';
    const target = (scope === 'Global') ? 'main' : (targetSel.value || '').trim();
    if (!target) { showNotification('Select a valid target', 'warning'); return; }
    const handlerId = eventSel.value || 'on_game_start';
    const eventDef = (SCRIPT_EVENTS[scope] || []).find(e => e.id === handlerId) || { label: handlerId };

    const { key, content: loadedContent } = loadEditorScriptContent(scope, target);
    let content = loadedContent;

    // One script per scope + target + event
    const handlerRegex = new RegExp(`(?:async\\s+)?function\\s+${handlerId}\\s*\\(`);
    if (handlerRegex.test(content)) {
      showNotification('Script already exists', 'warning');
      return;
    }

    // Ensure header
    if (!content) {
      const header = [
        `// Scope: ${scope}`,
        `// Target: ${target}`,
        ''
      ].join('\n');
      content = header;
    }

    // Insert handler skeleton
    let skeleton = '\n';
    skeleton += `// Event: ${eventDef.label}\n`;
    if (handlerId === 'on_game_start') {
      skeleton += `function on_game_start(){\n  print('Game started');\n}\n`;
    } else if (handlerId === 'on_before_room_change') {
      skeleton += `function on_before_room_change(oldRoomId, newRoomId){\n  // runs before the new room is loaded (old room still active)\n}\n`;
    } else if (handlerId === 'on_room_change') {
      skeleton += `function on_room_change(oldRoomId, newRoomId){\n  // runs after the new room is fully loaded\n}\n`;
    } else if (handlerId === 'on_object_click') {
      skeleton += `function on_object_click(object_id, x, y){\n  // your code here\n}\n`;
    } else if (handlerId === 'on_character_click') {
      skeleton += `function on_character_click(characterId){\n  // your code here\n}\n`;
    } else if (handlerId === 'on_hotspot_click') {
      skeleton += `function on_hotspot_click(hotspotId, x, y, usedItemId){\n`;
      skeleton += `  // usedItemId valorizzato solo con combinazione inventario; return true se gestita\n`;
      skeleton += `  return false;\n}\n`;
    } else if (handlerId === 'on_use_with') {
      skeleton += `function on_use_with(targetType, targetId, x, y){\n`;
      skeleton += `  // Handler per script item inventario (Scope Inventory)\n`;
      skeleton += `  // targetType: hotspot | object | character | inventory\n`;
      skeleton += `  // targetId: id dell'hotspot/oggetto/item (non il name, salvo coincidano)\n`;
      skeleton += `  if (targetType !== "hotspot" || targetId !== "hotspot_id_here") return false;\n`;
      skeleton += `  show_message("Combinazione riuscita.");\n`;
      skeleton += `  return true;\n`;
      skeleton += `}\n`;
    } else if (handlerId === 'on_inventory_use_with') {
      skeleton += `function on_inventory_use_with(itemId, targetType, targetId, x, y){\n`;
      skeleton += `  // Solo script Global (fallback). Sugli item inventario usare on_use_with.\n`;
      skeleton += `  return false;\n`;
      skeleton += `}\n`;
    } else {
      skeleton += `function ${handlerId}(){\n  // your code here\n}\n`;
    }
    content = content.replace(/\s*$/, '') + '\n' + skeleton;

    // Save and attach
    jsScripts.set(key, content);
    try { localStorage.setItem(`script-${key}`, content); } catch(_) {}
    currentScriptName = key;

    if (scope === 'Room') {
      roomScripts.set(target, key);
    } else if (scope === 'Object') {
      objectScripts.set(target, key);
    } else if (scope === 'Character') {
      characterScripts.set(target, key);
    } else if (scope === 'Hotspot') {
      const hotspotId = key.slice('Hotspot:'.length);
      syncHotspotScriptToAllRooms(hotspotId, content, key);
      if (typeof window.markAmiantoProjectDirty === 'function') window.markAmiantoProjectDirty();
    } else if (scope === 'GUI') {
      if (typeof guiScripts !== 'undefined' && guiScripts.set) guiScripts.set(target, key);
    } else if (scope === 'Inventory') {
      const item = inventoryItems.find(i => i.name === target);
      if (!item) {
        showNotification(`Inventory item "${target}" not found`, 'warning');
        return;
      }
      attachInventoryItemScript(target, key);
    }

    if (largeCodeMirrorEditor) {
      largeCodeMirrorEditor.setValue(content);
      // Move cursor to handler
      const re = new RegExp(`function\\s+${handlerId}\\s*\\(`);
      for (let i = 0; i < largeCodeMirrorEditor.lineCount(); i++) {
        if (re.test(largeCodeMirrorEditor.getLine(i))) {
          largeCodeMirrorEditor.setCursor({ line: i, ch: 0 });
          break;
        }
      }
      largeCodeMirrorEditor.focus();
    }

    refreshScriptSelector();
    rebuildScriptsTree();
    
    // Riabilita sempre i dropdown dopo la creazione per permettere la creazione di altri script
    // Il lock viene applicato solo quando si apre uno script esistente dall'albero
    scopeSel.disabled = false;
    if (scope === 'Global') {
      targetSel.disabled = true;
    } else {
      targetSel.disabled = false;
    }
    
    showNotification(`Script created: ${scope} â†’ ${target} (${eventDef.label})`, 'success');
  }

  // ============================================
  // GAME STATE SYSTEM - Variabili di gioco globali
  // ============================================
  window.Game = window.Game || {};
  
  // Stato interno (non accessibile direttamente)
  const _gameState = {};
  
  // Definizioni delle variabili (per editor UI e validazione)
  window.gameVariableDefinitions = window.gameVariableDefinitions || [];

  /** Dialoghi ramificati del progetto (grafo line/choice/end). Persistiti in .amnt come project.dialogues */
  window.projectDialogues = window.projectDialogues || [];
  
  // API Game State
  window.Game.setVar = function(key, value) {
    if (!key || typeof key !== 'string') {
      console.warn('[Game.setVar] Invalid key:', key);
      return false;
    }
    // Validazione tipo se definito
    const def = gameVariableDefinitions.find(v => v.name === key);
    if (def) {
      const expectedType = def.type;
      if (expectedType === 'boolean' && typeof value !== 'boolean') {
        console.warn(`[Game.setVar] Variable "${key}" should be boolean, got ${typeof value}`);
        value = !!value; // Coerce to boolean
      } else if (expectedType === 'number' && typeof value !== 'number') {
        console.warn(`[Game.setVar] Variable "${key}" should be number, got ${typeof value}`);
        value = Number(value) || 0;
      } else if (expectedType === 'string' && typeof value !== 'string') {
        console.warn(`[Game.setVar] Variable "${key}" should be string, got ${typeof value}`);
        value = String(value);
      }
    }
    _gameState[key] = value;
    return true;
  };
  
  window.Game.getVar = function(key) {
    if (!key || typeof key !== 'string') {
      console.warn('[Game.getVar] Invalid key:', key);
      return undefined;
    }
    if (!(key in _gameState)) {
      // Se la variabile Ã¨ definita ma non ancora impostata, restituisci il valore iniziale
      const def = gameVariableDefinitions.find(v => v.name === key);
      if (def && 'initialValue' in def) {
        return def.initialValue;
      }
      console.warn(`[Game.getVar] Variable "${key}" not found`);
      return undefined;
    }
    return _gameState[key];
  };
  
  window.Game.hasVar = function(key) {
    if (!key || typeof key !== 'string') return false;
    return key in _gameState;
  };
  
  window.Game.toggleVar = function(key) {
    if (!key || typeof key !== 'string') {
      console.warn('[Game.toggleVar] Invalid key:', key);
      return false;
    }
    const current = Game.getVar(key);
    if (typeof current === 'boolean') {
      Game.setVar(key, !current);
      return true;
    } else {
      // Se non Ã¨ boolean, inizializza a true
      Game.setVar(key, true);
      return true;
    }
  };
  
  // Funzione per ottenere tutto lo stato (per serializzazione)
  window.Game.getState = function() {
    return JSON.parse(JSON.stringify(_gameState));
  };

  // API opzionale per mostrare testo nel gioco (usata da print(..., { showInGame: true }))
  // L'implementazione concreta nel runtime puÃ² sovrascrivere questo metodo.
  window.Game.showText = window.Game.showText || function(text) {
    // Di default, in editor mostriamo una notifica non invasiva
    try {
      showNotification(String(text), 'info');
    } catch (_) {}
  };
  
  // Funzione per impostare tutto lo stato (per deserializzazione)
  window.Game.setState = function(state) {
    if (!state || typeof state !== 'object') return false;
    Object.keys(_gameState).forEach(key => delete _gameState[key]);
    Object.keys(state).forEach(key => {
      _gameState[key] = state[key];
    });
    return true;
  };
  
  // ============================================
  // CONDITION SYSTEM - Sistema di condizioni
  // ============================================
  window.Condition = window.Condition || {};
  
  window.Condition.evaluate = function(conditionObject) {
    if (!conditionObject || typeof conditionObject !== 'object') {
      console.warn('[Condition.evaluate] Invalid condition object');
      return false;
    }
    
    const { var: varName, operator, value: expectedValue } = conditionObject;
    
    if (!varName || typeof varName !== 'string') {
      console.warn('[Condition.evaluate] Invalid variable name');
      return false;
    }
    
    if (!operator || typeof operator !== 'string') {
      console.warn('[Condition.evaluate] Invalid operator');
      return false;
    }
    
    // Ottieni valore corrente della variabile
    const currentValue = Game.getVar(varName);
    const varExists = Game.hasVar(varName);
    
    // Operatore "exists" - verifica solo esistenza
    if (operator === 'exists') {
      return varExists;
    }
    
    // Se la variabile non esiste e l'operatore non Ã¨ "exists", fallisce
    if (!varExists) {
      console.warn(`[Condition.evaluate] Variable "${varName}" does not exist`);
      return false;
    }
    
    // Valutazione condizioni
    switch (operator) {
      case '==':
        return currentValue == expectedValue; // Usa == per permettere type coercion
      case '!=':
        return currentValue != expectedValue;
      case '>':
        return Number(currentValue) > Number(expectedValue);
      case '<':
        return Number(currentValue) < Number(expectedValue);
      case '>=':
        return Number(currentValue) >= Number(expectedValue);
      case '<=':
        return Number(currentValue) <= Number(expectedValue);
      default:
        console.warn(`[Condition.evaluate] Unknown operator: ${operator}`);
        return false;
    }
  };
  
  window.Condition.evaluateAll = function(conditions) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return true; // Nessuna condizione = sempre vero
    }
    
    // Tutte le condizioni devono essere vere (AND logic)
    return conditions.every(cond => Condition.evaluate(cond));
  };

  // Helper per serializzare valori nello Script Log (ScriptLogService)
  // Deve essere standalone perchÃ© viene usata in contesti diversi (sandbox)
  function serializeValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return '[object Object]';
      }
    }
    return String(value);
  }

  // Event System: Global trigger functions
  window.gameEventHandlers = window.gameEventHandlers || {};

  function triggerGameEvent(eventName, ...args) {
    if (window.gameEventHandlers[eventName]) {
      try {
        window.gameEventHandlers[eventName](...args);
        addDebugMessage(`Event triggered: ${eventName}(${args.join(', ')})`, 'info');
      } catch(e) {
        addDebugMessage(`Event handler error for ${eventName}: ${e.message}`, 'error');
      }
    }
  }

  // Specific event trigger functions
  window.triggerGameStart = function() {
    triggerGameEvent('game_start');
  };

  window.triggerRoomChange = function(oldRoomId, newRoomId) {
    triggerGameEvent('room_change', oldRoomId, newRoomId);
  };

  window.triggerObjectClick = function(objectId, x, y) {
    triggerGameEvent('object_click', objectId, x, y);
  };

  window.triggerCharacterClick = function(characterId) {
    triggerGameEvent('character_click', characterId);
  };

  window.triggerHotspotClick = function(hotspotId) {
    triggerGameEvent('hotspot_click', hotspotId);
  };

  function executeScriptHandler(scriptContent, handlerName, argsArray, conditions){
    if (!scriptContent || !handlerName) return;
    
    // Valuta condizioni se presenti
    if (conditions && Array.isArray(conditions) && conditions.length > 0) {
      if (!Condition.evaluateAll(conditions)) {
        addDebugMessage(`[Condition] Script handler "${handlerName}" skipped: conditions not met`, 'info');
        return; // Condizioni non soddisfatte, non eseguire lo script
      }
    }
    
    // Script handler non piÃ¹ supportato in modalitÃ  iframe
    // Gli script vengono eseguiti nel runtime standalone
    addDebugMessage(`[Script] Handler "${handlerName}" - scripts run in the standalone runtime`, 'info');
  }

  window.newScript = function() {
    if (confirm('Do you want to create a new script? The current content will be lost.')) {
      ensureLargeScriptEditor();
      ensureScriptEditor();
      const editors = [largeCodeMirrorEditor, codeMirrorEditor].filter(Boolean);
      if (editors.length) {
        editors.forEach(ed => ed.setValue(''));
      } else {
        const taLarge = document.getElementById('script-editor-large');
        if (taLarge) taLarge.value = '';
        const taSmall = document.getElementById('script-editor');
        if (taSmall) taSmall.value = '';
      }
      showNotification('New script created!', 'info');
    }
  };

  window.saveScript = function() {
    ensureLargeScriptEditor();
    ensureScriptEditor();
    let content = '';
    if (largeCodeMirrorEditor) {
      content = largeCodeMirrorEditor.getValue();
    } else if (codeMirrorEditor) {
      content = codeMirrorEditor.getValue();
    } else {
      const taLarge = document.getElementById('script-editor-large');
      const taSmall = document.getElementById('script-editor');
      content = (taLarge && taLarge.value) || (taSmall && taSmall.value) || '';
    }
    let key = currentScriptName && migrateLegacyScriptKey(String(currentScriptName));
    if (!key) {
      const selector = document.getElementById('script-selector');
      key = migrateLegacyScriptKey((selector && selector.value) || 'new-script');
    }
    if (key !== currentScriptName) currentScriptName = key;

    const oldContent = getScriptContent(key);
    
    // âš ï¸ GESTIONE SPECIALE PER HOTSPOT: Salva direttamente nell'hotspot se Ã¨ uno script hotspot
    if (key.startsWith('Hotspot:')) {
      const hotspotId = key.replace('Hotspot:', '');
      syncHotspotScriptToAllRooms(hotspotId, content, key);
    }
    
    // âš ï¸ GESTIONE SPECIALE PER OGGETTI: Crea/aggiorna l'attachment in objectScripts se Ã¨ uno script oggetto
    if (key.startsWith('Object:')) {
      const objId = key.replace('Object:', '');
      // Verifica che l'oggetto esista in almeno una stanza
      let objectFound = false;
      rooms.forEach((room, roomId) => {
        if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
          const obj = room.sceneObjects.find(o => o.id === objId);
          if (obj) {
            objectFound = true;
          }
        }
      });
      
      if (objectFound) {
        // Crea o aggiorna l'attachment per questo oggetto specifico
        objectScripts.set(objId, key);
        console.log(`[saveScript] [OBJECT] Script "${key}" associato all'oggetto "${objId}"`);
      } else {
        console.warn(`[saveScript] [OBJECT] Oggetto ${objId} non trovato in nessuna stanza, ma creo comunque l'attachment`);
        // Crea comunque l'attachment, potrebbe essere che l'oggetto venga aggiunto in seguito
        objectScripts.set(objId, key);
      }
    }

    if (key.startsWith('Inventory:')) {
      const itemName = key.slice('Inventory:'.length);
      attachInventoryItemScript(itemName, key);
    }
    if (key.startsWith('Room:')) {
      roomScripts.set(key.slice('Room:'.length), key);
    }
    if (key.startsWith('Character:')) {
      characterScripts.set(key.slice('Character:'.length), key);
    }
    if (key.startsWith('GUI:')) {
      const btnId = key.slice('GUI:'.length);
      if (typeof guiScripts !== 'undefined' && guiScripts.set) guiScripts.set(btnId, key);
    }
    
    // Salva il nuovo contenuto (anche per hotspot, per mantenere sincronizzazione)
    try { localStorage.setItem(`script-${key}`, content); } catch(_) {}
    jsScripts.set(key, content);

    if (key.startsWith('Hotspot:')) {
      syncHotspotScriptToAllRooms(key.slice('Hotspot:'.length), content, key);
    } else if (content.trim() !== '') {
      const syncedHotspotIds = new Set();
      const syncHotspotIfLinked = (hotspot, source) => {
        if (!hotspot || syncedHotspotIds.has(hotspot.id)) return false;
        const linkedRaw = hotspot._meta && hotspot._meta.linkedScriptName;
        const linked = linkedRaw ? migrateLegacyScriptKey(String(linkedRaw)) : '';
        if (linked !== key) return false;
        syncHotspotScriptToAllRooms(hotspot.id, content, key);
        syncedHotspotIds.add(hotspot.id);
        console.log(`[saveScript] [SYNC] Hotspot ${hotspot.id} â† "${key}" [${source}]`);
        return true;
      };
      rooms.forEach((room, roomId) => {
        if (!room.hotspots) return;
        room.hotspots.forEach(hotspot => syncHotspotIfLinked(hotspot, `room:${roomId}`));
      });
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        hotspots.forEach(hotspot => syncHotspotIfLinked(hotspot, 'global-only'));
      }
    }

    if (typeof window.markAmiantoProjectDirty === 'function') window.markAmiantoProjectDirty();
    
    showNotification(`Script "${key}" saved!`, 'success');

    // refresh attach targets
    refreshScriptSelector();
    refreshSceneObjectScriptTargets();
    
    // Aggiorna sempre l'albero degli script per riflettere le modifiche
    rebuildScriptsTree();
    scheduleProjectSizeIndicatorRefresh(250);
  };

  window.runScript = function() {
    ensureLargeScriptEditor();
    ensureScriptEditor();
    const content = largeCodeMirrorEditor ? largeCodeMirrorEditor.getValue() : (codeMirrorEditor ? codeMirrorEditor.getValue() : (document.getElementById('script-editor-large')?.value || document.getElementById('script-editor')?.value || ''));
    
    if (!content || !content.trim()) {
      showNotification('Script is empty!', 'warning');
      return;
    }
    
    // Per eseguire script, apri il runtime in una nuova finestra
    // Il runtime caricherÃ  automaticamente il progetto da localStorage
    const jsonString = window.serializeProjectToJsonString(true);
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
    
    // Apri runtime in nuova finestra
    const runtimeUrl = getRuntimePageUrl();
    const runtimeWindow = window.open(
      runtimeUrl,
      'AmiantoRuntime',
      'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
    );

    if (!runtimeWindow) {
      showNotification('Could not open the runtime window. Check that pop-ups are allowed.', 'error');
      return;
    }

    showNotification('Runtime opened in a new window. The script will run automatically.', 'info');
  };

  window.deleteScript = function() {
    let scriptName = currentScriptName && migrateLegacyScriptKey(String(currentScriptName));
    if (!scriptName) {
      const selector = document.getElementById('script-selector');
      scriptName = migrateLegacyScriptKey((selector && selector.value) || '');
    }
    
    if (!scriptName || !scriptName.trim()) {
      showNotification('Select a script to delete', 'warning');
      return;
    }
    
    // Chiedi conferma
    if (!confirm(`Delete script "${scriptName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    // Gestione speciale per script hotspot (chiave Hotspot:${hotspotId})
    // Se si sta eliminando uno script hotspot, rimuovi anche la struttura hotspot.scripts.onClick
    if (scriptName.startsWith('Hotspot:')) {
      const hotspotId = scriptName.replace('Hotspot:', '');
      
      // Rimuovi script dagli hotspot in tutte le stanze
      rooms.forEach((room, roomId) => {
        if (room.hotspots && Array.isArray(room.hotspots)) {
          const hotspot = room.hotspots.find(h => h.id === hotspotId);
          if (hotspot) {
            if (hotspot.scripts && hotspot.scripts.onClick) {
              hotspot.scripts.onClick.code = '';
              hotspot.scripts.onClick.enabled = false;
            }
            if (hotspot._meta) {
              delete hotspot._meta.linkedScriptName;
            }
          }
        }
      });
      
      // Rimuovi anche dagli hotspot globali se esistono
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        const hotspot = hotspots.find(h => h.id === hotspotId);
        if (hotspot) {
          if (hotspot.scripts && hotspot.scripts.onClick) {
            hotspot.scripts.onClick.code = '';
            hotspot.scripts.onClick.enabled = false;
          }
          if (hotspot._meta) {
            delete hotspot._meta.linkedScriptName;
          }
        }
      }
    }
    
    // Rimuovi lo script da jsScripts
    jsScripts.delete(scriptName);
    
    // Rimuovi da localStorage
    try {
      localStorage.removeItem(`script-${scriptName}`);
    } catch(_) {}
    
    // Rimuovi tutti gli attachment che puntano a questo script
    // Object scripts
    for (const [objId, attachedScript] of objectScripts.entries()) {
      if (attachedScript === scriptName) {
        objectScripts.delete(objId);
      }
    }
    
    // Room scripts
    for (const [roomId, attachedScript] of roomScripts.entries()) {
      if (attachedScript === scriptName) {
        roomScripts.delete(roomId);
      }
    }
    
    // Character scripts
    for (const [charName, attachedScript] of characterScripts.entries()) {
      if (attachedScript === scriptName) {
        characterScripts.delete(charName);
      }
    }
    
    // Inventory scripts
    for (const [itemName, attachedScript] of inventoryScripts.entries()) {
      if (attachedScript === scriptName) {
        inventoryScripts.delete(itemName);
      }
    }
    inventoryItems.forEach(item => {
      const userKey = migrateLegacyScriptKey(String(item.scriptName || '').trim());
      if (userKey === scriptName) {
        item.scriptName = '';
        inventoryScripts.delete(item.name);
      }
    });
    const parsedKey = parseScriptKeyScopeTarget(scriptName);
    if (parsedKey && parsedKey.scope !== 'Hotspot' && parsedKey.scope !== 'Global') {
      clearEditorScriptAttachment(parsedKey.scope, parsedKey.target);
    }
    
    // Hotspot scripts - Rimuovi anche dalla struttura hotspot.scripts.onClick
    // Gli hotspot ora salvano gli script direttamente in hotspot.scripts.onClick
    for (const [hotspotId, attachedScript] of hotspotScripts.entries()) {
      if (attachedScript === scriptName) {
        hotspotScripts.delete(hotspotId);
      }
    }
    
    // Rimuovi script dagli hotspot che hanno questo script associato
    // Cerca in tutte le stanze
    rooms.forEach((room, roomId) => {
      if (room.hotspots && Array.isArray(room.hotspots)) {
        room.hotspots.forEach(hotspot => {
          // Verifica se l'hotspot ha uno script associato tramite _meta.linkedScriptName
          if (hotspot._meta && hotspot._meta.linkedScriptName === scriptName) {
            // Rimuovi lo script dall'hotspot
            if (hotspot.scripts && hotspot.scripts.onClick) {
              hotspot.scripts.onClick.code = '';
              hotspot.scripts.onClick.enabled = false;
            }
            // Rimuovi il riferimento
            delete hotspot._meta.linkedScriptName;
          }
        });
      }
    });
    
    // Rimuovi anche dagli hotspot globali se esistono
    if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
      hotspots.forEach(hotspot => {
        if (hotspot._meta && hotspot._meta.linkedScriptName === scriptName) {
          if (hotspot.scripts && hotspot.scripts.onClick) {
            hotspot.scripts.onClick.code = '';
            hotspot.scripts.onClick.enabled = false;
          }
          delete hotspot._meta.linkedScriptName;
        }
      });
    }
    
    // GUI scripts
    if (typeof guiScripts !== 'undefined' && guiScripts instanceof Map) {
      for (const [btnId, attachedScript] of guiScripts.entries()) {
        if (attachedScript === scriptName) {
          guiScripts.delete(btnId);
        }
      }
    }
    
    // Se lo script eliminato era quello aperto, pulisci l'editor
    if (currentScriptName === scriptName) {
      currentScriptName = null;
      ensureLargeScriptEditor();
      ensureScriptEditor();
      const editors = [largeCodeMirrorEditor, codeMirrorEditor].filter(Boolean);
      if (editors.length) {
        editors.forEach(ed => ed.setValue(''));
      } else {
        const taLarge = document.getElementById('script-editor-large');
        if (taLarge) taLarge.value = '';
        const taSmall = document.getElementById('script-editor');
        if (taSmall) taSmall.value = '';
      }
    }
    
    // Aggiorna il selector
    refreshScriptSelector();
    
    // Aggiorna l'albero degli script
    rebuildScriptsTree();

    refreshInventoryItemsListUI();

    // Aggiorna tutti i target selector
    refreshSceneObjectScriptTargets();
    refreshRoomScriptTargets();
    refreshCharacterScriptTargets();
    refreshInventoryScriptTargets();
    try { refreshGuiScriptTargets(); } catch(_) {}
    try { refreshHotspotScriptTargets(); } catch(_) {}
    try { refreshCursorScriptTargets(); } catch(_) {}
    
    showNotification(`Script "${scriptName}" deleted`, 'success');
  };

  window.stopScript = function() {
    // Non serve piÃ¹ fermare script singoli, ma possiamo pulire lo stato se necessario
    showNotification('Script execution stopped', 'info');
  };

  window.loadScript = function(scriptName) {
    if (!scriptName) return;
    
    saveCurrentScriptIfNeeded();
    
    const canonicalName = migrateLegacyScriptKey(String(scriptName));
    const scriptExists = jsScripts.has(canonicalName) || (() => {
      try { return localStorage.getItem(`script-${canonicalName}`) != null; } catch (_) { return false; }
    })();
    if (scriptExists) {
      const savedScript = getScriptContent(canonicalName);
      ensureLargeScriptEditor();
      ensureScriptEditor();
      currentScriptName = canonicalName;
      if (largeCodeMirrorEditor) {
        largeCodeMirrorEditor.setValue(savedScript);
        // Refresh per assicurarsi che l'editor si aggiorni visivamente
        setTimeout(() => {
          if (largeCodeMirrorEditor && typeof largeCodeMirrorEditor.refresh === 'function') {
            largeCodeMirrorEditor.refresh();
          }
        }, 0);
      }
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue(savedScript);
        // Refresh per assicurarsi che l'editor si aggiorni visivamente
        setTimeout(() => {
          if (codeMirrorEditor && typeof codeMirrorEditor.refresh === 'function') {
            codeMirrorEditor.refresh();
          }
        }, 0);
      } else {
        const taSmall = document.getElementById('script-editor');
        if (taSmall) taSmall.value = savedScript;
      }
      showNotification(`Script "${scriptName}" loaded!`, 'info');
    } else {
      showNotification(`Script "${scriptName}" not found!`, 'warning');
    }
  };

  // ============================================
  // GAME VARIABLES UI MANAGEMENT
  // ============================================
  
  function refreshVariablesList() {
    const list = document.getElementById('variables-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (gameVariableDefinitions.length === 0) {
      list.innerHTML = '<div class="text-muted text-center py-3"><small>No variables defined. Click "+ Add Variable" to create one.</small></div>';
      return;
    }
    
    gameVariableDefinitions.forEach((varDef, index) => {
      const item = document.createElement('div');
      item.className = 'list-group-item bg-secondary text-light mb-2';
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <strong>${varDef.name}</strong>
            <span class="badge bg-info ms-2">${varDef.type}</span>
            <br><small class="text-muted">Initial: ${JSON.stringify(varDef.initialValue)}</small>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-light" onclick="editGameVariable(${index})" title="Edit">Edit</button>
            <button class="btn btn-outline-danger" onclick="deleteGameVariable(${index})" title="Delete">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  }
  
  window.addGameVariable = function() {
    const name = prompt('Variable name:');
    if (!name || !name.trim()) return;
    
    const trimmedName = name.trim();
    if (gameVariableDefinitions.find(v => v.name === trimmedName)) {
      showNotification(`Variable "${trimmedName}" already exists`, 'warning');
      return;
    }
    
    const type = prompt('Variable type (boolean/number/string):', 'boolean');
    if (!['boolean', 'number', 'string'].includes(type)) {
      showNotification('Invalid type. Must be boolean, number, or string', 'warning');
      return;
    }
    
    let initialValue;
    if (type === 'boolean') {
      initialValue = false;
    } else if (type === 'number') {
      const num = prompt('Initial value (number):', '0');
      initialValue = Number(num) || 0;
    } else {
      initialValue = prompt('Initial value (string):', '');
    }
    
    gameVariableDefinitions.push({
      name: trimmedName,
      type: type,
      initialValue: initialValue
    });
    
    // Inizializza la variabile nello stato se non esiste
    if (!Game.hasVar(trimmedName)) {
      Game.setVar(trimmedName, initialValue);
    }
    
    refreshVariablesList();
    showNotification(`Variable "${trimmedName}" added`, 'success');
  };
  
  window.editGameVariable = function(index) {
    if (index < 0 || index >= gameVariableDefinitions.length) return;
    
    const varDef = gameVariableDefinitions[index];
    const newName = prompt('Variable name:', varDef.name);
    if (!newName || !newName.trim()) return;
    
    const trimmedName = newName.trim();
    if (trimmedName !== varDef.name && gameVariableDefinitions.find(v => v.name === trimmedName)) {
      showNotification(`Variable "${trimmedName}" already exists`, 'warning');
      return;
    }
    
    const type = prompt('Variable type (boolean/number/string):', varDef.type);
    if (!['boolean', 'number', 'string'].includes(type)) {
      showNotification('Invalid type. Must be boolean, number, or string', 'warning');
      return;
    }
    
    let initialValue = varDef.initialValue;
    if (type === 'boolean') {
      initialValue = confirm('Initial value (OK = true, Cancel = false):') ? true : false;
    } else if (type === 'number') {
      const num = prompt('Initial value (number):', String(initialValue));
      initialValue = Number(num) || 0;
    } else {
      initialValue = prompt('Initial value (string):', String(initialValue));
    }
    
    // Aggiorna definizione
    varDef.name = trimmedName;
    varDef.type = type;
    varDef.initialValue = initialValue;
    
    // Aggiorna valore nello stato se esiste
    if (Game.hasVar(varDef.name)) {
      Game.setVar(trimmedName, initialValue);
    }
    
    refreshVariablesList();
    showNotification(`Variable "${trimmedName}" updated`, 'success');
  };
  
  window.deleteGameVariable = function(index) {
    if (index < 0 || index >= gameVariableDefinitions.length) return;
    
    const varDef = gameVariableDefinitions[index];
    if (!confirm(`Delete variable "${varDef.name}"?`)) return;
    
    gameVariableDefinitions.splice(index, 1);
    refreshVariablesList();
    showNotification(`Variable "${varDef.name}" deleted`, 'info');
  };

  // ============================================
  // DIALOGUES EDITOR (form + visual graph)
  // ============================================
  let selectedDialogueId = null;
  let dialogueSearchQuery = '';

  function getSelectedDialogue() {
    const list = Array.isArray(window.projectDialogues) ? window.projectDialogues : [];
    if (!selectedDialogueId) return null;
    return list.find(d => d.id === selectedDialogueId) || null;
  }

  function uidDialogue(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function escapeHtmlAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function syncDialogueGraphEditor() {
    const GE = window.AmiantoDialogueGraphEditor;
    if (!GE) return;
    if (typeof GE.setDialogue === 'function') {
      GE.setDialogue(selectedDialogueId);
    }
    if (typeof GE.getMode === 'function' && GE.getMode() === 'visual' && typeof GE.refresh === 'function') {
      GE.refresh();
    }
  }

  function renderDialogueSidebarList() {
    const box = document.getElementById('dialogue-sidebar-list');
    if (!box) return;
    const list = Array.isArray(window.projectDialogues) ? window.projectDialogues : [];
    const q = String(dialogueSearchQuery || '').trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter(d => {
          const name = String(d.name || '').toLowerCase();
          const id = String(d.id || '').toLowerCase();
          return name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
        });
    if (!filtered.length) {
      box.innerHTML = '<div class="text-muted small px-1">No matches</div>';
      return;
    }
    box.innerHTML = filtered.map(d => {
      const active = d.id === selectedDialogueId ? ' is-active' : '';
      return `<div class="dlg-sidebar-item${active}" data-dlg-id="${escapeHtmlAttr(d.id)}" title="${escapeHtmlAttr(d.id)}">
        <span>${escapeHtmlAttr(d.name || d.id)}</span>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-dlg-id]').forEach(el => {
      el.addEventListener('click', () => {
        selectedDialogueId = el.getAttribute('data-dlg-id');
        const select = document.getElementById('dialogue-select');
        if (select) select.value = selectedDialogueId;
        renderDialoguesEditor();
      });
    });
  }

  window.onDialogueSearchInput = function() {
    const input = document.getElementById('dialogue-search');
    dialogueSearchQuery = input ? input.value : '';
    renderDialogueSidebarList();
  };

  window.setDialogueEditorMode = function(mode) {
    const GE = window.AmiantoDialogueGraphEditor;
    const m = mode === 'visual' ? 'visual' : 'form';
    if (GE && typeof GE.setMode === 'function') {
      GE.setMode(m);
    }
    // Keep sidebar list in sync; form body visibility handled by graph editor + below
    const formMode = document.getElementById('dialogue-form-mode');
    if (m === 'form' && formMode) formMode.style.display = '';
    renderDialoguesEditor();
  };

  window.validateActiveDialogue = function() {
    const dlg = getSelectedDialogue();
    const V = window.AmiantoDialogueValidate;
    if (!dlg) {
      showNotification('No dialogue selected', 'warning');
      return;
    }
    if (!V || typeof V.validateDialogue !== 'function') {
      showNotification('Validator not loaded', 'warning');
      return;
    }
    const res = V.validateDialogue(dlg, window.AmiantoDialogueLogic);
    const ec = (res.errors || []).length;
    const wc = (res.warnings || []).length;
    if (window.AmiantoDialogueGraphEditor && window.AmiantoDialogueGraphEditor.getMode() === 'visual') {
      window.AmiantoDialogueGraphEditor.validate();
    }
    showNotification(
      ec ? `Dialogue: ${ec} error(s), ${wc} warning(s)` : `Dialogue OK (${wc} warning(s))`,
      ec ? 'warning' : 'success'
    );
  };

  window.duplicateProjectDialogue = function() {
    const dlg = getSelectedDialogue();
    if (!dlg) return;
    const copy = JSON.parse(JSON.stringify(dlg));
    copy.id = uidDialogue('dlg');
    copy.name = (dlg.name || dlg.id) + ' (copy)';
    // Remap node ids to keep once-only keys distinct for the new dialogue asset
    const idMap = {};
    const nodes = copy.nodes || {};
    Object.keys(nodes).forEach(oldId => {
      const n = nodes[oldId];
      const prefix = n.type === 'line' ? 'ln' : n.type === 'choice' ? 'ch' : n.type === 'jump' ? 'jmp' : n.type === 'action' ? 'act' : 'end';
      idMap[oldId] = uidDialogue(prefix);
    });
    const newNodes = {};
    Object.keys(nodes).forEach(oldId => {
      const n = nodes[oldId];
      const nid = idMap[oldId];
      n.id = nid;
      if (n.next && idMap[n.next]) n.next = idMap[n.next];
      if (n.target && idMap[n.target]) n.target = idMap[n.target];
      if (Array.isArray(n.options)) {
        n.options.forEach(opt => {
          if (opt) {
            opt.id = uidDialogue('opt');
            if (opt.next && idMap[opt.next]) opt.next = idMap[opt.next];
          }
        });
      }
      newNodes[nid] = n;
    });
    copy.nodes = newNodes;
    if (copy.startNodeId && idMap[copy.startNodeId]) {
      copy.startNodeId = idMap[copy.startNodeId];
    }
    if (!Array.isArray(window.projectDialogues)) window.projectDialogues = [];
    window.projectDialogues.push(copy);
    selectedDialogueId = copy.id;
    markDialoguesDirty();
    renderDialoguesEditor();
    showNotification(`Dialogue duplicated as "${copy.name}"`, 'success');
  };

  window.renderDialoguesEditor = function renderDialoguesEditor() {
    const list = Array.isArray(window.projectDialogues) ? window.projectDialogues : [];
    const select = document.getElementById('dialogue-select');
    const body = document.getElementById('dialogue-editor-body');
    const empty = document.getElementById('dialogue-editor-empty');
    if (!select) return;

    if (!selectedDialogueId || !list.some(d => d.id === selectedDialogueId)) {
      selectedDialogueId = list.length ? list[0].id : null;
    }

    select.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(none)';
      select.appendChild(opt);
      if (body) body.style.display = 'none';
      if (empty) empty.style.display = 'block';
      renderDialogueSidebarList();
      syncDialogueGraphEditor();
      return;
    }

    if (empty) empty.style.display = 'none';
    if (body) body.style.display = 'block';

    list.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name || d.id} (${d.id})`;
      if (d.id === selectedDialogueId) opt.selected = true;
      select.appendChild(opt);
    });

    const dlg = getSelectedDialogue();
    const startInput = document.getElementById('dialogue-start-node');
    if (startInput) startInput.value = dlg ? (dlg.startNodeId || '') : '';

    const GE = window.AmiantoDialogueGraphEditor;
    const visual = GE && typeof GE.getMode === 'function' && GE.getMode() === 'visual';
    const formMode = document.getElementById('dialogue-form-mode');
    if (formMode) formMode.style.display = visual ? 'none' : '';

    if (!visual) {
      renderDialogueNodesList();
    }
    renderDialogueSidebarList();
    syncDialogueGraphEditor();
  };

  function renderDialogueNodesList() {
    const container = document.getElementById('dialogue-nodes-list');
    if (!container) return;
    const dlg = getSelectedDialogue();
    container.innerHTML = '';
    if (!dlg) return;

    const nodes = dlg.nodes || {};
    const ids = Object.keys(nodes);
    if (!ids.length) {
      container.innerHTML = '<div class="text-muted text-center py-2"><small>No nodes. Add Line, Choice, Jump, Action, or End.</small></div>';
      return;
    }

    ids.forEach(nid => {
      const node = nodes[nid];
      const card = document.createElement('div');
      card.className = 'mb-2 p-2';
      card.style.cssText = 'background:#222;border:1px solid #444;border-radius:6px;';

      const typeBadge = String(node.type || 'end');
      let fields = `
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span><code style="color:#39ff14">${escapeHtmlAttr(node.id)}</code>
            <span class="badge bg-secondary ms-1">${escapeHtmlAttr(typeBadge)}</span>
            ${dlg.startNodeId === node.id ? '<span class="badge bg-success ms-1">start</span>' : ''}
          </span>
          <button type="button" class="btn btn-outline-danger btn-sm" data-del-node="${escapeHtmlAttr(node.id)}">Del</button>
        </div>`;

      if (node.type === 'line') {
        fields += `
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Speaker (character name/id)</label>
          <input type="text" class="form-control form-control-sm mb-1" data-dlg-field="speaker" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.speaker || '')}" />
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Text</label>
          <textarea class="form-control form-control-sm mb-1" rows="2" data-dlg-field="text" data-node="${escapeHtmlAttr(node.id)}">${escapeHtmlAttr(node.text || '')}</textarea>
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Mood (optional)</label>
          <input type="text" class="form-control form-control-sm mb-1" data-dlg-field="mood" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.mood || '')}" placeholder="happy / default / …" />
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Portrait (optional override)</label>
          <div class="d-flex gap-1 mb-1 align-items-start">
            <input type="text" class="form-control form-control-sm" data-dlg-field="portrait" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.portrait || '')}" placeholder="Browse… or paste URL" />
            <button type="button" class="btn btn-outline-info btn-sm text-nowrap" data-dlg-portrait-pick="${escapeHtmlAttr(node.id)}">Browse…</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-dlg-portrait-clear="${escapeHtmlAttr(node.id)}" title="Clear">×</button>
          </div>
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Next node ID</label>
          <input type="text" class="form-control form-control-sm mb-1" data-dlg-field="next" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.next || '')}" />
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Actions JSON (optional)</label>
          <input type="text" class="form-control form-control-sm" data-dlg-field-json="actions" data-node="${escapeHtmlAttr(node.id)}" placeholder='[{"type":"set_var","key":"met_npc","value":true}]' value="${escapeHtmlAttr(dialogueActionsToEditorString(node.actions))}" />`;
      } else if (node.type === 'choice') {
        const opts = Array.isArray(node.options) ? node.options : [];
        fields += `<div class="mb-1" data-choice-opts="${escapeHtmlAttr(node.id)}">`;
        opts.forEach((opt, oi) => {
          fields += `
            <div class="border border-secondary rounded p-1 mb-1" data-opt-index="${oi}">
              <div class="d-flex justify-content-between mb-1">
                <small class="text-muted">Option ${oi + 1} <code style="color:#888">${escapeHtmlAttr(opt.id || '')}</code></small>
                <button type="button" class="btn btn-outline-danger btn-sm py-0" data-del-opt="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}">×</button>
              </div>
              <input type="text" class="form-control form-control-sm mb-1" placeholder="Choice text" data-dlg-opt="text" data-node="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}" value="${escapeHtmlAttr(opt.text || '')}" />
              <input type="text" class="form-control form-control-sm mb-1" placeholder="Next node ID" data-dlg-opt="next" data-node="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}" value="${escapeHtmlAttr(opt.next || '')}" />
              <label class="form-check form-check-inline mb-1" style="font-size:0.8em;color:#ccc;">
                <input type="checkbox" class="form-check-input" data-dlg-opt-once="1" data-node="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}" ${opt.once ? 'checked' : ''} />
                Once only
              </label>
              <input type="text" class="form-control form-control-sm mb-1" placeholder='Condition JSON e.g. {"type":"has_item","itemId":"key"}' data-dlg-opt-json="condition" data-node="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}" value="${escapeHtmlAttr(dialogueConditionToEditorString(opt.condition))}" />
              <input type="text" class="form-control form-control-sm" placeholder='Actions JSON (optional)' data-dlg-opt-json="actions" data-node="${escapeHtmlAttr(node.id)}" data-opt-index="${oi}" value="${escapeHtmlAttr(dialogueActionsToEditorString(opt.actions))}" />
            </div>`;
        });
        fields += `</div>
          <button type="button" class="btn btn-outline-success btn-sm" data-add-opt="${escapeHtmlAttr(node.id)}">+ Option</button>`;
      } else if (node.type === 'jump') {
        fields += `
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Target node ID</label>
          <input type="text" class="form-control form-control-sm" data-dlg-field="target" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.target || '')}" />`;
      } else if (node.type === 'action') {
        fields += `
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Actions JSON</label>
          <input type="text" class="form-control form-control-sm mb-1" data-dlg-field-json="actions" data-node="${escapeHtmlAttr(node.id)}" placeholder='[{"type":"run_script","code":"function on_dialogue_action(d,n,o){print(d);}"}]' value="${escapeHtmlAttr(dialogueActionsToEditorString(node.actions))}" />
          <label class="form-label text-muted mb-0" style="font-size:0.75em">Next node ID</label>
          <input type="text" class="form-control form-control-sm" data-dlg-field="next" data-node="${escapeHtmlAttr(node.id)}" value="${escapeHtmlAttr(node.next || '')}" />`;
      } else {
        fields += `<small class="text-muted">Ends the dialogue session.</small>`;
      }

      card.innerHTML = fields;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-dlg-field]').forEach(el => {
      el.addEventListener('change', () => {
        const nodeId = el.getAttribute('data-node');
        const field = el.getAttribute('data-dlg-field');
        const n = dlg.nodes[nodeId];
        if (!n) return;
        const val = el.value;
        if ((field === 'mood' || field === 'portrait') && !String(val || '').trim()) {
          delete n[field];
        } else {
          n[field] = val;
        }
        markDialoguesDirty();
      });
    });
    container.querySelectorAll('[data-dlg-portrait-pick]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nodeId = btn.getAttribute('data-dlg-portrait-pick');
        const n = dlg.nodes[nodeId];
        if (!n) return;
        const resource = await pickResourceImage({ title: 'Dialogue portrait' });
        if (!resource) return;
        let src = resource.publicUrl || '';
        try {
          const img = await loadImageFromResourceEntry(resource);
          if (img && img.src) src = img.src;
        } catch (_) { /* keep publicUrl */ }
        if (!src) {
          showNotification('Could not load portrait image', 'warning');
          return;
        }
        n.portrait = src;
        markDialoguesDirty();
        renderDialogueNodesList();
      });
    });
    container.querySelectorAll('[data-dlg-portrait-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = btn.getAttribute('data-dlg-portrait-clear');
        const n = dlg.nodes[nodeId];
        if (!n) return;
        delete n.portrait;
        markDialoguesDirty();
        renderDialogueNodesList();
      });
    });
    container.querySelectorAll('[data-dlg-field-json]').forEach(el => {
      el.addEventListener('change', () => {
        const nodeId = el.getAttribute('data-node');
        const field = el.getAttribute('data-dlg-field-json');
        const n = dlg.nodes[nodeId];
        if (!n) return;
        if (field === 'actions') {
          const parsed = parseDialogueActionsFromEditor(el.value);
          if (parsed) n.actions = parsed;
          else delete n.actions;
        }
        markDialoguesDirty();
      });
    });
    container.querySelectorAll('[data-dlg-opt]').forEach(el => {
      el.addEventListener('change', () => {
        const nodeId = el.getAttribute('data-node');
        const field = el.getAttribute('data-dlg-opt');
        const oi = Number(el.getAttribute('data-opt-index'));
        const n = dlg.nodes[nodeId];
        if (!n || !Array.isArray(n.options) || !n.options[oi]) return;
        n.options[oi][field] = el.value;
        markDialoguesDirty();
      });
    });
    container.querySelectorAll('[data-dlg-opt-once]').forEach(el => {
      el.addEventListener('change', () => {
        const nodeId = el.getAttribute('data-node');
        const oi = Number(el.getAttribute('data-opt-index'));
        const n = dlg.nodes[nodeId];
        if (!n || !Array.isArray(n.options) || !n.options[oi]) return;
        if (el.checked) n.options[oi].once = true;
        else delete n.options[oi].once;
        markDialoguesDirty();
      });
    });
    container.querySelectorAll('[data-dlg-opt-json]').forEach(el => {
      el.addEventListener('change', () => {
        const nodeId = el.getAttribute('data-node');
        const field = el.getAttribute('data-dlg-opt-json');
        const oi = Number(el.getAttribute('data-opt-index'));
        const n = dlg.nodes[nodeId];
        if (!n || !Array.isArray(n.options) || !n.options[oi]) return;
        if (field === 'condition') {
          const parsed = parseDialogueConditionFromEditor(el.value);
          if (parsed) n.options[oi].condition = parsed;
          else delete n.options[oi].condition;
        } else if (field === 'actions') {
          const parsed = parseDialogueActionsFromEditor(el.value);
          if (parsed) n.options[oi].actions = parsed;
          else delete n.options[oi].actions;
        }
        markDialoguesDirty();
      });
    });
    container.querySelectorAll('[data-del-node]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = btn.getAttribute('data-del-node');
        if (!nodeId || !dlg.nodes[nodeId]) return;
        if (!confirm(`Delete node "${nodeId}"?`)) return;
        delete dlg.nodes[nodeId];
        if (dlg.startNodeId === nodeId) {
          const keys = Object.keys(dlg.nodes);
          dlg.startNodeId = keys[0] || '';
        }
        markDialoguesDirty();
        renderDialoguesEditor();
      });
    });
    container.querySelectorAll('[data-add-opt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = btn.getAttribute('data-add-opt');
        const n = dlg.nodes[nodeId];
        if (!n || n.type !== 'choice') return;
        if (!Array.isArray(n.options)) n.options = [];
        n.options.push({ id: uidDialogue('opt'), text: 'New choice', next: '' });
        markDialoguesDirty();
        renderDialogueNodesList();
      });
    });
    container.querySelectorAll('[data-del-opt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = btn.getAttribute('data-del-opt');
        const oi = Number(btn.getAttribute('data-opt-index'));
        const n = dlg.nodes[nodeId];
        if (!n || !Array.isArray(n.options)) return;
        n.options.splice(oi, 1);
        markDialoguesDirty();
        renderDialogueNodesList();
      });
    });
  }

  window.onDialogueSelectChange = function() {
    const select = document.getElementById('dialogue-select');
    selectedDialogueId = select && select.value ? select.value : null;
    renderDialoguesEditor();
  };

  window.onDialogueStartNodeChange = function() {
    const dlg = getSelectedDialogue();
    const input = document.getElementById('dialogue-start-node');
    if (!dlg || !input) return;
    dlg.startNodeId = String(input.value || '').trim();
    markDialoguesDirty();
    renderDialogueNodesList();
  };

  window.addProjectDialogue = function() {
    const name = prompt('Dialogue name:', 'New Dialogue');
    if (!name || !name.trim()) return;
    const id = uidDialogue('dlg');
    const endId = 'n_end';
    const lineId = 'n1';
    const choiceId = 'n2';
    const lineOutA = 'n3';
    const dialogue = {
      id,
      name: name.trim(),
      startNodeId: lineId,
      nodes: {
        [lineId]: { id: lineId, type: 'line', speaker: 'NPC', text: 'Hello!', next: choiceId },
        [choiceId]: {
          id: choiceId,
          type: 'choice',
          options: [
            { id: 'opt_a', text: 'Tell me more.', next: lineOutA },
            { id: 'opt_b', text: 'Goodbye.', next: endId }
          ]
        },
        [lineOutA]: { id: lineOutA, type: 'line', speaker: 'NPC', text: 'There is nothing more to say.', next: endId },
        [endId]: { id: endId, type: 'end' }
      }
    };
    if (!Array.isArray(window.projectDialogues)) window.projectDialogues = [];
    window.projectDialogues.push(dialogue);
    selectedDialogueId = id;
    markDialoguesDirty();
    renderDialoguesEditor();
    showNotification(`Dialogue "${dialogue.name}" created — use start_dialogue("${dialogue.name}")`, 'success');
  };

  window.renameProjectDialogue = function() {
    const dlg = getSelectedDialogue();
    if (!dlg) return;
    const name = prompt('Dialogue name:', dlg.name || dlg.id);
    if (!name || !name.trim()) return;
    dlg.name = name.trim();
    markDialoguesDirty();
    renderDialoguesEditor();
  };

  window.deleteProjectDialogue = function() {
    const dlg = getSelectedDialogue();
    if (!dlg) return;
    if (!confirm(`Delete dialogue "${dlg.name || dlg.id}"?`)) return;
    window.projectDialogues = (window.projectDialogues || []).filter(d => d.id !== dlg.id);
    selectedDialogueId = null;
    markDialoguesDirty();
    renderDialoguesEditor();
    showNotification('Dialogue deleted', 'info');
  };

  window.addDialogueNode = function(type) {
    const dlg = getSelectedDialogue();
    if (!dlg) return;
    if (!dlg.nodes) dlg.nodes = {};
    const t = String(type || 'end').toLowerCase();
    let id;
    if (t === 'line') {
      id = uidDialogue('ln');
      dlg.nodes[id] = { id, type: 'line', speaker: '', text: '', next: '' };
    } else if (t === 'choice') {
      id = uidDialogue('ch');
      dlg.nodes[id] = {
        id,
        type: 'choice',
        options: [
          { id: uidDialogue('opt'), text: 'Option A', next: '' },
          { id: uidDialogue('opt'), text: 'Option B', next: '' }
        ]
      };
    } else if (t === 'jump') {
      id = uidDialogue('jmp');
      dlg.nodes[id] = { id, type: 'jump', target: '' };
    } else if (t === 'action') {
      id = uidDialogue('act');
      dlg.nodes[id] = { id, type: 'action', next: '', actions: [] };
    } else {
      id = uidDialogue('end');
      dlg.nodes[id] = { id, type: 'end' };
    }
    if (!dlg.startNodeId) dlg.startNodeId = id;
    markDialoguesDirty();
    renderDialoguesEditor();
  };
  
  // Refresh variables/dialogues list quando si carica la sezione Scripts
  document.addEventListener('tabChanged', function(e) {
    if (e.detail.currentTab === 'scripts') {
      refreshVariablesList();
      if (typeof window.renderDialoguesEditor === 'function') {
        window.renderDialoguesEditor();
      }
    }
  });

  // Attach a script to a scene object
  function refreshSceneObjectScriptTargets() {
    const sel = document.getElementById('scene-object-script-target');
    if (!sel) return;
    sel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = 'Select scene object...';
    sel.appendChild(optNone);
    sceneObjects.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name || o.id}`;
      sel.appendChild(opt);
    });
  }

  function refreshRoomScriptTargets() {
    const sel = document.getElementById('room-script-target');
    if (!sel) return;
    sel.innerHTML = '';
    rooms.forEach((room) => {
      const opt = document.createElement('option');
      opt.value = room.id;
      opt.textContent = room.name || room.id;
      if (room.id === currentRoomId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function refreshCharacterScriptTargets() {
    const sel = document.getElementById('character-script-target');
    if (!sel) return;
    sel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = 'Select character...';
    sel.appendChild(optNone);
    document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => {
      const name = s.textContent.trim();
      const o = document.createElement('option');
      o.value = name; o.textContent = name; sel.appendChild(o);
    });
  }

  function refreshInventoryScriptTargets() {
    const sel = document.getElementById('inventory-script-target');
    if (!sel) return;
    sel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = 'Select inventory item...';
    sel.appendChild(optNone);
    inventoryItems.forEach(item => {
      const o = document.createElement('option');
      o.value = item.name;
      o.textContent = item.name;
      sel.appendChild(o);
    });
  }

  // When adding a scene object, refresh dropdown
  const _origUploadSceneObject = window.uploadSceneObject;
  window.uploadSceneObject = function(input) {
    _origUploadSceneObject(input);
    setTimeout(() => {
      refreshSceneObjectScriptTargets();
      updateCursorTargets();
    }, 0);
  }

  // Hook edit to keep dropdown fresh if renamed
  const _origEditSceneObject = window.editSceneObject;
  window.editSceneObject = function(button){
    _origEditSceneObject(button);
    setTimeout(() => {
      refreshSceneObjectScriptTargets();
      updateCursorTargets();
    }, 0);
  }

  // Aggiorna target quando cambiano stanze/characters/inventory
  document.addEventListener('tabChanged', (e) => {
    if (e.detail.currentTab === 'rooms') {
      setTimeout(() => { refreshRoomScriptTargets(); refreshSceneObjectScriptTargets(); updateCursorTargets(); }, 0);
    }
    if (e.detail.currentTab === 'characters') {
      setTimeout(() => { refreshCharacterScriptTargets(); updateCursorTargets(); }, 0);
    }
    if (e.detail.currentTab === 'inventory') {
      setTimeout(() => { refreshInventoryScriptTargets(); refreshInventoryItemsListUI(); refreshInventorySlotsListUI(); updateCursorTargets(); redraw(); }, 0);
    }
    if (e.detail.currentTab === 'gui') {
      setTimeout(() => { refreshGuiButtonsList(); refreshGuiScriptTargets(); updateCursorTargets(); }, 0);
    }
    if (e.detail.currentTab === 'scripts') {
      setTimeout(() => { refreshHotspotScriptTargets(); refreshCursorScriptTargets(); }, 0);
    }
  });

  // Attach helpers
  window.attachScriptToSceneObject = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = selector.value;
    const targetSel = document.getElementById('scene-object-script-target');
    const objId = targetSel.value;
    if (!scriptName || !objId) { showNotification('Select a script and a scene object', 'warning'); return; }
    objectScripts.set(objId, scriptName);
    showNotification(`Attached script "${scriptName}" to scene object`, 'success');
  };

  window.attachScriptToRoom = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = selector.value;
    const targetSel = document.getElementById('room-script-target');
    const roomId = targetSel.value || currentRoomId;
    if (!scriptName || !roomId) { showNotification('Select a script and a room', 'warning'); return; }
    roomScripts.set(roomId, scriptName);
    showNotification(`Attached script "${scriptName}" to room`, 'success');
  };

  window.attachScriptToCharacter = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = selector.value;
    const targetSel = document.getElementById('character-script-target');
    const charName = targetSel.value;
    if (!scriptName || !charName) { showNotification('Select a script and a character', 'warning'); return; }
    characterScripts.set(charName, scriptName);
    showNotification(`Attached script "${scriptName}" to character`, 'success');
  };

  window.attachScriptToInventory = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = selector.value;
    const targetSel = document.getElementById('inventory-script-target');
    const itemName = targetSel.value;
    if (!scriptName || !itemName) { showNotification('Select a script and an inventory item', 'warning'); return; }
    inventoryScripts.set(itemName, scriptName);
    showNotification(`Attached script "${scriptName}" to inventory item`, 'success');
  };

  // GUI attach support
  const guiScripts = new Map(); // guiButtonId -> scriptName
  function refreshHotspotScriptTargets() {
    const sel = document.getElementById('script-target');
    if (!sel) return;

    // Update only when Hotspot scope is active
    const scopeSel = document.getElementById('script-scope');
    if (scopeSel && scopeSel.value !== 'Hotspot') return;
    
    // Add hotspot options if not already present
    const existingHotspotOptions = sel.querySelectorAll('option[value^="hotspot:"]');
    if (existingHotspotOptions.length === 0) {
      hotspots.forEach(hs => {
        const opt = document.createElement('option');
        opt.value = `hotspot:${hs.id}`;
        opt.textContent = `Hotspot: ${hs.name || 'Unnamed'}`;
        sel.appendChild(opt);
      });
    } else {
      // Update existing options
      hotspots.forEach(hs => {
        const existingOpt = sel.querySelector(`option[value="hotspot:${hs.id}"]`);
        if (existingOpt) {
          existingOpt.textContent = `Hotspot: ${hs.name || 'Unnamed'}`;
        } else {
          const opt = document.createElement('option');
          opt.value = `hotspot:${hs.id}`;
          opt.textContent = `Hotspot: ${hs.name || 'Unnamed'}`;
          sel.appendChild(opt);
        }
      });
    }
  }
  
  function refreshGuiScriptTargets() {
    const sel = document.getElementById('gui-script-target');
    if (!sel) return;
    sel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = 'Select GUI button...';
    sel.appendChild(optNone);
    guiButtons.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.name; sel.appendChild(o);
    });
  }

  function refreshScriptSelector() {
    const selector = document.getElementById('script-selector');
    if (!selector) return;
    
    // Salva il valore corrente per ripristinarlo dopo
    const currentValue = selector.value;
    
    // Pulisci il selector mantenendo solo il placeholder
    selector.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = 'Select a script...';
    selector.appendChild(opt0);
    
    // Raccogli tutti gli script da jsScripts
    const scriptNames = Array.from(jsScripts.keys()).filter(name => name && name.trim());
    
    // Ordina gli script per nome
    scriptNames.sort();
    
    // Aggiungi ogni script al selector
    scriptNames.forEach(name => {
      const o = document.createElement('option');
      o.value = name;
      // Formatta il nome per la visualizzazione (es: "Room:room1" -> "Room: room1")
      const displayName = name.includes(':') ? name.replace(':', ': ') : name;
      o.textContent = displayName;
      selector.appendChild(o);
    });
    
    // Ripristina il valore precedente se esiste ancora
    if (currentValue && scriptNames.includes(currentValue)) {
      selector.value = currentValue;
    }
  }

  window.attachScriptToGUI = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = selector.value;
    const targetSel = document.getElementById('gui-script-target');
    const btnId = targetSel.value;
    if (!scriptName || !btnId) { showNotification('Select a script and a GUI button', 'warning'); return; }
    guiScripts.set(btnId, scriptName);
    showNotification(`Attached script "${scriptName}" to GUI button`, 'success');
  };

  window.attachScriptToHotspot = function() {
    const selector = document.getElementById('script-selector');
    const scriptName = migrateLegacyScriptKey(selector.value);
    const targetSel = document.getElementById('script-target');
    const targetValue = targetSel.value;
    
    if (!scriptName || !targetValue) { 
      showNotification('Select a script and a hotspot', 'warning'); 
      return; 
    }
    
    if (!targetValue.startsWith('hotspot:')) {
      showNotification('Please select a hotspot target', 'warning');
      return;
    }
    
    const hotspotId = targetValue.replace('hotspot:', '');
    
    // âš ï¸ NUOVA STRUTTURA: Salva script direttamente nell'hotspot
    const hotspot = hotspots.find(h => h.id === hotspotId);
    if (!hotspot) {
      showNotification('Hotspot not found', 'error');
      return;
    }
    
    const scriptContent = getScriptContent(migrateLegacyScriptKey(scriptName));
    
    // DEBUG: Verifica che il contenuto dello script sia disponibile
    if (!scriptContent || scriptContent.trim() === '') {
      console.warn(`[attachScriptToHotspot] Script "${scriptName}" Ã¨ vuoto o non trovato!`);
      showNotification(`Script "${scriptName}" is empty or not found`, 'warning');
      return;
    }
    
    console.log(`[attachScriptToHotspot] Associazione script a hotspot:`, {
      hotspotId: hotspotId,
      scriptName: scriptName,
      codeLength: scriptContent.length,
      codePreview: scriptContent.substring(0, 50)
    });
    
    // Inizializza struttura scripts se non esiste
    if (!hotspot.scripts) {
      hotspot.scripts = {};
    }
    
    syncHotspotScriptToAllRooms(hotspotId, scriptContent, scriptName);
    jsScripts.set(scriptName, String(scriptContent));
    try { localStorage.setItem(`script-${scriptName}`, String(scriptContent)); } catch (_) {}
    if (typeof window.markAmiantoProjectDirty === 'function') window.markAmiantoProjectDirty();

    showNotification(`Attached script "${scriptName}" to hotspot`, 'success');
    
    // Aggiorna l'albero degli script per mostrare il nuovo script associato
    rebuildScriptsTree();
    
    redraw();
  };

  // On tab change to scripts, ensure editor exists and switch canvas/editor visibility
  function setMainWorkspaceMode(mode) {
    const canvasInfo = document.querySelector('.canvas-info');
    const canvasControls = document.querySelector('.canvas-controls');
    const canvasContainer = document.getElementById('canvasContainer');
    const codeEditorContainer = document.getElementById('codeEditorContainer');
    const resourcesMainPanel = document.getElementById('resourcesMainPanel');
    const docsMainPanel = document.getElementById('docsMainPanel');
    const dialogueGraphMainPanel = document.getElementById('dialogueGraphMainPanel');

    const showCanvas = mode === 'canvas';
    const showScripts = mode === 'scripts';
    const showResources = mode === 'resources';
    const showDocs = mode === 'docs';
    const showDialogues = mode === 'dialogues';

    if (canvasInfo) canvasInfo.style.display = showCanvas ? '' : 'none';
    if (canvasControls) canvasControls.style.display = showCanvas ? '' : 'none';
    if (canvasContainer) canvasContainer.style.display = showCanvas ? 'block' : 'none';
    if (codeEditorContainer) codeEditorContainer.style.display = showScripts ? 'flex' : 'none';
    if (resourcesMainPanel) resourcesMainPanel.style.display = showResources ? 'grid' : 'none';
    if (docsMainPanel) docsMainPanel.style.display = showDocs ? 'flex' : 'none';
    if (dialogueGraphMainPanel) {
      dialogueGraphMainPanel.style.display = showDialogues ? 'flex' : 'none';
      dialogueGraphMainPanel.classList.toggle('is-visible', showDialogues);
    }
  }
  window.setMainWorkspaceMode = setMainWorkspaceMode;

  document.addEventListener('tabChanged', function(e){
    if (e.detail.currentTab === 'scripts') {
      const GE = window.AmiantoDialogueGraphEditor;
      const visualDialogues = GE && typeof GE.getMode === 'function' && GE.getMode() === 'visual';
      setMainWorkspaceMode(visualDialogues ? 'dialogues' : 'scripts');
      // Applica lo stato salvato delle console log invece di forzare la visibilitÃ 
      if (window.applyConsoleLogVisibilityState) {
        window.applyConsoleLogVisibilityState();
      }
      ensureLargeScriptEditor();
      ensureScriptEditor();
      initScriptsUI();
      refreshScriptSelector();
      rebuildScriptsTree();
      // sync values small->large if small has content and large is empty
      if (codeMirrorEditor && largeCodeMirrorEditor && !largeCodeMirrorEditor.getValue()) {
        largeCodeMirrorEditor.setValue(codeMirrorEditor.getValue());
      }
      refreshSceneObjectScriptTargets();
      refreshRoomScriptTargets();
      refreshCharacterScriptTargets();
      refreshInventoryScriptTargets();
      if (typeof window.renderDialoguesEditor === 'function') {
        window.renderDialoguesEditor();
      }
      // Aggiorna le dimensioni di CodeMirror dopo che il container Ã¨ visibile
      setTimeout(() => {
        if (largeCodeMirrorEditor && typeof largeCodeMirrorEditor.refresh === 'function') {
          largeCodeMirrorEditor.refresh();
        }
      }, 100);
    } else if (e.detail.currentTab === 'resources') {
      setMainWorkspaceMode('resources');
      if (window.applyConsoleLogVisibilityState) {
        window.applyConsoleLogVisibilityState();
      }
    } else if (e.detail.currentTab === 'docs') {
      setMainWorkspaceMode('docs');
      if (window.amiantoDocs && typeof window.amiantoDocs.init === 'function') {
        window.amiantoDocs.init();
      }
      if (window.applyConsoleLogVisibilityState) {
        window.applyConsoleLogVisibilityState();
      }
    } else {
      setMainWorkspaceMode('canvas');
      // Applica lo stato salvato delle console log invece di forzare la visibilitÃ 
      if (window.applyConsoleLogVisibilityState) {
        window.applyConsoleLogVisibilityState();
      }
    }
  });

  // Function to show loading overlay with mnt.png
  /**
   * Mostra loader globale
   * RIFATTORIZZATA: Usa AppState.loading per gestire lo stato
   */
  function showLoadingOverlay(message = 'Loading...') {
    // Aggiorna AppState
    updateAppState({ loading: true });
    
    // Rimuovi eventuali overlay esistenti
    const existingOverlay = document.getElementById('syncLoadingOverlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'syncLoadingOverlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.85);
      z-index: 10060;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(5px);
    `;

    overlay.innerHTML = `
      <div style="text-align: center; color: #fff;">
        <img src="img/mnt.png" alt="Loading" style="max-width: 120px; max-height: 120px; width: auto; height: auto; object-fit: contain; margin-bottom: 20px; animation: pulse 2s ease-in-out infinite;">
        <div style="font-size: 18px; margin-bottom: 20px; color: #39ff14;">${message}</div>
        <div class="spinner-border text-success" role="status" style="width: 3rem; height: 3rem;">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      </style>
    `;

    document.body.appendChild(overlay);
  }

  // Function to hide loading overlay
  /**
   * Nascondi loader globale
   * RIFATTORIZZATA: Usa AppState.loading per gestire lo stato
   */
  function hideLoadingOverlay() {
    // Aggiorna AppState
    updateAppState({ loading: false });
    const overlay = document.getElementById('syncLoadingOverlay');
    if (overlay) {
      overlay.remove();
    }
  }
  window.showLoadingOverlay = showLoadingOverlay;
  window.hideLoadingOverlay = hideLoadingOverlay;

  // Function to close project selection modal deterministically
  function closeProjectModal() {
    const modal = document.getElementById('projectSelectionModal');
    if (!modal) return;
    
    // Rimuovi classe show
    modal.classList.remove('show');
    
    // Imposta display none
    modal.style.display = 'none';
    
    // Rimuovi modal-open dal body
    document.body.classList.remove('modal-open');
    
    // Rimuovi backdrop se presente
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.remove();
    }
    
    // Rimuovi padding-right dal body se presente
    document.body.style.paddingRight = '';
    
    // Rimuovi overflow hidden dal body se presente
    document.body.style.overflow = '';
    
    // Rimuovi il modale dal DOM
    modal.remove();
    
    console.log('[ProjectModal] Modale chiuso deterministicamente');
  }

  // Function to show notifications
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 10050; min-width: 300px;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Remove automatically after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  }

  // Support for Ctrl+S in script editors
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
      const activeElement = document.activeElement;
      const isEditorFocused = (activeElement && (activeElement.id === 'script-editor' || activeElement.id === 'script-editor-large'))
        || (largeCodeMirrorEditor && largeCodeMirrorEditor.hasFocus && largeCodeMirrorEditor.hasFocus())
        || (codeMirrorEditor && codeMirrorEditor.hasFocus && codeMirrorEditor.hasFocus());
      if (isEditorFocused) {
        e.preventDefault();
        saveScript();
      }
    }
  });

  // Event listener for tab change
  document.addEventListener('tabChanged', function(e) {
    console.log('Tab changed:', e.detail);
    
    // Assicurati che il loop di rendering del canvas embedded continui anche quando si cambia tab
    if (embeddedRuntime.isInitialized && embeddedRuntime.canvas && embeddedRuntime.ctx) {
      // Se il loop non Ã¨ attivo, riavvialo
      if (!embeddedRuntime.renderLoopId) {
        startEmbeddedRenderLoop();
      }
    }
    
    // Add specific logic for each tab
    switch(e.detail.currentTab) {
      case 'inventory':
        disableRoomCanvasEditing();
        refreshInventoryItemsListUI();
        refreshInventorySlotsListUI();
        redraw();
        break;
      case 'rooms':
        disableRoomCanvasEditing();
        refreshRoomAnimationInstancesListUI();
        refreshRoomAnimationPickerUI();
        redraw();
        break;
      case 'gui':
        disableRoomCanvasEditing();
        refreshGuiButtonsList();
        redraw();
        break;
      case 'cursors':
        disableRoomCanvasEditing();
        refreshCursorsList();
        redraw();
        break;
      case 'characters':
        disableRoomCanvasEditing();
        // ensure character selector refreshed and redraw preview
        refreshCharacterSelector();
        redraw();
        break;
      case 'animations':
        disableRoomCanvasEditing();
        refreshRoomAnimationsCatalogListUI();
        onRoomAnimationSelect();
        redraw();
        break;
      case 'scripts':
        // In scripts, we keep canvas idle but still clear it
        redraw();
        break;
    }
    // Ensure canvas is refreshed for any tab
    requestAnimationFrame(() => redraw());
  });

  // ============================================
  // RUNTIME SANDBOXED CON IFRAME
  // ============================================
  let embeddedRuntime = {
    canvas: null,
    ctx: null,
    gameData: null,
    currentRoomIndex: 0,
    loadedImagesCache: new Map(),
    sandboxIframe: null,
    isReady: false,
    pendingScripts: [],
    gameState: {
      currentRoomId: null,
      variables: new Map(),
      inventory: { contents: {}, carriedItemKey: null }
    },
    isInitialized: false,
    renderLoopId: null,
    lastRenderTime: 0
  };

  // Funzione helper per serializzare valori
  function serializeRuntimeValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return '[object Object]';
      }
    }
    return String(value);
  }

  // Funzione per inviare log al ScriptLogService
  function sendRuntimeLogToEditor(message, level = 'info') {
    if (window.ScriptLogService) {
      let mappedType = 'print';
      if (level === 'error') mappedType = 'error';
      else if (level === 'warning') mappedType = 'warning';
      ScriptLogService.log({ type: mappedType, message, source: 'runtime' });
    }
    // Anche nel debug console
    addDebugMessage(`[Runtime] ${message}`, level);
  }

  function getRuntimePageUrl() {
    // Cache-bust: altrimenti la finestra PLAY tiene il vecchio runtime.js e i fix non si applicano
    try {
      const u = new URL('runtime.html', window.location.href);
      u.searchParams.set('v', String(Date.now()));
      return u.href;
    } catch (_) {
      return 'runtime.html?v=' + Date.now();
    }
  }

  // ============================================
  // GESTIONE IFRAME SANDBOXED
  // ============================================
  
  // Crea l'iframe sandboxed per l'esecuzione degli script
  let sandboxMessageHandlerInstalled = false;

  function handleSandboxMessage(event) {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'RUNTIME_READY':
        if (!embeddedRuntime.isReady) {
          embeddedRuntime.isReady = true;
          sendRuntimeLogToEditor('Sandbox runtime ready and initialized', 'info');
          sendRuntimeLogToEditor(`Runtime initialized with ${embeddedRuntime.pendingScripts.length} pending script(s)`, 'info');
          updateSandboxContext();
          embeddedRuntime.pendingScripts.forEach(script => {
            executeScriptInSandbox(script.name, script.code, script.handler, script.args, script.context);
          });
          embeddedRuntime.pendingScripts = [];
        }
        break;

      case 'SCRIPT_LOG':
        if (window.ScriptLogService) {
          const level = message.level || 'info';
          let mappedType = 'print';
          if (level === 'error') mappedType = 'error';
          else if (level === 'warning') mappedType = 'warning';
          const timestamp = message.timestamp || Date.now();
          ScriptLogService.log({
            type: mappedType,
            message: message.message || '',
            source: 'runtime',
            timestamp: timestamp
          });
        } else {
          console.log('[Runtime Log]', message.message || '');
        }
        break;

      case 'SCRIPT_ERROR':
        sendRuntimeLogToEditor(`Script error: ${message.error || 'Unknown error'}`, 'error');
        if (window.ScriptLogService) {
          ScriptLogService.log({
            type: 'error',
            message: message.error || 'Unknown error',
            source: 'runtime',
            timestamp: message.timestamp || Date.now()
          });
        }
        break;

      case 'SCRIPT_DONE':
        break;

      case 'INVENTORY_STATE':
        if (message.inventory) {
          applyEditorInventorySnapshot(message.inventory);
          if (event.source !== playTestState.runtimeWindow) {
            pushPlaytestContextToRuntimeWindow();
          }
        }
        break;

      case 'PLAYTEST_RUNTIME_READY':
        pushPlaytestContextToRuntimeWindow();
        if (playTestState.pendingDialoguePreview) {
          const previewId = playTestState.pendingDialoguePreview;
          playTestState.pendingDialoguePreview = null;
          setTimeout(() => runDialoguePreviewInPlaytestWindow(previewId), 400);
        }
        break;

      case 'ROOM_CHANGE_REQUEST':
        sendRuntimeLogToEditor(`Script requested room change: ${message.roomId}`, 'info');
        break;

      default:
        break;
    }
  }

  function createSandboxIframe() {
    if (!sandboxMessageHandlerInstalled) {
      window.addEventListener('message', handleSandboxMessage);
      sandboxMessageHandlerInstalled = true;
    }

    if (embeddedRuntime.sandboxIframe) {
      try {
        embeddedRuntime.sandboxIframe.remove();
      } catch (e) {
        // ignore
      }
      embeddedRuntime.sandboxIframe = null;
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'sandbox-runtime-iframe';
    iframe.style.display = 'none';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.sandbox = 'allow-scripts allow-same-origin';

    let runtimeUrl;
    try {
      runtimeUrl = new URL('runtime-sandbox.html', window.location.href).href;
    } catch (_) {
      runtimeUrl = 'runtime-sandbox.html';
    }
    iframe.src = runtimeUrl;

    iframe.onerror = function(e) {
      sendRuntimeLogToEditor('Error loading sandbox iframe', 'error');
      console.error('[Sandbox] Iframe load error:', e);
    };

    iframe.onload = function() {
      sendRuntimeLogToEditor('Sandbox iframe loaded, waiting for initialization...', 'info');
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'SANDBOX_PING' }, '*');
        }
      } catch (_) {
        // ignore
      }
      setTimeout(() => {
        if (!embeddedRuntime.isReady) {
          sendRuntimeLogToEditor('Warning: RUNTIME_READY not received yet after iframe load', 'warning');
          try {
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({ type: 'SANDBOX_PING' }, '*');
            }
          } catch (_) {
            // ignore
          }
        }
      }, 2000);
    };

    document.body.appendChild(iframe);
    embeddedRuntime.sandboxIframe = iframe;
    embeddedRuntime.isReady = false;

    setTimeout(() => {
      if (!embeddedRuntime.isReady) {
        sendRuntimeLogToEditor('ERROR: Sandbox iframe initialization timeout after 8s.', 'error');
        sendRuntimeLogToEditor(`Iframe src: ${iframe.src}`, 'info');
        sendRuntimeLogToEditor('Check DevTools console for runtime-sandbox.html load errors.', 'error');
      }
    }, 8000);
  }

  // Esegue uno script nell'iframe sandboxed
  function createEmptyEditorRuntimeInventory() {
    return { contents: {}, carriedItemKey: null };
  }

  function applyEditorInventorySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      embeddedRuntime.gameState.inventory = createEmptyEditorRuntimeInventory();
      return;
    }
    const contents = {};
    if (snapshot.contents && typeof snapshot.contents === 'object') {
      Object.keys(snapshot.contents).forEach(key => {
        const count = Math.max(0, Number(snapshot.contents[key]) || 0);
        if (count > 0) contents[key] = count;
      });
    }
    embeddedRuntime.gameState.inventory = {
      contents,
      carriedItemKey: snapshot.carriedItemKey != null && snapshot.carriedItemKey !== ''
        ? String(snapshot.carriedItemKey)
        : null
    };
  }

  function buildSandboxContext(extra) {
    const inv = embeddedRuntime.gameState.inventory || createEmptyEditorRuntimeInventory();
    const variables = {};
    embeddedRuntime.gameState.variables.forEach((value, key) => {
      variables[key] = value;
    });
    return {
      roomId: embeddedRuntime.gameState.currentRoomId,
      objectId: (extra && extra.objectId) || null,
      variables,
      inventory: {
        contents: Object.assign({}, inv.contents),
        carriedItemKey: inv.carriedItemKey || null
      }
    };
  }

  function pushPlaytestContextToRuntimeWindow() {
    if (!playTestState.isRunning || !playTestState.runtimeWindow || playTestState.runtimeWindow.closed) {
      return;
    }
    try {
      playTestState.runtimeWindow.postMessage({
        type: 'UPDATE_CONTEXT',
        context: buildSandboxContext()
      }, '*');
    } catch (_) {
      // finestra playtest chiusa o cross-origin
    }
  }

  function executeScriptInSandbox(scriptName, scriptContent, handlerName, argsArray, context) {
    if (!scriptContent || typeof scriptContent !== 'string' || !scriptContent.trim()) {
      return;
    }

    const callArgs = Array.isArray(argsArray) ? argsArray : [];
    const executionContext = buildSandboxContext(context || {});
    if (context && context.objectId) {
      executionContext.objectId = context.objectId;
    }

    // Se l'iframe non Ã¨ pronto, metti in coda
    if (!embeddedRuntime.isReady || !embeddedRuntime.sandboxIframe) {
      embeddedRuntime.pendingScripts.push({
        name: scriptName,
        code: scriptContent,
        handler: handlerName,
        args: callArgs,
        context: executionContext
      });
      return;
    }

    // Invia script all'iframe (l'handler verrÃ  gestito dal runtime.js)
    try {
      embeddedRuntime.sandboxIframe.contentWindow.postMessage({
        type: 'RUN_SCRIPT',
        scriptName: scriptName,
        code: scriptContent,
        context: executionContext,
        handlerName: handlerName,
        handlerArgs: callArgs
      }, '*');
      
      sendRuntimeLogToEditor(`[Script] ${scriptName} sent to sandbox`, 'info');
    } catch (e) {
      const errorMsg = `Failed to execute script ${scriptName}: ${e && e.message ? e.message : e}`;
      sendRuntimeLogToEditor(errorMsg, 'error');
    }
  }

  // Aggiorna il contesto dell'iframe (variabili, stanza, inventario)
  function updateSandboxContext() {
    if (!embeddedRuntime.isReady || !embeddedRuntime.sandboxIframe) {
      return;
    }

    try {
      embeddedRuntime.sandboxIframe.contentWindow.postMessage({
        type: 'UPDATE_CONTEXT',
        context: buildSandboxContext()
      }, '*');
    } catch (e) {
      // Ignora errori di comunicazione
    }

    pushPlaytestContextToRuntimeWindow();
  }

  // Inizializza gli script del runtime usando l'iframe sandboxed
  function initializeEmbeddedRuntimeScripts() {
    if (!embeddedRuntime.gameData || !embeddedRuntime.gameData.scripts) {
      sendRuntimeLogToEditor('[Script] No scripts found in gameData', 'info');
      return;
    }
    
    const scripts = embeddedRuntime.gameData.scripts;
    sendRuntimeLogToEditor(`[Script] Loading ${Object.keys(scripts).length} script(s)`, 'info');
    
    // Reset e carica variabili iniziali
    embeddedRuntime.gameState.variables.clear();
    embeddedRuntime.gameState.inventory = createEmptyEditorRuntimeInventory();
    if (embeddedRuntime.gameData.variables && Array.isArray(embeddedRuntime.gameData.variables)) {
      embeddedRuntime.gameData.variables.forEach(v => {
        if (v && v.name) {
          embeddedRuntime.gameState.variables.set(v.name, v.initialValue || null);
        }
      });
      sendRuntimeLogToEditor(`[Script] Loaded ${embeddedRuntime.gameState.variables.size} variable(s)`, 'info');
    }
    
    // Aggiorna contesto sandbox
    updateSandboxContext();
    
    // Esegui script globali
    Object.keys(scripts).forEach(scriptName => {
      if (scriptName.startsWith('Global:') || scriptName === 'startup') {
        const content = scripts[scriptName];
        if (content && content.trim()) {
          sendRuntimeLogToEditor(`[Script] Executing global script: ${scriptName}`, 'info');
          executeScriptInSandbox(scriptName, content, 'on_game_start', [], {});
        }
      }
    });
    
    // Esegui script di room
    if (embeddedRuntime.gameState.currentRoomId) {
      const roomScriptName = `Room:${embeddedRuntime.gameState.currentRoomId}`;
      if (scripts[roomScriptName]) {
        const newRoomId = embeddedRuntime.gameState.currentRoomId;
        sendRuntimeLogToEditor(`[Script] Executing room script: ${roomScriptName}`, 'info');
        executeScriptInSandbox(roomScriptName, scripts[roomScriptName], 'on_before_room_change', [null, newRoomId], {
          roomId: newRoomId
        });
        executeScriptInSandbox(roomScriptName, scripts[roomScriptName], 'on_room_change', [null, newRoomId], {
          roomId: newRoomId
        });
      }
    }
  }

  // Carica un'immagine nel runtime
  function loadRuntimeImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      if (embeddedRuntime.loadedImagesCache.has(src)) return resolve(embeddedRuntime.loadedImagesCache.get(src));
      const img = new Image();
      img.onload = () => { 
        embeddedRuntime.loadedImagesCache.set(src, img); 
        resolve(img); 
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Carica asset di una stanza
  async function loadRuntimeRoomAssets(room) {
    const out = { background: null, foregrounds: [], objects: [] };
    out.background = await loadRuntimeImage(room.background);
    if (Array.isArray(room.foregrounds)) {
      for (const f of room.foregrounds) {
        const img = await loadRuntimeImage(f.image);
        out.foregrounds.push({ img, offsetX: Number(f.offsetX)||0, offsetY: Number(f.offsetY)||0 });
      }
    }
    if (Array.isArray(room.sceneObjects)) {
      for (const o of room.sceneObjects) {
        const img = await loadRuntimeImage(o.image);
        out.objects.push({ 
          id: o.id, 
          name: o.name, 
          type: o.type||'Interactive', 
          x: Number(o.x)||0, 
          y: Number(o.y)||0, 
          img 
        });
      }
    }
    return out;
  }

  // Renderizza una stanza nel canvas del runtime
  async function renderRuntimeRoom(index) {
    if (!embeddedRuntime.gameData || !Array.isArray(embeddedRuntime.gameData.rooms) || 
        index < 0 || index >= embeddedRuntime.gameData.rooms.length) return;
    
    // Verifica che il canvas sia inizializzato
    if (!embeddedRuntime.canvas || !embeddedRuntime.ctx) {
      // Prova a inizializzare il canvas se non Ã¨ giÃ  inizializzato
      const canvasElement = document.getElementById('embedded-gameCanvas');
      if (canvasElement) {
        embeddedRuntime.canvas = canvasElement;
        embeddedRuntime.ctx = canvasElement.getContext('2d');
        
        // Imposta dimensioni canvas basate sulle impostazioni del progetto
        const settings = embeddedRuntime.gameData.settings || {};
        const canvasWidth = settings.canvasWidth || 800;
        const canvasHeight = settings.canvasHeight || 600;
        embeddedRuntime.canvas.width = canvasWidth;
        embeddedRuntime.canvas.height = canvasHeight;
      } else {
        return; // Canvas non disponibile
      }
    }
    
    const room = embeddedRuntime.gameData.rooms[index];
    const assets = await loadRuntimeRoomAssets(room);

    if (!embeddedRuntime.ctx || !embeddedRuntime.canvas) return;
    
    // Pulisci il canvas con un colore di sfondo (non nero, ma un grigio scuro per debug)
    embeddedRuntime.ctx.fillStyle = '#1a1a1a';
    embeddedRuntime.ctx.fillRect(0, 0, embeddedRuntime.canvas.width, embeddedRuntime.canvas.height);
    
    // Disegna il background se disponibile
    if (assets.background && assets.background.complete && assets.background.naturalWidth > 0) {
      try {
        embeddedRuntime.ctx.drawImage(assets.background, 0, 0, embeddedRuntime.canvas.width, embeddedRuntime.canvas.height);
      } catch (error) {
        console.warn('[Runtime] Errore rendering background:', error);
      }
    }
    
    // Disegna gli oggetti di scena
    for (const o of assets.objects) {
      if (o.img && o.img.complete && o.img.naturalWidth > 0) {
        try {
          embeddedRuntime.ctx.drawImage(o.img, o.x, o.y);
        } catch (error) {
          console.warn('[Runtime] Errore rendering oggetto:', error);
        }
      }
    }
    
    // Disegna i foregrounds
    for (const f of assets.foregrounds) {
      if (f.img && f.img.complete && f.img.naturalWidth > 0) {
        try {
          embeddedRuntime.ctx.drawImage(f.img, f.offsetX||0, f.offsetY||0);
        } catch (error) {
          console.warn('[Runtime] Errore rendering foreground:', error);
        }
      }
    }

    // Disegna marker posizione iniziale se questa Ã¨ la stanza di start
    try {
      const s = embeddedRuntime.gameData && embeddedRuntime.gameData.settings ? embeddedRuntime.gameData.settings : null;
      if (s && s.startRoomId) {
        const targetRoomIndex = (embeddedRuntime.gameData.rooms || []).findIndex(r => 
          r && (r.id === s.startRoomId || r.name === s.startRoomId));
        if (targetRoomIndex === index) {
          const px = Number(s.startX) || 0;
          const py = Number(s.startY) || 0;
          embeddedRuntime.ctx.save();
          embeddedRuntime.ctx.fillStyle = 'rgba(255, 64, 64, 0.9)';
          embeddedRuntime.ctx.beginPath();
          embeddedRuntime.ctx.arc(px, py, 6, 0, Math.PI * 2);
          embeddedRuntime.ctx.fill();
          embeddedRuntime.ctx.strokeStyle = 'white';
          embeddedRuntime.ctx.lineWidth = 2;
          embeddedRuntime.ctx.stroke();
          embeddedRuntime.ctx.restore();
        }
      }
    } catch(_) {}
  }

  // Inizializza solo l'iframe sandboxed per l'esecuzione degli script (senza rendering canvas)
  function initializeSandboxRuntime(jsonData) {
    try {
      embeddedRuntime.gameData = (typeof jsonData === 'string') ? JSON.parse(jsonData) : jsonData;
    } catch (e) {
      sendRuntimeLogToEditor('Invalid JSON: ' + e, 'error');
      return;
    }

    sendRuntimeLogToEditor('Initializing sandbox runtime...', 'info');

    // Inizializza il canvas embedded se non Ã¨ giÃ  inizializzato
    if (!embeddedRuntime.canvas || !embeddedRuntime.ctx) {
      const canvasElement = document.getElementById('embedded-gameCanvas');
      if (canvasElement) {
        embeddedRuntime.canvas = canvasElement;
        embeddedRuntime.ctx = canvasElement.getContext('2d');
        
        // Imposta dimensioni canvas basate sulle impostazioni del progetto
        const settings = embeddedRuntime.gameData.settings || {};
        const canvasWidth = settings.canvasWidth || 800;
        const canvasHeight = settings.canvasHeight || 600;
        embeddedRuntime.canvas.width = canvasWidth;
        embeddedRuntime.canvas.height = canvasHeight;
        
        sendRuntimeLogToEditor(`Canvas embedded inizializzato: ${canvasWidth}x${canvasHeight}`, 'info');
      } else {
        sendRuntimeLogToEditor('Canvas embedded non trovato nel DOM', 'warning');
      }
    }

    // Seleziona stanza iniziale
    try {
      const s = embeddedRuntime.gameData && embeddedRuntime.gameData.settings ? embeddedRuntime.gameData.settings : null;
      if (s && s.startRoomId && Array.isArray(embeddedRuntime.gameData.rooms)) {
        const idx = embeddedRuntime.gameData.rooms.findIndex(r => 
          r && (r.id === s.startRoomId || r.name === s.startRoomId));
        if (idx >= 0) {
          embeddedRuntime.currentRoomIndex = idx;
          embeddedRuntime.gameState.currentRoomId = embeddedRuntime.gameData.rooms[idx].id;
        } else {
          embeddedRuntime.currentRoomIndex = 0;
          embeddedRuntime.gameState.currentRoomId = embeddedRuntime.gameData.rooms[0]?.id || null;
        }
      } else {
        embeddedRuntime.currentRoomIndex = 0;
        embeddedRuntime.gameState.currentRoomId = embeddedRuntime.gameData.rooms[0]?.id || null;
      }
    } catch(_) {
      embeddedRuntime.currentRoomIndex = 0;
      embeddedRuntime.gameState.currentRoomId = embeddedRuntime.gameData.rooms[0]?.id || null;
    }
    
    // Renderizza la stanza iniziale
    if (embeddedRuntime.canvas && embeddedRuntime.ctx) {
      renderRuntimeRoom(embeddedRuntime.currentRoomIndex).then(() => {
        sendRuntimeLogToEditor('Initial room rendered', 'info');
      }).catch(err => {
        sendRuntimeLogToEditor('Error rendering initial room: ' + err.message, 'error');
      });
      
      // Avvia il loop di rendering continuo
      startEmbeddedRenderLoop();
    }
    
    // Crea e inizializza l'iframe sandboxed
    sendRuntimeLogToEditor('Initializing sandbox iframe...', 'info');
    createSandboxIframe();
    
    // Inizializza ed esegui gli script (verranno eseguiti quando l'iframe Ã¨ pronto)
    // Gli script verranno messi in pendingScripts se l'iframe non Ã¨ ancora pronto
    initializeEmbeddedRuntimeScripts();
    
    embeddedRuntime.isInitialized = true;
    sendRuntimeLogToEditor('Embedded runtime initialization started (waiting for iframe ready...)', 'info');
  }
  
  // Loop di rendering continuo per il canvas embedded
  function startEmbeddedRenderLoop() {
    // Ferma il loop esistente se presente
    if (embeddedRuntime.renderLoopId) {
      cancelAnimationFrame(embeddedRuntime.renderLoopId);
      embeddedRuntime.renderLoopId = null;
    }
    
    // Verifica che il canvas sia disponibile prima di avviare il loop
    if (!embeddedRuntime.canvas || !embeddedRuntime.ctx) {
      // Prova a inizializzare il canvas se non Ã¨ giÃ  inizializzato
      const canvasElement = document.getElementById('embedded-gameCanvas');
      if (canvasElement) {
        embeddedRuntime.canvas = canvasElement;
        embeddedRuntime.ctx = canvasElement.getContext('2d');
        
        // Imposta dimensioni canvas basate sulle impostazioni del progetto
        if (embeddedRuntime.gameData && embeddedRuntime.gameData.settings) {
          const settings = embeddedRuntime.gameData.settings;
          const canvasWidth = settings.canvasWidth || 800;
          const canvasHeight = settings.canvasHeight || 600;
          embeddedRuntime.canvas.width = canvasWidth;
          embeddedRuntime.canvas.height = canvasHeight;
        }
      } else {
        console.warn('[Runtime] Canvas embedded non trovato, loop di rendering non avviato');
        return;
      }
    }
    
    embeddedRuntime.lastRenderTime = performance.now();
    
    function renderLoop(currentTime) {
      // Verifica la tab attiva - non renderizzare se si Ã¨ nella tab "characters"
      const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
      if (activeTab === 'characters') {
        // Nella tab characters, non renderizzare il canvas embedded
        embeddedRuntime.renderLoopId = requestAnimationFrame(renderLoop);
        return;
      }
      
      // Verifica che il canvas embedded sia visibile (runtime-container deve essere visibile)
      const runtimeContainer = document.getElementById('runtime-container');
      if (runtimeContainer && runtimeContainer.style.display === 'none') {
        // Canvas embedded non visibile, continua il loop ma non renderizzare
        embeddedRuntime.renderLoopId = requestAnimationFrame(renderLoop);
        return;
      }
      
      // Renderizza solo se il canvas Ã¨ disponibile e il runtime Ã¨ inizializzato
      if (embeddedRuntime.canvas && embeddedRuntime.ctx && embeddedRuntime.isInitialized && 
          embeddedRuntime.gameData && embeddedRuntime.currentRoomIndex >= 0) {
        // Verifica che il canvas non sia stato resettato (controlla le dimensioni)
        if (embeddedRuntime.canvas.width === 0 || embeddedRuntime.canvas.height === 0) {
          // Canvas resettato, ripristina le dimensioni
          if (embeddedRuntime.gameData && embeddedRuntime.gameData.settings) {
            const settings = embeddedRuntime.gameData.settings;
            embeddedRuntime.canvas.width = settings.canvasWidth || 800;
            embeddedRuntime.canvas.height = settings.canvasHeight || 600;
          }
        }
        
        // Renderizza ogni ~100ms (10 FPS) per non sovraccaricare il sistema
        const deltaTime = currentTime - embeddedRuntime.lastRenderTime;
        if (deltaTime >= 100) {
          renderRuntimeRoom(embeddedRuntime.currentRoomIndex).catch(err => {
            console.warn('[Runtime] Errore rendering:', err);
          });
          embeddedRuntime.lastRenderTime = currentTime;
        }
      }
      
      embeddedRuntime.renderLoopId = requestAnimationFrame(renderLoop);
    }
    
    embeddedRuntime.renderLoopId = requestAnimationFrame(renderLoop);
  }
  
  // Ferma il loop di rendering
  function stopEmbeddedRenderLoop() {
    if (embeddedRuntime.renderLoopId) {
      cancelAnimationFrame(embeddedRuntime.renderLoopId);
      embeddedRuntime.renderLoopId = null;
    }
  }

  // Ferma e pulisce il runtime incorporato
  function stopEmbeddedRuntime() {
    // Ferma il loop di rendering
    stopEmbeddedRenderLoop();
    
    // Rimuovi iframe sandboxed
    if (embeddedRuntime.sandboxIframe) {
      try {
        embeddedRuntime.sandboxIframe.remove();
      } catch (e) {
        // Ignora errori di rimozione
      }
      embeddedRuntime.sandboxIframe = null;
    }
    
    embeddedRuntime.isReady = false;
    embeddedRuntime.pendingScripts = [];
    
    // Pulisci cache immagini
    embeddedRuntime.loadedImagesCache.clear();
    
    // Reset stato
    embeddedRuntime.gameData = null;
    embeddedRuntime.currentRoomIndex = 0;
    embeddedRuntime.gameState.currentRoomId = null;
    embeddedRuntime.gameState.variables.clear();
    embeddedRuntime.gameState.inventory = createEmptyEditorRuntimeInventory();
    embeddedRuntime.isInitialized = false;
  }

  // Functions for Play Test tab
  let playTestState = {
    isRunning: false,
    isPaused: false,
    startTime: null,
    runtimeWindow: null,
    pendingDialoguePreview: null
  };

  function runDialoguePreviewInPlaytestWindow(dialogueIdOrName) {
    if (!playTestState.isRunning || !playTestState.runtimeWindow || playTestState.runtimeWindow.closed) {
      return false;
    }
    const id = String(dialogueIdOrName || '').trim();
    if (!id) return false;
    const code = [
      'async function on_dialogue_preview() {',
      '  await start_dialogue(' + JSON.stringify(id) + ');',
      '}'
    ].join('\n');
    try {
      playTestState.runtimeWindow.postMessage({
        type: 'RUN_SCRIPT',
        scriptName: 'dialogue_preview_' + Date.now().toString(36),
        code: code,
        handlerName: 'on_dialogue_preview',
        handlerArgs: [],
        context: (typeof buildSandboxContext === 'function') ? buildSandboxContext() : {}
      }, '*');
      showNotification('Dialogue preview started in Play Test', 'success');
      return true;
    } catch (e) {
      showNotification('Preview failed: ' + (e && e.message ? e.message : e), 'warning');
      return false;
    }
  }

  window.previewProjectDialogue = async function(dialogueIdOrName) {
    const id = String(dialogueIdOrName || '').trim();
    if (!id) {
      showNotification('No dialogue selected to preview', 'warning');
      return;
    }
    const runtimeOpen = playTestState.isRunning
      && playTestState.runtimeWindow
      && !playTestState.runtimeWindow.closed;
    if (runtimeOpen) {
      runDialoguePreviewInPlaytestWindow(id);
      try { playTestState.runtimeWindow.focus(); } catch (_) {}
      return;
    }
    playTestState.pendingDialoguePreview = id;
    if (typeof window.startPlayTest === 'function') {
      await window.startPlayTest();
      setTimeout(() => {
        if (playTestState.pendingDialoguePreview === id) {
          playTestState.pendingDialoguePreview = null;
          runDialoguePreviewInPlaytestWindow(id);
        }
      }, 2500);
    } else {
      showNotification('Play Test unavailable', 'warning');
    }
  };

  function createElectronRuntimeWindowProxy() {
    const native = window.amiantoNativeFs;
    if (!native || typeof native.openRuntimeWindow !== 'function') return null;
    return {
      _electronRuntime: true,
      closed: false,
      postMessage(message) {
        if (typeof native.postToRuntime === 'function') {
          native.postToRuntime(message);
        }
      },
      focus() {
        if (typeof native.focusRuntimeWindow === 'function') {
          native.focusRuntimeWindow();
        }
      },
      close() {
        this.closed = true;
        if (typeof native.closeRuntimeWindow === 'function') {
          native.closeRuntimeWindow();
        }
      }
    };
  }

  async function openPlaytestRuntimeWindow(runtimeUrl, projectData) {
    // Preferisci window.open: condivide localStorage + window.opener con l'editor
    // (necessario perché il Runtime carica il progetto da amiantoLastSavedProjectJson).
    // La policy autoplay è impostata in setWindowOpenHandler (electron/main.js).
    const opened = window.open(
      runtimeUrl,
      'AmiantoRuntime',
      'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
    );
    if (opened) return opened;

    // Fallback: BrowserWindow gestita dal main process
    const native = window.amiantoNativeFs;
    if (native && typeof native.openRuntimeWindow === 'function') {
      try {
        await native.openRuntimeWindow(runtimeUrl);
        const proxy = createElectronRuntimeWindowProxy();
        if (proxy && projectData) {
          // La finestra IPC non ha opener/localStorage condiviso in modo affidabile:
          // invia il progetto esplicitamente.
          setTimeout(() => {
            try {
              proxy.postMessage({ type: 'START_PLAYTEST', projectData });
            } catch (_) {}
          }, 500);
        }
        return proxy;
      } catch (err) {
        console.warn('[PlayTest] openRuntimeWindow IPC failed:', err);
      }
    }
    return null;
  }

  window.startPlayTest = async function() {
    const runtimeWasAlreadyOpen = playTestState.isRunning
      && playTestState.runtimeWindow
      && !playTestState.runtimeWindow.closed;

    if (playTestState.isRunning && playTestState.runtimeWindow && playTestState.runtimeWindow.closed) {
      playTestState.isRunning = false;
      playTestState.runtimeWindow = null;
    }

    // Sync closed state for Electron-managed runtime window
    if (playTestState.runtimeWindow && playTestState.runtimeWindow._electronRuntime &&
        window.amiantoNativeFs && typeof window.amiantoNativeFs.isRuntimeWindowClosed === 'function') {
      try {
        const closed = await window.amiantoNativeFs.isRuntimeWindowClosed();
        if (closed) {
          playTestState.runtimeWindow.closed = true;
          playTestState.isRunning = false;
          playTestState.runtimeWindow = null;
        }
      } catch (_) {}
    }

    const currentUser = AppState.user;
    let projectObj = null;
    let jsonString = null;

    // Playtest usa sempre lo stato LIVE dell'editor (non snapshot obsoleto senza script in stanze)
    if (window.amiantoResources && typeof window.amiantoResources.refresh === 'function') {
      try {
        await window.amiantoResources.refresh();
      } catch (e) {
        console.warn('[PlayTest] Resources refresh before serialize:', e);
      }
    }

    projectObj = buildPlaytestProjectPayload();
    if (currentUser && currentUser.uid) {
      if (!projectObj._meta) projectObj._meta = {};
      projectObj._meta.userId = currentUser.uid;
      const activeProjectId = localStorage.getItem('amiantoActiveProjectId');
      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (!projectObj._meta.projectId) {
        projectObj._meta.projectId = activeProjectId || (activeProjectName ? normalizeProjectIdFromName(activeProjectName) : null);
      }
    }
    jsonString = JSON.stringify(projectObj, null, 2);
    addDebugMessage('Playtest: project serialized from current editor state', 'info');

    if (!runtimeWasAlreadyOpen) {
      embeddedRuntime.gameState.inventory = createEmptyEditorRuntimeInventory();
    }

    if (runtimeWasAlreadyOpen) {
      try {
        localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
        const runtimeUrl = getRuntimePageUrl();
        // Hard reload della finestra: RELOAD_PLAYTEST_PROJECT non ricaricava runtime.js
        if (playTestState.runtimeWindow._electronRuntime) {
          playTestState.isRunning = false;
          playTestState.runtimeWindow = null;
          if (window.amiantoNativeFs && typeof window.amiantoNativeFs.closeRuntimeWindow === 'function') {
            try { await window.amiantoNativeFs.closeRuntimeWindow(); } catch (_) {}
          }
          // ricade sull'apertura nuova finestra sotto
        } else if (playTestState.runtimeWindow.location) {
          playTestState.runtimeWindow.location.href = runtimeUrl;
          playTestState.runtimeWindow.focus();
          addDebugMessage('Playtest: runtime window hard-reloaded (nuovo runtime.js + progetto)', 'success');
          updateGameStatus('Test running...');
          setTimeout(() => pushPlaytestContextToRuntimeWindow(), 1000);
          return;
        } else {
          playTestState.runtimeWindow.postMessage({ type: 'RELOAD_PLAYTEST_PROJECT' }, '*');
          playTestState.runtimeWindow.focus();
          addDebugMessage('Playtest: project reloaded in runtime window (scripts recompiled)', 'success');
          updateGameStatus('Test running...');
          setTimeout(() => pushPlaytestContextToRuntimeWindow(), 800);
          return;
        }
      } catch (reloadErr) {
        console.warn('[PlayTest] Ricarica finestra esistente fallita, apro nuova finestra:', reloadErr);
        playTestState.isRunning = false;
        playTestState.runtimeWindow = null;
      }
    }

    // Salva in localStorage per il runtime (snapshot playtest, non sostituisce il backup del progetto)
    try {
      localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
      addDebugMessage('Playtest snapshot saved for runtime', 'success');
    } catch (error) {
      console.error('[PlayTest] Errore salvataggio localStorage:', error);
      addDebugMessage('localStorage save error: ' + error.message, 'error');
    }

    // Save game.json depending on mode
    if (window.AMIANTO_PLAYTEST_MODE === 'server') {
      saveGameJsonServer(jsonString);
    } else {
      // saveGameJsonLocal giÃ  chiama saveProjectJsonToOPFS, non duplicare
      saveGameJsonLocal(jsonString);
    }

    // Apri runtime.html (window.open: localStorage + opener condivisi con l'editor)
    const runtimeUrl = getRuntimePageUrl();
    // Chiudi eventuale Runtime IPC residuo (sessioni precedenti)
    if (window.amiantoNativeFs && typeof window.amiantoNativeFs.closeRuntimeWindow === 'function') {
      try { await window.amiantoNativeFs.closeRuntimeWindow(); } catch (_) {}
    }
    const runtimeWindow = await openPlaytestRuntimeWindow(runtimeUrl, projectObj);

    if (!runtimeWindow) {
      showNotification('Could not open the runtime window. Check that pop-ups are allowed.', 'error');
      return;
    }

    playTestState.isRunning = true;
    playTestState.isPaused = false;
    playTestState.startTime = Date.now();
    playTestState.runtimeWindow = runtimeWindow;
    updateGameStatus('Test running...');
    addDebugMessage('Runtime started in separate window', 'success');

    // Non inviare postMessage se localStorage Ã¨ disponibile (prioritÃ  a localStorage)
    // Il runtime caricherÃ  automaticamente da localStorage all'avvio
    // PostMessage Ã¨ solo un fallback se localStorage non funziona
    addDebugMessage('Project saved to localStorage; the runtime will load it automatically', 'info');

    // Monitora se la finestra viene chiusa
    const checkWindowClosed = setInterval(async () => {
      let closed = !!(runtimeWindow.closed);
      if (runtimeWindow._electronRuntime && window.amiantoNativeFs &&
          typeof window.amiantoNativeFs.isRuntimeWindowClosed === 'function') {
        try {
          closed = await window.amiantoNativeFs.isRuntimeWindowClosed();
          runtimeWindow.closed = closed;
        } catch (_) {}
      }
      if (closed) {
        clearInterval(checkWindowClosed);
        playTestState.isRunning = false;
        playTestState.runtimeWindow = null;
        updateGameStatus('Test stopped (finestra chiusa)');
        addDebugMessage('Runtime window closed', 'info');
      }
    }, 500);
  };

  window.pausePlayTest = function() {
    if (!playTestState.isRunning) return;
    
    playTestState.isPaused = !playTestState.isPaused;
    
    if (playTestState.isPaused) {
      updateGameStatus('Test paused');
      addDebugMessage('Test paused', 'warning');
      showNotification('Test paused', 'warning');
    } else {
      updateGameStatus('Test running...');
      addDebugMessage('Test resumed', 'info');
      showNotification('Test resumed', 'info');
    }
  };

  window.stopPlayTest = function() {
    if (!playTestState.isRunning) return;
    
    // Chiudi la finestra runtime se aperta
    if (playTestState.runtimeWindow && !playTestState.runtimeWindow.closed) {
      playTestState.runtimeWindow.close();
    }
    if (window.amiantoNativeFs && typeof window.amiantoNativeFs.closeRuntimeWindow === 'function') {
      window.amiantoNativeFs.closeRuntimeWindow();
    }
    
    const duration = playTestState.startTime ? Date.now() - playTestState.startTime : 0;
    const durationSeconds = Math.round(duration / 1000);
    
    playTestState.isRunning = false;
    playTestState.isPaused = false;
    playTestState.startTime = null;
    
    updateGameStatus('Test stopped');
    addDebugMessage(`Test stopped. Duration: ${durationSeconds}s`, 'info');
    showNotification(`Test stopped after ${durationSeconds} seconds`, 'info');
  };

  // Test Game Start - esegue gli script on_game_start senza aprire il runtime
  window.testGameStart = function() {
    addScriptLogMessage('=== Testing Game Start ===', 'info');
    
    // Cerca script globali che hanno on_game_start
    const globalScripts = Array.from(jsScripts.entries()).filter(([name, content]) => {
      return name.startsWith('Global:') || name === 'startup' || name.includes('game_start');
    });
    
    if (globalScripts.length === 0) {
      addScriptLogMessage('No global script found. Create a script with Scope=Global, Target=main, Event=onGameStart', 'warning');
      showNotification('No global script found', 'warning');
      return;
    }
    
    addScriptLogMessage(`Found ${globalScripts.length} global script(s)`, 'info');
    
    // Esegui tutti gli script globali che potrebbero avere on_game_start
    globalScripts.forEach(([scriptName, content]) => {
      if (content && content.trim()) {
        addScriptLogMessage(`Eseguendo script: ${scriptName}`, 'info');
        executeScriptHandler(content, 'on_game_start', []);
      } else {
        addScriptLogMessage(`Script "${scriptName}" is empty`, 'warning');
      }
    });
    
    // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    
    // Trigger anche i global event handlers
    triggerGameStart();
    
    addScriptLogMessage('=== Test Game Start completato ===', 'info');
    showNotification('Game Start tested! Check the Script Console', 'success');
  };

  window.testRoomChange = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    const prevRoomId = currentRoomId;
    const ids = Array.from(rooms.keys());
    const idx = ids.indexOf(prevRoomId);
    const nextId = ids.length > 0 ? ids[(idx + 1) % ids.length] : prevRoomId;
    addDebugMessage(`Simulating room change: ${prevRoomId} -> ${nextId}`, 'info');
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch(_) {}
    const roomScript = roomScripts.get(nextId);
    if (roomScript) {
      const content = jsScripts.get(roomScript);
      addDebugMessage(`[Room:onEnter] ${nextId}`, 'info');
      executeScriptHandler(content, 'on_room_change', [prevRoomId, nextId]);
    }
    setTimeout(() => { addDebugMessage('Room change completed', 'success'); }, 500);
  };

  window.testObjectInteraction = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    
    addDebugMessage('Testing object interaction...', 'info');
    // Esegue on_object_click('door') nel contesto dell'ultimo script se definito
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
      {
        setTimeout(() => { addDebugMessage('Object interaction tested (no handler exposed)', 'success'); }, 300);
      }
    } catch (err) {
      addDebugMessage('JS interaction error: ' + (err && err.message ? err.message : err), 'error');
    }
  };

  window.testCharacterInteraction = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
addDebugMessage('Testing character click' + (who ? `: ${who}` : ''), 'info');
    
    // Trigger global character click event
    if (who) {
      triggerCharacterClick(who);
    }
    
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch (err) {
      addDebugMessage('JS interaction error: ' + (err && err.message ? err.message : err), 'error');
    }
    if (who) {
      const scriptName = characterScripts.get(who);
      if (scriptName) {
        const content = jsScripts.get(scriptName);
        const eventConditions = characterEventConditions.get(who);
        const conditions = eventConditions && eventConditions.onClick ? eventConditions.onClick : null;
        addDebugMessage(`[Character:onClick] ${who}`, 'info');
        executeScriptHandler(content, 'on_character_click', [who], conditions);
      }
    }
  };

  window.testHotspotInteraction = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    
    if (!activeHotspotId) {
      showNotification('No hotspot selected!', 'warning');
      return;
    }
    
    const hotspot = hotspots.find(h => h.id === activeHotspotId);
    if (!hotspot) {
      showNotification('Selected hotspot not found!', 'error');
      return;
    }
    
    addDebugMessage(`Testing hotspot interaction: ${hotspot.name}...`, 'info');
    
    // âš ï¸ NUOVA STRUTTURA: Leggi script direttamente dall'hotspot
    if (!hotspot.scripts || !hotspot.scripts.onClick) {
      addDebugMessage('No script attached to this hotspot', 'warning');
      return;
    }
    
    const onClickScript = hotspot.scripts.onClick;
    
    // BUG FIX: Usa la stessa logica di normalizzazione del runtime
    // Se enabled non Ã¨ definito e c'Ã¨ codice, considera enabled=true
    const hasCode = onClickScript.code && typeof onClickScript.code === 'string' && onClickScript.code.trim() !== '';
    const isEnabled = (typeof onClickScript.enabled === 'boolean') 
      ? onClickScript.enabled 
      : (hasCode ? true : false);
    
    if (!isEnabled) {
      addDebugMessage('Hotspot script is disabled', 'warning');
      return;
    }
    
    if (!onClickScript.code || onClickScript.code.trim() === '') {
      addDebugMessage('Hotspot script is empty', 'warning');
      return;
    }
    
    try {
      const eventConditions = hotspotEventConditions.get(activeHotspotId);
      const conditions = eventConditions && eventConditions.onClick ? eventConditions.onClick : null;
      executeScriptHandler(onClickScript.code, 'on_hotspot_click', [activeHotspotId], conditions);
      addDebugMessage(`Hotspot script executed`, 'success');
    } catch(error) {
      addDebugMessage(`Error executing hotspot script: ${error.message}`, 'error');
    }
  };

  window.testCharacterDialog = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    
    addDebugMessage('Testing character dialog...', 'info');
    setTimeout(() => {
      addDebugMessage('Character dialog tested successfully', 'success');
    }, 400);
  };

  window.clearDebugConsole = function() {
    const engineConsole = document.getElementById('debug-console');
    if (engineConsole) {
      engineConsole.textContent = '[INFO] Engine console cleared\n';
    }
    const scriptConsole = document.getElementById('script-console');
    if (scriptConsole) {
      scriptConsole.textContent = '[INFO] Script console cleared\n';
    }
    showNotification('Debug consoles cleared', 'info');
  };

  // Funzione per pulire solo lo Script Log
  window.clearScriptConsole = function() {
    if (window.ScriptLogService && typeof window.ScriptLogService.clear === 'function') {
      window.ScriptLogService.clear();
    } else {
      const scriptConsole = document.getElementById('script-console');
      if (scriptConsole) {
        scriptConsole.textContent = '[INFO] Script log cleared\n';
        scriptConsole.scrollTop = 0;
      }
    }
    showNotification('Script Log cleared', 'info');
  };

  function updateGameStatus(status) {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  function addDebugMessage(message, type = 'info') {
    const console = document.getElementById('debug-console');
    if (!console) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const typeIcon = {
      'info': '[INFO]',
      'success': '[OK]',
      'warning': '[WARN]',
      'error': '[ERR]'
    }[type] || '[INFO]';
    
    const newMessage = `${timestamp} ${typeIcon} ${message}\n`;
    console.textContent += newMessage;
    console.scrollTop = console.scrollHeight;
  }

  // ============================================
  // ScriptLogService - servizio centrale di log script
  // ============================================
  const ScriptLogService = (function() {
    const _logs = [];
    const MAX_LOGS = 1000;
    const PANEL_ID = 'script-console';

    function mapType(rawType) {
      if (!rawType) return 'print';
      const t = String(rawType).toLowerCase();
      if (t === 'error') return 'error';
      if (t === 'warning' || t === 'warn') return 'warning';
      if (t === 'print') return 'print';
      // Mappa i vecchi livelli "info/success" su print
      return 'print';
    }

    function normalizeEntry(entry) {
      const now = Date.now();
      const normalizedType = mapType(entry.type);
      const msg = (typeof entry.message === 'string')
        ? entry.message
        : serializeValue(entry.message);

      return {
        type: normalizedType,                  // print | error | warning
        message: msg || '',
        timestamp: entry.timestamp || now,    // epoch ms
        source: entry.source || 'editor'      // editor | runtime | altro
      };
    }

    function getPanel() {
      return document.getElementById(PANEL_ID);
    }

    function renderEntry(entry) {
      const panel = getPanel();
      if (!panel) return;

      const ts = new Date(entry.timestamp).toLocaleTimeString();
      const typeIcon = entry.type === 'error'
        ? '[ERR]'
        : (entry.type === 'warning' ? '[WARN]' : '[PRINT]');
      const sourceTag = entry.source ? `[${entry.source}]` : '';
      const line = `${ts} ${typeIcon} ${sourceTag} ${entry.message}\n`;

      panel.textContent += line;
      panel.scrollTop = panel.scrollHeight;

      // Evidenziazione globale del pannello per errori/warning recenti
      panel.classList.remove('script-log-error', 'script-log-warning');
      if (entry.type === 'error') {
        panel.classList.add('script-log-error');
      } else if (entry.type === 'warning') {
        panel.classList.add('script-log-warning');
      }
    }

    return {
      /**
       * Registra un messaggio normalizzato.
       * entry: { type, message, timestamp?, source? }
       */
      log(entry) {
        const normalized = normalizeEntry(entry || {});
        _logs.push(normalized);
        if (_logs.length > MAX_LOGS) {
          _logs.shift();
        }
        renderEntry(normalized);
      },

      /**
       * API di comodo per print/error/warning da editor.
       */
      print(message, source = 'editor') {
        this.log({ type: 'print', message, source });
      },

      error(message, source = 'editor') {
        this.log({ type: 'error', message, source });
      },

      warning(message, source = 'editor') {
        this.log({ type: 'warning', message, source });
      },

      /**
       * Ingest da runtime tramite postMessage.
       * payload: { type, message, timestamp?, source? }
       */
      ingestFromRuntime(payload) {
        const src = payload && payload.source ? payload.source : 'runtime';
        this.log({
          type: payload && payload.type,
          message: payload && payload.message,
          timestamp: payload && payload.timestamp,
          source: src
        });
      },

      clear() {
        _logs.length = 0;
        const panel = getPanel();
        if (panel) {
          panel.textContent = '[INFO] Script log cleared\n';
          panel.scrollTop = 0;
          panel.classList.remove('script-log-error', 'script-log-warning');
        }
      },

      getAll() {
        return _logs.slice();
      }
    };
  })();

  // Esponi come singleton globale
  window.ScriptLogService = ScriptLogService;
  
  // Espone print() globalmente per test/debug nell'editor
  window.print = function() {
    ScriptLogService.print(Array.from(arguments).join(' '), 'editor');
  };

  // ============================================
  // SISTEMA DI COMUNICAZIONE EDITOR â†” RUNTIME
  // ============================================
  // NOTA: Il runtime Ã¨ ora incorporato nell'editor, quindi non serve piÃ¹ postMessage
  // Mantenuto per compatibilitÃ  futura se necessario
  /*
  // Listener per messaggi dal runtime (postMessage) - DISABILITATO: runtime incorporato
  // Gestisce solo messaggi con type === "SCRIPT_LOG"
  window.addEventListener('message', function(event) {
    // TODO: Per sicurezza, verificare event.origin === location.origin
    // In produzione: if (event.origin !== location.origin) return;

    if (!event.data || event.data.type !== 'SCRIPT_LOG') {
      return; // Ignora messaggi non relativi allo Script Log
    }

    const payload = event.data.payload || {};

    if (window.ScriptLogService && typeof window.ScriptLogService.ingestFromRuntime === 'function') {
      window.ScriptLogService.ingestFromRuntime(payload);
    }
  });
  */

  // Funzione di compatibilitÃ : aggiunge messaggi al pannello Script Log
  // Supporta livelli: info, warning, error
  // NON usa console.log come output principale
  function appendToScriptLog(message, level = 'info') {
    let mappedType = 'print';
    if (level === 'error') mappedType = 'error';
    else if (level === 'warning') mappedType = 'warning';
    ScriptLogService.log({ type: mappedType, message, source: 'runtime' });
  }

  // Script console: mostra solo output degli script (print, errori handler, ecc.)
  // Mantiene compatibilitÃ  con il resto del codice che chiama addScriptLogMessage
  function addScriptLogMessage(message, type = 'print') {
    ScriptLogService.log({ type, message, source: 'editor' });
  }

  // Simulate notifications for tabs (example) - DISABLED
  // setTimeout(() => {
  //   if (window.__amiantoTabs) {
  //     // Example: add notification to Objects tab
  //     window.__amiantoTabs.setNotification('objects', 2);
  //     addDebugMessage('Example notifications added to tabs', 'info');
  //   }
  // }, 3000);

  // Project Settings functionality
  window.openProjectSettings = function() {
    // Verifica che ci sia un progetto aperto
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProjectName) {
      showNotification('No project is open. Open or create a project before changing settings.', 'warning');
      return;
    }

    // Recupera il progetto corrente
    let currentSettings = {
      name: activeProjectName,
      author: '',
      version: '1.0.0',
      description: '',
      canvasWidth: gameViewport.width || 800,
      canvasHeight: gameViewport.height || 600,
      enableFullscreen: true,
      enableSound: true,
      enableMusic: true
    };

    // Prova a recuperare le impostazioni dal progetto serializzato
    try {
      const projectObj = window.serializeProject();
      if (projectObj && projectObj.settings) {
        const s = projectObj.settings;
        currentSettings.name = s.name || activeProjectName;
        currentSettings.author = s.author || '';
        currentSettings.version = s.version || '1.0.0';
        currentSettings.description = s.description || '';
        currentSettings.canvasWidth = s.canvasWidth || gameViewport.width || 800;
        currentSettings.canvasHeight = s.canvasHeight || gameViewport.height || 600;
        currentSettings.enableFullscreen = s.enableFullscreen !== undefined ? s.enableFullscreen : true;
        currentSettings.enableSound = s.enableSound !== undefined ? s.enableSound : true;
        currentSettings.enableMusic = s.enableMusic !== undefined ? s.enableMusic : true;
      }
    } catch (error) {
      console.warn('[ProjectSettings] Errore recupero impostazioni progetto:', error);
      // Fallback: prova a caricare da localStorage
      const savedSettings = localStorage.getItem('amiantoProjectSettings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          Object.assign(currentSettings, parsed);
        } catch (e) {
          console.warn('[ProjectSettings] Errore parsing localStorage:', e);
        }
      }
    }

    // Create modal for project settings
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'projectSettingsModal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'projectSettingsModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title" id="projectSettingsModalLabel">Project Settings</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form>
              <div class="mb-3">
                <label for="projectName" class="form-label">Project Name</label>
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectName" value="${(currentSettings.name || 'Untitled Project').replace(/"/g, '&quot;')}">
              </div>
              <div class="mb-3">
                <label for="projectAuthor" class="form-label">Author</label>
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectAuthor" placeholder="Your name" value="${(currentSettings.author || '').replace(/"/g, '&quot;')}">
              </div>
              <div class="mb-3">
                <label for="projectVersion" class="form-label">Version</label>
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectVersion" value="${(currentSettings.version || '1.0.0').replace(/"/g, '&quot;')}">
              </div>
              <div class="mb-3">
                <label for="projectDescription" class="form-label">Description</label>
                <textarea class="form-control bg-secondary text-light border-secondary" id="projectDescription" rows="3" placeholder="Brief description of your game...">${(currentSettings.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
              </div>
              <div class="mb-3">
                <label for="canvasWidth" class="form-label">Canvas Width</label>
                <input type="number" class="form-control bg-secondary text-light border-secondary" id="canvasWidth" value="${currentSettings.canvasWidth || 800}">
              </div>
              <div class="mb-3">
                <label for="canvasHeight" class="form-label">Canvas Height</label>
                <input type="number" class="form-control bg-secondary text-light border-secondary" id="canvasHeight" value="${currentSettings.canvasHeight || 600}">
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableFullscreen" ${currentSettings.enableFullscreen ? 'checked' : ''}>
                  <label class="form-check-label" for="enableFullscreen">
                    Enable Fullscreen Mode
                  </label>
                </div>
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableSound" ${currentSettings.enableSound ? 'checked' : ''}>
                  <label class="form-check-label" for="enableSound">
                    Enable Sound Effects
                  </label>
                </div>
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableMusic" ${currentSettings.enableMusic ? 'checked' : ''}>
                  <label class="form-check-label" for="enableMusic">
                    Enable Background Music
                  </label>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success" onclick="saveProjectSettings()">Save Settings</button>
          </div>
        </div>
      </div>
    `;
    
    // Add modal to body
    document.body.appendChild(modal);
    
    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Remove modal from DOM when hidden
    modal.addEventListener('hidden.bs.modal', function () {
      modal.remove();
    });
    
    showNotification('Project Settings opened', 'info');
  };

  // Save project settings function
  window.saveProjectSettings = async function() {
    if (!currentUser) {
      showNotification('You must be logged in to save project settings', 'warning');
      return;
    }

    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProjectName) {
      showNotification('No project is open. Open or create a project before saving settings.', 'warning');
      return;
    }

    const newWidth = parseInt(document.getElementById('canvasWidth').value);
    const newHeight = parseInt(document.getElementById('canvasHeight').value);
    const newProjectName = document.getElementById('projectName').value.trim();
    
    if (!newProjectName) {
      showNotification('Project name cannot be empty', 'warning');
      return;
    }
    
    const settings = {
      name: newProjectName,
      author: document.getElementById('projectAuthor').value,
      version: document.getElementById('projectVersion').value,
      description: document.getElementById('projectDescription').value,
      canvasWidth: newWidth,
      canvasHeight: newHeight,
      enableFullscreen: document.getElementById('enableFullscreen').checked,
      enableSound: document.getElementById('enableSound').checked,
      enableMusic: document.getElementById('enableMusic').checked
    };
    
    // Update game viewport
    gameViewport.width = newWidth;
    gameViewport.height = newHeight;
    
    // Update canvas internal size
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Update display
    updateEditorDisplay();
    redraw();
    
    const previousProjectName = activeProjectName;
    const stableProjectId = getStableProjectId(settings, previousProjectName);
    settings.id = stableProjectId;

    localStorage.setItem('amiantoProjectSettings', JSON.stringify(settings));
    localStorage.setItem('amiantoActiveProjectId', stableProjectId);

    if (newProjectName !== previousProjectName) {
      console.log(`[ProjectSettings] Rinomina progetto corrente: "${previousProjectName}" -> "${newProjectName}" (id: ${stableProjectId})`);
      localStorage.setItem('amiantoActiveProjectName', newProjectName);
      removeProjectLocalBackup(currentUser.username, previousProjectName);
      deleteProjectFileFromOPFS(previousProjectName).catch(() => {});
      window.__amiantoProjectRenameFrom = previousProjectName;
    } else {
      window.__amiantoProjectRenameFrom = null;
    }

    try {
      if (typeof window.saveCurrentProject === 'function') {
        await window.saveCurrentProject();
      }
    } catch (error) {
      console.warn('[ProjectSettings] Errore aggiornamento progetto:', error);
      showNotification('Settings saved locally, but full project save failed', 'warning');
    } finally {
      window.__amiantoProjectRenameFrom = null;
    }
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('projectSettingsModal'));
    if (modal) {
      modal.hide();
    }
    
    showNotification(`Project settings saved! Viewport: ${newWidth}Ã—${newHeight}`, 'success');
    
    // Log settings for debugging
    console.log('Project settings saved:', settings);
    
    refreshActiveProjectNameInUi();
    if (typeof loadAndRenderProjectsTab === 'function') {
      loadAndRenderProjectsTab().catch(() => {});
    }
  };

  // Load project settings on page load
  function loadProjectSettings() {
    const savedSettings = localStorage.getItem('amiantoProjectSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      console.log('Project settings loaded:', settings);
      
      // Update game viewport if settings exist
      if (settings.canvasWidth && settings.canvasHeight) {
        gameViewport.width = settings.canvasWidth;
        gameViewport.height = settings.canvasHeight;
        
        // Update canvas internal dimensions
        canvas.width = settings.canvasWidth;
        canvas.height = settings.canvasHeight;
        
        // Update display
        updateEditorDisplay();
      }
    }
  }

  // Load settings when page loads
  loadProjectSettings();

  // Initialize authentication system (after users is declared below, we schedule this)
  // We defer calling it to the next microtask so that declarations below are hoisted.
  Promise.resolve().then(() => initAuthSystem());

  // ================================
  // USER AUTHENTICATION SYSTEM
  // ================================

  // User management variables — utente locale sempre disponibile
  let currentUser = getLocalUser();
  updateAppState({ user: currentUser });
  localStorage.setItem('amiantoCurrentUser', currentUser.username);

  function ensureCurrentUser() {
    if (!currentUser) {
      currentUser = getLocalUser();
      updateAppState({ user: currentUser });
      localStorage.setItem('amiantoCurrentUser', currentUser.username);
    }
    return currentUser;
  }

  // Rimuovi progetto attivo alla chiusura della pagina
  // Questo garantisce che ad ogni apertura/login si visualizzi il modale di selezione
  window.addEventListener('beforeunload', function(event) {
    // Pulisci i frame non salvati prima di chiudere la pagina
    // NOTA: beforeunload non supporta async/await, quindi usiamo navigator.sendBeacon
    // o salviamo l'informazione per essere eliminata al prossimo caricamento
    if (unsavedCharacterFrames.size > 0) {
      console.log(`[Cleanup] ${unsavedCharacterFrames.size} frame non salvati da eliminare alla chiusura...`);
      
      // Salva l'informazione sui frame da eliminare in sessionStorage per cleanup al prossimo caricamento
      try {
        const framesToClean = [];
        
        // Aggiungi frame tracciati come Image objects
        for (const frameImg of unsavedCharacterFrames) {
          const assetInfo = imageAssetMap.get(frameImg);
          if (assetInfo) {
            framesToClean.push({
              assetId: assetInfo.assetId,
              type: assetInfo.type,
              projectId: assetInfo.projectId,
              subfolder: assetInfo.subfolder,
              fileName: assetInfo.fileName
            });
          }
        }
        
        // Aggiungi frame tracciati come assetId (cerca nell'imageAssetMap)
        for (const assetId of unsavedCharacterAssetIds) {
          // Verifica se questo assetId Ã¨ giÃ  nella lista (da unsavedCharacterFrames)
          const alreadyInList = framesToClean.some(f => f.assetId === assetId);
          if (!alreadyInList) {
            // Cerca l'assetInfo nell'imageAssetMap
            for (const [img, assetInfo] of imageAssetMap.entries()) {
              if (assetInfo.assetId === assetId && assetInfo.type === 'character') {
                framesToClean.push({
                  assetId: assetInfo.assetId,
                  type: assetInfo.type,
                  projectId: assetInfo.projectId,
                  subfolder: assetInfo.subfolder,
                  fileName: assetInfo.fileName
                });
                break;
              }
            }
          }
        }
        
        if (framesToClean.length > 0) {
          sessionStorage.setItem('amiantoUnsavedFramesToDelete', JSON.stringify(framesToClean));
          console.log(`[Cleanup] Salvati ${framesToClean.length} frame da eliminare in sessionStorage`);
        }
      } catch (e) {
        console.warn('[Cleanup] Impossibile salvare frame da eliminare:', e);
      }
    }

    // Rimuovi progetto attivo quando l'utente chiude la pagina
    localStorage.removeItem('amiantoActiveProjectName');
    localStorage.removeItem('amiantoActiveProjectOwner');
    console.log('[Cleanup] Progetto attivo rimosso alla chiusura della pagina');
  });

  // Cleanup frame non salvati salvati in sessionStorage al caricamento della pagina
  async function cleanupStoredUnsavedFrames() {
    try {
      const stored = sessionStorage.getItem('amiantoUnsavedFramesToDelete');
      if (!stored) return;

      const framesToDelete = JSON.parse(stored);
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (!storage || !storage.deleteAsset) {
        sessionStorage.removeItem('amiantoUnsavedFramesToDelete');
        return;
      }

      let deletedCount = 0;
      for (const frameInfo of framesToDelete) {
        try {
          const deleted = await storage.deleteAsset(
            frameInfo.projectId,
            frameInfo.type,
            frameInfo.fileName,
            'local',
            frameInfo.subfolder
          );
          if (deleted) deletedCount++;
        } catch (error) {
          console.warn('[Cleanup] Errore eliminazione frame:', error);
        }
      }
      console.log(`[Cleanup] Eliminati ${deletedCount}/${framesToDelete.length} frame`);
      sessionStorage.removeItem('amiantoUnsavedFramesToDelete');
    } catch (error) {
      console.error('[Cleanup] Errore cleanup frame:', error);
    }
  }

  async function initAuthSystem() {
    try {
      await bootstrapApp();
    } catch (error) {
      console.error('[Auth] Errore bootstrap:', error);
      updateAppState({
        user: getLocalUser(),
        loading: false,
        initialized: true,
        error: error.message || 'Bootstrap failed'
      });
    }
    cleanupStoredUnsavedFrames().catch(() => {});
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    window.enterLocalMode();
  }

  // Force reset all auth data (emergency function) â€” demo user removed
  window.forceResetAuth = function() {
    console.log('FORCE RESETTING ALL AUTH DATA');

    // Clear all auth-related localStorage keys
    const keysToRemove = [
      'amiantoUsers',
      'amiantoCurrentUser',
      'amiantoRememberUser',
      'amiantoProjectSettings'
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log('Removed:', key);
    });

    // Clear current user
    currentUser = null;

    // Reload page
    location.reload();
  };

  // Show dashboard
  async function showDashboard() {
    try {
      const mainDashboard = document.getElementById('mainDashboard');
      const dashboardHeader = document.getElementById('dashboardHeader');
      if (!mainDashboard || !dashboardHeader) return;

      mainDashboard.style.display = 'block';
      dashboardHeader.style.display = 'block';

      const currentUserNameEl = document.getElementById('currentUserName');
      const userDisplayNameEl = document.getElementById('userDisplayName');
      if (currentUserNameEl && currentUser) currentUserNameEl.textContent = currentUser.username;
      if (userDisplayNameEl && currentUser) userDisplayNameEl.textContent = currentUser.username;

      loadUserProjects();

      const activeProject = localStorage.getItem('amiantoActiveProjectName');
      if (!activeProject && currentUser && currentUser.uid) {
        const userProjects = loadProjectsFromCache(currentUser.username);
        if (userProjects.length === 0) {
          await showProjectSelectionModal(true);
        }
      }
    } catch (error) {
      console.error('[showDashboard] Error:', error);
    }
  }

  /**
   * Aggiorna il contenuto del modale con la lista progetti aggiornata
   * @param {HTMLElement} modal - Elemento modale da aggiornare
   * @param {bootstrap.Modal} bsModal - Istanza Bootstrap Modal
   * @returns {Promise<void>}
   */
  /**
   * Aggiorna il contenuto del modale progetti
   * RIFATTORIZZATA: Usa getProjectsForUI e renderProjectsList
   * 
   * @param {HTMLElement} modal - Elemento modale
   * @param {Object} bsModal - Istanza Bootstrap Modal
   */
  /**
   * Aggiorna il contenuto del modale progetti
   * RIFATTORIZZATA: Legge SOLO da AppState.projects
   * 
   * @param {HTMLElement} modal - Elemento modale
   * @param {Object} bsModal - Istanza Bootstrap Modal
   */
  function updateProjectModalContent(modal, bsModal) {
    if (!AppState.user || !AppState.user.uid) {
      console.warn('[ProjectModal] updateProjectModalContent: utente non disponibile in AppState');
      return;
    }
    
    console.log('[ProjectModal] Aggiornamento contenuto modale da AppState...');
    
    // Verifica che il modale esista ancora
    if (!modal || !document.body.contains(modal)) {
      console.warn('[ProjectModal] Modale non trovato nel DOM, impossibile aggiornare');
      return;
    }
    
    // Trova container modale
    const modalBody = modal.querySelector('#projectSelectionModalBody') || modal.querySelector('.modal-body');
    if (!modalBody) {
      console.error('[ProjectModal] âŒ modal-body non trovato, impossibile aggiornare');
      return;
    }
    
    // Renderizza lista usando AppState.projects (UNICA FONTE DI VERITÃ€)
    renderProjectsList(AppState.projects, modalBody);
    
    console.log('[ProjectModal] âœ… Contenuto modale aggiornato con', AppState.projects.length, 'progetti da AppState');
  }

  /**
   * Mostra modale di selezione/creazione progetto
   * 
   * RIFATTORIZZATA: Legge SOLO da AppState.projects
   * Non avvia caricamenti, non fa fallback, non gestisce async
   * 
   * Flusso corretto:
   * click â†’
   *   se AppState.loading === true â†’ mostra loader
   *   se AppState.projects.length === 0 â†’ mostra empty state
   *   altrimenti â†’ render lista e apri modale
   * 
   * @param {boolean} forceShow - Forza apertura anche se c'Ã¨ progetto attivo
   */
  function showProjectSelectionModal(forceShow = false) {
    // Verifica che l'app sia inizializzata
    if (!AppState.initialized) {
      console.warn('[ProjectModal] App non ancora inizializzata, attesa...');
      // Attendi che l'app sia inizializzata
      const checkInitialized = setInterval(() => {
        if (AppState.initialized) {
          clearInterval(checkInitialized);
          showProjectSelectionModal(forceShow);
        }
      }, 100);
      return;
    }

    // Verifica che ci sia un utente
    if (!AppState.user || !AppState.user.uid) {
      console.warn('[ProjectModal] Utente non autenticato');
      return;
    }

    // Usa il modale statico dall'HTML invece di crearlo dinamicamente
    let modal = document.getElementById('projectSelectionModal');
    
    // Se il modale non esiste nell'HTML, crealo (fallback per compatibilitÃ )
    if (!modal) {
      console.warn('[ProjectModal] Modale statico non trovato, creazione dinamica...');
      modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = 'projectSelectionModal';
      modal.setAttribute('tabindex', '-1');
      modal.setAttribute('aria-labelledby', 'projectSelectionModalLabel');
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('data-bs-backdrop', 'static');
      modal.setAttribute('data-bs-keyboard', 'false');
      document.body.appendChild(modal);
    }
    
    // Chiudi eventuali istanze Bootstrap esistenti
    const existingBsModal = bootstrap.Modal.getInstance(modal);
    if (existingBsModal) {
      existingBsModal.hide();
    }
    
    // Chiudi altri modali aperti
    const allModals = document.querySelectorAll('.modal.show');
    allModals.forEach(m => {
      if (m.id === 'projectSelectionModal') {
        return;
      }
      try {
        const bsModalInstance = bootstrap.Modal.getInstance(m);
        if (bsModalInstance) {
          bsModalInstance.hide();
        }
      } catch (error) {
        console.warn('[ProjectModal] Errore chiusura modale:', error);
      }
    });

    // Se c'Ã¨ giÃ  un progetto attivo e non Ã¨ forzato, non mostrare il modale
    if (!forceShow) {
      const activeProject = localStorage.getItem('amiantoActiveProjectName');
      if (activeProject) {
        console.log('[ProjectModal] Progetto giÃ  attivo, salto modale:', activeProject);
        return;
      }
    }

    // FLUSSO CORRETTO: Leggi SOLO da AppState
    try {
      // STEP 1: Verifica stato di caricamento
      if (AppState.loading) {
        console.log('[ProjectModal] App in caricamento, mostra loader...');
        showLoadingOverlay('Loading projects...');
      }

      // STEP 2: Leggi progetti da AppState (UNICA FONTE DI VERITÃ€)
      const userProjects = AppState.projects || [];
      console.log('[ProjectModal] Progetti da AppState:', userProjects.length);

      // STEP 3: Trova container modale
      const modalBody = modal.querySelector('#projectSelectionModalBody') || modal.querySelector('.modal-body');
      if (!modalBody) {
        const error = new Error('Modal body not found');
        console.error('[ProjectModal] DOM error:', error);
        throw error;
      }

      // STEP 4: Renderizza lista usando funzione centralizzata
      renderProjectsList(userProjects, modalBody);

      // STEP 5: Inizializza Bootstrap Modal
      if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
        const error = new Error('Bootstrap Modal is not available');
        console.error('[ProjectModal] Bootstrap error:', error);
        throw error;
      }

      const bsModal = new bootstrap.Modal(modal, {
        backdrop: 'static',
        keyboard: false
      });

      if (!bsModal) {
        const error = new Error('Failed to create Bootstrap Modal instance');
        console.error('[ProjectModal] Bootstrap error:', error);
        throw error;
      }

      // STEP 6: Mostra modale
      bsModal.show();
      console.log('[ProjectModal] Modale mostrato con', userProjects.length, 'progetti da AppState');

      // STEP 7: Nascondi loader se era visibile
      if (AppState.loading) {
        // Il loader verrÃ  nascosto quando AppState.loading diventa false
        // Ma nascondiamo anche qui per sicurezza
        hideLoadingOverlay();
      }

    // Gestione click su pulsanti Open con event delegation (funziona anche dopo aggiornamenti contenuto)
    // Aggiungi listener solo se non Ã¨ giÃ  stato aggiunto
    if (!modal.dataset.clickListenersAttached) {
      modal.dataset.clickListenersAttached = 'true';
      
      modal.addEventListener('click', async (e) => {
      // Blocca azioni durante il caricamento
      if (AppState.loading) {
        e.preventDefault();
        e.stopPropagation();
        showNotification('Please wait for loading to complete', 'warning');
        return false;
      }

      // Gestisci click su pulsanti "Open"
      let target = e.target;
      while (target && target !== modal) {
        if (target.hasAttribute && target.hasAttribute('data-action') && 
            target.getAttribute('data-action') === 'open') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          const projectName = target.getAttribute('data-project-name');
          if (projectName) {
            // NON chiudere qui - aspetta che il progetto sia caricato
            showNotification(`Loading project "${projectName}"...`, 'info');
            
            try {
              await openProjectByName(projectName);
              
              // Chiudi il modale DOPO che il progetto Ã¨ stato caricato con successo
              closeProjectModal();
            } catch (error) {
              console.error('[ProjectModal] Errore apertura progetto:', error);
              showNotification('Error opening project', 'danger');
              // Non chiudere il modale in caso di errore
            }
          }
          return false;
        }
        target = target.parentElement;
      }
      
      // Gestione click su pulsante "Load Project" (modale)
      if (e.target && (e.target.id === 'btn-load-project-modal' || e.target.closest('#btn-load-project-modal'))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (AppState.loading) {
          showNotification('Please wait for loading to complete', 'warning');
          return false;
        }
        try {
          await window.loadProjectFromFile();
          const currentBsModal = bootstrap.Modal.getInstance(modal);
          if (currentBsModal) {
            const modalBody = modal.querySelector('#projectSelectionModalBody') || modal.querySelector('.modal-body');
            if (modalBody) renderProjectsList(AppState.projects || [], modalBody);
          }
          const activeProject = localStorage.getItem('amiantoActiveProjectName');
          if (activeProject && currentBsModal) currentBsModal.hide();
        } catch (err) {
          if (err && err.name !== 'AbortError') {
            console.error('[ProjectModal] Errore load project:', err);
          }
        }
        return false;
      }

      // Gestione click su pulsante "Create New Project"
      if (e.target && (e.target.id === 'btn-create-new-project' || e.target.closest('#btn-create-new-project'))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (AppState.loading) {
          showNotification('Please wait for loading to complete', 'warning');
          return false;
        }

        const nameInput = modal.querySelector('#new-project-name-input');
        const projectName = (nameInput && nameInput.value ? nameInput.value : '').trim();
        if (!projectName) {
          showNotification('Enter a project name first', 'warning');
          if (nameInput) nameInput.focus();
          return false;
        }

        showNotification('Creating project "' + projectName + '"...', 'info');

        // Nascondi il modale PRIMA dei dialoghi nativi (non rimuoverlo dal DOM)
        try {
          const bsInst = bootstrap.Modal.getInstance(modal);
          if (bsInst) {
            await new Promise(function(resolve) {
              var done = false;
              var finish = function() { if (done) return; done = true; resolve(); };
              modal.addEventListener('hidden.bs.modal', finish, { once: true });
              bsInst.hide();
              setTimeout(finish, 450);
            });
          } else {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
            document.body.classList.remove('modal-open');
            await new Promise(function(r) { setTimeout(r, 200); });
          }
        } catch (_) {
          await new Promise(function(r) { setTimeout(r, 200); });
        }

        try {
          const created = await window.createNewProject(projectName, true);
          if (!created || !created.ok) {
            if (!localStorage.getItem('amiantoActiveProjectName')) {
              try { await showProjectSelectionModal(true); } catch (_) {}
            }
            return false;
          }
          await loadAndRenderProjectsTab();
        } catch (err) {
          console.error('[ProjectModal] Errore creazione progetto:', err);
          showNotification('Error creating project: ' + (err && err.message ? err.message : err), 'danger');
          if (!localStorage.getItem('amiantoActiveProjectName')) {
            try { await showProjectSelectionModal(true); } catch (_) {}
          }
        }
        return false;
      }

      // Previeni chiusura tramite click sul backdrop (area esterna al modale)
      if (e.target === modal) {
        e.preventDefault();
        e.stopPropagation();
        const activeProject = localStorage.getItem('amiantoActiveProjectName');
        if (!activeProject) {
          showNotification('You must select or create a project to continue', 'warning');
        }
        return false;
      }
      }, { capture: true });
    }

      // Il modale Ã¨ statico nell'HTML, non rimuoverlo quando viene nascosto
      // Aggiungi listener per sincronizzare sempre all'apertura (solo una volta)
      if (!modal.dataset.listenersAttached) {
        modal.dataset.listenersAttached = 'true';
        
        modal.addEventListener('show.bs.modal', function() {
          // Aggiorna il contenuto del modale con i progetti da AppState
          if (AppState.user && AppState.user.uid) {
            console.log('[ProjectModal] Modale aperto, aggiornamento da AppState...');
            
            const modalBody = modal.querySelector('#projectSelectionModalBody') || modal.querySelector('.modal-body');
            if (modalBody) {
              renderProjectsList(AppState.projects, modalBody);
              console.log('[ProjectModal] Modale aggiornato con', AppState.projects.length, 'progetti da AppState');
            }
            
            // Se AppState.loading Ã¨ true, mostra loader
            if (AppState.loading) {
              showLoadingOverlay('Loading projects...');
            } else {
              hideLoadingOverlay();
            }
          }
        }, { once: false });
      }

    // Previeni completamente la chiusura del modale tramite backdrop o ESC
    // L'utente DEVE selezionare o creare un progetto
    if (!modal.dataset.hideListenerAttached) {
      modal.dataset.hideListenerAttached = 'true';
      modal.addEventListener('hide.bs.modal', function (e) {
        const activeProject = localStorage.getItem('amiantoActiveProjectName');
        if (!activeProject) {
          e.preventDefault();
          e.stopPropagation();
          showNotification('You must select or create a project to continue', 'warning');
          return false;
        }
        // Se c'Ã¨ un progetto attivo, permettere la chiusura
        console.log('[ProjectModal] Chiusura permessa - progetto attivo:', activeProject);
      });
    }

    // Il listener per il backdrop Ã¨ giÃ  gestito dentro handleProjectClick
    // Non aggiungere listener duplicati

    } catch (error) {
      // Gestione errori
      console.error('[ProjectModal] Errore durante il rendering:', error);

      // Distingui tra diversi tipi di errori
      if (error.message?.includes('DOM') || error.message?.includes('Bootstrap')) {
        console.error('[ProjectModal] DOM/Bootstrap error:', error);
        showNotification('Error creating modal. Reload the page.', 'danger');
        return;
      } else {
        console.error('[ProjectModal] Unexpected error:', error);
      }

      // In caso di errore, mostra modale con lista vuota da AppState
      const errorModal = document.getElementById('projectSelectionModal');
      if (!errorModal) {
        console.error('[ProjectModal] Modale statico non trovato in error handler');
        return;
      }

      const modalBody = errorModal.querySelector('#projectSelectionModalBody') || errorModal.querySelector('.modal-body');
      if (!modalBody) {
        console.error('[ProjectModal] Modal body not found in error handler');
        return;
      }

      // Renderizza lista vuota o da AppState
      renderProjectsList(AppState.projects || [], modalBody);

      if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
        console.error('[ProjectModal] Bootstrap Modal not available in error handler');
        return;
      }

      const bsModal = new bootstrap.Modal(errorModal, {
        backdrop: 'static',
        keyboard: false
      });

      bsModal.show();
      console.log('[ProjectModal] Modale mostrato con', AppState.projects?.length || 0, 'progetti (gestione errore)');
      
      // Nascondi loader se era visibile
      if (AppState.loading) {
        hideLoadingOverlay();
      }
    }
  }

  window.enterLocalMode = function() {
    currentUser = getLocalUser();
    updateAppState({ user: currentUser, initialized: true, loading: false });
    localStorage.setItem('amiantoCurrentUser', currentUser.username);
    showDashboard();
    const activeProject = localStorage.getItem('amiantoActiveProjectName');
    enableOtherTabs(!!activeProject);
    setTimeout(async () => {
      const currentTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : null;
      if (currentTab === 'projects') {
        await loadAndRenderProjectsTab();
      } else if (!activeProject) {
        showProjectSelectionModal(false);
      }
    }, 300);
  };

  window.logout = async function() {
    if (confirm('Close the current project and return to project selection?')) {
      try { await cleanupUnsavedCharacterFrames(); } catch (_) {}
      localStorage.removeItem('amiantoActiveProjectName');
      localStorage.removeItem('amiantoActiveProjectOwner');
      enableOtherTabs(false);
      showProjectSelectionModal(true);
    }
  };
  async function cleanupUnsavedCharacterFrames() {
    if (unsavedCharacterFrames.size === 0 && unsavedCharacterAssetIds.size === 0) {
      return; // Nessun frame da eliminare
    }

    console.log(`[Cleanup] Eliminazione di ${unsavedCharacterFrames.size + unsavedCharacterAssetIds.size} frame character non salvati...`);

    let deletedCount = 0;
    
    const framesToDelete = Array.from(unsavedCharacterFrames);
    for (const frameImg of framesToDelete) {
      try {
        const deleted = await deleteAssetFromImage(frameImg);
        if (deleted) {
          deletedCount++;
          unsavedCharacterFrames.delete(frameImg);
        }
      } catch (error) {
        console.warn('[Cleanup] Errore eliminazione frame non salvato:', error);
      }
    }
    
    if (unsavedCharacterAssetIds.size > 0) {
      for (const assetId of Array.from(unsavedCharacterAssetIds)) {
        try {
          let foundImage = null;
          for (const [img, assetInfo] of imageAssetMap.entries()) {
            if (assetInfo.assetId === assetId && assetInfo.type === 'character') {
              foundImage = img;
              break;
            }
          }
          if (foundImage) {
            const deleted = await deleteAssetFromImage(foundImage);
            if (deleted) deletedCount++;
          }
        } catch (error) {
          console.warn(`[Cleanup] Errore eliminazione assetId ${assetId}:`, error);
        }
      }
    }

    console.log(`[Cleanup] Eliminati ${deletedCount} frame non salvati`);
    unsavedCharacterFrames.clear();
    unsavedCharacterAssetIds.clear();
  }

  // Show user profile (placeholder)
  window.showUserProfile = function() {
    showNotification('User profile feature coming soon!', 'info');
  };

  // Show user projects (placeholder)
  window.showUserProjects = function() {
    showProjectList();
  };

  // Show forgot password (placeholder)
  window.showForgotPassword = function() {
    showNotification('Password recovery feature coming soon!', 'info');
  };

  // Debug authentication system (simplified â€” demo user removed)
  window.debugAuth = function() {
    console.log('=== AUTH DEBUG INFO ===');
    console.log('Current user:', currentUser);
    console.log('localStorage amiantoUsers:', localStorage.getItem('amiantoUsers'));
    console.log('localStorage amiantoCurrentUser:', localStorage.getItem('amiantoCurrentUser'));
    console.log('localStorage amiantoRememberUser:', localStorage.getItem('amiantoRememberUser'));
    showNotification('Check console for debug info', 'info');
  };

  // Load user's projects
  /**
   * Carica progetti utente per la UI
   * RIFATTORIZZATA: Usa getProjectsForUI invece di accedere direttamente a localStorage
   */
  async function loadUserProjects() {
    if (!currentUser || !currentUser.uid) return;

    try {
      // Usa getProjectsForUI per ottenere progetti (gestisce cache e fallback)
      const projects = await getProjectsForUI(currentUser.uid);
      console.log('Loaded projects for user:', currentUser.username, projects.length, 'progetti');
      return projects;
    } catch (error) {
      console.error('[loadUserProjects] Errore caricamento progetti:', error);
      return [];
    }
  }

  // ==============================
  // Project Serialization & Export
  // ==============================

  // Safe helper to convert an HTMLImageElement to a data URL (PNG)
  function imageToDataURL(img) {
    try {
      if (!img || !img.width || !img.height) return null;
      const tmp = document.createElement('canvas');
      tmp.width = img.width;
      tmp.height = img.height;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(img, 0, 0);
      return tmp.toDataURL('image/png');
    } catch (_) {
      // Fallback to source if canvas is blocked (tainted)
      return (img && img.src) ? String(img.src) : null;
    }
  }

  /**
   * Serializza un'immagine: restituisce assetId se disponibile, altrimenti dataURL come fallback
   * @param {Image} img - Oggetto Image da serializzare
   * @returns {string|null} - assetId o dataURL, o null se immagine non valida
   */
  function serializeImage(img) {
    if (!img) return null;
    
    // Controlla se l'immagine ha un assetId associato
    const assetInfo = imageAssetMap.get(img);
    if (assetInfo && assetInfo.assetId) {
      // Restituisce assetId (prefisso per distinguerlo da dataURL)
      return `asset:${assetInfo.assetId}`;
    }
    
    // IMPORTANTE: Se l'immagine Ã¨ un oggetto Image ma non Ã¨ nella mappa,
    // serializzala come dataURL. VerrÃ  poi processata da saveAllAssetsToStorage
    // che la convertirÃ  in assetId e la caricherÃ  nello storage.
    // Questo garantisce che TUTTI gli assets vengano serializzati e salvati.
    if (img && typeof img === 'object' && (img.src || (img.width && img.height))) {
      // Ãˆ un oggetto Image, convertilo in dataURL per essere processato da saveAllAssetsToStorage
      const dataURL = imageToDataURL(img);
      if (dataURL) {
        console.log(`[Serialize] Immagine non tracciata nella mappa, serializzata come dataURL (verrÃ  convertita in assetId al salvataggio)`);
        return dataURL;
      }
    }
    
    // Se è già una stringa (dataURL o assetId), restituiscila così com'è
    if (typeof img === 'string') {
      if (img.startsWith('blob:')) return null;
      return img;
    }
    
    // Fallback: usa dataURL (per compatibilità con progetti esistenti)
    const dataUrl = imageToDataURL(img);
    if (dataUrl && dataUrl.startsWith('blob:')) return null;
    return dataUrl;
  }

  function serializeRooms() {
    const serialized = [];
    rooms.forEach((r) => {
      // DEBUG: Log foreground prima della serializzazione
      if (Array.isArray(r.foregrounds)) {
        console.log(`[Serialize] Room ${r.id}: serializzando ${r.foregrounds.length} foreground`, r.foregrounds.map(f => ({ id: f.id, name: f.name, hasImg: !!f.img })));
      } else {
        console.log(`[Serialize] Room ${r.id}: r.foregrounds non Ã¨ un array`, typeof r.foregrounds, r.foregrounds);
      }
      serialized.push({
        id: r.id,
        name: r.name || r.id,
        background: serializeImage(r.background),
        foregrounds: Array.isArray(r.foregrounds) ? r.foregrounds.map(f => {
          // Support both x/y and offsetX/offsetY for backward compatibility
          const x = (typeof f.x === 'number') ? f.x : (f.offsetX || 0);
          const y = (typeof f.y === 'number') ? f.y : (f.offsetY || 0);
          return {
            id: f.id,
            name: f.name || 'Layer',
            image: serializeImage(f.img),
            x: Number(x) || 0,
            y: Number(y) || 0,
            offsetX: Number(x) || 0, // Mantieni per compatibilitÃ 
            offsetY: Number(y) || 0, // Mantieni per compatibilitÃ 
            rotationRad: Number(f.rotationRad) || 0,
            scaleX: (typeof f.scaleX === 'number') ? Number(f.scaleX) : 1,
            scaleY: (typeof f.scaleY === 'number') ? Number(f.scaleY) : 1,
            visible: (typeof f.visible === 'boolean') ? f.visible : true
          };
        }) : [],
        sceneObjects: Array.isArray(r.sceneObjects) ? r.sceneObjects.map(o => {
          const visible = (typeof o.visible === 'boolean') ? o.visible : true;
          const enabled = (typeof o.enabled === 'boolean') ? o.enabled : visible;
          return {
            id: o.id,
            name: o.name,
            type: o.type || 'Interactive',
            x: Number(o.x) || 0,
            y: Number(o.y) || 0,
            image: serializeImage(o.img),
            rotationRad: Number(o.rotationRad) || 0,
            scaleX: (typeof o.scaleX === 'number') ? Number(o.scaleX) : 1,
            scaleY: (typeof o.scaleY === 'number') ? Number(o.scaleY) : 1,
            visible,
            enabled
          };
        }) : [],
        animationInstances: Array.isArray(r.animationInstances) ? r.animationInstances.map(inst => ({
          id: inst.id,
          animationId: inst.animationId,
          name: inst.name || inst.id,
          x: Number(inst.x) || 0,
          y: Number(inst.y) || 0,
          layer: inst.layer === 'foreground' ? 'foreground' : 'background',
          visible: inst.visible !== false,
          autoPlay: inst.autoPlay === true
        })) : [],
        walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
        hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => {
          // âš ï¸ NUOVA STRUTTURA: script salvato direttamente nell'hotspot
          const hotspotObj = {
            id: h.id,
            name: h.name,
            points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
            visible: !!h.visible,
            scripts: {}
          };
          
          // âš ï¸ NORMALIZZAZIONE: Usa SOLO la struttura scripts.onClick dell'hotspot
          // enabled = true di default se non definito e c'Ã¨ codice
          // BUG FIX CRITICO: Garantisce che enabled=true quando c'Ã¨ codice e enabled non Ã¨ esplicitamente definito come false
          if (h.scripts && h.scripts.onClick) {
            const onClickData = h.scripts.onClick;
            
            // DEBUG AGGIUNTIVO: Log sempre per diagnosticare
            console.log(`[Serialize] Hotspot ${h.id} - Serializzazione script:`, {
              hasCode: !!onClickData.code,
              codeLength: onClickData.code ? String(onClickData.code).length : 0,
              codePreview: onClickData.code ? String(onClickData.code).substring(0, 50) : '(vuoto)',
              enabled: onClickData.enabled,
              codeType: typeof onClickData.code
            });
            
            const hasCode = onClickData.code && typeof onClickData.code === 'string' && onClickData.code.trim() !== '';
            
            // AUTOMATIZZAZIONE: Se c'Ã¨ codice, enabled deve essere sempre true
            // L'obiettivo Ã¨ eliminare il blocco "enabled = false" per hotspot con codice
            let normalizedEnabled;
            if (hasCode) {
              // Se c'Ã¨ codice, forza sempre enabled=true (ignorando eventuale enabled=false salvato)
              normalizedEnabled = true;
              if (typeof onClickData.enabled === 'boolean' && onClickData.enabled === false) {
                console.warn(`[Serialize] [AUTO-ENABLE] Hotspot ${h.id} ha codice ma enabled=false salvato, forzo enabled=true`);
              }
            } else {
              // Se non c'Ã¨ codice, enabled puÃ² essere false
              normalizedEnabled = (typeof onClickData.enabled === 'boolean') ? onClickData.enabled : false;
            }
            
            // DEBUG: Verifica che il codice venga salvato correttamente
            const codeToSave = String(onClickData.code || '');
            if (hasCode && codeToSave.length === 0) {
              console.error(`[Serialize] [ERRORE] Hotspot ${h.id} ha codice ma codeToSave Ã¨ vuoto!`, {
                originalCode: onClickData.code,
                codeType: typeof onClickData.code,
                codeLength: onClickData.code ? String(onClickData.code).length : 0
              });
            }
            
            hotspotObj.scripts.onClick = {
              code: codeToSave,
              enabled: normalizedEnabled
            };
          } else {
            // Se non c'Ã¨ script, imposta struttura vuota e disabilitata
            hotspotObj.scripts.onClick = {
              code: '',
              enabled: false
            };
          }
          
          return hotspotObj;
        }) : [],
        // Character scaling data
        scalingForegroundY: (typeof r.scalingForegroundY === 'number') ? Number(r.scalingForegroundY) : null,
        scalingBackgroundY: (typeof r.scalingBackgroundY === 'number') ? Number(r.scalingBackgroundY) : null,
        scalingMinScale: (typeof r.scalingMinScale === 'number') ? Number(r.scalingMinScale) : 0.5,
        scalingMaxScale: (typeof r.scalingMaxScale === 'number') ? Number(r.scalingMaxScale) : 1.5
      });
      
      // DEBUG: Verifica che foregrounds sia incluso nel JSON serializzato
      const serializedRoom = serialized[serialized.length - 1];
      if (serializedRoom && Array.isArray(serializedRoom.foregrounds)) {
        console.log(`[Serialize] âœ“ Room ${r.id}: ${serializedRoom.foregrounds.length} foreground serializzati nel JSON`);
      } else {
        console.warn(`[Serialize] âš ï¸ Room ${r.id}: foregrounds non serializzati correttamente!`, serializedRoom);
      }
    });
    return serialized;
  }

  function serializeGUI() {
    return Array.isArray(guis) ? guis.map(g => ({
      id: g.id,
      name: g.name,
      type: g.type || 'MainInterface',
      settings: serializeGuiSettings(g.settings, g.type),
      background: serializeImage(g.background),
      buttons: Array.isArray(g.buttons) ? g.buttons.map(b => ({
        id: b.id,
        name: b.name,
        x: Number(b.x)||0,
        y: Number(b.y)||0,
        w: Number(b.w)||0,
        h: Number(b.h)||0,
        text: b.text || '',
        backgroundImage: serializeImage(b.backgroundImage)
      })) : []
    })) : [];
  }

  function serializeGuiSettings(settings, type) {
    try {
      const src = settings || {};
      const out = { ...src };
      if (type === 'DialogBox') {
        if (out.balloonImage) {
          out.balloon = serializeImage(out.balloonImage) || out.balloon || '';
        }
        delete out.balloonImage;
        delete out.x;
        delete out.y;
        delete out.w;
        delete out.h;
        delete out.portrait;
        delete out.background;
        delete out.previewText;
        if (!out.customFont) {
          delete out.fontFamily;
        }
      }
      return JSON.parse(JSON.stringify(out));
    } catch (_) {
      return {};
    }
  }

  function collectCharacterNames() {
    const names = new Set();
    try {
      document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => names.add(s.textContent.trim()));
    } catch (_) {}
    // Also include any keys present in characterFrames map
    try {
      characterFrames && characterFrames.forEach((_, k) => names.add(k));
    } catch (_) {}
    return Array.from(names.values());
  }

  function serializeCharacters() {
    // Salva le impostazioni spawn del character corrente prima di serializzare
    // Questo garantisce che le modifiche non salvate vengano incluse
    try {
      saveCharacterSpawnSettings();
    } catch (e) {
      // Ignora errori (potrebbe non esserci un character selezionato)
    }
    
    const result = [];
    const names = collectCharacterNames();
    names.forEach(name => {
      const charData = (characterFrames && characterFrames.get) ? characterFrames.get(name) : null;
      if (charData) ensureCharacterIdEqualsName(charData, name);
      // id === name sempre nel .amnt / JSON progetto
      const out = { id: name, name: name, directions: {} };
      // Include pivot if it exists
      if (charData && charData.pivotX !== undefined && charData.pivotY !== undefined) {
        out.pivotX = Number(charData.pivotX) || 0;
        out.pivotY = Number(charData.pivotY) || 0;
      }
      ensureCharacterSpawnSettings(charData);
      const spawn = charData.spawnSettings;
      out.spawnSettings = {
        isPlayer: spawn.isPlayer === true,
        autoSpawn: spawn.autoSpawn === true,
        roomId: spawn.roomId || null,
        x: typeof spawn.x === 'number' ? spawn.x : 0,
        y: typeof spawn.y === 'number' ? spawn.y : 0,
        direction: spawn.direction || 'south',
        moveSpeed: typeof spawn.moveSpeed === 'number' && spawn.moveSpeed > 0 ? spawn.moveSpeed : 100
      };
      out.directions = serializeDirectionsMap(charData ? charData.directions : null);
      if (charData && charData.animations && Object.keys(charData.animations).length > 0) {
        out.animations = {};
        Object.entries(charData.animations).forEach(([animName, animData]) => {
          if (animName && animData) {
            out.animations[animName] = {
              directions: serializeDirectionsMap(animData.directions)
            };
          }
        });
      }
      if (charData && charData.portraits && typeof charData.portraits === 'object') {
        const portraits = {};
        Object.keys(charData.portraits).forEach(moodKey => {
          const ref = charData.portraits[moodKey];
          if (typeof ref === 'string' && ref.trim()) {
            portraits[String(moodKey).trim()] = ref.trim();
          } else if (ref && ref.src) {
            portraits[String(moodKey).trim()] = serializeImage(ref) || '';
          }
        });
        Object.keys(portraits).forEach(k => { if (!portraits[k]) delete portraits[k]; });
        if (Object.keys(portraits).length) out.portraits = portraits;
      }
      result.push(out);
    });
    return result;
  }

  function serializeInventory() {
    return {
      displayMode: normalizeInventoryDisplayMode(inventoryDefinition.displayMode),
      popupEdgeHeight: Math.max(16, Math.min(200, Number(inventoryDefinition.popupEdgeHeight) || 48)),
      panel: (() => {
        ensureInventoryRects();
        const p = inventoryDefinition.panel;
        return { x: p.x, y: p.y, w: p.w, h: p.h };
      })(),
      toggleIconBounds: (() => {
        ensureInventoryRects();
        const t = inventoryDefinition.toggleIconBounds;
        return { x: t.x, y: t.y, w: t.w, h: t.h };
      })(),
      toggleIcon: serializeImage(inventoryDefinition.toggleIcon),
      background: serializeImage(inventoryDefinition.background),
      slots: Array.isArray(inventoryDefinition.slots)
        ? inventoryDefinition.slots
            .filter(s => s && s.id !== '__drawing__')
            .map(s => ({
              id: s.id,
              name: s.name || 'Slot',
              x: Number(s.x) || 0,
              y: Number(s.y) || 0,
              w: Number(s.w) || 0,
              h: Number(s.h) || 0
            }))
        : [],
      items: inventoryItems.map(item => ({
        id: item.id,
        name: item.name,
        scriptName: item.scriptName != null ? String(item.scriptName) : '',
        image: serializeImage(item.image)
      }))
    };
  }


  /** Raccoglie codice hotspot embedded da un oggetto progetto serializzato. */
  function collectEmbeddedHotspotScriptCodesFromProject(projectObj) {
    const embeddedById = new Map();
    if (!projectObj || !Array.isArray(projectObj.rooms)) return embeddedById;
    for (const room of projectObj.rooms) {
      if (!Array.isArray(room.hotspots)) continue;
      for (const h of room.hotspots) {
        const code = h && h.scripts && h.scripts.onClick && h.scripts.onClick.code;
        if (code && String(code).trim()) {
          embeddedById.set(String(h.id), String(code).trim());
        }
      }
    }
    return embeddedById;
  }

  /** Raccoglie codice hotspot giÃ  embedded nelle stanze live (chiave = hotspot id). */
  function collectEmbeddedHotspotScriptCodes() {
    return collectEmbeddedHotspotScriptCodesFromProject({ rooms: Array.from(rooms.values()) });
  }

  /**
   * Sincronizza scripts.onClick su tutte le stanze (e hotspot globali) con lo stesso id.
   */
  function syncHotspotScriptToAllRooms(hotspotId, content, linkedScriptName) {
    const id = String(hotspotId || '');
    if (!id) return;
    const code = String(content || '');
    const onClick = { code, enabled: code.trim().length > 0 };
    const linked = linkedScriptName ? migrateLegacyScriptKey(String(linkedScriptName)) : null;

    const applyTo = (hotspot) => {
      if (!hotspot || String(hotspot.id) !== id) return;
      if (!hotspot.scripts) hotspot.scripts = {};
      hotspot.scripts.onClick = { code: onClick.code, enabled: onClick.enabled };
      if (linked) {
        if (!hotspot._meta) hotspot._meta = {};
        hotspot._meta.linkedScriptName = linked;
      }
    };

    try {
      rooms.forEach((room) => {
        if (room.hotspots && Array.isArray(room.hotspots)) {
          room.hotspots.forEach(applyTo);
        }
      });
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        hotspots.forEach(applyTo);
      }
    } catch (_) {}
  }

  /**
   * Prima di serializzare/playtest: copia jsScripts negli hotspot embedded nelle stanze.
   * Senza questo passaggio il runtime vede rooms[].hotspots[].scripts.onClick vuoti
   * finchÃ© non si fa Save progetto (che prima era l'unico momento di sync).
   */
  function syncEditorScriptsToRoomsBeforeSerialize() {
    try {
      if (jsScripts && jsScripts.forEach) {
        jsScripts.forEach((content, key) => {
          if (!key || !String(content || '').trim()) return;
          const canonical = migrateLegacyScriptKey(String(key));
          if (canonical.startsWith('Hotspot:')) {
            syncHotspotScriptToAllRooms(canonical.slice('Hotspot:'.length), content, canonical);
          }
        });
      }
      rooms.forEach((room) => {
        if (!room.hotspots || !Array.isArray(room.hotspots)) return;
        room.hotspots.forEach((h) => {
          const code = h.scripts && h.scripts.onClick && h.scripts.onClick.code;
          if (!code || !String(code).trim()) return;
          const linked = h._meta && h._meta.linkedScriptName;
          const scriptKey = linked
            ? migrateLegacyScriptKey(String(linked))
            : `Hotspot:${h.id}`;
          const prev = jsScripts.has(scriptKey) ? String(jsScripts.get(scriptKey)) : '';
          if (prev !== String(code)) {
            jsScripts.set(scriptKey, String(code));
            try { localStorage.setItem(`script-${scriptKey}`, String(code)); } catch (_) {}
          }
        });
      });
    } catch (e) {
      console.warn('[Serialize] syncEditorScriptsToRoomsBeforeSerialize:', e);
    }
  }

  /** Allinea inventoryScripts dagli script Inventory:* in jsScripts (non modifica item.scriptName). */
  function syncInventoryScriptAttachments() {
    try {
      if (!jsScripts || !jsScripts.forEach) return;
      jsScripts.forEach((content, key) => {
        const k = migrateLegacyScriptKey(String(key));
        if (!k.startsWith('Inventory:') || !String(content || '').trim()) return;
        const itemName = k.slice('Inventory:'.length);
        const item = inventoryItems.find(i => i.name === itemName || i.id === itemName);
        if (!item) return;
        const userKey = String(item.scriptName || '').trim();
        if (userKey && editorScriptExists(migrateLegacyScriptKey(userKey))) return;
        attachInventoryItemScript(item.name, k);
      });
    } catch (e) {
      console.warn('[Serialize] syncInventoryScriptAttachments:', e);
    }
  }

  /**
   * Dopo serializeProject, reinserisce script Hotspot/Inventory in scripts{} per il runtime
   * (serializeScripts li rimuove se giÃ  embedded) e riallinea rooms via mergeLegacy.
   */
  function reinjectHotspotScriptsForPlaytest(projectObj) {
    if (!projectObj.scripts || typeof projectObj.scripts !== 'object') {
      projectObj.scripts = {};
    }
    if (jsScripts && jsScripts.forEach) {
      jsScripts.forEach((content, key) => {
        const k = migrateLegacyScriptKey(String(key));
        if (!String(content || '').trim()) return;
        if (k.startsWith('Hotspot:') || k.startsWith('Inventory:')) {
          projectObj.scripts[k] = String(content);
        }
      });
    }
    mergeLegacyHotspotScriptsIntoRooms(projectObj);
  }

  /** Sincronizza lo stato live della stanza corrente prima di serializzare/playtest. */
  function syncEditorRoomStateBeforeSerialize() {
    try {
      if (!currentRoomId || !rooms.has(currentRoomId)) return;
      const r = rooms.get(currentRoomId);
      if (!r) return;
      r.animationInstances = animationInstances;
      r.sceneObjects = sceneObjects;
      r.foregrounds = foregrounds;
      r.hotspots = hotspots;
      r.walkableArea = walkableArea;
    } catch (e) {
      console.warn('[Serialize] syncEditorRoomStateBeforeSerialize:', e);
    }
  }

  /** Payload progetto pronto per runtime / playtest (stato live editor). */
  function buildPlaytestProjectPayload() {
    saveCurrentScriptIfNeeded();
    syncEditorRoomStateBeforeSerialize();
    syncEditorScriptsToRoomsBeforeSerialize();
    syncInventoryScriptAttachments();
    const projectObj = window.serializeProject();
    reinjectHotspotScriptsForPlaytest(projectObj);
    projectObj.resourcesCatalog = slimResourcesCatalogForFirestore(projectObj.resourcesCatalog);
    return projectObj;
  }

  /**
   * Gli script hotspot vivono in rooms[].hotspots[].scripts.onClick.
   * Rimuove Hotspot:* duplicati da scripts{} quando il codice Ã¨ giÃ  embedded.
   */
  function pruneDuplicateHotspotScriptsFromScriptsObject(scriptsObj, projectObjForEmbedded) {
    if (!scriptsObj || typeof scriptsObj !== 'object') return scriptsObj;
    const embeddedById = projectObjForEmbedded
      ? collectEmbeddedHotspotScriptCodesFromProject(projectObjForEmbedded)
      : collectEmbeddedHotspotScriptCodes();
    for (const key of Object.keys(scriptsObj)) {
      if (!key.startsWith('Hotspot:')) continue;
      const hotspotId = key.slice('Hotspot:'.length);
      if (embeddedById.has(hotspotId)) {
        delete scriptsObj[key];
      }
    }
    return scriptsObj;
  }

  function serializeScripts() {
    const scriptsObj = {};
    try {
      if (jsScripts && jsScripts.forEach) {
        jsScripts.forEach((content, name) => { if (name) scriptsObj[name] = String(content || ''); });
      }
    } catch (_) {}
    return pruneDuplicateHotspotScriptsFromScriptsObject(scriptsObj);
  }

  function mapToObject(mapInstance) {
    const obj = {};
    try { mapInstance && mapInstance.forEach((v, k) => { obj[String(k)] = String(v); }); } catch (_) {}
    return obj;
  }

  function serializeAttachments() {
    return {
      roomScripts: mapToObject(roomScripts),
      objectScripts: mapToObject(objectScripts),
      characterScripts: mapToObject(characterScripts),
      inventoryScripts: mapToObject(inventoryScripts),
      guiScripts: (typeof guiScripts !== 'undefined') ? mapToObject(guiScripts) : {}
      // âš ï¸ hotspotScripts rimosso: gli script degli hotspot sono ora salvati direttamente in hotspot.scripts.onClick
    };
  }

  function serializeCursors() {
    return Array.isArray(contextualCursors) ? contextualCursors.map(c => ({
      id: c.id,
      category: c.category || 'default',
      actionText: c.actionText || '',
      scriptName: c.scriptName || '',
      pivotX: typeof c.pivotX === 'number' ? c.pivotX : 0,
      pivotY: typeof c.pivotY === 'number' ? c.pivotY : 0,
      cursorImage: serializeImage(c.cursorImage)
    })) : [];
  }

  function serializeSettings() {
    let settings = null;
    try {
      const saved = localStorage.getItem('amiantoProjectSettings');
      if (saved) settings = JSON.parse(saved);
    } catch (_) {}
    if (!settings) {
      settings = { canvasWidth: gameViewport.width, canvasHeight: gameViewport.height };
    }
    // Ensure width/height reflect current viewport
    settings.canvasWidth = gameViewport.width;
    settings.canvasHeight = gameViewport.height;
    // Nome e ID del progetto corrente (non creare un nuovo progetto al salvataggio)
    const activeName = localStorage.getItem('amiantoActiveProjectName');
    const activeId = localStorage.getItem('amiantoActiveProjectId');
    const nameField = document.getElementById('projectName');
    if (nameField && nameField.value) {
      settings.name = nameField.value.trim();
    } else if (activeName) {
      settings.name = activeName;
    }
    if (!settings.name) settings.name = 'Untitled Project';
    const stableId = getStableProjectId(settings, settings.name);
    if (stableId) settings.id = stableId;
    else if (activeId) settings.id = activeId;
    // Allinea startX/Y/room al player (spawnSettings.isPlayer) — evita drift con walk_character
    try {
      characterFrames.forEach((charData, name) => {
        if (!charData || !charData.spawnSettings || charData.spawnSettings.isPlayer !== true) return;
        const sp = charData.spawnSettings;
        settings.startingPlayer = name;
        if (sp.roomId) {
          settings.startRoomId = sp.roomId;
          settings.startRoom = sp.roomId;
        }
        if (typeof sp.x === 'number' && !isNaN(sp.x)) settings.startX = sp.x;
        if (typeof sp.y === 'number' && !isNaN(sp.y)) settings.startY = sp.y;
      });
    } catch (_) {}
    // Normalize start config types
    if (typeof settings.startX !== 'undefined') settings.startX = Number(settings.startX) || 0;
    if (typeof settings.startY !== 'undefined') settings.startY = Number(settings.startY) || 0;
    // Map startRoomId to startRoom for runtime compatibility
    if (settings.startRoomId && !settings.startRoom) {
      settings.startRoom = settings.startRoomId;
    }
    // Cursor action text overlay (optional)
    const actionTextToggle = document.getElementById('show-cursor-action-text');
    if (actionTextToggle) {
      settings.showCursorActionText = !!actionTextToggle.checked;
    } else if (typeof settings.showCursorActionText === 'undefined') {
      settings.showCursorActionText = false;
    }
    return settings;
  }

  function serializeVariables() {
    return {
      definitions: gameVariableDefinitions.map(v => ({
        name: v.name,
        type: v.type,
        initialValue: v.initialValue
      })),
      state: Game.getState()
    };
  }

  function serializeDialogues() {
    const list = Array.isArray(window.projectDialogues) ? window.projectDialogues : [];
    return list.map(d => normalizeDialogueForSerialize(d)).filter(Boolean);
  }

  function normalizeDialogueForSerialize(raw) {
    const logic = window.AmiantoDialogueLogic;
    if (logic && typeof logic.normalizeDialogueDef === 'function') {
      return logic.normalizeDialogueDef(raw);
    }
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const name = String(raw.name || id).trim() || id;
    const nodesIn = (raw.nodes && typeof raw.nodes === 'object') ? raw.nodes : {};
    const nodes = {};
    Object.keys(nodesIn).forEach(nid => {
      const n = normalizeDialogueNodeForSerialize(nodesIn[nid], nid);
      if (n) nodes[n.id] = n;
    });
    let startNodeId = String(raw.startNodeId || '').trim();
    if (!startNodeId || !nodes[startNodeId]) {
      const keys = Object.keys(nodes);
      startNodeId = keys.length ? keys[0] : '';
    }
    return { id, name, startNodeId, nodes };
  }

  function normalizeDialogueNodeForSerialize(raw, fallbackId) {
    const logic = window.AmiantoDialogueLogic;
    if (logic && typeof logic.normalizeNode === 'function') {
      return logic.normalizeNode(raw, fallbackId);
    }
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || fallbackId || '').trim();
    if (!id) return null;
    const type = String(raw.type || 'end').toLowerCase();
    if (type === 'line') {
      return {
        id,
        type: 'line',
        speaker: String(raw.speaker || '').trim(),
        text: String(raw.text != null ? raw.text : ''),
        next: String(raw.next || '').trim()
      };
    }
    if (type === 'choice') {
      const options = Array.isArray(raw.options) ? raw.options.map((opt, i) => ({
        id: String((opt && opt.id) || `opt_${i}`).trim(),
        text: String((opt && opt.text) != null ? opt.text : '').trim(),
        next: String((opt && opt.next) || '').trim()
      })).filter(o => o.id) : [];
      return { id, type: 'choice', options };
    }
    if (type === 'jump') {
      return { id, type: 'jump', target: String(raw.target || raw.next || '').trim() };
    }
    if (type === 'action') {
      return { id, type: 'action', next: String(raw.next || '').trim(), actions: Array.isArray(raw.actions) ? raw.actions : [] };
    }
    return { id, type: 'end' };
  }

  /** Compact JSON helpers for dialogue condition/actions in the form editor */
  function dialogueConditionToEditorString(cond) {
    if (!cond) return '';
    try { return JSON.stringify(cond); } catch (_) { return ''; }
  }

  function dialogueActionsToEditorString(actions) {
    if (!Array.isArray(actions) || !actions.length) return '';
    try { return JSON.stringify(actions); } catch (_) { return ''; }
  }

  function parseDialogueConditionFromEditor(str) {
    const s = String(str || '').trim();
    if (!s) return undefined;
    try {
      const parsed = JSON.parse(s);
      const logic = window.AmiantoDialogueLogic;
      if (logic && logic.normalizeCondition) {
        return logic.normalizeCondition(parsed) || undefined;
      }
      return parsed;
    } catch (_) {
      return undefined;
    }
  }

  function parseDialogueActionsFromEditor(str) {
    const s = String(str || '').trim();
    if (!s) return undefined;
    try {
      const parsed = JSON.parse(s);
      const logic = window.AmiantoDialogueLogic;
      if (logic && logic.normalizeActions) {
        const list = logic.normalizeActions(parsed);
        return list.length ? list : undefined;
      }
      return Array.isArray(parsed) ? parsed : undefined;
    } catch (_) {
      return undefined;
    }
  }
  
  function serializeEventConditions() {
    function mapToObjectDeep(mapInstance) {
      const obj = {};
      try {
        if (mapInstance && mapInstance.forEach) {
          mapInstance.forEach((v, k) => {
            if (v && typeof v === 'object') {
              obj[String(k)] = JSON.parse(JSON.stringify(v));
            } else {
              obj[String(k)] = v;
            }
          });
        }
      } catch (_) {}
      return obj;
    }
    return {
      objects: mapToObjectDeep(objectEventConditions),
      hotspots: mapToObjectDeep(hotspotEventConditions),
      characters: mapToObjectDeep(characterEventConditions),
      guiButtons: mapToObjectDeep(guiButtonEventConditions),
      inventory: mapToObjectDeep(inventoryEventConditions)
    };
  }

  window.serializeProject = function() {
    syncEditorRoomStateBeforeSerialize();
    syncEditorScriptsToRoomsBeforeSerialize();
    const projectObj = {
      format: 'amianto-game',
      version: 1,
      meta: {
        exportedAt: new Date().toISOString(),
        editor: 'Amianto Editor',
        editorVersion: '0.1'
      },
      settings: serializeSettings(),
      rooms: serializeRooms(),
      roomAnimations: serializeRoomAnimationsCatalog(),
      guis: serializeGUI(),
      characters: serializeCharacters(),
      inventory: serializeInventory(),
      scripts: serializeScripts(),
      attachments: serializeAttachments(),
      cursors: serializeCursors(),
      variables: serializeVariables(),
      dialogues: serializeDialogues(),
      eventConditions: serializeEventConditions(),
      resourcesCatalog: (window.amiantoResources && typeof window.amiantoResources.getCatalog === 'function')
        ? window.amiantoResources.getCatalog()
        : []
    };
    
    // Aggiungi _meta con userId e projectId per il runtime (per risolvere assetId)
    if (currentUser && currentUser.uid) {
      projectObj._meta = projectObj._meta || {};
      projectObj._meta.userId = currentUser.uid;
      
      // Prova a ottenere projectId da settings.id o normalizzando settings.name
      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      const activeProjectId = localStorage.getItem('amiantoActiveProjectId');
      if (projectObj.settings && projectObj.settings.id) {
        projectObj._meta.projectId = projectObj.settings.id;
      } else if (projectObj.settings && projectObj.settings.name) {
        // Normalizza il nome come viene fatto in saveCurrentProject
        projectObj._meta.projectId = normalizeProjectIdFromName(projectObj.settings.name);
      } else if (activeProjectId || activeProjectName) {
        projectObj._meta.projectId = activeProjectId || normalizeProjectIdFromName(activeProjectName);
      }
    }
    
    return projectObj;
  }

  window.serializeProjectToJsonString = function(pretty = true) {
    const obj = window.serializeProject();
    return pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  }

  function downloadBlob(content, fileName, contentType = 'application/json') {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  // Debounce per evitare chiamate multiple OPFS in rapida successione
  let opfsSaveTimeout = null;
  let lastOpfsSaveTime = 0;
  const OPFS_SAVE_DEBOUNCE_MS = 500; // Minimo 500ms tra salvataggi OPFS

  async function saveProjectJsonToOPFS(jsonString, projectName) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return null;
      
      // Debounce: se Ã¨ passato meno di OPFS_SAVE_DEBOUNCE_MS dall'ultimo salvataggio, aspetta
      const now = Date.now();
      const timeSinceLastSave = now - lastOpfsSaveTime;
      
      if (timeSinceLastSave < OPFS_SAVE_DEBOUNCE_MS) {
        // Cancella timeout precedente se esiste
        if (opfsSaveTimeout) {
          clearTimeout(opfsSaveTimeout);
        }
        
        // Ritarda il salvataggio
        return new Promise((resolve) => {
          opfsSaveTimeout = setTimeout(async () => {
            lastOpfsSaveTime = Date.now();
            try {
              const result = await saveProjectJsonToOPFSInternal(jsonString, projectName);
              resolve(result);
            } catch (err) {
              resolve(null); // Silently fail, OPFS is optional
            }
          }, OPFS_SAVE_DEBOUNCE_MS - timeSinceLastSave);
        });
      }
      
      lastOpfsSaveTime = now;
      return await saveProjectJsonToOPFSInternal(jsonString, projectName);
    } catch (err) {
      // Non loggare errori OPFS come warning - Ã¨ solo un fallback opzionale
      // OPFS puÃ² fallire per vari motivi (permessi, sicurezza browser, ecc.)
      return null;
    }
  }
  
  async function saveProjectJsonToOPFSInternal(jsonString, projectName) {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    const projectDir = await root.getDirectoryHandle('amianto-projects', { create: true });
    const safeName = (projectName && projectName.trim() !== '' ? projectName.trim() : 'amianto-project').replace(/[^a-z0-9-_\s]/gi, '_');
    const fileName = `${safeName}.amianto.json`;
    const fileHandle = await projectDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();
    const opfsPath = `amianto-projects/${fileName}`;
    localStorage.setItem('amiantoLastProjectOPFSPath', opfsPath);
    return opfsPath;
  }

  async function saveProjectJsonToFile(jsonString, suggestedName) {
    const defaultName = (suggestedName && suggestedName.trim() !== '' ? suggestedName.trim() : 'amianto-project') + '.amianto.json';
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'Amianto Project JSON', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        showNotification(`Project file saved: ${handle.name}`, 'success');
        return true;
      }
    } catch (err) {
      addDebugMessage('File save dialog cancelled or failed: ' + (err && err.message ? err.message : err), 'warning');
      // fall through to download
    }
    // Fallback: classic download
    downloadBlob(jsonString, defaultName, 'application/json');
    return false;
  }

  // =====================
  // Playtest configuration
  // =====================
  // Choose between 'local' (download/fetch static) or 'server' (save to server via fetch)
  window.AMIANTO_PLAYTEST_MODE = window.AMIANTO_PLAYTEST_MODE || 'local';
  // Optional server endpoint to PUT/POST game.json
  window.AMIANTO_PLAYTEST_ENDPOINT = window.AMIANTO_PLAYTEST_ENDPOINT || '/game.json';

  async function saveGameJsonLocal(jsonString) {
    // No download: cache best-effort to OPFS for quick re-run; runtime will use localStorage/OPFS fallback
    try { await saveProjectJsonToOPFS(jsonString, 'game'); } catch(_) {}
  }

  async function saveGameJsonServer(jsonString) {
    try {
      const res = await fetch(window.AMIANTO_PLAYTEST_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    } catch (err) {
      addDebugMessage('Failed to save game.json to server: ' + (err && err.message ? err.message : err), 'error');
      showNotification('Server save failed. Falling back to local download.', 'warning');
      await saveGameJsonLocal(jsonString);
      return false;
    }
  }

  const EMBEDDED_DATA_URL_RE = /^data:[^;]+;base64,/i;
  const FIRESTORE_ASSET_FIELD_KEYS = new Set([
    'background', 'image', 'toggleIcon', 'backgroundImage', 'balloon', 'balloonImage',
    'cursorImage', 'customFont', 'backgroundRef', 'imageRef', 'toggleIconRef'
  ]);

  function isEmbeddedDataUrl(value) {
    return typeof value === 'string' && EMBEDDED_DATA_URL_RE.test(value);
  }

  function isAssetRefString(value) {
    return typeof value === 'string' && value.startsWith('asset:');
  }

  /** Conta stringhe data:â€¦;base64, nel progetto (immagini, audio, ecc.). */
  function countEmbeddedDataUrls(root) {
    return collectEmbeddedDataUrlStats(root).embeddedAssetCount;
  }

  /** Somma i byte delle stringhe data:â€¦;base64, ancora nel progetto serializzato. */
  function measureEmbeddedDataUrlBytes(root) {
    return collectEmbeddedDataUrlStats(root).embeddedBytes;
  }

  /**
   * Statistiche asset embedded (path, byte, top offenders).
   * @param {*} root
   * @returns {{ embeddedAssetCount: number, embeddedBytes: number, offenders: Array<{path:string,bytes:number}>, largestEmbeddedAsset: {path:string,bytes:number}|null }}
   */
  function collectEmbeddedDataUrlStats(root) {
    const offenders = [];
    const walk = (v, path) => {
      if (typeof v === 'string' && EMBEDDED_DATA_URL_RE.test(v)) {
        const bytes = new Blob([v]).size;
        offenders.push({ path: path || '(root)', bytes });
        return;
      }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      for (const [k, child] of Object.entries(v)) {
        const childPath = path ? `${path}.${k}` : k;
        walk(child, childPath);
      }
    };
    walk(root, '');
    offenders.sort((a, b) => b.bytes - a.bytes);
    const embeddedBytes = offenders.reduce((sum, o) => sum + o.bytes, 0);
    return {
      embeddedAssetCount: offenders.length,
      embeddedBytes,
      offenders,
      largestEmbeddedAsset: offenders[0] || null
    };
  }

  /** Conta base64 solo nei campi asset (esclude scripts/eventConditions dove il testo puÃ² contenere "data:"). */
  function measurePendingAssetDataUrlBytes(projectObj) {
    if (!projectObj || typeof projectObj !== 'object') return 0;
    let total = 0;
    const assetRoots = [
      projectObj.rooms,
      projectObj.guis,
      projectObj.characters,
      projectObj.inventory,
      projectObj.cursors,
      projectObj.resourcesCatalog
    ];
    for (const root of assetRoots) {
      if (root) total += measureEmbeddedDataUrlBytes(root);
    }
    return total;
  }

  function countPendingAssetDataUrls(projectObj) {
    if (!projectObj || typeof projectObj !== 'object') return 0;
    let count = 0;
    const assetRoots = [
      projectObj.rooms,
      projectObj.guis,
      projectObj.characters,
      projectObj.inventory,
      projectObj.cursors,
      projectObj.resourcesCatalog
    ];
    for (const root of assetRoots) {
      if (root) count += countEmbeddedDataUrls(root);
    }
    return count;
  }

  /** Stima = payload canonico (stesso oggetto del salvataggio). */
  function estimateFirestorePayloadBytes(projectObj) {
    return measureFirestorePayloadBytes(projectObj);
  }

  function formatProjectSizeLabel(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function slimResourcesCatalogForFirestore(catalog) {
    if (!Array.isArray(catalog)) return [];
    if (window.amiantoResources && typeof window.amiantoResources.getSlimCatalog === 'function') {
      return window.amiantoResources.getSlimCatalog();
    }
    return catalog.map(row => ({
      assetId: row.assetId,
      name: row.name || '',
      displayName: row.displayName || row.name || '',
      fileName: row.fileName || row.name || ''
    }));
  }

  function collectHotspotOnClickCodesById(projectObj) {
    const codes = new Map();
    if (!projectObj || !Array.isArray(projectObj.rooms)) return codes;
    for (const room of projectObj.rooms) {
      if (!Array.isArray(room.hotspots)) continue;
      for (const h of room.hotspots) {
        const code = h && h.scripts && h.scripts.onClick && h.scripts.onClick.code;
        if (code && String(code).trim()) {
          codes.set(String(h.id), String(code).trim());
        }
      }
    }
    return codes;
  }

  function sanitizeUndefinedDeep(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeUndefinedDeep);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = sanitizeUndefinedDeep(v);
    }
    return out;
  }

  function normalizeScriptKeysInFirestorePayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.scripts && typeof payload.scripts === 'object') {
      const next = {};
      for (const [key, content] of Object.entries(payload.scripts)) {
        next[migrateLegacyScriptKey(key)] = String(content || '');
      }
      payload.scripts = next;
    }
    if (payload.attachments && typeof payload.attachments === 'object') {
      const mapNames = ['roomScripts', 'objectScripts', 'characterScripts', 'inventoryScripts', 'guiScripts'];
      for (const mapName of mapNames) {
        const m = payload.attachments[mapName];
        if (!m || typeof m !== 'object') continue;
        const next = {};
        for (const [k, v] of Object.entries(m)) {
          next[migrateLegacyScriptKey(k)] = String(v || '');
        }
        payload.attachments[mapName] = next;
      }
    }
    if (Array.isArray(payload.cursors)) {
      payload.cursors.forEach(c => {
        if (c && c.scriptName) c.scriptName = migrateLegacyScriptKey(String(c.scriptName));
      });
    }
    const inv = payload.inventory;
    if (inv && typeof inv === 'object' && Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        if (item && item.scriptName != null && String(item.scriptName).trim()) {
          item.scriptName = migrateLegacyScriptKey(String(item.scriptName));
        }
      });
    }
  }

  /** Inventario: solo *Ref (asset:), mai base64 nei campi legacy. */
  function normalizeInventoryAssetRefsForFirestore(inv) {
    if (!inv || typeof inv !== 'object') return;
    const promoteRef = (legacyKey, refKey) => {
      const legacy = inv[legacyKey];
      const existing = inv[refKey];
      const src = existing != null && existing !== '' ? existing : legacy;
      if (src == null || src === '') {
        delete inv[legacyKey];
        delete inv[refKey];
        return;
      }
      if (typeof src !== 'string') {
        delete inv[legacyKey];
        delete inv[refKey];
        return;
      }
      if (isAssetRefString(src)) {
        inv[refKey] = src;
      } else if (isEmbeddedDataUrl(src)) {
        delete inv[refKey];
      } else if (!src.startsWith('data:')) {
        inv[refKey] = src;
      }
      delete inv[legacyKey];
    };
    promoteRef('background', 'backgroundRef');
    promoteRef('toggleIcon', 'toggleIconRef');
    if (Array.isArray(inv.items)) {
      inv.items = inv.items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const next = { ...item };
        const src = next.imageRef != null && next.imageRef !== '' ? next.imageRef : next.image;
        if (typeof src === 'string' && isAssetRefString(src)) {
          next.imageRef = src;
        } else if (typeof src === 'string' && isEmbeddedDataUrl(src)) {
          delete next.imageRef;
        } else if (typeof src === 'string' && src && !src.startsWith('data:')) {
          next.imageRef = src;
        } else {
          delete next.imageRef;
        }
        delete next.image;
        if (next.scriptName != null) next.scriptName = String(next.scriptName);
        return next;
      });
    }
    if (Array.isArray(inv.slots)) {
      inv.slots = inv.slots.filter(s => s && s.id !== '__drawing__');
    }
  }

  function normalizeAssetRefFieldsForFirestore(payload) {
    if (!payload || typeof payload !== 'object') return;
    normalizeInventoryAssetRefsForFirestore(payload.inventory);
    const walk = (node, path) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      for (const [key, val] of Object.entries(node)) {
        const childPath = path ? `${path}.${key}` : key;
        if (FIRESTORE_ASSET_FIELD_KEYS.has(key) && typeof val === 'string') {
          if (isEmbeddedDataUrl(val)) {
            node[key] = null;
          } else if (isAssetRefString(val)) {
            node[key] = val;
          }
        } else if (val && typeof val === 'object') {
          walk(val, childPath);
        }
      }
    };
    walk(payload, '');
  }

  function removeEditorTransientFieldsFromFirestorePayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (Array.isArray(payload.rooms)) {
      for (const room of payload.rooms) {
        if (!Array.isArray(room.hotspots)) continue;
        for (const h of room.hotspots) {
          if (h && h._meta) delete h._meta;
        }
      }
    }
    delete payload._editorCache;
    delete payload._playtestSnapshot;
  }

  function detectDuplicateScriptBodies(scriptsObj) {
    const byBody = new Map();
    const duplicates = [];
    if (!scriptsObj || typeof scriptsObj !== 'object') return duplicates;
    for (const [key, code] of Object.entries(scriptsObj)) {
      const body = String(code || '').trim();
      if (!body) continue;
      if (byBody.has(body)) {
        duplicates.push({ keys: [byBody.get(body), key], bytes: new Blob([body]).size });
      } else {
        byBody.set(body, key);
      }
    }
    return duplicates;
  }

  /** Rimuove scripts Hotspot:* duplicati se giÃ  in rooms[].hotspots[].scripts.onClick */
  function dedupeHotspotScriptsInPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (!payload.scripts || typeof payload.scripts !== 'object') return payload;
    payload.scripts = pruneDuplicateHotspotScriptsFromScriptsObject({ ...payload.scripts }, payload);
    return payload;
  }

  /**
   * Unica sorgente di veritÃ  per payload canonico, stima dimensione ed export slim.
   * @param {Object} projectObj - Progetto da serializeProject() (o equivalente)
   * @returns {Object} Clone normalizzato pronto per JSON.stringify / salvataggio locale
   */
  function prepareProjectPayloadForFirestore(projectObj) {
    if (!projectObj || typeof projectObj !== 'object') {
      return projectObj;
    }
    const payload = sanitizeUndefinedDeep(JSON.parse(JSON.stringify(projectObj)));
    mergeLegacyHotspotScriptsIntoRooms(payload);
    dedupeHotspotScriptsInPayload(payload);
    normalizeScriptKeysInFirestorePayload(payload);
    normalizeAssetRefFieldsForFirestore(payload);
    removeEditorTransientFieldsFromFirestorePayload(payload);
    payload.resourcesCatalog = slimResourcesCatalogForFirestore(projectObj.resourcesCatalog);
    return payload;
  }

  function measureFirestorePayloadBytes(projectObj) {
    const payload = prepareProjectPayloadForFirestore(projectObj);
    return new Blob([JSON.stringify(payload)]).size;
  }

  /**
   * @param {Object} payload - Payload giÃ  preparato o grezzo
   * @param {{ autoStrip?: boolean, warn?: boolean }} [options]
   */
  function assertNoEmbeddedDataUrls(payload, options = {}) {
    const prepared = payload && payload.format === 'amianto-game'
      ? prepareProjectPayloadForFirestore(payload)
      : payload;
    const stats = collectEmbeddedDataUrlStats(prepared);
    const warn = options.warn !== false;
    if (stats.embeddedAssetCount > 0 && warn) {
      const top = stats.offenders.slice(0, 5).map(o => `${o.path} (${formatProjectSizeLabel(o.bytes)})`).join(', ');
      const msg = `[Payload] ${stats.embeddedAssetCount} embedded (base64) assets in payload (${formatProjectSizeLabel(stats.embeddedBytes)}). Upload to storage before saving. Top: ${top}`;
      console.warn(msg, stats);
      addDebugMessage(msg, 'warning');
    }
    if (options.autoStrip && stats.embeddedAssetCount > 0) {
      normalizeAssetRefFieldsForFirestore(prepared.inventory);
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        for (const [key, val] of Object.entries(node)) {
          if (typeof val === 'string' && isEmbeddedDataUrl(val) && FIRESTORE_ASSET_FIELD_KEYS.has(key)) {
            node[key] = null;
          } else if (val && typeof val === 'object') {
            walk(val);
          }
        }
      };
      walk(prepared);
    }
    return stats;
  }

  function getPayloadSectionByteBreakdown(payload) {
    const sections = {};
    if (!payload || typeof payload !== 'object') return sections;
    for (const key of Object.keys(payload)) {
      try {
        sections[key] = new Blob([JSON.stringify(payload[key])]).size;
      } catch (_) {
        sections[key] = 0;
      }
    }
    return sections;
  }

  function debugProjectPayloadSize() {
    const raw = typeof window.serializeProject === 'function' ? window.serializeProject() : null;
    if (!raw) {
      console.warn('[PayloadDebug] serializeProject non disponibile');
      return null;
    }
    const prepared = prepareProjectPayloadForFirestore(raw);
    const jsonString = JSON.stringify(prepared);
    const totalBytes = new Blob([jsonString]).size;
    const embedded = collectEmbeddedDataUrlStats(prepared);
    const pendingEmbedded = collectEmbeddedDataUrlStats({
      rooms: raw.rooms,
      guis: raw.guis,
      characters: raw.characters,
      inventory: raw.inventory,
      cursors: raw.cursors,
      resourcesCatalog: raw.resourcesCatalog
    });
    const breakdown = getPayloadSectionByteBreakdown(prepared);
    const scriptDupes = detectDuplicateScriptBodies(prepared.scripts);
    const report = {
      totalBytes,
      totalLabel: formatProjectSizeLabel(totalBytes),
      embeddedAssetCount: embedded.embeddedAssetCount,
      embeddedBytes: embedded.embeddedBytes,
      largestEmbeddedAsset: embedded.largestEmbeddedAsset,
      topEmbeddedOffenders: embedded.offenders.slice(0, 10),
      pendingBeforePrepare: pendingEmbedded,
      sectionBreakdown: breakdown,
      duplicateScriptBodies: scriptDupes
    };
    console.group('[PayloadDebug] Project payload');
    console.log('Dimensione serializzata (prepared):', report.totalLabel, `(${totalBytes} B)`);
    console.log('Embedded nel payload prepared:', embedded);
    console.log('Embedded negli asset live (pre-prepare):', pendingEmbedded);
    console.log('Breakdown sezioni (byte):', breakdown);
    if (scriptDupes.length) console.warn('Script duplicati (stesso corpo):', scriptDupes);
    console.groupEnd();
    return report;
  }

  /** Allinea nomi ref inventario legacy â†’ campi editor (background, image, â€¦). */
  function migrateLegacyInventoryRefsOnLoad(projectObj) {
    const inv = projectObj && projectObj.inventory;
    if (!inv || typeof inv !== 'object') return;
    if (inv.backgroundRef && !inv.background) inv.background = inv.backgroundRef;
    if (inv.toggleIconRef && !inv.toggleIcon) inv.toggleIcon = inv.toggleIconRef;
    if (Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        if (item && item.imageRef && !item.image) item.image = item.imageRef;
      });
    }
  }

  function migrateEmbeddedAssetsOnProjectLoad(projectObj) {
    if (!projectObj) return { embeddedCount: 0, embeddedBytes: 0 };
    migrateLegacyInventoryRefsOnLoad(projectObj);
    const stats = collectEmbeddedDataUrlStats({
      rooms: projectObj.rooms,
      guis: projectObj.guis,
      characters: projectObj.characters,
      inventory: projectObj.inventory,
      cursors: projectObj.cursors,
      resourcesCatalog: projectObj.resourcesCatalog
    });
    if (stats.embeddedAssetCount > 0) {
      console.warn(
        `[Load] Project has ${stats.embeddedAssetCount} embedded assets (${formatProjectSizeLabel(stats.embeddedBytes)}). ` +
        'Use Save project to migrate them to storage.'
      );
      window.__amiantoEmbeddedAssetsOnLoad = stats;
    } else {
      window.__amiantoEmbeddedAssetsOnLoad = null;
    }
    return stats;
  }

  window.prepareProjectPayloadForFirestore = prepareProjectPayloadForFirestore;
  window.measureFirestorePayloadBytes = measureFirestorePayloadBytes;
  window.collectEmbeddedDataUrlStats = collectEmbeddedDataUrlStats;
  window.assertNoEmbeddedDataUrls = assertNoEmbeddedDataUrls;
  window.debugProjectPayloadSize = debugProjectPayloadSize;
  window.markAmiantoProjectDirty = function() {
    const wasDirty = !!window.__amiantoProjectDirty;
    window.__amiantoProjectDirty = true;
    // Evita flash UI se siamo già dirty (o in mezzo a un save)
    if (!wasDirty && !amiantoPersistInProgress) {
      updateProjectSaveStatusUI('dirty');
    }
    scheduleProjectSizeIndicatorRefresh(350);
    if (typeof scheduleAmiantoDiskPersist === 'function') {
      scheduleAmiantoDiskPersist();
    }
  };

  function clearAmiantoProjectDirty() {
    window.__amiantoProjectDirty = false;
    if (amiantoDiskSaveTimer) {
      clearTimeout(amiantoDiskSaveTimer);
      amiantoDiskSaveTimer = null;
    }
  }

  const AMIANTO_PERIODIC_AUTOSAVE_MS = 45000;
  let amiantoPeriodicAutosaveTimer = null;

  function formatSaveStatusTime(when) {
    if (!when) return '';
    try {
      return new Date(when).toLocaleTimeString();
    } catch (_) {
      return '';
    }
  }

  function updateProjectSaveStatusUI(state, detail) {
    const el = document.getElementById('projectSaveStatus');
    if (!el) return;
    const active = localStorage.getItem('amiantoActiveProjectName');
    if (!active) {
      el.textContent = 'No project open';
      el.style.color = '#666';
      return;
    }
    if (state === 'saving') {
      el.textContent = 'Autosaving…';
      el.style.color = '#ffaa00';
      return;
    }
    if (state === 'dirty') {
      el.textContent = 'Unsaved changes';
      el.style.color = '#ff8844';
      return;
    }
    if (state === 'disk-failed') {
      const t = formatSaveStatusTime(window.__amiantoLastCacheSaveAt);
      el.textContent = 'Disk save failed (cache OK' + (t ? ' ' + t : '') + ')' + (detail ? `: ${detail}` : '');
      el.style.color = '#ff4444';
      el.title = 'Browser cache updated, but the linked .amnt file was not written. Unsaved changes remain for disk.';
      return;
    }
    if (state === 'error') {
      el.textContent = 'Autosave failed' + (detail ? `: ${detail}` : '');
      el.style.color = '#ff4444';
      return;
    }
    if (state === 'cache-saved') {
      const t = formatSaveStatusTime(detail || window.__amiantoLastCacheSaveAt);
      el.textContent = 'Saved to cache' + (t ? ' ' + t : '');
      el.style.color = '#9acd32';
      el.title = 'Project saved to browser cache only (no linked .amnt file, or disk write skipped).';
      return;
    }
    // disk-saved / saved
    const when = detail || window.__amiantoLastDiskSaveAt || window.__amiantoLastCacheSaveAt;
    const t = formatSaveStatusTime(when);
    if (window.__amiantoLastDiskSaveAt && (!detail || detail === window.__amiantoLastDiskSaveAt)) {
      el.textContent = 'Saved to disk' + (t ? ' ' + t : '');
      el.title = 'Linked .amnt file written successfully.';
    } else {
      el.textContent = 'Saved to cache' + (t ? ' ' + t : '');
      el.title = 'Saved to browser cache.';
    }
    el.style.color = '#39ff14';
  }

  function applyPersistResultToSaveStatus(result) {
    if (!result) return;
    if (result.ok === false && result.reason === 'in-progress') return;
    if (result.ok === false && result.reason === 'disk-failed') {
      updateProjectSaveStatusUI(
        'disk-failed',
        result.error && result.error.message ? result.error.message : ''
      );
      return;
    }
    if (result.ok && result.diskPath) {
      updateProjectSaveStatusUI('saved', window.__amiantoLastDiskSaveAt);
      return;
    }
    if (result.ok && result.cacheOnly) {
      updateProjectSaveStatusUI('cache-saved', window.__amiantoLastCacheSaveAt);
      return;
    }
    if (result.ok) {
      updateProjectSaveStatusUI('cache-saved', window.__amiantoLastCacheSaveAt);
    }
  }

  function startAmiantoPeriodicAutosave() {
    if (amiantoPeriodicAutosaveTimer) return;
    amiantoPeriodicAutosaveTimer = setInterval(() => {
      if (!window.__amiantoProjectDirty) return;
      if (amiantoPersistInProgress) return;
      const projectName = localStorage.getItem('amiantoActiveProjectName');
      if (!projectName) return;
      updateProjectSaveStatusUI('saving');
      persistEditorProject({ silent: true, promptForLocation: false })
        .then((result) => {
          applyPersistResultToSaveStatus(result);
        })
        .catch((err) => {
          console.warn('[AutoSave] Periodic save failed:', err);
          updateProjectSaveStatusUI('error', err && err.message ? err.message : 'error');
        });
    }, AMIANTO_PERIODIC_AUTOSAVE_MS);
  }

  function markDialoguesDirty() {
    if (typeof window.markAmiantoProjectDirty === 'function') {
      window.markAmiantoProjectDirty();
    }
  }
  window.markDialoguesDirty = markDialoguesDirty;

  // Avvia autosave periodico (cache + .amnt se collegato)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startAmiantoPeriodicAutosave);
    } else {
      startAmiantoPeriodicAutosave();
    }
  }

  /** Progetti legacy: script solo in scripts['Hotspot:id'] â†’ hotspot.scripts.onClick */
  function mergeLegacyHotspotScriptsIntoRooms(projectObj) {
    if (!projectObj || !projectObj.scripts || !Array.isArray(projectObj.rooms)) return;
    for (const [key, content] of Object.entries(projectObj.scripts)) {
      if (!key.startsWith('Hotspot:')) continue;
      const hotspotId = key.slice('Hotspot:'.length);
      const legacyCode = String(content || '').trim();
      if (!legacyCode) continue;
      for (const room of projectObj.rooms) {
        if (!Array.isArray(room.hotspots)) continue;
        for (const h of room.hotspots) {
          if (String(h.id) !== hotspotId) continue;
          if (!h.scripts) h.scripts = {};
          if (!h.scripts.onClick) h.scripts.onClick = { code: '', enabled: false };
          const embedded = String(h.scripts.onClick.code || '').trim();
          if (!embedded) {
            h.scripts.onClick.code = legacyCode;
            h.scripts.onClick.enabled = true;
          }
        }
      }
    }
  }
  window.mergeLegacyHotspotScriptsIntoRooms = mergeLegacyHotspotScriptsIntoRooms;

  async function getProjectsForUI(userId) {
    if (!currentUser || !currentUser.username) return [];
    return loadProjectsFromCache(currentUser.username);
  }

  async function loadAndRenderProjectsTab() {
    const container = document.getElementById('projects-list-container');
    const currentProjectInfo = document.getElementById('current-project-info');
    const currentProjectName = document.getElementById('current-project-name');
    const currentProjectUpdated = document.getElementById('current-project-updated');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="text-muted mt-3">Loading projects...</p>
      </div>
    `;

    try {
      const projects = await getProjectsForUI(currentUser?.uid);
      renderProjectsListInTab(projects, container);

      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (activeProjectName && currentProjectInfo && currentProjectName && currentProjectUpdated) {
        const project = projects.find(p => p.settings?.name === activeProjectName || p.name === activeProjectName);
        if (project) {
          currentProjectInfo.style.display = 'block';
          currentProjectName.textContent = activeProjectName;
          currentProjectUpdated.textContent = project.updatedAt
            ? `Updated: ${new Date(project.updatedAt).toLocaleString()}`
            : '';
        }
      }
    } catch (error) {
      console.error('[ProjectsTab] Errore:', error);
      container.innerHTML = `<div class="alert alert-danger">Error loading projects</div>`;
    }
  }

  const containerHandlers = new WeakMap();

  function renderProjectsListInTab(projects, container) {
    if (!container) return;

    const hasProjects = Array.isArray(projects) && projects.length > 0;

    if (hasProjects) {
      const projectsHtml = projects.map((p) => {
        const normalized = normalizeProject(p);
        const name = normalized.settings.name;
        const updated = normalized.updatedAt || normalized.createdAt || '';
        const updatedShort = updated ? new Date(updated).toLocaleString() : '';
        const isActive = name === localStorage.getItem('amiantoActiveProjectName');
        const filePath = normalized.filePath || getProjectFilePath(name);

        return `
          <div class="list-group-item bg-secondary text-light mb-2 ${isActive ? 'border border-success' : ''}" data-project-name="${name}">
            <div class="d-flex justify-content-between align-items-start">
              <div class="flex-grow-1">
                <strong>${name}</strong>
                ${isActive ? ' <span class="badge bg-success">Active</span>' : ''}
                ${updatedShort ? `<br><small class="text-muted">Updated: ${updatedShort}</small>` : ''}
                ${filePath ? `<br><small class="text-muted" title="${filePath}">File: ${filePath}</small>` : ''}
              </div>
              <div class="btn-group btn-group-sm ms-2">
                <button class="btn btn-success" data-action="open" data-project-name="${name}" ${isActive ? 'disabled' : ''}>
                  ${isActive ? 'Active' : 'Open'}
                </button>
                <button class="btn btn-outline-danger" data-action="delete" data-project-name="${name}">
                  Delete
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `<div class="list-group">${projectsHtml}</div>`;
    } else {
      container.innerHTML = `
        <div class="text-center py-4">
          <p class="text-muted">No projects yet. Create a new one (.amnt) or load a project file.</p>
        </div>
      `;
    }

    const existingHandler = containerHandlers.get(container);
    if (existingHandler) container.removeEventListener('click', existingHandler);

    const clickHandler = async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const projectName = btn.getAttribute('data-project-name');

      if (action === 'open' && projectName) {
        try {
          showNotification(`Loading "${projectName}"...`, 'info');
          await openProjectByName(projectName);
          await loadAndRenderProjectsTab();
          showNotification(`Project "${projectName}" opened`, 'success');
        } catch (error) {
          console.error('[ProjectsTab] Errore apertura:', error);
          showNotification('Error opening project', 'error');
        }
      } else if (action === 'delete' && projectName) {
        try {
          await deleteProjectByName(projectName);
          await loadAndRenderProjectsTab();
        } catch (error) {
          console.error('[ProjectsTab] Errore eliminazione:', error);
          showNotification('Error deleting project', 'error');
        }
      }
    };

    container.addEventListener('click', clickHandler);
    containerHandlers.set(container, clickHandler);
  }

  function enableOtherTabs(enabled) {
    ['resources', 'rooms', 'inventory', 'characters', 'animations', 'gui', 'cursors', 'scripts'].forEach(tabId => {
      const button = document.querySelector(`[data-section="${tabId}"]`);
      if (button) {
        button.disabled = !enabled;
        button.classList.toggle('disabled', !enabled);
      }
    });
    const playtestButton = document.getElementById('nav-playtest-btn');
    if (playtestButton) {
      playtestButton.disabled = !enabled;
      playtestButton.classList.toggle('disabled', !enabled);
    }
  }

  function renderProjectsList(projects, container) {
    if (!container) return;
    if (!Array.isArray(projects)) projects = [];

    const hasProjects = projects.length > 0;
    let projectsHtml = '';
    if (hasProjects) {
      projectsHtml = projects.map((p, i) => {
        const normalized = normalizeProject(p, i);
        const name = normalized.settings.name;
        const updated = normalized.updatedAt || normalized.createdAt || '';
        const updatedShort = updated ? new Date(updated).toLocaleString() : '';
        return `
          <li class="list-group-item bg-secondary text-light d-flex justify-content-between align-items-center project-item" data-project-name="${name}">
            <div class="flex-grow-1">
              <strong>${name}</strong>
              ${updatedShort ? `<br><small class="text-muted">Updated: ${updatedShort}</small>` : ''}
            </div>
            <button class="btn btn-success btn-sm ms-2" data-action="open" data-project-name="${name}">
              Open
            </button>
          </li>
        `;
      }).join('');
    }

    container.innerHTML = `
      ${hasProjects ? `
        <div class="mb-3"><p class="text-muted">Select an existing project or create a new one:</p></div>
        <div class="mb-3" style="max-height: 400px; overflow-y: auto;">
          <ul class="list-group">${projectsHtml}</ul>
        </div>
      ` : `
        <div class="text-center py-4">
          <p class="text-muted">No projects yet. Create a new one (.amnt) or load a project file.</p>
        </div>
      `}
      <div class="mb-3">
        <label class="form-label text-muted" for="new-project-name-input">New project name</label>
        <input type="text" class="form-control form-control-lg bg-dark text-light border-secondary" id="new-project-name-input" placeholder="My Adventure" autocomplete="off">
      </div>
      <div class="d-grid gap-2">
        <button class="btn btn-primary btn-lg" id="btn-create-new-project" type="button">
          Create Project
        </button>
        <button class="btn btn-outline-light btn-lg" id="btn-load-project-modal" type="button">
          Load Project
        </button>
      </div>
    `;
  }

  async function registerImportedProject(jsonString) {
    ensureCurrentUser();
    let projectObj;
    try {
      projectObj = JSON.parse(jsonString);
    } catch (_) {
      return;
    }
    const name = projectObj?.settings?.name;
    if (!name) return;

    const arr = loadProjectsFromCache(currentUser.username);
    if (findProjectCacheIndex(arr, { name }) < 0) {
      arr.push(normalizeProject({
        settings: { name, id: projectObj.settings.id },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'import'
      }));
      saveProjectsToCache(currentUser.username, arr);
      updateAppState({ projects: arr });
    }

    localStorage.setItem(`amiantoProject_${currentUser.username}:${name}`, jsonString);
    localStorage.setItem('amiantoActiveProjectName', name);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    if (projectObj.settings?.id) {
      localStorage.setItem('amiantoActiveProjectId', projectObj.settings.id);
    }
  }

  window.loadProjectFromFile = async function loadProjectFromFile() {
    ensureCurrentUser();

    let text = null;
    let filePath = null;

    let fileHandle = null;

    if (window.amiantoNativeFs) {
      filePath = await window.amiantoNativeFs.showOpenDialog();
      if (!filePath) return;
      text = await readLargeTextFile(filePath);
    } else if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Amianto Project', accept: { 'application/json': ['.amnt', '.json'] } }],
        multiple: false
      });
      fileHandle = handle;
      const file = await handle.getFile();
      text = await file.text();
      filePath = file.name;
    } else {
      const input = document.getElementById('project-file-input');
      if (!input) {
        showNotification('File loading is not supported in this browser', 'warning');
        return;
      }
      text = await new Promise((resolve, reject) => {
        input.onchange = async () => {
          const file = input.files && input.files[0];
          input.value = '';
          if (!file) { reject(new DOMException('Aborted', 'AbortError')); return; }
          filePath = file.name;
          try { resolve(await file.text()); } catch (err) { reject(err); }
        };
        input.click();
      });
    }

    if (!text || !String(text).trim()) {
      showNotification('Selected project file is empty or unreadable', 'danger');
      return;
    }

    try {
      showNotification('Loading project…', 'info');
      await importAmntContent(text, filePath);
    } catch (amntErr) {
      if (amntErr && amntErr.name === 'AbortError') return;
      console.error('[Load] importAmntContent failed:', amntErr);
      // Legacy plain amianto-game JSON (not .amnt package)
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.format === 'amianto-amnt') {
          throw amntErr;
        }
        if (parsed && parsed.format === 'amianto-game') {
          await window.importProjectFromJson(text);
          await registerImportedProject(text);
        } else {
          throw amntErr;
        }
      } catch (fallbackErr) {
        console.error('[Load] Project load failed:', fallbackErr);
        showNotification(
          'Failed to load project: ' + (fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr),
          'danger'
        );
        return;
      }
    }

    const loadedName = localStorage.getItem('amiantoActiveProjectName');
    if (loadedName && fileHandle) {
      projectFileHandles.set(loadedName, fileHandle);
    }

    enableOtherTabs(true);
    await loadAndRenderProjectsTab();
    showNotification('Project loaded', 'success');
  };

  /** Legge file di testo grandi via IPC a chunk (Electron). */
  async function readLargeTextFile(filePath) {
    const fsApi = window.amiantoNativeFs;
    if (!fsApi) throw new Error('Native FS unavailable');

    if (typeof fsApi.readFileChunkedBegin === 'function') {
      const { id, length } = await fsApi.readFileChunkedBegin(filePath);
      try {
        const CHUNK = 512 * 1024;
        const parts = [];
        let done = false;
        while (!done) {
          const next = await fsApi.readFileChunkedNext(id, CHUNK);
          if (next.chunk) parts.push(next.chunk);
          done = !!next.done;
        }
        const text = parts.join('');
        if (typeof length === 'number' && length > 0 && text.length !== length) {
          console.warn('[Load] Chunked read length mismatch:', text.length, 'vs', length);
        }
        return text;
      } catch (err) {
        try { await fsApi.readFileChunkedAbort(id); } catch (_) {}
        throw err;
      }
    }

    return await fsApi.readFile(filePath);
  }

  /**
   * Autosave su cache locale (localStorage) come fallback temporaneo
   * @param {string} projectName - Nome del progetto
   * @param {string} jsonString - JSON serializzato del progetto
   * 
   * GIÃ€ IMPLEMENTATO: localStorage Ã¨ giÃ  usato per cache
   * AGGIUNTO: Questa funzione centralizza l'autosave su cache
   */
  function autosaveToCache(projectName, jsonString) {
    try {
      if (!currentUser || !projectName) return;

      // Salva in localStorage come backup temporaneo
      const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
      localStorage.setItem(projectKey, jsonString);
      localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
      
      // Aggiorna timestamp cache
      const cacheMeta = {
        savedAt: new Date().toISOString(),
        source: 'cache'
      };
      localStorage.setItem(`${projectKey}_meta`, JSON.stringify(cacheMeta));

      console.log('[Cache] Autosave completato su cache locale');
    } catch (error) {
      console.error('[Cache] Errore autosave cache:', error);
    }
  }

  // Save current project for current user (localStorage + OPFS)
  /**
   * Converte un dataURL in un File object per l'upload
   * @param {string} dataURL - Data URL dell'immagine
   * @param {string} fileName - Nome del file
   * @returns {Promise<File|null>} - File object o null se errore
   */
  async function dataURLtoFile(dataURL, fileName) {
    try {
      const arr = dataURL.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], fileName, { type: mime });
    } catch (error) {
      console.error('[Asset] Errore conversione dataURL to File:', error);
      return null;
    }
  }

  /**
   * Raccoglie tutti gli asset dal progetto che sono ancora dataURL e li carica nello storage locale
   * @param {Object} projectObj - Oggetto progetto serializzato
   * @param {string} projectId - ID del progetto
   * @returns {Promise<Object>} - Progetto aggiornato con assetId invece di dataURL
   */
  async function saveAllAssetsToStorage(projectObj, projectId) {
    const updatedProject = JSON.parse(JSON.stringify(projectObj)); // Deep clone
    let savedCount = 0;
    let errorCount = 0;

    // Funzione helper per generare un assetId determinista per i frame dei character
    // Basato su character/direction/index per garantire che lo stesso frame abbia sempre lo stesso ID
    const generateFrameAssetId = (characterName, direction, index, animationName = null) => {
      const safeCharName = (characterName || 'char').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const safeAnim = animationName
        ? `_${String(animationName).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
        : '';
      const safeDir = (direction || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      return `frame_${safeCharName}${safeAnim}_${safeDir}_${index}`;
    };

    // Funzione helper per processare un asset
    const processAsset = async (assetValue, assetType, assetName, subfolder = null, existingAssetId = null, overwrite = false) => {
      // Se Ã¨ giÃ  un assetId (prefisso "asset:"), salta
      if (typeof assetValue === 'string' && assetValue.startsWith('asset:')) {
        return assetValue;
      }
      
      // Se Ã¨ un oggetto Image, convertilo prima in dataURL
      let dataURL = null;
      if (assetValue && typeof assetValue === 'object' && (assetValue.src || (assetValue.width && assetValue.height))) {
        // Ãˆ un oggetto Image, convertilo in dataURL
        try {
          dataURL = imageToDataURL(assetValue);
          if (!dataURL) {
            console.warn(`[Asset] Impossibile convertire Image in dataURL per ${assetName}`);
            errorCount++;
            return null; // Non possiamo processare questo asset
          }
          console.log(`[Asset] Image convertita in dataURL per ${assetName}`);
        } catch (error) {
          console.error(`[Asset] Errore conversione Image per ${assetName}:`, error);
          errorCount++;
          return null;
        }
      } else if (typeof assetValue === 'string' && assetValue.startsWith('data:image/')) {
        dataURL = assetValue;
      } else if (typeof assetValue === 'string' && assetValue.startsWith('blob:')) {
        console.warn(`[Asset] blob URL non persistibile per ${assetName}`);
        errorCount++;
        return null;
      } else if (assetValue === null || assetValue === undefined) {
        // Valore null/undefined, mantieni cosÃ¬
        return assetValue;
      } else {
        // Non Ã¨ nÃ© un assetId, nÃ© un dataURL, nÃ© un Image - potrebbe essere un valore non-immagine
        // Verifica se Ã¨ un oggetto con proprietÃ  img (come i frame dei character)
        if (assetValue && typeof assetValue === 'object' && assetValue.img) {
          // Ãˆ un oggetto frame con proprietÃ  img, processa l'immagine
          const imgDataURL = imageToDataURL(assetValue.img);
          if (imgDataURL) {
            dataURL = imgDataURL;
            console.log(`[Asset] Frame object convertito in dataURL per ${assetName}`);
          } else {
            console.warn(`[Asset] Impossibile convertire frame.img in dataURL per ${assetName}`);
            errorCount++;
            return assetValue; // Mantieni originale se fallisce
          }
        } else {
          // Non Ã¨ un asset immagine, mantieni come Ã¨
          return assetValue;
        }
      }
      
      // Se abbiamo un dataURL (da stringa, da Image, o da frame object), convertilo e caricalo
      if (dataURL) {
        try {
          const fileName = assetName || `asset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
          const file = await dataURLtoFile(dataURL, fileName);
          if (!file) {
            console.warn(`[Asset] Impossibile convertire dataURL in File per ${assetName}`);
            errorCount++;
            return dataURL; // Mantieni dataURL originale se fallisce
          }

          // Se esiste giÃ  un assetId per questo asset, usalo
          // IMPORTANTE: Sovrascrivi solo se Ã¨ un dataURL nuovo/modificato, non se Ã¨ giÃ  un assetId
          const finalAssetId = existingAssetId || null;
          // Sovrascrivi solo se:
          // 1. Ãˆ esplicitamente richiesto (overwrite=true)
          // 2. O se esiste giÃ  un assetId E il valore corrente Ã¨ un dataURL (modificato)
          const shouldOverwrite = overwrite || (!!existingAssetId && dataURL && typeof assetValue === 'string' && assetValue.startsWith('data:image/'));

          const { assetId } = await uploadImage(file, projectId, assetType, { 
            assetId: finalAssetId, 
            overwriteExisting: shouldOverwrite,
            subfolder 
          });
          
          if (shouldOverwrite && existingAssetId) {
            console.log(`[Asset] âœ… Asset sovrascritto: ${assetName} -> asset:${assetId}${subfolder ? ` (in ${subfolder})` : ''}`);
          } else {
            console.log(`[Asset] âœ… Asset salvato: ${assetName} -> asset:${assetId}${subfolder ? ` (in ${subfolder})` : ''}`);
          }
          savedCount++;
          
          // Se Ã¨ un character frame, traccia l'assetId per possibile cleanup se il salvataggio fallisce
          if (assetType === 'character' && assetId) {
            unsavedCharacterAssetIds.add(assetId);
            console.log(`[Asset] Frame character tracciato per cleanup (assetId: ${assetId})`);
          }
          
          return `asset:${assetId}`;
        } catch (error) {
          console.error(`[Asset] âŒ Errore salvataggio asset ${assetName}:`, error);
          errorCount++;
          return dataURL; // Mantieni dataURL originale se fallisce
        }
      }
      
      return assetValue;
    };

    // Processa tutti i background delle room
    if (updatedProject.rooms && Array.isArray(updatedProject.rooms)) {
      for (const room of updatedProject.rooms) {
        // Costruisci subfolder per questa stanza: rooms/roomname
        const roomName = room.name || room.id;
        const roomSubfolder = `rooms/${roomName}`;
        
        if (room.background) {
          room.background = await processAsset(room.background, 'background', `room_${room.id}_background`, roomSubfolder);
        }
        
        // Processa foregrounds
        if (room.foregrounds && Array.isArray(room.foregrounds)) {
          for (const fg of room.foregrounds) {
            if (fg.image) {
              fg.image = await processAsset(fg.image, 'foreground', `room_${room.id}_fg_${fg.id || 'unknown'}`, roomSubfolder);
            }
          }
        }
        
        // Processa scene objects
        if (room.sceneObjects && Array.isArray(room.sceneObjects)) {
          for (const obj of room.sceneObjects) {
            if (obj.image) {
              obj.image = await processAsset(obj.image, 'sprite', `room_${room.id}_obj_${obj.id || 'unknown'}`, roomSubfolder);
            }
          }
        }
      }
    }

    // Processa GUI backgrounds e button images
    if (updatedProject.guis && Array.isArray(updatedProject.guis)) {
      for (const gui of updatedProject.guis) {
        if (gui.background) {
          gui.background = await processAsset(gui.background, 'gui', `gui_${gui.id}_background`);
        }
        
        if (gui.buttons && Array.isArray(gui.buttons)) {
          for (const btn of gui.buttons) {
            if (btn.backgroundImage) {
              btn.backgroundImage = await processAsset(btn.backgroundImage, 'gui', `gui_${gui.id}_btn_${btn.id || 'unknown'}`);
            }
          }
        }

        if (gui.type === 'DialogBox' && gui.settings && typeof gui.settings === 'object') {
          const st = gui.settings;
          if (st.balloon && typeof st.balloon === 'string' && st.balloon.startsWith('data:image/')) {
            st.balloon = await processAsset(st.balloon, 'gui', `gui_${gui.id}_dialog_balloon`);
          }
          const cf = st.customFont;
          if (cf && typeof cf === 'string' && cf.startsWith('data:') && !cf.startsWith('data:image/')) {
            let ext = 'ttf';
            if (cf.includes('woff2') || cf.includes('font/woff2')) ext = 'woff2';
            else if (cf.includes('woff') || cf.includes('font/woff')) ext = 'woff';
            else if (cf.includes('otf') || cf.includes('font/otf')) ext = 'otf';
            try {
              const file = await dataURLtoFile(cf, `gui_${gui.id}_dialog_font.${ext}`);
              if (file) {
                const existingId = (typeof cf === 'string' && cf.startsWith('asset:'))
                  ? cf.replace('asset:', '')
                  : null;
                const { assetId } = await uploadImage(file, projectId, 'gui', {
                  assetId: existingId,
                  overwriteExisting: true
                });
                st.customFont = `asset:${assetId}`;
              }
            } catch (fontErr) {
              console.error('[Asset] Dialog font upload failed:', fontErr);
            }
          }
        }
      }
    }

    // Processa character frames
    // IMPORTANTE: Verifica che il character esista ancora in characterFrames prima di processarlo
    // Questo evita di ricreare frame per character eliminati
    if (updatedProject.characters && Array.isArray(updatedProject.characters)) {
      for (const char of updatedProject.characters) {
        // Costruisci subfolder per questo character: characters/charactername
        const characterName = char.name || char.id;
        
        // Verifica che il character esista ancora in characterFrames
        // Se non esiste, significa che Ã¨ stato eliminato e non dovremmo processare i suoi frame
        if (!characterFrames.has(characterName)) {
          console.warn(`[Asset] âš ï¸ Character "${characterName}" non trovato in characterFrames, salto processamento frame (probabilmente eliminato)`);
          const clearDirs = (dirs) => {
            if (!dirs) return;
            for (const dirData of Object.values(dirs)) {
              if (dirData.frames) dirData.frames = [];
            }
          };
          clearDirs(char.directions);
          if (char.animations) {
            Object.values(char.animations).forEach(anim => clearDirs(anim.directions));
          }
          continue;
        }
        
        const characterSubfolder = `characters/${characterName}`;
        const originalChar = projectObj.characters?.find(c => (c.name || c.id) === characterName);

        const processCharacterDirectionsFrames = async (directionsMap, animationName = null) => {
          if (!directionsMap) return;
          const originalDirs = animationName
            ? originalChar?.animations?.[animationName]?.directions
            : originalChar?.directions;
          const memDirs = animationName
            ? characterFrames.get(characterName)?.animations?.[animationName]?.directions
            : characterFrames.get(characterName)?.directions;

          for (const [dir, dirData] of Object.entries(directionsMap)) {
            if (!dirData.frames || !Array.isArray(dirData.frames)) continue;
            for (let i = 0; i < dirData.frames.length; i++) {
              if (!dirData.frames[i]) continue;
              const originalFrame = dirData.frames[i];
              const frameLabel = animationName ? `${characterName}/${animationName}/${dir}/${i}` : `${characterName}/${dir}/${i}`;

              if (originalFrame && typeof originalFrame === 'object' && originalFrame.mirror) {
                console.log(`[Asset] Frame specchiato saltato per ${frameLabel}`);
                continue;
              }

              let frameToCheck = originalFrame;
              let frameToProcess = originalFrame;
              if (originalFrame && typeof originalFrame === 'object' && originalFrame.img) {
                frameToCheck = originalFrame.img;
                frameToProcess = originalFrame.img;
              } else if (typeof originalFrame === 'string') {
                frameToCheck = originalFrame;
                frameToProcess = originalFrame;
              }

              let existingAssetId = null;
              const isAlreadyAssetId = typeof frameToCheck === 'string' && frameToCheck.startsWith('asset:');
              const isDataURL = typeof frameToCheck === 'string' && frameToCheck.startsWith('data:image/');
              const isImageObject = frameToCheck && typeof frameToCheck === 'object' && (frameToCheck.src || (frameToCheck.width && frameToCheck.height));

              if (isAlreadyAssetId) {
                existingAssetId = frameToCheck.replace('asset:', '');
              } else if (isDataURL || isImageObject) {
                if (originalDirs?.[dir]?.frames?.[i]) {
                  let originalFrameValue = originalDirs[dir].frames[i];
                  if (originalFrameValue && typeof originalFrameValue === 'object' && originalFrameValue.img) {
                    originalFrameValue = originalFrameValue.img;
                  }
                  if (typeof originalFrameValue === 'string' && originalFrameValue.startsWith('asset:')) {
                    existingAssetId = originalFrameValue.replace('asset:', '');
                  }
                }
                if (!existingAssetId) {
                  existingAssetId = generateFrameAssetId(characterName, dir, i, animationName);
                }
              }

              const assetName = animationName
                ? `char_${char.name}_${animationName}_${dir}_${i}`
                : `char_${char.name}_${dir}_${i}`;

              dirData.frames[i] = await processAsset(
                frameToProcess,
                'character',
                assetName,
                characterSubfolder,
                existingAssetId,
                isDataURL || isImageObject
              );

              if ((isDataURL || isImageObject) &&
                  typeof dirData.frames[i] === 'string' && dirData.frames[i].startsWith('asset:')) {
                const frameObj = memDirs?.[dir]?.frames?.[i];
                let frameImg = null;
                if (frameObj && typeof frameObj === 'object' && frameObj.img) frameImg = frameObj.img;
                else if (frameObj && typeof frameObj === 'object' && frameObj.src) frameImg = frameObj;
                if (frameImg && unsavedCharacterFrames.has(frameImg)) {
                  unsavedCharacterFrames.delete(frameImg);
                }
              }
            }
          }
        };

        await processCharacterDirectionsFrames(char.directions, null);
        if (char.animations) {
          for (const [animName, animData] of Object.entries(char.animations)) {
            if (animName && animData) {
              await processCharacterDirectionsFrames(animData.directions, animName);
            }
          }
        }
      }
    }

    // Processa room animation frames (catalogo Animations tab)
    if (updatedProject.roomAnimations && Array.isArray(updatedProject.roomAnimations)) {
      for (const anim of updatedProject.roomAnimations) {
        if (!anim || !anim.id || !Array.isArray(anim.frames)) continue;
        const safeAnimName = String(anim.name || anim.id).replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const animSubfolder = `animations/${safeAnimName}`;
        const liveAnim = roomAnimationsCatalog.get(anim.id);

        for (let i = 0; i < anim.frames.length; i++) {
          const frameRef = anim.frames[i];
          if (!frameRef) continue;

          const liveFrame = liveAnim && liveAnim.frames ? liveAnim.frames[i] : null;
          if (liveFrame && liveFrame.img) {
            const mapped = imageAssetMap.get(liveFrame.img);
            if (mapped && mapped.assetId) {
              anim.frames[i] = `asset:${mapped.assetId}`;
              continue;
            }
          }

          let frameToProcess = frameRef;
          if (liveFrame && liveFrame.img && (
            typeof frameRef !== 'string' ||
            frameRef.startsWith('blob:') ||
            frameRef.startsWith('data:image/')
          )) {
            frameToProcess = liveFrame.img;
          }

          let existingAssetId = null;
          if (typeof frameRef === 'string' && frameRef.startsWith('asset:')) {
            existingAssetId = frameRef.replace('asset:', '');
          } else {
            existingAssetId = `animframe_${String(anim.id).replace(/[^a-z0-9_-]/gi, '_')}_${i}`;
          }

          const needsUpload = typeof frameRef === 'string' && (
            frameRef.startsWith('data:image/') || frameRef.startsWith('blob:')
          ) || (frameToProcess && typeof frameToProcess === 'object');

          const converted = await processAsset(
            frameToProcess,
            'animation',
            `room_anim_${anim.id}_frame_${i}`,
            animSubfolder,
            existingAssetId,
            needsUpload
          );

          if (converted) {
            anim.frames[i] = converted;
            if (liveFrame && liveFrame.img && typeof converted === 'string' && converted.startsWith('asset:')) {
              imageAssetMap.set(liveFrame.img, {
                assetId: converted.replace('asset:', ''),
                type: 'animation',
                projectId
              });
            }
          } else {
            anim.frames[i] = null;
          }
        }
        anim.frames = anim.frames.filter(Boolean);
      }
    }

    // Processa inventory (background, toggle icon, item images)
    const inv = updatedProject.inventory;
    if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
      const invFolder = 'inventory';
      if (inv.background || inv.backgroundRef) {
        const converted = await processAsset(
          inv.background || inv.backgroundRef,
          'inventory',
          'inventory_background',
          invFolder
        );
        inv.background = converted;
        if (typeof converted === 'string' && converted.startsWith('asset:')) inv.backgroundRef = converted;
      }
      if (inv.toggleIcon || inv.toggleIconRef) {
        const converted = await processAsset(
          inv.toggleIcon || inv.toggleIconRef,
          'inventory',
          'inventory_toggle_icon',
          invFolder
        );
        inv.toggleIcon = converted;
        if (typeof converted === 'string' && converted.startsWith('asset:')) inv.toggleIconRef = converted;
      }
      if (Array.isArray(inv.items)) {
        for (const item of inv.items) {
          if (!item) continue;
          const src = item.image || item.imageRef;
          if (!src) continue;
          const converted = await processAsset(
            src,
            'inventory',
            `inventory_item_${item.id || item.name || 'unknown'}`,
            invFolder
          );
          item.image = converted;
          if (typeof converted === 'string' && converted.startsWith('asset:')) item.imageRef = converted;
        }
      }
    }

    // Processa cursors
    if (updatedProject.cursors && Array.isArray(updatedProject.cursors)) {
      for (const cursor of updatedProject.cursors) {
        const src = cursor.cursorImage || cursor.image;
        if (!src) continue;
        const converted = await processAsset(cursor.cursorImage || cursor.image, 'cursor', `cursor_${cursor.id || 'unknown'}`);
        cursor.cursorImage = converted;
        if (cursor.image !== undefined) cursor.image = converted;
      }
    }

    console.log(`[Asset] ðŸ“Š Salvataggio asset completato: ${savedCount} salvati, ${errorCount} errori`);
    
    // Verifica finale: controlla che tutti gli asset siano stati salvati correttamente
    if (errorCount > 0) {
      console.warn(`[Asset] âš ï¸ ${errorCount} asset non sono stati salvati correttamente. Verifica i log sopra per dettagli.`);
    } else {
      console.log(`[Asset] âœ… Tutti gli asset sono stati salvati con successo nello storage locale`);
    }
    
    // Controllo finale: verifica se ci sono ancora dataURL o oggetti Image nel progetto e convertili
    const finalConversion = async (obj, path = 'root') => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (value === null || value === undefined) {
          continue;
        }
        
        // Se Ã¨ un array, processa ogni elemento
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (item && typeof item === 'object') {
              // Se Ã¨ un oggetto Image, processalo direttamente
              if (item.src || (item.width && item.height)) {
                console.log(`[Asset] ðŸ”„ Conversione oggetto Image rimanente in ${currentPath}[${i}]`);
                const converted = await processAsset(item, 'unknown', `${currentPath}[${i}]`);
                if (converted && converted.startsWith('asset:')) {
                  value[i] = converted;
                  savedCount++;
                }
              } else {
                // Altrimenti processa ricorsivamente
                await finalConversion(item, `${currentPath}[${i}]`);
              }
            } else if (typeof item === 'string' && item.startsWith('data:image/')) {
              // Trovato un dataURL in un array, convertilo
              console.log(`[Asset] ðŸ”„ Conversione dataURL rimanente in ${currentPath}[${i}]`);
              const converted = await processAsset(item, 'unknown', `${currentPath}[${i}]`);
              if (converted && converted.startsWith('asset:')) {
                value[i] = converted;
                savedCount++;
              }
            }
          }
        } 
        // Se Ã¨ un oggetto, verifica se Ã¨ un oggetto Image
        else if (typeof value === 'object') {
          // Se Ã¨ un oggetto Image, processalo direttamente
          if (value.src || (value.width && value.height)) {
            console.log(`[Asset] ðŸ”„ Conversione oggetto Image rimanente in ${currentPath}`);
            const converted = await processAsset(value, 'unknown', currentPath);
            if (converted && converted.startsWith('asset:')) {
              obj[key] = converted;
              savedCount++;
            }
          } else {
            // Altrimenti processa ricorsivamente
            await finalConversion(value, currentPath);
          }
        } 
        // Se Ã¨ una stringa dataURL, convertila
        else if (typeof value === 'string' && value.startsWith('data:image/')) {
          console.log(`[Asset] ðŸ”„ Conversione dataURL rimanente in ${currentPath}`);
          const converted = await processAsset(value, 'unknown', currentPath);
          if (converted && converted.startsWith('asset:')) {
            obj[key] = converted;
            savedCount++;
          }
        }
      }
    };
    
    // Esegui la conversione finale su tutto il progetto
    console.log('[Asset] ðŸ” Controllo finale per dataURL rimanenti...');
    await finalConversion(updatedProject, 'project');
    console.log(`[Asset] âœ… Controllo finale completato: ${savedCount} asset totali salvati, ${errorCount} errori`);
    
    return updatedProject;
  }

  // ================================
  // .AMNT PROJECT FILE (single file)
  // ================================

  const projectFileHandles = new Map();

  function hasLinkedAmntFilePath(projectName) {
    if (!projectName) return false;
    if (projectFileHandles.has(projectName)) return true;
    const path = getProjectFilePath(projectName);
    return !!(path && window.amiantoNativeFs);
  }

  function scheduleAmiantoDiskPersist() {
    const projectName = localStorage.getItem('amiantoActiveProjectName');
    if (!projectName || !hasLinkedAmntFilePath(projectName)) return;
    if (amiantoPersistInProgress) return; // verrà ripianificato a fine save se ancora dirty
    if (amiantoDiskSaveTimer) clearTimeout(amiantoDiskSaveTimer);
    amiantoDiskSaveTimer = setTimeout(() => {
      amiantoDiskSaveTimer = null;
      if (amiantoPersistInProgress) return;
      if (!window.__amiantoProjectDirty) return;
      updateProjectSaveStatusUI('saving');
      persistEditorProject({ silent: true, promptForLocation: false })
        .then((result) => {
          if (typeof applyPersistResultToSaveStatus === 'function') {
            applyPersistResultToSaveStatus(result);
          }
        })
        .catch((err) => {
          console.warn('[AutoSave] Failed to write .amnt:', err);
          if (typeof updateProjectSaveStatusUI === 'function') {
            updateProjectSaveStatusUI('disk-failed', err && err.message ? err.message : 'error');
          }
        });
    }, AMIANTO_DISK_SAVE_DEBOUNCE_MS);
  }

  function getProjectFilePathKey(projectName) {
    return `amiantoProjectFile_${currentUser?.username || 'Local'}:${projectName}`;
  }

  function setProjectFilePath(projectName, filePath) {
    if (!projectName || !filePath) return;
    localStorage.setItem(getProjectFilePathKey(projectName), filePath);
    localStorage.setItem('amiantoActiveProjectFile', filePath);
  }

  function getProjectFilePath(projectName) {
    if (!projectName) return localStorage.getItem('amiantoActiveProjectFile');
    return localStorage.getItem(getProjectFilePathKey(projectName));
  }

  function rememberProjectFilePathInCache(projectName, filePath) {
    if (!currentUser || !projectName || !filePath) return;
    const list = loadProjectsFromCache(currentUser.username);
    const idx = findProjectCacheIndex(list, { name: projectName });
    if (idx >= 0) {
      list[idx].filePath = filePath;
      saveProjectsToCache(currentUser.username, list);
      updateAppState({ projects: list });
    }
  }

  function migrateProjectFilePath(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    const oldKey = getProjectFilePathKey(oldName);
    const path = localStorage.getItem(oldKey);
    if (!path) return;
    setProjectFilePath(newName, path);
    try { localStorage.removeItem(oldKey); } catch (_) {}
    rememberProjectFilePathInCache(newName, path);
  }

  function collectAssetIdsFromProject(projectObj) {
    const ids = new Set();
    const visit = (val) => {
      if (typeof val === 'string' && val.startsWith('asset:')) {
        ids.add(val.slice(6));
      } else if (val && typeof val === 'object') {
        if (Array.isArray(val)) val.forEach(visit);
        else Object.values(val).forEach(visit);
      }
    };
    visit(projectObj);
    return ids;
  }

  async function pickProjectSaveLocation(projectName) {
    if (!window.AmiantoAmnt) {
      showNotification('Project format module not loaded', 'error');
      return null;
    }
    const defaultName = window.AmiantoAmnt.defaultFileName(projectName);

    if (window.amiantoNativeFs) {
      const filePath = await window.amiantoNativeFs.showSaveDialog(defaultName);
      return filePath ? { type: 'path', value: filePath } : null;
    }

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'Amianto Project', accept: { 'application/json': ['.amnt'] } }]
        });
        return { type: 'handle', value: handle };
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        throw err;
      }
    }

    showNotification('Choose a save location is not supported in this browser. Use Export after creating.', 'warning');
    return null;
  }

  async function writeAmntContent(projectName, text, location) {
    if (location?.type === 'path' && window.amiantoNativeFs) {
      await writeLargeTextFile(location.value, text);
      setProjectFilePath(projectName, location.value);
      rememberProjectFilePathInCache(projectName, location.value);
      return location.value;
    }
    if (location?.type === 'handle') {
      const writable = await location.value.createWritable();
      await writable.write(new Blob([String(text || '')], { type: 'application/json' }));
      await writable.close();
      projectFileHandles.set(projectName, location.value);
      return location.value.name || window.AmiantoAmnt.defaultFileName(projectName);
    }
    const savedPath = getProjectFilePath(projectName)
      || localStorage.getItem('amiantoActiveProjectFile');
    if (savedPath && window.amiantoNativeFs) {
      await writeLargeTextFile(savedPath, text);
      setProjectFilePath(projectName, savedPath);
      return savedPath;
    }
    const handle = projectFileHandles.get(projectName);
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(new Blob([String(text || '')], { type: 'application/json' }));
      await writable.close();
      return handle.name || window.AmiantoAmnt.defaultFileName(projectName);
    }
    return null;
  }

  async function buildAmntPackageFromEditor(projectObj) {
    const source = projectObj || window.serializeProject();
    const prepared = prepareProjectPayloadForFirestore(source);
    const projectId = prepared.settings?.id || getActiveProjectId();
    const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
    const assets = (storage && storage.exportAllAssetsForProject && projectId)
      ? await storage.exportAllAssetsForProject(projectId)
      : [];
    const referenced = collectAssetIdsFromProject(prepared);
    const exported = new Set(assets.map(a => a && a.assetId).filter(Boolean));
    const missing = [...referenced].filter(id => !exported.has(id));
    if (missing.length > 0) {
      console.warn('[Save] Asset refs in project missing from IndexedDB export:', missing.slice(0, 20));
      addDebugMessage(
        `[Save] Warning: ${missing.length} asset(s) referenced in project were not found in local storage. Re-save images or use Save Project again.`,
        'warning'
      );
    }
    return window.AmiantoAmnt.createPackage(prepared, assets);
  }

  async function saveProjectAsAmnt(projectName, projectObj, location) {
    const pkg = await buildAmntPackageFromEditor(projectObj);
    const text = window.AmiantoAmnt.stringify(pkg, true);
    return await writeAmntContent(projectName, text, location);
  }

  async function readProjectFileContent(filePath) {
    if (filePath && window.amiantoNativeFs) {
      return await readLargeTextFile(filePath);
    }
    return null;
  }

  async function importAmntContent(text, filePath) {
    const { project, assets } = window.AmiantoAmnt.parse(text);
    migrateLegacyInventoryRefsOnLoad(project);
    const projectName = project?.settings?.name;
    if (!projectName) throw new Error('Project file has no name');

    const projectId = project.settings.id || normalizeProjectIdFromName(projectName);
    project.settings.id = projectId;

    const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
    if (storage) {
      if (typeof storage.init === 'function') {
        await storage.init();
      }
      if (storage.importAssetsFromPackage && assets.length) {
        const imported = await storage.importAssetsFromPackage(projectId, assets);
        console.log('[Load] Imported ' + imported + ' asset(s) from .amnt into IndexedDB');
      }
    } else if (assets.length) {
      console.warn('[Load] Asset storage unavailable; .amnt assets were not imported');
    }

    const prepared = prepareProjectPayloadForFirestore(project);
    await applyProjectObject(prepared);
    const jsonString = JSON.stringify(prepared, null, 2);

    localStorage.setItem('amiantoActiveProjectName', projectName);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    localStorage.setItem('amiantoActiveProjectId', projectId);
    if (filePath) {
      setProjectFilePath(projectName, filePath);
      rememberProjectFilePathInCache(projectName, filePath);
    }

    autosaveToCache(projectName, jsonString);

    const arr = loadProjectsFromCache(currentUser.username);
    const idx = findProjectCacheIndex(arr, { name: projectName });
    const entry = normalizeProject({
      settings: project.settings,
      id: projectId,
      updatedAt: new Date().toISOString(),
      createdAt: project.createdAt || new Date().toISOString(),
      source: filePath ? 'amnt' : 'import',
      filePath: filePath || null
    });
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...entry };
    } else {
      arr.push(entry);
    }
    saveProjectsToCache(currentUser.username, arr);
    updateAppState({ projects: arr });

    if (window.amiantoResources && typeof window.amiantoResources.refresh === 'function') {
      await window.amiantoResources.refresh();
    }
    if (window.amiantoResources && typeof window.amiantoResources.refreshSounds === 'function') {
      await window.amiantoResources.refreshSounds();
    }

    enableOtherTabs(true);
    scheduleProjectSizeIndicatorRefresh(400);
    return projectName;
  }

  async function persistEditorProject(options = {}) {
    const interactive = options.interactive === true;
    const silent = options.silent === true;
    const promptForLocation = options.promptForLocation !== false;

    if (amiantoPersistInProgress) {
      if (interactive) showNotification('Save already in progress...', 'info');
      return { ok: false, reason: 'in-progress' };
    }

    amiantoPersistInProgress = true;
    try {
      ensureCurrentUser();

      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (!activeProjectName) {
        if (interactive) {
          showNotification('No project is currently open. Please open or create a project first.', 'warning');
        }
        return { ok: false, reason: 'no-project' };
      }

      saveCurrentScriptIfNeeded({ markDirty: false });
      syncEditorScriptsToRoomsBeforeSerialize();
      syncInventoryScriptAttachments();

      let projectObj = window.serializeProject();
      if (!projectObj.settings) projectObj.settings = {};

      const renameFrom = window.__amiantoProjectRenameFrom || null;
      if (renameFrom && renameFrom !== activeProjectName) {
        migrateProjectFilePath(renameFrom, activeProjectName);
      }

      const projectId = getStableProjectId(projectObj.settings, activeProjectName);
      projectObj.settings.id = projectId;
      projectObj.settings.name = activeProjectName;
      const projectName = activeProjectName;
      localStorage.setItem('amiantoActiveProjectId', projectId);

      if (interactive && !silent) showNotification('Saving assets...', 'info');
      try {
        projectObj = await saveAllAssetsToStorage(projectObj, projectId);
        unsavedCharacterFrames.clear();
        unsavedCharacterAssetIds.clear();
        sessionStorage.removeItem('amiantoUnsavedFramesToDelete');
      } catch (error) {
        console.error('[Save] Errore salvataggio asset:', error);
        if (interactive) showNotification('Some assets could not be saved', 'warning');
      }

      const savePayload = prepareProjectPayloadForFirestore(projectObj);
      const jsonString = JSON.stringify(savePayload, null, 2);
      window.__amiantoLastFirestorePayloadBytes = new Blob([JSON.stringify(savePayload)]).size;
      window.__amiantoLastCacheSaveAt = new Date().toISOString();
      autosaveToCache(projectName, jsonString);
      localStorage.setItem('amiantoLastSavedProjectJson', jsonString);

      const linkedFilePath = getProjectFilePath(projectName);
      const userProjects = loadProjectsFromCache(currentUser.username);
      let idx = findProjectCacheIndex(userProjects, { id: projectId, name: projectName });
      if (idx < 0 && renameFrom) {
        idx = findProjectCacheIndex(userProjects, { id: projectId, name: renameFrom });
      }
      const entry = normalizeProject({
        settings: projectObj.settings,
        id: projectId,
        updatedAt: new Date().toISOString(),
        createdAt: projectObj.createdAt || new Date().toISOString(),
        source: linkedFilePath ? 'amnt' : 'local',
        filePath: linkedFilePath || null
      });
      if (idx >= 0) userProjects[idx] = { ...userProjects[idx], ...entry };
      else userProjects.push(entry);
      saveProjectsToCache(currentUser.username, userProjects);
      updateAppState({ projects: userProjects });

      if (renameFrom && renameFrom !== projectName) {
        removeProjectLocalBackup(currentUser.username, renameFrom);
      }

      try {
        localStorage.setItem(`amiantoProject_${currentUser.username}:${projectName}`, jsonString);
        localStorage.setItem('amiantoActiveProjectName', projectName);
        localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
        localStorage.setItem('amiantoActiveProjectId', projectId);
      } catch (_) {}

      saveProjectJsonToOPFS(jsonString, projectName);

      let amntLocation = null;
      const hasLinkedPath = hasLinkedAmntFilePath(projectName);
      const hasFileHandle = projectFileHandles.has(projectName);
      const expectsDiskWrite = hasLinkedPath || hasFileHandle || !!promptForLocation;
      if (!hasLinkedPath && !hasFileHandle && promptForLocation) {
        amntLocation = await pickProjectSaveLocation(projectName);
      }

      let filePath = null;
      try {
        if (hasLinkedPath || hasFileHandle || amntLocation) {
          filePath = await saveProjectAsAmnt(projectName, projectObj, amntLocation);
        }
        if (filePath) {
          rememberProjectFilePathInCache(projectName, filePath);
          const list = loadProjectsFromCache(currentUser.username);
          const ci = findProjectCacheIndex(list, { name: projectName });
          if (ci >= 0) {
            list[ci].filePath = filePath;
            list[ci].source = 'amnt';
            saveProjectsToCache(currentUser.username, list);
            updateAppState({ projects: list });
          }
          clearAmiantoProjectDirty();
          window.__amiantoLastDiskSaveAt = new Date().toISOString();
          updateProjectSaveStatusUI('saved', window.__amiantoLastDiskSaveAt);
          if (interactive && !silent) {
            showNotification(`Project saved to ${filePath}`, 'success');
          } else if (!silent) {
            addDebugMessage(`Auto-saved to ${filePath}`, 'success');
          }
        } else {
          // Cache-only success: clear dirty only when no linked disk file was expected
          if (!expectsDiskWrite || (!hasLinkedPath && !hasFileHandle && !amntLocation)) {
            clearAmiantoProjectDirty();
            updateProjectSaveStatusUI('cache-saved', window.__amiantoLastCacheSaveAt);
          } else {
            // Expected disk write but got no path (cancelled picker, etc.)
            window.__amiantoProjectDirty = true;
            updateProjectSaveStatusUI('dirty');
          }
          if (interactive && !silent) {
            showNotification('Project saved to browser cache. Choose a .amnt file location on next save to write a disk file.', 'warning');
          }
        }
      } catch (amntErr) {
        console.error('[Save] .amnt write failed:', amntErr);
        // Keep dirty so beforeunload still warns; cache is OK but disk is not
        window.__amiantoProjectDirty = true;
        updateProjectSaveStatusUI(
          'disk-failed',
          amntErr && amntErr.message ? amntErr.message : String(amntErr)
        );
        if (interactive) {
          showNotification('Cache updated but .amnt file write failed: ' + (amntErr.message || amntErr), 'danger');
        }
        return { ok: false, reason: 'disk-failed', error: amntErr, cacheSaved: true };
      }

      updateProjectSizeIndicator();
      return { ok: true, diskPath: filePath, cacheOnly: !filePath };
    } finally {
      amiantoPersistInProgress = false;
      // Se l'utente ha modificato qualcosa durante il save, riprogramma l'autosave
      if (window.__amiantoProjectDirty && typeof scheduleAmiantoDiskPersist === 'function') {
        scheduleAmiantoDiskPersist();
      }
    }
  }

  window.saveCurrentProject = async function saveCurrentProject() {
    await persistEditorProject({ interactive: true, promptForLocation: true });
  };

  window.addEventListener('beforeunload', (event) => {
    if (!window.__amiantoProjectDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Create new project
  window.createNewProject = async function(projectNameFromModal = null, showSuccessNotification = true) {
    ensureCurrentUser();

    let projectName = projectNameFromModal;
    if (!projectName) {
      projectName = await askProjectNameDialog('Enter project name:');
    }
    if (!projectName || !String(projectName).trim()) {
      return { ok: false, reason: 'empty-name' };
    }

    const trimmedName = String(projectName).trim();

    const existing = loadProjectsFromCache(currentUser.username);
    if (findProjectCacheIndex(existing, { name: trimmedName }) >= 0) {
      showNotification('A project named "' + trimmedName + '" already exists', 'warning');
      return { ok: false, reason: 'duplicate' };
    }

    const newProject = {
      format: 'amianto-game',
      version: 1,
      meta: {
        exportedAt: new Date().toISOString(),
        editor: 'Amianto Editor',
        editorVersion: '1.0.0'
      },
      settings: {
        id: trimmedName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_'),
        name: trimmedName,
        canvasWidth: 800,
        canvasHeight: 600
      },
      rooms: [
        {
          id: 'room_1',
          name: 'Room 1',
          background: null,
          foregrounds: [],
          sceneObjects: [],
          animationInstances: [],
          walkableArea: [],
          hotspots: []
        }
      ],
      guis: [],
      characters: [],
      roomAnimations: [],
      inventory: [],
      scripts: {},
      attachments: {},
      cursors: [],
      variables: {
        definitions: [],
        state: {}
      },
      dialogues: [],
      resourcesCatalog: [],
      eventConditions: {
        objects: {},
        hotspots: {},
        characters: {},
        guiButtons: {},
        inventory: {}
      }
    };

    await applyProjectObject(newProject);

    const projectId = newProject.settings.id;

    localStorage.setItem('amiantoActiveProjectName', trimmedName);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    localStorage.setItem('amiantoActiveProjectId', projectId);

    updateProjectSizeIndicator();

    const userProjects = loadProjectsFromCache(currentUser.username);
    const entry = normalizeProject({
      settings: newProject.settings,
      id: projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'local'
    });
    userProjects.push(entry);
    saveProjectsToCache(currentUser.username, userProjects);
    updateAppState({ projects: userProjects });

    try {
      const prepared = prepareProjectPayloadForRestore(newProject);
      autosaveToCache(trimmedName, JSON.stringify(prepared, null, 2));
    } catch (_) {}

    enableOtherTabs(true);

    // .amnt su disco: opzionale (dopo che il progetto e gia aperto in editor)
    let diskOk = false;
    try {
      await ensureNativeDialogsCanOpen();
      const saveLocation = await pickProjectSaveLocation(trimmedName);
      if (saveLocation) {
        const filePath = await saveProjectAsAmnt(trimmedName, newProject, saveLocation);
        if (filePath) {
          rememberProjectFilePathInCache(trimmedName, filePath);
          diskOk = true;
          addDebugMessage('Project file created: ' + filePath, 'success');
        }
      } else {
        showNotification('Project created in editor. Use Save Project to write a .amnt file.', 'info');
      }
    } catch (err) {
      console.error('[Create] Failed to write .amnt file:', err);
      showNotification('Project created but file save failed: ' + (err && err.message ? err.message : err), 'warning');
    }

    if (showSuccessNotification) {
      showNotification(
        diskOk
          ? 'Project "' + trimmedName + '" created and saved!'
          : 'Project "' + trimmedName + '" created and opened!',
        'success'
      );
    }
    return { ok: true, name: trimmedName, projectId, diskOk };
  };

  async function ensureNativeDialogsCanOpen() {
    const sel = document.getElementById('projectSelectionModal');
    if (sel && sel.classList.contains('show')) {
      try {
        const bsInst = bootstrap.Modal.getInstance(sel);
        if (bsInst) {
          await new Promise(function(resolve) {
            var done = false;
            var finish = function() { if (done) return; done = true; resolve(); };
            sel.addEventListener('hidden.bs.modal', finish, { once: true });
            bsInst.hide();
            setTimeout(finish, 450);
          });
        } else {
          sel.classList.remove('show');
          sel.style.display = 'none';
          document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
          document.body.classList.remove('modal-open');
          await new Promise(function(r) { setTimeout(r, 200); });
        }
      } catch (_) {}
    }
    try { hideLoadingOverlay(); } catch (_) {}
  }

  function askProjectNameDialog(message) {
    return new Promise(function(resolve) {
      const existing = document.getElementById('amiantoAskNameModal');
      if (existing) existing.remove();

      let settled = false;
      const finish = function(value) {
        if (settled) return;
        settled = true;
        try { bs.hide(); } catch (_) {}
        setTimeout(function() { try { el.remove(); } catch (_) {} }, 400);
        resolve(value);
      };

      const el = document.createElement('div');
      el.className = 'modal fade';
      el.id = 'amiantoAskNameModal';
      el.tabIndex = -1;
      el.innerHTML =
        '<div class="modal-dialog modal-dialog-centered">' +
        '<div class="modal-content bg-dark text-light">' +
        '<div class="modal-header border-secondary">' +
        '<h5 class="modal-title"></h5>' +
        '<button type="button" class="btn-close btn-close-white" data-amianto-cancel="1" aria-label="Close"></button>' +
        '</div>' +
        '<div class="modal-body">' +
        '<input type="text" class="form-control bg-dark text-light border-secondary" id="amianto-ask-name-input" placeholder="My Adventure" autocomplete="off">' +
        '</div>' +
        '<div class="modal-footer border-secondary">' +
        '<button type="button" class="btn btn-secondary" data-amianto-cancel="1">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="amianto-ask-name-ok">Create</button>' +
        '</div></div></div>';

      document.body.appendChild(el);
      el.querySelector('.modal-title').textContent = message || 'Project name';

      const bs = new bootstrap.Modal(el, { backdrop: 'static', keyboard: true });
      const getInput = function() { return el.querySelector('#amianto-ask-name-input'); };

      el.querySelector('#amianto-ask-name-ok').addEventListener('click', function() {
        const v = (getInput().value || '').trim();
        finish(v || null);
      });
      el.querySelectorAll('[data-amianto-cancel]').forEach(function(btn) {
        btn.addEventListener('click', function() { finish(null); });
      });
      getInput().addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const v = (getInput().value || '').trim();
          finish(v || null);
        }
      });

      bs.show();
      setTimeout(function() { getInput().focus(); }, 200);
    });
  }

  // ================================
  // ASSET MANAGEMENT SYSTEM
  // ================================
  //
  // Sistema per gestione asset (immagini/audio) usando storage locale (IndexedDB).
  // Le immagini NON vengono salvate come base64 nel JSON del progetto:
  // vengono salvati solo gli assetId risolti via assetStorage.resolveAssetUrl.

  /**
   * Genera un assetId univoco
   * @returns {string} - ID univoco per l'asset
   */
  function generateAssetId() {
    return 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  /**
   * Determina la cartella storage in base al tipo di asset
   * @param {string} assetType - Tipo di asset (background, foreground, sprite, gui, character, cursor, audio)
   * @returns {string} - Nome della cartella (backgrounds, foregrounds, sprites, audio)
   */
  function getStorageFolderForType(assetType) {
    switch (assetType) {
      case 'background':
        return 'backgrounds';
      case 'foreground':
        return 'foregrounds';
      case 'sprite':
        return 'sprites';
      case 'gui':
        return 'gui';
      case 'character':
        return 'characters';
      case 'cursor':
        return 'cursors';
      case 'audio':
        return 'audio';
      case 'resource':
        return 'resources';
      case 'animation':
        return 'animations';
      default:
        // Per categorie non riconosciute, usa la categoria stessa (normalizzata)
        return assetType ? assetType.toLowerCase() : 'sprites';
    }
  }

  /**
   * Carica un'immagine nello storage locale
   * 
   * @param {File} file - File immagine da caricare
   * @param {string} projectId - ID del progetto
   * @param {string} assetType - Tipo di asset (background, foreground, sprite, gui, character, cursor, audio)
   * @param {string} assetId - ID univoco dell'asset (opzionale, generato se non fornito)
   * @returns {Promise<{assetId: string, storagePath: string, downloadURL: string, fileName: string}>} - Metadata dell'asset caricato
   */
  async function uploadImageToStorage(file, projectId, assetType, assetId = null, overwriteExisting = false, fileNameOverride = null, subfolder = null) {
    try {
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (!storage || !storage.isAvailable()) {
        const errorMsg = 'Storage non disponibile. Impossibile caricare asset.';
        console.error('[Asset] âŒ', errorMsg);
        
        if (typeof showNotification === 'function') {
          showNotification(errorMsg, 'error');
        }
        
        throw new Error(errorMsg);
      }

      // Genera assetId se non fornito
      if (!assetId) {
        assetId = generateAssetId();
      }

      // Mantieni sempre il nome originale del file (mai assetId.ext)
      const forcedFileName = fileNameOverride || (file && file.name) || null;

      // Determina categoria (backgrounds, foregrounds, sprites, audio)
      const category = getStorageFolderForType(assetType);
      
      console.log('[Asset] Upload immagine...', { projectId, category, assetType, assetId, subfolder });

      const result = await storage.uploadAsset(file, projectId, category, assetId, overwriteExisting, forcedFileName, subfolder);
      
      // Costruisci storagePath per compatibilitÃ  con il resto del codice
      const originalFileName = result.fileName || forcedFileName || (file && file.name) || (result.url && result.url.split('/').pop().split('?')[0]);
      const actualFolder = subfolder || category;
      const storagePath = `${projectId}/${actualFolder}/${originalFileName}`;
      
      console.log('[Asset] âœ… Immagine caricata con successo:', { assetId, storagePath, downloadURL: result.url, fileName: originalFileName, subfolder });
      
      return {
        assetId,
        storagePath,
        downloadURL: result.url,
        fileName: originalFileName,
        subfolder // Includi subfolder per salvare nei metadati
      };
    } catch (error) {
      console.error('[Asset] âŒ Errore upload immagine:', error);
      throw error;
    }
  }

  /**
   * Salva metadata asset nello storage locale
   * @param {string} projectId - ID del progetto
   * @param {string} assetId - ID univoco dell'asset
   * @param {string} name - Nome originale del file
   * @param {string} assetType - Tipo di asset
   * @param {string} storagePath - Percorso Storage
   * @param {string} fileName - Nome file generato (opzionale)
   * @param {string} publicUrl - URL pubblico dell'asset (opzionale)
   * @returns {Promise<boolean>} - true se salvato con successo
   */
  async function saveAssetMetadata(projectId, assetId, name, assetType, storagePath, fileName = null, publicUrl = null, subfolder = null) {
    try {
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (storage && storage.saveAssetMetadata) {
        return await storage.saveAssetMetadata(projectId, assetId, {
          assetId, name, type: assetType, storagePath, fileName, publicUrl, subfolder
        });
      }
      return true;
    } catch (error) {
      console.error('[Asset] âŒ Errore salvataggio metadata:', error);
      return false;
    }
  }

  /**
   * Carica metadata di tutti gli asset di un progetto
   * @param {string} projectId - ID del progetto
   * @returns {Promise<Array>} - Array di metadata asset
   */
  async function loadProjectAssets(projectId) {
    try {
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (storage && storage.listProjectAssetMetadata) {
        return await storage.listProjectAssetMetadata(projectId);
      }
      return [];
    } catch (error) {
      console.error('[Asset] âŒ Errore caricamento asset:', error);
      return [];
    }
  }

  /**
   * Elimina un asset dallo storage locale dato un'immagine
   * @param {Image} img - Oggetto Image che rappresenta l'asset
   * @returns {Promise<boolean>} - true se eliminato con successo, false altrimenti
   */
  async function deleteAssetFromImage(img) {
    try {
      if (!img) {
        return false;
      }

      const assetInfo = imageAssetMap.get(img);
      if (!assetInfo || !assetInfo.assetId) {
        console.log('[Asset] Immagine senza assetId associato, nulla da eliminare');
        return true;
      }

      const { assetId, type, projectId, fileName } = assetInfo;
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (!storage || !storage.isAvailable || !storage.isAvailable()) {
        console.warn('[Asset] Storage locale non disponibile, impossibile eliminare asset:', assetId);
        return false;
      }

      let finalFileName = fileName;
      let subfolder = assetInfo.subfolder || null;

      if ((!finalFileName || !subfolder) && storage.getAssetMetadata) {
        try {
          const data = await storage.getAssetMetadata(projectId, assetId);
          if (data) {
            if (data.fileName && !finalFileName) {
              finalFileName = data.fileName;
            }
            if (data.subfolder && !subfolder) {
              subfolder = data.subfolder;
            }
          }
        } catch (metaErr) {
          console.warn('[Asset] Impossibile recuperare metadata per eliminazione asset:', metaErr);
        }
      }

      if (!subfolder && (type === 'background' || type === 'foreground' || type === 'sprite')) {
        const room = rooms.get(currentRoomId);
        if (room) {
          const roomName = room.name || room.id || currentRoomId;
          subfolder = `rooms/${roomName}`;
        }
      }

      if (!finalFileName) {
        if (img.src && img.src.includes('.')) {
          const ext = img.src.split('.').pop().split('?')[0].toLowerCase();
          finalFileName = `${assetId}.${ext}`;
        } else {
          finalFileName = `${assetId}.png`;
        }
      }

      console.log(`[Asset] Eliminazione asset locale: ${assetId} (${type}, ${finalFileName}${subfolder ? `, subfolder: ${subfolder}` : ''})`);

      const deleted = await storage.deleteAsset(projectId, type, finalFileName, null, subfolder);

      if (deleted) {
        console.log(`[Asset] âœ… Asset eliminato: ${assetId}`);
        imageAssetMap.delete(img);

        if (typeof updateProjectSizeIndicator === 'function') {
          updateProjectSizeIndicator();
        }

        return true;
      }

      console.warn(`[Asset] âš ï¸ Impossibile eliminare asset: ${assetId}`);
      return false;
    } catch (error) {
      console.error('[Asset] âŒ Errore eliminazione asset:', error);
      return false;
    }
  }

  /**
   * Risolve un assetId in un URL dallo storage locale
   * @param {string} projectId - ID del progetto
   * @param {string} assetId - ID dell'asset
   * @returns {Promise<string|null>} - URL di download o null se non trovato
   */
  async function resolveAssetUrl(projectId, assetId) {
    try {
      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (!storage || !storage.resolveAssetUrl) {
        return null;
      }

      const url = await storage.resolveAssetUrl(projectId, assetId);
      if (url) {
        console.log('[Asset] âœ… Asset risolto da storage locale:', { assetId });
        return url;
      }

      return null;
    } catch (error) {
      console.warn('[Asset] âš ï¸ Errore risoluzione asset:', assetId, error.message);
      return null;
    }
  }

  /**
   * Carica un'immagine da un URL (helper per compatibilitÃ )
   * @param {string} url - URL dell'immagine (puÃ² essere dataURL o URL Storage)
   * @returns {Promise<Image|null>} - Oggetto Image o null se errore
   */
  async function loadImageFromUrl(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      
      const img = new Image();
      const skipCors = url.startsWith('data:') || url.startsWith('blob:');

      if (!skipCors) {
        img.crossOrigin = 'anonymous';
      }
      
      let resolved = false;
      
      img.onload = () => {
        if (!resolved) {
          resolved = true;
          resolve(img);
        }
      };
      
      img.onerror = async (error) => {
        if (resolved) return;
        
        // Se fallisce con crossOrigin, prova senza (per dataURL o URL locali)
        if (img.crossOrigin === 'anonymous' && !skipCors) {
          console.warn('[Asset] âš ï¸ Errore caricamento con CORS, riprovo senza crossOrigin:', url);
          
          // Crea una nuova immagine senza crossOrigin
          const imgNoCors = new Image();
          imgNoCors.onload = () => {
            if (!resolved) {
              resolved = true;
              resolve(imgNoCors);
            }
          };
          imgNoCors.onerror = (error2) => {
            if (!resolved) {
              resolved = true;
              console.error('[Asset] âŒ Errore definitivo caricamento immagine:', url, error2);
              resolve(null);
            }
          };
          imgNoCors.src = url;
        } else {
          resolved = true;
          console.error('[Asset] âŒ Errore caricamento immagine:', url, error);
          resolve(null);
        }
      };
      
      img.src = url;
    });
  }

  /**
   * Upload immagine e salva metadata (funzione combinata)
   * @param {File} file - File immagine
   * @param {string} projectId - ID del progetto
   * @param {string} assetType - Tipo di asset
   * @returns {Promise<{assetId: string, downloadURL: string}>} - Risultato upload
   */
  async function uploadImage(file, projectId, assetType, options = {}) {
    try {
      const { assetId = null, overwriteExisting = false, fileName: fileNameOverride = null, subfolder = null } = options || {};
      const { assetId: finalAssetId, storagePath, downloadURL, fileName, subfolder: resultSubfolder } = await uploadImageToStorage(
        file,
        projectId,
        assetType,
        assetId,
        overwriteExisting,
        fileNameOverride,
        subfolder
      );
      
      const metadataSaved = await saveAssetMetadata(projectId, finalAssetId, file.name, assetType, storagePath, fileName, downloadURL, resultSubfolder || subfolder);
      
      if (!metadataSaved) {
        console.warn('[Asset] âš ï¸ Upload completato, ma salvataggio metadati fallito.');
      }
      
      // Aggiorna i counter dopo upload asset
      if (typeof updateProjectSizeIndicator === 'function') {
        updateProjectSizeIndicator();
      }
      
      return { assetId: finalAssetId, downloadURL, fileName };
    } catch (error) {
      console.error('[Asset] âŒ Errore upload immagine completo:', error);
      throw error;
    }
  }

  // Helpers per file name sicuro in OPFS
  function sanitizeProjectFileName(name) {
    const safe = (name && String(name).trim() !== '' ? String(name).trim() : 'amianto-project').replace(/[^a-z0-9-_\s]/gi, '_');
    return `${safe}.amianto.json`;
  }

  async function loadProjectJsonFromOPFS(projectName) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return null;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('amianto-projects', { create: true });
      const fileHandle = await dir.getFileHandle(sanitizeProjectFileName(projectName), { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (_) {
      return null;
    }
  }

  async function deleteProjectFileFromOPFS(projectName) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return false;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('amianto-projects', { create: true });
      // FileSystemDirectoryHandle.removeEntry Ã¨ disponibile su alcuni browser
      if (dir.removeEntry) {
        await dir.removeEntry(sanitizeProjectFileName(projectName));
        return true;
      }
      // Fallback: non disponibile
      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * Carica un'immagine da URL o assetId
   * @param {string} urlOrAssetId - URL (dataURL o HTTP) oppure assetId con prefisso "asset:"
   * @param {string} projectId - ID del progetto (necessario se urlOrAssetId Ã¨ un assetId)
   * @returns {Promise<Image|null>} - Oggetto Image o null se errore
   */
  async function createImageFromDataUrl(urlOrAssetId, projectId = null) {
    if (!urlOrAssetId) {
      return null;
    }

    // Se Ã¨ un assetId (prefisso "asset:"), risolvi dallo storage locale
    if (urlOrAssetId.startsWith('asset:')) {
      const assetId = urlOrAssetId.replace('asset:', '');
      
      if (!projectId) {
        projectId = getActiveProjectId();
      }

      if (!projectId) {
        console.warn('[Asset] projectId mancante per risolvere asset:', assetId);
        return null;
      }

      // Risolvi assetId in URL
      const downloadURL = await resolveAssetUrl(projectId, assetId);
      if (!downloadURL) {
        console.warn('[Asset] Impossibile risolvere asset:', assetId);
        return null;
      }

      // Carica immagine dall'URL risolto
      return await loadImageFromUrl(downloadURL);
    }

    // Fallback: tratta come URL normale (dataURL, blob: o HTTP)
    return await loadImageFromUrl(urlOrAssetId);
  }

  async function applyProjectObject(projectObj) {
    try {
      mergeLegacyHotspotScriptsIntoRooms(projectObj);
      migrateLegacyInventoryRefsOnLoad(projectObj);
      migrateEmbeddedAssetsOnProjectLoad(projectObj);

      // Invalida caricamenti async del progetto precedente e azzera stato editor
      projectLoadGeneration += 1;
      const loadGen = projectLoadGeneration;
      resetEditorRoomGlobals();

      // Ottieni projectId dal progetto (necessario per risolvere assetId)
      const projectName = projectObj.settings && projectObj.settings.name ? projectObj.settings.name : 'amianto-project';
      const projectId = (projectObj.settings && projectObj.settings.id)
        ? String(projectObj.settings.id)
        : normalizeProjectIdFromName(projectName);

      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (storage && storage.reassignAssetsToProject) {
        try {
          const referencedAssetIds = collectAssetIdsFromProject(projectObj);
          const reassigned = await storage.reassignAssetsToProject(projectId, [...referencedAssetIds]);
          if (reassigned > 0) {
            console.log(`[Load] ${reassigned} asset(s) reindexed under projectId "${projectId}"`);
          }
        } catch (reindexErr) {
          console.warn('[Load] Asset reindex skipped:', reindexErr);
        }
      }
      
      // Pulisci mappa asset prima di caricare nuovo progetto
      imageAssetMap.clear();

      // Settings / viewport
      if (projectObj && projectObj.settings) {
        const s = projectObj.settings;
        const stableId = (s && s.id) ? String(s.id) : normalizeProjectIdFromName(projectName);
        if (stableId) {
          s.id = stableId;
          localStorage.setItem('amiantoActiveProjectId', stableId);
        }
        // aggiorna viewport
        if (s.canvasWidth && s.canvasHeight) {
          gameViewport.width = Number(s.canvasWidth) || gameViewport.width;
          gameViewport.height = Number(s.canvasHeight) || gameViewport.height;
          canvas.width = gameViewport.width;
          canvas.height = gameViewport.height;
          editorState.panX = 0;
          editorState.panY = 0;
          updateEditorDisplay();
        }
        // persisti impostazioni progetto
        localStorage.setItem('amiantoProjectSettings', JSON.stringify(s));
        if (typeof syncShowCursorActionTextCheckbox === 'function') {
          syncShowCursorActionTextCheckbox(s);
        }
      }

      // Rooms
      rooms = new Map();
      currentRoomId = null;
      // converte stanze
      if (Array.isArray(projectObj.rooms)) {
        // Precarica immagini in parallelo
        for (const r of projectObj.rooms) {
          const roomId = r.id || uid('room');
          const roomVal = {
            id: roomId,
            name: r.name || roomId,
            background: null,
            foregrounds: [],
            sceneObjects: Array.isArray(r.sceneObjects) ? r.sceneObjects.map(o => {
              const visible = (typeof o.visible === 'boolean') ? o.visible : true;
              const enabled = (typeof o.enabled === 'boolean') ? o.enabled : visible;
              return {
                id: o.id || uid('scene'),
                name: o.name || 'Object',
                type: o.type || 'Interactive',
                x: Number(o.x) || 0,
                y: Number(o.y) || 0,
                img: null,
                rotationRad: Number(o.rotationRad) || 0,
                scaleX: (typeof o.scaleX === 'number') ? Number(o.scaleX) : 1,
                scaleY: (typeof o.scaleY === 'number') ? Number(o.scaleY) : 1,
                visible,
                enabled
              };
            }) : [],
            animationInstances: Array.isArray(r.animationInstances) ? r.animationInstances.map(inst => ({
              id: inst.id || uid('ainst'),
              animationId: inst.animationId,
              name: inst.name || inst.id || 'Animation',
              x: Number(inst.x) || 0,
              y: Number(inst.y) || 0,
              layer: inst.layer === 'foreground' ? 'foreground' : 'background',
              visible: inst.visible !== false,
              autoPlay: inst.autoPlay === true
            })) : [],
            walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
            hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => {
              const hotspotObj = {
                id: h.id || uid('hotspot'),
                name: h.name || 'Hotspot',
                points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
                visible: (typeof h.visible === 'boolean') ? h.visible : true
              };
              
              // âš ï¸ NORMALIZZAZIONE: Preserva struttura scripts.onClick se presente e normalizza enabled
              // BUG FIX: Inizializza sempre la struttura scripts.onClick per garantire consistenza
              hotspotObj.scripts = {};
          if (h.scripts && h.scripts.onClick) {
            const onClickData = h.scripts.onClick;
            
            // DEBUG AGGIUNTIVO: Log sempre per diagnosticare
            console.log(`[Serialize] Hotspot ${h.id} - Serializzazione script:`, {
              hasCode: !!onClickData.code,
              codeLength: onClickData.code ? String(onClickData.code).length : 0,
              codePreview: onClickData.code ? String(onClickData.code).substring(0, 50) : '(vuoto)',
              enabled: onClickData.enabled,
              codeType: typeof onClickData.code
            });
            
            const hasCode = onClickData.code && typeof onClickData.code === 'string' && onClickData.code.trim() !== '';
                
                // AUTOMATIZZAZIONE: Se c'Ã¨ codice, enabled deve essere sempre true
                // L'obiettivo Ã¨ eliminare il blocco "enabled = false" per hotspot con codice
                let normalizedEnabled;
                if (hasCode) {
                  // Se c'Ã¨ codice, forza sempre enabled=true (ignorando eventuale enabled=false salvato)
                  normalizedEnabled = true;
                  if (typeof onClickData.enabled === 'boolean' && onClickData.enabled === false) {
                    console.warn(`[Serialize] [AUTO-ENABLE] Hotspot ${h.id} ha codice ma enabled=false salvato, forzo enabled=true`);
                  }
                } else {
                  // Se non c'Ã¨ codice, enabled puÃ² essere false
                  normalizedEnabled = (typeof onClickData.enabled === 'boolean') ? onClickData.enabled : false;
                }
                
                hotspotObj.scripts.onClick = {
                  code: String(onClickData.code || ''),
                  enabled: normalizedEnabled
                };
              } else {
                // Se non c'Ã¨ script, imposta struttura vuota e disabilitata
                hotspotObj.scripts.onClick = {
                  code: '',
                  enabled: false
                };
              }
              
              return hotspotObj;
            }) : [],
            // Character scaling data
            scalingForegroundY: (typeof r.scalingForegroundY === 'number') ? Number(r.scalingForegroundY) : null,
            scalingBackgroundY: (typeof r.scalingBackgroundY === 'number') ? Number(r.scalingBackgroundY) : null,
            scalingMinScale: (typeof r.scalingMinScale === 'number') ? Number(r.scalingMinScale) : 0.5,
            scalingMaxScale: (typeof r.scalingMaxScale === 'number') ? Number(r.scalingMaxScale) : 1.5
          };
          rooms.set(roomId, roomVal);
          // carica immagini async (background, foregrounds, scene objects)
          Promise.resolve().then(async () => {
            if (isStaleProjectLoad(loadGen)) return;
            if (r.background) {
              const img = await createImageFromDataUrl(r.background, projectId);
              if (isStaleProjectLoad(loadGen)) return;
              if (img) {
                // Verifica che l'immagine sia completamente caricata
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                
                if (width && height) {
                  roomVal.background = img;
                  // Se Ã¨ la stanza corrente, aggiorna anche il background globale
                  if (roomId === currentRoomId) {
                    background = img;
                  }
                  // Se Ã¨ un assetId, registra nella mappa
                  if (r.background && r.background.startsWith('asset:')) {
                    const assetId = r.background.replace('asset:', '');
                    imageAssetMap.set(img, { assetId, type: 'background', projectId });
                  }
                  redraw();
                } else {
                  console.warn('[Load Project] Background image loaded but has no dimensions:', {
                    complete: img.complete,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    width: img.width,
                    height: img.height
                  });
                }
              }
            }
            if (Array.isArray(r.foregrounds)) {
              if (isStaleProjectLoad(loadGen)) return;
              console.log(`[Load] Caricamento ${r.foregrounds.length} foreground per room ${roomId}`, r.foregrounds);
              const out = [];
              for (const f of r.foregrounds) {
                if (isStaleProjectLoad(loadGen)) return;
                if (!f || !f.image) {
                  console.warn(`[Load] Foreground senza image, skip:`, f);
                  continue;
                }
                
                const img = await createImageFromDataUrl(f.image, projectId);
                if (isStaleProjectLoad(loadGen)) return;
                if (!img) {
                  console.warn(`[Load] Impossibile caricare immagine foreground:`, f.image);
                  continue;
                }
                
                // Support both x/y and offsetX/offsetY for backward compatibility
                const x = (typeof f.x === 'number') ? f.x : (f.offsetX || 0);
                const y = (typeof f.y === 'number') ? f.y : (f.offsetY || 0);
                
                const foregroundObj = {
                  id: f.id || uid('fg'),
                  name: f.name || 'Layer',
                  img: img,
                  x: Number(x) || 0,
                  y: Number(y) || 0,
                  offsetX: Number(x) || 0, // Mantieni per compatibilitÃ 
                  offsetY: Number(y) || 0, // Mantieni per compatibilitÃ 
                  rotationRad: Number(f.rotationRad) || 0,
                  scaleX: (typeof f.scaleX === 'number') ? Number(f.scaleX) : 1,
                  scaleY: (typeof f.scaleY === 'number') ? Number(f.scaleY) : 1,
                  visible: (typeof f.visible === 'boolean') ? f.visible : true
                };
                
                out.push(foregroundObj);
                
                // Se Ã¨ un assetId, registra nella mappa
                if (f.image && f.image.startsWith('asset:')) {
                  const assetId = f.image.replace('asset:', '');
                  imageAssetMap.set(img, { assetId, type: 'foreground', projectId });
                }
                
                console.log(`[Load] âœ“ Foreground caricato: ${foregroundObj.name} (id: ${foregroundObj.id}, image: ${f.image.substring(0, 50)}...)`);
              }
              
              console.log(`[Load] Foreground caricati per room ${roomId}: ${out.length}/${r.foregrounds.length}`);
              roomVal.foregrounds = out;
              
              // IMPORTANTE: Se questa Ã¨ la room corrente, aggiorna anche lo stato globale
              if (!isStaleProjectLoad(loadGen) && roomId === currentRoomId) {
                foregrounds = out;
                console.log(`[Load] âœ“ Foreground sincronizzati nello stato globale per room corrente: ${foregrounds.length} layer`);
              }
              
              if (!isStaleProjectLoad(loadGen)) {
                refreshForegroundListUI();
                redraw();
              }
            } else {
              console.log(`[Load] Nessun foreground nella room ${roomId} (r.foregrounds non Ã¨ un array o Ã¨ vuoto)`);
            }
            if (Array.isArray(r.sceneObjects)) {
              for (let i = 0; i < r.sceneObjects.length; i++) {
                if (isStaleProjectLoad(loadGen)) return;
                const src = r.sceneObjects[i];
                const dst = roomVal.sceneObjects[i];
                if (src && src.image) {
                  const img = await createImageFromDataUrl(src.image, projectId);
                  if (isStaleProjectLoad(loadGen)) return;
                  dst.img = img;
                  // Se Ã¨ un assetId, registra nella mappa
                  if (img && src.image.startsWith('asset:')) {
                    const assetId = src.image.replace('asset:', '');
                    imageAssetMap.set(img, { assetId, type: 'sprite', projectId });
                  }
                }
              }
              // ricrea lista oggetti
              if (!isStaleProjectLoad(loadGen) && roomId === currentRoomId) {
                sceneObjects = roomVal.sceneObjects;
                animationInstances = roomVal.animationInstances;
                refreshSceneObjectsListUI();
                refreshRoomAnimationInstancesListUI();
                redraw();
              }
            }
              if (!isStaleProjectLoad(loadGen)) {
                refreshHotspotsListUI();
                scheduleProjectSizeIndicatorRefresh(300);
              }
          });
        }
      } else {
        // assicura almeno una stanza
        const rid = uid('room');
        rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], animationInstances: [], walkableArea: [], hotspots: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
      }
      // Seleziona prima stanza e sincronizza riferimenti (walkable/hotspot del progetto corrente)
      const firstRoom = rooms.keys().next().value;
      currentRoomId = firstRoom;
      bindRoomRefs();
      if (isStaleProjectLoad(loadGen)) return;
      refreshForegroundListUI();
      refreshSceneObjectsListUI();
      refreshRoomAnimationInstancesListUI();
      refreshHotspotsListUI();
      refreshRoomsSelector();
      try { refreshStartRoomSelector(); } catch(_) {}
      redraw();

      // GUI
      guis = [];
      if (Array.isArray(projectObj.guis)) {
        for (const g of projectObj.guis) {
          const guiBg = g.background ? await createImageFromDataUrl(g.background, projectId) : null;
          if (guiBg && g.background && g.background.startsWith('asset:')) {
            const assetId = g.background.replace('asset:', '');
            imageAssetMap.set(guiBg, { assetId, type: 'gui', projectId });
          }
          
          const buttons = [];
          if (Array.isArray(g.buttons)) {
            for (const b of g.buttons) {
              const btnBg = b.backgroundImage ? await createImageFromDataUrl(b.backgroundImage, projectId) : null;
              if (btnBg && b.backgroundImage && b.backgroundImage.startsWith('asset:')) {
                const assetId = b.backgroundImage.replace('asset:', '');
                imageAssetMap.set(btnBg, { assetId, type: 'gui', projectId });
              }
              buttons.push({
                id: b.id || uid('btn'),
                name: b.name || 'Button',
                x: Number(b.x)||0, y: Number(b.y)||0, w: Number(b.w)||0, h: Number(b.h)||0,
                text: b.text || '',
                backgroundImage: btnBg
              });
            }
          }
          
          const loadedGuiType = (g.type === 'Inventory') ? 'OverlayCustom' : (g.type || 'MainInterface');
          const loadedSettings = g.settings ? { ...g.settings } : {};
          if (loadedGuiType === 'DialogBox') {
            if (loadedSettings.balloon) {
              try {
                const balloonImg = await createImageFromDataUrl(loadedSettings.balloon, projectId);
                if (balloonImg && loadedSettings.balloon.startsWith('asset:')) {
                  const assetId = loadedSettings.balloon.replace('asset:', '');
                  imageAssetMap.set(balloonImg, { assetId, type: 'gui', projectId });
                }
                loadedSettings.balloonImage = balloonImg;
              } catch (e) {
                console.warn('[GUI] Dialog balloon load failed:', e);
              }
            }
            try {
              await hydrateDialogBoxFont(loadedSettings, projectId);
            } catch (e) {
              console.warn('[GUI] Dialog font hydrate failed:', e);
            }
          }
          guis.push({
            id: g.id || uid('gui'),
            name: g.name || 'GUI',
            type: loadedGuiType,
            settings: loadedSettings,
            background: guiBg,
            buttons: buttons
          });
        }
      }
      if (guis.length === 0) {
        const defaultGui = { id: uid('gui'), name: 'Main GUI', type: 'MainInterface', settings: {}, background: null, buttons: [] };
        guis.push(defaultGui);
      }
      currentGuiId = guis[0].id;
      refreshGUISelector();
      try {
        const typeSel = document.getElementById('gui-type-select');
        if (typeSel) {
          typeSel.value = guis[0].type || 'MainInterface';
        }
        renderGuiSettingsPanel(guis[0].type || 'MainInterface', guis[0].settings || {});
        updateGuiToolbarForType(guis[0].type || 'MainInterface');
        refreshGuiButtonsList();
      } catch(_) {}

      // Characters frames (Map)
      try {
        characterFrames.clear();
        // Pulisce anche la lista DOM dei character
        const charactersList = document.getElementById('characters-list');
        if (charactersList) {
          charactersList.innerHTML = '';
        }
        
        if (Array.isArray(projectObj.characters)) {
          for (const ch of projectObj.characters) {
            // Canonico: id === name (se entrambi presenti e diversi, vince name)
            let characterName = String(ch.name || ch.id || '').trim();
            if (!characterName) characterName = uid('char');
            if (ch.id && ch.name && String(ch.id) !== String(ch.name)) {
              console.warn(`[Load] Character id "${ch.id}" ≠ name "${ch.name}" — forzato id=name "${characterName}"`);
            }
            const directions = await loadCharacterDirectionsFromData(ch.directions, projectId, characterName);
            const animations = {};
            if (ch.animations && typeof ch.animations === 'object') {
              for (const [animName, animData] of Object.entries(ch.animations)) {
                if (animName && animData) {
                  animations[animName] = {
                    directions: await loadCharacterDirectionsFromData(animData.directions, projectId, characterName)
                  };
                }
              }
            }
            const charData = {
              id: characterName,
              name: characterName,
              directions,
              animations,
              currentFrame: 0
            };
            // Load pivot if it exists
            if (ch.pivotX !== undefined && ch.pivotY !== undefined) {
              charData.pivotX = Number(ch.pivotX) || 0;
              charData.pivotY = Number(ch.pivotY) || 0;
            }
            charData.spawnSettings = normalizeCharacterSpawnSettings(ch.spawnSettings);
            if (ch.portraits && typeof ch.portraits === 'object') {
              const portraits = {};
              Object.keys(ch.portraits).forEach(moodKey => {
                const ref = ch.portraits[moodKey];
                if (typeof ref === 'string' && ref.trim()) {
                  portraits[String(moodKey).trim()] = ref.trim();
                }
              });
              if (Object.keys(portraits).length) charData.portraits = portraits;
            }
            characterFrames.set(characterName, charData);
          }
        }
        refreshCharactersListUI();
      } catch(error) {
        console.error('[Load] Errore caricamento character:', error);
      }

      // Room animations catalog
      try {
        await loadRoomAnimationsCatalogFromData(projectObj.roomAnimations, projectId);
      } catch (error) {
        console.error('[Load] Errore caricamento room animations:', error);
      }

      // Inventory (layout + items)
      try {
        inventoryItems = [];
        inventoryDefinition = {
          background: null,
          slots: [],
          displayMode: 'popup',
          popupEdgeHeight: 48,
          panel: null,
          toggleIcon: null,
          toggleIconBounds: null
        };
        selectedInventorySlotId = null;
        selectedInventoryItemId = null;
        const invData = projectObj.inventory;
        const itemSources = [];
        if (Array.isArray(invData)) {
          invData.forEach(item => {
            itemSources.push({ ...item, _legacy: true });
          });
        } else if (invData && typeof invData === 'object') {
          inventoryDefinition.displayMode = normalizeInventoryDisplayMode(invData.displayMode);
          inventoryDefinition.popupEdgeHeight = Math.max(16, Math.min(200, Number(invData.popupEdgeHeight) || 48));
          inventoryDefinition.panel = normalizeInventoryRect(invData.panel, defaultInventoryPanel());
          inventoryDefinition.toggleIconBounds = normalizeInventoryRect(
            invData.toggleIconBounds,
            defaultInventoryToggleIconBounds()
          );
          if (Array.isArray(invData.items)) itemSources.push(...invData.items);
          if (Array.isArray(invData.slots)) {
            inventoryDefinition.slots = invData.slots.map(s => ({
              id: s.id || uid('invslot'),
              name: s.name || 'Slot',
              x: Number(s.x) || 0,
              y: Number(s.y) || 0,
              w: Number(s.w) || 0,
              h: Number(s.h) || 0
            }));
          }
          const bgRef = invData.backgroundRef || invData.background;
          if (bgRef) {
            Promise.resolve().then(async () => {
              if (isStaleProjectLoad(loadGen)) return;
              const img = await createImageFromDataUrl(bgRef, projectId);
              if (isStaleProjectLoad(loadGen)) return;
              if (img) {
                inventoryDefinition.background = img;
                if (typeof bgRef === 'string' && bgRef.startsWith('asset:')) {
                  imageAssetMap.set(img, { assetId: bgRef.replace('asset:', ''), type: 'inventory', projectId });
                }
                redraw();
              }
            });
          }
          const iconRef = invData.toggleIconRef || invData.toggleIcon;
          if (iconRef) {
            Promise.resolve().then(async () => {
              if (isStaleProjectLoad(loadGen)) return;
              const img = await createImageFromDataUrl(iconRef, projectId);
              if (isStaleProjectLoad(loadGen)) return;
              if (img) {
                inventoryDefinition.toggleIcon = img;
                if (typeof iconRef === 'string' && iconRef.startsWith('asset:')) {
                  imageAssetMap.set(img, { assetId: iconRef.replace('asset:', ''), type: 'inventory', projectId });
                }
                updateInventoryToggleIconLabel();
                redraw();
              }
            });
          }
        }
        itemSources.forEach(item => {
          const entry = {
            id: item.id || uid('invitem'),
            name: item.name || 'Item',
            scriptName: item.scriptName != null ? String(item.scriptName) : '',
            image: null,
            _imageRef: item.imageRef || item.image || null
          };
          inventoryItems.push(entry);
        });
        Promise.resolve().then(async () => {
          for (const item of inventoryItems) {
            if (isStaleProjectLoad(loadGen)) return;
            if (item._imageRef) {
              item.image = await createImageFromDataUrl(item._imageRef, projectId);
              if (isStaleProjectLoad(loadGen)) return;
              if (item.image && typeof item._imageRef === 'string' && item._imageRef.startsWith('asset:')) {
                imageAssetMap.set(item.image, { assetId: item._imageRef.replace('asset:', ''), type: 'inventory', projectId });
              }
            }
            delete item._imageRef;
            syncInventoryItemScript(item);
          }
          if (isStaleProjectLoad(loadGen)) return;
          refreshInventoryItemsListUI();
          refreshInventorySlotsListUI();
          applyInventoryRectsToUI();
          refreshInventoryDisplayModeUI();
          redraw();
        });
        refreshInventoryItemsListUI();
        refreshInventorySlotsListUI();
        applyInventoryRectsToUI();
        refreshInventoryDisplayModeUI();
      } catch (invErr) {
        console.error('[Load] Errore caricamento inventory:', invErr);
      }
      // Scripts
      try {
        jsScripts.clear();
        
        // âš ï¸ PULIZIA EDITOR: Pulisci l'editor degli script quando si carica un nuovo progetto
        // Questo assicura che anche se la cache del browser non Ã¨ stata svuotata,
        // l'editor sarÃ  vuoto quando si crea un nuovo progetto
        currentScriptName = null;
        ensureLargeScriptEditor();
        ensureScriptEditor();
        if (largeCodeMirrorEditor) {
          largeCodeMirrorEditor.setValue('');
          setTimeout(() => {
            if (largeCodeMirrorEditor && typeof largeCodeMirrorEditor.refresh === 'function') {
              largeCodeMirrorEditor.refresh();
            }
          }, 0);
        }
        if (codeMirrorEditor) {
          codeMirrorEditor.setValue('');
          setTimeout(() => {
            if (codeMirrorEditor && typeof codeMirrorEditor.refresh === 'function') {
              codeMirrorEditor.refresh();
            }
          }, 0);
        }
        // Pulisci anche i textarea se esistono
        const taLarge = document.getElementById('script-editor-large');
        if (taLarge) taLarge.value = '';
        const taSmall = document.getElementById('script-editor');
        if (taSmall) taSmall.value = '';
        
        // Reset dropdowns
        const scopeSel = document.getElementById('script-scope');
        const targetSel = document.getElementById('script-target');
        if (scopeSel && targetSel) {
          scopeSel.value = 'Global';
          populateTargetsForScope('Global');
          targetSel.disabled = true;
          scopeSel.disabled = false;
        }
        
        const selector = document.getElementById('script-selector');
        if (selector) {
          // reset, mantieni placeholder
          selector.innerHTML = '';
          const opt0 = document.createElement('option');
          opt0.value = ''; opt0.textContent = 'Select a script...';
          selector.appendChild(opt0);
        }
        
        // âš ï¸ PULIZIA: Rimuovi tutti gli script da localStorage che non appartengono a questo progetto
        // Questo previene che script di progetti eliminati compaiano in progetti nuovi
        try {
          const projectScriptNames = new Set();
          if (projectObj.scripts && typeof projectObj.scripts === 'object') {
            Object.keys(projectObj.scripts).forEach(name => {
              if (name) projectScriptNames.add(String(name));
            });
          }
          // Rimuovi tutti gli script da localStorage che non sono nel progetto corrente
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('script-')) {
              const scriptName = key.slice('script-'.length);
              if (!projectScriptNames.has(scriptName)) {
                localStorage.removeItem(key);
              }
            }
          }
        } catch (cleanupError) {
          console.warn('[applyProjectObject] Errore pulizia script localStorage:', cleanupError);
        }
        
        if (projectObj.scripts && typeof projectObj.scripts === 'object') {
          Object.entries(projectObj.scripts).forEach(([name, content]) => {
            if (!name) return;
            const canonical = migrateLegacyScriptKey(String(name));
            jsScripts.set(canonical, String(content || ''));
            localStorage.setItem(`script-${canonical}`, String(content || ''));
            if (selector) {
              const o = document.createElement('option');
              o.value = canonical; o.textContent = canonical;
              selector.appendChild(o);
            }
          });
        }
        // ri-aggiungi alcuni script di default se mancanti
        const defaults = ['startup','room-change','object-interaction'];
        defaults.forEach(d => {
          if (!jsScripts.has(d)) {
            jsScripts.set(d, '');
            if (selector) {
              const o = document.createElement('option');
              o.value = d; o.textContent = d === 'startup' ? 'Startup Game' : (d.replace('-', ' '));
              selector.appendChild(o);
            }
          }
        });
        refreshScriptSelector();
        refreshSceneObjectScriptTargets();
        refreshRoomScriptTargets();
        refreshCharacterScriptTargets();
        refreshInventoryScriptTargets();
        try { refreshGuiScriptTargets(); } catch(_) {}
        try { refreshHotspotScriptTargets(); } catch(_) {}
        try { refreshCursorScriptTargets(); } catch(_) {}
      } catch(_) {}

      // Attachments (mappe)
      try {
        objectScripts.clear();
        roomScripts.clear();
        characterScripts.clear();
        inventoryScripts.clear();
        hotspotScripts.clear(); // âš ï¸ hotspotScripts Map non piÃ¹ usata per gli hotspot (script salvati in hotspot.scripts.onClick)
        if (projectObj.attachments && typeof projectObj.attachments === 'object') {
          const A = projectObj.attachments;
          if (A.roomScripts && typeof A.roomScripts === 'object') Object.entries(A.roomScripts).forEach(([k,v]) => { if (k && v) roomScripts.set(String(k), String(v)); });
          if (A.objectScripts && typeof A.objectScripts === 'object') Object.entries(A.objectScripts).forEach(([k,v]) => { if (k && v) objectScripts.set(String(k), String(v)); });
          if (A.characterScripts && typeof A.characterScripts === 'object') {
            Object.entries(A.characterScripts).forEach(([k,v]) => { 
              if (k && v) characterScripts.set(String(k), String(v)); 
            });
          }
          if (A.inventoryScripts && typeof A.inventoryScripts === 'object') Object.entries(A.inventoryScripts).forEach(([k,v]) => { if (k && v) inventoryScripts.set(String(k), String(v)); });
          if (A.guiScripts && typeof A.guiScripts === 'object') Object.entries(A.guiScripts).forEach(([k,v]) => { if (k && v) guiScripts.set(String(k), String(v)); });
          // âš ï¸ A.hotspotScripts rimosso: gli script degli hotspot sono ora salvati direttamente in hotspot.scripts.onClick
        }
        inventoryItems.forEach(item => {
          if (String(item.scriptName || '').trim()) syncInventoryItemScript(item);
        });
      } catch(_) {}
      
      // Variables (Game State)
      try {
        if (projectObj.variables && typeof projectObj.variables === 'object') {
          const vars = projectObj.variables;
          // Carica definizioni variabili
          if (Array.isArray(vars.definitions)) {
            gameVariableDefinitions = vars.definitions.map(v => ({
              name: String(v.name || ''),
              type: String(v.type || 'string'),
              initialValue: v.initialValue
            }));
          }
          // Carica stato variabili
          if (vars.state && typeof vars.state === 'object') {
            Game.setState(vars.state);
          }
        }
      } catch(_) {}

      // Branching dialogues (graph)
      try {
        window.projectDialogues = [];
        if (Array.isArray(projectObj.dialogues)) {
          window.projectDialogues = projectObj.dialogues
            .map(d => normalizeDialogueForSerialize(d))
            .filter(Boolean);
        }
        if (typeof window.renderDialoguesEditor === 'function') {
          window.renderDialoguesEditor();
        }
      } catch (_) {
        window.projectDialogues = [];
      }
      
      // Event Conditions
      try {
        objectEventConditions.clear();
        hotspotEventConditions.clear();
        characterEventConditions.clear();
        guiButtonEventConditions.clear();
        inventoryEventConditions.clear();
        if (projectObj.eventConditions && typeof projectObj.eventConditions === 'object') {
          const ec = projectObj.eventConditions;
          if (ec.objects && typeof ec.objects === 'object') {
            Object.entries(ec.objects).forEach(([k, v]) => {
              if (k && v && typeof v === 'object') {
                objectEventConditions.set(String(k), JSON.parse(JSON.stringify(v)));
              }
            });
          }
          if (ec.hotspots && typeof ec.hotspots === 'object') {
            Object.entries(ec.hotspots).forEach(([k, v]) => {
              if (k && v && typeof v === 'object') {
                hotspotEventConditions.set(String(k), JSON.parse(JSON.stringify(v)));
              }
            });
          }
          if (ec.characters && typeof ec.characters === 'object') {
            Object.entries(ec.characters).forEach(([k, v]) => {
              if (k && v && typeof v === 'object') {
                characterEventConditions.set(String(k), JSON.parse(JSON.stringify(v)));
              }
            });
          }
          if (ec.guiButtons && typeof ec.guiButtons === 'object') {
            Object.entries(ec.guiButtons).forEach(([k, v]) => {
              if (k && v && typeof v === 'object') {
                guiButtonEventConditions.set(String(k), JSON.parse(JSON.stringify(v)));
              }
            });
          }
          if (ec.inventory && typeof ec.inventory === 'object') {
            Object.entries(ec.inventory).forEach(([k, v]) => {
              if (k && v && typeof v === 'object') {
                inventoryEventConditions.set(String(k), JSON.parse(JSON.stringify(v)));
              }
            });
          }
        }
      } catch(_) {}

      // âš ï¸ PULIZIA AUTOMATICA HOTSPOT: Forza enabled=true per tutti gli hotspot con codice
      // Questo assicura che gli hotspot con codice siano sempre attivi, anche se il progetto salvato aveva enabled=false
      try {
        let cleanedCount = 0;
        rooms.forEach((room, roomId) => {
          if (room.hotspots && Array.isArray(room.hotspots)) {
            room.hotspots.forEach(hotspot => {
              if (hotspot.scripts && hotspot.scripts.onClick) {
                const hasCode = hotspot.scripts.onClick.code && 
                              typeof hotspot.scripts.onClick.code === 'string' && 
                              hotspot.scripts.onClick.code.trim() !== '';
                
                if (hasCode && hotspot.scripts.onClick.enabled === false) {
                  console.log(`[Cleanup] Auto-enable hotspot ${hotspot.id} (${hotspot.name}) - ha codice ma enabled=false`);
                  hotspot.scripts.onClick.enabled = true;
                  cleanedCount++;
                }
              }
            });
          }
        });
        
        // Aggiorna anche gli hotspot globali se esistenti
        if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
          hotspots.forEach(hotspot => {
            if (hotspot.scripts && hotspot.scripts.onClick) {
              const hasCode = hotspot.scripts.onClick.code && 
                            typeof hotspot.scripts.onClick.code === 'string' && 
                            hotspot.scripts.onClick.code.trim() !== '';
              
              if (hasCode && hotspot.scripts.onClick.enabled === false) {
                console.log(`[Cleanup] Auto-enable hotspot globale ${hotspot.id} (${hotspot.name}) - ha codice ma enabled=false`);
                hotspot.scripts.onClick.enabled = true;
                cleanedCount++;
              }
            }
          });
        }
        
        if (cleanedCount > 0) {
          console.log(`[Cleanup] âœ… Pulizia completata: ${cleanedCount} hotspot abilitati automaticamente`);
        }
      } catch (cleanupError) {
        console.warn('[Cleanup] Errore durante pulizia hotspot:', cleanupError);
      }

      // Category cursors
      try {
        contextualCursors = [];
        if (Array.isArray(projectObj.cursors)) {
          for (const c of projectObj.cursors) {
            // Skip legacy per-target cursor entries (targetType/targetId without category)
            const category = c.category || null;
            if (!category || !CURSOR_CATEGORIES.includes(category)) continue;

            const cursorImg = c.cursorImage ? await createImageFromDataUrl(c.cursorImage, projectId) : null;
            if (cursorImg && c.cursorImage && c.cursorImage.startsWith('asset:')) {
              const assetId = c.cursorImage.replace('asset:', '');
              imageAssetMap.set(cursorImg, { assetId, type: 'cursor', projectId });
            }
            contextualCursors.push({
              id: c.id || uid('cursor'),
              category,
              cursorImage: cursorImg,
              actionText: c.actionText || '',
              scriptName: c.scriptName || '',
              pivotX: typeof c.pivotX === 'number' ? c.pivotX : 0,
              pivotY: typeof c.pivotY === 'number' ? c.pivotY : 0
            });
          }
        }
        selectedCursorId = contextualCursors.length ? contextualCursors[0].id : null;
        refreshCursorsList();
      } catch(_) {}

      // Zoom 100% con (0,0) in alto a sinistra dopo il caricamento
      requestAnimationFrame(() => {
        requestAnimationFrame(() => alignEditorViewTopLeft());
      });

      // Ricarica risorse/suoni del progetto attivo (evita catalogo del progetto precedente)
      await refreshResourcesForActiveProject();
      
      // Aggiorna l'albero degli script per riflettere gli script del progetto caricato
      rebuildScriptsTree();
      
      // Inizializza il canvas embedded e il runtime sandboxed
      try {
        // Serializza il progetto per il runtime
        const projectJson = JSON.stringify(projectObj);
        initializeSandboxRuntime(projectJson);
      } catch (runtimeError) {
        console.warn('[applyProjectObject] Errore inizializzazione runtime embedded:', runtimeError);
      }
      
      showNotification('Project loaded', 'success');
      scheduleProjectSizeIndicatorRefresh(600);
    } catch (err) {
      addDebugMessage('Failed to apply project: ' + (err && err.message ? err.message : err), 'error');
      showNotification('Error loading project', 'danger');
    }
  }

  window.importProjectFromJson = async function(jsonString) {
    try {
      const obj = JSON.parse(jsonString);
      // Pacchetto .amnt: progetto + asset embedded — non trattarlo come amianto-game nudo
      if (obj && obj.format === 'amianto-amnt') {
        await importAmntContent(jsonString, null);
        return;
      }
      migrateLegacyInventoryRefsOnLoad(obj);
      await applyProjectObject(obj);
      scheduleProjectSizeIndicatorRefresh(400);
    } catch (err) {
      addDebugMessage('Invalid project JSON: ' + (err && err.message ? err.message : err), 'error');
      showNotification('Invalid project JSON', 'danger');
    }
  };

  async function openProjectByName(projectName) {
    ensureCurrentUser();
    if (!projectName) return;

    const userProjects = loadProjectsFromCache(currentUser.username);
    const cacheIdx = findProjectCacheIndex(userProjects, { name: projectName });
    const linkedFilePath = getProjectFilePath(projectName)
      || (cacheIdx >= 0 && userProjects[cacheIdx].filePath)
      || null;

    let linkedFileError = null;
    if (linkedFilePath) {
      try {
        const text = await readProjectFileContent(linkedFilePath);
        if (text) {
          await importAmntContent(text, linkedFilePath);
          showNotification(`Project "${projectName}" opened`, 'success');
          return;
        }
        linkedFileError = new Error('Linked .amnt file is empty or unreadable');
      } catch (err) {
        linkedFileError = err;
        console.warn('[Load] Failed to open linked .amnt file, trying cache:', err);
      }
    }

    let projectId = getProjectIdFromCacheByName(projectName) || normalizeProjectIdFromName(projectName);

    let projectObj = null;
    let loadedFrom = null;

    const jsonFromOpfs = await loadProjectJsonFromOPFS(projectName);
    if (jsonFromOpfs) {
      try {
        projectObj = JSON.parse(jsonFromOpfs);
        loadedFrom = 'opfs';
        console.log('[Load] Caricato da OPFS');
        addDebugMessage('Loaded from OPFS', 'info');
      } catch (e) {
        console.error('[Load] Errore parsing OPFS:', e);
      }
    }

    if (!projectObj) {
      const key = `amiantoProject_${currentUser.username}:${projectName}`;
      const json = localStorage.getItem(key);
      if (json) {
        try {
          projectObj = JSON.parse(json);
          loadedFrom = 'cache';
          console.log('[Load] Caricato da cache locale');
          addDebugMessage('Loaded from cache', 'info');
        } catch (e) {
          console.error('[Load] Errore parsing cache:', e);
        }
      }
    }

    if (!projectObj) {
      if (linkedFileError) {
        showNotification(
          'Failed to load project file: ' + (linkedFileError.message || linkedFileError),
          'danger'
        );
        return;
      }
      projectObj = {
        format: 'amianto-game',
        version: 1,
        settings: { id: projectId, name: projectName, canvasWidth: gameViewport.width, canvasHeight: gameViewport.height },
        rooms: [],
        guis: [],
        characters: [],
        inventory: [],
        scripts: {},
        attachments: {},
        cursors: [],
        variables: {}
      };
      loadedFrom = 'new';
      console.log('[Load] Creato progetto vuoto');
      addDebugMessage('Created new empty project', 'info');
    }

    mergeLegacyHotspotScriptsIntoRooms(projectObj);

    // Salva walkable/hotspot della stanza corrente nel progetto in uscita prima di sostituire lo stato
    if (currentRoomId && rooms && rooms.has(currentRoomId)) {
      const leaving = rooms.get(currentRoomId);
      if (leaving) {
        leaving.walkableArea = Array.isArray(walkableArea) ? walkableArea.slice() : [];
        leaving.hotspots = Array.isArray(hotspots) ? hotspots : [];
      }
    }

    // Stabilizza progetti legacy: assicura settings.id persistito (deve coincidere con IndexedDB)
    try {
      if (!projectObj.settings) projectObj.settings = {};
      if (!projectObj.settings.id) {
        projectObj.settings.id = projectId;
      }
      projectId = getStableProjectId(projectObj.settings, projectName);
      projectObj.settings.id = projectId;
    } catch (_) {}

    // Applica il progetto caricato
    await applyProjectObject(projectObj);

    try {
      window.__amiantoLastFirestorePayloadBytes = measureFirestorePayloadBytes(window.serializeProject());
      clearAmiantoProjectDirty();
      window.__amiantoLastCacheSaveAt = new Date().toISOString();
    } catch (_) {}

    // IMPORTANTE: Salva il progetto attivo PRIMA di qualsiasi altra operazione
    // Questo assicura che il listener hide.bs.modal possa rilevarlo
    localStorage.setItem('amiantoActiveProjectName', projectName);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    localStorage.setItem('amiantoActiveProjectId', projectId);

    // Abilita altre tab ora che c'è un progetto aperto
    enableOtherTabs(true);
    
    // Aggiorna indicatore dimensione progetto
    updateProjectSizeIndicator();
    updateProjectSaveStatusUI('saved', window.__amiantoLastCacheSaveAt);
    
    // Mostra notifica con fonte di caricamento
    if (loadedFrom === 'cache' || loadedFrom === 'opfs') {
      showNotification(`Project "${projectName}" loaded from ${loadedFrom}`, 'info');
    }
    
    // Il modale verrÃ  chiuso dal chiamante dopo questa funzione completa
  }

  let projectSizeIndicatorTimer = null;

  function scheduleProjectSizeIndicatorRefresh(delayMs = 400) {
    if (projectSizeIndicatorTimer) clearTimeout(projectSizeIndicatorTimer);
    projectSizeIndicatorTimer = setTimeout(() => {
      projectSizeIndicatorTimer = null;
      updateProjectSizeIndicator();
    }, delayMs);
  }

  // Funzione per aggiornare l'indicatore della dimensione del progetto
  async function updateProjectSizeIndicator() {
    try {
      const indicator = document.getElementById('projectSizeIndicator');
      const sizeText = document.getElementById('projectSizeText');
      
      if (!indicator || !sizeText) {
        return; // Elementi non ancora disponibili
      }
      
      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      
      if (!activeProjectName) {
        indicator.style.display = 'none';
        return;
      }

      const projectObj = window.serializeProject();
      const preparedPayload = prepareProjectPayloadForFirestore(projectObj);
      const payloadBytes = new Blob([JSON.stringify(preparedPayload)]).size;
      const embeddedInPayload = collectEmbeddedDataUrlStats(preparedPayload);
      const pendingBytes = measurePendingAssetDataUrlBytes(projectObj);
      const pendingCount = countPendingAssetDataUrls(projectObj);
      const isDirty = !!window.__amiantoProjectDirty;

      const PAYLOAD_MAX_SIZE = 1048487; // ~1MB in bytes
      const percentageUsed = parseFloat(((payloadBytes / PAYLOAD_MAX_SIZE) * 100).toFixed(1));

      const dirtySuffix = isDirty ? ' *' : '';
      const parts = [`Payload: ${formatProjectSizeLabel(payloadBytes)} (${percentageUsed}%)${dirtySuffix}`];
      if (pendingBytes > 0) {
        const assetLabel = pendingCount === 1 ? '1 asset' : `${pendingCount} asset`;
        parts.push(`da caricare: ${formatProjectSizeLabel(pendingBytes)} (${assetLabel})`);
      }
      if (embeddedInPayload.embeddedAssetCount > 0) {
        parts.push(`âš  ${embeddedInPayload.embeddedAssetCount} embedded`);
      }

      sizeText.textContent = parts.join(' Â· ');
      let titleBase = 'Payload: dimensione del JSON canonico del progetto. * = modifiche non salvate.';
      if (pendingBytes > 0) {
        titleBase += ' "Da caricare": base64 negli asset live non ancora su storage.';
      }
      if (embeddedInPayload.embeddedAssetCount > 0) {
        titleBase += ` âš  ${embeddedInPayload.embeddedAssetCount} base64 ancora nel payload preparato (${formatProjectSizeLabel(embeddedInPayload.embeddedBytes)}) â€” salva con upload prima di esportare.`;
      }
      indicator.title = titleBase;

      if (percentageUsed >= 90 || pendingBytes > 512 * 1024) {
        sizeText.style.color = '#ff6b6b';
      } else if (percentageUsed >= 75 || pendingBytes > 0) {
        sizeText.style.color = '#ffa500';
      } else {
        sizeText.style.color = '#aaa';
      }

      indicator.style.display = 'block';

      const projectId = (projectObj.settings && projectObj.settings.id)
        ? String(projectObj.settings.id)
        : activeProjectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');

      const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
      if (storage && typeof storage.getProjectStorageSize === 'function') {
        const storageResult = await storage.getProjectStorageSize(projectId);
        const totalBytes = typeof storageResult === 'number' ? storageResult : (storageResult?.totalBytes || 0);
        const fileCount = typeof storageResult === 'object' && storageResult
          ? (storageResult.fileCount || 0)
          : ((storage.listProjectAssetMetadata ? await storage.listProjectAssetMetadata(projectId) : []).length);
        if (totalBytes > 0) {
          const storageLabel = formatProjectSizeLabel(totalBytes);
          const fileLabel = fileCount === 1 ? '1 file' : `${fileCount} file`;
          sizeText.textContent = `${parts.join(' Â· ')} Â· Storage: ${storageLabel} (${fileLabel})`;
          indicator.title = (indicator.title || '') + ` Storage locale: ${storageLabel}, ${fileLabel}.`;
        }
      }
    } catch (error) {
      console.warn('[ProjectSize] Errore aggiornamento indicatore:', error);
    }
  }
  
  // Esponi funzione globalmente
  window.updateProjectSizeIndicator = updateProjectSizeIndicator;

  async function deleteProjectByName(projectName) {
    ensureCurrentUser();
    if (!projectName) return;
    if (!confirm(
      `Remove "${projectName}" from the editor?\n\n` +
      'Local cache, IndexedDB assets, and editor backups will be deleted.\n' +
      'Your .amnt file on disk (if any) will NOT be deleted — remove it manually if needed.'
    )) return;

    const projectId = getProjectIdFromCacheByName(projectName) || normalizeProjectIdFromName(projectName);

    const storage = window.getAmiantoAssetStorage && window.getAmiantoAssetStorage();
    if (storage && storage.deleteProjectFolder) {
      try {
        await storage.deleteProjectFolder(projectId);
        if (typeof updateProjectSizeIndicator === 'function') {
          updateProjectSizeIndicator();
        }
      } catch (error) {
        console.error('[Asset] Errore eliminazione asset progetto:', error);
      }
    }

    const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
    let scriptsToRemove = [];
    try {
      const projectJson = localStorage.getItem(projectKey);
      if (projectJson) {
        const projectObj = JSON.parse(projectJson);
        if (projectObj.scripts && typeof projectObj.scripts === 'object') {
          scriptsToRemove = Object.keys(projectObj.scripts);
        }
      }
    } catch (_) {}

    const list = loadProjectsFromCache(currentUser.username);
    const filtered = list.filter((p) => {
      if (!p) return false;
      const pName = (p.settings && p.settings.name) ? p.settings.name : '';
      const pId = p.id || (p.settings && p.settings.id) || normalizeProjectIdFromName(pName);
      if (pName === projectName) return false;
      if (projectId && pId === projectId) return false;
      return true;
    });
    saveProjectsToCache(currentUser.username, filtered);
    updateAppState({ projects: filtered });

    const wasActiveProject = localStorage.getItem('amiantoActiveProjectName') === projectName
      || (projectId && localStorage.getItem('amiantoActiveProjectId') === projectId);

    removeProjectFromEditorCache(projectName, projectId);

    scriptsToRemove.forEach((scriptName) => {
      try { localStorage.removeItem(`script-${scriptName}`); } catch (_) {}
    });

    if (wasActiveProject) {
      clearInMemoryProjectState();
    }

    try { await deleteProjectFileFromOPFS(projectName); } catch (_) {}

    const remainingProjects = filtered;

    showNotification(
      'Project removed from editor. The .amnt file on disk was not deleted.',
      'success'
    );

    if (remainingProjects.length === 0) {
      clearEditorWorkspaceAfterProjectRemoved();
      localStorage.removeItem('amiantoActiveProjectName');
      localStorage.removeItem('amiantoActiveProjectOwner');
      localStorage.removeItem('amiantoActiveProjectId');

      if (typeof showSectionById === 'function') {
        showSectionById('projects', false);
      } else {
        const projectsButton = document.querySelector('[data-section="projects"]');
        if (projectsButton) projectsButton.click();
      }

      await showProjectSelectionModal(true);
    }
  }

  // Show project list (modal)
  window.showProjectList = async function() {
    ensureCurrentUser();
    
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    // Crea modale
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'projectListModal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'projectListModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    const count = userProjects.length;
    const itemsHtml = count === 0 ? `
      <div class="text-center text-muted py-4">No projects found. Create a new project from Profile &gt; File menu.</div>
    ` : userProjects.map((p, i) => {
      const name = (p && p.settings && p.settings.name) ? p.settings.name : `Project ${i+1}`;
      const updated = (p && (p.updatedAt || p.createdAt)) ? (p.updatedAt || p.createdAt) : '';
      const updatedShort = updated ? new Date(updated).toLocaleString() : '';
      return `
        <li class="list-group-item bg-secondary text-light d-flex justify-content-between align-items-center">
          <div>
            <strong>${name}</strong>
            ${updatedShort ? `<br><small class="text-muted">Updated: ${updatedShort}</small>` : ''}
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-success" data-name="${name}" data-action="open">Open</button>
            <button class="btn btn-outline-danger" data-name="${name}" data-action="delete">Delete</button>
          </div>
        </li>
      `;
    }).join('');
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title" id="projectListModalLabel">My Projects</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div><span class="badge bg-info">${count}</span> projects</div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-light" id="btn-new-project">New Project</button>
                <button class="btn btn-outline-light" id="btn-import-json">Import JSON</button>
              </div>
            </div>
            <ul class="list-group">
              ${itemsHtml}
            </ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', function () { modal.remove(); });
    // Bind azioni - usa capture: true per intercettare prima di altri listener
    modal.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const action = t.getAttribute('data-action');
      const name = t.getAttribute('data-name');
      
      if (action === 'open' && name) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // NON chiudere qui - aspetta che il progetto sia caricato
        showNotification(`Loading project "${name}"...`, 'info');
        
        try {
          await openProjectByName(name);
          
          // Chiudi il modale DOPO che il progetto Ã¨ stato caricato con successo
          const inst = bootstrap.Modal.getInstance(modal);
          if (inst) {
            inst.hide();
            // Il listener hidden.bs.modal giÃ  presente rimuoverÃ  il modale dal DOM
          } else {
            // Fallback: chiudi manualmente se Bootstrap non Ã¨ disponibile
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
            modal.remove();
          }
        } catch (error) {
          console.error('[ProjectListModal] Errore apertura progetto:', error);
          showNotification('Error opening project', 'danger');
          // Non chiudere il modale in caso di errore
        }
        return false;
      }
      
      if (action === 'delete' && name) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        await deleteProjectByName(name);
        // aggiorna lista nel modale senza ricrearlo
        const li = t.closest('li');
        if (li) li.remove();
        
        // Verifica se ci sono ancora progetti dopo l'eliminazione
        const remainingProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
        if (remainingProjects.length === 0) {
          // Se non ci sono piÃ¹ progetti, chiudi il modale "My Projects"
          // Il modale di selezione verrÃ  mostrato automaticamente da deleteProjectByName
          const projectListModal = document.getElementById('projectListModal');
          if (projectListModal) {
            const bsModal = bootstrap.Modal.getInstance(projectListModal);
            if (bsModal) {
              bsModal.hide();
            }
          }
        } else {
          // Aggiorna il contatore dei progetti nel modale
          const badge = modal.querySelector('.badge');
          if (badge) {
            badge.textContent = `${remainingProjects.length} projects`;
          }
        }
        
        return false;
      }
    }, { capture: true });
    // New / Import
    modal.querySelector('#btn-new-project')?.addEventListener('click', async () => {
      const projectName = prompt('Enter project name:');
      if (!projectName || !projectName.trim()) return;

      const created = await window.createNewProject(projectName.trim(), true);
      if (!created || !created.ok) return;

      const inst = bootstrap.Modal.getInstance(modal);
      if (inst) inst.hide();
    });
    modal.querySelector('#btn-import-json')?.addEventListener('click', async () => {
      try {
        if (!window.showOpenFilePicker) { showNotification('Import not supported in this browser', 'warning'); return; }
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Amianto Project JSON', accept: { 'application/json': ['.json'] } }],
          multiple: false
        });
        const file = await handle.getFile();
        const text = await file.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        if (parsed && parsed.format === 'amianto-amnt') {
          await importAmntContent(text, null);
        } else {
          await importProjectFromJson(text);
        }
        const nameGuess = (() => {
          try {
            const o = parsed || JSON.parse(text);
            if (o && o.format === 'amianto-amnt' && o.project && o.project.settings) {
              return o.project.settings.name || null;
            }
            return (o && o.settings && o.settings.name) ? o.settings.name : null;
          } catch (_) { return null; }
        })();
        if (nameGuess) {
          // aggiungi alla lista utente se manca
          const arr = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
          if (!arr.find(p => p && p.settings && p.settings.name === nameGuess)) {
            arr.push({ settings: { name: nameGuess, canvasWidth: gameViewport.width, canvasHeight: gameViewport.height }, createdAt: new Date().toISOString() });
            localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(arr));
          }
          localStorage.setItem(`amiantoProject_${currentUser.username}:${nameGuess}`, text);
          localStorage.setItem('amiantoActiveProjectName', nameGuess);
          localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
        }
        const inst = bootstrap.Modal.getInstance(modal);
        if (inst) inst.hide();
        showNotification('Project imported', 'success');
      } catch (err) {
        addDebugMessage('Import failed: ' + (err && err.message ? err.message : err), 'error');
        showNotification('Import failed', 'danger');
      }
    });
  };

  // Delete current project
  window.deleteCurrentProject = async function() {
    ensureCurrentUser();

    let projectName = localStorage.getItem('amiantoActiveProjectName');
    if (!projectName) {
      const projectNameInput = document.getElementById('projectName');
      projectName = projectNameInput ? projectNameInput.value : null;
    }
    if (!projectName) {
      try {
        const projectObj = window.serializeProject();
        projectName = projectObj.settings && projectObj.settings.name ? projectObj.settings.name : null;
      } catch (_) {}
    }
    if (!projectName) {
      showNotification('No project is open to delete', 'warning');
      return;
    }

    await deleteProjectByName(projectName);
    await loadAndRenderProjectsTab();
  };

  // Export project as .amnt (full bundle)
  window.exportProject = async function() {
    ensureCurrentUser();
    if (!window.AmiantoAmnt) {
      showNotification('Project format module not loaded', 'error');
      return;
    }

    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProjectName) {
      showNotification('No project is currently open', 'warning');
      return;
    }

    let projectObj = window.serializeProject();
    try {
      projectObj = await saveAllAssetsToStorage(projectObj, getStableProjectId(projectObj.settings, activeProjectName));
    } catch (_) {}

    const pkg = await buildAmntPackageFromEditor(projectObj);
    const text = window.AmiantoAmnt.stringify(pkg, true);
    const defaultName = window.AmiantoAmnt.defaultFileName(activeProjectName);

    const location = await pickProjectSaveLocation(activeProjectName);
    if (location) {
      const written = await writeAmntContent(activeProjectName, text, location);
      showNotification(written ? `Exported to ${written}` : 'Project exported', 'success');
      return;
    }

    downloadBlob(text, defaultName, 'application/json');
    showNotification('Project exported as .amnt', 'success');
  };

  /**
   * Export a single self-contained HTML game (runtime + project + assets).
   * Open the file in a browser — no editor required.
   */
  window.exportStandaloneGame = async function exportStandaloneGame() {
    try {
      ensureCurrentUser();
      if (!window.AmiantoStandaloneExport || typeof window.AmiantoStandaloneExport.buildStandaloneHtml !== 'function') {
        showNotification('Standalone export module not loaded — restart the app', 'error');
        return;
      }
      if (!window.AmiantoAmnt) {
        showNotification('Project format module not loaded', 'error');
        return;
      }

      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (!activeProjectName) {
        showNotification('Open a project before exporting the game', 'warning');
        return;
      }

      const base = window.AmiantoStandaloneExport.safeFileBase(activeProjectName);
      const defaultName = `${base}.html`;

      // 1) Chiedi subito dove salvare (feedback immediato)
      let targetPath = null;
      let downloadFallback = false;

      if (window.amiantoNativeFs && typeof window.amiantoNativeFs.showSaveDialog === 'function') {
        try {
          targetPath = await window.amiantoNativeFs.showSaveDialog(defaultName, { kind: 'html' });
        } catch (dialogErr) {
          console.error('[ExportGame] Native save dialog failed:', dialogErr);
          showNotification('Save dialog failed: ' + (dialogErr.message || dialogErr), 'error');
          return;
        }
        if (!targetPath) {
          showNotification('Export cancelled', 'info');
          return;
        }
      } else if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{ description: 'HTML Game', accept: { 'text/html': ['.html'] } }]
          });
          targetPath = handle;
        } catch (pickerErr) {
          if (pickerErr && pickerErr.name === 'AbortError') {
            showNotification('Export cancelled', 'info');
            return;
          }
          downloadFallback = true;
        }
      } else {
        downloadFallback = true;
      }

      showNotification('Building standalone HTML… (may take a moment)', 'info');

      let projectObj = window.serializeProject();
      try {
        projectObj = await saveAllAssetsToStorage(
          projectObj,
          getStableProjectId(projectObj.settings, activeProjectName)
        );
      } catch (_) {}

      const pkg = await buildAmntPackageFromEditor(projectObj);
      const runtimeSource = await loadRuntimeSourceForExport();
      if (!runtimeSource) {
        showNotification('Could not load JS/runtime.js for export', 'error');
        return;
      }

      let faviconDataUrl = null;
      try {
        const favRes = await fetch('img/mnt.png', { cache: 'no-store' });
        if (favRes.ok) {
          const blob = await favRes.blob();
          faviconDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch (_) {}

      const html = window.AmiantoStandaloneExport.buildStandaloneHtml(pkg, runtimeSource, {
        title: activeProjectName,
        faviconDataUrl: faviconDataUrl || undefined
      });

      if (typeof targetPath === 'string' && window.amiantoNativeFs) {
        const written = await writeLargeTextFile(targetPath, html);
        const mb = (written.bytes / (1024 * 1024)).toFixed(1);
        showNotification(`Game exported (${mb} MB): ${targetPath}`, 'success');
        return;
      }

      if (targetPath && typeof targetPath.createWritable === 'function') {
        const writable = await targetPath.createWritable();
        await writable.write(html);
        await writable.close();
        showNotification('Game exported as HTML', 'success');
        return;
      }

      if (downloadFallback || !targetPath) {
        downloadBlob(html, defaultName, 'text/html;charset=utf-8');
        showNotification('Game exported as HTML (download started)', 'success');
      }
    } catch (err) {
      console.error('[ExportGame] Failed:', err);
      showNotification('Export failed: ' + (err && err.message ? err.message : err), 'error');
    }
  };

  /** Scrive HTML grandi a chunk via IPC (un solo invoke fallisce oltre pochi MB). */
  async function writeLargeTextFile(filePath, content) {
    const text = String(content || '');
    const fsApi = window.amiantoNativeFs;
    if (!fsApi) throw new Error('Native FS unavailable');

    if (typeof fsApi.writeFileChunkedBegin === 'function') {
      const CHUNK = 512 * 1024; // 512 KB per messaggio IPC
      const id = await fsApi.writeFileChunkedBegin(filePath);
      try {
        for (let i = 0; i < text.length; i += CHUNK) {
          await fsApi.writeFileChunkedAppend(id, text.slice(i, i + CHUNK));
        }
        return await fsApi.writeFileChunkedEnd(id);
      } catch (err) {
        try {
          if (typeof fsApi.writeFileChunkedAbort === 'function') {
            await fsApi.writeFileChunkedAbort(id);
          } else {
            await fsApi.writeFileChunkedEnd(id);
          }
        } catch (_) {}
        throw err;
      }
    }

    await fsApi.writeFile(filePath, text);
    return { bytes: new Blob([text]).size, filePath };
  }

  async function fetchAppTextFile(relPath) {
    if (window.amiantoNativeFs && typeof window.amiantoNativeFs.readAppFile === 'function') {
      try {
        const text = await window.amiantoNativeFs.readAppFile(relPath);
        if (text && text.length > 20) return text;
      } catch (err) {
        console.warn('[ExportGame] readAppFile failed for', relPath, err);
      }
    }
    try {
      const res = await fetch(relPath, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 20) return text;
      }
    } catch (err) {
      console.warn('[ExportGame] fetch failed for', relPath, err);
    }
    return await new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', relPath, true);
        xhr.onload = () => {
          if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
            resolve(xhr.responseText && xhr.responseText.length > 20 ? xhr.responseText : null);
          } else {
            resolve(null);
          }
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
      } catch (_) {
        resolve(null);
      }
    });
  }

  /**
   * Standalone export embeds libs + runtime as one script (same order as runtime.html).
   */
  async function loadRuntimeSourceForExport() {
    const parts = [
      await fetchAppTextFile('JS/lib/game-save-format.js'),
      await fetchAppTextFile('JS/lib/dialogue-logic.js'),
      await fetchAppTextFile('JS/runtime.js')
    ];
    if (!parts[2] || parts[2].length < 100) return null;
    // Libs are optional for older installs, but preferred
    return parts.filter(Boolean).join('\n;\n');
  }

  // Debug function to test coordinate conversion
  window.debugCoordinateConversion = function() {
    window.debugCoordinates = true;
    console.log('Debug mode enabled. Click on the canvas to see coordinate conversion details.');
    console.log('Canvas internal dimensions:', canvas.width, 'x', canvas.height);
    console.log('Canvas CSS dimensions:', canvas.style.width, 'x', canvas.style.height);
    
    // Add a temporary click listener for debugging
    const debugClick = (e) => {
      const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
      console.log('Final coordinates:', { x: Math.round(x), y: Math.round(y) });
    };
    
    canvas.addEventListener('click', debugClick, { once: true });
    setTimeout(() => {
      canvas.removeEventListener('click', debugClick);
      window.debugCoordinates = false;
      console.log('Debug mode disabled.');
    }, 10000);
  };

  // Multiple GUI management functions
  window.createGUI = function() {
    const name = prompt('Enter GUI name:', `GUI ${guis.length + 1}`);
    if (!name) return;
    
    const newGui = {
      id: uid('gui'),
      name: name,
      type: 'MainInterface',
      settings: {},
      background: null,
      buttons: []
    };
    
    guis.push(newGui);
    refreshGUISelector();
    selectGUI(newGui.id);
    showNotification(`GUI "${name}" created`, 'success');
  };

  window.renameGUI = function() {
    if (!currentGuiId) {
      showNotification('No GUI selected', 'warning');
      return;
    }
    
    const gui = guis.find(g => g.id === currentGuiId);
    if (!gui) return;
    
    const newName = prompt('Enter new GUI name:', gui.name);
    if (!newName || newName === gui.name) return;
    
    gui.name = newName;
    refreshGUISelector();
    showNotification(`GUI renamed to "${newName}"`, 'success');
  };

  window.deleteGUI = function() {
    if (!currentGuiId) {
      showNotification('No GUI selected', 'warning');
      return;
    }
    
    const gui = guis.find(g => g.id === currentGuiId);
    if (!gui) return;
    
    if (!confirm(`Delete GUI "${gui.name}"? This action cannot be undone.`)) return;
    
    guis = guis.filter(g => g.id !== currentGuiId);
    
    if (guis.length === 0) {
      currentGuiId = null;
      guiBackground = null;
      guiButtons = [];
    } else {
      selectGUI(guis[0].id);
    }
    
    refreshGUISelector();
    redraw();
    showNotification(`GUI "${gui.name}" deleted`, 'success');
  };

  window.selectGUI = function(guiId) {
    if (!guiId) {
      currentGuiId = null;
      guiBackground = null;
      guiButtons = [];
      selectedGuiButtonId = null;
      updateGuiToolbarForType('MainInterface');
      redraw();
      return;
    }
    
    const gui = guis.find(g => g.id === guiId);
    if (!gui) return;
    
    currentGuiId = guiId;
    guiBackground = gui.background;
    guiButtons = [...gui.buttons];
    selectedGuiButtonId = null;
    
    // Update selector
    const selector = document.getElementById('gui-selector');
    if (selector) selector.value = guiId;
    // Update type selector and render settings
    const typeSel = document.getElementById('gui-type-select');
    const guiType = (gui.type === 'Inventory') ? 'OverlayCustom' : (gui.type || 'MainInterface');
    if (gui.type === 'Inventory') gui.type = guiType;
    if (typeSel) typeSel.value = guiType;
    renderGuiSettingsPanel(guiType, gui.settings || {});
    updateGuiToolbarForType(guiType);
    
    redraw();
    refreshGuiButtonsList();
    showNotification(`Switched to GUI "${gui.name}"`, 'info');
  };

  function refreshGUISelector() {
    const selector = document.getElementById('gui-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    if (guis.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No GUIs available';
      selector.appendChild(opt);
      return;
    }
    
    guis.forEach(gui => {
      const opt = document.createElement('option');
      opt.value = gui.id;
      opt.textContent = gui.name;
      if (gui.id === currentGuiId) opt.selected = true;
      selector.appendChild(opt);
    });
  }

  function saveCurrentGUI() {
    if (!currentGuiId) return;
    
    const gui = guis.find(g => g.id === currentGuiId);
    if (!gui) return;
    
    gui.background = guiBackground;
    gui.buttons = [...guiButtons];
    // Persist type and settings from UI if present
    const typeSel = document.getElementById('gui-type-select');
    if (typeSel) gui.type = typeSel.value || gui.type || 'MainInterface';
    const collected = collectGuiSettingsFromUI(gui.type || 'MainInterface');
    gui.settings = collected;
  }

  // Initialize default GUI
  function initializeDefaultGUI() {
    if (guis.length === 0) {
      const defaultGui = {
        id: uid('gui'),
        name: 'Main GUI',
        type: 'MainInterface',
        settings: {},
        background: null,
        buttons: []
      };
      guis.push(defaultGui);
      currentGuiId = defaultGui.id;
      refreshGUISelector();
    }
  }

  // Initialize GUI system
  initializeDefaultGUI();
  // Initialize GUI type & settings panel for current GUI
  try {
    const typeSelInit = document.getElementById('gui-type-select');
    if (typeSelInit && currentGuiId) {
      const g = guis.find(x => x.id === currentGuiId);
      if (g) {
        typeSelInit.value = g.type || 'MainInterface';
        renderGuiSettingsPanel(g.type || 'MainInterface', g.settings || {});
        updateGuiToolbarForType(g.type || 'MainInterface');
      }
    }
  } catch(_) {}

  // Category cursors management
  function getCursorByCategory(category) {
    return contextualCursors.find(c => c.category === category) || null;
  }

  function updateCursorPivotLabel(cursor) {
    const label = document.getElementById('cursor-pivot-label');
    if (!label) return;
    if (!cursor) {
      label.textContent = '—';
      return;
    }
    const px = typeof cursor.pivotX === 'number' ? cursor.pivotX : 0;
    const py = typeof cursor.pivotY === 'number' ? cursor.pivotY : 0;
    label.textContent = `(${px}, ${py})`;
  }

  function applyCursorCssStyle(cursor) {
    if (cursor && cursor.cursorImage && cursor.cursorImage.src) {
      const px = typeof cursor.pivotX === 'number' ? cursor.pivotX : 0;
      const py = typeof cursor.pivotY === 'number' ? cursor.pivotY : 0;
      canvas.style.cursor = `url(${cursor.cursorImage.src}) ${px} ${py}, auto`;
      return true;
    }
    return false;
  }

  window.createCursor = function() {
    const categoryEl = document.getElementById('cursor-category');
    const category = categoryEl ? categoryEl.value : 'default';
    if (!CURSOR_CATEGORIES.includes(category)) {
      showNotification('Invalid cursor category', 'warning');
      return;
    }

    if (getCursorByCategory(category)) {
      showNotification(`A cursor for category "${category}" already exists`, 'warning');
      return;
    }

    const actionTextEl = document.getElementById('cursor-action-text');
    const newCursor = {
      id: uid('cursor'),
      category,
      cursorImage: null,
      actionText: actionTextEl ? (actionTextEl.value || '') : '',
      scriptName: '',
      pivotX: 0,
      pivotY: 0
    };

    contextualCursors.push(newCursor);
    selectedCursorId = newCursor.id;
    refreshCursorsList();
    redraw();
    showNotification(`Cursor created for category: ${category}`, 'success');
  };

  window.onCursorCategoryChange = function() {
    const categoryEl = document.getElementById('cursor-category');
    const category = categoryEl ? categoryEl.value : null;
    if (!category || !CURSOR_CATEGORIES.includes(category)) return;

    if (!selectedCursorId) return;

    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    if (cursor.category === category) return;

    const existing = getCursorByCategory(category);
    if (existing && existing.id !== cursor.id) {
      showNotification(`Category "${category}" is already used by another cursor`, 'warning');
      categoryEl.value = cursor.category;
      return;
    }

    cursor.category = category;
    refreshCursorsList();
    redraw();
    showNotification(`Cursor category set to: ${category}`, 'info');
  };

  window.editCursor = function() {
    // Kept for compatibility — meta updates happen via updateSelectedCursorMeta / select
    window.updateSelectedCursorMeta();
  };

  window.updateSelectedCursorMeta = function() {
    if (!selectedCursorId) return;
    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    const actionTextEl = document.getElementById('cursor-action-text');
    if (actionTextEl) cursor.actionText = actionTextEl.value || '';
    refreshCursorsList();
  };

  window.deleteCursor = function() {
    if (!selectedCursorId) {
      showNotification('No cursor selected', 'warning');
      return;
    }

    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;

    if (!confirm(`Delete cursor for category "${cursor.category}"?`)) return;

    contextualCursors = contextualCursors.filter(c => c.id !== selectedCursorId);
    selectedCursorId = contextualCursors.length ? contextualCursors[0].id : null;
    refreshCursorsList();
    redraw();
    showNotification('Cursor deleted', 'success');
  };

  window.clearCursorImage = function() {
    if (!selectedCursorId) {
      showNotification('Select a cursor first', 'warning');
      return;
    }
    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    cursor.cursorImage = null;
    refreshCursorsList();
    redraw();
    showNotification('Cursor image cleared', 'info');
  };

  window.uploadCursorImage = async function() {
    if (!selectedCursorId) {
      showNotification('Select or create a cursor first', 'warning');
      return;
    }

    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;

    if (!currentUser) {
      showNotification('Open a project first', 'warning');
      return;
    }
    if (!getActiveProjectId()) {
      showNotification('No project is open', 'warning');
      return;
    }

    const resource = await pickResourceImage({ title: 'Cursor image from Resources' });
    if (!resource) return;

    try {
      const img = await loadImageFromResourceEntry(resource);
      if (!img) throw new Error('Failed to load image from Resources');
      cursor.cursorImage = img;
      // Keep existing pivot if set; otherwise default click point to (0,0)
      if (cursor.pivotX === undefined || cursor.pivotY === undefined) {
        cursor.pivotX = 0;
        cursor.pivotY = 0;
      }
      showNotification(`Cursor image set for category: ${cursor.category}`, 'success');
      refreshCursorsList();
      redraw();
    } catch (error) {
      console.error('[Asset] Errore cursore da Resources:', error);
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  const btnCursorBrowse = document.getElementById('btn-cursor-browse-image');
  if (btnCursorBrowse) {
    btnCursorBrowse.addEventListener('click', () => window.uploadCursorImage());
  }

  // Legacy no-op: targets are no longer used
  updateCursorTargets = function() {};
  window.updateCursorTargets = updateCursorTargets;

  window.attachScriptToCursor = function() {
    const cursorId = document.getElementById('cursor-script-target')
      ? document.getElementById('cursor-script-target').value
      : selectedCursorId;
    if (!cursorId) {
      showNotification('Please select a cursor', 'warning');
      return;
    }

    const scriptName = document.getElementById('script-selector').value;
    if (!scriptName) {
      showNotification('Please select a script', 'warning');
      return;
    }

    const cursor = contextualCursors.find(c => c.id === cursorId);
    if (!cursor) return;

    cursor.scriptName = scriptName;
    refreshCursorsList();
    showNotification(`Script "${scriptName}" attached to cursor category: ${cursor.category}`, 'success');
  };

  function refreshCursorsList() {
    const list = document.getElementById('cursors-list');
    if (!list) return;

    list.innerHTML = '';

    // Sort by category order
    const sorted = [...contextualCursors].sort((a, b) => {
      return CURSOR_CATEGORIES.indexOf(a.category) - CURSOR_CATEGORIES.indexOf(b.category);
    });

    sorted.forEach(cursor => {
      const item = document.createElement('div');
      item.className = `list-group-item list-group-item-action ${selectedCursorId === cursor.id ? 'active' : ''}`;
      item.dataset.cursorId = cursor.id;

      const hasImage = cursor.cursorImage ? 'Has image' : 'No image';
      const hasScript = cursor.scriptName ? ' · Has script' : '';
      const label = CURSOR_CATEGORY_LABELS[cursor.category] || cursor.category;

      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${label}</strong>
            <br>
            <small class="text-muted">
              ${hasImage}${hasScript}${cursor.actionText ? ` | "${cursor.actionText}"` : ''}
              · click (${typeof cursor.pivotX === 'number' ? cursor.pivotX : 0}, ${typeof cursor.pivotY === 'number' ? cursor.pivotY : 0})
            </small>
          </div>
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-light btn-sm" onclick="selectCursor('${cursor.id}')">Select</button>
            <button class="btn btn-outline-danger btn-sm" onclick="deleteCursorById('${cursor.id}')">Delete</button>
          </div>
        </div>
      `;

      item.addEventListener('click', () => selectCursor(cursor.id));
      list.appendChild(item);
    });

    const selected = selectedCursorId
      ? contextualCursors.find(c => c.id === selectedCursorId)
      : null;
    const categoryEl = document.getElementById('cursor-category');
    const actionEl = document.getElementById('cursor-action-text');
    if (selected) {
      if (categoryEl) categoryEl.value = selected.category;
      if (actionEl) actionEl.value = selected.actionText || '';
      updateCursorPivotLabel(selected);
    } else {
      updateCursorPivotLabel(null);
      if (actionEl) actionEl.value = '';
    }
  }

  function selectCursor(cursorId) {
    selectedCursorId = cursorId;
    const cursor = contextualCursors.find(c => c.id === cursorId);
    if (!cursor) return;

    const categoryEl = document.getElementById('cursor-category');
    const actionEl = document.getElementById('cursor-action-text');
    if (categoryEl) categoryEl.value = cursor.category;
    if (actionEl) actionEl.value = cursor.actionText || '';
    updateCursorPivotLabel(cursor);

    refreshCursorsList();
    redraw();
    showNotification(`Selected cursor: ${cursor.category}`, 'info');
  }

  window.selectCursor = selectCursor;

  window.deleteCursorById = function(cursorId) {
    const cursor = contextualCursors.find(c => c.id === cursorId);
    if (!cursor) return;

    if (!confirm(`Delete cursor for category "${cursor.category}"?`)) return;

    contextualCursors = contextualCursors.filter(c => c.id !== cursorId);
    if (selectedCursorId === cursorId) {
      selectedCursorId = contextualCursors.length ? contextualCursors[0].id : null;
    }
    refreshCursorsList();
    redraw();
    showNotification('Cursor deleted', 'success');
  };

  function refreshCursorScriptTargets() {
    const sel = document.getElementById('cursor-script-target');
    if (!sel) return;

    sel.innerHTML = '<option value="">Select cursor...</option>';

    contextualCursors.forEach(cursor => {
      const opt = document.createElement('option');
      opt.value = cursor.id;
      opt.textContent = CURSOR_CATEGORY_LABELS[cursor.category] || cursor.category;
      sel.appendChild(opt);
    });
  }

  // Category cursor hint while hovering interactive elements on the rooms canvas
  function checkContextualCursor(e) {
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    if (activeTab === 'cursors' || activeTab === 'characters' || activeTab === 'animations' || activeTab === 'inventory') {
      return;
    }

    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    let hoveringInteractive = false;

    for (const hotspot of hotspots) {
      if (isPointInHotspot(x, y, hotspot)) {
        hoveringInteractive = true;
        break;
      }
    }

    if (!hoveringInteractive) {
      for (const obj of sceneObjects) {
        if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
          hoveringInteractive = true;
          break;
        }
      }
    }

    let category = hoveringInteractive ? 'use' : 'default';
    if (hoveringInteractive && !getCursorByCategory('use')) {
      category = getCursorByCategory('look') ? 'look' : 'default';
    }

    const cursor = getCursorByCategory(category) || getCursorByCategory('default');
    if (!applyCursorCssStyle(cursor)) {
      canvas.style.cursor = hoveringInteractive ? 'pointer' : 'default';
    }
  }

  function isPointInHotspot(x, y, hotspot) {
    if (!hotspot.points || hotspot.points.length < 3) return false;

    // Simple point-in-polygon test
    let inside = false;
    for (let i = 0, j = hotspot.points.length - 1; i < hotspot.points.length; j = i++) {
      if (((hotspot.points[i].y > y) !== (hotspot.points[j].y > y)) &&
          (x < (hotspot.points[j].x - hotspot.points[i].x) * (y - hotspot.points[i].y) / (hotspot.points[j].y - hotspot.points[i].y) + hotspot.points[i].x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getCharacterBounds(charName) {
    // Simple character bounds detection - you might want to improve this
    // For now, return a default area
    return { x: 100, y: 100, w: 50, h: 100 };
  }

  // Initialize cursor system
  function syncShowCursorActionTextCheckbox(settings) {
    const el = document.getElementById('show-cursor-action-text');
    if (!el) return;
    const src = settings || (() => {
      try { return JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) { return null; }
    })();
    el.checked = !!(src && src.showCursorActionText);
  }

  window.onShowCursorActionTextChange = function onShowCursorActionTextChange() {
    const el = document.getElementById('show-cursor-action-text');
    let settings = null;
    try { settings = JSON.parse(localStorage.getItem('amiantoProjectSettings') || 'null'); } catch (_) {}
    if (!settings || typeof settings !== 'object') settings = {};
    settings.showCursorActionText = !!(el && el.checked);
    localStorage.setItem('amiantoProjectSettings', JSON.stringify(settings));
    showNotification(
      settings.showCursorActionText
        ? 'Action text on hover enabled (save project to keep)'
        : 'Action text on hover disabled (save project to keep)',
      'info'
    );
  };

  function initializeCursorSystem() {
    syncShowCursorActionTextCheckbox();
    refreshCursorsList();
  }

  initializeCursorSystem();

  // ============================================
  // Console Resize Handle - ridimensionamento verticale delle console
  // ============================================
  function initializeConsoleResize() {
    const resizeHandle = document.getElementById('console-resize-handle');
    const scriptConsole = document.getElementById('script-console');
    const debugConsole = document.getElementById('debug-console');
    
    if (!resizeHandle || !scriptConsole || !debugConsole) {
      return;
    }

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    const minHeight = 100;
    const maxHeight = 800;

    resizeHandle.addEventListener('mousedown', function(e) {
      isResizing = true;
      startY = e.clientY;
      startHeight = parseInt(window.getComputedStyle(scriptConsole).height, 10);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isResizing) return;
      
      const deltaY = startY - e.clientY; // Invertito per rendere il drag verso l'alto = aumento altezza
      let newHeight = startHeight + deltaY;
      
      // Limita l'altezza tra minHeight e maxHeight
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      
      // Applica la nuova altezza a entrambe le console
      scriptConsole.style.height = newHeight + 'px';
      debugConsole.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Inizializza il resize handle quando il DOM Ã¨ pronto
  initializeConsoleResize();

  // ============================================
  // Console Log Toggle - nascondi/mostra console log
  // ============================================
  function initializeConsoleLogToggle() {
    const toggleBtn = document.getElementById('console-log-toggle');
    const toggleLabel = document.getElementById('console-log-toggle-icon');
    const logsContainer = document.getElementById('logs-container');
    const resizeHandle = document.getElementById('console-resize-handle');
    
    if (!toggleBtn || !toggleLabel || !logsContainer || !resizeHandle) {
      return;
    }

    // Funzione per ottenere lo stato salvato (default: visibile)
    function getConsoleLogVisibility() {
      const saved = localStorage.getItem('amiantoConsoleLogVisible');
      return saved === null ? true : saved === 'true';
    }

    // Funzione per salvare lo stato
    function setConsoleLogVisibility(visible) {
      localStorage.setItem('amiantoConsoleLogVisible', visible.toString());
    }

    // Funzione per applicare lo stato
    function applyConsoleLogVisibility(visible) {
      const wrapper = document.querySelector('.console-logs-wrapper');
      if (visible) {
        logsContainer.style.display = 'flex';
        resizeHandle.style.display = 'flex';
        toggleLabel.textContent = 'Hide';
        toggleBtn.title = 'Hide console logs';
        if (wrapper) wrapper.classList.remove('console-hidden');
      } else {
        logsContainer.style.display = 'none';
        resizeHandle.style.display = 'none';
        toggleLabel.textContent = 'Show';
        toggleBtn.title = 'Show console logs';
        if (wrapper) wrapper.classList.add('console-hidden');
      }
    }

    // Carica lo stato salvato all'avvio
    const isVisible = getConsoleLogVisibility();
    applyConsoleLogVisibility(isVisible);

    // Gestisci il click sul toggle
    toggleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const currentVisibility = getConsoleLogVisibility();
      const newVisibility = !currentVisibility;
      setConsoleLogVisibility(newVisibility);
      applyConsoleLogVisibility(newVisibility);
    });

    // Esponi la funzione per applicare lo stato quando si cambia tab
    window.applyConsoleLogVisibilityState = function() {
      const isVisible = getConsoleLogVisibility();
      applyConsoleLogVisibility(isVisible);
    };
  }

  // Inizializza il toggle quando il DOM Ã¨ pronto
  initializeConsoleLogToggle();

  // Gestione sottomenu File nel dropdown del profilo
  const submenuItems = document.querySelectorAll('.dropdown-submenu > .dropdown-item');
  submenuItems.forEach(item => {
    item.addEventListener('click', function(e) {
      if (window.innerWidth <= 768) {
        // Su dispositivi mobili, toggle del sottomenu
        e.preventDefault();
        e.stopPropagation();
        const submenu = this.nextElementSibling;
        if (submenu && submenu.classList.contains('dropdown-menu')) {
          submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
        }
      }
    });
  });

  // Expose global functions
  window.showNotification = showNotification;
  window.addDebugMessage = addDebugMessage;
  window.redraw = redraw;

  if (typeof window.initAmiantoResources === 'function') {
    window.initAmiantoResources({
      getProjectId: getActiveProjectId,
      uploadImage: uploadImage,
      saveAssetMetadata: saveAssetMetadata,
      deleteFirestoreAsset: deleteFirestoreAssetDoc,
      showNotification: showNotification,
      generateAssetId: generateAssetId,
      updateProjectSizeIndicator: typeof updateProjectSizeIndicator === 'function' ? updateProjectSizeIndicator : null
    });
  }
});
