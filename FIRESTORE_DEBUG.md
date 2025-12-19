# 🔍 Debug Firestore - Guida

## Come verificare se Firestore funziona

### 1. Apri la Console del Browser (F12)

Quando salvi un progetto, dovresti vedere questi log:

```
[Save] Tentativo salvataggio su Firestore... {userId: "...", projectId: "...", projectName: "..."}
[Firestore] Tentativo salvataggio progetto... {userId: "...", projectId: "..."}
[Firestore] Firestore DB disponibile: true
[Firestore] Dati progetto preparati: {projectName: "...", dataSize: ...}
[Firestore] Reference creata: users/.../projects/...
[Firestore] Tentativo scrittura su Firestore...
[Firestore] ✅ Progetto salvato con successo: ...
```

### 2. Verifica nella Console Firebase

1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Seleziona progetto **amianto-editor**
3. Vai su **Firestore Database** → **Data**
4. Dovresti vedere la struttura:
   ```
   users/
     {userId}/
       projects/
         {projectId}/
           name: "..."
           projectData: "..."
           createdAt: timestamp
           updatedAt: timestamp
   ```

### 3. Test Manuale nella Console Browser

Apri la console del browser e prova:

```javascript
// Verifica che Firestore sia disponibile
console.log('Firestore disponibile:', !!window.firebaseDB);
console.log('Firebase Auth:', !!window.firebaseAuth);

// Verifica utente corrente
console.log('Current User:', currentUser);
console.log('User UID:', currentUser?.uid);

// Test scrittura diretta
if (window.firebaseDB && currentUser?.uid) {
  const testRef = window.firebaseDB
    .collection('users')
    .doc(currentUser.uid)
    .collection('projects')
    .doc('test');
  
  testRef.set({
    name: 'Test Project',
    projectData: '{"test": true}',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    console.log('✅ Test scrittura riuscito!');
  }).catch((error) => {
    console.error('❌ Test scrittura fallito:', error);
  });
}
```

## Problemi Comuni

### Errore: "Firestore non disponibile"
**Causa**: `window.firebaseDB` è null/undefined

**Soluzione**:
1. Verifica che `firebase-config.js` sia caricato prima di `main.js` in `index.html`
2. Controlla la console per errori di inizializzazione Firebase
3. Verifica che Firestore SDK sia incluso: `firebase-firestore-compat.js`

### Errore: "userId o projectId mancanti"
**Causa**: `currentUser.uid` non è disponibile

**Soluzione**:
1. Assicurati di essere loggato con Firebase Auth
2. Verifica che `currentUser` abbia la proprietà `uid`
3. Controlla che l'autenticazione sia completata prima di salvare

### Errore: "permission-denied"
**Causa**: Le regole Firestore bloccano l'accesso

**Soluzione**:
1. Verifica che le regole siano deployate: `firebase deploy --only firestore:rules`
2. Controlla che l'utente sia autenticato (`request.auth != null`)
3. Verifica che `userId` corrisponda a `request.auth.uid`

### Nessun errore ma non salva
**Possibili cause**:
1. La funzione `saveCurrentProject()` non viene chiamata
2. Il codice fallisce silenziosamente
3. Firestore è in modalità offline

**Debug**:
1. Aggiungi breakpoint in `saveProjectToFirestore()`
2. Verifica i log nella console
3. Controlla la tab Network per chiamate a Firestore

## Verifica Configurazione Firestore

### Via CLI:
```bash
# Verifica database
firebase firestore:databases:list

# Verifica regole
firebase firestore:rules:get
```

### Via Console:
1. Firebase Console → Firestore Database
2. Verifica che ci sia un database creato
3. Verifica che le regole siano pubblicate

## Test Completo

1. **Login** con Firebase Auth
2. **Crea un progetto** o apri uno esistente
3. **Modifica qualcosa** (aggiungi una room, un oggetto, ecc.)
4. **Salva** (File → Save o pulsante Save)
5. **Controlla console** per log Firestore
6. **Verifica Firebase Console** per vedere i dati salvati

## Supporto

Se il problema persiste:
1. Condividi i log della console del browser
2. Condividi eventuali errori nella console
3. Verifica lo stato di Firestore nella Firebase Console

