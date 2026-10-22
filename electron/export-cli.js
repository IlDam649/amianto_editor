#!/usr/bin/env node
/**
 * Standalone HTML export (CLI + callable from Electron main).
 *
 * Usage:
 *   node electron/export-cli.js "<project.amnt>" "<out.html>" [title]
 *
 * Exit codes: 0 ok, 1 error. Prints JSON result on stdout (last line).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadWindowModule(relPosix) {
  const full = path.join(ROOT, ...String(relPosix).replace(/\\/g, '/').split('/'));
  if (!fs.existsSync(full)) {
    throw new Error('Missing module: ' + full);
  }
  const src = fs.readFileSync(full, 'utf8');
  const g = { window: {} };
  g.window = g;
  const fn = new Function('window', src + '\n; return window;');
  return fn(g);
}

function loadRuntimeBundle() {
  const files = [
    'JS/lib/game-save-format.js',
    'JS/lib/dialogue-logic.js',
    'JS/runtime.js'
  ];
  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, ...f.split('/'))));
  if (missing.length) {
    throw new Error('Could not find runtime files:\n' + missing.map((f) => ' - ' + path.join(ROOT, f)).join('\n'));
  }
  return files.map((f) => fs.readFileSync(path.join(ROOT, ...f.split('/')), 'utf8')).join('\n;\n');
}

function exportAmntToHtml(amntPath, htmlPath, title) {
  const absAmnt = path.resolve(amntPath);
  const absHtml = path.resolve(htmlPath);
  if (!fs.existsSync(absAmnt)) {
    throw new Error('AMNT not found: ' + absAmnt);
  }

  const AmiantoAmnt = loadWindowModule('JS/amnt-format.js').AmiantoAmnt;
  const Standalone = loadWindowModule('JS/export-standalone.js').AmiantoStandaloneExport;
  if (!AmiantoAmnt || !Standalone) {
    throw new Error('Failed to load export modules from ' + ROOT);
  }

  const text = fs.readFileSync(absAmnt, 'utf8');
  const parsed = AmiantoAmnt.parse(text);
  const project = parsed.project;
  const assets = Array.isArray(parsed.assets) ? parsed.assets : [];

  const pkg = {
    format: 'amianto-amnt',
    version: 1,
    project: Object.assign({}, project, {
      format: 'amianto-game',
      version: project.version || 1
    }),
    assets
  };

  const runtimeSource = loadRuntimeBundle();
  let faviconDataUrl;
  try {
    faviconDataUrl =
      'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'img', 'mnt.png')).toString('base64');
  } catch (_) {}

  const gameTitle =
    title ||
    (project.settings && project.settings.name) ||
    path.basename(absAmnt, path.extname(absAmnt));

  const html = Standalone.buildStandaloneHtml(pkg, runtimeSource, {
    title: gameTitle,
    faviconDataUrl
  });

  if (typeof html !== 'string' || html.length < 100 || html.indexOf('amianto-embedded-project') < 0) {
    throw new Error('Generated HTML is invalid');
  }

  fs.mkdirSync(path.dirname(absHtml), { recursive: true });
  fs.writeFileSync(absHtml, html, 'utf8');
  const bytes = fs.statSync(absHtml).size;

  return {
    ok: true,
    bytes,
    assetCount: assets.length,
    htmlPath: absHtml,
    amntPath: absAmnt,
    root: ROOT,
    title: gameTitle
  };
}

function main() {
  const amntPath = process.argv[2];
  const htmlPath = process.argv[3];
  const title = process.argv[4];
  if (!amntPath || !htmlPath) {
    console.error('Usage: node electron/export-cli.js <file.amnt> <out.html> [title]');
    process.exit(1);
  }
  try {
    const result = exportAmntToHtml(amntPath, htmlPath, title);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    console.log(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { exportAmntToHtml, loadRuntimeBundle, ROOT };
