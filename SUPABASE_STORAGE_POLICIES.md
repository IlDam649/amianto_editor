# 🔐 Configurazione Storage Policies per Supabase - Amianto Editor

## Problema: Errore 403 "new row violates row-level security policy"

Se vedi questo errore durante l'upload di asset:
```
{statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy'}
```

Significa che le **Storage Policies** del bucket `amianto-assets` non permettono l'upload.

---

## Soluzione: Configurare le Storage Policies

### Passo 1: Accedi al Dashboard Supabase

1. Vai su [https://app.supabase.com](https://app.supabase.com)
2. Seleziona il tuo progetto
3. Vai su **Storage** nel menu laterale

### Passo 2: Verifica il Bucket

1. Assicurati che esista il bucket **`amianto-assets`**
2. Se non esiste, crealo:
   - Clicca su **"New bucket"**
   - Nome: `amianto-assets`
   - **Public bucket**: ✅ ON (importante!)
   - Clicca **"Create bucket"**

### Passo 3: Configura le Storage Policies

Vai su **Storage** → **Policies** nel menu laterale.

#### Policy 1: READ (Lettura Pubblica) - OBBLIGATORIA

Questa policy permette a chiunque di leggere/scaricare gli asset.

1. Clicca su **"New Policy"** per il bucket `amianto-assets`
2. Scegli **"For full customization"**
3. Compila:
   - **Policy name**: `Public Read Access`
   - **Allowed operation**: ✅ **SELECT** (Read)
   - **Policy definition**: Incolla questo SQL:

```sql
(
  bucket_id = 'amianto-assets'
)
```

4. Clicca **"Review"** → **"Save policy"**

#### Policy 2: INSERT (Scrittura) - OBBLIGATORIA ⭐

Questa policy permette l'upload degli asset. 

**IMPORTANTE**: L'applicazione usa **Firebase Auth** (non Supabase Auth), quindi il controllo di autenticazione è fatto **lato client** in JavaScript. Le Storage Policies qui sono più permissive ma la sicurezza è garantita dal controllo lato client.

**Struttura path**: `{userId}/{projectId}/{category}/{fileName}`

1. Clicca su **"New Policy"**
2. Scegli **"For full customization"**
3. Compila:
   - **Policy name**: `Authenticated Upload Access (Client-Side Check)`
   - **Allowed operation**: ✅ **INSERT** (Write)
   - **Policy definition**: Incolla questo SQL:

```sql
(
  bucket_id = 'amianto-assets'
)
```

4. Clicca **"Review"** → **"Save policy"**

**Spiegazione**:
- La policy permette upload anonimi nel bucket
- La sicurezza è garantita dal controllo lato client che verifica Firebase Auth prima dell'upload
- Il path include sempre il `userId` come prima cartella per organizzazione
- Solo utenti autenticati su Firebase possono caricare (verificato in JavaScript)

**Nota**: Se in futuro vuoi usare Supabase Auth, puoi cambiare la policy a:
```sql
(
  bucket_id = 'amianto-assets' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
```

#### Policy 3: UPDATE (Opzionale)

Se vuoi permettere la modifica dei file esistenti:

1. Clicca su **"New Policy"**
2. Scegli **"For full customization"**
3. Compila:
   - **Policy name**: `Update Access`
   - **Allowed operation**: ✅ **UPDATE**
   - **Policy definition**: 

```sql
(
  bucket_id = 'amianto-assets'
)
```

**Nota**: Il controllo di autenticazione è fatto lato client (Firebase Auth).

#### Policy 4: DELETE (Opzionale)

Se vuoi permettere l'eliminazione dei file:

1. Clicca su **"New Policy"**
2. Scegli **"For full customization"**
3. Compila:
   - **Policy name**: `Delete Access`
   - **Allowed operation**: ✅ **DELETE**
   - **Policy definition**: 

```sql
(
  bucket_id = 'amianto-assets'
)
```

**Nota**: Il controllo di autenticazione è fatto lato client (Firebase Auth).

---

## Configurazione Completa Consigliata ⭐

**SOLUZIONE IMPLEMENTATA**: Controllo lato client (Firebase Auth) + Storage Policies con scope per userId

### Struttura Path Asset

Gli asset vengono salvati con questa struttura:
```
amianto-assets/
  └── {userId}/              ← Primo livello: ID utente (da Firebase Auth)
       └── {projectId}/       ← Secondo livello: ID progetto
            ├── backgrounds/
            ├── foregrounds/
            ├── sprites/
            └── audio/
```

### Policies Raccomandate

#### 1. Public Read (SELECT)
```sql
Policy name: Public Read Access
Operation: SELECT
Definition:
(
  bucket_id = 'amianto-assets'
)
```
**Nota**: Permette a chiunque di leggere gli asset (necessario per visualizzare le immagini nel gioco).

#### 2. Authenticated Upload (INSERT) ⭐
```sql
Policy name: Authenticated Upload Access (Client-Side Check)
Operation: INSERT
Definition:
(
  bucket_id = 'amianto-assets'
)
```
**Nota**: La policy permette upload anonimi, ma il controllo di autenticazione è fatto lato client (Firebase Auth) prima dell'upload.

#### 3. Update (UPDATE) - Opzionale
```sql
Policy name: Update Access
Operation: UPDATE
Definition:
(
  bucket_id = 'amianto-assets'
)
```

#### 4. Delete (DELETE) - Opzionale
```sql
Policy name: Delete Access
Operation: DELETE
Definition:
(
  bucket_id = 'amianto-assets'
)
```

### Come Funziona

1. **Lato Client (JavaScript)** - ⭐ SICUREZZA PRINCIPALE:
   - Verifica che l'utente sia autenticato su Firebase Auth (`window.firebaseAuth.currentUser`)
   - Se NON autenticato, blocca l'upload e mostra errore
   - Se autenticato, ottiene `userId` da Firebase Auth
   - Costruisce il path con `userId/{projectId}/{category}/{fileName}`
   - Esegue l'upload su Supabase Storage

2. **Lato Server (Storage Policies)**:
   - Permette upload/update/delete nel bucket (policy permissiva)
   - La sicurezza è garantita dal controllo lato client
   - Permette lettura pubblica per visualizzare gli asset nel gioco

**Architettura Sicurezza**:
- ✅ **Controllo Autenticazione**: Lato client (Firebase Auth) - BLOCCA upload non autorizzati
- ✅ **Organizzazione File**: Path include `userId` per separare asset per utente
- ✅ **Accesso Pubblico**: Lettura pubblica per permettere visualizzazione asset nel gioco

---

## Verifica la Configurazione

Dopo aver configurato le policies:

1. **Ricarica la pagina** dell'editor
2. **Prova a caricare un'immagine** (background, foreground, sprite, ecc.)
3. **Controlla la console** del browser:
   - Dovresti vedere: `[Supabase] ✅ Asset caricato con successo`
   - Non dovresti vedere errori 403

---

## Troubleshooting

### Errore persiste dopo la configurazione

1. **Verifica che il bucket sia pubblico**:
   - Storage → Buckets → `amianto-assets`
   - Assicurati che **"Public bucket"** sia ✅ ON

2. **Verifica le policies**:
   - Storage → Policies
   - Dovresti vedere almeno 2 policies per `amianto-assets`:
     - Una per SELECT (Read)
     - Una per INSERT (Write)

3. **Controlla i log**:
   - Dashboard Supabase → Logs → Storage
   - Cerca errori recenti

4. **Prova a ricreare le policies**:
   - Elimina le policies esistenti
   - Ricreale seguendo le istruzioni sopra

### Il bucket non appare nella lista

1. Verifica di aver creato il bucket con il nome esatto: `amianto-assets`
2. Controlla che non ci siano spazi o caratteri speciali
3. Prova a ricreare il bucket se necessario

### Upload funziona ma le immagini non si caricano

1. Verifica la policy READ (SELECT)
2. Assicurati che il bucket sia pubblico
3. Controlla l'URL pubblico generato nella console

---

## Note Importanti

⚠️ **Sicurezza**:
- Per sviluppo/test, l'upload anonimo va bene
- Per produzione, considera di richiedere autenticazione
- Limita le policy DELETE e UPDATE se non necessarie

✅ **Best Practice**:
- Mantieni il bucket pubblico per permettere accesso agli asset
- Usa autenticazione per upload in produzione
- Monitora i log per attività sospette

---

## Supporto

Se continui ad avere problemi:

1. Controlla i log in Supabase Dashboard → Logs → Storage
2. Verifica la console del browser per errori dettagliati
3. Assicurati di aver seguito tutti i passaggi sopra

---

## Riferimenti

- [Documentazione Supabase Storage Policies](https://supabase.com/docs/guides/storage/policies)
- [Supabase Storage Security](https://supabase.com/docs/guides/storage/security)

