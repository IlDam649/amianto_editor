/**
 * Supabase Configuration Template for Amianto Editor
 * 
 * ISTRUZIONI:
 * 1. Copia questo file come supabase-config.js
 * 2. Sostituisci i valori con quelli del tuo progetto Supabase
 * 3. Crea un bucket Storage chiamato "amianto-assets" nel dashboard Supabase
 * 4. Configura le Storage Policies per il bucket:
 *    - READ: pubblico (per permettere accesso agli asset)
 *    - WRITE: solo utenti autenticati (opzionale, per sicurezza)
 * 
 * Come ottenere i valori:
 * - Vai su https://app.supabase.com
 * - Seleziona il tuo progetto
 * - Vai su Settings > API
 * - Copia "Project URL" e "anon public" key
 */

const SUPABASE_CONFIG = {
  // URL del tuo progetto Supabase (es: https://xxxxx.supabase.co)
  url: window.SUPABASE_URL || "https://gejfmiuajdxejhyjdmkj.supabase.co",
  
  // Chiave anonima pubblica (anon key) del tuo progetto Supabase
  anonKey: window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlamZtaXVhamR4ZWpoeWpkbWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMDc4ODUsImV4cCI6MjA4MTc4Mzg4NX0.5ok9dhz7W3S2xjJ6MZVHh1X3oPBooZwXS10WJG56xgs"
};
// Debug logging
console.log('Supabase Config:', {
  url: window.SUPABASE_URL ? window.SUPABASE_URL.substring(0, 30) + '...' : 'NON CONFIGURATO',
  anonKey: window.SUPABASE_ANON_KEY ? '***' + window.SUPABASE_ANON_KEY.slice(-4) : 'NON CONFIGURATO',
  initialized: !!window.supabase
});

// Verifica se la configurazione è stata aggiornata
if (window.SUPABASE_URL === "https://xxxxx.supabase.co" || !window.SUPABASE_URL) {
  console.warn('⚠️ Supabase non configurato correttamente!');
  console.warn('Per favore, segui le istruzioni nel file supabase-config.js');
  console.warn('1. Crea un progetto Supabase su https://app.supabase.com');
  console.warn('2. Crea un bucket Storage chiamato "amianto-assets"');
  console.warn('3. Configura le Storage Policies (READ: pubblico)');
  console.warn('4. Sostituisci i valori di configurazione in questo file');
  
  // Mostra avviso all'utente
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      console.warn('⚠️ Supabase Storage non configurato!');
      console.warn('Impossibile caricare asset senza configurazione Supabase.');
    }, 2000);
  }
} else {
  console.log('✅ Supabase configurato correttamente');
}

