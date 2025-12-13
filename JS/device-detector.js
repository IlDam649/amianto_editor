// Mobile/Small Screen Detection System
window.DeviceDetector = {
  // Minimum requirements
  MIN_WIDTH: 1024,      // Minimum width for desktop experience
  MIN_HEIGHT: 768,     // Minimum height for usable interface
  MIN_DIAGONAL: 1200,  // Minimum diagonal size
  
  // Device detection
  isMobile: false,
  isTablet: false,
  isSmallScreen: false,
  currentResolution: { width: 0, height: 0 },
  
  init() {
    this.checkDevice();
    this.setupEventListeners();
    this.showBlockerIfNeeded();
    
    // Log device info for debugging
    console.log('📱 Device Detection:', {
      resolution: this.currentResolution,
      isMobile: this.isMobile,
      isTablet: this.isTablet,
      isSmallScreen: this.isSmallScreen,
      userAgent: navigator.userAgent
    });
  },
  
  checkDevice() {
    this.currentResolution = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    // Check device type via User Agent
    const userAgent = navigator.userAgent.toLowerCase();
    this.isMobile = /mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(userAgent);
    this.isTablet = /tablet|ipad|android(?!.*mobile)/i.test(userAgent);
    
    // Check screen size
    this.isSmallScreen = this.currentResolution.width < this.MIN_WIDTH || 
                        this.currentResolution.height < this.MIN_HEIGHT;
    
    // Calculate diagonal
    const diagonal = Math.sqrt(
      Math.pow(this.currentResolution.width, 2) + 
      Math.pow(this.currentResolution.height, 2)
    );
    
    // Consider small if diagonal is too small
    if (diagonal < this.MIN_DIAGONAL) {
      this.isSmallScreen = true;
    }
  },
  
  setupEventListeners() {
    // Monitor resize events
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const wasBlocked = this.shouldBlock();
        this.checkDevice();
        const isBlocked = this.shouldBlock();
        
        if (wasBlocked !== isBlocked) {
          if (isBlocked) {
            this.showBlocker();
          } else {
            this.hideBlocker();
          }
        }
      }, 250);
    });
    
    // Monitor orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.checkDevice();
        this.showBlockerIfNeeded();
      }, 500);
    });
  },
  
  shouldBlock() {
    return this.isMobile || this.isSmallScreen;
  },
  
  showBlockerIfNeeded() {
    if (this.shouldBlock()) {
      this.showBlocker();
    }
  },
  
  showBlocker() {
    // Remove existing blocker if present
    this.hideBlocker();
    
    // Add blocker class to body
    document.body.classList.add('mobile-blocker-active');
    
    // Create blocker element
    const blocker = document.createElement('div');
    blocker.className = 'mobile-blocker';
    blocker.id = 'mobile-blocker';
    
    blocker.innerHTML = `
      <div class="mobile-blocker-content">
        <h1>⚠️ DEVICE TOO SMALL</h1>
        
        <p><strong>AMIANO EDITOR</strong> requires a larger screen for optimal game development.</p>
        
        <div class="requirements">
          <h3>▶ SYSTEM REQUIREMENTS:</h3>
          <ul>
            <li>Screen width: ${this.MIN_WIDTH}px+ (your screen: ${this.currentResolution.width}px)</li>
            <li>Screen height: ${this.MIN_HEIGHT}px+ (your screen: ${this.currentResolution.height}px)</li>
            <li>Desktop or laptop recommended</li>
            <li>Modern browser with JavaScript enabled</li>
          </ul>
        </div>
        
        <div class="device-info">
          <strong>► CURRENT DEVICE:</strong><br>
          Resolution: ${this.currentResolution.width} × ${this.currentResolution.height}px<br>
          Device Type: ${this.getDeviceTypeString()}
        </div>
        
        <p style="margin-top: 20px; font-size: 0.9rem; opacity: 0.8; color: #39ff14;">
          ► Try landscape mode or use a desktop for full experience
        </p>
        
        <button class="continue-btn" onclick="DeviceDetector.continueAnyway()">
          ► PROCEED ANYWAY
        </button>
      </div>
    `;
    
    document.body.appendChild(blocker);
    
    // Prevent scrolling
    document.body.style.overflow = 'hidden';
  },
  
  hideBlocker() {
    const blocker = document.getElementById('mobile-blocker');
    if (blocker) {
      blocker.remove();
    }
    document.body.classList.remove('mobile-blocker-active');
    document.body.style.overflow = '';
  },
  
  getDeviceTypeString() {
    if (this.isMobile) return 'Mobile 📱';
    if (this.isTablet) return 'Tablet 📋';
    if (this.isSmallScreen) return 'Small Screen 💻';
    return 'Desktop 🖥️';
  },
  
  continueAnyway() {
    console.warn('⚠️ User proceeding despite device limitations');
    this.hideBlocker();
    
    // Show warning notification
    if (window.showNotification) {
      window.showNotification(
        '⚠️ Some features may not work optimally on your device. Desktop experience recommended.',
        'warning'
      );
    }
    
    // Add device limitation notice to the interface
    this.addDeviceWarning();
  },
  
  addDeviceWarning() {
    // Add a persistent warning banner with acid dark theme
    const warning = document.createElement('div');
    warning.className = 'alert alert-dismissible fade show m-2';
    warning.style.position = 'fixed';
    warning.style.top = '0';
    warning.style.left = '0';
    warning.style.right = '0';
    warning.style.zIndex = '1000';
    warning.style.background = '#1a1a1a';
    warning.style.border = '1px solid #ff00ff';
    warning.style.color = '#f0f0f0';
    warning.style.boxShadow = '0 0 15px rgba(255, 0, 255, 0.3)';
    warning.innerHTML = `
      <strong style="color: #ff00ff; text-shadow: 0 0 5px #ff00ff;">⚠️ LIMITED DEVICE MODE:</strong> Some features may not work optimally. Desktop experience recommended.
      <button type="button" class="btn-close" data-bs-dismiss="alert" style="filter: invert(1);"></button>
    `;
    
    const existingWarning = document.querySelector('div[style*="position: fixed"]');
    if (existingWarning) {
      existingWarning.remove();
    }
    
    document.body.appendChild(warning);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (warning.parentNode) {
        warning.remove();
      }
    }, 10000);
  }
};