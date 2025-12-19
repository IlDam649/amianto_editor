# 🔥 Configurazione Firestore - Amianto Editor

## Problema: "Missing or insufficient permissions"

Se vedi questo errore, significa che le regole di sicurezza Firestore non sono configurate correttamente.

## Soluzione: Deployare le regole Firestore

### Opzione 1: Firebase Console (Consigliato per test rapidi)

1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il progetto **amianto-editor**
3. Vai su **Firestore Database** → **Regole**
4. Copia e incolla questo codice:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Regole per la collection users/{userId}/projects/{projectId}
    // Permette agli utenti autenticati di leggere/scrivere solo i propri progetti
    match /users/{userId}/projects/{projectId} {
      // Permetti lettura solo se l'utente è autenticato e il userId corrisponde
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // Permetti scrittura (create/update) solo se l'utente è autenticato e il userId corrisponde
      allow write: if request.auth != null && request.auth.uid == userId;
      
      // Permetti eliminazione solo se l'utente è autenticato e il userId corrisponde
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // Blocca tutto il resto per sicurezza
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

5. Clicca **Pubblica**

### Opzione 2: Firebase CLI (Consigliato per produzione)

1. Installa Firebase CLI (se non l'hai già fatto):
```bash
npm install -g firebase-tools
```

2. Login a Firebase:
```bash
firebase login
```

3. Deploy delle regole:
```bash
firebase deploy --only firestore:rules
```

## Verifica

Dopo aver deployato le regole:

1. Ricarica l'applicazione
2. Fai login con un account Firebase
3. Prova a salvare un progetto
4. Dovresti vedere: `[Firestore] Progetto salvato: ...` invece di errori di permessi

## Struttura Firestore

Le regole permettono accesso solo a questa struttura:

```
users/{userId}/projects/{projectId}
```

Dove:
- `userId` = `request.auth.uid` (ID utente autenticato)
- `projectId` = ID del progetto (attualmente nome normalizzato)

Ogni utente può leggere/scrivere/eliminare **solo i propri progetti**.

## Troubleshooting

### Errore: "permission-denied"
- Verifica che l'utente sia autenticato (`currentUser.uid` deve esistere)
- Verifica che le regole siano state deployate correttamente
- Controlla la console Firebase per errori di sintassi nelle regole

### Errore: "Firestore non disponibile"
- Verifica che `firebase-config.js` sia caricato correttamente
- Controlla che Firestore sia abilitato nel progetto Firebase
- Verifica la connessione internet

### Progetti non salvati
- Il sistema usa fallback automatico su cache locale
- I progetti vengono salvati in `localStorage` anche se Firestore fallisce
- Controlla i log della console per vedere la fonte di salvataggio

## Note di Sicurezza

⚠️ **IMPORTANTE**: Le regole attuali permettono agli utenti di accedere solo ai propri progetti. Non modificare le regole senza capire le implicazioni di sicurezza.

Per sviluppo/test, puoi temporaneamente usare regole più permissive (NON in produzione):

```javascript
// ⚠️ SOLO PER SVILUPPO - NON USARE IN PRODUZIONE
allow read, write: if request.auth != null;
```

