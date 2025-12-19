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
    console.warn('⚠️ Firebase non configurato correttamente!');
    console.warn('Per favore, segui le istruzioni nel file firebase-config.js');
    console.warn('1. Crea un progetto Firebase su https://console.firebase.google.com');
    console.warn('2. Abilita Authentication e Firestore');
    console.warn('3. Sostituisci i valori di configurazione');
    
    // Mostra avviso all'utente
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        alert('⚠️ Firebase non configurato!\n\nPer creare account e salvare dati, configura Firebase seguendo le istruzioni nel file JS/firebase-config.js');
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