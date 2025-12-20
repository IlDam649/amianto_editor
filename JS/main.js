// main.js
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
    
    const targetSection = document.getElementById(id);
    const targetButton = document.querySelector(`[data-section="${id}"]`);
    
    if (!targetSection || !targetButton) {
      console.warn(`Section "${id}" not found`);
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
  
  // Multiple GUI management
  let guis = []; // Array of GUI objects: { id, name, background, buttons }
  let currentGuiId = null;

  // Asset management: mappa per tracciare assetId associati alle immagini
  // Struttura: Map<Image, {assetId, type, projectId}>
  // Usata per serializzare assetId invece di dataURL
  const imageAssetMap = new Map();
  
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
  // Each hotspot: { id, name, points: [{x,y}], visible: true, script: string }
  let hotspots = [];
  let activeHotspotId = null;
  let isDrawingHotspot = false;
  let showHotspots = true;
  let isDraggingHotspotVertex = false;
  let draggedHotspotVertexIndex = -1;
  let selectedHotspotVertexIndex = -1;

  // Scene object drag & drop state
  let isDraggingObject = false;
  let draggedObject = null;
  let dragOffset = { x: 0, y: 0 };

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

  // Initialize canvas with game viewport size
  function initializeCanvas() {
    canvas.width = gameViewport.width;
    canvas.height = gameViewport.height;
    updateEditorDisplay();
    // ensure at least one room exists
    if (!currentRoomId) {
      const rid = uid('room');
      rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], walkableArea: [] });
      currentRoomId = rid;
      bindRoomRefs();
      refreshRoomsSelector();
    }
    redraw();
  }

  function bindRoomRefs() {
    const r = rooms.get(currentRoomId);
    if (!r) return;
    background = r.background;
    foregrounds = r.foregrounds;
    sceneObjects = r.sceneObjects;
    walkableArea = r.walkableArea;
    // initialize hotspots container if missing for backward compatibility
    if (!Array.isArray(r.hotspots)) r.hotspots = [];
    hotspots = r.hotspots;
    // auto select first hotspot if none
    if (!activeHotspotId && hotspots.length > 0) activeHotspotId = hotspots[0].id;
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

  // Convert screen coordinates to world coordinates
  function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    // Calculate scaling factor between CSS dimensions and internal canvas dimensions
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert CSS coordinates to internal canvas coordinates
    const internalX = canvasX * scaleX;
    const internalY = canvasY * scaleY;
    
    // Calcola l'offset di centratura (stesso calcolo usato in redraw)
    let centerOffsetX = 0;
    let centerOffsetY = 0;
    if (rect.width > 0 && rect.height > 0) {
      const scaledContentWidth = gameViewport.width * editorState.zoom;
      const scaledContentHeight = gameViewport.height * editorState.zoom;
      const cssOffsetX = (rect.width - scaledContentWidth) / 2;
      const cssOffsetY = (rect.height - scaledContentHeight) / 2;
      centerOffsetX = cssOffsetX * scaleX;
      centerOffsetY = cssOffsetY * scaleY;
    }
    
    // Apply inverse transformations (considerando anche l'offset di centratura)
    const worldX = (internalX - centerOffsetX - editorState.panX) / editorState.zoom;
    const worldY = (internalY - centerOffsetY - editorState.panY) / editorState.zoom;
    
    // Debug logging (can be removed in production)
    if (window.debugCoordinates) {
      console.log('Coordinate conversion:', {
        screen: { x: screenX, y: screenY },
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        canvas: { width: canvas.width, height: canvas.height },
        scale: { x: scaleX, y: scaleY },
        internal: { x: internalX, y: internalY },
        centerOffset: { x: centerOffsetX, y: centerOffsetY },
        world: { x: worldX, y: worldY }
      });
    }
    
    return { x: worldX, y: worldY };
  }

  // Convert mouse event to room-space coordinates (compensates zoom/pan and editor offsets)
  function eventToRoomCoordinates(clientX, clientY) {
    const worldPos = screenToWorld(clientX, clientY);
    // Don't round coordinates to avoid offset issues - keep precision
    const x = worldPos.x;
    const y = worldPos.y;
    return { x, y };
  }

  // Check if a point is inside a scene object
  function getObjectAtPoint(worldX, worldY) {
    // Check objects in reverse order (top to bottom)
    for (let i = sceneObjects.length - 1; i >= 0; i--) {
      const obj = sceneObjects[i];
      if (!obj.img) continue;
      
      const objX = (obj.x || 0) + (editorState.offsetX || 0);
      const objY = (obj.y || 0) + (editorState.offsetY || 0);
      
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
      // Prepare current frame
      let frame = null;
      if (charData && charData.directions[currentDirection] && charData.directions[currentDirection].frames.length > 0) {
        const dirData = charData.directions[currentDirection];
        const idx = characterPreviewIndex % dirData.frames.length;
        frame = dirData.frames[idx];
      }

      // Ensure canvas is set to game viewport (no stretching by CSS)
      if (canvas.width !== gameViewport.width || canvas.height !== gameViewport.height) {
        canvas.width = gameViewport.width;
        canvas.height = gameViewport.height;
      }

      // Background (no transform)
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply zoom/pan transforms like rooms
      ctx.save();
      ctx.translate(editorState.panX, editorState.panY);
      ctx.scale(editorState.zoom, editorState.zoom);

      // Draw current frame at original size, centered in game viewport space
      if (frame && frame.img) {
        const dx = (gameViewport.width - frame.img.width) / 2;
        const dy = (gameViewport.height - frame.img.height) / 2;
        ctx.drawImage(frame.img, Math.round(dx), Math.round(dy));
      }

      ctx.restore();
      return; // skip rooms rendering
    }

    // Calcola l'offset per centrare il contenuto nel canvas visualizzato
    // Il contenuto ha dimensioni gameViewport.width x gameViewport.height
    // Il canvas viene ridimensionato via CSS, quindi dobbiamo calcolare l'offset
    // considerando le dimensioni CSS del canvas
    const canvasRect = canvas.getBoundingClientRect();
    let centerOffsetX = 0;
    let centerOffsetY = 0;
    
    if (canvasRect.width > 0 && canvasRect.height > 0) {
      // Calcola lo scaling tra canvas interno e canvas visualizzato (CSS)
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;
      
      // Calcola l'offset necessario per centrare il contenuto nel canvas CSS
      // Il contenuto ha dimensioni gameViewport.width x gameViewport.height
      // Dopo lo zoom, le dimensioni diventano gameViewport.width * zoom x gameViewport.height * zoom
      const scaledContentWidth = gameViewport.width * editorState.zoom;
      const scaledContentHeight = gameViewport.height * editorState.zoom;
      
      // Calcola l'offset per centrare il contenuto nel canvas CSS (in coordinate CSS)
      const cssOffsetX = (canvasRect.width - scaledContentWidth) / 2;
      const cssOffsetY = (canvasRect.height - scaledContentHeight) / 2;
      
      // Converti l'offset da coordinate CSS a coordinate canvas interne
      centerOffsetX = cssOffsetX * scaleX;
      centerOffsetY = cssOffsetY * scaleY;
    }

    // Apply transformations: prima centra, poi pan, poi zoom
    ctx.save();
    ctx.translate(centerOffsetX + editorState.panX, centerOffsetY + editorState.panY);
    ctx.scale(editorState.zoom, editorState.zoom);

    // Default (Rooms tab): draw scene
    // Draw background at original size
    // L'origine (0,0) è ora nell'angolo in alto a sinistra del contenuto centrato
    if (background) {
      drawImageAtOriginalSize(background, 0, 0);
    } else {
      // Placeholder background
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, gameViewport.width, gameViewport.height);
    }

    // Draw scene objects at their positions
    for (let obj of sceneObjects) {
      if (obj && obj.img) {
        if (obj.visible === false) continue;
        const objX = (obj.x || 0);
        const objY = (obj.y || 0);
        const rot = Number(obj.rotationRad || 0);
        const sx = (typeof obj.scaleX === 'number') ? obj.scaleX : 1;
        const sy = (typeof obj.scaleY === 'number') ? obj.scaleY : 1;

        if (rot !== 0 || sx !== 1 || sy !== 1) {
          ctx.save();
          ctx.translate(objX, objY);
          if (rot !== 0) ctx.rotate(rot);
          if (sx !== 1 || sy !== 1) ctx.scale(Math.max(0.01, sx), Math.max(0.01, sy));
          // draw image at origin with its natural size
          ctx.drawImage(obj.img, 0, 0, obj.img.width, obj.img.height);
          ctx.restore();
        } else {
          // Draw object without transforms
          drawImageAtOriginalSize(obj.img, objX, objY);
        }
        
        // Draw selection outline if this is the dragged object
        if (isDraggingObject && draggedObject && draggedObject.id === obj.id) {
          ctx.save();
          ctx.strokeStyle = 'rgba(57,255,20,0.8)';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(objX, objY, obj.img.width, obj.img.height);
          ctx.restore();
        }
      }
    }

    // Draw foregrounds at original sizes
    for (let layer of foregrounds) {
      if (layer.img) {
        drawImageAtOriginalSize(layer.img, layer.offsetX || 0, layer.offsetY || 0);
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

    // Hotspots overlay (draw after walkable, before UI)
    if (showHotspots && hotspots.length > 0) {
      ctx.save();
      for (const hs of hotspots) {
        if (!hs || hs.visible === false) continue;
        const pts = Array.isArray(hs.points) ? hs.points : [];
        if (pts.length <= 1) continue;
        // color: orange, active highlighted
        const isActive = hs.id === activeHotspotId;
        ctx.strokeStyle = isActive ? 'rgba(255,165,0,1.0)' : 'rgba(255,165,0,0.9)';
        ctx.fillStyle = isActive ? 'rgba(255,165,0,0.18)' : 'rgba(255,165,0,0.12)';
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (!isDrawingHotspot && pts.length > 2) ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // vertices
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          ctx.beginPath();
          const isSelectedVertex = isActive && i === selectedHotspotVertexIndex;
          const radius = isSelectedVertex ? 5 : 3;
          ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
          ctx.fillStyle = isSelectedVertex ? 'rgba(255,215,0,1.0)' : 'rgba(255,165,0,0.95)';
          ctx.fill();
        }
      }
      ctx.restore();
    }

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
      } else if (e.button === 0 && !e.ctrlKey && !isDrawingWalkable && !isDrawingGuiButton) { // Left click without Ctrl
        // Check for GUI button interaction
        const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
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
        // Check if clicking on a scene object
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const clickedObject = getObjectAtPoint(worldPos.x, worldPos.y);
        
        if (clickedObject) {
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
    });

    canvas.addEventListener('mousemove', function(e) {
      // Check for contextual cursor changes
      checkContextualCursor(e);
      
      // Check for hotspot vertex editing cursor changes
      updateHotspotCursor(e);
      
      if (editorState.isPanning) {
        e.preventDefault();
        const deltaX = e.clientX - editorState.lastPanX;
        const deltaY = e.clientY - editorState.lastPanY;
        
        editorState.panX += deltaX;
        editorState.panY += deltaY;
        
        editorState.lastPanX = e.clientX;
        editorState.lastPanY = e.clientY;
        
        redraw();
      } else if (isDraggingObject && draggedObject) {
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
      } else if (isDrawingGuiButton && guiDrawStart) {
        e.preventDefault();
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const x0 = Math.min(guiDrawStart.x, worldPos.x);
        const y0 = Math.min(guiDrawStart.y, worldPos.y);
        const w = Math.abs(worldPos.x - guiDrawStart.x);
        const h = Math.abs(worldPos.y - guiDrawStart.y);
        // temporary preview by updating last placeholder
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

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });
  }

  // Canvas clicks: add vertices while drawing walkable or hotspot
  canvas.addEventListener('click', (e) => {
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

    // GUI selection when in GUI tab
    const activeTab = window.__amiantoTabs ? window.__amiantoTabs.getCurrentTab() : 'rooms';
    if (activeTab === 'gui') {
      const hit = guiButtons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (hit) {
        selectedGuiButtonId = hit.id;
        refreshGuiButtonsList();
        redraw();
      }
    }

if (playTestState && playTestState.isRunning) {
      const obj = getObjectAtPoint(x, y);
      if (obj && !isDraggingObject) {
        // Trigger global object click event
        triggerObjectClick(obj.id, Math.round(x), Math.round(y));
        
        try {
          // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
        } catch(_) {}
        const scriptName = objectScripts.get(obj.id);
        if (scriptName) {
          const content = jsScripts.get(scriptName);
          const eventConditions = objectEventConditions.get(obj.id);
          const conditions = eventConditions && eventConditions.onClick ? eventConditions.onClick : null;
          addDebugMessage(`[Object:onClick] ${obj.id}`, 'info');
          executeScriptHandler(content, 'on_object_click', [obj.id, Math.round(x), Math.round(y)], conditions);
        }
        return;
      }
for (const hs of hotspots) {
        if (!hs || hs.visible === false) continue;
        if (isPointInPolygon(hs.points || [], x, y)) {
          // Trigger global hotspot click event
          triggerHotspotClick(hs.id);
          
          try {
            // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
          } catch(_) {}
          const hScript = hotspotScripts.get(hs.id);
          if (hScript) {
            const hContent = jsScripts.get(hScript);
            const eventConditions = hotspotEventConditions.get(hs.id);
            const conditions = eventConditions && eventConditions.onClick ? eventConditions.onClick : null;
            addDebugMessage(`[Hotspot:onClick] ${hs.id}`, 'info');
            executeScriptHandler(hContent, 'on_hotspot_click', [hs.id], conditions);
          }
          break;
        }
      }
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

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (editorState.isPanning) return;
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
  window.startWalkableDrawing = function() { isDrawingWalkable = true; showWalkable = true; redraw(); };
  window.finishWalkableDrawing = function() { isDrawingWalkable = false; redraw(); };
  window.clearWalkableArea = function() { walkableArea = []; redraw(); };
  window.toggleWalkableVisibility = function() { showWalkable = !showWalkable; redraw(); };

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

      const name = document.createElement('div');
      name.innerHTML = `<strong>${hs.name || 'Hotspot'}</strong>` +
        `<br><small>Points: ${(hs.points && hs.points.length) || 0}</small>` +
        `<br><span class="badge ${hs.visible === false ? 'bg-dark' : 'bg-warning text-dark'}">${hs.visible === false ? 'Hidden' : 'Visible'}</span>` +
        (activeHotspotId === hs.id ? ' <span class="badge bg-info text-dark">Active</span>' : '');

      const controls = document.createElement('div');

      const btnSelect = document.createElement('button');
      btnSelect.className = 'btn btn-sm btn-outline-light me-1';
      btnSelect.title = 'Select';
      btnSelect.textContent = '✔';
      btnSelect.addEventListener('click', () => {
        activeHotspotId = hs.id;
        isDrawingHotspot = false; // stop drawing when switching
        selectedHotspotVertexIndex = -1;
        refreshHotspotsListUI();
        redraw();
      });

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-outline-light me-1';
      btnEdit.title = 'Rename';
      btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', () => {
        const newName = prompt('Hotspot name:', hs.name || 'Hotspot');
        if (newName && newName.trim() !== '') {
          hs.name = newName.trim();
          const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
          refreshHotspotsListUI();
        }
      });


      const btnToggle = document.createElement('button');
      btnToggle.className = 'btn btn-sm btn-outline-warning me-1';
      btnToggle.title = 'Show/Hide';
      btnToggle.textContent = '👁️';
      btnToggle.addEventListener('click', () => {
        hs.visible = hs.visible === false ? true : false;
        const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
        refreshHotspotsListUI();
        redraw();
      });

      const btnClear = document.createElement('button');
      btnClear.className = 'btn btn-sm btn-outline-danger me-1';
      btnClear.title = 'Svuota punti';
      btnClear.textContent = '🧹';
      btnClear.addEventListener('click', () => {
        hs.points = [];
        if (activeHotspotId === hs.id) selectedHotspotVertexIndex = -1;
        const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
        refreshHotspotsListUI();
        redraw();
      });

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn btn-sm btn-danger';
      btnDelete.title = 'Delete';
      btnDelete.textContent = '🗑️';
      btnDelete.addEventListener('click', () => {
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
      controls.appendChild(btnToggle);
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
      visible: true
    };
    hotspots.push(hs);
    activeHotspotId = hs.id;
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    refreshHotspotsListUI();
    if (typeof refreshHotspotScriptTargets === 'function') refreshHotspotScriptTargets();
    redraw();
  };

  window.startHotspotDrawing = function() {
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
      showNotification('Un hotspot deve avere almeno 3 vertici', 'warning');
      return;
    }
    
    hs.points.splice(selectedHotspotVertexIndex, 1);
    selectedHotspotVertexIndex = -1;
    const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
    refreshHotspotsListUI();
    redraw();
    showNotification('Vertice eliminato dall\'hotspot', 'success');
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
      showNotification('Vertex aggiunto all\'hotspot', 'success');
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

  // Fit canvas to screen (for editor view)
  window.fitToScreen = function() {
    const container = document.getElementById('canvasContainer');
    const containerWidth = container.clientWidth - 20; // padding
    const containerHeight = container.clientHeight - 20; // padding
    
    // Calculate zoom to fit
    const zoomX = containerWidth / gameViewport.width;
    const zoomY = containerHeight / gameViewport.height;
    const zoom = Math.min(zoomX, zoomY, 1.0); // Don't zoom in beyond 100%
    
    // Imposta lo zoom e resetta il pan (il centraggio è automatico in redraw)
    editorState.zoom = zoom;
    editorState.panX = 0;
    editorState.panY = 0;
    
    updateEditorDisplay();
    redraw();
    
    showNotification(`Canvas fitted to screen (${Math.round(zoom * 100)}%)`, 'info');
  };

  // Reset editor zoom and pan
  window.resetEditorZoom = function() {
    editorState.zoom = 1.0;
    editorState.panX = 0;
    editorState.panY = 0;
    updateEditorDisplay();
    redraw();
    showNotification('Editor zoom and pan reset', 'info');
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
    // Resetta il pan (il centraggio è automatico in redraw)
    editorState.panX = 0;
    editorState.panY = 0;
    
    updateEditorDisplay();
    redraw();
    
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

    foregrounds.forEach((layer, idx) => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center bg-secondary text-light";
      li.dataset.index = idx;

      const label = document.createElement("span");
      label.textContent = layer.name || `Layer ${idx + 1}`;
      label.style.userSelect = "none";

      const controls = document.createElement("div");

      // delete
      const del = document.createElement("button");
      del.className = "btn btn-sm btn-danger ms-2";
      del.textContent = "✕";
      del.title = "Delete layer";
      del.addEventListener("click", () => {
        foregrounds.splice(idx, 1);
        refreshForegroundListUI();
        redraw();
      });

      // optional: move up/down buttons (keyboard users)
      const up = document.createElement("button");
      up.className = "btn btn-sm btn-outline-light me-1";
      up.textContent = "↑";
      up.title = "Move up";
      up.addEventListener("click", () => {
        if (idx <= 0) return;
        [foregrounds[idx - 1], foregrounds[idx]] = [foregrounds[idx], foregrounds[idx - 1]];
        refreshForegroundListUI();
        redraw();
      });

      const down = document.createElement("button");
      down.className = "btn btn-sm btn-outline-light me-1";
      down.textContent = "↓";
      down.title = "Move down";
      down.addEventListener("click", () => {
        if (idx >= foregrounds.length - 1) return;
        [foregrounds[idx + 1], foregrounds[idx]] = [foregrounds[idx], foregrounds[idx + 1]];
        refreshForegroundListUI();
        redraw();
      });

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
  }

  window.createRoom = function() {
    const name = prompt('Room name:', `Room ${rooms.size + 1}`);
    if (!name) return;
    const rid = uid('room');
    const prevRoomId = currentRoomId;
    rooms.set(rid, { id: rid, name, background: null, foregrounds: [], sceneObjects: [], walkableArea: [] });
    currentRoomId = rid;
    bindRoomRefs();
    refreshRoomsSelector();
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

  window.deleteRoom = function() {
    if (rooms.size <= 1) { showNotification('At least one room is required', 'warning'); return; }
    if (!confirm('Delete current room?')) return;
    const prevRoomId = currentRoomId;
    rooms.delete(currentRoomId);
    // pick another existing room
    const first = rooms.keys().next().value;
    currentRoomId = first;
    bindRoomRefs();
    refreshRoomsSelector();
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
    refreshRoomsSelector();
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

  // ==== Handlers for Add Background / Add Foreground buttons ====
  const btnAddBg = document.getElementById("btn-add-bg");
  const btnAddFg = document.getElementById("btn-add-fg");

  if (btnAddBg) {
    btnAddBg.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        
        // Verifica che l'utente sia autenticato e che ci sia un progetto aperto
        if (!currentUser || !currentUser.uid) {
          showNotification('Please login to upload images', 'warning');
          return;
        }
        
        const projectName = localStorage.getItem('amiantoActiveProjectName') || 'amianto-project';
        const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        
        try {
          showNotification('Uploading background...', 'info');
          
          // Upload immagine su Firebase Storage
          const { assetId, downloadURL } = await uploadImage(file, projectId, 'background');
          
          // Carica immagine dall'URL
          const img = await loadImageFromUrl(downloadURL);
          if (!img) {
            throw new Error('Failed to load image from URL');
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
            throw new Error(`Immagine caricata ma senza dimensioni valide: ${finalWidth}×${finalHeight}`);
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
          
          // Registra nella mappa asset
          imageAssetMap.set(img, { assetId, type: 'background', projectId });
          
          // Imposta come background corrente
          background = img;
          const r = rooms.get(currentRoomId);
          if (r) r.background = img;
          
          showNotification(`Background uploaded: ${finalWidth}×${finalHeight}`, 'success');
          redraw();
        } catch (error) {
          console.error('[Asset] Errore upload background:', error);
          showNotification(`Failed to upload background: ${error.message}`, 'error');
          
          // Fallback: carica localmente senza upload
          const img = new Image();
          img.onload = () => {
            background = img;
            const r = rooms.get(currentRoomId); if (r) r.background = img;
            showNotification(`Background loaded locally (not saved): ${img.width}×${img.height}`, 'warning');
            redraw();
          };
          img.src = URL.createObjectURL(file);
        }
      };
      input.click();
    });
  } else {
    // console.warn("btn-add-bg not found");
  }

  if (btnAddFg) {
    btnAddFg.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        
        // Verifica che l'utente sia autenticato e che ci sia un progetto aperto
        if (!currentUser || !currentUser.uid) {
          showNotification('Please login to upload images', 'warning');
          return;
        }
        
        const projectName = localStorage.getItem('amiantoActiveProjectName') || 'amianto-project';
        const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
        
        try {
          showNotification('Uploading foreground layer...', 'info');
          
          // Upload immagine su Firebase Storage
          const { assetId, downloadURL } = await uploadImage(file, projectId, 'foreground');
          
          // Carica immagine dall'URL
          const img = await loadImageFromUrl(downloadURL);
          if (!img) {
            throw new Error('Failed to load image from URL');
          }
          
          // Registra nella mappa asset
          imageAssetMap.set(img, { assetId, type: 'foreground', projectId });
          
          // Crea layer foreground
          const layer = {
            id: uid("fg"),
            name: file.name || `Layer ${foregrounds.length + 1}`,
            img: img,
            offsetX: 0,
            offsetY: 0
          };
          foregrounds.push(layer);
          const r = rooms.get(currentRoomId);
          if (r) r.foregrounds = foregrounds;
          
          refreshForegroundListUI();
          showNotification('Foreground layer uploaded', 'success');
          redraw();
        } catch (error) {
          console.error('[Asset] Errore upload foreground:', error);
          showNotification(`Failed to upload foreground: ${error.message}`, 'error');
          
          // Fallback: carica localmente senza upload
          const img = new Image();
          img.onload = () => {
            const layer = {
              id: uid("fg"),
              name: file.name || `Layer ${foregrounds.length + 1}`,
              img: img,
              offsetX: 0,
              offsetY: 0
            };
            foregrounds.push(layer);
            const r = rooms.get(currentRoomId); if (r) r.foregrounds = foregrounds;
            refreshForegroundListUI();
            showNotification('Foreground loaded locally (not saved)', 'warning');
            redraw();
          };
          img.src = URL.createObjectURL(file);
        }
      };
      input.click();
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
    btnAddGuiBg.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        
        // TODO: not yet implemented - Upload GUI background to Firebase Storage
        // Per ora carica localmente come fallback
        const img = new Image();
        img.onload = () => { guiBackground = img; saveCurrentGUI(); showNotification('GUI background loaded (not saved to Storage)', 'warning'); redraw(); };
        img.src = URL.createObjectURL(file);
      };
      input.click();
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
      case 'Inventory': {
        frag.appendChild(makeInput('Rows', 'gui-set-rows', 'number', settings.rows ?? 3, { min: 1 }));
        frag.appendChild(makeInput('Columns', 'gui-set-cols', 'number', settings.cols ?? 5, { min: 1 }));
        frag.appendChild(makeSelect('Slot style', 'gui-set-slot-style', [
          {value:'square', label:'Square'},
          {value:'rounded', label:'Rounded'},
          {value:'circle', label:'Circle'}
        ], settings.slotStyle || 'square'));
        frag.appendChild(makeInput('Background', 'gui-set-bg', 'text', settings.background || 'rgba(0,0,0,0.5)'));
        frag.appendChild(makeSelect('Open animation', 'gui-set-open-anim', [
          {value:'none', label:'None'},
          {value:'scale', label:'Scale'},
          {value:'fade', label:'Fade'}
        ], settings.openAnim || 'none'));
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
      case 'Inventory':
        return {
          rows: get('gui-set-rows') || 3,
          cols: get('gui-set-cols') || 5,
          slotStyle: get('gui-set-slot-style') || 'square',
          background: get('gui-set-bg') || 'rgba(0,0,0,0.5)',
          openAnim: get('gui-set-open-anim') || 'none'
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
      btnImage.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = e.target.files ? e.target.files[0] : null;
          if (!file) return;
          const img = new Image();
          img.onload = () => { 
            btn.backgroundImage = img; 
            saveCurrentGUI();
            showNotification(`Background image set for ${btn.name}`, 'success'); 
            redraw(); 
          };
          img.src = URL.createObjectURL(file);
        };
        input.click();
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

  // Handle window resize
  window.addEventListener("resize", () => {
    updateEditorDisplay();
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

  // Functions for Inventory Objects tab
  window.addInventoryObject = function() {
    document.getElementById('inventory-upload').click();
  };

  window.uploadInventoryObject = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Generate unique name even for same image
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const timestamp = Date.now();
    const objectName = `${baseName}_${timestamp}`;
    const inventoryList = document.getElementById('inventory-list');
    
    const newObject = document.createElement('div');
    newObject.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
    newObject.innerHTML = `
      <div>
        <strong>${objectName}</strong>
        <br><small>Inventory item</small>
        <br><span class="badge bg-primary">Pickup</span>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editInventoryObject(this)">✏️</button>
        <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeInventoryObject(this)">🗑️</button>
      </div>
    `;
    
    inventoryList.appendChild(newObject);
    
    // Reset input to allow same file selection again
    input.value = '';
    
    // Show notification
    showNotification(`Inventory item "${objectName}" added!`, 'success');
  };

  window.filterInventoryObjects = function(searchTerm) {
    const objects = document.querySelectorAll('#inventory-list .list-group-item');
    objects.forEach(obj => {
      const text = obj.textContent.toLowerCase();
      const matches = text.includes(searchTerm.toLowerCase());
      obj.style.display = matches ? 'flex' : 'none';
    });
  };

  window.removeInventoryObject = function(button) {
    if (confirm('Are you sure you want to delete this inventory item?')) {
      button.closest('.list-group-item').remove();
      showNotification('Inventory item deleted!', 'info');
    }
  };

  window.editInventoryObject = function(button) {
    const listItem = button.closest('.list-group-item');
    const nameElement = listItem.querySelector('strong');
    const currentName = nameElement.textContent;
    
    const newName = prompt('Edit inventory item name:', currentName);
    if (newName && newName.trim() !== '') {
      nameElement.textContent = newName.trim();
      showNotification(`Inventory item renamed to "${newName.trim()}"`, 'success');
    }
  };

  // Functions for Scene Objects (in Rooms tab)
  window.addSceneObject = function() {
    document.getElementById('scene-object-upload').click();
  };

  window.uploadSceneObject = async function(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Verifica che l'utente sia autenticato e che ci sia un progetto aperto
    if (!currentUser || !currentUser.uid) {
      showNotification('Please login to upload images', 'warning');
      return;
    }
    
    const projectName = localStorage.getItem('amiantoActiveProjectName') || 'amianto-project';
    const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
    
    try {
      showNotification('Uploading scene object...', 'info');
      
      // Upload immagine su Firebase Storage
      const { assetId, downloadURL } = await uploadImage(file, projectId, 'sprite');
      
      // Carica immagine dall'URL
      const img = await loadImageFromUrl(downloadURL);
      if (!img) {
        throw new Error('Failed to load image from URL');
      }
      
      // Registra nella mappa asset
      imageAssetMap.set(img, { assetId, type: 'sprite', projectId });
      
      // Generate unique name even for same image
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const timestamp = Date.now();
      const objectName = `${baseName}_${timestamp}`;
      
      // Create scene object data
      const sceneObject = {
        id: uid("scene"),
        name: objectName,
        img: img,
        x: 100 + Math.random() * 200, // Random position for demo
        y: 100 + Math.random() * 200,
        type: "Interactive",
        rotationRad: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true
      };
      
      // Add to scene objects array (room-scoped)
      sceneObjects.push(sceneObject);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      
      showNotification('Scene object uploaded', 'success');
      
      // Add to UI list
      const sceneObjectsList = document.getElementById('scene-objects-list');
      const newObject = document.createElement('div');
      newObject.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
      newObject.dataset.objectId = sceneObject.id;
      newObject.innerHTML = `
        <div>
          <strong>${objectName}</strong>
          <br><small>Scene object</small>
          <br><span class="badge bg-warning">Interactive</span>
          <br><small style="color: #888;">Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}</small>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editSceneObject(this)">✏️</button>
          <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeSceneObject(this)">🗑️</button>
        </div>
      `;
      
      sceneObjectsList.appendChild(newObject);
      
      // Redraw canvas to show the new object
      redraw();
      
      // Show notification
      showNotification(`Scene object "${objectName}" added to canvas!`, 'success');
    } catch (error) {
      console.error('[Asset] Errore upload scene object:', error);
      showNotification(`Failed to upload scene object: ${error.message}`, 'error');
      
      // Fallback: carica localmente senza upload
      const img = new Image();
      img.onload = () => {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const timestamp = Date.now();
        const objectName = `${baseName}_${timestamp}`;
        
        const sceneObject = {
          id: uid("scene"),
          name: objectName,
          img: img,
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 200,
          type: "Interactive",
          rotationRad: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true
        };
        
        sceneObjects.push(sceneObject);
        const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
        
        const sceneObjectsList = document.getElementById('scene-objects-list');
        const newObject = document.createElement('div');
        newObject.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
        newObject.dataset.objectId = sceneObject.id;
        newObject.innerHTML = `
          <div>
            <strong>${objectName}</strong>
            <br><small>Scene object</small>
            <br><span class="badge bg-warning">Interactive</span>
            <br><small style="color: #888;">Position: ${Math.round(sceneObject.x)}, ${Math.round(sceneObject.y)}</small>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editSceneObject(this)">✏️</button>
            <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeSceneObject(this)">🗑️</button>
          </div>
        `;
        sceneObjectsList.appendChild(newObject);
        
        showNotification(`Scene object "${objectName}" loaded locally (not saved)`, 'warning');
        redraw();
      };
      img.src = URL.createObjectURL(file);
    }
    
    // Reset input to allow same file selection again
    input.value = '';
  };

  window.filterSceneObjects = function(searchTerm) {
    const objects = document.querySelectorAll('#scene-objects-list .list-group-item');
    objects.forEach(obj => {
      const text = obj.textContent.toLowerCase();
      const matches = text.includes(searchTerm.toLowerCase());
      obj.style.display = matches ? 'flex' : 'none';
    });
  };

  window.removeSceneObject = function(button) {
    if (confirm('Are you sure you want to delete this scene object?')) {
      const listItem = button.closest('.list-group-item');
      const objectId = listItem.dataset.objectId;
      
      // Remove from scene objects array (room-scoped)
      sceneObjects = sceneObjects.filter(obj => obj.id !== objectId);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      
      // Remove from UI
      listItem.remove();
      
      // Redraw canvas
      redraw();
      
      showNotification('Scene object deleted!', 'info');
    }
  };

  window.editSceneObject = function(button) {
    const listItem = button.closest('.list-group-item');
    const objectId = listItem.dataset.objectId;
    const sceneObject = sceneObjects.find(obj => obj.id === objectId);
    
    if (!sceneObject) return;
    
    const nameElement = listItem.querySelector('strong');
    const currentName = nameElement.textContent;
    
    // Create edit dialog
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
  };

  // Functions for Characters tab
  window.addCharacter = function() {
    const name = prompt('Character name:');
    if (!name) return;
    
    const charactersList = document.getElementById('characters-list');
    
    const newCharacter = document.createElement('div');
    newCharacter.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
    newCharacter.innerHTML = `
      <div>
        <strong>${name}</strong>
        <br><small>New character</small>
        <span class="badge bg-success ms-2">Active</span>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-light me-1" title="Edit">✏️</button>
        <button class="btn btn-sm btn-outline-warning me-1" title="Dialogs">💬</button>
        <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeCharacter(this)">🗑️</button>
      </div>
    `;
    
    charactersList.appendChild(newCharacter);
    
    // Aggiorna il dropdown del selettore personaggi
    refreshCharacterSelector();
    // Aggiorna la UI del giocatore iniziale
    refreshStartingPlayerUI();
    
    // Automatically select the new character
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
      characterSelector.value = name;
      loadCharacterDirections();
    }
    
    showNotification(`Character "${name}" added!`, 'success');
  };

  window.removeCharacter = function(button) {
    if (confirm('Are you sure you want to delete this character?')) {
      const characterElement = button.closest('.list-group-item');
      const characterName = characterElement.querySelector('strong').textContent.trim();
      
      characterElement.remove();
      
      // Aggiorna il dropdown del selettore personaggi
      refreshCharacterSelector();
      // Aggiorna la UI del giocatore iniziale
      refreshStartingPlayerUI();
      
    // If the deleted character was selected, deselect
      const characterSelector = document.getElementById('character-selector');
      if (characterSelector && characterSelector.value === characterName) {
        characterSelector.value = '';
        loadCharacterDirections();
      }
      
      showNotification('Character deleted!', 'info');
    }
  };

  window.editCharacter = function(button) {
    const listItem = button.closest('.list-group-item');
    const nameElement = listItem.querySelector('strong');
    const currentName = nameElement.textContent;
    
    const newName = prompt('Edit character name:', currentName);
    if (newName && newName.trim() !== '') {
      const oldName = currentName;
      const trimmedNewName = newName.trim();
      
      nameElement.textContent = trimmedNewName;
      
      // Aggiorna il dropdown del selettore personaggi
      refreshCharacterSelector();
      // Aggiorna la UI del giocatore iniziale
      refreshStartingPlayerUI();
      
    // If the edited character was selected, update selection
      const characterSelector = document.getElementById('character-selector');
      if (characterSelector && characterSelector.value === oldName) {
        characterSelector.value = trimmedNewName;
        loadCharacterDirections();
      }
      
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
  const characterFrames = new Map(); // characterName -> { directions: {north: {frames: [], fps: 8}, northeast: {...}, ...}, currentFrame: 0 }
  let characterPreviewTimer = null;
  let characterPreviewIndex = 0;
  let currentDirection = 'south'; // Default direction

  function refreshCharacterSelector() {
    const sel = document.getElementById('character-selector');
    if (!sel) return;
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Select character...';
    sel.appendChild(opt);
    // read from UI list
    document.querySelectorAll('#characters-list .list-group-item strong').forEach(s => {
      const name = s.textContent.trim();
      const o = document.createElement('option');
      o.value = name; o.textContent = name; sel.appendChild(o);
    });
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

  // Populate start room selector and bind x/y inputs
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

    const startXInput = document.getElementById('start-x');
    const startYInput = document.getElementById('start-y');
    if (startXInput) {
      if (saved && typeof saved.startX !== 'undefined') startXInput.value = String(Number(saved.startX) || 0);
      startXInput.oninput = function() { persistStartSettings({ startX: startXInput.value }); };
    }
    if (startYInput) {
      if (saved && typeof saved.startY !== 'undefined') startYInput.value = String(Number(saved.startY) || 0);
      startYInput.oninput = function() { persistStartSettings({ startY: startYInput.value }); };
    }
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail.currentTab === 'characters') {
      refreshCharacterSelector();
      refreshStartingPlayerUI();
      refreshStartRoomSelector();
    }
  });

  window.loadCharacterDirections = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) return;

    const dirSel = document.getElementById('direction-selector');
    if (!dirSel) return;

    const charData = characterFrames.get(who);
    if (charData && charData.directions) {
      const directions = Object.keys(charData.directions);
      if (directions.length > 0) {
        dirSel.value = directions[0];
        currentDirection = directions[0];
      }
    }
    updateDirectionInfo(); // Update direction info display
  };

  // Add event listener for character selection change
  document.addEventListener('DOMContentLoaded', function() {
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
      characterSelector.addEventListener('change', function() {
        loadCharacterDirections();
      });
    }
    // Initialize Game Start UI
    try { refreshStartingPlayerUI(); } catch(_) {}
    try { refreshStartRoomSelector(); } catch(_) {}
  });

  window.uploadCharacterFrames = function(input) {
    // TODO: not yet implemented - Upload character frames to Firebase Storage
    // Per ora carica localmente come fallback
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); input.value = ''; return; }
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const dirSel = document.getElementById('direction-selector');
    const direction = dirSel ? dirSel.value : 'south';

    let charData = characterFrames.get(who);
    if (!charData) {
      charData = { directions: {}, currentFrame: 0 };
      characterFrames.set(who, charData);
    }

    if (!charData.directions[direction]) {
      charData.directions[direction] = { frames: [], fps: 8 };
    }

    const dirData = charData.directions[direction];
    let remaining = files.length;
    files.forEach(file => {
      const img = new Image();
      img.onload = () => {
        // Generate unique name even for same image
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const timestamp = Date.now();
        const frameName = `${baseName}_${timestamp}`;
        
        // Store frame with unique name
        const frameData = {
          img: img,
          name: frameName,
          duration: 1000 // Default duration
        };
        
        dirData.frames.push(frameData);
        remaining--;
        if (remaining === 0) {
          showNotification(`Loaded ${dirData.frames.length} frames for ${who} (${direction}) - not saved to Storage`, 'warning');
          updateDirectionInfo(); // Update the direction info display
        }
      };
      img.src = URL.createObjectURL(file);
    });
    
    // Reset input to allow same file selection again
    input.value = '';
  };

  window.startCharacterPreview = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }
    const charData = characterFrames.get(who);
    if (!charData || !charData.directions[currentDirection] || !charData.directions[currentDirection].frames.length) {
      showNotification('No frames loaded for this character and direction', 'warning');
      return;
    }

    const dirData = charData.directions[currentDirection];
    characterPreviewIndex = 0;
    const interval = Math.max(1, Math.round(1000 / (dirData.fps || 8)));
    if (characterPreviewTimer) clearInterval(characterPreviewTimer);
    characterPreviewTimer = setInterval(() => {
      characterPreviewIndex++;
      redraw();
    }, interval);
    showNotification(`Preview started for ${who} (${currentDirection}) @ ${dirData.fps} FPS`, 'info');
  };

  window.stopCharacterPreview = function() {
    if (characterPreviewTimer) {
      clearInterval(characterPreviewTimer);
      characterPreviewTimer = null;
      showNotification('Preview stopped', 'info');
    }
  };

  window.clearCharacterFrames = function() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) { showNotification('Select a character first', 'warning'); return; }

    if (confirm('Clear all animation frames for this character?')) {
      characterFrames.delete(who);
      showNotification('Frames cleared for ' + who, 'success');
    }
  };

  // Function to handle direction change
  window.changeCharacterDirection = function() {
    const dirSel = document.getElementById('direction-selector');
    if (dirSel) {
      currentDirection = dirSel.value;
      characterPreviewIndex = 0; // Reset animation index
      updateDirectionInfo(); // Update frame count info
      redraw(); // Update canvas preview
    }
  };

  // Function to update direction info display
  function updateDirectionInfo() {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) return;

    const charData = characterFrames.get(who);
    if (charData && charData.directions[currentDirection]) {
      const frameCount = charData.directions[currentDirection].frames.length;
      const fps = charData.directions[currentDirection].fps;
      
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
      charData = { directions: {}, currentFrame: 0 };
      characterFrames.set(who, charData);
    }

    if (!charData.directions[currentDirection]) {
      charData.directions[currentDirection] = { frames: [], fps: 8 };
    }

    charData.directions[currentDirection].fps = newFPS;
    updateDirectionInfo();
    showNotification(`FPS updated to ${newFPS} for ${who} (${currentDirection})`, 'success');
  };

  // Function to refresh frames preview
  function refreshFramesPreview() {
    const container = document.getElementById('frames-preview');
    if (!container) return;
    
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) {
      container.innerHTML = '<div class="text-muted">Select a character to view frames</div>';
      return;
    }

    const charData = characterFrames.get(who);
    if (!charData || !charData.directions[currentDirection]) {
      container.innerHTML = '<div class="text-muted">No frames loaded for this direction</div>';
      return;
    }

    const frames = charData.directions[currentDirection].frames;
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
      img.src = frameData.img.src;
      img.alt = `Frame ${index + 1}`;
      
      const frameNumber = document.createElement('div');
      frameNumber.className = 'frame-number';
      frameNumber.textContent = index + 1;
      
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
      frameItem.appendChild(frameControls);
      container.appendChild(frameItem);
    });

    // Initialize drag and drop
    initializeFrameDragDrop();
  }

  // Function to delete a frame
  function deleteFrame(frameIndex) {
    const sel = document.getElementById('character-selector');
    const who = sel ? sel.value : '';
    if (!who) return;

    const charData = characterFrames.get(who);
    if (!charData || !charData.directions[currentDirection]) return;

    if (confirm(`Delete frame ${frameIndex + 1}?`)) {
      charData.directions[currentDirection].frames.splice(frameIndex, 1);
      updateDirectionInfo();
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
            if (charData && charData.directions[currentDirection]) {
              const frames = charData.directions[currentDirection].frames;
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
  // Runtime game inventory store: itemId (string) -> count (integer >= 0)
  const gameInventory = new Map();
  
  // Event conditions storage
  const objectEventConditions = new Map(); // sceneObjectId -> { onClick: [conditions], onUse: [conditions], ... }
  const hotspotEventConditions = new Map(); // hotspotId -> { onClick: [conditions], onUse: [conditions], ... }
  const characterEventConditions = new Map(); // characterName -> { onClick: [conditions], onUse: [conditions], ... }
  const guiButtonEventConditions = new Map(); // buttonId -> { onClick: [conditions], ... }
  const inventoryEventConditions = new Map(); // itemName -> { onClick: [conditions], onUse: [conditions], ... }

  // Inventory persistence helpers
  function persistInventory() {
    try {
      const obj = {};
      for (const [k, v] of gameInventory.entries()) obj[String(k)] = Number(v) || 0;
      localStorage.setItem('amiantoGameInventory', JSON.stringify(obj));
    } catch (_) {}
  }
  function loadInventoryFromStorage() {
    try {
      const raw = localStorage.getItem('amiantoGameInventory');
      if (!raw) return;
      const obj = JSON.parse(raw);
      gameInventory.clear();
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          const count = Math.max(0, Number(obj[key]) || 0);
          if (count > 0) gameInventory.set(String(key), count);
        }
      }
    } catch (_) {}
  }
  loadInventoryFromStorage();
  // activePlugin rimosso - ora usiamo solo iframe sandboxed

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
    'add_to_inventory', 'remove_from_inventory', 'has_item', 'get_item_count', 'clear_inventory',
    'load_room', 'get_current_room', 'get_room_objects', 'set_room_background',
    'spawn_object', 'despawn_object', 'rotate_object', 'scale_object', 'set_object_visible'
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
      { id: 'on_room_change', label: 'onRoomChange' }
    ],
    Room: [
      // Anche disponibile a livello globale; mantenuto qui per comodità UI
      { id: 'on_room_change', label: 'onRoomChange' }
    ],
    Object: [{ id: 'on_object_click', label: 'onClick' }],
    Character: [{ id: 'on_character_click', label: 'onClick' }],
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
      'on_gui_click'
    ].forEach(h => {
      const re = new RegExp(`function\\s+${h}\\s*\\(`);
      if (re.test(content)) handlers.add(h);
    });
    return handlers;
  }

  function rebuildScriptsTree() {
    const tree = document.getElementById('scripts-tree');
    if (!tree) return;
    tree.innerHTML = '';

    const container = document.createElement('div');

    // Helper to build a group
    const buildGroup = (title, items) => {
      const group = document.createElement('div');
      group.className = 'mb-2';
      const h = document.createElement('div');
      h.textContent = title;
      h.style.color = '#39ff14';
      h.style.fontWeight = '600';
      group.appendChild(h);
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '16px';

      items.forEach(it => {
        const li = document.createElement('li');
        li.style.margin = '4px 0';
        const label = document.createElement('span');
        label.textContent = it.label;
        label.style.cursor = 'pointer';
        label.onclick = () => openScriptFromTree(it.scope, it.target, null);
        li.appendChild(label);

        if (it.events && it.events.length) {
          const sub = document.createElement('ul');
          sub.style.paddingLeft = '16px';
          it.events.forEach(ev => {
            const evLi = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = ev.label;
            a.onclick = (e) => { e.preventDefault(); openScriptFromTree(it.scope, it.target, ev.id); };
            evLi.appendChild(a);
            sub.appendChild(evLi);
          });
          li.appendChild(sub);
        }
        ul.appendChild(li);
      });
      group.appendChild(ul);
      container.appendChild(group);
    };

    // Global (single)
    const globalKey = 'Global:main';
    let globalContent = jsScripts.get(globalKey) || localStorage.getItem(`script-${globalKey}`) || '';
    const globalHandlers = extractHandlersFromScript(globalContent);
    const globalEvents = [];
    SCRIPT_EVENTS.Global.forEach(def => { if (globalHandlers.has(def.id)) globalEvents.push(def); });

    if (globalContent && globalEvents.length) {
      buildGroup('Global', [{ scope: 'Global', target: 'main', label: 'Global', events: globalEvents }]);
    } else if (globalContent) {
      buildGroup('Global', [{ scope: 'Global', target: 'main', label: 'Global', events: [] }]);
    }

    // Rooms attached
    const roomItems = [];
    rooms.forEach((r) => {
      const key = roomScripts.get(r.id) || `Room:${r.id}`;
      const content = jsScripts.get(key) || localStorage.getItem(`script-${key}`) || '';
      if (!content && !roomScripts.get(r.id)) return;
      const handlers = extractHandlersFromScript(content);
      const events = [];
      SCRIPT_EVENTS.Room.forEach(def => { if (handlers.has(def.id)) events.push(def); });
      roomItems.push({ scope: 'Room', target: r.id, label: `Room: ${r.name || r.id}`, events });
    });
    if (roomItems.length) buildGroup('Room', roomItems);

    // Objects attached
    const objectItems = [];
    (sceneObjects || []).forEach(o => {
      const key = objectScripts.get(o.id) || `Object:${o.id}`;
      const content = jsScripts.get(key) || localStorage.getItem(`script-${key}`) || '';
      if (!content && !objectScripts.get(o.id)) return;
      const handlers = extractHandlersFromScript(content);
      const events = [];
      SCRIPT_EVENTS.Object.forEach(def => { if (handlers.has(def.id)) events.push(def); });
      objectItems.push({ scope: 'Object', target: o.id, label: `Object: ${o.name || o.id}`, events });
    });
    if (objectItems.length) buildGroup('Object', objectItems);

    // GUI attached
    const guiItems = [];
    (typeof guiButtons !== 'undefined' ? guiButtons : []).forEach(b => {
      const key = (typeof guiScripts !== 'undefined' && guiScripts.get) ? (guiScripts.get(b.id) || `GUI:${b.id}`) : `GUI:${b.id}`;
      const content = jsScripts.get(key) || localStorage.getItem(`script-${key}`) || '';
      if (!content && !(typeof guiScripts !== 'undefined' && guiScripts.get && guiScripts.get(b.id))) return;
      const handlers = extractHandlersFromScript(content);
      const events = [];
      SCRIPT_EVENTS.GUI.forEach(def => { if (handlers.has(def.id)) events.push(def); });
      guiItems.push({ scope: 'GUI', target: b.id, label: `GUI: ${b.name || b.id}`, events });
    });
    if (guiItems.length) buildGroup('GUI', guiItems);

    tree.appendChild(container);
  }

  function openScriptFromTree(scope, target, handlerId) {
    ensureLargeScriptEditor();
    ensureScriptEditor();
    const key = `${scope}:${target}`;
    let content = jsScripts.get(key) || localStorage.getItem(`script-${key}`) || '';
    if (!content) {
      showNotification('Script not found', 'warning');
      return;
    }
    currentScriptName = key;
    if (largeCodeMirrorEditor) largeCodeMirrorEditor.setValue(content);
    if (codeMirrorEditor) codeMirrorEditor.setValue(content);

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

    const key = `${scope}:${target}`;
    let content = jsScripts.get(key) || localStorage.getItem(`script-${key}`) || '';

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
    } else if (scope === 'GUI') {
      if (typeof guiScripts !== 'undefined' && guiScripts.set) guiScripts.set(target, key);
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

// API esposte al sandbox
  // Funzione helper standalone per serializzare valori in modo leggibile
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

  const sandboxApi = {
    // Funzione print() globale per gli script utente
    // Accetta qualsiasi numero di argomenti e li serializza correttamente
    // Centralizza tutto l'output degli script nello Script LogService
    print: function() {
      try {
        const args = Array.from(arguments);
        if (args.length === 0) {
          ScriptLogService.print('', 'editor-sandbox');
          return;
        }
        
        // Opzione speciale: ultimo argomento come { showInGame: true }
        let showInGame = false;
        const last = args[args.length - 1];
        if (last && typeof last === 'object' && !Array.isArray(last) && !(last instanceof Date)) {
          if (last.showInGame === true) {
            showInGame = true;
          }
          args.pop();
        }

        // Serializza ogni argomento e uniscili con spazi
        const messages = args.map(arg => serializeValue(arg));
        const msg = messages.join(' ');
        
        // Log nello Script LogService (non usa console.log come output principale)
        ScriptLogService.print(msg, 'editor-sandbox');

        // Integrazione opzionale con il gameplay tramite Game.showText()
        if (showInGame && window.Game && typeof window.Game.showText === 'function') {
          try {
            window.Game.showText(msg);
          } catch (_) {}
        }
      } catch (e) {
        // Fallback in caso di errore nella serializzazione
        addScriptLogMessage(`[Print Error] ${e && e.message ? e.message : String(e)}`, 'error');
      }
    },
    
    // Funzione error() per log di errori nello Script Log
    // Supporta livelli di log separati (error vs info)
    error: function() {
      try {
        const args = Array.from(arguments);
        if (args.length === 0) {
          addScriptLogMessage('', 'error');
          return;
        }
        
        const messages = args.map(arg => serializeValue(arg));
        const msg = messages.join(' ');
        
        addScriptLogMessage(msg, 'error');
      } catch (e) {
        addScriptLogMessage(`[Error Log Error] ${e && e.message ? e.message : String(e)}`, 'error');
      }
    },
    show_message: function(text){
      showNotification(String(text), 'info');
    },
    move_object: function(id, x, y){
      const obj = sceneObjects.find(o => o.id === String(id));
      if (!obj) { addDebugMessage(`Object ${id} not found`, 'warning'); return; }
      obj.x = Number(x)||0; obj.y = Number(y)||0; redraw();
    },
    // Event System APIs
    on_game_start: function(handler) {
      if (typeof handler === 'function') {
        window.gameEventHandlers = window.gameEventHandlers || {};
        window.gameEventHandlers.game_start = handler;
        addDebugMessage('Game start handler registered', 'info');
      }
    },
    on_room_change: function(handler) {
      if (typeof handler === 'function') {
        window.gameEventHandlers = window.gameEventHandlers || {};
        window.gameEventHandlers.room_change = handler;
        addDebugMessage('Room change handler registered', 'info');
      }
    },
    on_object_click: function(handler) {
      if (typeof handler === 'function') {
        window.gameEventHandlers = window.gameEventHandlers || {};
        window.gameEventHandlers.object_click = handler;
        addDebugMessage('Object click handler registered', 'info');
      }
    },
    on_character_click: function(handler) {
      if (typeof handler === 'function') {
        window.gameEventHandlers = window.gameEventHandlers || {};
        window.gameEventHandlers.character_click = handler;
        addDebugMessage('Character click handler registered', 'info');
      }
    },
    on_hotspot_click: function(handler) {
      if (typeof handler === 'function') {
        window.gameEventHandlers = window.gameEventHandlers || {};
        window.gameEventHandlers.hotspot_click = handler;
        addDebugMessage('Hotspot click handler registered', 'info');
      }
    },
    // Inventory APIs
    add_to_inventory: function(itemId, quantity) {
      const id = String(itemId || '').trim();
      const q = Math.max(1, Number(quantity) || 1);
      if (!id) { addDebugMessage('add_to_inventory: invalid itemId', 'warning'); return 0; }
      const current = Number(gameInventory.get(id) || 0);
      const next = current + q;
      gameInventory.set(id, next);
      persistInventory();
      showNotification(`Added ${q} × "${id}" to inventory (total: ${next})`, 'success');
      return next;
    },
    remove_from_inventory: function(itemId, quantity) {
      const id = String(itemId || '').trim();
      const q = Math.max(1, Number(quantity) || 1);
      if (!id) { addDebugMessage('remove_from_inventory: invalid itemId', 'warning'); return 0; }
      const current = Number(gameInventory.get(id) || 0);
      const next = Math.max(0, current - q);
      if (next <= 0) gameInventory.delete(id); else gameInventory.set(id, next);
      persistInventory();
      showNotification(`Removed ${q} × "${id}" from inventory (total: ${next})`, 'info');
      return next;
    },
    has_item: function(itemId) {
      const id = String(itemId || '').trim();
      if (!id) return false;
      return (Number(gameInventory.get(id) || 0) > 0);
    },
    get_item_count: function(itemId) {
      const id = String(itemId || '').trim();
      if (!id) return 0;
      return Number(gameInventory.get(id) || 0);
    },
    clear_inventory: function() {
      gameInventory.clear();
      persistInventory();
      showNotification('Inventory cleared', 'warning');
      return true;
    },

    // Room System APIs
    load_room: function(roomIdOrName) {
      const key = String(roomIdOrName || '').trim();
      if (!key) { addDebugMessage('load_room: missing room id/name', 'warning'); return false; }
      let targetId = null;
      if (rooms.has(key)) {
        targetId = key;
      } else {
        rooms.forEach((r) => { if (!targetId && (r.name === key)) targetId = r.id; });
      }
      if (!targetId) { addDebugMessage(`load_room: room "${key}" not found`, 'warning'); return false; }
      try {
        window.selectRoom(targetId);
        return true;
      } catch (e) {
        addDebugMessage(`load_room error: ${e && e.message ? e.message : e}`, 'error');
        return false;
      }
    },
    get_current_room: function() {
      return currentRoomId || null;
    },
    get_room_objects: function() {
      const r = rooms.get(currentRoomId);
      if (!r || !Array.isArray(r.sceneObjects)) return [];
      return r.sceneObjects.map(o => ({
        id: String(o.id || ''),
        name: String(o.name || ''),
        type: String(o.type || 'Interactive'),
        x: Number(o.x) || 0,
        y: Number(o.y) || 0,
        rotation: Number(o.rotationRad ? (o.rotationRad * 180 / Math.PI) : 0),
        scaleX: Number((typeof o.scaleX === 'number') ? o.scaleX : 1),
        scaleY: Number((typeof o.scaleY === 'number') ? o.scaleY : 1),
        visible: (o.visible !== false)
      }));
    },
    set_room_background: function(imageUrlOrDataUrl) {
      const r = rooms.get(currentRoomId);
      if (!r) { addDebugMessage('set_room_background: no current room', 'warning'); return false; }
      const url = (imageUrlOrDataUrl == null) ? '' : String(imageUrlOrDataUrl);
      if (!url) {
        r.background = null;
        background = null;
        redraw();
        showNotification('Room background cleared', 'info');
        return true;
      }
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Permette CORS per Firebase Storage
        img.onload = () => {
          // Verifica che l'immagine sia completamente caricata
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          
          if (!width || !height) {
            console.warn('[set_room_background] Immagine caricata ma senza dimensioni valide:', {
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              width: img.width,
              height: img.height
            });
            addDebugMessage('set_room_background: image loaded but has no dimensions', 'warning');
            return;
          }
          
          r.background = img;
          background = img;
          redraw();
          showNotification(`Room background set (${width}×${height})`, 'success');
        };
        img.onerror = (error) => {
          console.error('[set_room_background] Errore caricamento immagine:', url, error);
          addDebugMessage('set_room_background: failed to load image', 'error');
          showNotification('Failed to load background image', 'danger');
        };
        img.src = url;
        return true;
      } catch (e) {
        addDebugMessage(`set_room_background error: ${e && e.message ? e.message : e}`, 'error');
        return false;
      }
    },

    // Object System APIs
    spawn_object: function(objectNameOrId, x, y, imageUrlOrDataUrl) {
      const name = String(objectNameOrId || '').trim() || 'Object';
      const objX = Number(x) || 0;
      const objY = Number(y) || 0;

      function addObjectWithImage(img) {
        const newObj = {
          id: uid('scene'),
          name,
          img,
          x: objX,
          y: objY,
          type: 'Interactive',
          rotationRad: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true
        };
        sceneObjects.push(newObj);
        const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;

        // Add to UI list
        try {
          const list = document.getElementById('scene-objects-list');
          if (list) {
            const item = document.createElement('div');
            item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
            item.dataset.objectId = newObj.id;
            item.innerHTML = `
              <div>
                <strong>${newObj.name}</strong>
                <br><small>Scene object</small>
                <br><span class="badge bg-warning">Interactive</span>
                <br><small style="color: #888;">Position: ${Math.round(newObj.x)}, ${Math.round(newObj.y)}</small>
              </div>
              <div>
                <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editSceneObject(this)">✏️</button>
                <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeSceneObject(this)">🗑️</button>
              </div>
            `;
            list.appendChild(item);
          }
        } catch (_) {}

        redraw();
        showNotification(`Spawned object "${newObj.name}"`, 'success');
        return newObj.id;
      }

      try {
        const url = (imageUrlOrDataUrl == null) ? '' : String(imageUrlOrDataUrl);
        if (!url) {
          // Create a simple placeholder image (32x32)
          const c = document.createElement('canvas');
          c.width = 32; c.height = 32;
          const t = c.getContext('2d');
          t.fillStyle = '#cc3333'; t.fillRect(0, 0, 32, 32);
          t.fillStyle = '#ffffff'; t.fillRect(4, 4, 24, 24);
          const img = new Image();
          img.onload = () => { addObjectWithImage(img); };
          img.src = c.toDataURL('image/png');
          return true;
        } else {
          const img = new Image();
          img.onload = () => { addObjectWithImage(img); };
          img.onerror = () => {
            addDebugMessage('spawn_object: failed to load image', 'error');
            showNotification('Failed to load object image', 'danger');
          };
          img.src = url;
          return true;
        }
      } catch (e) {
        addDebugMessage(`spawn_object error: ${e && e.message ? e.message : e}`, 'error');
        return false;
      }
    },
    despawn_object: function(objectId) {
      const id = String(objectId || '').trim();
      if (!id) { addDebugMessage('despawn_object: invalid id', 'warning'); return false; }
      const before = sceneObjects.length;
      sceneObjects = sceneObjects.filter(o => String(o.id) !== id);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      // Remove from UI
      try {
        const el = document.querySelector(`[data-object-id="${id}"]`);
        if (el) el.remove();
      } catch (_) {}
      const removed = (before !== sceneObjects.length);
      if (removed) {
        redraw();
        showNotification(`Despawned object "${id}"`, 'info');
      } else {
        addDebugMessage(`despawn_object: object "${id}" not found`, 'warning');
      }
      return removed;
    },
    rotate_object: function(objectId, degrees) {
      const id = String(objectId || '').trim();
      const deg = Number(degrees) || 0;
      const obj = sceneObjects.find(o => String(o.id) === id);
      if (!obj) { addDebugMessage(`rotate_object: object "${id}" not found`, 'warning'); return false; }
      const rad = deg * Math.PI / 180;
      obj.rotationRad = rad;
      redraw();
      return true;
    },
    scale_object: function(objectId, sx, sy) {
      const id = String(objectId || '').trim();
      let scaleX = Number(sx);
      let scaleY = (typeof sy === 'undefined' || sy === null) ? scaleX : Number(sy);
      if (!isFinite(scaleX)) scaleX = 1;
      if (!isFinite(scaleY)) scaleY = 1;
      scaleX = Math.max(0.01, scaleX);
      scaleY = Math.max(0.01, scaleY);
      const obj = sceneObjects.find(o => String(o.id) === id);
      if (!obj) { addDebugMessage(`scale_object: object "${id}" not found`, 'warning'); return false; }
      obj.scaleX = scaleX;
      obj.scaleY = scaleY;
      redraw();
      return true;
    },
    set_object_visible: function(objectId, visible) {
      const id = String(objectId || '').trim();
      const v = !!visible;
      const obj = sceneObjects.find(o => String(o.id) === id);
      if (!obj) { addDebugMessage(`set_object_visible: object "${id}" not found`, 'warning'); return false; }
      obj.visible = v;
      redraw();
      return true;
    },
    // Game State API
    get_var: function(key) {
      return window.Game.getVar(key);
    },
    set_var: function(key, value) {
      return window.Game.setVar(key, value);
    },
    has_var: function(key) {
      return window.Game.hasVar(key);
    },
    toggle_var: function(key) {
      return window.Game.toggleVar(key);
    },
    // Condition API (per uso interno, non esposto direttamente agli script)
    evaluate_condition: function(conditionObject) {
      return window.Condition.evaluate(conditionObject);
    },
    evaluate_all_conditions: function(conditions) {
      return window.Condition.evaluateAll(conditions);
    }
};

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
    
    // Se il runtime non è inizializzato, non eseguire lo script
    if (!embeddedRuntime.isInitialized || !embeddedRuntime.sandboxIframe) {
      addDebugMessage(`[Script] Runtime not initialized, skipping handler "${handlerName}"`, 'warning');
      return;
    }
    
    // Esegui lo script nell'iframe sandboxed
    const context = {
      roomId: embeddedRuntime.gameState.currentRoomId,
      objectId: null,
      variables: {}
    };
    
    // Copia variabili dal gameState
    embeddedRuntime.gameState.variables.forEach((value, key) => {
      context.variables[key] = value;
    });
    
    executeScriptInSandbox(`handler_${handlerName}_${Date.now()}`, scriptContent, handlerName, argsArray, context);
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
    // Determine current key (scope/target) or fallback to legacy selector
    let key = currentScriptName && String(currentScriptName);
    if (!key) {
      const selector = document.getElementById('script-selector');
      key = (selector && selector.value) || 'new-script';
    }

    try { localStorage.setItem(`script-${key}`, content); } catch(_) {}
    jsScripts.set(key, content);
    showNotification(`Script "${key}" saved!`, 'success');

    // refresh attach targets
    refreshScriptSelector();
    refreshSceneObjectScriptTargets();
    rebuildScriptsTree();
  };

  window.runScript = function() {
    ensureLargeScriptEditor();
    ensureScriptEditor();
    const content = largeCodeMirrorEditor ? largeCodeMirrorEditor.getValue() : (codeMirrorEditor ? codeMirrorEditor.getValue() : (document.getElementById('script-editor-large')?.value || document.getElementById('script-editor')?.value || ''));
    
    if (!content || !content.trim()) {
      showNotification('Script vuoto!', 'warning');
      return;
    }
    
    // Serializza il progetto completo (come fa startPlayTest) per avere tutte le variabili e il contesto
    const jsonString = window.serializeProjectToJsonString(true);
    
    // Inizializza sempre il sandbox con i dati aggiornati del progetto
    // Questo garantisce che lo script abbia accesso a tutte le variabili e al contesto corretto
    initializeSandboxRuntime(jsonString);
    
    // Aspetta che l'iframe sia pronto e poi esegui lo script
    const checkReady = setInterval(() => {
      if (embeddedRuntime.isReady && embeddedRuntime.sandboxIframe) {
        clearInterval(checkReady);
        // Esegui lo script selezionato nel sandbox
        executeScriptInSandbox('run_script_' + Date.now(), content, null, [], {});
        showNotification('Script eseguito in sandbox!', 'success');
      }
    }, 100);
    
    // Timeout dopo 5 secondi
    setTimeout(() => {
      clearInterval(checkReady);
      if (!embeddedRuntime.isReady) {
        showNotification('Errore: sandbox non inizializzato', 'danger');
      }
    }, 5000);
  };

  window.deleteScript = function() {
    // Determina lo script corrente
    let scriptName = currentScriptName && String(currentScriptName);
    if (!scriptName) {
      const selector = document.getElementById('script-selector');
      scriptName = (selector && selector.value) || '';
    }
    
    if (!scriptName || !scriptName.trim()) {
      showNotification('Seleziona uno script da eliminare', 'warning');
      return;
    }
    
    // Chiedi conferma
    if (!confirm(`Vuoi eliminare lo script "${scriptName}"?\n\nQuesta azione non può essere annullata.`)) {
      return;
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
    
    // Hotspot scripts
    for (const [hotspotId, attachedScript] of hotspotScripts.entries()) {
      if (attachedScript === scriptName) {
        hotspotScripts.delete(hotspotId);
      }
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
    
    // Aggiorna tutti i target selector
    refreshSceneObjectScriptTargets();
    refreshRoomScriptTargets();
    refreshCharacterScriptTargets();
    refreshInventoryScriptTargets();
    try { refreshGuiScriptTargets(); } catch(_) {}
    try { refreshHotspotScriptTargets(); } catch(_) {}
    try { refreshCursorScriptTargets(); } catch(_) {}
    
    showNotification(`Script "${scriptName}" eliminato`, 'success');
  };

  window.stopScript = function() {
    // Non serve più fermare script singoli, ma possiamo pulire lo stato se necessario
    showNotification('Script execution stopped', 'info');
  };

  window.loadScript = function(scriptName) {
    if (!scriptName) return;
    
    const savedScript = localStorage.getItem(`script-${scriptName}`);
    if (savedScript) {
      ensureLargeScriptEditor();
      ensureScriptEditor();
      if (largeCodeMirrorEditor) {
        largeCodeMirrorEditor.setValue(savedScript);
      }
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue(savedScript);
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
    document.querySelectorAll('#inventory-list .list-group-item strong').forEach(s => {
      const name = s.textContent.trim();
      const o = document.createElement('option');
      o.value = name; o.textContent = name; sel.appendChild(o);
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
    if (e.detail.currentTab === 'objects') {
      setTimeout(() => { refreshInventoryScriptTargets(); updateCursorTargets(); }, 0);
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
    const scriptName = selector.value;
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
    hotspotScripts.set(hotspotId, scriptName);
    showNotification(`Attached script "${scriptName}" to hotspot`, 'success');
  };

  // On tab change to scripts, ensure editor exists and switch canvas/editor visibility
  document.addEventListener('tabChanged', function(e){
    if (e.detail.currentTab === 'scripts') {
      const canvasContainer = document.getElementById('canvasContainer');
      const codeEditorContainer = document.getElementById('codeEditorContainer');
      const logsContainer = document.getElementById('logs-container');
      if (canvasContainer) canvasContainer.style.display = 'none';
      if (codeEditorContainer) codeEditorContainer.style.display = 'flex'; // Cambiato a flex per il layout
      if (logsContainer) logsContainer.style.display = 'flex'; // Assicura che i log siano sempre visibili
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
    } else {
      const canvasContainer = document.getElementById('canvasContainer');
      const codeEditorContainer = document.getElementById('codeEditorContainer');
      const logsContainer = document.getElementById('logs-container');
      if (canvasContainer) canvasContainer.style.display = 'block';
      if (codeEditorContainer) codeEditorContainer.style.display = 'none';
      if (logsContainer) logsContainer.style.display = 'flex'; // Assicura che i log siano sempre visibili
    }
  });

  // Variabile globale per tracciare lo stato di sincronizzazione
  let isSyncingProjects = false;

  // Function to show loading overlay with amnt.png
  function showLoadingOverlay(message = 'Synchronizing projects...') {
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
        <img src="img/Amnt.png" alt="Loading" style="width: 120px; height: 120px; margin-bottom: 20px; animation: pulse 2s ease-in-out infinite;">
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
  function hideLoadingOverlay() {
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
    
    // Add specific logic for each tab
    switch(e.detail.currentTab) {
      case 'objects':
        // Update objects list if necessary
        break;
      case 'gui':
        refreshGuiButtonsList();
        redraw();
        break;
      case 'characters':
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
    isInitialized: false
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
        executeScriptInSandbox(roomScriptName, scripts[roomScriptName], 'on_room_enter', [], {
          roomId: embeddedRuntime.gameState.currentRoomId
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
    
    const room = embeddedRuntime.gameData.rooms[index];
    const assets = await loadRuntimeRoomAssets(room);

    if (!embeddedRuntime.ctx) return;
    
    embeddedRuntime.ctx.clearRect(0, 0, embeddedRuntime.canvas.width, embeddedRuntime.canvas.height);
    if (assets.background) embeddedRuntime.ctx.drawImage(assets.background, 0, 0);
    for (const o of assets.objects) {
      if (o.img) embeddedRuntime.ctx.drawImage(o.img, o.x, o.y);
    }
    for (const f of assets.foregrounds) {
      if (f.img) embeddedRuntime.ctx.drawImage(f.img, f.offsetX||0, f.offsetY||0);
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
    
    // Crea e inizializza l'iframe sandboxed
    sendRuntimeLogToEditor('Initializing sandbox iframe...', 'info');
    createSandboxIframe();
    
    // Inizializza ed esegui gli script (verranno eseguiti quando l'iframe è pronto)
    // Gli script verranno messi in pendingScripts se l'iframe non è ancora pronto
    initializeEmbeddedRuntimeScripts();
    
    embeddedRuntime.isInitialized = true;
    sendRuntimeLogToEditor('Embedded runtime initialization started (waiting for iframe ready...)', 'info');
  }

  // Ferma e pulisce il runtime incorporato
  function stopEmbeddedRuntime() {
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
    startTime: null
  };

  window.startPlayTest = async function() {
    if (playTestState.isRunning) return;

    // Ensure latest project is serialized and saved for runtime
    const jsonString = window.serializeProjectToJsonString(true);
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
    const projectObj = window.serializeProject();
    
    // Save game.json depending on mode
    if (window.AMIANTO_PLAYTEST_MODE === 'server') {
      saveGameJsonServer(jsonString);
    } else {
      // saveGameJsonLocal già chiama saveProjectJsonToOPFS, non duplicare
      saveGameJsonLocal(jsonString);
    }
    
    // Salva anche con nome progetto (non duplicare se già salvato sopra)
    // Usa setTimeout per evitare chiamate simultanee
    setTimeout(() => {
      saveProjectJsonToOPFS(jsonString, projectObj.settings && projectObj.settings.name).catch(() => {});
    }, 100);

    // Inizializza solo l'iframe sandboxed (senza rendering canvas nell'editor)
    initializeSandboxRuntime(jsonString);

    playTestState.isRunning = true;
    playTestState.isPaused = false;
    playTestState.startTime = Date.now();
    updateGameStatus('Test running...');
    addDebugMessage('Sandbox runtime initialized', 'success');
    
    // NOTA: Gli script globali vengono già eseguiti da initializeEmbeddedRuntimeScripts()
    // Non duplicare l'esecuzione qui
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
    
    const duration = playTestState.startTime ? Date.now() - playTestState.startTime : 0;
    const durationSeconds = Math.round(duration / 1000);
    
    // Ferma il runtime incorporato
    stopEmbeddedRuntime();
    
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
      addScriptLogMessage('Nessuno script globale trovato. Crea uno script con Scope=Global, Target=main, Event=onGameStart', 'warning');
      showNotification('Nessuno script globale trovato', 'warning');
      return;
    }
    
    addScriptLogMessage(`Trovati ${globalScripts.length} script globale/i`, 'info');
    
    // Esegui tutti gli script globali che potrebbero avere on_game_start
    globalScripts.forEach(([scriptName, content]) => {
      if (content && content.trim()) {
        addScriptLogMessage(`Eseguendo script: ${scriptName}`, 'info');
        executeScriptHandler(content, 'on_game_start', []);
      } else {
        addScriptLogMessage(`Script "${scriptName}" è vuoto`, 'warning');
      }
    });
    
    // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    
    // Trigger anche i global event handlers
    triggerGameStart();
    
    addScriptLogMessage('=== Test Game Start completato ===', 'info');
    showNotification('Game Start testato! Controlla la Script Console', 'success');
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
    
    // Check if hotspot has an attached script
    const scriptName = hotspotScripts.get(activeHotspotId);
    if (!scriptName) {
      addDebugMessage('No script attached to this hotspot', 'warning');
      return;
    }
    try {
      // Handler gestiti tramite executeScriptHandler (iframe sandboxed)
    } catch(_) {}
    const scriptContent = jsScripts.get(scriptName);
    if (!scriptContent) {
      addDebugMessage(`Script "${scriptName}" not found`, 'error');
      return;
    }
    const eventConditions = hotspotEventConditions.get(activeHotspotId);
    const conditions = eventConditions && eventConditions.onClick ? eventConditions.onClick : null;
    executeScriptHandler(scriptContent, 'on_hotspot_click', [activeHotspotId], conditions);
    addDebugMessage(`Hotspot script "${scriptName}" executed`, 'success');
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
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectName" value="Untitled Project">
              </div>
              <div class="mb-3">
                <label for="projectAuthor" class="form-label">Author</label>
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectAuthor" placeholder="Your name">
              </div>
              <div class="mb-3">
                <label for="projectVersion" class="form-label">Version</label>
                <input type="text" class="form-control bg-secondary text-light border-secondary" id="projectVersion" value="1.0.0">
              </div>
              <div class="mb-3">
                <label for="projectDescription" class="form-label">Description</label>
                <textarea class="form-control bg-secondary text-light border-secondary" id="projectDescription" rows="3" placeholder="Brief description of your game..."></textarea>
              </div>
              <div class="mb-3">
                <label for="canvasWidth" class="form-label">Canvas Width</label>
                <input type="number" class="form-control bg-secondary text-light border-secondary" id="canvasWidth" value="800">
              </div>
              <div class="mb-3">
                <label for="canvasHeight" class="form-label">Canvas Height</label>
                <input type="number" class="form-control bg-secondary text-light border-secondary" id="canvasHeight" value="600">
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableFullscreen" checked>
                  <label class="form-check-label" for="enableFullscreen">
                    Enable Fullscreen Mode
                  </label>
                </div>
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableSound" checked>
                  <label class="form-check-label" for="enableSound">
                    Enable Sound Effects
                  </label>
                </div>
              </div>
              <div class="mb-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableMusic" checked>
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
    const newWidth = parseInt(document.getElementById('canvasWidth').value);
    const newHeight = parseInt(document.getElementById('canvasHeight').value);
    
    const settings = {
      name: document.getElementById('projectName').value,
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
    
    // Save to localStorage
    localStorage.setItem('amiantoProjectSettings', JSON.stringify(settings));
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('projectSettingsModal'));
    modal.hide();
    
    showNotification(`Project settings saved! Game viewport: ${newWidth}×${newHeight}`, 'success');
    
    // Log settings for debugging
    console.log('Project settings saved:', settings);
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
  window.addEventListener('beforeunload', function() {
    // Rimuovi progetto attivo quando l'utente chiude la pagina
    localStorage.removeItem('amiantoActiveProjectName');
    localStorage.removeItem('amiantoActiveProjectOwner');
    console.log('[Cleanup] Progetto attivo rimosso alla chiusura della pagina');
  });

  // Initialize authentication system
  function initAuthSystem() {
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

    // Observe Firebase auth state
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
        
        // Se l'utente è già loggato e corrisponde, sincronizza progetti e mostra modale se necessario
        if (currentUser && currentUser.uid === mappedUser.uid) {
          // Utente già loggato, sincronizza progetti
          if (window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
            try {
              await syncProjectsFromFirestore(mappedUser.uid);
            } catch (error) {
              console.error('[AuthObserver] Errore sincronizzazione progetti:', error);
            }
          }
          
          // Mostra modale selezione progetto se non c'è un progetto attivo
          // (anche se l'utente è già loggato, ad esempio al refresh della pagina)
          const activeProject = localStorage.getItem('amiantoActiveProjectName');
          if (!activeProject) {
            await showProjectSelectionModal();
          }
          return;
        }
        
        // Nuovo login: imposta utente e sincronizza
        currentUser = mappedUser;
        localStorage.setItem('amiantoCurrentUser', mappedUser.username);
        showDashboard();
        
        // Sincronizza progetti da Firestore
        if (mappedUser.uid && window.firebaseDB && window.firebaseAuth) {
          try {
            await syncProjectsFromFirestore(mappedUser.uid);
          } catch (error) {
            console.error('[AuthObserver] Errore sincronizzazione progetti:', error);
          }
        }
        
        // Mostra modale selezione progetto (sempre, perché il progetto attivo viene rimosso alla chiusura)
        await showProjectSelectionModal();
      } else {
        currentUser = null;
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
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainDashboard').style.display = 'block';
    document.getElementById('loginHeader').style.display = 'none';
    document.getElementById('dashboardHeader').style.display = 'block';

    // Update user info in header
    document.getElementById('currentUserName').textContent = currentUser.username;
    document.getElementById('userDisplayName').textContent = currentUser.username;

    // Load user's projects
    loadUserProjects();
    
    // Verifica se ci sono progetti: se non ce ne sono, mostra il modale
    // (solo se non c'è un progetto attivo già aperto)
    const activeProject = localStorage.getItem('amiantoActiveProjectName');
    if (!activeProject && currentUser && currentUser.uid) {
      // Sincronizza e verifica progetti
      if (window.firebaseDB && window.firebaseAuth && window.firebaseAuth.currentUser) {
        try {
          await syncProjectsFromFirestore(currentUser.uid);
          const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
          if (userProjects.length === 0) {
            // Nessun progetto: mostra il modale
            await showProjectSelectionModal(true);
          }
        } catch (error) {
          console.error('[Dashboard] Errore verifica progetti:', error);
        }
      }
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
        fbLogin(email, password).then((cred) => {
          const user = cred && cred.user;
          if (user) {
            const mapped = {
              username: (user.email || '').split('@')[0] || (user.uid ? `user_${user.uid.substring(0, 6)}` : 'User'),
              email: user.email || '',
              uid: user.uid
            };
            loginUser(mapped, document.getElementById('rememberMe').checked);
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
  async function updateProjectModalContent(modal, bsModal) {
    if (!currentUser || !currentUser.uid) return;
    
    console.log('[ProjectModal] Aggiornamento contenuto modale...');
    
    // Sincronizza con Firestore per ottenere la lista più aggiornata
    isSyncingProjects = true;
    showLoadingOverlay('Updating project list...');
    try {
      await syncProjectsFromFirestore(currentUser.uid);
      console.log('[ProjectModal] Sincronizzazione completata');
    } catch (error) {
      console.error('[ProjectModal] Errore sincronizzazione per aggiornamento:', error);
    } finally {
      isSyncingProjects = false;
      hideLoadingOverlay();
    }
    
    // Carica progetti aggiornati da localStorage (dopo la sincronizzazione)
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    console.log('[ProjectModal] Progetti trovati dopo sincronizzazione:', userProjects.length, userProjects.map(p => p?.settings?.name));
    const hasProjects = userProjects.length > 0;
    
    // Costruisci HTML progetti
    let projectsHtml = '';
    if (hasProjects) {
      projectsHtml = userProjects.map((p, i) => {
        const name = (p && p.settings && p.settings.name) ? p.settings.name : `Project ${i+1}`;
        const updated = (p && (p.updatedAt || p.createdAt)) ? (p.updatedAt || p.createdAt) : '';
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
    
    // Aggiorna il contenuto del modale
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.innerHTML = `
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
      
      // Non serve aggiungere listener: l'event delegation sul modale
      // gestisce già correttamente i click sui pulsanti "Open" e "Create New Project"
    }
  }

  /**
   * Mostra modale di selezione/creazione progetto dopo il login
   * Sincronizza sempre i progetti da Firestore prima di mostrarli
   * @returns {Promise<void>}
   */
  async function showProjectSelectionModal(forceShow = false) {
    if (!currentUser || !currentUser.uid) {
      console.warn('[ProjectModal] Utente non autenticato');
      return;
    }

    // VERIFICA E CHIUDI EVENTUALI MODALI ESISTENTI
    // Assicurati che ci sia sempre un solo modale aperto
    const existingModal = document.getElementById('projectSelectionModal');
    if (existingModal) {
      console.log('[ProjectModal] Trovato modale esistente, chiudo e rimuovo...');
      try {
        const existingBsModal = bootstrap.Modal.getInstance(existingModal);
        if (existingBsModal) {
          existingBsModal.hide();
          // Attendi che il modale venga nascosto prima di rimuoverlo
          existingModal.addEventListener('hidden.bs.modal', function handler() {
            existingModal.remove();
            existingModal.removeEventListener('hidden.bs.modal', handler);
          }, { once: true });
        } else {
          // Se non c'è istanza Bootstrap, rimuovi direttamente
          existingModal.remove();
        }
      } catch (error) {
        console.warn('[ProjectModal] Errore chiusura modale esistente:', error);
        // In caso di errore, rimuovi comunque il modale
        existingModal.remove();
      }
    }
    
    // Verifica anche eventuali modali Bootstrap aperti nel DOM
    // Chiudi tutti i modali Bootstrap aperti prima di crearne uno nuovo
    const allModals = document.querySelectorAll('.modal.show');
    allModals.forEach(m => {
      if (m.id === 'projectSelectionModal') {
        // Già gestito sopra
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
    // forceShow = true quando viene chiamato dopo la cancellazione dell'ultimo progetto
    if (!forceShow) {
      const activeProject = localStorage.getItem('amiantoActiveProjectName');
      if (activeProject) {
        console.log('[ProjectModal] Progetto già attivo, salto modale:', activeProject);
        return;
      }
    }

    // SEMPRE sincronizza progetti da Firestore prima di mostrarli
    isSyncingProjects = true;
    showLoadingOverlay('Synchronizing projects with Firestore...');
    try {
      await syncProjectsFromFirestore(currentUser.uid);
    } catch (error) {
      console.error('[ProjectModal] Errore sincronizzazione:', error);
      showNotification('Error synchronizing projects', 'warning');
    } finally {
      isSyncingProjects = false;
      hideLoadingOverlay();
    }

    // Carica progetti sincronizzati (da localStorage dopo sync)
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    const hasProjects = userProjects.length > 0;

    // Crea modale dinamicamente
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'projectSelectionModal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'projectSelectionModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('data-bs-backdrop', 'static');
    modal.setAttribute('data-bs-keyboard', 'false');

    // Costruisci HTML del modale
    let projectsHtml = '';
    if (hasProjects) {
      projectsHtml = userProjects.map((p, i) => {
        const name = (p && p.settings && p.settings.name) ? p.settings.name : `Project ${i+1}`;
        const updated = (p && (p.updatedAt || p.createdAt)) ? (p.updatedAt || p.createdAt) : '';
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

    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header border-secondary">
            <h5 class="modal-title" id="projectSelectionModalLabel">
              <i class="fas fa-folder"></i> Your Projects
            </h5>
            <!-- X button rimosso: l'utente deve selezionare o creare un progetto -->
          </div>
          <div class="modal-body">
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
          </div>
        </div>
      </div>
    `;

    // Aggiungi modale al DOM
    document.body.appendChild(modal);

    // Inizializza Bootstrap Modal
    const bsModal = new bootstrap.Modal(modal, {
      backdrop: 'static',
      keyboard: false
    });
    bsModal.show();

    // Gestione click su pulsanti Open con event delegation (funziona anche dopo aggiornamenti contenuto)
    modal.addEventListener('click', async (e) => {
      // Blocca azioni durante la sincronizzazione
      if (isSyncingProjects) {
        e.preventDefault();
        e.stopPropagation();
        showNotification('Please wait for synchronization to complete', 'warning');
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

    // Gestione creazione nuovo progetto con event delegation
    modal.addEventListener('click', async (e) => {
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
          
          // Attendi un momento per assicurarsi che Firestore abbia completato il salvataggio
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Mostra notifica di successo dopo la creazione
          showNotification(`Project "${projectName.trim()}" created and opened!`, 'success');
          
          // Dopo la creazione, sincronizza e aggiorna il modale con la nuova lista progetti
          await updateProjectModalContent(modal, bsModal);
          
          // Chiudi il modale solo se il progetto è stato aperto con successo
          const activeProject = localStorage.getItem('amiantoActiveProjectName');
          if (activeProject === projectName.trim()) {
            bsModal.hide();
          }
        } else if (projectName !== null) {
          // L'utente ha inserito un nome vuoto, mostra di nuovo il prompt
          showNotification('Project name cannot be empty', 'warning');
        }
        // Se projectName === null, l'utente ha annullato, non fare nulla
        return false;
      }
    }, { capture: true });

    // Rimuovi modale dal DOM quando viene nascosto
    modal.addEventListener('hidden.bs.modal', function () {
      modal.remove();
    });

    // Previeni completamente la chiusura del modale tramite backdrop o ESC
    // L'utente DEVE selezionare o creare un progetto
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

    // Il listener per il backdrop è già gestito dentro handleProjectClick
    // Non aggiungere listener duplicati
  }

  // Login user
  async function loginUser(user, rememberMe = false) {
    currentUser = user;
    localStorage.setItem('amiantoCurrentUser', user.username);

    if (rememberMe) {
      localStorage.setItem('amiantoRememberUser', user.username);
    } else {
      localStorage.removeItem('amiantoRememberUser');
    }

    showDashboard();
    showNotification(`Welcome back, ${user.username}!`, 'success');

    // Sincronizza progetti da Firestore dopo il login
    if (user.uid && window.firebaseDB && window.firebaseAuth) {
      console.log('[Login] Avvio sincronizzazione progetti da Firestore...');
      
      try {
        const syncSuccess = await syncProjectsFromFirestore(user.uid);
        if (syncSuccess) {
          console.log('[Login] ✅ Sincronizzazione progetti completata');
        } else {
          console.warn('[Login] Sincronizzazione progetti non completata (fallback a cache locale)');
        }
      } catch (error) {
        console.error('[Login] Errore durante sincronizzazione progetti:', error);
        showNotification('Errore sincronizzazione progetti. Usando cache locale.', 'warning');
      }
    } else {
      console.warn('[Login] Firestore non disponibile, salto sincronizzazione');
    }

    // Mostra modale di selezione progetto (sempre, anche se non ci sono progetti)
    // L'utente deve selezionare o creare un progetto per continuare
    await showProjectSelectionModal();
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

  // Logout user
  window.logout = function() {
    // If in demo mode, just exit demo without calling Firebase
    if (isDemoMode) {
      isDemoMode = false;
      sessionStorage.removeItem('amiantoDemoMode');
      currentUser = null;
      localStorage.removeItem('amiantoCurrentUser');
      localStorage.removeItem('amiantoRememberUser');
      showLoginPage();
      showNotification('Hai lasciato la Demo Mode', 'info');
      return;
    }

    if (confirm('Are you sure you want to logout?')) {
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
    showNotification('Demo Mode attiva: stai usando l’editor senza account', 'info');
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
  function loadUserProjects() {
    if (!currentUser) return;

    // Load user's projects from localStorage
    const userProjects = localStorage.getItem(`amiantoProjects_${currentUser.username}`);
    if (userProjects) {
      const projects = JSON.parse(userProjects);
      // Update UI to show user's projects
      console.log('Loaded projects for user:', currentUser.username, projects);
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
    
    // Fallback: usa dataURL (per compatibilità con progetti esistenti)
    return imageToDataURL(img);
  }

  function serializeRooms() {
    const serialized = [];
    rooms.forEach((r) => {
      serialized.push({
        id: r.id,
        name: r.name || r.id,
        background: serializeImage(r.background),
        foregrounds: Array.isArray(r.foregrounds) ? r.foregrounds.map(f => ({
          id: f.id,
          name: f.name,
          image: serializeImage(f.img),
          offsetX: Number(f.offsetX) || 0,
          offsetY: Number(f.offsetY) || 0
        })) : [],
        sceneObjects: Array.isArray(r.sceneObjects) ? r.sceneObjects.map(o => ({
          id: o.id,
          name: o.name,
          type: o.type || 'Interactive',
          x: Number(o.x) || 0,
          y: Number(o.y) || 0,
          image: serializeImage(o.img)
        })) : [],
        walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
        hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => ({
          id: h.id,
          name: h.name,
          points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
          visible: !!h.visible
        })) : []
      });
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
    const directionsList = ['north','northeast','east','southeast','south','southwest','west','northwest'];
    const result = [];
    const names = collectCharacterNames();
    names.forEach(name => {
      const charData = (characterFrames && characterFrames.get) ? characterFrames.get(name) : null;
      const out = { name, directions: {} };
      directionsList.forEach(dir => {
        const d = charData && charData.directions ? charData.directions[dir] : null;
        if (d) {
          out.directions[dir] = {
            fps: Number(d.fps) || 8,
            frames: Array.isArray(d.frames) ? d.frames.map(fr => (fr && fr.img) ? serializeImage(fr.img) : null).filter(Boolean) : []
          };
        }
      });
      result.push(out);
    });
    return result;
  }

  function serializeInventory() {
    const items = [];
    try {
      document.querySelectorAll('#inventory-list .list-group-item strong').forEach(s => items.push({ name: s.textContent.trim() }));
    } catch (_) {}
    return items;
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
      guiScripts: (typeof guiScripts !== 'undefined') ? mapToObject(guiScripts) : {},
      hotspotScripts: mapToObject(hotspotScripts)
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
    return {
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
      eventConditions: serializeEventConditions()
    };
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
        addDebugMessage('[Firestore] Firestore non disponibile, uso fallback cache', 'warning');
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
      console.log('[Firestore] Dati progetto preparati:', { projectName, dataSize: jsonString.length });

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

      console.log('[Firestore] Tentativo scrittura su Firestore...');
      
      // Usa set con merge per creare o aggiornare
      await projectRef.set(firestoreData, { merge: true });

      console.log(`[Firestore] ✅ Progetto salvato con successo: ${projectName} (${projectId})`);
      addDebugMessage(`[Firestore] Progetto salvato: ${projectName}`, 'success');
      return true;
    } catch (error) {
      console.error('[Firestore] ❌ Errore durante il salvataggio:', error);
      console.error('[Firestore] Dettagli errore:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      addDebugMessage(`[Firestore] Errore salvataggio: ${error.message || error} (${error.code || 'unknown'})`, 'error');
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
      addDebugMessage(`[Firestore] Progetto caricato: ${data.name || projectId}`, 'success');
      return projectObj;
    } catch (error) {
      console.error('[Firestore] ❌ Errore durante il caricamento:', error);
      console.error('[Firestore] Dettagli errore:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      addDebugMessage(`[Firestore] Errore caricamento: ${error.message || error} (${error.code || 'unknown'})`, 'error');
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
      addDebugMessage('❌ Firestore non disponibile', 'error');
      return false;
    }
    console.log('✅ window.firebaseDB disponibile');
    
    // 2. Verifica utente autenticato
    if (!currentUser || !currentUser.uid) {
      console.error('❌ Utente non autenticato o uid mancante');
      addDebugMessage('❌ Utente non autenticato', 'error');
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
      addDebugMessage(`❌ Test Firestore fallito: ${error.message} (${error.code})`, 'error');
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
  async function listProjectsFromFirestore(userId) {
    try {
      if (!window.firebaseDB || !userId) {
        return [];
      }

      const projectsRef = window.firebaseDB
        .collection('users')
        .doc(userId)
        .collection('projects');

      const snapshot = await projectsRef.get();
      const projects = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        projects.push({
          id: doc.id,
          name: data.name || doc.id,
          updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
        });
      });

      return projects;
    } catch (error) {
      console.error('[Firestore] Errore durante il listing:', error);
      return [];
    }
  }

  /**
   * Sincronizza i progetti da Firestore al login
   * Carica tutti i progetti da Firestore e li sincronizza con localStorage
   * @param {string} userId - ID utente (uid di Firebase)
   * @returns {Promise<boolean>} - true se sincronizzazione completata, false altrimenti
   * 
   * AGGIUNTO: Questa funzione sincronizza i progetti da Firestore al login
   */
  async function syncProjectsFromFirestore(userId) {
    try {
      console.log('[Sync] Inizio sincronizzazione progetti da Firestore...', { userId });
      
      if (!window.firebaseDB || !userId) {
        console.warn('[Sync] Firestore non disponibile o userId mancante');
        return false;
      }

      // Verifica che l'utente sia autenticato
      if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        console.warn('[Sync] Utente non autenticato - impossibile sincronizzare');
        return false;
      }

      const currentAuthUid = window.firebaseAuth.currentUser.uid;
      if (currentAuthUid !== userId) {
        console.error('[Sync] userId non corrisponde a utente autenticato', { userId, currentAuthUid });
        return false;
      }

      // Carica lista progetti da Firestore
      const firestoreProjects = await listProjectsFromFirestore(userId);
      console.log('[Sync] Progetti trovati su Firestore:', firestoreProjects.length);

      if (firestoreProjects.length === 0) {
        console.log('[Sync] Nessun progetto su Firestore, sincronizzazione completata');
        return true;
      }

      // Carica progetti locali esistenti
      const localProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
      console.log('[Sync] Progetti locali esistenti:', localProjects.length);

      // Crea una mappa dei progetti locali per confronto rapido
      const localProjectsMap = new Map();
      localProjects.forEach(p => {
        if (p && p.settings && p.settings.name) {
          const projectId = p.settings.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
          localProjectsMap.set(projectId, p);
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

          // Prepara entry per la lista progetti
          const projectEntry = {
            settings: projectData.settings || { name: projectName },
            updatedAt: firestoreProject.updatedAt || new Date().toISOString(),
            createdAt: firestoreProject.createdAt || new Date().toISOString(),
            source: 'firestore'
          };

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
              const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
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
            const projectKey = `amiantoProject_${currentUser.username}:${projectName}`;
            localStorage.setItem(projectKey, jsonString);
            
            console.log(`[Sync] Nuovo progetto sincronizzato da Firestore: ${projectName}`);
          }

          syncedCount++;
        } catch (error) {
          console.error(`[Sync] Errore sincronizzazione progetto ${firestoreProject.name}:`, error);
        }
      }

      // Aggiungi progetti locali che non sono su Firestore (mantieni backup locale)
      localProjects.forEach(localProject => {
        if (localProject && localProject.settings && localProject.settings.name) {
          const projectId = localProject.settings.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
          const existsInFirestore = firestoreProjects.some(fp => {
            const fpId = fp.id || fp.name.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
            return fpId === projectId;
          });
          
          if (!existsInFirestore) {
            // Progetto locale non su Firestore: mantienilo (potrebbe essere non ancora sincronizzato)
            syncedProjects.push(localProject);
            console.log(`[Sync] Progetto locale mantenuto (non su Firestore): ${localProject.settings.name}`);
          }
        }
      });

      // Salva lista sincronizzata in localStorage
      localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(syncedProjects));

      console.log(`[Sync] ✅ Sincronizzazione completata: ${syncedCount} progetti sincronizzati (${newCount} nuovi, ${updatedCount} aggiornati)`);
      addDebugMessage(`Sincronizzati ${syncedCount} progetti da Firestore`, 'success');
      
      return true;
    } catch (error) {
      console.error('[Sync] ❌ Errore durante la sincronizzazione:', error);
      addDebugMessage(`Errore sincronizzazione: ${error.message || error}`, 'error');
      return false;
    }
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

    const jsonString = window.serializeProjectToJsonString(true);
    const projectObj = window.serializeProject();
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
      addDebugMessage('[Firestore] Utente non autenticato correttamente', 'error');
      // Continua con cache locale come fallback
    }

    // 1. SALVATAGGIO FIRESTORE (fonte ufficiale)
    let firestoreSuccess = false;
    if (userId) {
      console.log('[Save] Tentativo salvataggio su Firestore...', { userId, projectId, projectName });
      firestoreSuccess = await saveProjectToFirestore(userId, projectId, projectObj);
      console.log('[Save] Risultato salvataggio Firestore:', firestoreSuccess);
    } else {
      console.warn('[Save] userId non disponibile, salto Firestore');
    }

    // 2. CACHE LOCALE (backup temporaneo) - GIÀ IMPLEMENTATO, ora centralizzato
    autosaveToCache(projectName, jsonString);

    // 3. MIRROR IN LOCALSTORAGE (usato dal runtime) - GIÀ IMPLEMENTATO
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);

    // 4. LIGHTWEIGHT ENTRY PER LISTING - GIÀ IMPLEMENTATO
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    const idx = userProjects.findIndex(p => p && p.settings && p.settings.name === projectName);
    const entry = { 
      settings: projectObj.settings, 
      updatedAt: new Date().toISOString(),
      source: firestoreSuccess ? 'firestore' : 'cache' // Traccia la fonte
    };
    if (idx >= 0) userProjects[idx] = entry; else userProjects.push(entry);
    localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(userProjects));

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
    } else {
      showNotification('Project saved to cache (Firestore unavailable)', 'warning');
    }
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
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    const entry = {
      settings: newProject.settings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    userProjects.push(entry);
    localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(userProjects));

    // Salva su Firestore se l'utente è autenticato
    const userId = currentUser.uid;
    if (userId && window.firebaseDB) {
      const projectId = trimmedName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
      await saveProjectToFirestore(userId, projectId, newProject);
    }

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
      case 'character':
      case 'cursor':
        // Questi tipi vanno in sprites per compatibilità
        return 'sprites';
      case 'audio':
        return 'audio';
      default:
        return 'sprites';
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
  async function uploadImageToStorage(file, projectId, assetType, assetId = null) {
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

      // Determina categoria (backgrounds, foregrounds, sprites, audio)
      const category = getStorageFolderForType(assetType);
      
      console.log('[Asset] Upload immagine su Supabase...', { projectId, category, assetType, assetId });

      // Usa la funzione uploadAsset da supabase.js
      const result = await window.supabaseStorage.uploadAsset(file, projectId, category, assetId);
      
      // Costruisci storagePath per compatibilità con il resto del codice
      // Usa il fileName generato da Supabase (include assetId)
      const generatedFileName = result.fileName || result.url.split('/').pop().split('?')[0];
      const storagePath = `${projectId}/${category}/${generatedFileName}`;
      
      console.log('[Asset] ✅ Immagine caricata con successo:', { assetId, storagePath, downloadURL: result.url, fileName: generatedFileName });
      
      return {
        assetId,
        storagePath,
        downloadURL: result.url,
        fileName: generatedFileName // Nome file generato (con assetId) per risoluzione futura
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
  async function saveAssetMetadata(projectId, assetId, name, assetType, storagePath, fileName = null, publicUrl = null) {
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
  async function uploadImage(file, projectId, assetType) {
    try {
      // Upload su Supabase Storage
      const { assetId, storagePath, downloadURL, fileName } = await uploadImageToStorage(file, projectId, assetType);
      
      // Salva metadata in Firestore (include fileName e publicUrl per Supabase)
      // Nota: Se il salvataggio dei metadati fallisce, non blocchiamo l'upload
      // perché l'asset è già caricato su Supabase Storage
      const metadataSaved = await saveAssetMetadata(projectId, assetId, file.name, assetType, storagePath, fileName, downloadURL);
      
      if (!metadataSaved) {
        console.warn('[Asset] ⚠️ Upload completato su Supabase, ma salvataggio metadati Firestore fallito. L\'asset è comunque disponibile.');
      }
      
      return { assetId, downloadURL };
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
        showNotification('Errore CORS: immagine non caricabile. Ricarica l\'immagine dal progetto.', 'error');
      }
      return img;
    }

    // Fallback: tratta come URL normale (dataURL o HTTP)
    return await loadImageFromUrl(urlOrAssetId);
  }

  async function applyProjectObject(projectObj) {
    try {
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
            sceneObjects: Array.isArray(r.sceneObjects) ? r.sceneObjects.map(o => ({
              id: o.id || uid('scene'),
              name: o.name || 'Object',
              type: o.type || 'Interactive',
              x: Number(o.x) || 0,
              y: Number(o.y) || 0,
              img: null
            })) : [],
            walkableArea: Array.isArray(r.walkableArea) ? r.walkableArea.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
            hotspots: Array.isArray(r.hotspots) ? r.hotspots.map(h => ({
              id: h.id || uid('hotspot'),
              name: h.name || 'Hotspot',
              points: Array.isArray(h.points) ? h.points.map(p => ({ x: Number(p.x)||0, y: Number(p.y)||0 })) : [],
              visible: (typeof h.visible === 'boolean') ? h.visible : true
            })) : []
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
              const out = [];
              for (const f of r.foregrounds) {
                const img = f.image ? await createImageFromDataUrl(f.image, projectId) : null;
                out.push({
                  id: f.id || uid('fg'),
                  name: f.name || 'Layer',
                  img: img,
                  offsetX: Number(f.offsetX)||0,
                  offsetY: Number(f.offsetY)||0
                });
                // Se è un assetId, registra nella mappa
                if (img && f.image && f.image.startsWith('asset:')) {
                  const assetId = f.image.replace('asset:', '');
                  imageAssetMap.set(img, { assetId, type: 'foreground', projectId });
                }
              }
              roomVal.foregrounds = out;
              refreshForegroundListUI();
              redraw();
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
              const list = document.getElementById('scene-objects-list');
              if (list) {
                list.innerHTML = '';
                roomVal.sceneObjects.forEach(obj => {
                  const item = document.createElement('div');
                  item.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
                  item.dataset.objectId = obj.id;
                  item.innerHTML = `
        <div>
          <strong>${obj.name}</strong>
          <br><small>Scene object</small>
          <br><span class="badge bg-warning">Interactive</span>
          <br><small style="color: #888;">Position: ${Math.round(obj.x)}, ${Math.round(obj.y)}</small>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editSceneObject(this)">✏️</button>
          <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeSceneObject(this)">🗑️</button>
        </div>
                  `;
                  list.appendChild(item);
                });
              }
              redraw();
            }
            refreshHotspotsListUI();
          });
        }
      } else {
        // assicura almeno una stanza
        const rid = uid('room');
        rooms.set(rid, { id: rid, name: 'Room 1', background: null, foregrounds: [], sceneObjects: [], walkableArea: [], hotspots: [] });
      }
      // Seleziona prima stanza e sincronizza riferimenti
      const firstRoom = rooms.keys().next().value;
      currentRoomId = firstRoom;
      bindRoomRefs();
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
          
          guis.push({
            id: g.id || uid('gui'),
            name: g.name || 'GUI',
            type: g.type || 'MainInterface',
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
        if (Array.isArray(projectObj.characters)) {
          for (const ch of projectObj.characters) {
            const directions = {};
            if (ch && ch.directions) {
              for (const [dir, data] of Object.entries(ch.directions)) {
                const frames = [];
                if (Array.isArray(data.frames)) {
                  for (const f of data.frames) {
                    const img = await createImageFromDataUrl(f, projectId);
                    if (img) {
                      frames.push(img);
                      // Se è un assetId, registra nella mappa
                      if (f && f.startsWith('asset:')) {
                        const assetId = f.replace('asset:', '');
                        imageAssetMap.set(img, { assetId, type: 'character', projectId });
                      }
                    }
                  }
                }
                directions[dir] = { fps: Number(data.fps) || 8, frames: frames };
              }
            }
            characterFrames.set(ch.name || uid('char'), { directions, currentFrame: 0 });
          }
        }
        refreshCharacterSelector();
        refreshStartingPlayerUI();
      } catch(_) {}

      // Inventory UI (lista DOM)
      try {
        const inv = Array.isArray(projectObj.inventory) ? projectObj.inventory : [];
        const list = document.getElementById('inventory-list');
        if (list) {
          list.innerHTML = '';
          inv.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-group-item bg-secondary text-light d-flex justify-content-between align-items-center';
            el.innerHTML = `
              <div>
                <strong>${item.name || 'Item'}</strong>
                <br><small>Inventory item</small>
              </div>
              <div>
                <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editInventoryObject(this)">✏️</button>
                <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="removeInventoryObject(this)">🗑️</button>
              </div>
            `;
            list.appendChild(el);
          });
        }
        refreshInventoryScriptTargets();
      } catch(_) {}

      // Scripts
      try {
        jsScripts.clear();
        const selector = document.getElementById('script-selector');
        if (selector) {
          // reset, mantieni placeholder
          selector.innerHTML = '';
          const opt0 = document.createElement('option');
          opt0.value = ''; opt0.textContent = 'Select a script...';
          selector.appendChild(opt0);
        }
        if (projectObj.scripts && typeof projectObj.scripts === 'object') {
          Object.entries(projectObj.scripts).forEach(([name, content]) => {
            if (!name) return;
            jsScripts.set(String(name), String(content || ''));
            localStorage.setItem(`script-${name}`, String(content || ''));
            if (selector) {
              const o = document.createElement('option');
              o.value = name; o.textContent = name;
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
        hotspotScripts.clear();
        if (projectObj.attachments && typeof projectObj.attachments === 'object') {
          const A = projectObj.attachments;
          if (A.roomScripts && typeof A.roomScripts === 'object') Object.entries(A.roomScripts).forEach(([k,v]) => { if (k && v) roomScripts.set(String(k), String(v)); });
          if (A.objectScripts && typeof A.objectScripts === 'object') Object.entries(A.objectScripts).forEach(([k,v]) => { if (k && v) objectScripts.set(String(k), String(v)); });
          if (A.characterScripts && typeof A.characterScripts === 'object') Object.entries(A.characterScripts).forEach(([k,v]) => { if (k && v) characterScripts.set(String(k), String(v)); });
          if (A.inventoryScripts && typeof A.inventoryScripts === 'object') Object.entries(A.inventoryScripts).forEach(([k,v]) => { if (k && v) inventoryScripts.set(String(k), String(v)); });
          if (A.guiScripts && typeof A.guiScripts === 'object') Object.entries(A.guiScripts).forEach(([k,v]) => { if (k && v) guiScripts.set(String(k), String(v)); });
          if (A.hotspotScripts && typeof A.hotspotScripts === 'object') Object.entries(A.hotspotScripts).forEach(([k,v]) => { if (k && v) hotspotScripts.set(String(k), String(v)); });
        }
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

      redraw();
      showNotification('Project loaded', 'success');
    } catch (err) {
      addDebugMessage('Failed to apply project: ' + (err && err.message ? err.message : err), 'error');
      showNotification('Errore nel caricamento del progetto', 'danger');
    }
  }

  window.importProjectFromJson = async function(jsonString) {
    try {
      const obj = JSON.parse(jsonString);
      await applyProjectObject(obj);
    } catch (err) {
      addDebugMessage('Invalid project JSON: ' + (err && err.message ? err.message : err), 'error');
      showNotification('JSON progetto non valido', 'danger');
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

    // Mostra notifica con fonte di caricamento
    if (loadedFrom === 'firestore') {
      showNotification(`Project "${projectName}" loaded from Firestore`, 'success');
    } else if (loadedFrom === 'cache' || loadedFrom === 'opfs') {
      showNotification(`Project "${projectName}" loaded from ${loadedFrom}`, 'info');
    }
    
    // Il modale verrà chiuso dal chiamante dopo questa funzione completa
  }

  // MODIFICATO: Ora elimina anche da Firestore
  async function deleteProjectByName(projectName) {
    if (!currentUser) { showNotification('Please login to delete projects', 'warning'); return; }
    if (!projectName) return;
    if (!confirm(`Delete project "${projectName}"? This action cannot be undone.`)) return;
    
    const projectId = projectName.replace(/[^a-z0-9-_\s]/gi, '_').toLowerCase().replace(/\s+/g, '_');
    
    // IMPORTANTE: Per Firestore dobbiamo usare SEMPRE uid (non username)
    const userId = currentUser.uid;

    // 1. ELIMINA DA FIRESTORE (se disponibile) - AGGIUNTO
    if (userId && window.firebaseDB) {
      try {
        const projectRef = window.firebaseDB
          .collection('users')
          .doc(userId)
          .collection('projects')
          .doc(projectId);
        await projectRef.delete();
        console.log(`[Firestore] Progetto eliminato: ${projectName}`);
        addDebugMessage(`[Firestore] Progetto eliminato: ${projectName}`, 'success');
      } catch (error) {
        console.error('[Firestore] Errore eliminazione:', error);
        addDebugMessage(`[Firestore] Errore eliminazione: ${error.message || error}`, 'error');
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
    
    // 3. Rimuovi dalla lista progetti - GIÀ IMPLEMENTATO
    const list = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    const filtered = list.filter(p => !(p && p.settings && p.settings.name === projectName));
    localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(filtered));
    
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
    
    // 10. Se non ci sono più progetti, mostra il modale di selezione
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
        if (!window.showOpenFilePicker) { showNotification('Import non supportato su questo browser', 'warning'); return; }
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
        showNotification('Progetto importato', 'success');
      } catch (err) {
        addDebugMessage('Import failed: ' + (err && err.message ? err.message : err), 'error');
        showNotification('Import fallito', 'danger');
      }
    });
  };

  // Delete current project
  window.deleteCurrentProject = function() {
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
      }
      
      showNotification('Project deleted successfully!', 'success');
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
    if (typeSel) typeSel.value = gui.type || 'MainInterface';
    renderGuiSettingsPanel(gui.type || 'MainInterface', gui.settings || {});
    
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

  window.uploadCursorImage = function(input) {
    // TODO: not yet implemented - Upload cursor images to Firebase Storage
    // Per ora carica localmente come fallback
    if (!selectedCursorId) {
      showNotification('Please select a cursor first', 'warning');
      return;
    }
    
    const file = input.files ? input.files[0] : null;
    if (!file) return;
    
    const cursor = contextualCursors.find(c => c.id === selectedCursorId);
    if (!cursor) return;
    
    const img = new Image();
    img.onload = () => {
      cursor.cursorImage = img;
      showNotification(`Cursor image loaded for ${cursor.targetType}: ${cursor.targetId} (not saved to Storage)`, 'warning');
      refreshCursorsList();
    };
    img.src = URL.createObjectURL(file);
  };

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
});
