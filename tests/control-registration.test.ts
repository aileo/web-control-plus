import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import type { Control, ControlType, DeviceInfo } from '../src/core/types.ts';
import { loadSource, staticMarkup } from './helpers/controls.ts';

const ui = loadSource('features/controls/ui').default;
const { controlOptions, controlTypes } = loadSource('core/controlTypes');
const ConfigFields = loadSource('features/controls/ConfigFields').default;
const Preview = loadSource(
  'components/modules/controls/ControlPreview'
).default;

test('every control has an explicit widget, settings choice and preview', () => {
  assert.deepEqual(Object.keys(ui).sort(), Object.keys(controlTypes).sort());
  for (const [type, module] of Object.entries(ui)) {
    assert.equal(module.type, type);
    assert.equal(typeof module.render, 'function');
    assert.equal(typeof module.Preview, 'function');
    assert.ok(module.Config === null || typeof module.Config === 'function');
  }
});

test('a control module rejects a record belonging to another control', () => {
  const control: Control = {
    id: 'control',
    uuid: 'hub',
    port: 'A',
    title: 'Slider',
    type: 'slider',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    options: controlOptions('slider'),
  };
  const device: DeviceInfo = {
    uuid: 'hub',
    mac: '',
    port: 'A',
    type: { num: 0, text: '', compact: '' },
    connected: true,
    events: {},
    commands: {},
  };
  assert.throws(() => ui.stop.render(control, device), /Expected stop control/);
});

test('unknown controls retain explicit preview and settings behavior', () => {
  const type = 'toString' as ControlType;
  assert.equal(
    staticMarkup(
      React.createElement(ConfigFields, {
        type,
        options: {},
        busy: false,
        setOption: () => undefined,
      })
    ),
    ''
  );
  assert.throws(
    () => staticMarkup(React.createElement(Preview, { type })),
    /Unknown control preview/
  );
});
