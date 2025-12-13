// Firebase Configuration for Amianto Editor
// Production configuration

const firebaseConfig = {
  apiKey: "AIzaSyDTnS93zr7Qq7vL6kQH7mK1rZ1XkV9W2uY",
  authDomain: "amianto-editor.firebaseapp.com",
  projectId: "amianto-editor",
  storageBucket: "amianto-editor.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012345"
};

// Debug logging
console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  initialized: !!window.firebase
});

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Export Firebase services
window.firebaseAuth = firebase.auth();
window.firebaseDB = firebase.firestore();

// Configure Firebase settings for better performance
window.firebaseDB.settings({
  timestampsInSnapshots: true,
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

console.log('Firebase services ready');