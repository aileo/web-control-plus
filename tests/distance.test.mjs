import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.js';
import * as CONSTS from 'node-poweredup/dist/consts.js';

const filename = new URL(
  '../src/components/modules/controls/Distance.jsx', import.meta.url
);
const source = await readFile(filename, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
});
const exports = {};
const require = createRequire(filename);
runInNewContext(outputText, {
  exports,
  require: specifier => (specifier === '../../../core/clients/lego'
    ? { CONSTS } : require(specifier)),
});
const Distance = exports.default;

function arcs(devices) {
  const markup = renderToStaticMarkup(React.createElement(Distance, { devices }));
  return Array.from(markup.matchAll(/class="arc ([^"]+)"/g), match => match[1]);
}

test('zero distance activates the closest warning rather than showing no reading', () => {
  assert.deepEqual(arcs({ sensor: { distance: [0] } }), [
    'safe', 'safe', 'warning', 'danger',
  ]);
});

test('changing distance readings update the proximity arcs', () => {
  assert.deepEqual(arcs({ sensor: { distance: [107] } }), [
    'safe', 'safe', 'inactive', 'inactive',
  ]);
  assert.deepEqual(arcs({ sensor: { distance: [234] } }), [
    'inactive', 'inactive', 'inactive', 'inactive',
  ]);
});

test('missing distance data keeps the arcs inactive', () => {
  for (const devices of [{}, { sensor: {} }, { sensor: { distance: [] } }]) {
    assert.deepEqual(arcs(devices), [
      'inactive', 'inactive', 'inactive', 'inactive',
    ]);
  }
});
