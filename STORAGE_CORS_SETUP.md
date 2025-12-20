# 🔥 Configurazione CORS per Firebase Storage - Amianto Editor

## Problema: Errore CORS

Se vedi questo errore:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' 
has been blocked by CORS policy
```

Significa che Firebase Storage non permette al tuo dominio di accedere alle immagini.

## Soluzione 1: Firebase Console (Più Semplice) ⭐

### Passo 1: Accedi a Firebase Console

1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il progetto **amianto-editor**

### Passo 2: Configura CORS tramite Google Cloud Console

Firebase Storage usa Google Cloud Storage sotto il cofano. Per configurare CORS devi usare Google Cloud Console:

1. Vai su [Google Cloud Console](https://console.cloud.google.com/)
2. Seleziona il progetto **amianto-editor** (o il tuo projectId)
3. Vai su **Cloud Storage** → **Browser**
4. Clicca sul bucket **amianto-editor.appspot.com**
5. Vai alla tab **Configuration** (Configurazione)
6. Scorri fino a **CORS configuration**
7. Clicca su **Edit CORS configuration**
8. Incolla questo JSON:

```json
[
  {
    "origin": [
      "https://amianto-editor.web.app",
      "https://amianto-editor.firebaseapp.com",
      "http://localhost:*",
      "http://127.0.0.1:*"
    ],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": [
      "Content-Type",
      "Access-Control-Allow-Origin",
      "Content-Length",
      "Content-Disposition"
    ]
  }
]
```

9. Clicca su **Save** (Salva)

### Passo 3: Verifica

1. Attendi qualche minuto per la propagazione
2. Ricarica la tua applicazione
3. Prova a caricare un'immagine di background
4. Dovrebbe funzionare senza errori CORS

---

## Soluzione 2: Firebase CLI (Consigliato per Sviluppatori)

### Prerequisiti

1. Installa [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
   - Include `gsutil` che serve per configurare CORS

2. Installa Firebase CLI (se non l'hai già):
```bash
npm install -g firebase-tools
```

3. Login:
```bash
firebase login
# oppure
gcloud auth login
```

### Configurazione CORS

1. Assicurati di essere nella root del progetto
2. Esegui questo comando:

```bash
gsutil cors set cors.json gs://amianto-editor.appspot.com
```

### Verifica configurazione

Per verificare che CORS sia configurato correttamente:

```bash
gsutil cors get gs://amianto-editor.appspot.com
```

Dovresti vedere il contenuto del file `cors.json` che hai appena caricato.

---

## Soluzione 3: Script Node.js (Alternativa)

Se preferisci usare Node.js invece di `gsutil`:

### Prerequisiti

```bash
npm install @google-cloud/storage
```

### Script

Crea un file `setup-cors.js`:

```javascript
const { Storage } = require('@google-cloud/storage');

// Usa Application Default Credentials o specifica il path al service account key
const storage = new Storage({
  projectId: 'amianto-editor'
});

const bucket = storage.bucket('amianto-editor.appspot.com');

const corsConfig = [
  {
    origin: [
      'https://amianto-editor.web.app',
      'https://amianto-editor.firebaseapp.com',
      'http://localhost:*',
      'http://127.0.0.1:*'
    ],
    method: ['GET', 'HEAD'],
    responseHeader: [
      'Content-Type',
      'Access-Control-Allow-Origin',
      'Content-Length',
      'Content-Disposition'
    ],
    maxAgeSeconds: 3600
  }
];

async function setupCors() {
  try {
    await bucket.setCorsConfiguration(corsConfig);
    console.log('✅ CORS configurato con successo!');
    console.log('Configurazione applicata:');
    console.log(JSON.stringify(corsConfig, null, 2));
  } catch (error) {
    console.error('❌ Errore configurazione CORS:', error);
    console.error('\nAssicurati di:');
    console.error('1. Aver installato @google-cloud/storage: npm install @google-cloud/storage');
    console.error('2. Aver configurato le credenziali Google Cloud');
    console.error('3. Aver i permessi per modificare il bucket Storage');
  }
}

setupCors();
```

Esegui:
```bash
node setup-cors.js
```

---

## Spiegazione della Configurazione

```json
{
  "origin": [
    "https://amianto-editor.web.app",
    "http://localhost:*"
  ],
  // Domini autorizzati a fare richieste CORS
  // "*" permette qualsiasi porta (utile per sviluppo locale)
  
  "method": ["GET", "HEAD"],
  // Metodi HTTP permessi:
  // - GET: per scaricare file
  // - HEAD: per verificare esistenza file senza scaricarli
  
  "maxAgeSeconds": 3600,
  // Durata cache della risposta preflight (1 ora)
  // Riduce il numero di richieste preflight
  
  "responseHeader": [
    "Content-Type",
    "Access-Control-Allow-Origin"
  ]
  // Header che il browser può leggere nella risposta
  // Necessari per il corretto funzionamento delle immagini
}
```

---

## Troubleshooting

### Errore: "gsutil: command not found"

**Soluzione**: Installa Google Cloud SDK:
- Windows: [Scarica installer](https://cloud.google.com/sdk/docs/install#windows)
- Mac: `brew install google-cloud-sdk`
- Linux: Segui [istruzioni ufficiali](https://cloud.google.com/sdk/docs/install#linux)

### Errore: "Access Denied" o "Permission Denied"

**Soluzione**: Assicurati di:
1. Essere loggato: `gcloud auth login`
2. Avere i permessi di "Storage Admin" o "Owner" sul progetto
3. Aver selezionato il progetto corretto: `gcloud config set project amianto-editor`

### Errore: "Bucket not found"

**Soluzione**: Verifica che:
1. Il bucket esista: `gsutil ls gs://amianto-editor.appspot.com`
2. Il nome del bucket sia corretto (controlla in Firebase Console → Storage)

### CORS configurato ma errori persistono

**Possibili cause**:
1. **Cache del browser**: Prova in modalità incognito o svuota la cache
2. **Propagazione**: Attendi 5-10 minuti dopo la configurazione
3. **URL senza token**: Se usi URL diretti invece di `getDownloadURL()`, potrebbero non funzionare
4. **Dominio non autorizzato**: Verifica che il tuo dominio sia nella lista `origin`

### Verifica rapida

Per verificare se CORS è configurato:

```bash
# Via CLI
gsutil cors get gs://amianto-editor.appspot.com

# Via browser (controlla Network tab)
# Dovresti vedere header "Access-Control-Allow-Origin" nelle risposte
```

---

## Note Importanti

⚠️ **Sicurezza**: 
- Non usare `"origin": ["*"]` in produzione (permette accesso da qualsiasi dominio)
- Limita `origin` solo ai domini che usi effettivamente
- Per sviluppo locale, `localhost:*` è sicuro

✅ **Best Practice**:
- Usa sempre `getDownloadURL()` invece di URL diretti
- Gli URL con token di accesso hanno meno problemi CORS
- Configura CORS solo se necessario (se usi URL diretti)

---

## Dopo la Configurazione

1. **Ricarica le immagini vecchie**: Se hai progetti con URL diretti, ricarica le immagini per generare nuovi assetId
2. **Testa l'applicazione**: Prova a caricare un'immagine di background
3. **Controlla la console**: Non dovrebbero esserci più errori CORS

---

## Supporto

Se continui ad avere problemi:
1. Controlla la console del browser per errori dettagliati
2. Verifica che CORS sia configurato: `gsutil cors get gs://amianto-editor.appspot.com`
3. Assicurati di usare `getDownloadURL()` per ottenere URL con token

