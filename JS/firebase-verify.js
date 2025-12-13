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
        console.log('✅ Utente loggato:', user.email);
      } else {
        console.log('ℹ️ Nessun utente loggato');
      }
    });
    
    // Test firestore
    window.firebaseDB.collection('test').limit(1).get()
      .then(snapshot => {
        console.log('✅ Connessione Firestore funzionante');
      })
      .catch(error => {
        console.error('❌ Errore Firestore:', error.code, error.message);
      });
  }
}, 1000);