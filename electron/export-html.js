/**
 * Electron main-process adapter around export-cli.js
 */
'use strict';

const { exportAmntToHtml, loadRuntimeBundle, ROOT } = require('./export-cli');
const fs = require('fs');
const path = require('path');

function resolveAppRoot() {
  if (fs.existsSync(path.join(ROOT, 'JS', 'runtime.js'))) return ROOT;
  throw new Error('Could not find JS/runtime.js under ' + ROOT);
}

function loadRuntimeSource() {
  return loadRuntimeBundle();
}

async function exportAmntFileToHtml(amntPath, htmlPath, options) {
  const opts = options || {};
  return exportAmntToHtml(amntPath, htmlPath, opts.title || null);
}

module.exports = {
  exportAmntFileToHtml,
  exportAmntToHtml,
  loadRuntimeSource,
  loadRuntimeBundle,
  resolveAppRoot,
  ROOT
};
