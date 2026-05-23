// Firebase Configuration for Amianto Editor
// Sostituisci questi valori con quelli reali del tuo progetto Firebase

const firebaseConfig = {
  apiKey: "LA_TUA_API_KEY_REALE",
  authDomain: "il-tuo-progetto.firebaseapp.com", 
  projectId: "il-tuo-progetto-id",
  storageBucket: "il-tuo-progetto.appspot.com",
  messagingSenderId: "IL_MESSAGING_SENDER_ID",
  appId: "IL_TUO_APP_ID"
};

// Debug logging
console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  initialized: !!window.firebase
});

// Initialize Firebase
try {
  // Verifica se la configurazione è stata aggiornata
  if (firebaseConfig.apiKey === "LA_TUA_API_KEY_REALE") {
    console.warn('⚠️ Firebase is not configured correctly!');
    console.warn('Please follow the instructions in firebase-config.js');
    console.warn('1. Create a Firebase project at https://console.firebase.google.com');
    console.warn('2. Enable Authentication and Firestore');
    console.warn('3. Replace the configuration values');
    
    // Show warning to the user
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        alert('⚠️ Firebase not configured!\n\nTo create accounts and save data, configure Firebase following the instructions in JS/firebase-config.js');
      }, 2000);
    }
  }
  
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