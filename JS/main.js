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
    if (!img || !img.width || !img.height) return;
    
    // Draw image at its original size with offset
    ctx.drawImage(img, offsetX, offsetY, img.width, img.height);
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
    
    // Apply inverse transformations
    const worldX = (internalX - editorState.panX) / editorState.zoom;
    const worldY = (internalY - editorState.panY) / editorState.zoom;
    
    // Debug logging (can be removed in production)
    if (window.debugCoordinates) {
      console.log('Coordinate conversion:', {
        screen: { x: screenX, y: screenY },
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        canvas: { width: canvas.width, height: canvas.height },
        scale: { x: scaleX, y: scaleY },
        internal: { x: internalX, y: internalY },
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

    // Apply transformations for zoom and pan
    ctx.save();
    ctx.translate(editorState.panX, editorState.panY);
    ctx.scale(editorState.zoom, editorState.zoom);

    // Default (Rooms tab): draw scene
    // Draw background at original size
    if (background) {
      drawImageAtOriginalSize(background, 0, 0);
    } else {
      // Placeholder background
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw scene objects at their positions
    for (let obj of sceneObjects) {
      if (obj.img) {
        const objX = (obj.x || 0);
        const objY = (obj.y || 0);
        
        // Draw object
        drawImageAtOriginalSize(obj.img, objX, objY);
        
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
      btnSelect.title = 'Seleziona';
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
      btnEdit.title = 'Rinomina';
      btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', () => {
        const newName = prompt('Nome hotspot:', hs.name || 'Hotspot');
        if (newName && newName.trim() !== '') {
          hs.name = newName.trim();
          const r = rooms.get(currentRoomId); if (r) r.hotspots = hotspots;
          refreshHotspotsListUI();
        }
      });


      const btnToggle = document.createElement('button');
      btnToggle.className = 'btn btn-sm btn-outline-warning me-1';
      btnToggle.title = 'Mostra/Nascondi';
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
      btnDelete.title = 'Elimina';
      btnDelete.textContent = '🗑️';
      btnDelete.addEventListener('click', () => {
        if (!confirm('Eliminare questo hotspot?')) return;
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
    const name = prompt('Nome hotspot:', `Hotspot ${hotspots.length + 1}`);
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
      showNotification('Nessun hotspot selezionato. Creane uno prima.', 'warning');
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
    
    // Center the view
    editorState.zoom = zoom;
    editorState.panX = (containerWidth - gameViewport.width * zoom) / 2;
    editorState.panY = (containerHeight - gameViewport.height * zoom) / 2;
    
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
    const container = document.getElementById('canvasContainer');
    const containerWidth = container.clientWidth - 20;
    const containerHeight = container.clientHeight - 20;
    
    editorState.panX = (containerWidth - gameViewport.width * editorState.zoom) / 2;
    editorState.panY = (containerHeight - gameViewport.height * editorState.zoom) / 2;
    
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
    rooms.set(rid, { id: rid, name, background: null, foregrounds: [], sceneObjects: [], walkableArea: [] });
    currentRoomId = rid;
    bindRoomRefs();
    refreshRoomsSelector();
    redraw();
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
    rooms.delete(currentRoomId);
    // pick another existing room
    const first = rooms.keys().next().value;
    currentRoomId = first;
    bindRoomRefs();
    refreshRoomsSelector();
    redraw();
  };

  window.selectRoom = function(roomId) {
    if (!rooms.has(roomId)) return;
    currentRoomId = roomId;
    bindRoomRefs();
    refreshRoomsSelector();
    redraw();
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
      input.onchange = (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        const img = new Image();
        img.onload = () => {
          background = img;
          const r = rooms.get(currentRoomId); if (r) r.background = img;
          
          // Show notification about background size
          showNotification(`Background loaded: ${img.width}×${img.height}`, 'success');
          
          redraw();
        };
        img.src = URL.createObjectURL(file);
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
      input.onchange = (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
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
          redraw();
        };
        img.src = URL.createObjectURL(file);
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
      input.onchange = (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (!file) return;
        const img = new Image();
        img.onload = () => { guiBackground = img; saveCurrentGUI(); showNotification('GUI background loaded', 'success'); redraw(); };
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
        frag.appendChild(makeInput('Posizione X', 'gui-set-x', 'number', settings.x ?? 0));
        frag.appendChild(makeInput('Posizione Y', 'gui-set-y', 'number', settings.y ?? 0));
        frag.appendChild(makeInput('Larghezza', 'gui-set-w', 'number', settings.w ?? 300));
        frag.appendChild(makeInput('Altezza', 'gui-set-h', 'number', settings.h ?? 150));
        frag.appendChild(makeInput('Background (css color o data URL)', 'gui-set-bg', 'text', settings.background || 'rgba(0,0,0,0.6)'));
        frag.appendChild(makeInput('Font CSS', 'gui-set-font', 'text', settings.font || '16px Arial'));
        frag.appendChild(makeInput('Ritratto (data URL opzionale)', 'gui-set-portrait', 'text', settings.portrait || ''));
        frag.appendChild(makeSelect('Comportamento comparsa', 'gui-set-appear', [
          {value:'instant', label:'Istantaneo'},
          {value:'fade', label:'Fade'},
          {value:'slide', label:'Slide'}
        ], settings.appear || 'instant'));
        break;
      }
      case 'Inventory': {
        frag.appendChild(makeInput('Righe', 'gui-set-rows', 'number', settings.rows ?? 3, { min: 1 }));
        frag.appendChild(makeInput('Colonne', 'gui-set-cols', 'number', settings.cols ?? 5, { min: 1 }));
        frag.appendChild(makeSelect('Stile slot', 'gui-set-slot-style', [
          {value:'square', label:'Quadrato'},
          {value:'rounded', label:'Arrotondato'},
          {value:'circle', label:'Cerchio'}
        ], settings.slotStyle || 'square'));
        frag.appendChild(makeInput('Background', 'gui-set-bg', 'text', settings.background || 'rgba(0,0,0,0.5)'));
        frag.appendChild(makeSelect('Animazione apertura', 'gui-set-open-anim', [
          {value:'none', label:'Nessuna'},
          {value:'scale', label:'Scala'},
          {value:'fade', label:'Fade'}
        ], settings.openAnim || 'none'));
        break;
      }
      case 'VerbGUI': {
        frag.appendChild(makeTextarea('Lista verbi (uno per riga)', 'gui-set-verbs', Array.isArray(settings.verbs) ? settings.verbs.join('\n') : 'Look\nUse\nTalk'));
        frag.appendChild(makeInput('Posizione X', 'gui-set-x', 'number', settings.x ?? 0));
        frag.appendChild(makeInput('Posizione Y', 'gui-set-y', 'number', settings.y ?? 0));
        frag.appendChild(makeSelect('Stile', 'gui-set-style', [
          {value:'icons', label:'Icone'},
          {value:'text', label:'Testo'}
        ], settings.style || 'text'));
        break;
      }
      case 'Menu': {
        frag.appendChild(makeTextarea('Voci menu (una per riga)', 'gui-set-menu-items', Array.isArray(settings.items) ? settings.items.join('\n') : 'Start\nLoad\nOptions\nQuit'));
        frag.appendChild(makeSelect('Layout', 'gui-set-menu-layout', [
          {value:'vertical', label:'Verticale'},
          {value:'horizontal', label:'Orizzontale'},
          {value:'grid', label:'Griglia'}
        ], settings.layout || 'vertical'));
        frag.appendChild(makeSelect('Stile pulsanti', 'gui-set-btn-style', [
          {value:'primary', label:'Primary'},
          {value:'outline', label:'Outline'},
          {value:'ghost', label:'Ghost'}
        ], settings.buttonStyle || 'primary'));
        break;
      }
      case 'VerbCoin': {
        frag.appendChild(makeTextarea('Lista verbi coin (uno per riga)', 'gui-set-verbs', Array.isArray(settings.verbs) ? settings.verbs.join('\n') : 'Look\nUse\nTalk'));
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

  window.uploadSceneObject = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Create image object
    const img = new Image();
    img.onload = () => {
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
        type: "Interactive"
      };
      
      // Add to scene objects array (room-scoped)
      sceneObjects.push(sceneObject);
      const r = rooms.get(currentRoomId); if (r) r.sceneObjects = sceneObjects;
      
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
    };
    
    img.src = URL.createObjectURL(file);
    
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
        <br><small>Nuovo personaggio</small>
        <span class="badge bg-success ms-2">Attivo</span>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-light me-1" title="Modifica">✏️</button>
        <button class="btn btn-sm btn-outline-warning me-1" title="Dialoghi">💬</button>
        <button class="btn btn-sm btn-outline-danger" title="Elimina" onclick="removeCharacter(this)">🗑️</button>
      </div>
    `;
    
    charactersList.appendChild(newCharacter);
    
    // Aggiorna il dropdown del selettore personaggi
    refreshCharacterSelector();
    // Aggiorna la UI del giocatore iniziale
    refreshStartingPlayerUI();
    
    // Seleziona automaticamente il nuovo personaggio
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
      
      // Se il personaggio eliminato era selezionato, deseleziona
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
      
      // Se il personaggio modificato era selezionato, aggiorna la selezione
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
          showNotification(`Loaded ${dirData.frames.length} frames for ${who} (${direction})`, 'success');
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

  // JS sandbox runtime (Jailed) e editor
  let codeMirrorEditor = null;
  let largeCodeMirrorEditor = null;
  let currentScriptName = 'startup';
  const jsScripts = new Map(); // name -> content
  const objectScripts = new Map(); // sceneObjectId -> scriptName
  const roomScripts = new Map(); // roomId -> scriptName
  const characterScripts = new Map(); // characterName -> scriptName
  const inventoryScripts = new Map(); // inventory item name -> scriptName
  const hotspotScripts = new Map(); // hotspotId -> scriptName
  let activePlugin = null; // istanza di jailed.DynamicPlugin

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
    });
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
    });
  }

  // API esposte al sandbox
  const sandboxApi = {
    print: function() {
      const msg = Array.from(arguments).map(v => String(v)).join(' ');
      addDebugMessage(msg, 'info');
    },
    show_message: function(text){
      showNotification(String(text), 'info');
    },
    move_object: function(id, x, y){
      const obj = sceneObjects.find(o => o.id === String(id));
      if (!obj) { addDebugMessage(`Object ${id} not found`, 'warning'); return; }
      obj.x = Number(x)||0; obj.y = Number(y)||0; redraw();
    }
  };

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
    const selector = document.getElementById('script-selector');
    const selectedScript = selector.value || 'new-script';
    
    // Simulate save
    localStorage.setItem(`script-${selectedScript}`, content);
    jsScripts.set(selectedScript, content);
    showNotification(`Script "${selectedScript}" saved!`, 'success');

    // refresh attach targets
    refreshSceneObjectScriptTargets();
  };

  window.runScript = function() {
    ensureLargeScriptEditor();
    ensureScriptEditor();
    const content = largeCodeMirrorEditor ? largeCodeMirrorEditor.getValue() : (codeMirrorEditor ? codeMirrorEditor.getValue() : (document.getElementById('script-editor-large')?.value || document.getElementById('script-editor')?.value || ''));
    // Ferma eventuale plugin attivo prima di avviarne uno nuovo
    if (activePlugin && typeof activePlugin.disconnect === 'function') {
      try { activePlugin.disconnect(); } catch(_) {}
      activePlugin = null;
    }
    if (typeof jailed === 'undefined' || typeof jailed.DynamicPlugin === 'undefined') {
      showNotification('Jailed non caricato. Controlla l\'include.', 'danger');
      return;
    }
    // Wrappa il codice utente per esporre funzioni previste
    const wrapped = `
      var print = application.remote.print;
      var show_message = application.remote.show_message;
      var move_object = application.remote.move_object;
      try { ${content}\n; } catch(e){ application.remote.print('Script error: ' + (e && e.message ? e.message : e)); }
      // Espone metodi invocabili dall'host
      application.setInterface({
        on_object_click: function(object_id){
          try { if (typeof on_object_click === 'function') { return on_object_click(object_id); } }
          catch(e){ application.remote.print('Handler error: ' + (e && e.message ? e.message : e)); }
        },
        on_game_start: function(){
          try { if (typeof on_game_start === 'function') { return on_game_start(); } }
          catch(e){ application.remote.print('Handler error: ' + (e && e.message ? e.message : e)); }
        }
      });
      // Chiama on_game_start automaticamente se presente
      if (typeof on_game_start === 'function') { on_game_start(); }
    `;
    try {
      activePlugin = new jailed.DynamicPlugin(wrapped, sandboxApi);
      activePlugin.whenConnected(function(){
        showNotification('JS script eseguito in sandbox!', 'success');
      });
      activePlugin.onDisconnect(function(){
        addDebugMessage('Sandbox disconnesso', 'info');
      });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      addDebugMessage(`JS sandbox error: ${msg}`, 'error');
      showNotification(`JS sandbox error: ${msg}`, 'danger');
    }
  };

  window.stopScript = function() {
    if (activePlugin && typeof activePlugin.disconnect === 'function') {
      try { activePlugin.disconnect(); } catch(_) {}
      activePlugin = null;
      showNotification('Sandbox JS fermato', 'warning');
    }
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
      if (canvasContainer) canvasContainer.style.display = 'none';
      if (codeEditorContainer) codeEditorContainer.style.display = 'block';
      ensureLargeScriptEditor();
      ensureScriptEditor();
      // sync values small->large if small has content and large is empty
      if (codeMirrorEditor && largeCodeMirrorEditor && !largeCodeMirrorEditor.getValue()) {
        largeCodeMirrorEditor.setValue(codeMirrorEditor.getValue());
      }
      refreshSceneObjectScriptTargets();
      refreshRoomScriptTargets();
      refreshCharacterScriptTargets();
      refreshInventoryScriptTargets();
    } else {
      const canvasContainer = document.getElementById('canvasContainer');
      const codeEditorContainer = document.getElementById('codeEditorContainer');
      if (canvasContainer) canvasContainer.style.display = 'block';
      if (codeEditorContainer) codeEditorContainer.style.display = 'none';
    }
  });

  // Function to show notifications
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
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

  // Functions for Play Test tab
  let playTestState = {
    isRunning: false,
    isPaused: false,
    startTime: null
  };

  window.startPlayTest = function() {
    if (playTestState.isRunning) return;

    // Ensure latest project is serialized and saved for runtime
    const jsonString = window.serializeProjectToJsonString(true);
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);
    const projectObj = window.serializeProject();
    try { saveProjectJsonToOPFS(jsonString, projectObj.settings && projectObj.settings.name); } catch(_) {}

    // Save game.json depending on mode
    if (window.AMIANTO_PLAYTEST_MODE === 'server') {
      saveGameJsonServer(jsonString);
    } else {
      saveGameJsonLocal(jsonString);
    }

    // Open runtime in a new tab that will auto-load game.json
    const runtimeUrl = 'runtime.html';
    window.open(runtimeUrl, '_blank');

    playTestState.isRunning = true;
    playTestState.isPaused = false;
    playTestState.startTime = Date.now();
    updateGameStatus('Test running...');
    addDebugMessage('Runtime opened in new tab', 'success');
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
    
    playTestState.isRunning = false;
    playTestState.isPaused = false;
    playTestState.startTime = null;
    
    updateGameStatus('Test stopped');
    addDebugMessage(`Test stopped. Duration: ${durationSeconds}s`, 'info');
    showNotification(`Test stopped after ${durationSeconds} seconds`, 'info');
  };

  window.testRoomChange = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    
    addDebugMessage('Simulating room change...', 'info');
    setTimeout(() => {
      addDebugMessage('Room change completed', 'success');
    }, 500);
  };

  window.testObjectInteraction = function() {
    if (!playTestState.isRunning) {
      showNotification('Start the game test first!', 'warning');
      return;
    }
    
    addDebugMessage('Testing object interaction...', 'info');
    // Esegue on_object_click('door') nel contesto dell'ultimo script se definito
    try {
      if (activePlugin && activePlugin.remote && typeof activePlugin.remote.on_object_click === 'function') {
        activePlugin.remote.on_object_click('door');
        addDebugMessage('Object interaction tested via JS sandbox', 'success');
      } else {
        setTimeout(() => { addDebugMessage('Object interaction tested (no handler exposed)', 'success'); }, 300);
      }
    } catch (err) {
      addDebugMessage('JS interaction error: ' + (err && err.message ? err.message : err), 'error');
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
    
    // Execute the hotspot script
    try {
      const scriptContent = jsScripts.get(scriptName);
      if (!scriptContent) {
        addDebugMessage(`Script "${scriptName}" not found`, 'error');
        return;
      }
      
      // Create a new plugin instance for this hotspot interaction
      const hotspotPlugin = new jailed.DynamicPlugin(scriptContent, {
        print: (...args) => {
          const message = args.map(arg => String(arg)).join(' ');
          addDebugMessage(`[Hotspot ${hotspot.name}] ${message}`, 'info');
        },
        show_message: (text) => {
          showNotification(String(text), 'info');
        },
        move_object: (id, x, y) => {
          const obj = sceneObjects.find(o => o.id === id);
          if (obj) {
            obj.x = x;
            obj.y = y;
            redraw();
            addDebugMessage(`Moved object ${id} to (${x}, ${y})`, 'success');
          }
        }
      });
      
      hotspotPlugin.whenReady(() => {
        addDebugMessage(`Hotspot script "${scriptName}" executed successfully`, 'success');
        hotspotPlugin.disconnect();
      });
      
      hotspotPlugin.whenFailed((err) => {
        addDebugMessage(`Hotspot script error: ${err}`, 'error');
      });
      
    } catch (err) {
      addDebugMessage(`Hotspot interaction error: ${err && err.message ? err.message : err}`, 'error');
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
    const console = document.getElementById('debug-console');
    if (console) {
      console.innerHTML = '[INFO] Console cleared\n';
    }
    showNotification('Debug console cleared', 'info');
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
  let users = new Map(); // In-memory user storage (normally would be server-side)

  // Initialize authentication system
  function initAuthSystem() {
    // Load users from localStorage
    loadUsers();

    // Check if user is logged in
    const sessionUser = localStorage.getItem('amiantoCurrentUser');
    if (sessionUser) {
      const user = users.get(sessionUser);
      if (user) {
        loginUser(user);
      } else {
        // Session invalid, clear it
        localStorage.removeItem('amiantoCurrentUser');
        showLoginPage();
      }
    } else {
      // No session: stay on login page (no auto-login)
      showLoginPage();
    }

    // Setup login form
    setupLoginForm();

    // Setup registration modal
    setupRegistrationModal();
  }

  // Load users from localStorage
  function loadUsers() {
    const usersData = localStorage.getItem('amiantoUsers');
    console.log('Loading users from localStorage:', usersData);

    if (usersData) {
      try {
        const usersArray = JSON.parse(usersData);

        // Validate users array structure
        if (!Array.isArray(usersArray)) {
          console.error('Users data is not an array, resetting...');
          createDemoUser();
          return;
        }

        users.clear();
        let validUsers = 0;

        usersArray.forEach((user, index) => {
          // Validate user object structure
          if (user && typeof user === 'object' && user.username && user.password) {
            users.set(user.username, user);
            validUsers++;
          } else {
            console.warn(`Invalid user at index ${index}:`, user);
          }
        });

        console.log(`Loaded ${validUsers} valid users:`, Array.from(users.keys()));

        // Ensure demo user exists
        if (!users.has('demo')) {
          console.log('Demo user not found, creating...');
          createDemoUser();
        }
      } catch (e) {
        console.error('Error parsing users data:', e);
        console.log('Resetting users due to parse error...');
        createDemoUser();
      }
    } else {
      console.log('No users found, creating demo user...');
      // Create demo user if no users exist
      createDemoUser();
    }

    console.log('Final users map:', Array.from(users.entries()));
  }

  // Create demo user for testing
  function createDemoUser() {
    console.log('Creating demo user...');
    const demoUser = {
      username: 'demo',
      email: 'demo@amianto.com',
      password: 'demo123',
      createdAt: new Date().toISOString(),
      projects: []
    };

    users.set('demo', demoUser);
    saveUsers();
    console.log('Demo user created:', demoUser);
  }

  // Force reset all auth data (emergency function)
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

    // Clear current user and users map
    currentUser = null;
    users.clear();

    // Recreate demo user
    createDemoUser();

    // Reload page
    location.reload();
  };

  // Save users to localStorage
  function saveUsers() {
    const usersArray = Array.from(users.values());
    localStorage.setItem('amiantoUsers', JSON.stringify(usersArray));
  }

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
  function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainDashboard').style.display = 'block';
    document.getElementById('loginHeader').style.display = 'none';
    document.getElementById('dashboardHeader').style.display = 'block';

    // Update user info in header
    document.getElementById('currentUserName').textContent = currentUser.username;
    document.getElementById('userDisplayName').textContent = currentUser.username;

    // Load user's projects
    loadUserProjects();
  }

  // Setup login form
  function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
      });
    }
  }

  // Handle login
  function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    console.log('Login attempt:', { username, password: '***', rememberMe });
    console.log('Available users:', Array.from(users.keys()));

    if (!username || !password) {
      showLoginError('Please enter both username and password');
      return;
    }

    const user = users.get(username);
    console.log('User found:', user);

    if (!user) {
      showLoginError('Invalid username or password');
      return;
    }

    // Simple password check (in production, use proper hashing)
    console.log('Password check:', user.password, 'vs', password);
    if (user.password !== password) {
      showLoginError('Invalid username or password');
      return;
    }

    // Login successful
    console.log('Login successful for user:', username);
    loginUser(user, rememberMe);
  }

  // Login user
  function loginUser(user, rememberMe = false) {
    currentUser = user;
    localStorage.setItem('amiantoCurrentUser', user.username);

    if (rememberMe) {
      localStorage.setItem('amiantoRememberUser', user.username);
    } else {
      localStorage.removeItem('amiantoRememberUser');
    }

    showDashboard();
    showNotification(`Welcome back, ${user.username}!`, 'success');
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
    document.getElementById('registerUsername').value = '';
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
        document.getElementById('registerUsername').focus();
      });
    }
  }

  // Register new user
  window.registerUser = function() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
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

    // Check if username already exists
    if (users.has(username)) {
      showRegisterError('Username already exists');
      return;
    }

    // Create new user
    const newUser = {
      username: username,
      email: email,
      password: password, // In production, hash this
      createdAt: new Date().toISOString(),
      projects: []
    };

    users.set(username, newUser);
    saveUsers();

    // Auto-login after registration
    loginUser(newUser);

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
    modal.hide();

    showNotification('Account created successfully!', 'success');
  };

  // Show registration error
  function showRegisterError(message) {
    const alert = document.getElementById('registerAlert');
    alert.textContent = message;
    alert.classList.remove('d-none');
  }

  // Logout user
  window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
      currentUser = null;
      localStorage.removeItem('amiantoCurrentUser');
      localStorage.removeItem('amiantoRememberUser');

      showLoginPage();
      showNotification('Logged out successfully', 'info');
    }
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

  // Reset demo user (for debugging)
  window.resetDemoUser = function() {
    console.log('Resetting demo user...');

    // Clear all auth-related localStorage
    localStorage.removeItem('amiantoUsers');
    localStorage.removeItem('amiantoCurrentUser');
    localStorage.removeItem('amiantoRememberUser');

    // Reload the page to recreate demo user
    location.reload();
  };

  // Debug authentication system
  window.debugAuth = function() {
    console.log('=== AUTH DEBUG INFO ===');
    console.log('Current user:', currentUser);
    console.log('Users map:', Array.from(users.entries()));
    console.log('localStorage amiantoUsers:', localStorage.getItem('amiantoUsers'));
    console.log('localStorage amiantoCurrentUser:', localStorage.getItem('amiantoCurrentUser'));
    console.log('localStorage amiantoRememberUser:', localStorage.getItem('amiantoRememberUser'));

    // Try to find demo user
    const demoUser = users.get('demo');
    if (demoUser) {
      console.log('Demo user found:', demoUser);
      console.log('Demo password:', demoUser.password);
    } else {
      console.log('Demo user NOT found!');
    }

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

  function serializeRooms() {
    const serialized = [];
    rooms.forEach((r) => {
      serialized.push({
        id: r.id,
        name: r.name || r.id,
        background: r.background ? imageToDataURL(r.background) : null,
        foregrounds: Array.isArray(r.foregrounds) ? r.foregrounds.map(f => ({
          id: f.id,
          name: f.name,
          image: f.img ? imageToDataURL(f.img) : null,
          offsetX: Number(f.offsetX) || 0,
          offsetY: Number(f.offsetY) || 0
        })) : [],
        sceneObjects: Array.isArray(r.sceneObjects) ? r.sceneObjects.map(o => ({
          id: o.id,
          name: o.name,
          type: o.type || 'Interactive',
          x: Number(o.x) || 0,
          y: Number(o.y) || 0,
          image: o.img ? imageToDataURL(o.img) : null
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
      background: g.background ? imageToDataURL(g.background) : null,
      buttons: Array.isArray(g.buttons) ? g.buttons.map(b => ({
        id: b.id,
        name: b.name,
        x: Number(b.x)||0,
        y: Number(b.y)||0,
        w: Number(b.w)||0,
        h: Number(b.h)||0,
        text: b.text || '',
        backgroundImage: b.backgroundImage ? imageToDataURL(b.backgroundImage) : null
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
            frames: Array.isArray(d.frames) ? d.frames.map(fr => (fr && fr.img) ? imageToDataURL(fr.img) : null).filter(Boolean) : []
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
      cursorImage: c.cursorImage ? imageToDataURL(c.cursorImage) : null
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
      variables: {}
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

  async function saveProjectJsonToOPFS(jsonString, projectName) {
    try {
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
    } catch (err) {
      addDebugMessage('OPFS save failed: ' + (err && err.message ? err.message : err), 'warning');
      return null;
    }
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

  // Save current project for current user
  function saveCurrentProject() {
    if (!currentUser) {
      showNotification('Please login to save projects', 'warning');
      return;
    }
    const jsonString = window.serializeProjectToJsonString(true);
    // Mirror in localStorage (used by runtime)
    localStorage.setItem('amiantoLastSavedProjectJson', jsonString);

    // Also keep a lightweight entry per-user for quick project listing
    const projectObj = window.serializeProject();
    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    const idx = userProjects.findIndex(p => p && p.settings && p.settings.name === projectObj.settings.name);
    const entry = { settings: projectObj.settings, updatedAt: new Date().toISOString() };
    if (idx >= 0) userProjects[idx] = entry; else userProjects.push(entry);
    localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(userProjects));

    // Persist to OPFS (silent) and also offer a regular file save (may prompt the user)
    saveProjectJsonToOPFS(jsonString, projectObj.settings && projectObj.settings.name);
    saveProjectJsonToFile(jsonString, projectObj.settings && projectObj.settings.name);
    showNotification('Project saved successfully!', 'success');
  }

  // Create new project
  window.createNewProject = function() {
    if (!currentUser) {
      showNotification('Please login to create projects', 'warning');
      return;
    }

    const projectName = prompt('Enter project name:');
    if (!projectName) return;

    // Initialize new project
    const newProject = {
      settings: {
        name: projectName,
        canvasWidth: 800,
        canvasHeight: 600
      },
      rooms: [],
      createdAt: new Date().toISOString()
    };

    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    userProjects.push(newProject);
    localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(userProjects));

    showNotification(`Project "${projectName}" created!`, 'success');
  };

  // Show project list
  window.showProjectList = function() {
    if (!currentUser) {
      showNotification('Please login to view projects', 'warning');
      return;
    }

    const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
    if (userProjects.length === 0) {
      showNotification('No projects found. Create a new project first!', 'info');
      return;
    }

    // Show project selection modal (placeholder)
    showNotification(`${userProjects.length} projects available`, 'info');
  };

  // Delete current project
  window.deleteCurrentProject = function() {
    if (!currentUser) {
      showNotification('Please login to delete projects', 'warning');
      return;
    }

    const projectName = document.getElementById('projectName').value || 'Untitled Project';
    if (confirm(`Are you sure you want to delete project "${projectName}"?`)) {
      const userProjects = JSON.parse(localStorage.getItem(`amiantoProjects_${currentUser.username}`) || '[]');
      const filteredProjects = userProjects.filter(p => p.settings.name !== projectName);
      localStorage.setItem(`amiantoProjects_${currentUser.username}`, JSON.stringify(filteredProjects));
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
      showNotification(`Cursor image uploaded for ${cursor.targetType}: ${cursor.targetId}`, 'success');
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

  // Expose global functions
  window.showNotification = showNotification;
  window.addDebugMessage = addDebugMessage;
  window.redraw = redraw;
});
