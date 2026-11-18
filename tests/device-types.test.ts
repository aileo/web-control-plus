import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { DeviceType, loadSource, staticMarkup } from './helpers/controls.ts';

const require = createRequire(import.meta.url);
const { default: deviceTypes, getDeviceType } = loadSource('utils/deviceTypes');

test('all known device types have a readable label and a renderable icon', () => {
  const knownTypes = Object.keys(DeviceType).filter((key) =>
    Number.isNaN(Number(key))
  );
  for (const type of knownTypes) {
    assert.ok(Object.hasOwn(deviceTypes, type), `Missing ${type}`);
    const { label, icon } = getDeviceType(type);
    assert.equal(typeof label, 'string', type);
    assert.ok(label.trim().length > 0, type);
    assert.equal(label.includes('_'), false, type);
    assert.match(staticMarkup(React.createElement(icon)), /<svg/);
  }
});

test('friendly labels and icons describe motors, sensors and built-in parts', () => {
  const examples = [
    ['TECHNIC_LARGE_LINEAR_MOTOR', 'Big motor', 'Autorenew'],
    ['TRAIN_MOTOR', 'Train motor', 'DirectionsRailway'],
    ['TECHNIC_DISTANCE_SENSOR', 'Distance sensor', 'Straighten'],
    ['COLOR_DISTANCE_SENSOR', 'Color & distance', 'ColorLens'],
    ['TECHNIC_COLOR_SENSOR', 'Color sensor', 'ColorLens'],
    ['VOLTAGE_SENSOR', 'Voltage sensor', 'BatteryStd'],
    ['CURRENT_SENSOR', 'Current sensor', 'FlashOn'],
    ['HUB_LED', 'Hub light', 'Lightbulb'],
    ['TECHNIC_FORCE_SENSOR', 'Push sensor', 'PanTool'],
  ];
  for (const [type, label, icon] of examples) {
    const entry = getDeviceType(type);
    assert.equal(entry.label, label);
    // Compare with the actual MUI icon identified by each fixture.
    // eslint-disable-next-line import/no-dynamic-require
    const expected: { default: typeof entry.icon } = require(
      `@mui/icons-material/${icon}`
    );
    assert.equal(entry.icon, expected.default);
  }
});

test('ordinary motors use spinning arrows and train motors keep their train icon', () => {
  const arrows = require('@mui/icons-material/Autorenew').default;
  const train = require('@mui/icons-material/DirectionsRailway').default;
  for (const [type, entry] of Object.entries(deviceTypes)) {
    if (/_MOTOR(?:_GREY)?$/.test(type)) {
      assert.equal(entry.icon, type.includes('TRAIN') ? train : arrows, type);
    }
  }
});

test('unknown types and inherited property names use the unknown-device fallback', () => {
  for (const type of [
    'FUTURE_SENSOR',
    undefined,
    null,
    '',
    '__proto__',
    'constructor',
    'toString',
  ]) {
    const entry: ReturnType<typeof getDeviceType> = Reflect.apply(
      getDeviceType,
      undefined,
      [type]
    );
    assert.equal(entry, deviceTypes.UNKNOWN);
    assert.equal(entry.label, 'Unknown device');
  }
});
