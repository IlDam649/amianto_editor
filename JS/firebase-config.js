// Firebase Configuration for Amianto Editor
// Configurazione con valori reali

const firebaseConfig = {
  apiKey: "AIzaSyAg-wvBsbaKEWw896GbfUU9LDURrNa0xjY",
  authDomain: "amianto-editor.firebaseapp.com",
  projectId: "amianto-editor",
  storageBucket: "amianto-editor.appspot.com",
  messagingSenderId: "1044586682132",
  appId: "1:1044586682132:web:c53a04a0d204412f051401"
};

// Debug logging
console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  initialized: !!window.firebase
});

// Initialize Firebase
try {
  // Verifica se Firebase è già inizializzato
  if (!window.firebase || !window.firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully');
  } else {
    console.log('✅ Firebase already initialized');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
}

// Export Firebase services
window.firebaseAuth = firebase.auth();
window.firebaseDB = firebase.firestore();

// Configure Firebase settings for better performance
window.firebaseDB.settings({
  timestampsInSnapshots: true,
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

console.log('🔥 Firebase services ready');