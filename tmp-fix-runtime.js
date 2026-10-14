const fs = require('fs');
const path = 'JS/runtime.js';
let s = fs.readFileSync(path, 'utf8');

// 1) Fix corrupted forEach line (duplicate .forEach without call)
const bad = "  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach((evt) => {";
const good = "  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach((evt) => {";
if (s.includes(bad)) {
  s = s.replace(bad, good);
  console.log('fixed corrupted forEach');
} else {
  // try flexible match
  const re = /\['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'\]\.forEach\s+\['pointerdown'/;
  if (re.test(s)) {
    s = s.replace(
      /\['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'\]\.forEach\s+\['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'\]\.forEach\(\(evt\) => \{/,
      "['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach((evt) => {"
    );
    console.log('fixed corrupted forEach (regex)');
  } else {
    console.log('corrupted forEach pattern not found — checking nearby...');
    const idx = s.indexOf("].forEach  ['pointerdown'");
    console.log('idx', idx);
  }
}

// 2) Add missing flushDeferredAudioStarts (called but never defined → runtime crash on unlock)
if (!s.includes('function flushDeferredAudioStarts')) {
  s = s.replace(
    '  function flushDeferredHtmlAudioJobs() {',
    `  function flushDeferredAudioStarts() {
    // placeholder: legacy deferred WebAudio starts (no-op if unused)
  }

  function flushDeferredHtmlAudioJobs() {`
  );
  console.log('added flushDeferredAudioStarts');
}

// 3) Fix stopPlaybackHandle to respect shared unlocked element
if (!s.includes('handle._sharedUnlocked')) {
  s = s.replace(
    `  function stopPlaybackHandle(handle) {
    if (!handle) return;
    try {
      if (typeof handle._domCleanup === 'function') {
        try { handle._domCleanup(); } catch (_) {}
      }
      if (handle.kind === 'webaudio') {`,
    `  function stopPlaybackHandle(handle) {
    if (!handle) return;
    try {
      if (typeof handle._domCleanup === 'function') {
        try { handle._domCleanup(); } catch (_) {}
      }
      if (handle._sharedUnlocked) {
        return;
      }
      if (handle.kind === 'webaudio') {`
  );
  console.log('fixed stopPlaybackHandle shared guard');
}

fs.writeFileSync(path, s);

// Verify parse
try {
  new Function(fs.readFileSync(path, 'utf8').replace(/^\s*\(function[\s\S]*$/m, 'void 0;')); // can't easily
} catch (_) {}

// Extract IIFE body check via node --check
const { execSync } = require('child_process');
execSync('node --check JS/runtime.js', { stdio: 'inherit' });

// Confirm forEach line
const line = fs.readFileSync(path, 'utf8').split(/\r?\n/).find(l => l.includes("pointerdown', 'mousedown"));
console.log('listener line:', line);
