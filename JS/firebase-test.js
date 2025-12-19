// Test rapido configurazione Firebase
console.log('🔥 Test Firebase Configuration...');

// Verifica base
const tests = {
  apiKey: typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.length > 20,
  authDomain: typeof firebaseConfig.authDomain === 'string' && firebaseConfig.authDomain.includes('.firebaseio.com'),
  projectId: typeof firebaseConfig.projectId === 'string' && firebaseConfig.projectId.length > 0,
  appId: typeof firebaseConfig.appId === 'string' && firebaseConfig.appId.includes(':')
};

console.log('📋 Risultati test configurazione:');
Object.entries(tests).forEach(([key, passed]) => {
  console.log(`${passed ? '✅' : '❌'} ${key}: ${passed ? 'PASS' : 'FAIL'}`);
});

// Test inizializzazione
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  console.log('✅ Firebase inizializzato con successo');
  
  // Test auth
  const auth = firebase.auth();
  console.log('✅ Auth service disponibile');
  
  // Test firestore
  const db = firebase.firestore();
  console.log('✅ Firestore service disponibile');
  
} catch (error) {
  console.error('❌ Errore Firebase:', error.message);
  console.error('Codice:', error.code);
}