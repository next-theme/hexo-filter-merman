'use strict';

const { readFile } = require('node:fs/promises');

let initialization;

async function initialize() {
  const merman = await import('@mermanjs/web');
  const wasmPath = require.resolve('@mermanjs/web/pkg/merman_wasm_bg.wasm');
  const wasm = await readFile(wasmPath);

  await merman.initMerman({
    wasm: { module_or_path: wasm }
  });

  return merman;
}

async function getMerman() {
  if (!initialization) {
    initialization = initialize().catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

module.exports = async function(source, options) {
  const merman = await getMerman();
  return merman.renderSvg(source, options);
};
