// main.js

/* ============================
   APP STATE - UNICA FONTE DI VERITÀ
   ============================ */

/**
 * Stato globale dell'applicazione
 * Questa è l'UNICA fonte di verità per:
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
 * @param {Object} updates - Oggetto con le proprietà da aggiornare
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

/**
 * Bootstrap globale dell'applicazione
 * 
 * Responsabilità:
 * - attendere autenticazione Firebase
 * - caricare SEMPRE i progetti da Firestore (non dalla cache)
 * - popolare AppState.projects
 * - aggiornare localStorage solo come cache secondaria
 * - impostare AppState.initialized = true
 * 
 * La UI NON deve essere utilizzabile prima che bootstrapApp sia completata.
 * 
 * @returns {Promise<void>}
 */
async function bootstrapApp() {
  console.log('========================================');
  console.log('🚀 BOOTSTRAP START');
  console.log('========================================');
  
  updateAppState({ loading: true, error: null });
  
  // Mostra loading overlay visivamente
  showLoadingOverlay('Loading application...');
  
  try {
    // STEP 1: Attendi che Firebase sia disponibile
    console.log('[BOOTSTRAP] Attesa Firebase...');
    
    let firebaseReady = false;
    let attempts = 0;
    const maxAttempts = 50; // 5 secondi max
    
    while (!firebaseReady && attempts < maxAttempts) {
      if (window.firebaseAuth && window.firebaseDB) {
        firebaseReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!firebaseReady) {
      throw new Error('Firebase non disponibile dopo 5 secondi');
    }
    
    console.log('[BOOTSTRAP] ✅ Firebase disponibile');
    
    // STEP 2: Attendi autenticazione utente
    console.log('[BOOTSTRAP] Attesa autenticazione...');
    
    const currentUser = window.firebaseAuth.currentUser;
    
    if (!currentUser) {
      console.log('[BOOTSTRAP] ⚠️ Nessun utente autenticato - app in modalità login');
      updateAppState({ 
        loading: false, 
        initialized: true,
        user: null,
        projects: []
      });
      console.log('========================================');
      console.log('✅ BOOTSTRAP COMPLETE (no user)');
      console.log('========================================');
      return;
    }
    
    // STEP 3: Mappa utente
    const mappedUser = {
      username: (currentUser.email || '').split('@')[0] || (currentUser.uid ? `user_${currentUser.uid.substring(0, 6)}` : 'User'),
      email: currentUser.email || '',
      uid: currentUser.uid
    };
    
    updateAppState({ user: mappedUser });
    console.log('[BOOTSTRAP] ✅ USER AUTHENTICATED:', mappedUser.username);
    
    // STEP 4: Carica progetti SEMPRE da Firestore (non dalla cache)
    console.log('[BOOTSTRAP] Caricamento progetti da Firestore...');
    
    let projects = [];
    
    try {
      // Usa loadProjectsDirectlyFromFirestore per ottenere dati sempre aggiornati
      projects = await loadProjectsDirectlyFromFirestore(currentUser.uid);
      console.log(`[BOOTSTRAP] ✅ PROJECTS LOADED: ${projects.length}`);
      
      // Aggiorna localStorage solo come cache secondaria
      if (mappedUser.username) {
        saveProjectsToCache(mappedUser.username, projects);
        console.log('[BOOTSTRAP] Cache localStorage aggiornata');
      }
    } catch (error) {
      console.error('[BOOTSTRAP] ❌ Errore caricamento progetti:', error);
      
      // In caso di errore, prova a caricare dalla cache come fallback
      if (mappedUser.username) {
        console.log('[BOOTSTRAP] Fallback a cache localStorage...');
        projects = loadProjectsFromCache(mappedUser.username);
        console.log(`[BOOTSTRAP] Progetti da cache: ${projects.length}`);
      }
      
      // Se anche la cache è vuota, continua comunque (utente nuovo)
      updateAppState({ error: error.message || 'Error loading projects' });
    }
    
    // STEP 5: Popola AppState
    updateAppState({ 
      projects: projects,
      loading: false,
      initialized: true
    });
    
    console.log('========================================');
    console.log('✅ BOOTSTRAP COMPLETE');
    console.log(`   User: ${mappedUser.username}`);
    console.log(`   Projects: ${projects.length}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('[BOOTSTRAP] ❌ Errore critico:', error);
    updateAppState({ 
      loading: false,
      initialized: true, // Inizializzato anche in caso di errore per permettere login
      error: error.message || 'Error during bootstrap'
    });
    
    console.log('========================================');
    console.log('⚠️ BOOTSTRAP COMPLETE (con errori)');
    console.log('========================================');
  }
}

document.addEventListener("DOMContentLoaded", () => {

  /* ============================
     PART 1 - Sistema Tabs Avanzato
     ============================ */
  const sectionButtons = document.querySelectorAll(".section-btn");
  const sections = document.querySelectorAll(".section");
  
  // Stato globale per le tabs
  const tabState = {
    currentTab: null,
    tabHistory: [],
    notifications: new Map()
  };

  // Funzione migliorata per mostrare una sezione
  function showSectionById(id, addToHistory = true) {
    if (!id || tabState.currentTab === id) return;
    
    // Blocca cambio tab se non c'è progetto aperto (tranne Projects e Docs)
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
    
    // Blocca cambio se il bottone è disabilitato
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
    // Controlla se c'è un progetto aperto e abilita/disabilita tab di conseguenza
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

    // Support for keyboard shortcuts (Ctrl + number)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
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
  // Usa un listener che si attiva dopo che il DOM è caricato e le funzioni sono disponibili
  setTimeout(() => {
    // Pulsante Create Project
    const btnCreateProject = document.getElementById('btn-create-project-in-tab');
    if (btnCreateProject && !btnCreateProject.hasAttribute('data-listener-attached')) {
      btnCreateProject.setAttribute('data-listener-attached', 'true');
      btnCreateProject.addEventListener('click', async () => {
        const projectName = prompt('Enter project name:');
        if (!projectName || !projectName.trim()) return;
        
        try {
          await window.createNewProject(projectName.trim(), true);
          // Ricarica la lista progetti
          await loadAndRenderProjectsTab();
        } catch (error) {
          console.error('[ProjectsTab] Errore creazione progetto:', error);
          showNotification('Error creating project', 'error');
        }
      });
    }
    
    // Pulsante Refresh
    const btnRefreshProjects = document.getElementById('btn-refresh-projects');
    if (btnRefreshProjects && !btnRefreshProjects.hasAttribute('data-listener-attached')) {
      btnRefreshProjects.setAttribute('data-listener-attached', 'true');
      btnRefreshProjects.addEventListener('click', async () => {
        btnRefreshProjects.disabled = true;
        btnRefreshProjects.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        try {
          await loadAndRenderProjectsTab();
          showNotification('Projects list refreshed', 'success');
        } catch (error) {
          console.error('[ProjectsTab] Errore refresh progetti:', error);
          showNotification('Error refreshing projects', 'error');
        } finally {
          btnRefreshProjects.disabled = false;
          btnRefreshProjects.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh List';
        }
      });
    }
  }, 1000);

  // Expose global functions for external use
  window.__amiantoTabs = {
    showSection: showSectionById,
    setNotification: setTabNotification,
    getCurrentTab: () => tabState.currentTab,
    getTabHistory: () => [...tabState.tabHistory]
  };

  // Safe stub to avoid early ReferenceError when tabs fire before full initialization
  let updateCursorTargets = function() {};
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
  // convenient references to current room data
  let background = null;
  let foregrounds = [];
  let sceneObjects = [];
  let selectedForegroundId = null;
  let selectedSceneObjectId = null;
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
  
  // Contextual cursors management
  let contextualCursors = []; // Array of cursor objects: { id, targetType, targetId, cursorImage, actionText, scriptName }
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
      rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], walkableArea: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
      currentRoomId = rid;
      bindRoomRefs();
      refreshRoomsSelector();
    }
    requestAnimationFrame(() => resetEditorViewCentered({ fit: true }));
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
      
      background = r.background;
    
    // IMPORTANTE: Non sovrascrivere foregrounds se sono già caricati e la room ha foregrounds
    // Questo previene la perdita di foreground durante il reload
    if (Array.isArray(r.foregrounds) && r.foregrounds.length > 0) {
      foregrounds = r.foregrounds;
      console.log(`[bindRoomRefs] ✓ Foreground ripristinati da room: ${foregrounds.length} layer`);
    } else if (!Array.isArray(foregrounds) || foregrounds.length === 0) {
      // Solo se non ci sono foreground nello stato globale, inizializza array vuoto
      foregrounds = [];
      console.log(`[bindRoomRefs] Nessun foreground nella room, inizializzato array vuoto`);
    } else {
      // Mantieni i foreground esistenti se la room non ne ha
      console.log(`[bindRoomRefs] Mantenuti foreground esistenti nello stato globale: ${foregrounds.length} layer`);
    }
    
    sceneObjects = r.sceneObjects;
    selectedForegroundId = foregrounds && foregrounds.length ? foregrounds[0].id : null;
    selectedSceneObjectId = sceneObjects && sceneObjects.length ? sceneObjects[0].id : null;
    walkableArea = r.walkableArea;
    // initialize hotspots container if missing for backward compatibility
    if (!Array.isArray(r.hotspots)) r.hotspots = [];
    hotspots = r.hotspots;
    // auto select first hotspot if none or if previous selection non valido
    if (!activeHotspotId || !hotspots.some(h => h.id === activeHotspotId)) {
      activeHotspotId = hotspots.length > 0 ? hotspots[0].id : null;
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
    document.getElementById('viewportSize').textContent = `${gameViewport.width}×${gameViewport.height}`;
  }

  // Draw image at original size with offset
  function drawImageAtOriginalSize(img, offsetX = 0, offsetY = 0) {
    if (!img) {
      console.warn('[drawImageAtOriginalSize] img is null or undefined');
      return;
    }
    
    // Controlla se l'immagine è completamente caricata
    // Usa naturalWidth/naturalHeight per maggiore affidabilità
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    if (!width || !height) {
      // Se l'immagine non è ancora caricata, aspetta e ridisegna
      if (!img.complete) {
        console.warn('[drawImageAtOriginalSize] Image not fully loaded yet, waiting...', {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          width: img.width,
          height: img.height
        });
        
        // Se non c'è già un handler onload, aggiungilo per ridisegnare quando l'immagine è pronta
        if (!img._onloadHandlerAdded) {
          img._onloadHandlerAdded = true;
          const originalOnload = img.onload;
          img.onload = () => {
            if (originalOnload) originalOnload.call(img);
            // Ridisegna quando l'immagine è caricata
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

  /** Visibilità/interattività a runtime (playtest); in editor si disegna sempre. */
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
    // L'origine (0,0) è ora nell'angolo in alto a sinistra del contenuto centrato
    if (background) {
      // Draw background scaled to viewport dimensions
      ctx.drawImage(background, 0, 0, gameViewport.width, gameViewport.height);
    } else {
      // Placeholder background
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, gameViewport.width, gameViewport.height);
    }

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

        // Draw selection outline if this is the dragged object
        // Only draw outline if no hotspot is selected (scene objects are locked)
        if (!activeHotspotId && isDraggingObject && draggedObject && draggedObject.id === obj.id) {
          ctx.save();
          ctx.strokeStyle = runtimeVisible ? 'rgba(57,255,20,0.8)' : 'rgba(160,160,160,0.9)';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(objX, objY, obj.img.width, obj.img.height);
          ctx.restore();
        }
      }
    }

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
        // Check if clicking on a scene object (rooms tab only)
        if (activeTab === 'rooms') {
          const worldPos = screenToWorld(e.clientX, e.clientY);
          const clickedObject = getObjectAtPoint(worldPos.x, worldPos.y);
          
          if (clickedObject) {
            // Lock scene objects if a hotspot is selected
            if (activeHotspotId) {
              return;
            }
            e.preventDefault();
            isDraggingObject = true;
            draggedObject = clickedObject;
            
            // Calculate offset from object center
            const objX = (clickedObject.x || 0);
            const objY = (clickedObject.y || 0);
            dragOffset.x = worldPos.x - objX;
            dragOffset.y = worldPos.y - objY;
            
            canvas.style.cursor = 'grabbing';
            redraw();
          }
        }
      }
    });

    canvas.addEventListener('mousemove', function(e) {
      // Check for contextual cursor changes
      checkContextualCursor(e);
      
      // Check for scaling line cursor changes (before hotspot to have priority)
      const scalingCursorSet = updateScalingCursor(e);
      
      // Check for hotspot vertex editing cursor changes (only if scaling didn't set cursor)
      if (!scalingCursorSet) {
        updateHotspotCursor(e);
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
        showNotification(`GUI button created (${btn.w}×${btn.h})`, 'success');
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
    
    // Handle character pivot movement first (in characters tab)
    // Works like polygon points - always moves pivot on click
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

    // ⚠️ CAUSA RADICE DEL BUG: Questo blocco gestiva i click durante il playtest
    // sul canvas dell'EDITOR, causando doppia esecuzione perché:
    // 1. Il listener in main.js gestiva i click sul canvas dell'editor
    // 2. Il listener in runtime.js gestiva i click sul canvas del runtime (finestra separata)
    // 3. Quando il playtest è attivo, il runtime dovrebbe essere l'unico a gestire i click
    // 
    // SOLUZIONE: Rimuoviamo completamente la gestione playtest dal listener dell'editor.
    // Il runtime nella finestra separata gestirà TUTTI i click durante il playtest.
    // L'editor gestisce solo click per editing (walkable, hotspot drawing, GUI selection).
    //
    // NOTA: executeScriptHandler() è vuoto (non esegue nulla), quindi non causava
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
    if (isDrawingWalkable) return; // già gestito sopra
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
      idInput.title = 'Hotspot ID — select and copy';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-outline-secondary btn-sm btn-copy-hotspot-id py-0 px-1';
      copyBtn.title = 'Copy ID';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
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
      btnSelect.title = 'Select';
      btnSelect.textContent = isSelected ? 'Selected' : 'Select';
      btnSelect.addEventListener('click', () => {
        activeHotspotId = hs.id;
        selectedSceneObjectId = null; // Lock scene objects when hotspot is selected
        isDrawingHotspot = false; // stop drawing when switching
        selectedHotspotVertexIndex = -1;
        refreshHotspotsListUI();
        refreshSceneObjectsListUI();
        redraw();
      });

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-outline-light me-1';
      btnEdit.title = isSelected ? 'Rename' : 'Select before editing';
      btnEdit.textContent = '✏️';
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
      btnClear.textContent = '🧹';
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
      btnDelete.textContent = '🗑️';
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

  // Reset editor zoom and pan — 100% con (0,0) in alto a sinistra
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

    if (foregrounds.length > 0 && (!selectedForegroundId || !foregrounds.some(f => f.id === selectedForegroundId))) {
      selectedForegroundId = foregrounds[0].id || uid('fg');
      foregrounds[0].id = selectedForegroundId;
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
      selectBtn.title = isSelected ? "Active layer" : "Make this layer editable";
      selectBtn.addEventListener("click", () => {
        selectedForegroundId = layerId;
        refreshForegroundListUI();
        redraw();
      });

      // delete
      const del = document.createElement("button");
      del.className = "btn btn-sm btn-danger ms-2";
      del.textContent = "✕";
      del.title = "Delete layer";
      del.addEventListener("click", async () => {
        if (!isSelected) {
          showNotification('Select the layer before modifying it', 'warning');
          return;
        }
        
        // Salva il layer prima di eliminarlo per poter eliminare l'asset
        const layerToDelete = foregrounds[idx];
        
        // Elimina l'asset da Supabase se presente
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
      up.textContent = "↑";
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
      down.textContent = "↓";
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
    rooms.set(rid, { id: rid, name, background: null, foregrounds: [], sceneObjects: [], walkableArea: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
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
  };

  window.renameRoom = function() {
    const r = rooms.get(currentRoomId); if (!r) return;
    const name = prompt('New room name:', r.name || 'Room');
    if (!name) return;
    r.name = name;
    refreshRoomsSelector();
  };

  window.deleteRoom = async function() {
    if (rooms.size <= 1) { showNotification('At least one room is required', 'warning'); return; }
    if (!confirm('Delete current room?')) return;
    
    const prevRoomId = currentRoomId;
    const roomToDelete = rooms.get(currentRoomId);
    
    // Elimina tutti gli asset della stanza da Supabase
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
  };

window.selectRoom = function(roomId) {
    if (!rooms.has(roomId)) return;
    const prevRoomId = currentRoomId;
    currentRoomId = roomId;
    bindRoomRefs();
    refreshForegroundListUI();
    refreshSceneObjectsListUI();
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
    const roomScript = roomScripts.get(roomId);
    if (roomScript) {
      const content = jsScripts.get(roomScript);
      executeScriptHandler(content, 'on_room_change', [prevRoomId, roomId]);
    }
  };

  // Util helper to create unique id
  function uid(prefix = "id") {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function getActiveProjectId() {
    const projectName = localStorage.getItem('amiantoActiveProjectName');
    if (!projectName) return null;
    return projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
  }

  async function pickResourceImage(options = {}) {
    if (!window.amiantoResources || !window.amiantoResources.pick) {
      showNotification('Resources unavailable. Reload the page.', 'warning');
      return options.multiple ? [] : null;
    }
    return window.amiantoResources.pick(options);
  }

  async function loadImageFromResourceEntry(resource) {
    if (!resource) return null;
    const img = await window.amiantoResources.loadImageFromResource(resource);
    window.amiantoResources.registerImageAsset(img, resource);
    return img;
  }

  async function deleteFirestoreAssetDoc(projectId, assetId) {
    if (!window.firebaseDB || !window.firebaseAuth?.currentUser || !assetId) return false;
    try {
      await window.firebaseDB
        .collection('users')
        .doc(window.firebaseAuth.currentUser.uid)
        .collection('projects')
        .doc(projectId)
        .collection('assets')
        .doc(assetId)
        .delete();
      return true;
    } catch (err) {
      console.warn('[Asset] Errore eliminazione metadata Firestore:', err);
      return false;
    }
  }

  // ==== Handlers for Add Background / Add Foreground buttons ====
  const btnAddBg = document.getElementById("btn-add-bg");
  const btnAddFg = document.getElementById("btn-add-fg");

  if (btnAddBg) {
    btnAddBg.addEventListener("click", async () => {
        if (!currentUser || !currentUser.uid) {
          showNotification('Please log in to select images', 'warning');
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
            throw new Error(`Image loaded but has invalid dimensions: ${finalWidth}×${finalHeight}`);
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
          
          showNotification(`Background set: ${finalWidth}×${finalHeight}`, 'success');
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
          showNotification('Please log in to select images', 'warning');
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

  if (btnAddGuiBg) {
    btnAddGuiBg.addEventListener('click', async () => {
        if (!currentUser) {
          showNotification('Please log in to select images', 'warning');
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

    switch(type) {
      case 'DialogBox': {
        frag.appendChild(makeInput('Position X', 'gui-set-x', 'number', settings.x ?? 0));
        frag.appendChild(makeInput('Position Y', 'gui-set-y', 'number', settings.y ?? 0));
        frag.appendChild(makeInput('Width', 'gui-set-w', 'number', settings.w ?? 300));
        frag.appendChild(makeInput('Height', 'gui-set-h', 'number', settings.h ?? 150));
        frag.appendChild(makeInput('Background (CSS color or data URL)', 'gui-set-bg', 'text', settings.background || 'rgba(0,0,0,0.6)'));
        frag.appendChild(makeInput('Font CSS', 'gui-set-font', 'text', settings.font || '16px Arial'));
        frag.appendChild(makeInput('Portrait (optional data URL)', 'gui-set-portrait', 'text', settings.portrait || ''));
        frag.appendChild(makeSelect('Appear behavior', 'gui-set-appear', [
          {value:'instant', label:'Instant'},
          {value:'fade', label:'Fade'},
          {value:'slide', label:'Slide'}
        ], settings.appear || 'instant'));
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
      case 'DialogBox':
        return {
          x: get('gui-set-x') || 0,
          y: get('gui-set-y') || 0,
          w: get('gui-set-w') || 300,
          h: get('gui-set-h') || 150,
          background: get('gui-set-bg') || 'rgba(0,0,0,0.6)',
          font: get('gui-set-font') || '16px Arial',
          portrait: get('gui-set-portrait') || '',
          appear: get('gui-set-appear') || 'instant'
        };
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
          <br><small>${btn.x}, ${btn.y} — ${btn.w}×${btn.h}</small>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-light me-1" title="Rename">✏️</button>
          <button class="btn btn-sm btn-outline-info me-1" title="Set Background Image">🖼️</button>
          <button class="btn btn-sm btn-outline-warning me-1" title="Set Text">📝</button>
          <button class="btn btn-sm btn-outline-danger" title="Delete">🗑️</button>
        </div>
      `;
      const [btnEdit, btnImage, btnText, btnDel] = item.querySelectorAll('button');
      btnEdit.addEventListener('click', () => {
        const newName = prompt('GUI button name:', btn.name);
        if (newName && newName.trim() !== '') { btn.name = newName.trim(); saveCurrentGUI(); refreshGuiButtonsList(); }
      });
      btnImage.addEventListener('click', async () => {
          if (!currentUser) {
            showNotification('Please log in to select images', 'warning');
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

  // Handle window resize — ridisegna per aggiornare letterbox; pan 0 mantiene il viewport centrato
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
      const scriptLabel = getInventoryItemScriptKey(item) || '(no script)';
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
    // Don't auto-select scene objects if a hotspot is active
    if (activeHotspotId) {
      selectedSceneObjectId = null;
      return;
    }
    if (sceneObjects.length > 0 && (!selectedSceneObjectId || !sceneObjects.some(o => o.id === selectedSceneObjectId))) {
      selectedSceneObjectId = sceneObjects[0].id;
    }
    if (sceneObjects.length === 0) {
      selectedSceneObjectId = null;
    }
  }

  function selectSceneObject(objectId) {
    selectedSceneObjectId = objectId;
    activeHotspotId = null; // Lock hotspots when scene object is selected
    refreshSceneObjectsListUI();
    refreshHotspotsListUI();
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
    selectBtn.title = isSelected ? 'Active object' : 'Select to edit';
    selectBtn.textContent = isSelected ? 'Selected' : 'Select';
    selectBtn.addEventListener('click', () => selectSceneObject(sceneObject.id));

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outline-light me-1';
    editBtn.title = isSelected ? 'Edit' : 'Select before editing';
    editBtn.textContent = '✏️';
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
    deleteBtn.textContent = '🗑️';
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
      showNotification('Please log in to select images', 'warning');
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

      refreshSceneObjectsListUI();
      redraw();
      showNotification(`Scene object "${objectName}" added`, 'success');
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
      
      // Rimuove solo dall'editor; i file su Supabase restano (eliminabili da Resources)
      // Remove from scene objects array (room-scoped)
      sceneObjects = sceneObjects.filter(obj => obj.id !== objectId);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      selectedSceneObjectId = sceneObjects[0] ? sceneObjects[0].id : null;
      
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
        showNotification('Please log in', 'warning');
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
      const totalFrames = getCharacterFrameCount(charData);
      const isSelected = characterName === selectedName;
      const el = document.createElement('div');
      el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      if (isSelected) el.classList.add('border', 'border-info');
      el.dataset.characterName = characterName;
      const info = document.createElement('div');
      const scriptLabel = hasEditorScriptLink('Character', characterName)
        ? getEditorScriptKey('Character', characterName)
        : '(no script)';
      info.innerHTML = '<strong>' + characterName + '</strong><br><small class="text-muted">' + totalFrames + ' frame' + (totalFrames !== 1 ? 's' : '') + '</small><br><small class="character-script-name text-info">Script: ' + scriptLabel + '</small>';
      const controls = document.createElement('div');
      const selectBtn = document.createElement('button');
      selectBtn.className = isSelected ? 'btn btn-sm btn-success me-1' : 'btn btn-sm btn-outline-success me-1';
      selectBtn.textContent = isSelected ? 'Selected' : 'Select';
      selectBtn.addEventListener('click', () => selectCharacterFromList(characterName));
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-outline-light me-1';
      editBtn.textContent = 'Rename';
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
        scriptNameDisplay.textContent = `Script name: "${characterName}"`;
        scriptNameDisplay.style.display = 'block';
      }
    });
  }

  window.addCharacter = function() {
    const name = (prompt('Character name:') || '').trim();
    if (!name) return;
    if (characterFrames.has(name)) {
      showNotification('Character name already in use', 'warning');
      return;
    }
    characterFrames.set(name, { directions: {}, animations: {}, currentFrame: 0 });
    selectCharacterFromList(name);
    showNotification(`Character "${name}" added!`, 'success');
  };

  window.removeCharacter = async function(button) {
    if (confirm('Are you sure you want to delete this character?')) {
      const characterElement = button.closest('.list-group-item');
      const characterName = characterElement.querySelector('strong').textContent.trim();
      
      // Ferma la preview se è attiva per questo character
      const sel = document.getElementById('character-selector');
      const currentCharacter = sel ? sel.value : '';
      if (currentCharacter === characterName) {
        stopCharacterPreview();
      }
      
      const charData = characterFrames.get(characterName);

      // Pulisce i riferimenti in memoria (i file su Supabase restano; eliminabili da Resources)
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
      console.log(`[Character] ✅ Character "${characterName}" rimosso dall'editor`);
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
        characterFrames.delete(oldName);
        characterFrames.set(trimmedNewName, data);
      }
      if (characterScripts.has(oldName)) {
        const script = characterScripts.get(oldName);
        characterScripts.delete(oldName);
        characterScripts.set(trimmedNewName, script);
      }
      const characterSelector = document.getElementById('character-selector');
      if (characterSelector && characterSelector.value === oldName) {
        characterSelector.value = trimmedNewName;
        loadCharacterDirections();
      }
      refreshCharactersListUI();
      showNotification(`Character renamed to "${trimmedNewName}"`, 'success');
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
    north: 'North (↑)',
    northeast: 'Northeast (↗)',
    east: 'East (→)',
    southeast: 'Southeast (↘)',
    south: 'South (↓)',
    southwest: 'Southwest (↙)',
    west: 'West (←)',
    northwest: 'Northwest (↖)'
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

  window.addCharacterAnimation = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      showNotification('Select a character first', 'warning');
      return;
    }
    const name = prompt('Animation name (e.g. idle, talk, pick_up):');
    if (!name || !name.trim()) return;
    const animName = name.trim();
    if (animName.toLowerCase() === 'walking') {
      showNotification('"walking" is reserved for the standard walk cycle', 'warning');
      return;
    }
    let charData = characterFrames.get(who);
    if (!charData) {
      charData = { directions: {}, animations: {}, currentFrame: 0 };
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
  // Questo permette di eliminarli da Supabase se si chiude il browser o si fa logout senza salvare
  const unsavedCharacterFrames = new Set(); // Set di Image objects che sono stati caricati su Supabase ma non salvati
  const unsavedCharacterAssetIds = new Set(); // Set di assetId di frame character caricati su Supabase ma non salvati nel progetto

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
      // Reset toggle a "upload" quando non c'è character selezionato
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
    const spawnData = charData && charData.spawnSettings ? charData.spawnSettings : {};
    
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
    
    // Aggiorna visibilità dei campi (dopo aver caricato entrambe le checkbox)
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
  }

  // Salva le impostazioni di spawn per il character corrente
  function saveCharacterSpawnSettings() {
    const sel = document.getElementById('character-selector');
    const characterName = sel ? sel.value : '';
    if (!characterName) return;
    
    const charData = characterFrames.get(characterName);
    if (!charData) return;
    
    // Inizializza spawnSettings se non esiste
    if (!charData.spawnSettings) {
      charData.spawnSettings = {};
    }
    
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
    
    // Salva roomId se autoSpawn è true O se isPlayer è true (il player può avere una room iniziale)
    if (roomSelect && ((autoSpawnCheck && autoSpawnCheck.checked) || (isPlayerCheck && isPlayerCheck.checked))) {
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
    
    // Salva nel characterFrames
    characterFrames.set(characterName, charData);
  }

  // Aggiorna la visibilità dei campi spawn in base alle checkbox
  function updateSpawnSettingsVisibility() {
    const autoSpawnCheck = document.getElementById('character-spawn-auto');
    const isPlayerCheck = document.getElementById('character-spawn-is-player');
    const roomContainer = document.getElementById('character-spawn-room-container');
    const positionContainer = document.getElementById('character-spawn-position-container');
    const directionContainer = document.getElementById('character-spawn-direction-container');
    const speedContainer = document.getElementById('character-spawn-speed-container');
    
    const showFields = (autoSpawnCheck && autoSpawnCheck.checked) || (isPlayerCheck && isPlayerCheck.checked);
    
    if (roomContainer) {
      roomContainer.style.display = showFields ? 'block' : 'none';
    }
    if (positionContainer) {
      positionContainer.style.display = showFields ? 'block' : 'none';
    }
    if (directionContainer) {
      directionContainer.style.display = showFields ? 'block' : 'none';
    }
    if (speedContainer) {
      speedContainer.style.display = showFields ? 'block' : 'none';
    }
  }

  // Add event listener for character selection change
  document.addEventListener('DOMContentLoaded', function() {
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
      characterSelector.addEventListener('change', function() {
        loadCharacterDirections();
      });
    }
    
    // Setup spawn settings event listeners
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
        // Salva anche durante la digitazione per feedback immediato
        const value = Number(speedInput.value);
        if (!isNaN(value) && value > 0 && value <= 1000) {
          saveCharacterSpawnSettings();
        }
      });
    }
    
    // Gestione right-click per aggiornare posizione character spawn
    if (canvas) {
      canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        
        // Calcola sempre le coordinate (indipendentemente dalla tab)
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const roundedX = Math.round(worldPos.x);
        const roundedY = Math.round(worldPos.y);
        
        // Nota: la copia delle coordinate negli appunti in modalità rooms è gestita
        // dal gestore contextmenu principale (riga 1773)
        
        const sel = document.getElementById('character-selector');
        if (sel && sel.value) {
          // Se siamo nella tab characters e c'è un character selezionato
          const currentTab = document.querySelector('.nav-link.active');
          if (currentTab && currentTab.getAttribute('data-tab') === 'characters') {
            const positionInput = document.getElementById('character-spawn-position');
            if (positionInput) {
              positionInput.value = formatPositionString(roundedX, roundedY);
              const parsed = parsePositionString(positionInput.value);
              if (parsed.valid) {
                positionInput.style.backgroundColor = '#2d5016';
                setTimeout(() => {
                  positionInput.style.backgroundColor = '';
                }, 500);
                saveCharacterSpawnSettings();
              }
            }
          }
        }
      });
    }
  });

  window.uploadCharacterFrames = async function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }

    const animLabel = getSelectedCharacterAnimationKey() === 'walking' ? 'walking' : getSelectedCharacterAnimationKey();
    const resources = await pickResourceImage({
      title: `Animation frames — ${who} [${animLabel}]`,
      multiple: true,
      hint: 'Click multiple images to select them. Confirm with «Add selection». Frame order follows numbers in the file name.'
    });
    if (!resources || !resources.length) return;

    const dirSel = document.getElementById('direction-selector');
    const direction = dirSel ? dirSel.value : 'south';

    if (!currentUser) {
      showNotification('Please log in', 'warning');
      return;
    }

    const projectId = getActiveProjectId();
    if (!projectId) {
      showNotification('No project is open', 'warning');
      return;
    }

    let charData = characterFrames.get(who);
    if (!charData) {
      charData = { directions: {}, animations: {}, currentFrame: 0 };
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
      
      // Se c'è un solo numero, usalo
      if (numberMatches.length === 1) {
        return numberMatches[0].value;
      }
      
      // Se ci sono più numeri, preferisci quello con padding (001, 002, 01, etc.)
      // perché di solito è il frame number
      const paddedNumbers = numberMatches.filter(n => n.original.length >= 2 && n.original.startsWith('0'));
      
      if (paddedNumbers.length > 0) {
        // Se ci sono numeri con padding, usa quello con più cifre (001 > 01)
        // o se hanno la stessa lunghezza, usa l'ultimo
        paddedNumbers.sort((a, b) => {
          if (b.length !== a.length) return b.length - a.length; // Preferisci più cifre
          return b.position - a.position; // Se stessa lunghezza, usa l'ultimo
        });
        return paddedNumbers[0].value;
      }
      
      // Se non ci sono numeri con padding, usa l'ultimo numero trovato
      // (spesso è il frame number quando ci sono altri numeri nel nome)
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
    
    console.log(`[Frame] 📁 Resources (${resources.length}):`, resources.map(f => f.displayName || f.name));
    console.log(`[Frame] ✅ Ordinati (${sortedFiles.length}):`, sortedFiles.map(f => {
      const num = extractNumberFromFileName(f.displayName || f.fileName || f.name);
      return `${f.displayName || f.name} → num: ${num !== Infinity ? num : 'N/A'}`;
    }));
    
    // Verifica che l'ordinamento sia corretto
    const orderCheck = sortedFiles.map((f, idx) => {
      const label = f.displayName || f.name;
      const num = extractNumberFromFileName(label);
      const prevNum = idx > 0 ? extractNumberFromFileName(sortedFiles[idx - 1].displayName || sortedFiles[idx - 1].name) : -1;
      const isOrdered = num === Infinity || prevNum === Infinity || num >= prevNum;
      return { file: label, num, isOrdered };
    });
    console.log(`[Frame] 🔍 Verifica ordine:`, orderCheck);
    
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
          console.error(`[Frame] ❌ Errore frame ${resource.displayName || resource.name}:`, error);
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
          console.log(`[Frame] ✅ Frame ${index} caricato: ${assetId}`);
        } else {
          errorCount++;
          console.error(`[Frame] ❌ Frame ${index} fallito: ${error || 'Unknown error'}`);
        }
      });
      
      // Aggiorna la mappa characterFrames
      characterFrames.set(who, charData);
      
      if (successCount > 0) {
        showNotification(`✅ ${successCount} frame(s) uploaded and saved to storage`, 'success');
        updateDirectionInfo();
        // Initialize pivot if it doesn't exist
        initializePivotForCharacter(charData, direction);
        redraw();
      }
      
      if (errorCount > 0) {
        showNotification(`⚠️ ${errorCount} frame(s) failed to upload`, 'warning');
      }
      
    } catch (error) {
      console.error('[Frame] ❌ Errore durante upload frame:', error);
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
      // Ferma la preview se è attiva
      stopCharacterPreview();

      const charData = characterFrames.get(who);
      const activeDirections = charData ? getCharacterDirectionsStore(charData) : null;

      // Pulisce tutti i frame per tutte le direzioni dell'animazione corrente
      if (activeDirections) {
        for (const dirData of Object.values(activeDirections)) {
          if (dirData.frames) dirData.frames = [];
        }
        if (charData) characterFrames.set(who, charData);
      } else {
        characterFrames.set(who, { directions: {}, animations: {}, currentFrame: 0 });
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
  // Gestisce sia frame normali che frame specchiati (con proprietà mirror)
  function getFrameImage(frame, directionsStore, frameIndex, direction) {
    if (!frame || !directionsStore) {
      return { img: null, mirrored: false };
    }

    // Se il frame è un riferimento specchiato
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
      // Formato nuovo: oggetto con proprietà img
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
      charData = { directions: {}, animations: {}, currentFrame: 0 };
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
    
    // Verifica se il toggle è su "mirror" - in quel caso non mostrare i thumbnails
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
      let frameName = `Frame ${index + 1}`; // Nome di default
      let isMirrored = false;
      
      // Usa getFrameImage per gestire sia frame normali che specchiati
      const frameResult = getFrameImage(frameData, activeDirections, index, currentDirection);
      
      if (frameResult.img) {
        // Frame valido trovato
        img.src = frameResult.img.src || frameResult.img;
        isMirrored = frameResult.mirrored;
        
        // Se è specchiato, aggiungi un indicatore nel nome
        if (isMirrored) {
          frameName = `Frame ${index + 1} (mirrored from ${frameData.mirror})`;
        }
      } else if (frameData && typeof frameData === 'object' && frameData.mirror) {
        // Frame specchiato ma non riuscito a risolvere l'immagine
        frameName = `Frame ${index + 1} (mirrored from ${frameData.mirror} - source not found)`;
        // Usa un'immagine placeholder o salta questo frame
        console.warn(`Frame ${index + 1} è specchiato ma la direzione sorgente non è stata trovata`);
        return; // Salta questo frame se non possiamo risolverlo
      } else {
        // Gestisce frame normali (compatibilità con codice precedente)
        if (frameData && typeof frameData === 'object' && frameData.img) {
          // Formato nuovo: oggetto con proprietà img
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
          return; // Salta questo frame se non è valido
        }
      }
      
      img.alt = frameName;
      
      // Se è specchiato, applica CSS transform per mostrarlo specchiato nella preview
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
      deleteBtn.innerHTML = '×';
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
      
      // Se è un frame specchiato, non eliminare asset (non ne ha uno)
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
        e.dataTransfer.setData('text/html', item.outerHTML);
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
              const draggedFrame = frames.splice(draggedIndex, 1)[0];
              frames.splice(targetIndex, 0, draggedFrame);
              
              // Refresh the preview
              refreshFramesPreview();
              showNotification(`Frame moved from position ${draggedIndex + 1} to ${targetIndex + 1}`, 'success');
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

  /** Migra chiavi hotspot legacy (Hotspot:hotspot:id → Hotspot:id). */
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

  // Game API completions for CodeMirror
  const GAME_API_COMPLETIONS = [
    'print', 'show_message', 'move_object',
    'on_game_start', 'on_room_change', 'on_object_click', 'on_character_click', 'on_hotspot_click',
    'on_use_with', 'on_inventory_use_with',
    'add_to_inventory', 'remove_from_inventory', 'has_item', 'get_item_count', 'clear_inventory',
    'get_carried_item', 'set_carried_item', 'clear_carried_item',
    'load_room', 'get_current_room', 'get_room_objects', 'set_room_background',
    'spawn_object', 'despawn_object', 'rotate_object', 'scale_object', 'set_object_visible',
    'enableObject', 'disableObject', 'enableHotspot', 'disableHotspot',
    'spawn_character', 'move_character', 'walk_character', 'set_character_direction', 'animate_character',
    'play_character_animation'
  ];

  function cmGameApiHint(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const start = token.start;
    const end = cursor.ch;
    const currentWord = token.string || '';
    const list = GAME_API_COMPLETIONS.filter(name => name.toLowerCase().startsWith(currentWord.toLowerCase()));
    return {
      list: list.length ? list : GAME_API_COMPLETIONS,
      from: CodeMirror.Pos(cursor.line, start),
      to: CodeMirror.Pos(cursor.line, end)
    };
  }

  // Attach auto-hint on typing for CodeMirror editors
  let autoHintAttachedToSmall = false;
  let autoHintAttachedToLarge = false;
  function attachAutoHint(cm, which = 'small') {
    if (!cm || typeof cm.on !== 'function') return;
    if (which === 'large') {
      if (autoHintAttachedToLarge) return;
      autoHintAttachedToLarge = true;
    } else {
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

  // Events per scope: id = handler name in runtime, label = human-readable
  const SCRIPT_EVENTS = {
    Global: [
      { id: 'on_game_start', label: 'onGameStart' },
      { id: 'on_room_change', label: 'onRoomChange' },
      { id: 'on_inventory_use_with', label: 'onInventoryUseWith' }
    ],
    Room: [
      // Anche disponibile a livello globale; mantenuto qui per comodità UI
      { id: 'on_room_change', label: 'onRoomChange' }
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
      'on_room_change',
      'on_object_click',
      'on_character_click',
      'on_hotspot_click',
      'on_gui_click',
      'on_use_with',
      'on_inventory_use_with'
    ].forEach(h => {
      const re = new RegExp(`function\\s+${h}\\s*\\(`);
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
      
      // Imposta currentScriptName PRIMA di qualsiasi controllo, così deleteScript funziona anche se l'hotspot non viene trovato
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
          label: `📋 Room: ${room.name || roomId}`,
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
              label: `📦 Object: ${obj.name || obj.id}`,
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
              label: `🖱️ Hotspot: ${hotspot.name || hotspot.id}`,
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
      h.textContent = `🏠 ${roomData.roomName}`;
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
          label: `🎒 Item: ${item.name}`,
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
          label: `🧍 Character: ${charName}`,
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

  // Helper function per salvare il contenuto dello script corrente
  function saveCurrentScriptIfNeeded() {
    if (!currentScriptName) return;
    
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
      jsScripts.set(currentKey, currentContent);
      try { localStorage.setItem(`script-${currentKey}`, currentContent); } catch(_) {}
      
      if (currentKey.startsWith('Hotspot:')) {
        const hotspotId = currentKey.slice('Hotspot:'.length);
        rooms.forEach((room, roomId) => {
          if (room.hotspots && Array.isArray(room.hotspots)) {
            const hotspot = room.hotspots.find(h => h.id === hotspotId);
            if (hotspot) {
              if (!hotspot.scripts) hotspot.scripts = {};
              hotspot.scripts.onClick = {
                code: String(currentContent),
                enabled: true
              };
            }
          }
        });
      }
      
      // Se è uno script oggetto, mantieni l'attachment in objectScripts
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
      // Per oggetti/inventario/personaggi, permetti sempre di creare uno script vuoto (l'attachment verrà creato al salvataggio)
      if (!hasAttachment && scope !== 'Object' && scope !== 'Inventory' && scope !== 'Character') {
        showNotification('Script not found', 'warning');
        return;
      }
      // Crea lo script vuoto se ha un attachment o se è un oggetto/inventario/personaggio
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
          // Forza il focus se l'editor è visibile
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

    const key = migrateLegacyScriptKey(normalizeScriptKey(scope, target));
    let content = getScriptContent(key);

    // Ensure header
    if (!content) {
      const header = [
        `// Scope: ${scope}`,
        `// Target: ${target}`,
        ''
      ].join('\n');
      content = header;
    }

    // Insert handler skeleton if missing
    const handlerRegex = new RegExp(`function\\s+${handlerId}\\s*\\(`);
    if (!handlerRegex.test(content)) {
      let skeleton = '\n';
      skeleton += `// Event: ${eventDef.label}\n`;
      if (handlerId === 'on_game_start') {
        skeleton += `function on_game_start(){\n  print('Game started');\n}\n`;
      } else if (handlerId === 'on_room_change') {
        skeleton += `function on_room_change(oldRoomId, newRoomId){\n  // your code here\n}\n`;
      } else if (handlerId === 'on_object_click') {
        skeleton += `function on_object_click(object_id, x, y){\n  // your code here\n}\n`;
      } else if (handlerId === 'on_character_click') {
        skeleton += `function on_character_click(characterId){\n  // your code here\n}\n`;
      } else if (handlerId === 'on_hotspot_click') {
        skeleton += `function on_hotspot_click(hotspotId){\n  // your code here\n}\n`;
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
    }

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
      // Salva direttamente nell'hotspot
      let hotspotFound = false;
      rooms.forEach((room, roomId) => {
        if (room.hotspots && Array.isArray(room.hotspots)) {
          const hotspot = room.hotspots.find(h => h.id === hotspotId);
          if (hotspot) {
            if (!hotspot.scripts) hotspot.scripts = {};
            hotspot.scripts.onClick = {
              code: String(content),
              enabled: true
            };
            // Aggiungi metadata per tracciare lo script
            if (!hotspot._meta) hotspot._meta = {};
            hotspot._meta.linkedScriptName = key;
            hotspotFound = true;
          }
        }
      });
      // Aggiorna anche l'hotspot globale se esiste
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        const globalHotspot = hotspots.find(h => h.id === hotspotId);
        if (globalHotspot) {
          if (!globalHotspot.scripts) globalHotspot.scripts = {};
          globalHotspot.scripts.onClick = {
            code: String(content),
            enabled: true
          };
          if (!globalHotspot._meta) globalHotspot._meta = {};
          globalHotspot._meta.linkedScriptName = key;
        }
      }
      if (!hotspotFound) {
        console.warn(`[createScriptFromDropdown] Hotspot ${hotspotId} non trovato`);
      }
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
    
    showNotification(`Script created: ${scope} → ${target} (${eventDef.label})`, 'success');
  }

  // ============================================
  // GAME STATE SYSTEM - Variabili di gioco globali
  // ============================================
  window.Game = window.Game || {};
  
  // Stato interno (non accessibile direttamente)
  const _gameState = {};
  
  // Definizioni delle variabili (per editor UI e validazione)
  window.gameVariableDefinitions = window.gameVariableDefinitions || [];
  
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
      // Se la variabile è definita ma non ancora impostata, restituisci il valore iniziale
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
      // Se non è boolean, inizializza a true
      Game.setVar(key, true);
      return true;
    }
  };
  
  // Funzione per ottenere tutto lo stato (per serializzazione)
  window.Game.getState = function() {
    return JSON.parse(JSON.stringify(_gameState));
  };

  // API opzionale per mostrare testo nel gioco (usata da print(..., { showInGame: true }))
  // L'implementazione concreta nel runtime può sovrascrivere questo metodo.
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
    
    // Se la variabile non esiste e l'operatore non è "exists", fallisce
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
  // Deve essere standalone perché viene usata in contesti diversi (sandbox)
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
    
    // Script handler non più supportato in modalità iframe
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
    
    // ⚠️ GESTIONE SPECIALE PER HOTSPOT: Salva direttamente nell'hotspot se è uno script hotspot
    if (key.startsWith('Hotspot:')) {
      const hotspotId = key.replace('Hotspot:', '');
      // Trova l'hotspot in tutte le stanze
      let hotspotFound = false;
      rooms.forEach((room, roomId) => {
        if (room.hotspots && Array.isArray(room.hotspots)) {
          const hotspot = room.hotspots.find(h => h.id === hotspotId);
          if (hotspot) {
            if (!hotspot.scripts) hotspot.scripts = {};
            hotspot.scripts.onClick = {
              code: String(content),
              enabled: true
            };
            hotspotFound = true;
            
            // Aggiorna anche l'hotspot globale se esiste
            const globalHotspot = typeof hotspots !== 'undefined' ? hotspots.find(h => h.id === hotspotId) : null;
            if (globalHotspot) {
              if (!globalHotspot.scripts) globalHotspot.scripts = {};
              globalHotspot.scripts.onClick = {
                code: String(content),
                enabled: true
              };
            }
          }
        }
      });
      if (!hotspotFound) {
        console.warn(`[saveScript] Hotspot ${hotspotId} non trovato in nessuna stanza`);
      }
    }
    
    // ⚠️ GESTIONE SPECIALE PER OGGETTI: Crea/aggiorna l'attachment in objectScripts se è uno script oggetto
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
    
    // Sincronizza solo hotspot collegati esplicitamente a questo script (mai per confronto sul codice)
    if (content.trim() !== '') {
      const hotspotIdFromKey = key.startsWith('Hotspot:') ? key.slice('Hotspot:'.length) : null;
      const syncedHotspotIds = new Set();

      const syncHotspotIfLinked = (hotspot, source) => {
        if (!hotspot || syncedHotspotIds.has(hotspot.id)) return false;
        const linkedRaw = hotspot._meta && hotspot._meta.linkedScriptName;
        const linked = linkedRaw ? migrateLegacyScriptKey(String(linkedRaw)) : '';
        const isDirect = hotspotIdFromKey && hotspot.id === hotspotIdFromKey;
        const isLinked = linked === key;
        if (!isDirect && !isLinked) return false;

        if (!hotspot.scripts) hotspot.scripts = {};
        hotspot.scripts.onClick = { code: String(content), enabled: true };
        if (!hotspot._meta) hotspot._meta = {};
        hotspot._meta.linkedScriptName = key;
        syncedHotspotIds.add(hotspot.id);
        console.log(`[saveScript] [SYNC] Hotspot ${hotspot.id} ← "${key}" [${source}]`);
        return true;
      };

      rooms.forEach((room, roomId) => {
        if (!room.hotspots) return;
        room.hotspots.forEach(hotspot => {
          if (syncHotspotIfLinked(hotspot, `room:${roomId}`)) {
            const globalHotspot = typeof hotspots !== 'undefined' ? hotspots.find(h => h.id === hotspot.id) : null;
            if (globalHotspot) syncHotspotIfLinked(globalHotspot, 'global');
          }
        });
      });
      if (typeof hotspots !== 'undefined' && Array.isArray(hotspots)) {
        hotspots.forEach(hotspot => syncHotspotIfLinked(hotspot, 'global-only'));
      }
    }
    
    showNotification(`Script "${key}" saved!`, 'success');

    // refresh attach targets
    refreshScriptSelector();
    refreshSceneObjectScriptTargets();
    
    // Aggiorna sempre l'albero degli script per riflettere le modifiche
    rebuildScriptsTree();
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
    // Il runtime caricherà automaticamente il progetto da localStorage
    const jsonString = window.serializeProjectToJsonString(true);
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
    
    // Apri runtime in nuova finestra
    const runtimeUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'runtime.html';
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
    // Non serve più fermare script singoli, ma possiamo pulire lo stato se necessario
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
            <button class="btn btn-outline-light" onclick="editGameVariable(${index})" title="Edit">✏️</button>
            <button class="btn btn-outline-danger" onclick="deleteGameVariable(${index})" title="Delete">🗑️</button>
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
  
  // Refresh variables list quando si carica la sezione Scripts
  document.addEventListener('tabChanged', function(e) {
    if (e.detail.currentTab === 'scripts') {
      refreshVariablesList();
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
    
    // ⚠️ NUOVA STRUTTURA: Salva script direttamente nell'hotspot
    const hotspot = hotspots.find(h => h.id === hotspotId);
    if (!hotspot) {
      showNotification('Hotspot not found', 'error');
      return;
    }
    
    const scriptContent = getScriptContent(migrateLegacyScriptKey(scriptName));
    
    // DEBUG: Verifica che il contenuto dello script sia disponibile
    if (!scriptContent || scriptContent.trim() === '') {
      console.warn(`[attachScriptToHotspot] Script "${scriptName}" è vuoto o non trovato!`);
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
    
    // Salva script direttamente nell'hotspot
    hotspot.scripts.onClick = {
      code: String(scriptContent),
      enabled: true
    };
    
    // Aggiorna anche nella room
    const r = rooms.get(currentRoomId);
    if (r && r.hotspots) {
      const roomHotspot = r.hotspots.find(h => h.id === hotspotId);
      if (roomHotspot) {
        if (!roomHotspot.scripts) roomHotspot.scripts = {};
        roomHotspot.scripts.onClick = {
          code: String(scriptContent),
          enabled: true
        };
      }
    }
    
    // ⚠️ SINCRONIZZAZIONE: Salva anche il nome dello script in un campo meta per tracciamento futuro
    // Questo ci permette di sapere quale script è collegato all'hotspot per sincronizzazioni future
    // (nota: questo campo non viene serializzato, è solo per uso interno)
    if (!hotspot._meta) hotspot._meta = {};
    hotspot._meta.linkedScriptName = scriptName;
    if (r && r.hotspots) {
      const roomHotspot = r.hotspots.find(h => h.id === hotspotId);
      if (roomHotspot) {
        if (!roomHotspot._meta) roomHotspot._meta = {};
        roomHotspot._meta.linkedScriptName = scriptName;
      }
    }
    
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

    const showCanvas = mode === 'canvas';
    const showScripts = mode === 'scripts';
    const showResources = mode === 'resources';
    const showDocs = mode === 'docs';

    if (canvasInfo) canvasInfo.style.display = showCanvas ? '' : 'none';
    if (canvasControls) canvasControls.style.display = showCanvas ? '' : 'none';
    if (canvasContainer) canvasContainer.style.display = showCanvas ? 'block' : 'none';
    if (codeEditorContainer) codeEditorContainer.style.display = showScripts ? 'flex' : 'none';
    if (resourcesMainPanel) resourcesMainPanel.style.display = showResources ? 'flex' : 'none';
    if (docsMainPanel) docsMainPanel.style.display = showDocs ? 'flex' : 'none';
  }

  document.addEventListener('tabChanged', function(e){
    if (e.detail.currentTab === 'scripts') {
      setMainWorkspaceMode('scripts');
      // Applica lo stato salvato delle console log invece di forzare la visibilità
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
      // Aggiorna le dimensioni di CodeMirror dopo che il container è visibile
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
      // Applica lo stato salvato delle console log invece di forzare la visibilità
      if (window.applyConsoleLogVisibilityState) {
        window.applyConsoleLogVisibilityState();
      }
    }
  });

  // Variabile globale per tracciare lo stato di sincronizzazione
  let isSyncingProjects = false;

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
      // Se il loop non è attivo, riavvialo
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
        redraw();
        break;
      case 'gui':
        disableRoomCanvasEditing();
        refreshGuiButtonsList();
        redraw();
        break;
      case 'characters':
        disableRoomCanvasEditing();
        // ensure character selector refreshed and redraw preview
        refreshCharacterSelector();
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
      variables: new Map()
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

  // ============================================
  // GESTIONE IFRAME SANDBOXED
  // ============================================
  
  // Crea l'iframe sandboxed per l'esecuzione degli script
  function createSandboxIframe() {
    // Rimuovi iframe esistente se presente
    if (embeddedRuntime.sandboxIframe) {
      try {
        // Rimuovi listener precedente se presente
        if (embeddedRuntime.sandboxIframe._messageHandler) {
          window.removeEventListener('message', embeddedRuntime.sandboxIframe._messageHandler);
        }
        embeddedRuntime.sandboxIframe.remove();
      } catch (e) {
        // Ignora errori di rimozione
      }
      embeddedRuntime.sandboxIframe = null;
    }

    // Listener per messaggi dall'iframe (deve essere configurato PRIMA di aggiungere l'iframe)
    const messageHandler = function(event) {
      // NOTA: In produzione, verificare event.origin per sicurezza
      const message = event.data;
      if (!message || typeof message !== 'object') {
        return;
      }

      switch (message.type) {
        case 'RUNTIME_READY':
          if (!embeddedRuntime.isReady) {
            embeddedRuntime.isReady = true;
            sendRuntimeLogToEditor('✓ Sandbox runtime ready and initialized', 'info');
            sendRuntimeLogToEditor(`Runtime initialized with ${embeddedRuntime.pendingScripts.length} pending script(s)`, 'info');
            
            // Aggiorna contesto prima di eseguire script
            updateSandboxContext();
            
            // Esegui script in attesa
            embeddedRuntime.pendingScripts.forEach(script => {
              executeScriptInSandbox(script.name, script.code, script.handler, script.args, script.context);
            });
            embeddedRuntime.pendingScripts = [];
          } else {
            sendRuntimeLogToEditor('Warning: RUNTIME_READY received but runtime already marked as ready', 'warning');
          }
          break;

        case 'SCRIPT_LOG':
          if (window.ScriptLogService) {
            const level = message.level || 'info';
            let mappedType = 'print';
            if (level === 'error') mappedType = 'error';
            else if (level === 'warning') mappedType = 'warning';
            
            // Usa timestamp dal messaggio o genera uno nuovo se mancante
            const timestamp = message.timestamp || Date.now();
            
            ScriptLogService.log({
              type: mappedType,
              message: message.message || '',
              source: 'runtime',
              timestamp: timestamp
            });
          } else {
            // Fallback se ScriptLogService non è disponibile
            console.log('[Runtime Log]', message.message || '');
          }
          break;

        case 'SCRIPT_ERROR':
          const errorMsg = message.error || 'Unknown error';
          const errorTimestamp = message.timestamp || Date.now();
          
          sendRuntimeLogToEditor(`Script error: ${errorMsg}`, 'error');
          if (window.ScriptLogService) {
            ScriptLogService.log({
              type: 'error',
              message: errorMsg,
              source: 'runtime',
              timestamp: errorTimestamp
            });
          } else {
            // Fallback se ScriptLogService non è disponibile
            console.error('[Runtime Error]', errorMsg);
          }
          break;

        case 'SCRIPT_DONE':
          // Script completato (opzionale, per logging)
          break;

        case 'ROOM_CHANGE_REQUEST':
          // Richiesta cambio stanza dallo script
          sendRuntimeLogToEditor(`Script requested room change: ${message.roomId}`, 'info');
          // TODO: Implementare cambio stanza se necessario
          break;

        default:
          // Ignora messaggi sconosciuti
          break;
      }
    };

    // Aggiungi listener PRIMA di creare l'iframe
    window.addEventListener('message', messageHandler);

    // Crea nuovo iframe con sandbox="allow-scripts" (SENZA allow-same-origin)
    const iframe = document.createElement('iframe');
    iframe.id = 'sandbox-runtime-iframe';
    iframe.style.display = 'none'; // Nascosto, serve solo per esecuzione script
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.sandbox = 'allow-scripts'; // IMPORTANTE: solo allow-scripts, NO allow-same-origin
    
    // Usa direttamente runtime.html (più affidabile)
    // Il percorso deve essere relativo alla root o assoluto
    const runtimePath = window.location.pathname.endsWith('/') 
      ? 'runtime.html' 
      : './runtime.html';
    iframe.src = runtimePath;
    
    // Salva riferimento al listener per rimozione futura
    iframe._messageHandler = messageHandler;

    // Listener per errori di caricamento
    iframe.onerror = function(e) {
      sendRuntimeLogToEditor('Error loading sandbox iframe', 'error');
      console.error('[Sandbox] Iframe load error:', e);
    };

    // Listener per quando l'iframe è caricato (per debug)
    iframe.onload = function() {
      sendRuntimeLogToEditor('Sandbox iframe loaded, waiting for initialization...', 'info');
      
      // Prova a verificare se ci sono errori nell'iframe
      try {
        // Prova ad accedere alla console dell'iframe per vedere errori (se possibile)
        if (iframe.contentWindow && iframe.contentWindow.console) {
          const originalError = iframe.contentWindow.console.error;
          iframe.contentWindow.console.error = function(...args) {
            sendRuntimeLogToEditor('Iframe error: ' + args.join(' '), 'error');
            if (originalError) originalError.apply(iframe.contentWindow.console, args);
          };
        }
        
        // Verifica se runtime.js è stato caricato
        setTimeout(() => {
          try {
            if (iframe.contentWindow && iframe.contentWindow.GameAPI) {
              sendRuntimeLogToEditor('Runtime.js loaded successfully - GameAPI available', 'info');
            } else {
              sendRuntimeLogToEditor('Warning: Runtime.js may not have loaded - GameAPI not found', 'warning');
            }
          } catch (e) {
            // Non possiamo accedere (sandbox restriction)
            sendRuntimeLogToEditor('Cannot verify runtime.js load status (sandbox restriction)', 'warning');
          }
        }, 500);
      } catch (e) {
        // Non possiamo accedere alla console dell'iframe (sandbox restriction)
        sendRuntimeLogToEditor('Cannot access iframe console (sandbox restriction): ' + (e.message || e), 'warning');
      }
      
      // Se dopo 2 secondi non abbiamo ricevuto RUNTIME_READY, potrebbe esserci un problema
      setTimeout(() => {
        if (!embeddedRuntime.isReady) {
          sendRuntimeLogToEditor('Warning: Iframe loaded but RUNTIME_READY not received after 2s. Check if JS/runtime.js is loading correctly.', 'warning');
          // Verifica se possiamo accedere all'iframe
          try {
            if (iframe.contentWindow) {
              if (iframe.contentWindow.GameAPI) {
                sendRuntimeLogToEditor('GameAPI exists but RUNTIME_READY not sent - runtime may not be initializing', 'error');
              } else {
                sendRuntimeLogToEditor('GameAPI not found - JS/runtime.js may not have loaded', 'error');
              }
            }
          } catch (e) {
            sendRuntimeLogToEditor('Cannot access iframe contentWindow to verify runtime status', 'warning');
          }
        }
      }, 2000);
    };

    // Aggiungi iframe al DOM
    document.body.appendChild(iframe);
    embeddedRuntime.sandboxIframe = iframe;
    embeddedRuntime.isReady = false;

    // Timeout per rilevare se l'iframe non si carica
    setTimeout(() => {
      if (!embeddedRuntime.isReady) {
        sendRuntimeLogToEditor('ERROR: Sandbox iframe initialization timeout after 5s. Runtime may not be working.', 'error');
        sendRuntimeLogToEditor('Check: 1) runtime.html exists, 2) JS/runtime.js is accessible, 3) No CORS errors in console', 'error');
        
        // Prova a verificare se l'iframe è caricato
        try {
          if (iframe.contentWindow) {
            sendRuntimeLogToEditor('Iframe contentWindow accessible, but RUNTIME_READY not received', 'error');
            // Verifica se runtime.js è caricato
            try {
              if (iframe.contentWindow.GameAPI) {
                sendRuntimeLogToEditor('GameAPI exists - runtime.js loaded but RUNTIME_READY message not sent', 'error');
              } else {
                sendRuntimeLogToEditor('GameAPI NOT found - JS/runtime.js may not have loaded correctly', 'error');
              }
            } catch (e) {
              sendRuntimeLogToEditor('Cannot check GameAPI (sandbox restriction): ' + (e.message || e), 'warning');
            }
          } else {
            sendRuntimeLogToEditor('Iframe contentWindow not accessible (sandbox restriction)', 'warning');
          }
        } catch (e) {
          sendRuntimeLogToEditor('Cannot access iframe contentWindow: ' + (e.message || e), 'warning');
        }
        
        // Mostra informazioni di debug
        sendRuntimeLogToEditor(`Iframe src: ${iframe.src}`, 'info');
        sendRuntimeLogToEditor(`Iframe sandbox: ${iframe.sandbox}`, 'info');
        sendRuntimeLogToEditor(`Current page location: ${window.location.href}`, 'info');
      } else {
        sendRuntimeLogToEditor('✓ Runtime initialization completed successfully', 'info');
      }
    }, 5000);
  }

  // Esegue uno script nell'iframe sandboxed
  function executeScriptInSandbox(scriptName, scriptContent, handlerName, argsArray, context) {
    if (!scriptContent || typeof scriptContent !== 'string' || !scriptContent.trim()) {
      return;
    }

    const callArgs = Array.isArray(argsArray) ? argsArray : [];
    
    // Prepara il contesto di esecuzione
    const executionContext = {
      roomId: embeddedRuntime.gameState.currentRoomId,
      objectId: context?.objectId || null,
      variables: {}
    };

    // Copia variabili dal gameState
    embeddedRuntime.gameState.variables.forEach((value, key) => {
      executionContext.variables[key] = value;
    });

    // Se l'iframe non è pronto, metti in coda
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

    // Invia script all'iframe (l'handler verrà gestito dal runtime.js)
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

  // Aggiorna il contesto dell'iframe (variabili, room, etc.)
  function updateSandboxContext() {
    if (!embeddedRuntime.isReady || !embeddedRuntime.sandboxIframe) {
      return;
    }

    const context = {
      roomId: embeddedRuntime.gameState.currentRoomId,
      objectId: null,
      variables: {}
    };

    embeddedRuntime.gameState.variables.forEach((value, key) => {
      context.variables[key] = value;
    });

    try {
      embeddedRuntime.sandboxIframe.contentWindow.postMessage({
        type: 'UPDATE_CONTEXT',
        context: context
      }, '*');
    } catch (e) {
      // Ignora errori di comunicazione
    }
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
        sendRuntimeLogToEditor(`[Script] Executing room script: ${roomScriptName}`, 'info');
        const newRoomId = embeddedRuntime.gameState.currentRoomId;
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
      // Prova a inizializzare il canvas se non è già inizializzato
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

    // Disegna marker posizione iniziale se questa è la stanza di start
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

    // Inizializza il canvas embedded se non è già inizializzato
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
    
    // Inizializza ed esegui gli script (verranno eseguiti quando l'iframe è pronto)
    // Gli script verranno messi in pendingScripts se l'iframe non è ancora pronto
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
      // Prova a inizializzare il canvas se non è già inizializzato
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
      // Verifica la tab attiva - non renderizzare se si è nella tab "characters"
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
      
      // Renderizza solo se il canvas è disponibile e il runtime è inizializzato
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
      // Rimuovi listener messaggi se presente
      if (embeddedRuntime.sandboxIframe._messageHandler) {
        window.removeEventListener('message', embeddedRuntime.sandboxIframe._messageHandler);
      }
      // Revoca blob URL se presente
      if (embeddedRuntime.sandboxIframe._blobUrl) {
        URL.revokeObjectURL(embeddedRuntime.sandboxIframe._blobUrl);
      }
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
    embeddedRuntime.isInitialized = false;
  }

  // Functions for Play Test tab
  let playTestState = {
    isRunning: false,
    isPaused: false,
    startTime: null,
    runtimeWindow: null
  };

  window.startPlayTest = async function() {
    if (playTestState.isRunning) {
      // Se già in esecuzione, porta la finestra in primo piano
      if (playTestState.runtimeWindow && !playTestState.runtimeWindow.closed) {
        playTestState.runtimeWindow.focus();
        return;
      } else {
        // Finestra chiusa, riavvia
        playTestState.isRunning = false;
      }
    }

    // Verifica se c'è un progetto attivo e se è stato caricato da Firebase
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    const currentUser = AppState.user;
    
    let projectObj = null;
    let jsonString = null;

    // Se c'è un progetto attivo e un utente autenticato, prova a ricaricarlo da Firebase
    if (activeProjectName && currentUser && currentUser.uid && window.firebaseDB) {
      try {
        addDebugMessage('Loading project from Firebase for playtest...', 'info');
        
        // Cerca il progetto nella lista progetti per ottenere l'ID
        const projects = AppState.projects || [];
        const projectInfo = projects.find(p => {
          const name = (p && p.settings && p.settings.name) ? p.settings.name : p.name || '';
          return name === activeProjectName;
        });

        if (projectInfo && projectInfo.id) {
          // Carica il progetto completo da Firebase
          const firebaseProject = await loadProjectFromFirestore(currentUser.uid, projectInfo.id);
          
          if (firebaseProject) {
            projectObj = firebaseProject;
            
            // Aggiungi metadata per il runtime (userId, projectId per risolvere assetId)
            if (!projectObj._meta) {
              projectObj._meta = {};
            }
            projectObj._meta.userId = currentUser.uid;
            projectObj._meta.projectId = projectInfo.id;
            
            jsonString = JSON.stringify(projectObj, null, 2);
            addDebugMessage('Project loaded from Firebase for playtest', 'success');
          }
        }
      } catch (error) {
        console.error('[PlayTest] Errore caricamento da Firebase:', error);
        addDebugMessage('Firebase load error, using current project', 'warning');
      }
    }

    // Fallback: serializza il progetto corrente
    if (!projectObj || !jsonString) {
      if (window.amiantoResources && typeof window.amiantoResources.refresh === 'function') {
        try {
          await window.amiantoResources.refresh();
        } catch (e) {
          console.warn('[PlayTest] Resources refresh before serialize:', e);
        }
      }
      jsonString = window.serializeProjectToJsonString(true);
      projectObj = window.serializeProject();
      addDebugMessage('Using serialized current project', 'info');
    } else if (window.amiantoResources && typeof window.amiantoResources.getCatalog === 'function') {
      try {
        await window.amiantoResources.refresh();
        projectObj.resourcesCatalog = window.amiantoResources.getCatalog();
        jsonString = JSON.stringify(projectObj, null, 2);
      } catch (e) {
        console.warn('[PlayTest] Resources catalog merge:', e);
      }
    }

    // Salva in localStorage per il runtime (PRIORITÀ ASSOLUTA per playtest)
    try {
      localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
      addDebugMessage('Project saved to localStorage for runtime', 'success');
    } catch (error) {
      console.error('[PlayTest] Errore salvataggio localStorage:', error);
      addDebugMessage('localStorage save error: ' + error.message, 'error');
    }
    
    // Salva anche in cache locale con chiave progetto (backup)
    try {
      const projectName = projectObj.settings && projectObj.settings.name ? projectObj.settings.name : 'Untitled';
      const currentUser = AppState.user;
      if (currentUser && currentUser.username) {
        const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
        localStorage.setItem(projectKey, jsonString);
        localStorage.setItem('amiantoActiveProjectName', projectName);
        localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
        addDebugMessage('Project saved to local cache', 'info');
      }
    } catch (error) {
      console.error('[PlayTest] Errore salvataggio cache:', error);
    }
    
    // Save game.json depending on mode
    if (window.AMIANTO_PLAYTEST_MODE === 'server') {
      saveGameJsonServer(jsonString);
    } else {
      // saveGameJsonLocal già chiama saveProjectJsonToOPFS, non duplicare
      saveGameJsonLocal(jsonString);
    }
    
    // Salva anche con nome progetto in OPFS (backup aggiuntivo)
    // Usa setTimeout per evitare chiamate simultanee
    setTimeout(() => {
      saveProjectJsonToOPFS(jsonString, projectObj.settings && projectObj.settings.name).catch(() => {});
    }, 100);

    // Apri runtime.html in una nuova finestra
    const runtimeUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'runtime.html';
    const runtimeWindow = window.open(
      runtimeUrl,
      'AmiantoRuntime',
      'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
    );

    if (!runtimeWindow) {
      showNotification('Could not open the runtime window. Check that pop-ups are allowed.', 'error');
      return;
    }

    playTestState.isRunning = true;
    playTestState.isPaused = false;
    playTestState.startTime = Date.now();
    playTestState.runtimeWindow = runtimeWindow;
    updateGameStatus('Test running...');
    addDebugMessage('Runtime avviato in finestra separata', 'success');

    // Non inviare postMessage se localStorage è disponibile (priorità a localStorage)
    // Il runtime caricherà automaticamente da localStorage all'avvio
    // PostMessage è solo un fallback se localStorage non funziona
    addDebugMessage('Project saved to localStorage; the runtime will load it automatically', 'info');

    // Monitora se la finestra viene chiusa
    const checkWindowClosed = setInterval(() => {
      if (runtimeWindow.closed) {
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
    
    // ⚠️ NUOVA STRUTTURA: Leggi script direttamente dall'hotspot
    if (!hotspot.scripts || !hotspot.scripts.onClick) {
      addDebugMessage('No script attached to this hotspot', 'warning');
      return;
    }
    
    const onClickScript = hotspot.scripts.onClick;
    
    // BUG FIX: Usa la stessa logica di normalizzazione del runtime
    // Se enabled non è definito e c'è codice, considera enabled=true
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
  // SISTEMA DI COMUNICAZIONE EDITOR ↔ RUNTIME
  // ============================================
  // NOTA: Il runtime è ora incorporato nell'editor, quindi non serve più postMessage
  // Mantenuto per compatibilità futura se necessario
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

  // Funzione di compatibilità: aggiunge messaggi al pannello Script Log
  // Supporta livelli: info, warning, error
  // NON usa console.log come output principale
  function appendToScriptLog(message, level = 'info') {
    let mappedType = 'print';
    if (level === 'error') mappedType = 'error';
    else if (level === 'warning') mappedType = 'warning';
    ScriptLogService.log({ type: mappedType, message, source: 'runtime' });
  }

  // Script console: mostra solo output degli script (print, errori handler, ecc.)
  // Mantiene compatibilità con il resto del codice che chiama addScriptLogMessage
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
  window.saveProjectSettings = function() {
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
    
    // Se il nome del progetto è cambiato, aggiorna il progetto attivo
    if (newProjectName !== activeProjectName) {
      console.log(`[ProjectSettings] Nome progetto cambiato: "${activeProjectName}" -> "${newProjectName}"`);
      localStorage.setItem('amiantoActiveProjectName', newProjectName);
      
      // Aggiorna anche la lista progetti nella cache
      try {
        const userProjects = loadProjectsFromCache(currentUser.username);
        const projectIndex = userProjects.findIndex(p => {
          const name = (p && p.settings && p.settings.name) ? p.settings.name : '';
          return name === activeProjectName;
        });
        
        if (projectIndex >= 0) {
          // Aggiorna il nome nel progetto nella cache
          if (!userProjects[projectIndex].settings) {
            userProjects[projectIndex].settings = {};
          }
          userProjects[projectIndex].settings.name = newProjectName;
          saveProjectsToCache(currentUser.username, userProjects);
          console.log('[ProjectSettings] Cache progetti aggiornata con nuovo nome');
        }
      } catch (error) {
        console.warn('[ProjectSettings] Errore aggiornamento cache progetti:', error);
      }
    }
    
    // Salva le impostazioni in localStorage
    localStorage.setItem('amiantoProjectSettings', JSON.stringify(settings));
    
    // Salva il progetto completo con le nuove impostazioni
    // Questo assicura che le impostazioni siano persistenti nel progetto stesso
    try {
      const projectObj = window.serializeProject();
      if (projectObj) {
        // Aggiorna le impostazioni nel progetto
        if (!projectObj.settings) {
          projectObj.settings = {};
        }
        Object.assign(projectObj.settings, settings);
        
        // Salva il progetto aggiornato
        // Usa saveCurrentProject se disponibile, altrimenti salva manualmente
        if (typeof window.saveCurrentProject === 'function') {
          // Salva il progetto (questo aggiornerà anche Firestore se disponibile)
          window.saveCurrentProject().catch(error => {
            console.warn('[ProjectSettings] Errore salvataggio progetto:', error);
            showNotification('Settings saved locally, but full project save failed', 'warning');
          });
        } else {
          // Fallback: salva solo in cache locale
          const jsonString = JSON.stringify(projectObj);
          const projectKey = `amiantoProject_${currentUser.username}:${newProjectName}`;
          localStorage.setItem(projectKey, jsonString);
          console.log('[ProjectSettings] Progetto salvato in cache locale');
        }
      }
    } catch (error) {
      console.warn('[ProjectSettings] Errore aggiornamento progetto:', error);
    }
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('projectSettingsModal'));
    if (modal) {
      modal.hide();
    }
    
    showNotification(`Project settings saved! Viewport: ${newWidth}×${newHeight}`, 'success');
    
    // Log settings for debugging
    console.log('Project settings saved:', settings);
    
    // Aggiorna la UI se necessario (es. nome progetto nella sidebar)
    if (typeof updateProjectsTab === 'function') {
      updateProjectsTab();
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

  // User management variables
  let currentUser = null;
  let isDemoMode = false;

  // Firebase auth (v9) integration via CDN
  let __fbApp = null;
  let __fbAuthMod = null;
  let __fbAuth = null;
  async function ensureFirebaseAuth() {
    if (__fbApp && __fbAuth && __fbAuthMod) return { app: __fbApp, auth: __fbAuth, mod: __fbAuthMod };
    const appMod = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js');
    __fbAuthMod = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js');
    const firebaseConfig = {
      apiKey: "AIzaSyAg-wvBsbaKEWw896GbfUU9LDURrNa0xjY",
      authDomain: "amianto-editor.firebaseapp.com",
      projectId: "amianto-editor",
      appId: "1:1044586682132:web:c53a04a0d204412f051401"
    };
    __fbApp = appMod.initializeApp(firebaseConfig);
    __fbAuth = __fbAuthMod.getAuth(__fbApp);
    return { app: __fbApp, auth: __fbAuth, mod: __fbAuthMod };
  }
  async function fbObserveAuthState(callback) {
    const { auth, mod } = await ensureFirebaseAuth();
    return mod.onAuthStateChanged(auth, callback);
  }
  async function fbRegister(email, password) {
    const { auth, mod } = await ensureFirebaseAuth();
    return mod.createUserWithEmailAndPassword(auth, email, password);
  }
  async function fbLogin(email, password) {
    const { auth, mod } = await ensureFirebaseAuth();
    return mod.signInWithEmailAndPassword(auth, email, password);
  }
  async function fbSignOut() {
    const { auth, mod } = await ensureFirebaseAuth();
    return mod.signOut(auth);
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
          // Verifica se questo assetId è già nella lista (da unsavedCharacterFrames)
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
      console.log(`[Cleanup] Trovati ${framesToDelete.length} frame da eliminare dalla sessione precedente...`);

      if (window.supabaseStorage && window.supabaseStorage.deleteAsset && 
          window.firebaseAuth && window.firebaseAuth.currentUser) {
        const userId = window.firebaseAuth.currentUser.uid;
        let deletedCount = 0;

        for (const frameInfo of framesToDelete) {
          try {
            // PRIMA: controlla se è un asset legacy Firebase Storage
            let firebaseStoragePath = null;
            let isFirebaseLegacy = false;
            if (frameInfo.assetId && window.firebaseDB) {
              try {
                const assetRef = window.firebaseDB
                  .collection('users')
                  .doc(userId)
                  .collection('projects')
                  .doc(frameInfo.projectId)
                  .collection('assets')
                  .doc(frameInfo.assetId);
                
                const doc = await assetRef.get();
                if (doc.exists) {
                  const data = doc.data();
                  // Controlla se è un asset legacy Firebase Storage
                  if (data && data.storagePath && (!data.storageProvider || data.storageProvider !== 'supabase')) {
                    firebaseStoragePath = data.storagePath;
                    isFirebaseLegacy = true;
                    console.log(`[Cleanup] ⚠️ Frame legacy Firebase rilevato, eliminerò anche da Firebase Storage: ${firebaseStoragePath}`);
                  }
                }
              } catch (metaErr) {
                console.warn(`[Cleanup] Impossibile recuperare metadata da Firestore per frame:`, metaErr);
              }
            }
            
            // Elimina da Firebase Storage se è un asset legacy
            let firebaseDeleted = true; // Default true se non è un asset legacy
            if (isFirebaseLegacy && firebaseStoragePath && window.firebaseStorage) {
              try {
                console.log(`[Cleanup] Eliminazione frame legacy da Firebase Storage: ${firebaseStoragePath}`);
                const storageRef = window.firebaseStorage.ref(firebaseStoragePath);
                await storageRef.delete();
                firebaseDeleted = true;
                console.log(`[Cleanup] ✅ Frame eliminato da Firebase Storage: ${firebaseStoragePath}`);
              } catch (firebaseError) {
                console.warn(`[Cleanup] ⚠️ Errore eliminazione da Firebase Storage (non critico):`, firebaseError);
                // Non blocchiamo il successo se Firebase Storage fallisce (potrebbe essere già eliminato)
                firebaseDeleted = false;
              }
            }
            
            // POI: elimina da Supabase Storage
            const deleted = await window.supabaseStorage.deleteAsset(
              frameInfo.projectId,
              frameInfo.type,
              frameInfo.fileName,
              userId,
              frameInfo.subfolder
            );
            
            // Considera l'eliminazione riuscita se almeno uno dei due storage è stato eliminato
            if (deleted || (firebaseDeleted && isFirebaseLegacy)) {
              deletedCount++;
            }
          } catch (error) {
            console.warn('[Cleanup] Errore eliminazione frame dalla sessione precedente:', error);
          }
        }

        console.log(`[Cleanup] Eliminati ${deletedCount}/${framesToDelete.length} frame dalla sessione precedente`);
      }

      // Rimuovi dallo storage dopo il cleanup
      sessionStorage.removeItem('amiantoUnsavedFramesToDelete');
    } catch (error) {
      console.error('[Cleanup] Errore cleanup frame dalla sessione precedente:', error);
    }
  }

  // Initialize authentication system
  async function initAuthSystem() {
    // Default view
    showLoginPage();

    // Wire forms
    setupLoginForm();
    setupRegistrationModal();

    // Restore demo mode if previously set for this session
    if (sessionStorage.getItem('amiantoDemoMode') === '1') {
      isDemoMode = true;
      setTimeout(() => {
        if (typeof window.enterDemoMode === 'function') {
          window.enterDemoMode();
        }
      }, 0);
    }

    // Esegui bootstrap iniziale
    await bootstrapApp();
    
    // Pulisci i frame non salvati dalla sessione precedente (se la pagina è stata chiusa senza salvare)
    cleanupStoredUnsavedFrames().catch(err => {
      console.warn('[Bootstrap] Errore cleanup frame sessione precedente:', err);
    });
    
    // Nascondi loading dopo bootstrap
    hideLoadingOverlay();
    
    // Se l'app è inizializzata con un utente, mostra dashboard
    if (AppState.initialized && AppState.user) {
      currentUser = AppState.user;
      localStorage.setItem('amiantoCurrentUser', AppState.user.username);
      showDashboard();
      
      // Controlla se c'è un progetto attivo e abilita/disabilita tab
      const activeProject = localStorage.getItem('amiantoActiveProjectName');
      enableOtherTabs(!!activeProject);
      
      // Carica progetti nella tab Projects se siamo nella tab Projects
      setTimeout(async () => {
        const currentTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : null;
        if (currentTab === 'projects') {
          await loadAndRenderProjectsTab();
        }
      }, 500);
    }

    // Observe Firebase auth state per cambiamenti successivi
    fbObserveAuthState(async function(user){
      // In demo mode, ignore Firebase auth state transitions
      if (isDemoMode) {
        return;
      }
      
      if (user) {
        const mappedUser = {
          username: (user.email || '').split('@')[0] || (user.uid ? `user_${user.uid.substring(0, 6)}` : 'User'),
          email: user.email || '',
          uid: user.uid
        };
        
        // Se l'utente è già loggato e corrisponde, aggiorna AppState e sincronizza in background
        if (AppState.user && AppState.user.uid === mappedUser.uid) {
          console.log('[AuthObserver] Utente già loggato, aggiornamento progetti in background...');
          
          // Sincronizza in background (non blocca UI)
          syncProjectsFromFirestore(mappedUser.uid)
            .then(() => {
              // Ricarica progetti da Firestore e aggiorna AppState
              return loadProjectsDirectlyFromFirestore(mappedUser.uid);
            })
            .then(projects => {
              updateAppState({ projects: projects });
              if (mappedUser.username) {
                saveProjectsToCache(mappedUser.username, projects);
              }
              console.log('[AuthObserver] ✅ Progetti aggiornati in background');
            })
            .catch(error => {
              console.error('[AuthObserver] Errore aggiornamento background:', error);
            });
          
          // Mostra modale se necessario
          const activeProject = localStorage.getItem('amiantoActiveProjectName');
          if (!activeProject) {
            showProjectSelectionModal(false);
          }
          return;
        }
        
        // Nuovo login: esegui bootstrap completo
        updateAppState({ loading: true, user: null, projects: [] });
        showLoadingOverlay('Loading projects...');
        await bootstrapApp();
        hideLoadingOverlay();
        
        if (AppState.user) {
          currentUser = AppState.user;
          localStorage.setItem('amiantoCurrentUser', AppState.user.username);
          showDashboard();
          
          // Verifica che i progetti siano stati caricati
          console.log('[AuthObserver] Progetti caricati:', AppState.projects.length);
          
          // Mostra modale selezione progetto (AppState.projects è già popolato da bootstrapApp)
          showProjectSelectionModal(false);
        }
      } else {
        // Logout
        currentUser = null;
        updateAppState({ user: null, projects: [] });
        showLoginPage();
      }
    });
  }

  // Force reset all auth data (emergency function) — demo user removed
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

  // Show login page
  function showLoginPage() {
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('loginHeader').style.display = 'block';
    document.getElementById('dashboardHeader').style.display = 'none';

    // Clear form
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginAlert').classList.add('d-none');
  }

  // Show dashboard
  async function showDashboard() {
    try {
      console.log('[showDashboard] Starting...');
      const loginPage = document.getElementById('loginPage');
      const mainDashboard = document.getElementById('mainDashboard');
      const loginHeader = document.getElementById('loginHeader');
      const dashboardHeader = document.getElementById('dashboardHeader');
      
      if (!loginPage || !mainDashboard || !loginHeader || !dashboardHeader) {
        console.error('[showDashboard] Required elements not found');
        return;
      }
      
      loginPage.style.display = 'none';
      mainDashboard.style.display = 'block';
      loginHeader.style.display = 'none';
      dashboardHeader.style.display = 'block';

      // Update user info in header
      const currentUserNameEl = document.getElementById('currentUserName');
      const userDisplayNameEl = document.getElementById('userDisplayName');
      if (currentUserNameEl && currentUser) {
        currentUserNameEl.textContent = currentUser.username;
      }
      if (userDisplayNameEl && currentUser) {
        userDisplayNameEl.textContent = currentUser.username;
      }
      console.log('[showDashboard] UI updated');

    // Load user's projects
    loadUserProjects();
    
    // Verifica se ci sono progetti: se non ce ne sono, mostra il modale
    // (solo se non c'è un progetto attivo già aperto)
    const activeProject = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProject && currentUser && currentUser.uid) {
      // Sincronizza e verifica progetti
      if (window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
        try {
          const userProjects = await syncProjectsFromFirestore(currentUser.uid);
          if (userProjects.length === 0) {
            // Nessun progetto: mostra il modale
            await showProjectSelectionModal(true);
          }
        } catch (error) {
          console.error('[Dashboard] Errore verifica progetti:', error);
          // In caso di errore, prova comunque a mostrare il modale usando getProjectsForUI
          try {
            const localProjects = await getProjectsForUI(currentUser.uid);
            if (localProjects.length === 0) {
              await showProjectSelectionModal(true, true); // skipSync = true
            }
          } catch (fallbackError) {
            console.error('[Dashboard] Errore anche nel fallback:', fallbackError);
            // Se anche il fallback fallisce, mostra comunque il modale (sarà vuoto)
            await showProjectSelectionModal(true, true);
          }
        }
      }
    }
      console.log('[showDashboard] Completed successfully');
    } catch (error) {
      console.error('[showDashboard] Error:', error);
      console.error('[showDashboard] Error stack:', error.stack);
      throw error; // Re-throw per essere gestito dal chiamante
    }
  }

  // Setup login form
  function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) {
          showLoginError('Please enter both email and password');
          return;
        }
        fbLogin(email, password).then(async (cred) => {
          const user = cred && cred.user;
          if (user) {
            console.log('[Login] User authenticated:', user.email);
            const mapped = {
              username: (user.email || '').split('@')[0] || (user.uid ? `user_${user.uid.substring(0, 6)}` : 'User'),
              email: user.email || '',
              uid: user.uid
            };
            console.log('[Login] Calling loginUser with:', mapped);
            try {
              await loginUser(mapped, document.getElementById('rememberMe').checked);
              console.log('[Login] loginUser completed successfully');
            } catch (loginError) {
              console.error('[Login] Error in loginUser:', loginError);
              showLoginError('Error during login process. Please try again.');
            }
          } else {
            console.error('[Login] No user in credentials');
            showLoginError('Invalid email or password');
          }
        }).catch((err) => {
          console.error('[Login] Firebase error:', err && err.code, err && err.message);
          showLoginError('Invalid email or password');
        });
      });
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
      console.error('[ProjectModal] ❌ modal-body non trovato, impossibile aggiornare');
      return;
    }
    
    // Renderizza lista usando AppState.projects (UNICA FONTE DI VERITÀ)
    renderProjectsList(AppState.projects, modalBody);
    
    console.log('[ProjectModal] ✅ Contenuto modale aggiornato con', AppState.projects.length, 'progetti da AppState');
  }

  /**
   * Mostra modale di selezione/creazione progetto
   * 
   * RIFATTORIZZATA: Legge SOLO da AppState.projects
   * Non avvia caricamenti, non fa fallback, non gestisce async
   * 
   * Flusso corretto:
   * click →
   *   se AppState.loading === true → mostra loader
   *   se AppState.projects.length === 0 → mostra empty state
   *   altrimenti → render lista e apri modale
   * 
   * @param {boolean} forceShow - Forza apertura anche se c'è progetto attivo
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
    
    // Se il modale non esiste nell'HTML, crealo (fallback per compatibilità)
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

    // Se c'è già un progetto attivo e non è forzato, non mostrare il modale
    if (!forceShow) {
      const activeProject = localStorage.getItem('amiantoActiveProjectName');
      if (activeProject) {
        console.log('[ProjectModal] Progetto già attivo, salto modale:', activeProject);
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

      // STEP 2: Leggi progetti da AppState (UNICA FONTE DI VERITÀ)
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
        // Il loader verrà nascosto quando AppState.loading diventa false
        // Ma nascondiamo anche qui per sicurezza
        hideLoadingOverlay();
      }

    // Gestione click su pulsanti Open con event delegation (funziona anche dopo aggiornamenti contenuto)
    // Aggiungi listener solo se non è già stato aggiunto
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
              
              // Chiudi il modale DOPO che il progetto è stato caricato con successo
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
      
      // Gestione click su pulsante "Create New Project"
      if (e.target && (e.target.id === 'btn-create-new-project' || e.target.closest('#btn-create-new-project'))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Blocca durante la sincronizzazione
        if (isSyncingProjects) {
          showNotification('Please wait for synchronization to complete', 'warning');
          return false;
        }
        
        const projectName = prompt('Enter the new project name:');
        if (projectName && projectName.trim()) {
          showNotification(`Creating project "${projectName.trim()}"...`, 'info');
          
          // Crea il progetto (questo salva anche su Firestore)
          // Passa false per showSuccessNotification per evitare notifica duplicata
          await window.createNewProject(projectName.trim(), false);
          
          // Attendi che Firestore abbia completato il salvataggio e propagato i cambiamenti
          // Firestore può richiedere tempo per propagare i cambiamenti, specialmente su dispositivi lenti
          console.log('[ProjectModal] Attesa completamento salvataggio Firestore...');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Aumentato a 2 secondi per dare tempo a Firestore
          
          // Mostra notifica di successo dopo la creazione
          showNotification(`Project "${projectName.trim()}" created and opened!`, 'success');
          
          // Dopo la creazione, sincronizza e aggiorna il modale con la nuova lista progetti
          // Questo mostrerà il loading durante la sincronizzazione
          console.log('[ProjectModal] Avvio sincronizzazione per aggiornare lista progetti...');
          const currentBsModal = bootstrap.Modal.getInstance(modal);
          if (currentBsModal) {
            await updateProjectModalContent(modal, currentBsModal);
            console.log('[ProjectModal] Sincronizzazione completata, modale aggiornato');
          }
          
          // Chiudi il modale solo se il progetto è stato aperto con successo
          const activeProject = localStorage.getItem('amiantoActiveProjectName');
          if (activeProject === projectName.trim() && currentBsModal) {
            currentBsModal.hide();
          }
        } else if (projectName !== null) {
          // L'utente ha inserito un nome vuoto, mostra di nuovo il prompt
          showNotification('Project name cannot be empty', 'warning');
        }
        // Se projectName === null, l'utente ha annullato, non fare nulla
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

      // Il modale è statico nell'HTML, non rimuoverlo quando viene nascosto
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
            
            // Se AppState.loading è true, mostra loader
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
        // Se c'è un progetto attivo, permettere la chiusura
        console.log('[ProjectModal] Chiusura permessa - progetto attivo:', activeProject);
      });
    }

    // Il listener per il backdrop è già gestito dentro handleProjectClick
    // Non aggiungere listener duplicati

    } catch (error) {
      // Gestione errori
      console.error('[ProjectModal] Errore durante il rendering:', error);

      // Distingui tra diversi tipi di errori
      if (error.code === 'permission-denied') {
        console.error('[ProjectModal] Firestore permission denied error:', error);
        console.error('[ProjectModal] Check Firestore security rules for user:', AppState.user?.uid);
      } else if (error.code === 'network-error' || error.message?.includes('network') || error.message?.includes('Network')) {
        console.error('[ProjectModal] Network error:', error);
      } else if (error.message?.includes('DOM') || error.message?.includes('Bootstrap')) {
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

  // Login user
  async function loginUser(user, rememberMe = false) {
    console.log('[loginUser] Starting with user:', user);
    if (!user || !user.uid) {
      console.error('[loginUser] Invalid user object:', user);
      throw new Error('Invalid user object');
    }
    currentUser = user;
    console.log('[loginUser] currentUser set to:', currentUser);
    localStorage.setItem('amiantoCurrentUser', user.username);

    if (rememberMe) {
      localStorage.setItem('amiantoRememberUser', user.username);
    } else {
      localStorage.removeItem('amiantoRememberUser');
    }

    // Mostra loading overlay durante la sincronizzazione progetti
    // IMPORTANTE: Durante il caricamento si vede SOLO il loading, NON il modale
    showLoadingOverlay('Loading projects...');

    // Sincronizza progetti da Firestore PRIMA di mostrare la dashboard
    if (user.uid && window.firebaseDB && window.firebaseAuth) {
      console.log('[Login] Avvio sincronizzazione progetti da Firestore...');
      
      try {
        // STEP 1: Sincronizza progetti (salva in localStorage)
        await syncProjectsFromFirestore(user.uid);
        console.log('[Login] ✅ Sincronizzazione progetti completata');
        
        // STEP 2: Carica progetti da Firestore e aggiorna AppState
        const projects = await loadProjectsDirectlyFromFirestore(user.uid);
        console.log('[Login] ✅ Progetti caricati:', projects.length);
        
        // STEP 3: Aggiorna AppState con i progetti caricati
        updateAppState({ projects: projects });
        
        // STEP 4: Aggiorna anche la cache localStorage
        if (user.username) {
          saveProjectsToCache(user.username, projects);
        }
        
      } catch (error) {
        console.error('[Login] Errore durante sincronizzazione progetti:', error);
        
        // In caso di errore, prova a caricare dalla cache come fallback
        if (user.username) {
          console.log('[Login] Fallback a cache localStorage...');
          const cachedProjects = loadProjectsFromCache(user.username);
          updateAppState({ projects: cachedProjects });
          console.log('[Login] Progetti da cache:', cachedProjects.length);
        } else {
          updateAppState({ projects: [] });
        }
        
        // Per dispositivi senza cache (primo accesso), questo è normale se non ci sono progetti
        // Mostra un messaggio informativo ma non bloccante
        if (error.code === 'permission-denied') {
          console.error('[Login] Firestore permission denied error');
          console.warn('[Login] Questo può essere normale per nuovi utenti. L\'utente può comunque creare progetti.');
          // Non mostrare notifica per permission-denied, il modale gestirà l'errore
        } else if (error.code === 'network-error') {
          console.error('[Login] Network error');
          showNotification('Connection error. You can still create a new project.', 'warning');
        } else {
          // Per altri errori, mostra un messaggio informativo
          console.warn('[Login] Errore sincronizzazione. L\'utente può comunque creare progetti.');
          // Non mostrare notifica per errori generici, il modale gestirà l'errore
        }
      }
    } else {
      console.warn('[Login] Firestore non disponibile, salto sincronizzazione');
      updateAppState({ projects: [] });
    }

    // Nascondi loading overlay e mostra dashboard solo dopo la sincronizzazione
    try {
      hideLoadingOverlay();
      console.log('[Login] Showing dashboard...');
      await showDashboard();
      console.log('[Login] Dashboard shown');
      
      if (typeof showNotification === 'function') {
        showNotification(`Welcome back, ${user.username}!`, 'success');
      }
      
      // Mostra modale di selezione progetto (sempre, anche se non ci sono progetti)
      // L'utente deve selezionare o creare un progetto per continuare
      // skipSync = true perché abbiamo già sincronizzato i progetti sopra
      // Il modale verrà mostrato SOLO dopo che il loading è nascosto (gestito internamente)
      await showProjectSelectionModal(false, true);
      console.log('[Login] Project selection modal shown');
    } catch (dashboardError) {
      console.error('[Login] Error showing dashboard:', dashboardError);
      hideLoadingOverlay();
      if (typeof showLoginError === 'function') {
        showLoginError('Error showing dashboard. Please refresh the page.');
      }
    }
  }

  // Show login error
  function showLoginError(message) {
    const alert = document.getElementById('loginAlert');
    alert.textContent = message;
    alert.classList.remove('d-none');
  }

  // Show registration modal
  window.showRegistration = function() {
    const modal = new bootstrap.Modal(document.getElementById('registerModal'));
    modal.show();

    // Clear form
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
    document.getElementById('registerAlert').classList.add('d-none');
  };

  // Setup registration modal
  function setupRegistrationModal() {
    // Auto-focus first field when modal opens
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
      registerModal.addEventListener('shown.bs.modal', function() {
        document.getElementById('registerEmail').focus();
      });
    }
  }

  // Register new user
  window.registerUser = function() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    // Validation
    if (!email || !password || !confirmPassword) {
      showRegisterError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      showRegisterError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showRegisterError('Password must be at least 6 characters long');
      return;
    }

    // Firebase registration
    fbRegister(email, password).then((cred) => {
      const user = cred && cred.user;
      if (user) {
        const mapped = {
          username: (user.email || '').split('@')[0] || (user.uid ? `user_${user.uid.substring(0, 6)}` : 'User'),
          email: user.email || '',
          uid: user.uid
        };
        loginUser(mapped);
      }
      const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
      if (modal) modal.hide();
      showNotification('Account created successfully!', 'success');
    }).catch((err) => {
      console.error('[Register] Firebase error:', err && err.code, err && err.message);
      showRegisterError('Registration failed. Please check your email and try again.');
    });
  };

  // Show registration error
  function showRegisterError(message) {
    const alert = document.getElementById('registerAlert');
    alert.textContent = message;
    alert.classList.remove('d-none');
  }

  // Funzione per pulire i frame non salvati da Supabase
  async function cleanupUnsavedCharacterFrames() {
    if (unsavedCharacterFrames.size === 0 && unsavedCharacterAssetIds.size === 0) {
      return; // Nessun frame da eliminare
    }

    console.log(`[Cleanup] Eliminazione di ${unsavedCharacterFrames.size + unsavedCharacterAssetIds.size} frame character non salvati da Supabase...`);

    let deletedCount = 0;
    
    // Prima: elimina usando gli Image objects tracciati
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
    
    // Secondo: elimina usando gli assetId tracciati (cerca le immagini corrispondenti)
    if (unsavedCharacterAssetIds.size > 0 && window.supabaseStorage && window.supabaseStorage.deleteAsset) {
      try {
        const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
        const projectId = activeProjectName ? activeProjectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_') : null;
        
        if (projectId && window.firebaseAuth && window.firebaseAuth.currentUser) {
          const userId = window.firebaseAuth.currentUser.uid;
          
          // Cerca le immagini corrispondenti agli assetId nell'imageAssetMap
          for (const assetId of Array.from(unsavedCharacterAssetIds)) {
            try {
              // Cerca l'immagine nell'imageAssetMap
              let foundImage = null;
              for (const [img, assetInfo] of imageAssetMap.entries()) {
                if (assetInfo.assetId === assetId && assetInfo.type === 'character') {
                  foundImage = img;
                  break;
                }
              }
              
              if (foundImage) {
                const deleted = await deleteAssetFromImage(foundImage);
                if (deleted) {
                  deletedCount++;
                }
              } else {
                // Se non trovato nell'imageAssetMap, prova a eliminare direttamente usando i metadati
                // (richiede che abbiamo salvato i metadati in Firestore)
                console.warn(`[Cleanup] Immagine non trovata nell'imageAssetMap per assetId ${assetId}, eliminazione diretta non supportata`);
              }
            } catch (error) {
              console.warn(`[Cleanup] Errore eliminazione assetId ${assetId}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('[Cleanup] Errore eliminazione frame per assetId:', error);
      }
    }

    console.log(`[Cleanup] Eliminati ${deletedCount} frame non salvati da Supabase`);
    unsavedCharacterFrames.clear();
    unsavedCharacterAssetIds.clear();
  }

  // Logout user
  window.logout = async function() {
    // If in demo mode, just exit demo without calling Firebase
    if (isDemoMode) {
      isDemoMode = false;
      sessionStorage.removeItem('amiantoDemoMode');
      currentUser = null;
      localStorage.removeItem('amiantoCurrentUser');
      localStorage.removeItem('amiantoRememberUser');
      showLoginPage();
      showNotification('You left Demo Mode', 'info');
      return;
    }

    if (confirm('Are you sure you want to logout?')) {
      // Pulisci i frame non salvati prima del logout
      try {
        await cleanupUnsavedCharacterFrames();
      } catch (error) {
        console.error('[Logout] Errore cleanup frame:', error);
        // Continua comunque con il logout
      }

      fbSignOut().catch(()=>{}).finally(() => {
        currentUser = null;
        localStorage.removeItem('amiantoCurrentUser');
        localStorage.removeItem('amiantoRememberUser');
        showLoginPage();
        showNotification('Logged out successfully', 'info');
      });
    }
  };

  // Enter demo mode (no account required)
  window.enterDemoMode = function() {
    isDemoMode = true;
    sessionStorage.setItem('amiantoDemoMode', '1');
    currentUser = {
      username: 'Demo',
      email: '',
      uid: 'demo'
    };
    showDashboard();
    showNotification('Demo Mode active: you are using the editor without an account', 'info');
  };

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

  // Debug authentication system (simplified — demo user removed)
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
    
    // IMPORTANTE: Se l'immagine è un oggetto Image ma non è nella mappa,
    // serializzala come dataURL. Verrà poi processata da saveAllAssetsToStorage
    // che la convertirà in assetId e la caricherà nello storage.
    // Questo garantisce che TUTTI gli assets vengano serializzati e salvati.
    if (img && typeof img === 'object' && (img.src || (img.width && img.height))) {
      // È un oggetto Image, convertilo in dataURL per essere processato da saveAllAssetsToStorage
      const dataURL = imageToDataURL(img);
      if (dataURL) {
        console.log(`[Serialize] Immagine non tracciata nella mappa, serializzata come dataURL (verrà convertita in assetId al salvataggio)`);
        return dataURL;
      }
    }
    
    // Se è già una stringa (dataURL o assetId), restituiscila così com'è
    if (typeof img === 'string') {
      return img;
    }
    
    // Fallback: usa dataURL (per compatibilità con progetti esistenti)
    return imageToDataURL(img);
  }

  function serializeRooms() {
    const serialized = [];
    rooms.forEach((r) => {
      // DEBUG: Log foreground prima della serializzazione
      if (Array.isArray(r.foregrounds)) {
        console.log(`[Serialize] Room ${r.id}: serializzando ${r.foregrounds.length} foreground`, r.foregrounds.map(f => ({ id: f.id, name: f.name, hasImg: !!f.img })));
      } else {
        console.log(`[Serialize] Room ${r.id}: r.foregrounds non è un array`, typeof r.foregrounds, r.foregrounds);
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
            offsetX: Number(x) || 0, // Mantieni per compatibilità
            offsetY: Number(y) || 0, // Mantieni per compatibilità
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
        walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
        hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => {
          // ⚠️ NUOVA STRUTTURA: script salvato direttamente nell'hotspot
          const hotspotObj = {
            id: h.id,
            name: h.name,
            points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
            visible: !!h.visible,
            scripts: {}
          };
          
          // ⚠️ NORMALIZZAZIONE: Usa SOLO la struttura scripts.onClick dell'hotspot
          // enabled = true di default se non definito e c'è codice
          // BUG FIX CRITICO: Garantisce che enabled=true quando c'è codice e enabled non è esplicitamente definito come false
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
            
            // AUTOMATIZZAZIONE: Se c'è codice, enabled deve essere sempre true
            // L'obiettivo è eliminare il blocco "enabled = false" per hotspot con codice
            let normalizedEnabled;
            if (hasCode) {
              // Se c'è codice, forza sempre enabled=true (ignorando eventuale enabled=false salvato)
              normalizedEnabled = true;
              if (typeof onClickData.enabled === 'boolean' && onClickData.enabled === false) {
                console.warn(`[Serialize] [AUTO-ENABLE] Hotspot ${h.id} ha codice ma enabled=false salvato, forzo enabled=true`);
              }
            } else {
              // Se non c'è codice, enabled può essere false
              normalizedEnabled = (typeof onClickData.enabled === 'boolean') ? onClickData.enabled : false;
            }
            
            // DEBUG: Verifica che il codice venga salvato correttamente
            const codeToSave = String(onClickData.code || '');
            if (hasCode && codeToSave.length === 0) {
              console.error(`[Serialize] [ERRORE] Hotspot ${h.id} ha codice ma codeToSave è vuoto!`, {
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
            // Se non c'è script, imposta struttura vuota e disabilitata
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
        console.log(`[Serialize] ✓ Room ${r.id}: ${serializedRoom.foregrounds.length} foreground serializzati nel JSON`);
      } else {
        console.warn(`[Serialize] ⚠️ Room ${r.id}: foregrounds non serializzati correttamente!`, serializedRoom);
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
      // Ensure JSON-safe clone
      return JSON.parse(JSON.stringify(settings || {}));
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
      const out = { name, directions: {} };
      // Include pivot if it exists
      if (charData && charData.pivotX !== undefined && charData.pivotY !== undefined) {
        out.pivotX = Number(charData.pivotX) || 0;
        out.pivotY = Number(charData.pivotY) || 0;
      }
      // Include spawnSettings if it exists
      if (charData && charData.spawnSettings) {
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
        console.log(`[Character] Serializzazione spawnSettings per "${name}":`, out.spawnSettings);
      }
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


  function serializeScripts() {
    const scriptsObj = {};
    try {
      if (jsScripts && jsScripts.forEach) {
        jsScripts.forEach((content, name) => { if (name) scriptsObj[name] = String(content || ''); });
      }
    } catch (_) {}
    // Include any saved in localStorage (prefix: script-)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('script-')) {
          const name = key.slice('script-'.length);
          if (!(name in scriptsObj)) scriptsObj[name] = String(localStorage.getItem(key) || '');
        }
      }
    } catch (_) {}
    return scriptsObj;
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
      // ⚠️ hotspotScripts rimosso: gli script degli hotspot sono ora salvati direttamente in hotspot.scripts.onClick
    };
  }

  function serializeCursors() {
    return Array.isArray(contextualCursors) ? contextualCursors.map(c => ({
      id: c.id,
      targetType: c.targetType,
      targetId: c.targetId,
      actionText: c.actionText || '',
      scriptName: c.scriptName || '',
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
    // Project name best-effort
    const nameField = document.getElementById('projectName');
    if (nameField && nameField.value) settings.name = nameField.value;
    if (!settings.name) settings.name = 'Untitled Project';
    // Normalize start config types
    if (typeof settings.startX !== 'undefined') settings.startX = Number(settings.startX) || 0;
    if (typeof settings.startY !== 'undefined') settings.startY = Number(settings.startY) || 0;
    // Map startRoomId to startRoom for runtime compatibility
    if (settings.startRoomId && !settings.startRoom) {
      settings.startRoom = settings.startRoomId;
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
      guis: serializeGUI(),
      characters: serializeCharacters(),
      inventory: serializeInventory(),
      scripts: serializeScripts(),
      attachments: serializeAttachments(),
      cursors: serializeCursors(),
      variables: serializeVariables(),
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
      if (projectObj.settings && projectObj.settings.id) {
        projectObj._meta.projectId = projectObj.settings.id;
      } else if (projectObj.settings && projectObj.settings.name) {
        // Normalizza il nome come viene fatto in saveCurrentProject
        projectObj._meta.projectId = projectObj.settings.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
      } else if (activeProjectName) {
        projectObj._meta.projectId = activeProjectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
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
      
      // Debounce: se è passato meno di OPFS_SAVE_DEBOUNCE_MS dall'ultimo salvataggio, aspetta
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
      // Non loggare errori OPFS come warning - è solo un fallback opzionale
      // OPFS può fallire per vari motivi (permessi, sicurezza browser, ecc.)
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

  /** Conta stringhe data:…;base64, nel progetto (immagini, audio, ecc.). */
  function countEmbeddedDataUrls(root) {
    let count = 0;
    const walk = (v) => {
      if (typeof v === 'string' && /^data:[^;]+;base64,/i.test(v)) {
        count++;
        return;
      }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      Object.values(v).forEach(walk);
    };
    walk(root);
    return count;
  }

  /** Somma i byte delle stringhe data:…;base64, ancora nel progetto serializzato. */
  function measureEmbeddedDataUrlBytes(root) {
    let total = 0;
    const walk = (v) => {
      if (typeof v === 'string' && /^data:[^;]+;base64,/i.test(v)) {
        total += new Blob([v]).size;
        return;
      }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      Object.values(v).forEach(walk);
    };
    walk(root);
    return total;
  }

  const FIRESTORE_ASSET_REF_PLACEHOLDER = 'asset:estimate00000000000000';

  /** Stima la dimensione del payload Firestore (come dopo upload asset, senza base64). */
  function estimateFirestorePayloadBytes(projectObj) {
    const payload = prepareProjectPayloadForFirestore(projectObj);
    let json = JSON.stringify(payload);
    json = json.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/gi, FIRESTORE_ASSET_REF_PLACEHOLDER);
    return new Blob([json]).size;
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

  /** Rimuove scripts Hotspot:* duplicati se già in rooms[].hotspots[].scripts.onClick */
  function dedupeHotspotScriptsForFirestore(projectObj) {
    const clone = JSON.parse(JSON.stringify(projectObj));
    if (!clone.scripts || typeof clone.scripts !== 'object') return clone;
    const embeddedById = collectHotspotOnClickCodesById(clone);
    const scripts = { ...clone.scripts };
    for (const key of Object.keys(scripts)) {
      if (!key.startsWith('Hotspot:')) continue;
      const hotspotId = key.slice('Hotspot:'.length);
      const embedded = embeddedById.get(hotspotId);
      const legacy = String(scripts[key] || '').trim();
      if (embedded && legacy && embedded === legacy) {
        delete scripts[key];
      }
    }
    clone.scripts = scripts;
    return clone;
  }

  function prepareProjectPayloadForFirestore(projectObj) {
    let payload = dedupeHotspotScriptsForFirestore(projectObj);
    payload.resourcesCatalog = slimResourcesCatalogForFirestore(projectObj.resourcesCatalog);
    return payload;
  }

  /** Progetti legacy: script solo in scripts['Hotspot:id'] → hotspot.scripts.onClick */
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

  // ================================
  // FIRESTORE PERSISTENCE SYSTEM
  // ================================
  // 
  // AGGIUNTO: Sistema completo di salvataggio persistente su Firestore
  // 
  // COSA È GIÀ IMPLEMENTATO:
  // - Firebase è già configurato in firebase-config.js (window.firebaseDB disponibile)
  // - serializeProject() esiste e funziona
  // - applyProjectObject() esiste per caricare progetti
  // - localStorage/OPFS come cache locale
  // 
  // COSA È STATO AGGIUNTO:
  // - saveProjectToFirestore(): Salva progetto su Firestore
  // - loadProjectFromFirestore(): Carica progetto da Firestore
  // - listProjectsFromFirestore(): Lista progetti da Firestore (TODO: integrare in UI)
  // - autosaveToCache(): Autosave su cache locale come fallback
  // - Modificato saveCurrentProject(): Ora salva anche su Firestore
  // - Modificato openProjectByName(): Carica prima da Firestore, poi fallback cache
  // 
  // STRUTTURA FIRESTORE:
  // users/{userId}/projects/{projectId}
  // {
  //   name: string,
  //   projectData: string (JSON serializzato),
  //   createdAt: timestamp,
  //   updatedAt: timestamp
  // }
  // 
  // TODO:
  // - Implementare sistema di projectId univoci (attualmente usa nome normalizzato)
  // - Integrare listProjectsFromFirestore() nella UI di selezione progetti
  // - Aggiungere autosave periodico (ogni 30-60 secondi)
  //

  /**
   * Salva un progetto su Firestore
   * @param {string} userId - ID utente (uid di Firebase)
   * @param {string} projectId - ID progetto (usa il nome del progetto come ID temporaneo)
   * @param {Object} projectData - Oggetto progetto completo (già serializzato)
   * @returns {Promise<boolean>} - true se salvato con successo, false altrimenti
   * 
   * GIÀ IMPLEMENTATO: Firebase è già configurato in firebase-config.js
   * AGGIUNTO: Questa funzione per salvare su Firestore
   */
  async function saveProjectToFirestore(userId, projectId, projectData) {
    try {
      console.log('[Firestore] Tentativo salvataggio progetto...', { userId, projectId });
      
      // Verifica che Firestore sia disponibile
      if (!window.firebaseDB) {
        console.warn('[Firestore] Firestore non disponibile (window.firebaseDB è null/undefined)');
        addDebugMessage('[Firestore] Firestore unavailable, using cache fallback', 'warning');
        return false;
      }
      console.log('[Firestore] Firestore DB disponibile:', !!window.firebaseDB);

      // Verifica che userId e projectId siano validi
      if (!userId || !projectId) {
        console.error('[Firestore] userId o projectId mancanti', { userId, projectId });
        addDebugMessage('[Firestore] userId o projectId mancanti', 'error');
        return false;
      }

      const projectName = projectData.settings && projectData.settings.name ? projectData.settings.name : projectId;
      const jsonString = JSON.stringify(projectData);
      const dataSizeBytes = new Blob([jsonString]).size;
      const dataSizeMB = (dataSizeBytes / (1024 * 1024)).toFixed(2);
      const dataURLCount = countEmbeddedDataUrls(projectData);
      console.log('[Firestore] Dati progetto preparati:', { projectName, dataSize: jsonString.length, dataSizeBytes, dataSizeMB: `${dataSizeMB} MB`, dataURLCount });

      if (dataURLCount > 0) {
        const errorMsg = `Salvataggio Firestore bloccato: ${dataURLCount} asset ancora in base64 (data:…). Carica tutti gli asset su storage prima di salvare.`;
        console.error('[Firestore] ❌', errorMsg);
        addDebugMessage(errorMsg, 'error');
        throw new Error(errorMsg);
      }
      
      // Firestore ha un limite di 1MB per campo
      const FIRESTORE_MAX_SIZE = 1048487; // ~1MB in bytes
      if (dataSizeBytes > FIRESTORE_MAX_SIZE) {
        const errorMsg = `Project is too large (${dataSizeMB} MB) to save to Firestore (limit: 1MB). Consider reducing the number of frames or splitting the project.`;
        console.error('[Firestore] ❌', errorMsg);
        addDebugMessage(errorMsg, 'error');
        throw new Error(errorMsg);
      }

      // Struttura dati Firestore: users/{userId}/projects/{projectId}
      const projectRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId);

      console.log('[Firestore] Reference creata:', projectRef.path);

      // Verifica se il documento esiste già per preservare createdAt
      const docSnapshot = await projectRef.get();
      const documentExists = docSnapshot.exists;
      
      // Prepara i dati da salvare
      const firestoreData = {
        name: projectName,
        projectData: jsonString, // Salva come stringa JSON per evitare limiti di profondità Firestore
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Aggiungi createdAt solo se il documento non esiste
      if (!documentExists) {
        firestoreData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        console.log('[Firestore] Creazione nuovo documento');
      } else {
        console.log('[Firestore] Aggiornamento documento esistente');
      }

      console.log('[Firestore] 🔄 Tentativo scrittura su Firestore...');
      
      // Usa set con merge per creare o aggiornare
      await projectRef.set(firestoreData, { merge: true });

      console.log(`[Firestore] ✅ Progetto salvato con successo: ${projectName} (${projectId})`);
      console.log(`[Firestore] 📊 Dettagli salvataggio:`, {
        projectId,
        projectName,
        dataSize: `${dataSizeMB} MB`,
        documentExists: documentExists ? 'aggiornato' : 'creato'
      });
      addDebugMessage(`[Firestore] Project saved: ${projectName}`, 'success');
      
      // Aggiorna i counter dopo salvataggio progetto
      if (typeof updateProjectSizeIndicator === 'function') {
        updateProjectSizeIndicator();
      }
      
      return true;
    } catch (error) {
      console.error('[Firestore] ❌ Errore durante il salvataggio:', error);
      console.error('[Firestore] Dettagli errore:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      addDebugMessage(`[Firestore] Save error: ${error.message || error} (${error.code || 'unknown'})`, 'error');
      return false;
    }
  }

  /**
   * Carica un progetto da Firestore
   * @param {string} userId - ID utente (uid di Firebase)
   * @param {string} projectId - ID progetto
   * @returns {Promise<Object|null>} - Oggetto progetto o null se non trovato/errore
   * 
   * AGGIUNTO: Questa funzione per caricare da Firestore
   */
  async function loadProjectFromFirestore(userId, projectId) {
    try {
      console.log('[Firestore] Tentativo caricamento progetto...', { userId, projectId });
      
      // Verifica che Firestore sia disponibile
      if (!window.firebaseDB) {
        console.warn('[Firestore] Firestore non disponibile');
        return null;
      }

      // Verifica che userId e projectId siano validi
      if (!userId || !projectId) {
        console.error('[Firestore] userId o projectId mancanti', { userId, projectId });
        return null;
      }

      // Verifica che l'utente sia autenticato (per le regole di sicurezza)
      if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        console.warn('[Firestore] Utente non autenticato - impossibile caricare da Firestore');
        return null;
      }

      const currentAuthUid = window.firebaseAuth.currentUser.uid;
      if (currentAuthUid !== userId) {
        console.error('[Firestore] userId non corrisponde a utente autenticato', {
          userId,
          currentAuthUid
        });
        return null;
      }

      console.log('[Firestore] Verifiche superate, accesso a Firestore...');

      const projectRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId);

      console.log('[Firestore] Reference creata:', projectRef.path);

      const doc = await projectRef.get();

      if (!doc.exists) {
        console.log(`[Firestore] Progetto non trovato: ${projectId}`);
        return null;
      }

      const data = doc.data();
      if (!data || !data.projectData) {
        console.error('[Firestore] Dati progetto non validi');
        return null;
      }

      // Parse del JSON salvato
      const projectObj = JSON.parse(data.projectData);
      console.log(`[Firestore] ✅ Progetto caricato con successo: ${data.name || projectId}`);
      addDebugMessage(`[Firestore] Project loaded: ${data.name || projectId}`, 'success');
      return projectObj;
    } catch (error) {
      console.error('[Firestore] ❌ Errore durante il caricamento:', error);
      console.error('[Firestore] Dettagli errore:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      addDebugMessage(`[Firestore] Load error: ${error.message || error} (${error.code || 'unknown'})`, 'error');
      return null;
    }
  }

  /**
   * Test connessione Firestore - funzione di debug
   * AGGIUNTO: Funzione per testare se Firestore funziona correttamente
   */
  window.testFirestoreConnection = async function() {
    console.log('=== TEST CONNESSIONE FIRESTORE ===');
    
    // 1. Verifica Firestore disponibile
    if (!window.firebaseDB) {
      console.error('❌ window.firebaseDB non disponibile');
      addDebugMessage('❌ Firestore unavailable', 'error');
      return false;
    }
    console.log('✅ window.firebaseDB disponibile');
    
    // 2. Verifica utente autenticato
    if (!currentUser || !currentUser.uid) {
      console.error('❌ Utente non autenticato o uid mancante');
      addDebugMessage('❌ User not authenticated', 'error');
      return false;
    }
    console.log('✅ Utente autenticato:', currentUser.uid);
    
    // 3. Test scrittura
    try {
      const testRef = window.firebaseDB
        .collection('users')
        .doc(currentUser.uid)
        .collection('projects')
        .doc('_test_connection');
      
      const testData = {
        name: 'Test Connection',
        projectData: '{"test": true}',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      console.log('🔄 Tentativo scrittura test...');
      await testRef.set(testData);
      console.log('✅ Scrittura test riuscita!');
      
      // 4. Test lettura
      console.log('🔄 Tentativo lettura test...');
      const doc = await testRef.get();
      if (doc.exists) {
        console.log('✅ Lettura test riuscita!', doc.data());
        addDebugMessage('✅ Test Firestore: connessione OK', 'success');
        
        // Pulisci documento di test
        await testRef.delete();
        console.log('🧹 Documento di test eliminato');
        return true;
      } else {
        console.error('❌ Documento test non trovato dopo scrittura');
        return false;
      }
    } catch (error) {
      console.error('❌ Errore durante test:', error);
      console.error('Dettagli:', {
        code: error.code,
        message: error.message
      });
      addDebugMessage(`❌ Firestore test failed: ${error.message} (${error.code})`, 'error');
      return false;
    }
  };

  /**
   * Lista tutti i progetti di un utente da Firestore
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<Array>} - Array di progetti con metadata
   * 
   * AGGIUNTO: Questa funzione per listare progetti da Firestore
   * TODO: Integrare questa funzione nella UI di selezione progetti
   */
  /**
   * Lista progetti da Firestore
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<Array>} - Array di progetti caricati da Firestore
   * @throws {Error} - Lancia errori invece di ritornare array vuoto
   */
  async function listProjectsFromFirestore(userId) {
    if (!window.firebaseDB) {
      const error = new Error('Firestore database not available');
      console.error('[Firestore] listProjectsFromFirestore error:', error);
      throw error;
    }

    if (!userId) {
      const error = new Error('User ID is required');
      console.error('[Firestore] listProjectsFromFirestore error:', error);
      throw error;
    }

    // Verifica che l'utente sia autenticato
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
      const error = new Error('User not authenticated');
      console.error('[Firestore] listProjectsFromFirestore error:', error);
      throw error;
    }

    const currentAuthUid = window.firebaseAuth.currentUser.uid;
    if (currentAuthUid !== userId) {
      const error = new Error(`User ID mismatch: expected ${userId}, got ${currentAuthUid}`);
      console.error('[Firestore] listProjectsFromFirestore error:', error);
      throw error;
    }

    try {
      const projectsRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects');

      const projects = [];
      let lastDoc = null;
      let hasMore = true;
      const batchSize = 100; // Firestore default limit

      // Implementa paginazione per recuperare TUTTI i progetti
      // Usa documentId come campo di ordinamento (sempre disponibile)
      try {
        const firebaseObj = window.firebase || firebase;
        const FieldPath = firebaseObj.firestore.FieldPath;
        
        while (hasMore) {
          let query = projectsRef.orderBy(FieldPath.documentId()).limit(batchSize);
          
          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }

          const snapshot = await query.get();
          
          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          snapshot.forEach(doc => {
            const data = doc.data();
            projects.push({
              id: doc.id,
              name: data.name || doc.id,
              updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
              createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
            });
          });

          // Se abbiamo meno documenti del batch size, non ci sono più documenti
          if (snapshot.size < batchSize) {
            hasMore = false;
          } else {
            // Prendi l'ultimo documento per la prossima query
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
          }
        }
      } catch (orderByError) {
        // Fallback: se orderBy fallisce, prova una query semplice
        console.warn('[Firestore] Errore con orderBy, uso query semplice:', orderByError);
        const snapshot = await projectsRef.get();
        snapshot.forEach(doc => {
          const data = doc.data();
          projects.push({
            id: doc.id,
            name: data.name || doc.id,
            updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
            createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
          });
        });
      }

      console.log(`[Firestore] Recuperati ${projects.length} progetti totali con paginazione`);
      return projects;
    } catch (error) {
      // Distingui tra errori di permesso e altri errori
      if (error.code === 'permission-denied') {
        console.error('[Firestore] Permission denied error:', error);
        console.error('[Firestore] Check Firestore security rules for user:', userId);
        const permissionError = new Error(`Permission denied: ${error.message}`);
        permissionError.code = 'permission-denied';
        throw permissionError;
      }
      
      if (error.code === 'unavailable' || error.message?.includes('network') || error.message?.includes('Network')) {
        console.error('[Firestore] Network error:', error);
        const networkError = new Error(`Network error: ${error.message}`);
        networkError.code = 'network-error';
        throw networkError;
      }

      console.error('[Firestore] Unexpected error during listing:', error);
      throw error;
    }
  }

  /**
   * Normalizza un progetto per garantire struttura coerente
   * @param {Object} project - Progetto da normalizzare
   * @param {number} index - Indice opzionale per progetti senza nome
   * @returns {Object} - Progetto normalizzato
   */
  function normalizeProject(project, index = null) {
    if (!project || typeof project !== 'object') {
      return {
        settings: { name: `Project ${index !== null ? index + 1 : 'Unknown'}` },
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        source: 'unknown'
      };
    }

    return {
      settings: project.settings || { name: project.name || `Project ${index !== null ? index + 1 : 'Unknown'}` },
      updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
      createdAt: project.createdAt || project.updatedAt || new Date().toISOString(),
      source: project.source || 'unknown',
      id: project.id || null
    };
  }

  /**
   * Carica progetti dalla cache localStorage
   * @param {string} username - Username dell'utente
   * @returns {Array} - Array di progetti normalizzati o array vuoto
   */
  function loadProjectsFromCache(username) {
    if (!username) {
      console.warn('[Cache] Username non disponibile per caricamento cache');
      return [];
    }

    try {
      const cacheKey = `amiantoProjects_${username}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (!cachedData) {
        console.log('[Cache] Nessun dato in cache');
        return [];
      }

      const projects = JSON.parse(cachedData);
      
      if (!Array.isArray(projects)) {
        console.error('[Cache] Dati cache non sono un array:', typeof projects);
        return [];
      }

      // Normalizza tutti i progetti
      const normalizedProjects = projects.map((p, i) => normalizeProject(p, i));
      console.log('[Cache] ✅ Caricati', normalizedProjects.length, 'progetti dalla cache');
      return normalizedProjects;
    } catch (error) {
      console.error('[Cache] ❌ Errore parsing cache:', error);
      return [];
    }
  }

  /**
   * Salva progetti in cache localStorage
   * @param {string} username - Username dell'utente
   * @param {Array} projects - Array di progetti da salvare
   */
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
      const cacheKey = `amiantoProjects_${username}`;
      localStorage.setItem(cacheKey, JSON.stringify(projects));
      console.log('[Cache] ✅ Salvati', projects.length, 'progetti in cache');
    } catch (error) {
      console.error('[Cache] ❌ Errore salvataggio cache:', error);
    }
  }

  /**
   * FUNZIONE PRINCIPALE: Ottiene progetti per la UI
   * Questa è l'UNICA funzione che la UI deve usare per ottenere progetti
   * Gestisce internamente cache e fallback
   * 
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<Array>} - Array di progetti normalizzati (sempre un array, anche vuoto)
   */
  async function getProjectsForUI(userId) {
    if (!userId) {
      console.error('[getProjectsForUI] userId mancante');
      return [];
    }

    if (!currentUser || !currentUser.username) {
      console.error('[getProjectsForUI] currentUser non disponibile');
      return [];
    }

    const username = currentUser.username;

    // STEP 1: Verifica se la cache esiste ed è valida
    const cachedProjects = loadProjectsFromCache(username);
    
    // Se la cache esiste e ha progetti, usala immediatamente
    // (ma aggiorna in background se possibile)
    if (cachedProjects.length > 0) {
      console.log('[getProjectsForUI] Cache trovata con', cachedProjects.length, 'progetti');
      
      // Prova ad aggiornare in background (non blocca il ritorno)
      loadProjectsDirectlyFromFirestore(userId)
        .then(firestoreProjects => {
          if (Array.isArray(firestoreProjects) && firestoreProjects.length > 0) {
            const normalized = firestoreProjects.map((p, i) => normalizeProject(p, i));
            saveProjectsToCache(username, normalized);
            console.log('[getProjectsForUI] Cache aggiornata in background');
          }
        })
        .catch(error => {
          console.warn('[getProjectsForUI] Errore aggiornamento background (non critico):', error);
        });
      
      return cachedProjects;
    }

    // STEP 2: Cache vuota o non valida, carica da Firestore
    console.log('[getProjectsForUI] Cache vuota o non valida, caricamento da Firestore...');
    
    try {
      const firestoreProjects = await loadProjectsDirectlyFromFirestore(userId);
      
      if (!Array.isArray(firestoreProjects)) {
        console.error('[getProjectsForUI] Firestore ha restituito dati non-array');
        return [];
      }

      // Normalizza progetti
      const normalizedProjects = firestoreProjects.map((p, i) => normalizeProject(p, i));
      
      // Salva in cache
      saveProjectsToCache(username, normalizedProjects);
      
      console.log('[getProjectsForUI] ✅ Caricati', normalizedProjects.length, 'progetti da Firestore');
      return normalizedProjects;
    } catch (error) {
      console.error('[getProjectsForUI] ❌ Errore caricamento da Firestore:', error);
      
      // Distingui errori critici
      if (error.code === 'permission-denied') {
        console.error('[getProjectsForUI] Permission denied - verifica regole Firestore per utente:', userId);
      } else if (error.code === 'network-error') {
        console.error('[getProjectsForUI] Network error - verifica connessione');
      }
      
      // Ritorna array vuoto invece di lanciare errore
      // La UI può gestire lista vuota mostrando messaggio appropriato
      return [];
    }
  }

  /**
   * Carica e renderizza progetti sempre da Firestore (NO cache) nella tab Projects
   * Questa funzione viene chiamata quando si entra nella tab Projects
   */
  async function loadAndRenderProjectsTab() {
    const container = document.getElementById('projects-list-container');
    const currentProjectInfo = document.getElementById('current-project-info');
    const currentProjectName = document.getElementById('current-project-name');
    const currentProjectUpdated = document.getElementById('current-project-updated');
    
    if (!container) {
      console.error('[ProjectsTab] Container not found');
      return;
    }
    
    // Mostra loading
    container.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="text-muted mt-3">Loading projects from Firestore...</p>
      </div>
    `;
    
    try {
      // Usa AppState.user come fonte primaria, fallback a currentUser, poi a firebaseAuth
      let userId = null;
      let username = null;
      
      console.log('[ProjectsTab] Verifica utente:', {
        appStateUser: AppState.user,
        currentUser: currentUser,
        firebaseAuth: !!window.firebaseAuth,
        firebaseAuthCurrentUser: window.firebaseAuth?.currentUser
      });
      
      if (AppState.user && AppState.user.uid) {
        userId = AppState.user.uid;
        username = AppState.user.username;
        console.log('[ProjectsTab] Usando AppState.user:', userId);
      } else if (currentUser && currentUser.uid) {
        userId = currentUser.uid;
        username = currentUser.username;
        console.log('[ProjectsTab] Usando currentUser:', userId);
      } else if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        const fbUser = window.firebaseAuth.currentUser;
        userId = fbUser.uid;
        username = (fbUser.email || '').split('@')[0] || `user_${fbUser.uid.substring(0, 6)}`;
        console.log('[ProjectsTab] Usando firebaseAuth.currentUser:', userId);
      }
      
      if (!userId) {
        console.warn('[ProjectsTab] Nessun utente trovato');
        container.innerHTML = `
          <div class="alert alert-warning" role="alert">
            <strong>Please login to view projects</strong><br>
            <small>No authenticated user found. Please refresh the page or login again.</small>
          </div>
        `;
        return;
      }
      
      console.log('[ProjectsTab] Caricamento progetti per userId:', userId);
      
      // Carica SEMPRE direttamente da Firestore (no cache)
      const projects = await loadProjectsDirectlyFromFirestore(userId);
      
      // Renderizza lista progetti
      renderProjectsListInTab(projects, container);
      
      // Aggiorna info progetto corrente
      const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (activeProjectName && currentProjectInfo && currentProjectName && currentProjectUpdated) {
        const project = projects.find(p => {
          const name = (p && p.settings && p.settings.name) ? p.settings.name : '';
          return name === activeProjectName;
        });
        
        if (project) {
          currentProjectName.textContent = activeProjectName;
          const updated = project.updatedAt || project.createdAt || '';
          if (updated) {
            const updatedDate = new Date(updated);
            currentProjectUpdated.textContent = `Last updated: ${updatedDate.toLocaleString()}`;
          } else {
            currentProjectUpdated.textContent = '';
          }
          currentProjectInfo.style.display = 'block';
          
          // Abilita altre tab
          enableOtherTabs(true);
        } else {
          currentProjectInfo.style.display = 'none';
          enableOtherTabs(false);
        }
      } else {
        if (currentProjectInfo) currentProjectInfo.style.display = 'none';
        enableOtherTabs(false);
      }
      
    } catch (error) {
      console.error('[ProjectsTab] Errore caricamento progetti:', error);
      container.innerHTML = `
        <div class="alert alert-danger" role="alert">
          <strong>Error loading projects:</strong><br>
          ${error.message || error}
          ${error.code ? ` (${error.code})` : ''}
        </div>
      `;
      enableOtherTabs(false);
    }
  }
  
  // WeakMap per memorizzare gli event handler dei container (evita memory leak)
  const containerHandlers = new WeakMap();
  
  /**
   * Renderizza lista progetti nella tab Projects
   */
  function renderProjectsListInTab(projects, container) {
    if (!container) return;
    
    const hasProjects = Array.isArray(projects) && projects.length > 0;
    
    if (hasProjects) {
      const projectsHtml = projects.map((p) => {
        const normalized = normalizeProject(p);
        const name = normalized.settings.name;
        const updated = normalized.updatedAt || normalized.createdAt || '';
        const updatedShort = updated ? new Date(updated).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '';
        
        const isActive = name === localStorage.getItem('amiantoActiveProjectName');
        
        return `
          <div class="list-group-item bg-secondary text-light mb-2 ${isActive ? 'border border-success' : ''}" data-project-name="${name}">
            <div class="d-flex justify-content-between align-items-start">
              <div class="flex-grow-1">
                <strong>${name}</strong>
                ${isActive ? ' <span class="badge bg-success">Active</span>' : ''}
                ${updatedShort ? `<br><small class="text-muted">Updated: ${updatedShort}</small>` : ''}
              </div>
              <div class="btn-group btn-group-sm ms-2">
                <button class="btn btn-success" data-action="open" data-project-name="${name}" ${isActive ? 'disabled' : ''}>
                  <i class="fas fa-folder-open"></i> ${isActive ? 'Active' : 'Open'}
                </button>
                <button class="btn btn-outline-danger" data-action="delete" data-project-name="${name}">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = `
        <div class="list-group">
          ${projectsHtml}
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="text-center py-4">
          <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
          <p class="text-muted">You don't have any projects yet. Create your first project to get started!</p>
        </div>
      `;
    }
    
    // Aggiungi event listeners ai pulsanti usando delegazione eventi (più efficiente e evita duplicati)
    // Rimuovi listener precedenti se esistono
    const existingHandler = containerHandlers.get(container);
    if (existingHandler) {
      container.removeEventListener('click', existingHandler);
    }
    
    const clickHandler = async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const projectName = btn.getAttribute('data-project-name');
        
      if (action === 'open' && projectName) {
        try {
          showNotification(`Loading project "${projectName}"...`, 'info');
          await openProjectByName(projectName);
          // Ricarica la lista dopo apertura
          await loadAndRenderProjectsTab();
          showNotification(`Project "${projectName}" opened successfully!`, 'success');
        } catch (error) {
          console.error('[ProjectsTab] Errore apertura progetto:', error);
          showNotification('Error opening project', 'error');
        }
      } else if (action === 'delete' && projectName) {
        if (confirm(`Delete project "${projectName}"? This action cannot be undone.`)) {
          try {
            await deleteProjectByName(projectName);
            // Ricarica la lista dopo eliminazione
            await loadAndRenderProjectsTab();
            showNotification(`Project "${projectName}" deleted`, 'info');
          } catch (error) {
            console.error('[ProjectsTab] Errore eliminazione progetto:', error);
            showNotification('Error deleting project', 'error');
          }
        }
      }
    };
    
    container.addEventListener('click', clickHandler);
    containerHandlers.set(container, clickHandler);
  }
  
  /**
   * Abilita/disabilita altre tab (tutte tranne Projects)
   */
  function enableOtherTabs(enabled) {
    const tabsToDisable = ['resources', 'rooms', 'inventory', 'characters', 'gui', 'scripts', 'play'];
    tabsToDisable.forEach(tabId => {
      const button = document.querySelector(`[data-section="${tabId}"]`);
      if (button) {
        button.disabled = !enabled;
        if (!enabled) {
          button.classList.add('disabled');
        } else {
          button.classList.remove('disabled');
        }
      }
    });
  }

  /**
   * Renderizza la lista progetti nel container specificato
   * @param {Array} projects - Array di progetti normalizzati
   * @param {HTMLElement} container - Container dove renderizzare (es. modal-body)
   */
  function renderProjectsList(projects, container) {
    if (!container) {
      console.error('[renderProjectsList] Container non fornito');
      return;
    }

    if (!Array.isArray(projects)) {
      console.error('[renderProjectsList] projects non è un array');
      projects = [];
    }

    const hasProjects = projects.length > 0;
    
    // Costruisci HTML progetti
    let projectsHtml = '';
    if (hasProjects) {
      projectsHtml = projects.map((p, i) => {
        const normalized = normalizeProject(p, i);
        const name = normalized.settings.name;
        const updated = normalized.updatedAt || normalized.createdAt || '';
        const updatedShort = updated ? new Date(updated).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '';
        
        return `
          <li class="list-group-item bg-secondary text-light d-flex justify-content-between align-items-center project-item" data-project-name="${name}">
            <div class="flex-grow-1">
              <strong>${name}</strong>
              ${updatedShort ? `<br><small class="text-muted">Updated: ${updatedShort}</small>` : ''}
            </div>
            <button class="btn btn-success btn-sm ms-2" data-action="open" data-project-name="${name}">
              <i class="fas fa-folder-open"></i> Open
            </button>
          </li>
        `;
      }).join('');
    }

    // Aggiorna contenuto container
    container.innerHTML = `
      ${hasProjects ? `
        <div class="mb-3">
          <p class="text-muted">Select an existing project or create a new one:</p>
        </div>
        <div class="mb-3" style="max-height: 400px; overflow-y: auto;">
          <ul class="list-group">
            ${projectsHtml}
          </ul>
        </div>
      ` : `
        <div class="text-center py-4">
          <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
          <p class="text-muted">You don't have any projects yet. Create your first project to get started!</p>
        </div>
      `}
      <div class="d-grid gap-2">
        <button class="btn btn-primary btn-lg" id="btn-create-new-project">
          <i class="fas fa-plus"></i> Create New Project
        </button>
      </div>
    `;

    console.log('[renderProjectsList] ✅ Lista renderizzata con', projects.length, 'progetti');
  }

  /**
   * Carica direttamente i progetti da Firestore (solo metadata, senza dipendere da localStorage)
   * Questa funzione è ottimale per PC nuovi senza cache, garantisce sempre dati aggiornati
   * 
   * RIFATTORIZZATA: Ora è una funzione pura che SOLO legge da Firestore
   * Nessun accesso a DOM o localStorage
   * 
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<Array>} - Array di progetti con metadata normalizzati
   * @throws {Error} - Lancia errori invece di ritornare array vuoto
   */
  async function loadProjectsDirectlyFromFirestore(userId) {
    if (!window.firebaseDB) {
      const error = new Error('Firestore database not available');
      console.error('[FirestoreDirect] loadProjectsDirectlyFromFirestore error:', error);
      throw error;
    }

    if (!userId) {
      const error = new Error('User ID is required');
      console.error('[FirestoreDirect] loadProjectsDirectlyFromFirestore error:', error);
      throw error;
    }

    // Verifica che l'utente sia autenticato
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
      const error = new Error('User not authenticated');
      console.error('[FirestoreDirect] loadProjectsDirectlyFromFirestore error:', error);
      throw error;
    }

    const currentAuthUid = window.firebaseAuth.currentUser.uid;
    if (currentAuthUid !== userId) {
      const error = new Error(`User ID mismatch: expected ${userId}, got ${currentAuthUid}`);
      console.error('[FirestoreDirect] loadProjectsDirectlyFromFirestore error:', error);
      throw error;
    }

    try {
      console.log('[FirestoreDirect] Caricamento diretto progetti da Firestore...');
      
      // Lista progetti da Firestore (solo metadata, veloce)
      const firestoreProjects = await listProjectsFromFirestore(userId);
      console.log('[FirestoreDirect] Trovati', firestoreProjects.length, 'progetti su Firestore');
      
      // Normalizza progetti usando funzione centralizzata
      const projectsList = firestoreProjects.map((fp, i) => normalizeProject({
        settings: { name: fp.name },
        updatedAt: fp.updatedAt || null,
        createdAt: fp.createdAt || null,
        source: 'firestore',
        id: fp.id
      }, i));
      
      console.log('[FirestoreDirect] ✅ Lista progetti caricata direttamente da Firestore:', projectsList.length);
      return projectsList;
    } catch (error) {
      // Distingui tra errori di permesso e altri errori
      if (error.code === 'permission-denied') {
        console.error('[FirestoreDirect] Permission denied error:', error);
        const permissionError = new Error(`Permission denied: ${error.message}`);
        permissionError.code = 'permission-denied';
        throw permissionError;
      }
      
      if (error.code === 'unavailable' || error.message?.includes('network') || error.message?.includes('Network')) {
        console.error('[FirestoreDirect] Network error:', error);
        const networkError = new Error(`Network error: ${error.message}`);
        networkError.code = 'network-error';
        throw networkError;
      }

      console.error('[FirestoreDirect] Unexpected error:', error);
      throw error;
    }
  }

  /**
   * Sincronizza progetti da Firestore a localStorage (solo background)
   * 
   * RIFATTORIZZATA: Questa funzione serve SOLO per aggiornare la cache in background
   * NON deve essere usata per il rendering UI - usa getProjectsForUI() invece
   * 
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<void>} - Non restituisce dati per la UI
   * @throws {Error} - Lancia errori in caso di fallimento critico
   */
  async function syncProjectsFromFirestore(userId) {
    if (!currentUser || !currentUser.username) {
      const error = new Error('Current user not available');
      console.error('[Sync] syncProjectsFromFirestore error:', error);
      throw error;
    }

    const username = currentUser.username;
    console.log('[Sync] Inizio sincronizzazione progetti da Firestore...', { userId, username });

    // Carica lista progetti da Firestore
    const firestoreProjects = await listProjectsFromFirestore(userId);
    console.log('[Sync] Progetti trovati su Firestore:', firestoreProjects.length);

    // Carica progetti locali esistenti usando funzione centralizzata
    const localProjects = loadProjectsFromCache(username);
    console.log('[Sync] Progetti locali esistenti:', localProjects.length);

    // Crea una mappa dei progetti locali per confronto rapido
    const localProjectsMap = new Map();
    localProjects.forEach((p, i) => {
      const normalized = normalizeProject(p, i);
      if (normalized.settings && normalized.settings.name) {
        const projectId = normalized.settings.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        localProjectsMap.set(projectId, normalized);
      }
    });

    // Sincronizza ogni progetto da Firestore
    const syncedProjects = [];
    let syncedCount = 0;
    let newCount = 0;
    let updatedCount = 0;

    for (const firestoreProject of firestoreProjects) {
      try {
        const projectId = firestoreProject.id;
        const projectName = firestoreProject.name;

        // Carica i dati completi del progetto da Firestore
        const projectData = await loadProjectFromFirestore(userId, projectId);
        
        if (!projectData) {
          console.warn(`[Sync] Impossibile caricare dati completi per progetto: ${projectName}`);
          continue;
        }

        // Normalizza progetto usando funzione centralizzata
        const projectEntry = normalizeProject({
          settings: projectData.settings || { name: projectName },
          updatedAt: firestoreProject.updatedAt || null,
          createdAt: firestoreProject.createdAt || null,
          source: 'firestore',
          id: projectId
        });

        // Controlla se il progetto esiste già localmente
        const localProject = localProjectsMap.get(projectId);
        
        if (localProject) {
          // Progetto esiste localmente: confronta timestamp e mantieni il più recente
          const localUpdated = localProject.updatedAt ? new Date(localProject.updatedAt).getTime() : 0;
          const firestoreUpdated = projectEntry.updatedAt ? new Date(projectEntry.updatedAt).getTime() : 0;
          
          if (firestoreUpdated >= localUpdated) {
            // Firestore è più recente o uguale: usa Firestore
            syncedProjects.push(projectEntry);
            updatedCount++;
            
            // Salva anche il JSON completo in cache locale
            const jsonString = JSON.stringify(projectData);
            const projectKey = `amiantoProject_${username}:${projectName}`;
            localStorage.setItem(projectKey, jsonString);
            
            console.log(`[Sync] Progetto aggiornato da Firestore: ${projectName}`);
          } else {
            // Locale è più recente: mantieni locale
            syncedProjects.push(localProject);
            console.log(`[Sync] Progetto locale più recente mantenuto: ${projectName}`);
          }
        } else {
          // Nuovo progetto da Firestore
          syncedProjects.push(projectEntry);
          newCount++;
          
          // Salva il JSON completo in cache locale
          const jsonString = JSON.stringify(projectData);
          const projectKey = `amiantoProject_${username}:${projectName}`;
          localStorage.setItem(projectKey, jsonString);
          
          console.log(`[Sync] Nuovo progetto sincronizzato da Firestore: ${projectName}`);
        }

        syncedCount++;
      } catch (error) {
        console.error(`[Sync] Errore sincronizzazione progetto ${firestoreProject.name}:`, error);
        // Continua con gli altri progetti anche se uno fallisce
      }
    }

    // Aggiungi progetti locali che non sono su Firestore (mantieni backup locale)
    localProjects.forEach((localProject, i) => {
      const normalized = normalizeProject(localProject, i);
      if (normalized.settings && normalized.settings.name) {
        const projectId = normalized.settings.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        const existsInFirestore = firestoreProjects.some(fp => {
          const fpId = fp.id || fp.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
          return fpId === projectId;
        });
        
        if (!existsInFirestore) {
          // Progetto locale non su Firestore: mantienilo (potrebbe essere non ancora sincronizzato)
          syncedProjects.push(normalized);
          console.log(`[Sync] Progetto locale mantenuto (non su Firestore): ${normalized.settings.name}`);
        }
      }
    });

    // Salva lista sincronizzata usando funzione centralizzata
    saveProjectsToCache(username, syncedProjects);

    console.log(`[Sync] ✅ Sincronizzazione completata: ${syncedCount} progetti sincronizzati (${newCount} nuovi, ${updatedCount} aggiornati)`);
    addDebugMessage(`Sincronizzati ${syncedCount} progetti da Firestore`, 'success');
    
    // IMPORTANTE: Questa funzione NON restituisce dati per la UI
    // Usa getProjectsForUI() per ottenere progetti per il rendering
  }

  /**
   * Autosave su cache locale (localStorage) come fallback temporaneo
   * @param {string} projectName - Nome del progetto
   * @param {string} jsonString - JSON serializzato del progetto
   * 
   * GIÀ IMPLEMENTATO: localStorage è già usato per cache
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

  // Save current project for current user
  // MODIFICATO: Ora salva anche su Firestore oltre a localStorage/OPFS
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
   * Raccoglie tutti gli asset dal progetto che sono ancora dataURL e li carica su Supabase
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
      // Se è già un assetId (prefisso "asset:"), salta
      if (typeof assetValue === 'string' && assetValue.startsWith('asset:')) {
        return assetValue;
      }
      
      // Se è un oggetto Image, convertilo prima in dataURL
      let dataURL = null;
      if (assetValue && typeof assetValue === 'object' && (assetValue.src || (assetValue.width && assetValue.height))) {
        // È un oggetto Image, convertilo in dataURL
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
      } else if (assetValue === null || assetValue === undefined) {
        // Valore null/undefined, mantieni così
        return assetValue;
      } else {
        // Non è né un assetId, né un dataURL, né un Image - potrebbe essere un valore non-immagine
        // Verifica se è un oggetto con proprietà img (come i frame dei character)
        if (assetValue && typeof assetValue === 'object' && assetValue.img) {
          // È un oggetto frame con proprietà img, processa l'immagine
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
          // Non è un asset immagine, mantieni come è
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

          // Se esiste già un assetId per questo asset, usalo
          // IMPORTANTE: Sovrascrivi solo se è un dataURL nuovo/modificato, non se è già un assetId
          const finalAssetId = existingAssetId || null;
          // Sovrascrivi solo se:
          // 1. È esplicitamente richiesto (overwrite=true)
          // 2. O se esiste già un assetId E il valore corrente è un dataURL (modificato)
          const shouldOverwrite = overwrite || (!!existingAssetId && dataURL && typeof assetValue === 'string' && assetValue.startsWith('data:image/'));

          const { assetId } = await uploadImage(file, projectId, assetType, { 
            assetId: finalAssetId, 
            overwriteExisting: shouldOverwrite,
            subfolder 
          });
          
          if (shouldOverwrite && existingAssetId) {
            console.log(`[Asset] ✅ Asset sovrascritto: ${assetName} -> asset:${assetId}${subfolder ? ` (in ${subfolder})` : ''}`);
          } else {
            console.log(`[Asset] ✅ Asset salvato: ${assetName} -> asset:${assetId}${subfolder ? ` (in ${subfolder})` : ''}`);
          }
          savedCount++;
          
          // Se è un character frame, traccia l'assetId per possibile cleanup se il salvataggio fallisce
          if (assetType === 'character' && assetId) {
            unsavedCharacterAssetIds.add(assetId);
            console.log(`[Asset] Frame character tracciato per cleanup (assetId: ${assetId})`);
          }
          
          return `asset:${assetId}`;
        } catch (error) {
          console.error(`[Asset] ❌ Errore salvataggio asset ${assetName}:`, error);
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
        // Se non esiste, significa che è stato eliminato e non dovremmo processare i suoi frame
        if (!characterFrames.has(characterName)) {
          console.warn(`[Asset] ⚠️ Character "${characterName}" non trovato in characterFrames, salto processamento frame (probabilmente eliminato)`);
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

    // Processa cursors
    if (updatedProject.cursors && Array.isArray(updatedProject.cursors)) {
      for (const cursor of updatedProject.cursors) {
        if (cursor.image) {
          cursor.image = await processAsset(cursor.image, 'cursor', `cursor_${cursor.id || 'unknown'}`);
        }
      }
    }

    console.log(`[Asset] 📊 Salvataggio asset completato: ${savedCount} salvati, ${errorCount} errori`);
    
    // Verifica finale: controlla che tutti gli asset siano stati salvati correttamente
    if (errorCount > 0) {
      console.warn(`[Asset] ⚠️ ${errorCount} asset non sono stati salvati correttamente. Verifica i log sopra per dettagli.`);
    } else {
      console.log(`[Asset] ✅ Tutti gli asset sono stati salvati con successo su Supabase`);
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
        
        // Se è un array, processa ogni elemento
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (item && typeof item === 'object') {
              // Se è un oggetto Image, processalo direttamente
              if (item.src || (item.width && item.height)) {
                console.log(`[Asset] 🔄 Conversione oggetto Image rimanente in ${currentPath}[${i}]`);
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
              console.log(`[Asset] 🔄 Conversione dataURL rimanente in ${currentPath}[${i}]`);
              const converted = await processAsset(item, 'unknown', `${currentPath}[${i}]`);
              if (converted && converted.startsWith('asset:')) {
                value[i] = converted;
                savedCount++;
              }
            }
          }
        } 
        // Se è un oggetto, verifica se è un oggetto Image
        else if (typeof value === 'object') {
          // Se è un oggetto Image, processalo direttamente
          if (value.src || (value.width && value.height)) {
            console.log(`[Asset] 🔄 Conversione oggetto Image rimanente in ${currentPath}`);
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
        // Se è una stringa dataURL, convertila
        else if (typeof value === 'string' && value.startsWith('data:image/')) {
          console.log(`[Asset] 🔄 Conversione dataURL rimanente in ${currentPath}`);
          const converted = await processAsset(value, 'unknown', currentPath);
          if (converted && converted.startsWith('asset:')) {
            obj[key] = converted;
            savedCount++;
          }
        }
      }
    };
    
    // Esegui la conversione finale su tutto il progetto
    console.log('[Asset] 🔍 Controllo finale per dataURL rimanenti...');
    await finalConversion(updatedProject, 'project');
    console.log(`[Asset] ✅ Controllo finale completato: ${savedCount} asset totali salvati, ${errorCount} errori`);
    
    return updatedProject;
  }

  window.saveCurrentProject = async function saveCurrentProject() {
    if (!currentUser) {
      showNotification('Please login to save projects', 'warning');
      return;
    }

    // Verifica che ci sia un progetto aperto
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProjectName) {
      showNotification('No project is currently open. Please open or create a project first.', 'warning');
      return;
    }

    let projectObj = window.serializeProject();
    const projectName = (projectObj.settings && projectObj.settings.name) ? String(projectObj.settings.name) : activeProjectName;
    
    // Verifica che il progetto serializzato corrisponda al progetto attivo
    if (projectName !== activeProjectName && projectName !== 'amianto-project') {
      showNotification('Project name mismatch. Please open the project you want to save.', 'warning');
      return;
    }
    
    // TODO: Implementare sistema di projectId univoci
    // Attualmente usa il nome del progetto normalizzato come ID temporaneo.
    // In futuro, generare ID univoci (UUID) e salvare mapping nome->ID in Firestore.
    const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
    
    // IMPORTANTE: Per Firestore dobbiamo usare SEMPRE uid (non username)
    // Le regole di sicurezza controllano request.auth.uid == userId
    const userId = currentUser.uid;
    if (!userId) {
      console.error('[Firestore] currentUser.uid non disponibile - impossibile salvare su Firestore');
      addDebugMessage('[Firestore] User not authenticated correctly', 'error');
      // Continua con cache locale come fallback
    }

    // 0. SALVA TUTTI GLI ASSET NON ANCORA CARICATI
    showNotification('Saving all assets to storage...', 'info');
    
    // DEBUG: Verifica foreground prima del salvataggio asset
    if (projectObj.rooms && Array.isArray(projectObj.rooms)) {
      projectObj.rooms.forEach(room => {
        if (Array.isArray(room.foregrounds)) {
          console.log(`[Save] Room ${room.id}: ${room.foregrounds.length} foreground prima del salvataggio asset`);
        }
      });
    }
    
    try {
      console.log('[Save] 🔄 Inizio salvataggio asset su Supabase...');
      projectObj = await saveAllAssetsToStorage(projectObj, projectId);
      console.log('[Save] ✅ Tutti gli asset salvati su Supabase');
      
      // Verifica che non ci siano più dataURL nel progetto (dovrebbero essere tutti convertiti in assetId)
      const projectJsonString = JSON.stringify(projectObj);
      const remainingDataURLs = (projectJsonString.match(/data:image\/[^;]+;base64,/g) || []).length;
      const assetIdCount = (projectJsonString.match(/asset:[^"]+/g) || []).length;
      
      console.log('[Save] 📊 Statistiche conversione asset:', {
        dataURLRimanenti: remainingDataURLs,
        assetIdTotali: assetIdCount,
        conversioneCompleta: remainingDataURLs === 0
      });
      
      if (remainingDataURLs > 0) {
        const warnMsg = `Salvataggio Firestore bloccato: ${remainingDataURLs} asset ancora in base64. Usa Save dopo aver caricato tutti gli asset su storage.`;
        console.warn(`[Save] ⚠️ ${warnMsg}`);
        addDebugMessage(warnMsg, 'error');
        showNotification(warnMsg, 'warning');
        const dataURLMatches = projectJsonString.match(/data:[^;]+;base64,[^"]+/g);
        if (dataURLMatches && dataURLMatches.length > 0) {
          console.warn('[Save] DataURL trovati (primi 100 caratteri):', dataURLMatches.slice(0, 3).map(url => url.substring(0, 100) + '...'));
        }
      } else {
        console.log('[Save] ✅ Nessun dataURL rimanente nel progetto - tutti gli asset sono stati convertiti in assetId');
      }
      
      // Dopo il salvataggio riuscito di tutti gli asset, pulisci i set dei frame non salvati
      // Tutti i frame che erano nel progetto sono stati salvati con successo
      unsavedCharacterFrames.clear();
      unsavedCharacterAssetIds.clear();
      // Rimuovi anche eventuali frame salvati in sessionStorage (da sessioni precedenti)
      sessionStorage.removeItem('amiantoUnsavedFramesToDelete');
      console.log('[Save] Set frame non salvati pulito (progetto salvato con successo)');
    } catch (error) {
      console.error('[Save] Errore salvataggio asset:', error);
      showNotification('Warning: Some assets could not be saved', 'warning');
      // Se il salvataggio fallisce, i frame rimangono in unsavedCharacterFrames per cleanup successivo
    }

    // DEBUG: Verifica foreground dopo il salvataggio asset e prima di Firestore
    if (projectObj.rooms && Array.isArray(projectObj.rooms)) {
      projectObj.rooms.forEach(room => {
        if (Array.isArray(room.foregrounds)) {
          console.log(`[Save] Room ${room.id}: ${room.foregrounds.length} foreground nel JSON da salvare su Firestore`, 
            room.foregrounds.map(f => ({ id: f.id, name: f.name, image: f.image ? f.image.substring(0, 50) + '...' : 'null' })));
        } else {
          console.warn(`[Save] ⚠️ Room ${room.id}: foregrounds non è un array!`, typeof room.foregrounds, room.foregrounds);
        }
      });
    }

    // 1. SALVATAGGIO FIRESTORE (fonte ufficiale) — payload slim, no base64
    let firestoreSuccess = false;
    const embeddedDataUrls = countEmbeddedDataUrls(projectObj);
    if (userId && embeddedDataUrls > 0) {
      console.warn(`[Save] Firestore saltato: ${embeddedDataUrls} dataURL nel progetto`);
    } else if (userId) {
      console.log('[Save] 🔄 Tentativo salvataggio su Firestore...', { userId, projectId, projectName });
      
      const firestorePayload = prepareProjectPayloadForFirestore(projectObj);
      const projectJsonPreview = JSON.stringify(firestorePayload);
      const projectSizeBytes = new Blob([projectJsonPreview]).size;
      const projectSizeMB = (projectSizeBytes / (1024 * 1024)).toFixed(2);
      console.log(`[Save] 📦 Dimensione payload Firestore: ${projectSizeMB} MB (${projectSizeBytes} bytes)`);
      
      firestoreSuccess = await saveProjectToFirestore(userId, projectId, firestorePayload);
      
      if (firestoreSuccess) {
        console.log('[Save] ✅ Salvataggio Firestore completato con successo');
      } else {
        console.warn('[Save] ⚠️ Salvataggio Firestore fallito, uso cache locale come fallback');
      }
    } else {
      console.warn('[Save] ⚠️ userId non disponibile, salto Firestore');
    }

    // 2. CACHE LOCALE (backup temporaneo) - GIÀ IMPLEMENTATO, ora centralizzato
    // Usa il progetto aggiornato con assetId invece di dataURL
    const jsonString = JSON.stringify(projectObj, null, 2);
    autosaveToCache(projectName, jsonString);

    // 3. MIRROR IN LOCALSTORAGE (usato dal runtime) - GIÀ IMPLEMENTATO
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);

    // 4. LIGHTWEIGHT ENTRY PER LISTING - Aggiorna cache usando funzione centralizzata
    const userProjects = loadProjectsFromCache(currentUser.username);
    const idx = userProjects.findIndex(p => p && p.settings && p.settings.name === projectName);
    const entry = normalizeProject({ 
      settings: projectObj.settings, 
      updatedAt: new Date().toISOString(),
      createdAt: projectObj.createdAt || new Date().toISOString(),
      source: firestoreSuccess ? 'firestore' : 'cache' // Traccia la fonte
    });
    if (idx >= 0) userProjects[idx] = entry; else userProjects.push(entry);
    saveProjectsToCache(currentUser.username, userProjects);

    // 5. STORE FULL JSON BACKUP LOCALE - GIÀ IMPLEMENTATO
    try {
      const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
      localStorage.setItem(projectKey, jsonString);
      localStorage.setItem('amiantoActiveProjectName', projectName);
      localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    } catch (_) {}

    // 6. PERSIST TO OPFS (silent) - GIÀ IMPLEMENTATO
    saveProjectJsonToOPFS(jsonString, projectName);

    // 7. OFFER FILE SAVE (may prompt user) - GIÀ IMPLEMENTATO
    // Nota: saveProjectJsonToFile apre un dialog, quindi non lo chiamiamo automaticamente
    // saveProjectJsonToFile(jsonString, projectName);

    // Messaggio di successo con indicazione della fonte
    if (firestoreSuccess) {
      showNotification('Project saved successfully to Firestore!', 'success');
    } else if (embeddedDataUrls > 0) {
      showNotification('Progetto salvato in locale; Firestore bloccato (converti gli asset base64).', 'warning');
    } else {
      showNotification('Project saved to cache (Firestore unavailable)', 'warning');
    }
    
    // Aggiorna indicatore dimensione progetto dopo il salvataggio
    updateProjectSizeIndicator();
  }

  // Create new project
  // MODIFICATO: Ora crea e apre il progetto nell'editor, e lo salva su Firestore
  window.createNewProject = async function(projectNameFromModal = null, showSuccessNotification = true) {
    if (!currentUser) {
      showNotification('Please login to create projects', 'warning');
      return;
    }

    // Blocca durante la sincronizzazione
    if (isSyncingProjects) {
      showNotification('Please wait for synchronization to complete before creating a project', 'warning');
      return;
    }

    // Se il nome progetto viene passato come parametro (dal modale), usalo
    // Altrimenti chiedi all'utente
    let projectName = projectNameFromModal;
    if (!projectName) {
      projectName = prompt('Enter project name:');
    }
    if (!projectName || !projectName.trim()) return;

    const trimmedName = projectName.trim();

    // Crea progetto completo con struttura corretta
    const newProject = {
      format: 'amianto-game',
      version: 1,
      meta: {
        exportedAt: new Date().toISOString(),
        editor: 'Amianto Editor',
        editorVersion: '0.1'
      },
      settings: {
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
          walkableArea: [],
          hotspots: []
        }
      ],
      guis: [],
      characters: [],
      inventory: [],
      scripts: {},
      attachments: {},
      cursors: [],
      variables: {
        definitions: [],
        state: {}
      },
      resourcesCatalog: [],
      eventConditions: {
        objects: {},
        hotspots: {},
        characters: {},
        guiButtons: {},
        inventory: {}
      }
    };

    // Apri il progetto nell'editor
    await applyProjectObject(newProject);

    // Imposta come progetto attivo
    localStorage.setItem('amiantoActiveProjectName', trimmedName);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    
    // Aggiorna indicatore dimensione progetto
    updateProjectSizeIndicator();

    // Aggiungi alla lista progetti utente usando funzione centralizzata
    const userProjects = loadProjectsFromCache(currentUser.username);
    const entry = normalizeProject({
      settings: newProject.settings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    userProjects.push(entry);
    saveProjectsToCache(currentUser.username, userProjects);

    // Salva su Firestore se l'utente è autenticato
    const userId = currentUser.uid;
    if (userId && window.firebaseDB) {
      const projectId = trimmedName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
      await saveProjectToFirestore(userId, projectId, newProject);
    }

    // Abilita altre tab ora che c'è un progetto aperto
    enableOtherTabs(true);
    
    // Mostra notifica solo se richiesto (non quando viene chiamato dal modale)
    if (showSuccessNotification) {
      showNotification(`Project "${trimmedName}" created and opened!`, 'success');
    }
  };

  // ================================
  // ASSET MANAGEMENT SYSTEM
  // ================================
  // 
  // Sistema completo per gestione asset (immagini) usando Firebase Storage
  // 
  // STRUTTURA STORAGE:
  // projects/{projectId}/images/filename.png
  // projects/{projectId}/gui/filename.png
  // projects/{projectId}/audio/filename.mp3
  // 
  // STRUTTURA FIRESTORE:
  // users/{userId}/projects/{projectId}/assets/{assetId}
  // {
  //   assetId: string,
  //   name: string,
  //   type: 'background' | 'foreground' | 'sprite' | 'gui' | 'character' | 'cursor',
  //   storagePath: string,
  //   projectId: string,
  //   createdAt: timestamp
  // }
  // 
  // NOTA: Le immagini NON vengono più salvate come base64 nel JSON del progetto.
  // Vengono salvati solo gli assetId che vengono poi risolti in URL da Firebase Storage.
  // 
  // STATO IMPLEMENTAZIONE:
  // ✅ IMPLEMENTATO:
  //   - Upload background images
  //   - Upload foreground layers
  //   - Upload scene objects (sprites)
  //   - Serializzazione con assetId
  //   - Caricamento e risoluzione assetId in URL
  //   - Gestione errori con fallback locale
  // 
  // ⚠️ TODO: not yet implemented:
  //   - Upload GUI background images
  //   - Upload GUI button background images
  //   - Upload character animation frames
  //   - Upload cursor images
  //   - Export progetti come ZIP con asset inclusi
  //   - Re-link asset in runtime.html per esecuzione jailed/iframe

  /**
   * Genera un assetId univoco
   * @returns {string} - ID univoco per l'asset
   */
  function generateAssetId() {
    return 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  /**
   * Determina la cartella Storage in base al tipo di asset
   * Mappatura per Supabase Storage: backgrounds, foregrounds, sprites, audio
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
      default:
        // Per categorie non riconosciute, usa la categoria stessa (normalizzata)
        return assetType ? assetType.toLowerCase() : 'sprites';
    }
  }

  /**
   * Carica un'immagine su Supabase Storage
   * 
   * FALLBACK: Se Supabase non è disponibile:
   * - Mostra errore chiaro all'utente
   * - Blocca l'upload del nuovo asset
   * - Non blocca il caricamento di asset esistenti (che hanno URL validi)
   * - Non blocca il salvataggio del progetto (gli asset già caricati hanno URL persistenti)
   * 
   * @param {File} file - File immagine da caricare
   * @param {string} projectId - ID del progetto
   * @param {string} assetType - Tipo di asset (background, foreground, sprite, gui, character, cursor, audio)
   * @param {string} assetId - ID univoco dell'asset (opzionale, generato se non fornito)
   * @returns {Promise<{assetId: string, storagePath: string, downloadURL: string, fileName: string}>} - Metadata dell'asset caricato
   */
  async function uploadImageToStorage(file, projectId, assetType, assetId = null, overwriteExisting = false, fileNameOverride = null, subfolder = null) {
    try {
      // Verifica che Supabase Storage sia disponibile
      if (!window.supabaseStorage || !window.supabaseStorage.isAvailable()) {
        const errorMsg = 'Supabase Storage non disponibile. Impossibile caricare asset. Verifica la configurazione SUPABASE_URL e SUPABASE_ANON_KEY in supabase.js';
        console.error('[Asset] ❌', errorMsg);
        
        // Mostra notifica all'utente
        if (typeof showNotification === 'function') {
          showNotification(errorMsg, 'error');
        }
        
        throw new Error(errorMsg);
      }

      // Genera assetId se non fornito
      if (!assetId) {
        assetId = generateAssetId();
      }

      let forcedFileName = fileNameOverride;
      if (!forcedFileName && overwriteExisting && assetId) {
        const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
        forcedFileName = `${assetId}.${(ext || 'png').toLowerCase()}`;
      }

      // Determina categoria (backgrounds, foregrounds, sprites, audio)
      const category = getStorageFolderForType(assetType);
      
      console.log('[Asset] Upload immagine su Supabase...', { projectId, category, assetType, assetId, subfolder });

      // Usa la funzione uploadAsset da supabase.js
      const result = await window.supabaseStorage.uploadAsset(file, projectId, category, assetId, overwriteExisting, forcedFileName, subfolder);
      
      // Costruisci storagePath per compatibilità con il resto del codice
      // Usa il fileName generato da Supabase (include assetId)
      const generatedFileName = result.fileName || forcedFileName || result.url.split('/').pop().split('?')[0];
      const actualFolder = subfolder || category;
      const storagePath = `${projectId}/${actualFolder}/${generatedFileName}`;
      
      console.log('[Asset] ✅ Immagine caricata con successo:', { assetId, storagePath, downloadURL: result.url, fileName: generatedFileName, subfolder });
      
      return {
        assetId,
        storagePath,
        downloadURL: result.url,
        fileName: generatedFileName, // Nome file generato (con assetId) per risoluzione futura
        subfolder // Includi subfolder per salvare nei metadati
      };
    } catch (error) {
      console.error('[Asset] ❌ Errore upload immagine:', error);
      throw error;
    }
  }

  /**
   * Salva metadata asset in Firestore
   * @param {string} projectId - ID del progetto
   * @param {string} assetId - ID univoco dell'asset
   * @param {string} name - Nome originale del file
   * @param {string} assetType - Tipo di asset
   * @param {string} storagePath - Percorso Storage
   * @param {string} fileName - Nome file generato (opzionale, per Supabase)
   * @param {string} publicUrl - URL pubblico dell'asset (opzionale, per Supabase)
   * @returns {Promise<boolean>} - true se salvato con successo
   */
  async function saveAssetMetadata(projectId, assetId, name, assetType, storagePath, fileName = null, publicUrl = null, subfolder = null) {
    try {
      // Verifica che Firestore sia disponibile
      if (!window.firebaseDB) {
        console.warn('[Asset] Firestore non disponibile');
        return false;
      }

      // Verifica che l'utente sia autenticato
      if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        console.warn('[Asset] Utente non autenticato');
        return false;
      }

      const userId = window.firebaseAuth.currentUser.uid;

      // Struttura: users/{userId}/projects/{projectId}/assets/{assetId}
      // Coerente con la struttura esistente dei progetti
      const assetRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId)
        .collection('assets')
        .doc(assetId);

      const metadata = {
        assetId,
        name,
        type: assetType,
        storagePath,
        projectId,
        // Aggiungi campi per Supabase Storage
        fileName: fileName || null,
        publicUrl: publicUrl || null,
        subfolder: subfolder || null, // Sottocartella opzionale (es: "rooms/roomname")
        storageProvider: 'supabase', // Indica che usa Supabase Storage
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await assetRef.set(metadata);
      
      console.log('[Asset] ✅ Metadata salvato:', { assetId, projectId, fileName, publicUrl });
      return true;
    } catch (error) {
      console.error('[Asset] ❌ Errore salvataggio metadata:', error);
      
      // Se è un errore di permessi, fornisci informazioni utili
      if (error.code === 'permission-denied') {
        console.error('[Asset] ⚠️ Errore permessi Firestore. Verifica che le regole Firestore includano:');
        console.error('[Asset]   match /users/{userId}/projects/{projectId}/assets/{assetId}');
        console.error('[Asset]   allow write: if request.auth != null && request.auth.uid == userId;');
        console.error('[Asset] Vedi FIRESTORE_SETUP.md per istruzioni su come deployare le regole.');
      }
      
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
      // Verifica che Firestore sia disponibile
      if (!window.firebaseDB) {
        console.warn('[Asset] Firestore non disponibile');
        return [];
      }

      // Verifica che l'utente sia autenticato
      if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        console.warn('[Asset] Utente non autenticato');
        return [];
      }

      console.log('[Asset] Caricamento asset per progetto:', projectId);

      const userId = window.firebaseAuth.currentUser.uid;

      // Carica tutti gli asset del progetto
      // Struttura: users/{userId}/projects/{projectId}/assets/{assetId}
      const assetsRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId)
        .collection('assets');

      const snapshot = await assetsRef.get();
      
      const assets = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        assets.push({
          assetId: data.assetId || doc.id,
          name: data.name || '',
          type: data.type || 'sprite',
          storagePath: data.storagePath || '',
          projectId: data.projectId || projectId,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
        });
      });

      console.log(`[Asset] ✅ Caricati ${assets.length} asset per progetto ${projectId}`);
      return assets;
    } catch (error) {
      console.error('[Asset] ❌ Errore caricamento asset:', error);
      return [];
    }
  }

  /**
   * Elimina un asset da Supabase Storage dato un'immagine
   * @param {Image} img - Oggetto Image che rappresenta l'asset
   * @returns {Promise<boolean>} - true se eliminato con successo, false altrimenti
   */
  async function deleteAssetFromImage(img) {
    try {
      if (!img) {
        return false;
      }

      // Verifica se l'immagine ha un assetId associato
      const assetInfo = imageAssetMap.get(img);
      if (!assetInfo || !assetInfo.assetId) {
        // Non è un asset caricato su Supabase, potrebbe essere una dataURL o URL esterno
        console.log('[Asset] Immagine non ha assetId associato, non è necessario eliminarla da Supabase');
        return true; // Non è un errore, semplicemente non c'è nulla da eliminare
      }

      const { assetId, type, projectId, fileName } = assetInfo;

      // Verifica che Supabase Storage sia disponibile
      if (!window.supabaseStorage || !window.supabaseStorage.isAvailable()) {
        console.warn('[Asset] Supabase Storage non disponibile, impossibile eliminare asset:', assetId);
        return false;
      }

      // Se non abbiamo fileName o subfolder, cerchiamo prima nei metadata Firestore
      let finalFileName = fileName;
      let subfolder = assetInfo.subfolder || null;
      let firebaseStoragePath = null; // Path per Firebase Storage legacy
      let isFirebaseLegacy = false; // Flag per asset legacy Firebase
      if ((!finalFileName || !subfolder) && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
        try {
          const userId = window.firebaseAuth.currentUser.uid;
          const assetRef = window.firebaseDB
            .collection('users')
            .doc(userId)
            .collection('projects')
            .doc(projectId)
            .collection('assets')
            .doc(assetId);

          const doc = await assetRef.get();
          if (doc.exists) {
            const data = doc.data();
            if (data && data.fileName && !finalFileName) {
              finalFileName = data.fileName;
              console.log(`[Asset] fileName recuperato da Firestore per eliminazione: ${finalFileName}`);
            }
            if (data && data.subfolder && !subfolder) {
              subfolder = data.subfolder;
              console.log(`[Asset] subfolder recuperato da Firestore per eliminazione: ${subfolder}`);
            }
            // Controlla se è un asset legacy Firebase Storage
            if (data && data.storagePath && !data.storageProvider) {
              // Asset legacy: ha storagePath ma non storageProvider (o storageProvider !== 'supabase')
              firebaseStoragePath = data.storagePath;
              isFirebaseLegacy = true;
              console.log(`[Asset] ⚠️ Asset legacy Firebase rilevato, eliminerò anche da Firebase Storage: ${firebaseStoragePath}`);
            } else if (data && data.storagePath && data.storageProvider && data.storageProvider !== 'supabase') {
              // Asset con storageProvider diverso da 'supabase'
              firebaseStoragePath = data.storagePath;
              isFirebaseLegacy = true;
              console.log(`[Asset] ⚠️ Asset con storageProvider "${data.storageProvider}" rilevato, eliminerò anche da Firebase Storage: ${firebaseStoragePath}`);
            }
          }
        } catch (metaErr) {
          console.warn('[Asset] Impossibile recuperare metadata da Firestore per eliminazione asset:', metaErr);
        }
      }
      
      // Se non abbiamo subfolder ma la categoria è background/foreground/sprite, 
      // costruisci il subfolder dal roomName corrente
      if (!subfolder && (type === 'background' || type === 'foreground' || type === 'sprite')) {
        const room = rooms.get(currentRoomId);
        if (room) {
          const roomName = room.name || room.id || currentRoomId;
          subfolder = `rooms/${roomName}`;
          console.log(`[Asset] subfolder costruito dal roomName corrente: ${subfolder}`);
        }
      }

      // Come ultimo fallback, prova a ricostruire il nome file dall'URL dell'immagine
      if (!finalFileName) {
        if (img.src && img.src.includes('.')) {
          const ext = img.src.split('.').pop().split('?')[0].toLowerCase();
          finalFileName = `${assetId}.${ext}`;
        } else {
          // Fallback storico: usa png come estensione predefinita
          finalFileName = `${assetId}.png`;
        }
        console.log(`[Asset] fileName non trovato nei metadata, ricostruito da URL: ${finalFileName}`);
      }

      console.log(`[Asset] Eliminazione asset da Supabase: ${assetId} (${type}, ${finalFileName}${subfolder ? `, subfolder: ${subfolder}` : ''})`);

      // Elimina da Supabase Storage (passa userId e subfolder per path corretto)
      let userIdOverride = null;
      if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        userIdOverride = window.firebaseAuth.currentUser.uid;
      }

      // PRIMA: elimina da Firebase Storage se è un asset legacy
      let firebaseDeleted = true; // Default true se non è un asset legacy
      if (isFirebaseLegacy && firebaseStoragePath && window.firebaseStorage) {
        try {
          console.log(`[Asset] Eliminazione asset legacy da Firebase Storage: ${firebaseStoragePath}`);
          const storageRef = window.firebaseStorage.ref(firebaseStoragePath);
          await storageRef.delete();
          firebaseDeleted = true;
          console.log(`[Asset] ✅ Asset eliminato da Firebase Storage: ${firebaseStoragePath}`);
        } catch (firebaseError) {
          console.warn(`[Asset] ⚠️ Errore eliminazione da Firebase Storage (non critico):`, firebaseError);
          // Non blocchiamo il successo se Firebase Storage fallisce (potrebbe essere già eliminato)
          firebaseDeleted = false;
        }
      }

      // POI: elimina da Supabase Storage (passa userId e subfolder per path corretto)
      const deleted = await window.supabaseStorage.deleteAsset(projectId, type, finalFileName, userIdOverride, subfolder);
      
      // Considera l'eliminazione riuscita se almeno uno dei due storage è stato eliminato
      // (potrebbe essere solo su Supabase o solo su Firebase legacy)
      if (deleted || firebaseDeleted) {
        if (deleted) {
          console.log(`[Asset] ✅ Asset eliminato da Supabase: ${assetId}`);
        }
        if (firebaseDeleted && isFirebaseLegacy) {
          console.log(`[Asset] ✅ Asset legacy eliminato da Firebase Storage: ${assetId}`);
        }
        
        // Rimuovi anche da imageAssetMap
        imageAssetMap.delete(img);
        
        // Opzionale: elimina anche da Firestore se disponibile
        if (window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
          try {
            const userId = window.firebaseAuth.currentUser.uid;
            const assetRef = window.firebaseDB
              .collection('users')
              .doc(userId)
              .collection('projects')
              .doc(projectId)
              .collection('assets')
              .doc(assetId);
            
            await assetRef.delete();
            console.log(`[Asset] ✅ Metadata eliminato da Firestore: ${assetId}`);
          } catch (firestoreError) {
            console.warn(`[Asset] ⚠️ Errore eliminazione metadata Firestore (non critico):`, firestoreError);
            // Non blocchiamo il successo se Firestore fallisce
          }
        }
        
        // Aggiorna i counter dopo eliminazione asset
        if (typeof updateProjectSizeIndicator === 'function') {
          updateProjectSizeIndicator();
        }
        
        return true;
      } else {
        console.warn(`[Asset] ⚠️ Impossibile eliminare asset da Supabase: ${assetId}`);
        return false;
      }
    } catch (error) {
      console.error('[Asset] ❌ Errore eliminazione asset:', error);
      return false;
    }
  }

  /**
   * Risolve un assetId in un URL di download da Supabase Storage
   * @param {string} projectId - ID del progetto
   * @param {string} assetId - ID dell'asset
   * @returns {Promise<string|null>} - URL di download o null se non trovato
   */
  async function resolveAssetUrl(projectId, assetId) {
    try {
      // Verifica che Firestore sia disponibile
      if (!window.firebaseDB) {
        console.warn('[Asset] Firestore non disponibile per risolvere asset:', assetId);
        return null;
      }

      // Verifica che l'utente sia autenticato
      if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        console.warn('[Asset] Utente non autenticato');
        return null;
      }

      const userId = window.firebaseAuth.currentUser.uid;

      // Carica metadata asset da Firestore
      // Struttura: users/{userId}/projects/{projectId}/assets/{assetId}
      const assetRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId)
        .collection('assets')
        .doc(assetId);

      const doc = await assetRef.get();
      
      if (!doc.exists) {
        console.warn('[Asset] Asset non trovato in Firestore:', assetId);
        return null;
      }

      const data = doc.data();
      
      // Se abbiamo già l'URL pubblico salvato (per Supabase), usalo direttamente
      if (data.publicUrl) {
        console.log('[Asset] ✅ Asset risolto da metadata (Supabase):', { assetId, publicUrl: data.publicUrl });
        return data.publicUrl;
      }

      // Fallback: prova a ricostruire l'URL da Supabase Storage
      if (data.fileName && data.type && window.supabaseStorage && window.supabaseStorage.isAvailable()) {
        const category = getStorageFolderForType(data.type);
        // Passa userId per asset nuovi (con userId nel path), null per asset legacy
        const publicUrl = window.supabaseStorage.getAssetPublicUrl(userId, projectId, category, data.fileName);
        if (publicUrl) {
          console.log('[Asset] ✅ Asset risolto da Supabase Storage:', { assetId, publicUrl });
          return publicUrl;
        }
      }

      // Se non è un asset Supabase, potrebbe essere un asset Firebase legacy
      // In questo caso, prova a usare Firebase Storage come fallback
      if (data.storagePath && window.firebaseStorage) {
        console.warn('[Asset] ⚠️ Asset legacy Firebase rilevato, uso Firebase Storage come fallback:', assetId);
        const storageRef = window.firebaseStorage.ref(data.storagePath);
        const downloadURL = await storageRef.getDownloadURL();
        console.log('[Asset] ✅ Asset risolto da Firebase Storage (legacy):', { assetId, downloadURL });
        return downloadURL;
      }

      console.warn('[Asset] Impossibile risolvere asset:', assetId);
      return null;
    } catch (error) {
      console.warn('[Asset] ⚠️ Errore risoluzione asset:', assetId, error.message);
      return null;
    }
  }

  /**
   * Carica un'immagine da un URL (helper per compatibilità)
   * @param {string} url - URL dell'immagine (può essere dataURL o URL Storage)
   * @returns {Promise<Image|null>} - Oggetto Image o null se errore
   */
  async function loadImageFromUrl(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      
      // Controlla se l'URL è un URL Firebase Storage diretto senza token
      // Se è così, potrebbe causare problemi CORS
      if (url.includes('firebasestorage.googleapis.com') && !url.includes('token=')) {
        console.warn('[Asset] ⚠️ URL Firebase Storage senza token rilevato. Questo potrebbe causare errori CORS:', url);
        console.warn('[Asset] Suggerimento: usa assetId invece di URL diretto per evitare problemi CORS');
      }
      
      const img = new Image();
      
      // Prova prima con crossOrigin per supportare CORS
      img.crossOrigin = 'anonymous';
      
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
        if (img.crossOrigin === 'anonymous' && !url.startsWith('data:')) {
          console.warn('[Asset] ⚠️ Errore caricamento con CORS, riprovo senza crossOrigin:', url);
          
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
              console.error('[Asset] ❌ Errore definitivo caricamento immagine:', url, error2);
              resolve(null);
            }
          };
          imgNoCors.src = url;
        } else {
          resolved = true;
          console.error('[Asset] ❌ Errore caricamento immagine:', url, error);
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
      // Upload su Supabase Storage
      const { assetId: finalAssetId, storagePath, downloadURL, fileName, subfolder: resultSubfolder } = await uploadImageToStorage(
        file,
        projectId,
        assetType,
        assetId,
        overwriteExisting,
        fileNameOverride,
        subfolder
      );
      
      // Salva metadata in Firestore (include fileName e publicUrl per Supabase)
      // Nota: Se il salvataggio dei metadati fallisce, non blocchiamo l'upload
      // perché l'asset è già caricato su Supabase Storage
      const metadataSaved = await saveAssetMetadata(projectId, finalAssetId, file.name, assetType, storagePath, fileName, downloadURL, resultSubfolder || subfolder);
      
      if (!metadataSaved) {
        console.warn('[Asset] ⚠️ Upload completato su Supabase, ma salvataggio metadati Firestore fallito. L\'asset è comunque disponibile.');
      }
      
      // Aggiorna i counter dopo upload asset
      if (typeof updateProjectSizeIndicator === 'function') {
        updateProjectSizeIndicator();
      }
      
      return { assetId: finalAssetId, downloadURL, fileName };
    } catch (error) {
      console.error('[Asset] ❌ Errore upload immagine completo:', error);
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
      // FileSystemDirectoryHandle.removeEntry è disponibile su alcuni browser
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
   * @param {string} projectId - ID del progetto (necessario se urlOrAssetId è un assetId)
   * @returns {Promise<Image|null>} - Oggetto Image o null se errore
   */
  async function createImageFromDataUrl(urlOrAssetId, projectId = null) {
    if (!urlOrAssetId) {
      return null;
    }

    // Se è un assetId (prefisso "asset:"), risolvi da Supabase Storage (o Firebase Storage legacy)
    if (urlOrAssetId.startsWith('asset:')) {
      const assetId = urlOrAssetId.replace('asset:', '');
      
      if (!projectId) {
        // Prova a ottenere projectId dal progetto corrente
        const projectName = localStorage.getItem('amiantoActiveProjectName');
        if (projectName) {
          projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        }
      }

      if (!projectId) {
        console.warn('[Asset] projectId mancante per risolvere asset:', assetId);
        return null;
      }

      // Risolvi assetId in URL (funziona sia per Supabase che Firebase legacy)
      const downloadURL = await resolveAssetUrl(projectId, assetId);
      if (!downloadURL) {
        console.warn('[Asset] Impossibile risolvere asset:', assetId);
        return null;
      }

      // Carica immagine dall'URL risolto
      return await loadImageFromUrl(downloadURL);
    }

    // Se è un URL Supabase Storage, caricalo direttamente
    if (urlOrAssetId.includes('supabase.co/storage/v1/object/public/')) {
      console.log('[Asset] URL Supabase Storage rilevato:', urlOrAssetId);
      return await loadImageFromUrl(urlOrAssetId);
    }

    // Se è un URL Firebase Storage diretto senza token, avvisa l'utente
    if (urlOrAssetId.includes('firebasestorage.googleapis.com') && !urlOrAssetId.includes('token=')) {
      console.error('[Asset] ❌ URL Firebase Storage diretto rilevato (senza token). Questo causerà errori CORS.');
      console.error('[Asset] URL problematico:', urlOrAssetId);
      console.error('[Asset] Suggerimento: il progetto potrebbe essere stato salvato con URL diretti invece di assetId.');
      console.error('[Asset] Prova a ricaricare l\'immagine dal progetto per generare un nuovo assetId.');
      
      // Prova comunque a caricarlo (potrebbe funzionare se le regole CORS sono configurate)
      const img = await loadImageFromUrl(urlOrAssetId);
      if (!img) {
        showNotification('CORS error: image could not be loaded. Re-import the image from the project.', 'error');
      }
      return img;
    }

    // Fallback: tratta come URL normale (dataURL o HTTP)
    return await loadImageFromUrl(urlOrAssetId);
  }

  async function applyProjectObject(projectObj) {
    try {
      mergeLegacyHotspotScriptsIntoRooms(projectObj);

      // Ottieni projectId dal progetto (necessario per risolvere assetId)
      const projectName = projectObj.settings && projectObj.settings.name ? projectObj.settings.name : 'amianto-project';
      const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
      
      // Pulisci mappa asset prima di caricare nuovo progetto
      imageAssetMap.clear();

      // Settings / viewport
      if (projectObj && projectObj.settings) {
        const s = projectObj.settings;
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
            walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
            hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => {
              const hotspotObj = {
                id: h.id || uid('hotspot'),
                name: h.name || 'Hotspot',
                points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
                visible: (typeof h.visible === 'boolean') ? h.visible : true
              };
              
              // ⚠️ NORMALIZZAZIONE: Preserva struttura scripts.onClick se presente e normalizza enabled
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
                
                // AUTOMATIZZAZIONE: Se c'è codice, enabled deve essere sempre true
                // L'obiettivo è eliminare il blocco "enabled = false" per hotspot con codice
                let normalizedEnabled;
                if (hasCode) {
                  // Se c'è codice, forza sempre enabled=true (ignorando eventuale enabled=false salvato)
                  normalizedEnabled = true;
                  if (typeof onClickData.enabled === 'boolean' && onClickData.enabled === false) {
                    console.warn(`[Serialize] [AUTO-ENABLE] Hotspot ${h.id} ha codice ma enabled=false salvato, forzo enabled=true`);
                  }
                } else {
                  // Se non c'è codice, enabled può essere false
                  normalizedEnabled = (typeof onClickData.enabled === 'boolean') ? onClickData.enabled : false;
                }
                
                hotspotObj.scripts.onClick = {
                  code: String(onClickData.code || ''),
                  enabled: normalizedEnabled
                };
              } else {
                // Se non c'è script, imposta struttura vuota e disabilitata
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
            if (r.background) {
              const img = await createImageFromDataUrl(r.background, projectId);
              if (img) {
                // Verifica che l'immagine sia completamente caricata
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                
                if (width && height) {
                  roomVal.background = img;
                  // Se è la stanza corrente, aggiorna anche il background globale
                  if (roomId === currentRoomId) {
                    background = img;
                  }
                  // Se è un assetId, registra nella mappa
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
              console.log(`[Load] Caricamento ${r.foregrounds.length} foreground per room ${roomId}`, r.foregrounds);
              const out = [];
              for (const f of r.foregrounds) {
                if (!f || !f.image) {
                  console.warn(`[Load] Foreground senza image, skip:`, f);
                  continue;
                }
                
                const img = await createImageFromDataUrl(f.image, projectId);
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
                  offsetX: Number(x) || 0, // Mantieni per compatibilità
                  offsetY: Number(y) || 0, // Mantieni per compatibilità
                  rotationRad: Number(f.rotationRad) || 0,
                  scaleX: (typeof f.scaleX === 'number') ? Number(f.scaleX) : 1,
                  scaleY: (typeof f.scaleY === 'number') ? Number(f.scaleY) : 1,
                  visible: (typeof f.visible === 'boolean') ? f.visible : true
                };
                
                out.push(foregroundObj);
                
                // Se è un assetId, registra nella mappa
                if (f.image && f.image.startsWith('asset:')) {
                  const assetId = f.image.replace('asset:', '');
                  imageAssetMap.set(img, { assetId, type: 'foreground', projectId });
                }
                
                console.log(`[Load] ✓ Foreground caricato: ${foregroundObj.name} (id: ${foregroundObj.id}, image: ${f.image.substring(0, 50)}...)`);
              }
              
              console.log(`[Load] Foreground caricati per room ${roomId}: ${out.length}/${r.foregrounds.length}`);
              roomVal.foregrounds = out;
              
              // IMPORTANTE: Se questa è la room corrente, aggiorna anche lo stato globale
              if (roomId === currentRoomId) {
                foregrounds = out;
                console.log(`[Load] ✓ Foreground sincronizzati nello stato globale per room corrente: ${foregrounds.length} layer`);
              }
              
              refreshForegroundListUI();
              redraw();
            } else {
              console.log(`[Load] Nessun foreground nella room ${roomId} (r.foregrounds non è un array o è vuoto)`);
            }
            if (Array.isArray(r.sceneObjects)) {
              for (let i = 0; i < r.sceneObjects.length; i++) {
                const src = r.sceneObjects[i];
                const dst = roomVal.sceneObjects[i];
                if (src && src.image) {
                  const img = await createImageFromDataUrl(src.image, projectId);
                  dst.img = img;
                  // Se è un assetId, registra nella mappa
                  if (img && src.image.startsWith('asset:')) {
                    const assetId = src.image.replace('asset:', '');
                    imageAssetMap.set(img, { assetId, type: 'sprite', projectId });
                  }
                }
              }
              // ricrea lista oggetti
              if (roomId === currentRoomId) {
                sceneObjects = roomVal.sceneObjects;
                refreshSceneObjectsListUI();
                redraw();
              }
            }
              refreshHotspotsListUI();
              scheduleProjectSizeIndicatorRefresh(300);
          });
        }
      } else {
        // assicura almeno una stanza
        const rid = uid('room');
        rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], walkableArea: [], hotspots: [], scalingForegroundY: null, scalingBackgroundY: null, scalingMinScale: 0.5, scalingMaxScale: 1.5 });
      }
      // Seleziona prima stanza e sincronizza riferimenti
      const firstRoom = rooms.keys().next().value;
      currentRoomId = firstRoom;
      bindRoomRefs();
      refreshForegroundListUI();
      refreshSceneObjectsListUI();
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
          guis.push({
            id: g.id || uid('gui'),
            name: g.name || 'GUI',
            type: loadedGuiType,
            settings: g.settings || {},
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
            const characterName = ch.name || ch.id || uid('char');
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
            const charData = { directions, animations, currentFrame: 0 };
            // Load pivot if it exists
            if (ch.pivotX !== undefined && ch.pivotY !== undefined) {
              charData.pivotX = Number(ch.pivotX) || 0;
              charData.pivotY = Number(ch.pivotY) || 0;
            }
            // Load spawnSettings if it exists
            if (ch.spawnSettings) {
              charData.spawnSettings = {
                isPlayer: ch.spawnSettings.isPlayer === true,
                autoSpawn: ch.spawnSettings.autoSpawn === true,
                roomId: ch.spawnSettings.roomId || null,
                x: typeof ch.spawnSettings.x === 'number' ? ch.spawnSettings.x : 0,
                y: typeof ch.spawnSettings.y === 'number' ? ch.spawnSettings.y : 0,
                direction: ch.spawnSettings.direction || 'south',
                moveSpeed: typeof ch.spawnSettings.moveSpeed === 'number' && ch.spawnSettings.moveSpeed > 0 ? ch.spawnSettings.moveSpeed : 100
              };
            }
            characterFrames.set(characterName, charData);
          }
        }
        refreshCharactersListUI();
      } catch(error) {
        console.error('[Load] Errore caricamento character:', error);
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
          if (invData.background) {
            const bgRef = invData.background;
            Promise.resolve().then(async () => {
              const img = await createImageFromDataUrl(bgRef, projectId);
              if (img) {
                inventoryDefinition.background = img;
                if (typeof bgRef === 'string' && bgRef.startsWith('asset:')) {
                  imageAssetMap.set(img, { assetId: bgRef.replace('asset:', ''), type: 'inventory', projectId });
                }
                redraw();
              }
            });
          }
          if (invData.toggleIcon) {
            const iconRef = invData.toggleIcon;
            Promise.resolve().then(async () => {
              const img = await createImageFromDataUrl(iconRef, projectId);
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
            _imageRef: item.image || null
          };
          inventoryItems.push(entry);
        });
        Promise.resolve().then(async () => {
          for (const item of inventoryItems) {
            if (item._imageRef) {
              item.image = await createImageFromDataUrl(item._imageRef, projectId);
              if (item.image && typeof item._imageRef === 'string' && item._imageRef.startsWith('asset:')) {
                imageAssetMap.set(item.image, { assetId: item._imageRef.replace('asset:', ''), type: 'inventory', projectId });
              }
            }
            delete item._imageRef;
            syncInventoryItemScript(item);
          }
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
        
        // ⚠️ PULIZIA EDITOR: Pulisci l'editor degli script quando si carica un nuovo progetto
        // Questo assicura che anche se la cache del browser non è stata svuotata,
        // l'editor sarà vuoto quando si crea un nuovo progetto
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
        
        // ⚠️ PULIZIA: Rimuovi tutti gli script da localStorage che non appartengono a questo progetto
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
        hotspotScripts.clear(); // ⚠️ hotspotScripts Map non più usata per gli hotspot (script salvati in hotspot.scripts.onClick)
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
          // ⚠️ A.hotspotScripts rimosso: gli script degli hotspot sono ora salvati direttamente in hotspot.scripts.onClick
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

      // ⚠️ PULIZIA AUTOMATICA HOTSPOT: Forza enabled=true per tutti gli hotspot con codice
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
          console.log(`[Cleanup] ✅ Pulizia completata: ${cleanedCount} hotspot abilitati automaticamente`);
        }
      } catch (cleanupError) {
        console.warn('[Cleanup] Errore durante pulizia hotspot:', cleanupError);
      }

      // Cursors contestuali
      try {
        contextualCursors = [];
        if (Array.isArray(projectObj.cursors)) {
          for (const c of projectObj.cursors) {
            const cursorImg = c.cursorImage ? await createImageFromDataUrl(c.cursorImage, projectId) : null;
            if (cursorImg && c.cursorImage && c.cursorImage.startsWith('asset:')) {
              const assetId = c.cursorImage.replace('asset:', '');
              imageAssetMap.set(cursorImg, { assetId, type: 'cursor', projectId });
            }
            contextualCursors.push({
              id: c.id || uid('cursor'),
              targetType: c.targetType || 'hotspot',
              targetId: c.targetId || '',
              cursorImage: cursorImg,
              actionText: c.actionText || '',
              scriptName: c.scriptName || ''
            });
          }
        }
        refreshCursorsList();
      } catch(_) {}

      // Centra la preview rooms/inventory dopo il caricamento (evita pan obsoleto fuori schermo)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resetEditorViewCentered({ fit: true }));
      });
      
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
      await applyProjectObject(obj);
    } catch (err) {
      addDebugMessage('Invalid project JSON: ' + (err && err.message ? err.message : err), 'error');
      showNotification('Invalid project JSON', 'danger');
    }
  };

  // MODIFICATO: Ora carica prima da Firestore, poi fallback su cache locale
  async function openProjectByName(projectName) {
    if (!currentUser) { 
      showNotification('Please login to open projects', 'warning'); 
      return; 
    }
    if (!projectName) return;

    // Blocca durante la sincronizzazione
    if (isSyncingProjects) {
      showNotification('Please wait for synchronization to complete before opening a project', 'warning');
      return;
    }

    const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
    
    // IMPORTANTE: Per Firestore dobbiamo usare SEMPRE uid (non username)
    // Le regole di sicurezza controllano request.auth.uid == userId
    const userId = currentUser.uid;

    let projectObj = null;
    let loadedFrom = null;

    // 1. PROVA FIRESTORE PRIMA (fonte ufficiale) - AGGIUNTO
    // Verifica che l'utente sia autenticato e che Firestore sia disponibile
    if (userId && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
      const currentAuthUid = window.firebaseAuth.currentUser.uid;
      if (currentAuthUid === userId) {
        console.log('[Load] Tentativo caricamento da Firestore...', { userId, projectId });
        projectObj = await loadProjectFromFirestore(userId, projectId);
        if (projectObj) {
          loadedFrom = 'firestore';
          console.log('[Load] ✅ Caricato da Firestore');
          addDebugMessage('Loaded from Firestore', 'success');
        } else {
          console.log('[Load] Progetto non trovato su Firestore, uso fallback');
        }
      } else {
        console.warn('[Load] UID non corrisponde, salto Firestore', { userId, currentAuthUid });
      }
    } else {
      console.log('[Load] Firestore non disponibile o utente non autenticato, uso fallback');
    }

    // 2. FALLBACK: OPFS - GIÀ IMPLEMENTATO
    if (!projectObj) {
      const json = await loadProjectJsonFromOPFS(projectName);
      if (json) {
        try {
          projectObj = JSON.parse(json);
          loadedFrom = 'opfs';
          console.log('[Load] Caricato da OPFS');
          addDebugMessage('Loaded from OPFS (fallback)', 'info');
        } catch (e) {
          console.error('[Load] Errore parsing OPFS:', e);
        }
      }
    }

    // 3. FALLBACK: LOCALSTORAGE CACHE - GIÀ IMPLEMENTATO
    if (!projectObj) {
      const key = `amiantoProject_${currentUser.username}:${projectName}`;
      const json = localStorage.getItem(key);
      if (json) {
        try {
          projectObj = JSON.parse(json);
          loadedFrom = 'cache';
          console.log('[Load] Caricato da cache locale');
          addDebugMessage('Loaded from cache (fallback)', 'warning');
        } catch (e) {
          console.error('[Load] Errore parsing cache:', e);
        }
      }
    }

    // 4. FALLBACK FINALE: Progetto vuoto - GIÀ IMPLEMENTATO
    if (!projectObj) {
      projectObj = {
        format: 'amianto-game',
        version: 1,
        settings: { name: projectName, canvasWidth: gameViewport.width, canvasHeight: gameViewport.height },
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

    // Applica il progetto caricato
    await applyProjectObject(projectObj);

    // IMPORTANTE: Salva il progetto attivo PRIMA di qualsiasi altra operazione
    // Questo assicura che il listener hide.bs.modal possa rilevarlo
    localStorage.setItem('amiantoActiveProjectName', projectName);
    localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);
    localStorage.setItem('amiantoActiveProjectId', projectId);

    // Abilita altre tab ora che c'è un progetto aperto
    enableOtherTabs(true);
    
    // Aggiorna indicatore dimensione progetto
    updateProjectSizeIndicator();
    
    // Mostra notifica con fonte di caricamento
    if (loadedFrom === 'firestore') {
      showNotification(`Project "${projectName}" loaded from Firestore`, 'success');
    } else if (loadedFrom === 'cache' || loadedFrom === 'opfs') {
      showNotification(`Project "${projectName}" loaded from ${loadedFrom}`, 'info');
    }
    
    // Il modale verrà chiuso dal chiamante dopo questa funzione completa
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
      const firestoreBytes = estimateFirestorePayloadBytes(projectObj);
      const pendingBytes = measureEmbeddedDataUrlBytes(projectObj);
      const pendingCount = countEmbeddedDataUrls(projectObj);

      const FIRESTORE_MAX_SIZE = 1048487; // ~1MB in bytes
      const percentageUsed = parseFloat(((firestoreBytes / FIRESTORE_MAX_SIZE) * 100).toFixed(1));

      const parts = [`Firestore: ${formatProjectSizeLabel(firestoreBytes)} (${percentageUsed}%)`];
      if (pendingBytes > 0) {
        const assetLabel = pendingCount === 1 ? '1 asset' : `${pendingCount} asset`;
        parts.push(`da caricare: ${formatProjectSizeLabel(pendingBytes)} (${assetLabel})`);
      }

      sizeText.textContent = parts.join(' · ');
      indicator.title = pendingBytes > 0
        ? 'Firestore: stima del JSON salvato (senza base64). "Da caricare": immagini/audio ancora in memoria; sparisce dopo Save.'
        : 'Firestore: dimensione stimata del documento salvato (~1 MB max). Storage: file asset su Supabase.';

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

      if (window.supabaseStorage && typeof window.supabaseStorage.getProjectStorageSize === 'function') {
        const storage = await window.supabaseStorage.getProjectStorageSize(projectId);
        if (storage && storage.totalBytes > 0) {
          const storageLabel = formatProjectSizeLabel(storage.totalBytes);
          const fileLabel = storage.fileCount === 1 ? '1 file' : `${storage.fileCount} file`;
          sizeText.textContent = `${parts.join(' · ')} · Storage: ${storageLabel} (${fileLabel})`;
          indicator.title = (indicator.title || '') + ` Storage Supabase: ${storageLabel}, ${fileLabel}.`;
        }
      }
    } catch (error) {
      console.warn('[ProjectSize] Errore aggiornamento indicatore:', error);
    }
  }
  
  // Esponi funzione globalmente
  window.updateProjectSizeIndicator = updateProjectSizeIndicator;

  /**
   * Elimina completamente un progetto da Firestore, incluse tutte le subcollezioni
   * IMPORTANTE: In Firestore, eliminare un documento padre NON elimina automaticamente le subcollezioni
   * Questa funzione elimina prima tutte le subcollezioni, poi il documento principale
   * @param {string} userId - ID utente (uid di Firebase)
   * @param {string} projectId - ID progetto
   * @returns {Promise<boolean>} - true se eliminato con successo, false altrimenti
   */
  async function deleteProjectFromFirestoreCompletely(userId, projectId) {
    if (!userId || !projectId || !window.firebaseDB) {
      console.warn('[Firestore] Parametri mancanti per eliminazione completa progetto');
      return false;
    }

    try {
      // Ottieni riferimento a Firebase per accedere a batch()
      const firebaseObj = window.firebase || firebase;
      if (!firebaseObj) {
        console.error('[Firestore] Firebase non disponibile');
        return false;
      }

      const projectRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects')
        .doc(projectId);

      // STEP 1: Elimina tutte le subcollezioni (es: assets)
      // Firestore non supporta eliminazione ricorsiva automatica, quindi dobbiamo farlo manualmente
      const subcollections = ['assets']; // Aggiungi altre subcollezioni se necessario
      
      for (const subcollectionName of subcollections) {
        try {
          const subcollectionRef = projectRef.collection(subcollectionName);
          
          // Elenca tutti i documenti nella subcollezione
          // Usa source: 'server' per forzare lettura dal server (non dalla cache offline)
          const snapshot = await subcollectionRef.get({ source: 'server' });
          
          if (!snapshot.empty) {
            console.log(`[Firestore] Eliminazione ${snapshot.size} documenti dalla subcollezione '${subcollectionName}'...`);
            
            // Elimina tutti i documenti in batch (Firestore supporta batch fino a 500 operazioni)
            const BATCH_SIZE = 500;
            const batches = [];
            let currentBatch = window.firebaseDB.batch();
            let operationCount = 0;
            
            snapshot.forEach((doc) => {
              currentBatch.delete(doc.ref);
              operationCount++;
              
              if (operationCount >= BATCH_SIZE) {
                batches.push(currentBatch);
                currentBatch = window.firebaseDB.batch();
                operationCount = 0;
              }
            });
            
            // Aggiungi l'ultimo batch se ha operazioni
            if (operationCount > 0) {
              batches.push(currentBatch);
            }
            
            // Esegui tutti i batch
            for (const batch of batches) {
              await batch.commit();
            }
            
            console.log(`[Firestore] ✅ Subcollezione '${subcollectionName}' eliminata completamente`);
          } else {
            console.log(`[Firestore] Subcollezione '${subcollectionName}' già vuota`);
          }
        } catch (subError) {
          console.error(`[Firestore] Errore eliminazione subcollezione '${subcollectionName}':`, subError);
          // Continua anche se una subcollezione fallisce
        }
      }

      // STEP 2: Verifica che il documento esista prima di eliminarlo
      // Usa source: 'server' per forzare lettura dal server (non dalla cache offline)
      const projectDoc = await projectRef.get({ source: 'server' });
      
      if (!projectDoc.exists) {
        console.log(`[Firestore] Progetto ${projectId} non esiste già su Firestore`);
        return true; // Considera come successo se non esiste
      }

      // STEP 3: Elimina il documento principale
      await projectRef.delete();
      
      // STEP 4: Verifica che l'eliminazione sia stata applicata (forza lettura dal server)
      // Questo previene problemi con la cache offline di Firestore
      // Attendi un breve momento per permettere la propagazione
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyDoc = await projectRef.get({ source: 'server' });
      
      if (verifyDoc.exists) {
        console.error(`[Firestore] ⚠️ ATTENZIONE: Il progetto ${projectId} esiste ancora dopo l'eliminazione!`);
        addDebugMessage(`[Firestore] ⚠️ Project may not have been permanently deleted`, 'warning');
        return false;
      }
      
      console.log(`[Firestore] ✅ Progetto ${projectId} eliminato permanentemente da Firestore`);
      return true;
    } catch (error) {
      console.error('[Firestore] Errore eliminazione completa progetto:', error);
      addDebugMessage(`[Firestore] Delete error: ${error.message || error}`, 'error');
      return false;
    }
  }

  // MODIFICATO: Ora elimina anche da Firestore (con eliminazione completa delle subcollezioni)
  async function deleteProjectByName(projectName) {
    if (!currentUser) { showNotification('Please login to delete projects', 'warning'); return; }
    if (!projectName) return;
    if (!confirm(`Delete project "${projectName}"? This action cannot be undone.`)) return;
    
    const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
    
    // IMPORTANTE: Per Firestore dobbiamo usare SEMPRE uid (non username)
    const userId = currentUser.uid;

    // 1. ELIMINA COMPLETAMENTE DA FIRESTORE (incluse subcollezioni) - MODIFICATO
    if (userId && window.firebaseDB) {
      try {
        const deleted = await deleteProjectFromFirestoreCompletely(userId, projectId);
        if (deleted) {
          console.log(`[Firestore] Progetto eliminato permanentemente: ${projectName}`);
          addDebugMessage(`[Firestore] Project permanently deleted: ${projectName}`, 'success');
        } else {
          console.error(`[Firestore] Impossibile eliminare permanentemente il progetto: ${projectName}`);
          addDebugMessage(`[Firestore] Could not permanently delete project: ${projectName}`, 'error');
          // Continua comunque con l'eliminazione locale
        }
      } catch (error) {
        console.error('[Firestore] Errore eliminazione:', error);
        addDebugMessage(`[Firestore] Delete error: ${error.message || error}`, 'error');
        // Continua comunque con l'eliminazione locale
      }
    }

    // 1.5. ELIMINA CARTELLA PROGETTO DA SUPABASE STORAGE (se disponibile) - AGGIUNTO
    if (userId && window.supabaseStorage && window.supabaseStorage.deleteProjectFolder) {
      try {
        const deleted = await window.supabaseStorage.deleteProjectFolder(projectId);
        if (deleted) {
          console.log(`[Supabase] Cartella progetto eliminata: ${projectName}`);
          addDebugMessage(`[Supabase] Project folder deleted: ${projectName}`, 'success');
          
          // Aggiorna i counter dopo eliminazione cartella progetto
          if (typeof updateProjectSizeIndicator === 'function') {
            updateProjectSizeIndicator();
          }
        } else {
          console.warn(`[Supabase] Impossibile eliminare cartella progetto: ${projectName}`);
          addDebugMessage(`[Supabase] Could not delete project folder: ${projectName}`, 'warning');
        }
      } catch (error) {
        console.error('[Supabase] Errore eliminazione cartella progetto:', error);
        addDebugMessage(`[Supabase] Folder delete error: ${error.message || error}`, 'error');
      }
    }
    
    // 2. Carica il JSON del progetto per ottenere la lista degli script da rimuovere - GIÀ IMPLEMENTATO
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
    } catch(_) {}
    
    // 3. Rimuovi dalla lista progetti usando funzione centralizzata
    const list = loadProjectsFromCache(currentUser.username);
    const filtered = list.filter(p => !(p && p.settings && p.settings.name === projectName));
    saveProjectsToCache(currentUser.username, filtered);
    
    // 4. Rimuovi backup locale - GIÀ IMPLEMENTATO
    try { localStorage.removeItem(projectKey); } catch(_) {}
    try { localStorage.removeItem(`${projectKey}_meta`); } catch(_) {} // Rimuovi anche metadata cache
    
    // 5. Rimuovi tutti gli script associati al progetto da localStorage - GIÀ IMPLEMENTATO
    scriptsToRemove.forEach(scriptName => {
      try { localStorage.removeItem(`script-${scriptName}`); } catch(_) {}
    });
    
    // 6. Se è il progetto corrente aperto, pulisci anche jsScripts in memoria - GIÀ IMPLEMENTATO
    const currentProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (currentProjectName === projectName) {
      jsScripts.clear();
      // Pulisci anche le mappe di attachment
      objectScripts.clear();
      roomScripts.clear();
      characterScripts.clear();
      inventoryScripts.clear();
      hotspotScripts.clear();
      if (typeof guiScripts !== 'undefined' && guiScripts.clear) guiScripts.clear();
      // Ricostruisci la lista script nell'UI
      refreshScriptSelector();
      rebuildScriptsTree();
    }
    
    // 7. Rimuovi file OPFS se possibile - GIÀ IMPLEMENTATO
    try { await deleteProjectFileFromOPFS(projectName); } catch(_) {}
    
    // 8. Se è il progetto corrente aperto, rimuovi anche il progetto attivo
    const activeProjectName = localStorage.getItem('amiantoActiveProjectName');
    if (activeProjectName === projectName) {
      localStorage.removeItem('amiantoActiveProjectName');
      localStorage.removeItem('amiantoActiveProjectOwner');
      // Nascondi indicatore dimensione progetto
      const indicator = document.getElementById('projectSizeIndicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
    
    // 9. Verifica se ci sono ancora progetti dopo la cancellazione
    // Sincronizza con Firestore per avere la lista aggiornata
    let remainingProjects = [];
    if (userId && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
      try {
        await syncProjectsFromFirestore(userId);
        remainingProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
      } catch (error) {
        console.error('[Delete] Errore sincronizzazione dopo cancellazione:', error);
        // Fallback: usa la lista locale già filtrata
        remainingProjects = filtered;
      }
    } else {
      // Fallback: usa la lista locale già filtrata
      remainingProjects = filtered;
    }
    
    showNotification('Project deleted', 'success');
    
    // 10. Se non ci sono più progetti, mostra il modale di selezione e torna alla tab Projects
    if (remainingProjects.length === 0) {
      console.log('[Delete] Nessun progetto rimasto, mostro modale selezione');
      // Rimuovi progetto attivo se ancora presente
      localStorage.removeItem('amiantoActiveProjectName');
      localStorage.removeItem('amiantoActiveProjectOwner');
      // Pulisci l'editor
      rooms = new Map();
      currentRoomId = null;
      background = null;
      foregrounds = [];
      sceneObjects = [];
      guis = [];
      characters = [];
      contextualCursors = [];
      
      // Disabilita altre tab (non c'è più un progetto aperto)
      enableOtherTabs(false);
      
      // Torna alla tab Projects
      if (typeof showSectionById === 'function') {
        showSectionById('projects', false);
      } else {
        // Fallback: usa il bottone direttamente
        const projectsButton = document.querySelector(`[data-section="projects"]`);
        if (projectsButton) {
          projectsButton.click();
        }
      }
      
      // Mostra il modale (forzato, anche se c'era un progetto attivo)
      await showProjectSelectionModal(true);
    }
  }

  // Show project list (modal)
  window.showProjectList = async function() {
    if (!currentUser) {
      showNotification('Please login to view projects', 'warning');
      return;
    }
    
    // Ricarica progetti da Firestore per avere dati aggiornati
    if (currentUser.uid && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
      try {
        console.log('[ProjectList] Ricarica progetti da Firestore...');
        await syncProjectsFromFirestore(currentUser.uid);
      } catch (error) {
        console.error('[ProjectList] Errore ricarica progetti:', error);
      }
    }
    
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
      <div class="text-center text-muted py-4">Nessun progetto trovato. Crea un nuovo progetto dal menu Profilo > File.</div>
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
          
          // Chiudi il modale DOPO che il progetto è stato caricato con successo
          const inst = bootstrap.Modal.getInstance(modal);
          if (inst) {
            inst.hide();
            // Il listener hidden.bs.modal già presente rimuoverà il modale dal DOM
          } else {
            // Fallback: chiudi manualmente se Bootstrap non è disponibile
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
          // Se non ci sono più progetti, chiudi il modale "My Projects"
          // Il modale di selezione verrà mostrato automaticamente da deleteProjectByName
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

      const trimmedName = projectName.trim();

      // Crea progetto completo con struttura corretta
      const newProject = {
        format: 'amianto-game',
        version: 1,
        meta: {
          exportedAt: new Date().toISOString(),
          editor: 'Amianto Editor',
          editorVersion: '0.1'
        },
        settings: {
          name: trimmedName,
          canvasWidth: 800,
          canvasHeight: 600
        },
        rooms: [],
        guis: [],
        characters: [],
        inventory: [],
        scripts: {},
        attachments: {},
        cursors: [],
        variables: {
          definitions: [],
          state: {}
        },
        eventConditions: {
          objects: {},
          hotspots: {},
          characters: {},
          guiButtons: {},
          inventory: {}
        }
      };

      // Apri il progetto nell'editor
      await applyProjectObject(newProject);

      // Imposta come progetto attivo
      localStorage.setItem('amiantoActiveProjectName', trimmedName);
      localStorage.setItem('amiantoActiveProjectOwner', currentUser.username);

      // Aggiungi alla lista progetti utente
      const arr = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
      const entry = {
        settings: newProject.settings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      arr.push(entry);
      localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(arr));

      // Salva su Firestore se l'utente è autenticato
      const userId = currentUser.uid;
      if (userId && window.firebaseDB) {
        const projectId = trimmedName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        await saveProjectToFirestore(userId, projectId, newProject);
      }

      showNotification(`Project "${trimmedName}" created and opened!`, 'success');
      
      // Chiudi il modale
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
        await importProjectFromJson(text);
        const nameGuess = (() => {
          try { const o = JSON.parse(text); return (o && o.settings && o.settings.name) ? o.settings.name : null; } catch (_) { return null; }
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
    if (!currentUser) {
      showNotification('Please login to delete projects', 'warning');
      return;
    }

    // Ottieni il nome del progetto da localStorage o dal campo input (se esiste)
    let projectName = localStorage.getItem('amiantoActiveProjectName');
    if (!projectName) {
      const projectNameInput = document.getElementById('projectName');
      projectName = projectNameInput ? projectNameInput.value : null;
    }
    if (!projectName) {
      // Fallback: cerca nell'oggetto serializzato
      try {
        const projectObj = window.serializeProject();
        projectName = projectObj.settings && projectObj.settings.name ? projectObj.settings.name : null;
      } catch (_) {}
    }
    if (!projectName) {
      projectName = 'Untitled Project';
    }
    if (confirm(`Are you sure you want to delete project "${projectName}"?`)) {
      // Carica il JSON del progetto per ottenere la lista degli script da rimuovere
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
      } catch(_) {}
      
      // Rimuovi dalla lista progetti
      const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
      const filteredProjects = userProjects.filter(p => p.settings.name !== projectName);
      localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(filteredProjects));
      
      // Rimuovi il backup locale del progetto
      try { localStorage.removeItem(projectKey); } catch(_) {}
      
      // Rimuovi tutti gli script associati al progetto da localStorage
      scriptsToRemove.forEach(scriptName => {
        try { localStorage.removeItem(`script-${scriptName}`); } catch(_) {}
      });
      
      // Se è il progetto corrente aperto, pulisci anche jsScripts in memoria
      const currentProjectName = localStorage.getItem('amiantoActiveProjectName');
      if (currentProjectName === projectName) {
        jsScripts.clear();
        // Pulisci anche le mappe di attachment
        objectScripts.clear();
        roomScripts.clear();
        characterScripts.clear();
        inventoryScripts.clear();
        hotspotScripts.clear();
        if (typeof guiScripts !== 'undefined' && guiScripts.clear) guiScripts.clear();
        // Ricostruisci la lista script nell'UI
        refreshScriptSelector();
        rebuildScriptsTree();
        
        // Rimuovi progetto attivo
        localStorage.removeItem('amiantoActiveProjectName');
        localStorage.removeItem('amiantoActiveProjectOwner');
      }
      
      // Verifica se ci sono ancora progetti dopo la cancellazione
      // Sincronizza con Firestore per avere la lista aggiornata
      const userId = currentUser.uid;
      let remainingProjects = [];
      if (userId && window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
        try {
          await syncProjectsFromFirestore(userId);
          remainingProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
        } catch (error) {
          console.error('[DeleteCurrent] Errore sincronizzazione dopo cancellazione:', error);
          // Fallback: usa la lista locale già filtrata
          remainingProjects = filteredProjects;
        }
      } else {
        // Fallback: usa la lista locale già filtrata
        remainingProjects = filteredProjects;
      }
      
      showNotification('Project deleted successfully!', 'success');
      
      // Se non ci sono più progetti, mostra il modale di selezione e torna alla tab Projects
      if (remainingProjects.length === 0) {
        console.log('[DeleteCurrent] Nessun progetto rimasto, mostro modale selezione');
        // Rimuovi progetto attivo se ancora presente
        localStorage.removeItem('amiantoActiveProjectName');
        localStorage.removeItem('amiantoActiveProjectOwner');
        // Pulisci l'editor
        rooms = new Map();
        currentRoomId = null;
        background = null;
        foregrounds = [];
        sceneObjects = [];
        guis = [];
        characters = [];
        contextualCursors = [];
        
        // Disabilita altre tab (non c'è più un progetto aperto)
        enableOtherTabs(false);
        
        // Torna alla tab Projects
        if (typeof showSectionById === 'function') {
          showSectionById('projects', false);
        } else {
          // Fallback: usa il bottone direttamente
          const projectsButton = document.querySelector(`[data-section="projects"]`);
          if (projectsButton) {
            projectsButton.click();
          }
        }
        
        // Mostra il modale (forzato, anche se c'era un progetto attivo)
        await showProjectSelectionModal(true);
      }
    }
  };

  // Export project (placeholder)
  window.exportProject = function() {
    if (!currentUser) {
      showNotification('Please login to export projects', 'warning');
      return;
    }
    const jsonString = window.serializeProjectToJsonString(true);
    const obj = window.serializeProject();
    const fileName = (obj.settings && obj.settings.name ? obj.settings.name : 'amianto-project') + '.amianto.json';
    downloadBlob(jsonString, fileName, 'application/json');
    showNotification('Project exported as JSON', 'success');
  };

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
    
    redraw();
    refreshGUIButtonsList();
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
      }
    }
  } catch(_) {}

  // Contextual cursors management functions
  window.createCursor = function() {
    const targetType = document.getElementById('cursor-target-type').value;
    const targetId = document.getElementById('cursor-target-selector').value;
    const actionText = document.getElementById('cursor-action-text').value;
    
    if (!targetId) {
      showNotification('Please select a target object', 'warning');
      return;
    }
    
    const newCursor = {
      id: uid('cursor'),
      targetType: targetType,
      targetId: targetId,
      cursorImage: null,
      actionText: actionText || '',
      scriptName: ''
    };
    
    contextualCursors.push(newCursor);
    refreshCursorsList();
    showNotification(`Cursor created for ${targetType}: ${targetId}`, 'success');
  };

  window.editCursor = function() {
    if (!selectedCursorId) {
      showNotification('No cursor selected', 'warning');
      return;
    }
    
    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    
    // Update cursor properties from form
    cursor.targetType = document.getElementById('cursor-target-type').value;
    cursor.targetId = document.getElementById('cursor-target-selector').value;
    cursor.actionText = document.getElementById('cursor-action-text').value;
    
    refreshCursorsList();
    showNotification(`Cursor updated for ${cursor.targetType}: ${cursor.targetId}`, 'success');
  };

  window.deleteCursor = function() {
    if (!selectedCursorId) {
      showNotification('No cursor selected', 'warning');
      return;
    }
    
    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    
    if (!confirm(`Delete cursor for ${cursor.targetType}: ${cursor.targetId}?`)) return;
    
    contextualCursors = contextualCursors.filter(c => c.id !== selectedCursorId);
    selectedCursorId = null;
    refreshCursorsList();
    showNotification('Cursor deleted', 'success');
  };

  window.uploadCursorImage = async function() {
    if (!selectedCursorId) {
      showNotification('Select a cursor first', 'warning');
      return;
    }

    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;

    if (!currentUser) {
      showNotification('Please log in', 'warning');
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
      showNotification(`Cursor set: ${cursor.targetType} / ${cursor.targetId}`, 'success');
      refreshCursorsList();
    } catch (error) {
      console.error('[Asset] Errore cursore da Resources:', error);
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  const btnCursorBrowse = document.getElementById('btn-cursor-browse-image');
  if (btnCursorBrowse) {
    btnCursorBrowse.addEventListener('click', () => window.uploadCursorImage());
  }

  updateCursorTargets = function() {
    const targetType = document.getElementById('cursor-target-type').value;
    const selector = document.getElementById('cursor-target-selector');
    
    let placeholderText = 'Select target...';
    let hasOptions = false;
    
    switch (targetType) {
      case 'hotspot':
        if (hotspots.length === 0) {
          placeholderText = 'No hotspots available';
        } else {
          placeholderText = 'Select hotspot...';
          hasOptions = true;
        }
        break;
        
      case 'character':
        const characters = document.querySelectorAll('#characters-list .list-group-item strong');
        if (characters.length === 0) {
          placeholderText = 'No characters available';
        } else {
          placeholderText = 'Select character...';
          hasOptions = true;
        }
        break;
        
      case 'scene-object':
        if (sceneObjects.length === 0) {
          placeholderText = 'No scene objects available';
        } else {
          placeholderText = 'Select scene object...';
          hasOptions = true;
        }
        break;
    }
    
    selector.innerHTML = `<option value="">${placeholderText}</option>`;
    
    if (hasOptions) {
      switch (targetType) {
        case 'hotspot':
          hotspots.forEach(hotspot => {
            const opt = document.createElement('option');
            opt.value = hotspot.id;
            opt.textContent = hotspot.name || hotspot.id;
            selector.appendChild(opt);
          });
          break;
          
        case 'character':
          document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => {
            const name = s.textContent.trim();
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            selector.appendChild(opt);
          });
          break;
          
        case 'scene-object':
          sceneObjects.forEach(obj => {
            const opt = document.createElement('option');
            opt.value = obj.id;
            opt.textContent = obj.name || obj.id;
            selector.appendChild(opt);
          });
          break;
      }
    }
  };
  window.updateCursorTargets = updateCursorTargets;

  window.attachScriptToCursor = function() {
    const cursorId = document.getElementById('cursor-script-target').value;
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
    showNotification(`Script "${scriptName}" attached to cursor ${cursor.targetType}: ${cursor.targetId}`, 'success');
  };

  function refreshCursorsList() {
    const list = document.getElementById('cursors-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    contextualCursors.forEach(cursor => {
      const item = document.createElement('div');
      item.className = `list-group-item list-group-item-action ${selectedCursorId === cursor.id ? 'active' : ''}`;
      item.dataset.cursorId = cursor.id;
      
      const hasImage = cursor.cursorImage ? '✅' : '❌';
      const hasScript = cursor.scriptName ? '📜' : '';
      
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${cursor.targetType}: ${cursor.targetId}</strong>
            <br>
            <small class="text-muted">
              ${hasImage} Image ${hasScript} Script
              ${cursor.actionText ? `| "${cursor.actionText}"` : ''}
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
  }

  function selectCursor(cursorId) {
    selectedCursorId = cursorId;
    const cursor = contextualCursors.find(c => c.id === cursorId);
    if (!cursor) return;
    
    // Update form with cursor data
    document.getElementById('cursor-target-type').value = cursor.targetType;
    document.getElementById('cursor-target-selector').value = cursor.targetId;
    document.getElementById('cursor-action-text').value = cursor.actionText || '';
    
    // Update target selector
    updateCursorTargets();
    document.getElementById('cursor-target-selector').value = cursor.targetId;
    
    refreshCursorsList();
    showNotification(`Selected cursor for ${cursor.targetType}: ${cursor.targetId}`, 'info');
  }

  window.selectCursor = selectCursor;

  window.deleteCursorById = function(cursorId) {
    const cursor = contextualCursors.find(c => c.id === cursorId);
    if (!cursor) return;
    
    if (!confirm(`Delete cursor for ${cursor.targetType}: ${cursor.targetId}?`)) return;
    
    contextualCursors = contextualCursors.filter(c => c.id !== cursorId);
    if (selectedCursorId === cursorId) selectedCursorId = null;
    refreshCursorsList();
    showNotification('Cursor deleted', 'success');
  };

  function refreshCursorScriptTargets() {
    const sel = document.getElementById('cursor-script-target');
    if (!sel) return;
    
    sel.innerHTML = '<option value="">Select cursor...</option>';
    
    // Add available cursors
    contextualCursors.forEach(cursor => {
      const opt = document.createElement('option');
      opt.value = cursor.id;
      opt.textContent = `${cursor.targetType}: ${cursor.targetId}`;
      sel.appendChild(opt);
    });
  }

  // Contextual cursor detection function
  function checkContextualCursor(e) {
    const { x, y } = eventToRoomCoordinates(e.clientX, e.clientY);
    let foundCursor = null;
    
    // Check hotspots
    hotspots.forEach(hotspot => {
      if (isPointInHotspot(x, y, hotspot)) {
        const cursor = contextualCursors.find(c => c.targetType === 'hotspot' && c.targetId === hotspot.id);
        if (cursor) foundCursor = cursor;
      }
    });
    
    // Check characters
    if (!foundCursor) {
      document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => {
        const charName = s.textContent.trim();
        // Simple character hit detection (you might want to improve this)
        const charRect = getCharacterBounds(charName);
        if (charRect && x >= charRect.x && x <= charRect.x + charRect.w && y >= charRect.y && y <= charRect.y + charRect.h) {
          const cursor = contextualCursors.find(c => c.targetType === 'character' && c.targetId === charName);
          if (cursor) foundCursor = cursor;
        }
      });
    }
    
    // Check scene objects
    if (!foundCursor) {
      sceneObjects.forEach(obj => {
        if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
          const cursor = contextualCursors.find(c => c.targetType === 'scene-object' && c.targetId === obj.id);
          if (cursor) foundCursor = cursor;
        }
      });
    }
    
    // Apply cursor if found
    if (foundCursor && foundCursor.cursorImage) {
      canvas.style.cursor = `url(${foundCursor.cursorImage.src}) 0 0, auto`;
    } else {
      canvas.style.cursor = 'default';
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
  function initializeCursorSystem() {
    updateCursorTargets();
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

  // Inizializza il resize handle quando il DOM è pronto
  initializeConsoleResize();

  // ============================================
  // Console Log Toggle - nascondi/mostra console log
  // ============================================
  function initializeConsoleLogToggle() {
    const toggleBtn = document.getElementById('console-log-toggle');
    const toggleIcon = document.getElementById('console-log-toggle-icon');
    const logsContainer = document.getElementById('logs-container');
    const resizeHandle = document.getElementById('console-resize-handle');
    
    if (!toggleBtn || !toggleIcon || !logsContainer || !resizeHandle) {
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
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
        toggleBtn.title = 'Nascondi console log';
        if (wrapper) wrapper.classList.remove('console-hidden');
      } else {
        logsContainer.style.display = 'none';
        resizeHandle.style.display = 'none';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
        toggleBtn.title = 'Mostra console log';
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

  // Inizializza il toggle quando il DOM è pronto
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
