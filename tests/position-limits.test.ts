import { test } from 'node:test';
import assert from 'node:assert/strict';
import PositionLimits from '../src/core/position-limits.ts';
import { loadSource } from './helpers/controls.ts';

const { controlOptions, motorPositionCapabilities } =
  loadSource('core/controls');

test('unverified position modes cannot be selected', () => {
  assert.deepEqual(Object.values(motorPositionCapabilities()), [
    false,
    false,
    false,
    false,
    false,
  ]);
  for (const type of ['slider', 'arrows'] as const) {
    assert.equal(controlOptions(type).mode, 'speed');
    assert.throws(
      () => controlOptions(type, { mode: 'step' }),
      /not supported/
    );
  }
});

test('limits require ordered finite endpoints and clamp finite targets', () => {
  const limits = new PositionLimits();
  assert.throws(() => limits.clamp(0), /not calibrated/);
  assert.throws(() => limits.captureRight(1), /right endpoint/);
  limits.captureLeft(-20);
  assert.throws(() => limits.clamp(0), /not calibrated/);
  limits.captureRight(40);
  assert.equal(limits.clamp(-100), -20);
  assert.equal(limits.clamp(100), 40);
  assert.equal(limits.clamp(12), 12);
  assert.throws(() => limits.clamp(NaN), /target/);
  assert.throws(() => limits.captureLeft(Infinity), /left endpoint/);
  assert.throws(() => limits.clamp(0), /not calibrated/);
  limits.captureLeft(10);
  assert.throws(() => limits.captureRight(10), /right endpoint/);
  assert.throws(() => limits.clamp(0), /not calibrated/);
});

test('invalidating a reference permanently blocks its limits', () => {
  const limits = new PositionLimits();
  limits.captureLeft(-1);
  limits.captureRight(1);
  limits.invalidate();
  assert.throws(() => limits.clamp(0), /reference/);
  assert.throws(() => limits.captureLeft(-1), /reference/);
  assert.throws(() => limits.captureRight(1), /reference/);
});
