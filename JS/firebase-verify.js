// Verifica immediata configurazione Firebase
console.log('🔥 VERIFICA CONFIGURAZIONE FIREBASE');

// Controlla se Firebase è caricato
if (typeof firebase === 'undefined') {
  console.error('❌ Firebase SDK non caricato');
} else {
  console.log('✅ Firebase SDK caricato');
}

// Controlla configurazione
if (typeof firebaseConfig !== 'undefined') {
  console.log('✅ firebaseConfig definito');
  console.log('📋 Dettagli configurazione:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKeyLength: firebaseConfig.apiKey ? firebaseConfig.apiKey.length : 0,
    hasAppId: !!firebaseConfig.appId
  });
} else {
  console.error('❌ firebaseConfig non definito');
}

// Controlla servizi Firebase
setTimeout(() => {
  if (window.firebaseAuth) {
    console.log('✅ Firebase Auth disponibile');
  } else {
    console.error('❌ Firebase Auth non disponibile');
  }
  
  if (window.firebaseDB) {
    console.log('✅ Firebase Firestore disponibile');
  } else {
    console.error('❌ Firebase Firestore non disponibile');
  }
  
  // Test connessione base
  if (window.firebaseAuth && window.firebaseDB) {
    console.log('🔄 Test connessione Firebase...');
    
    // Test auth state
    window.firebaseAuth.onAuthStateChanged((user) => {
      if (user) {
        console.log('✅ Utente loggato:', user.email, 'UID:', user.uid);
      } else {
        console.log('ℹ️ Nessun utente loggato');
      }
    });
    
    // Test firestore - verifica solo che il servizio sia disponibile
    // NON testiamo scrittura/lettura qui perché:
    // 1. Richiede autenticazione
    // 2. Le regole bloccano accesso a collection non permesse
    // Il test completo viene fatto in main.js con testFirestoreConnection()
    console.log('✅ Firestore servizio disponibile');
    console.log('💡 Per test completo: fai login e usa testFirestoreConnection() nella console');
  }
}, 1000);