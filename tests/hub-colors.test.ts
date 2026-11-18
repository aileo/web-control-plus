import { test } from 'node:test';
import assert from 'node:assert/strict';
import tinycolor from 'tinycolor2';
import {
  colorFromText,
  hubColorCalibration,
  hubColorPalette,
} from '../src/core/clients/hub-colors.ts';

test('hub colors are deterministic, non-off and avoid excluded hues', () => {
  for (let i = 0; i < 1000; i += 1) {
    const text = `hub-${i}`;
    const color = colorFromText(text);
    assert.deepEqual(color, colorFromText(text));
    assert.equal(color.hex, hubColorPalette[color.name].hex);
    assert.deepEqual(color.rgb, hubColorPalette[color.name].rgb);
    assert.ok(tinycolor(color.hex).toHsl().l >= 0.6);
    assert.ok(tinycolor(color.hex).toHsl().s >= 0.5);
    assert.equal(tinycolor(color.rgb).toHsv().s, 1);
    const hue = tinycolor(color.rgb).toHsv().h;
    assert.ok(
      !hubColorCalibration.excludedHues.some(
        ([start, end]) => hue >= start && hue < end
      )
    );
    for (const value of Object.values(color.ledRgb)) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 255);
    }
    assert.ok(Object.values(color.ledRgb).some((value) => value > 0));
  }
});

test('global gains and gamma affect LED values without changing pill colors', () => {
  const saved = structuredClone(hubColorCalibration);
  try {
    const before = colorFromText('test-hub');
    hubColorCalibration.gains = { r: 0.5, g: 0.6, b: 0.7 };
    hubColorCalibration.gamma = 2;
    const after = colorFromText('test-hub');
    assert.equal(after.hex, before.hex);
    for (const channel of ['r', 'g', 'b'] as const) {
      assert.equal(
        after.ledRgb[channel],
        Math.round(
          255 *
            (before.rgb[channel] / 255) ** 2 *
            hubColorCalibration.gains[channel]
        )
      );
    }
    hubColorCalibration.gains = { r: 100, g: 100, b: 100 };
    assert.ok(
      Object.values(colorFromText('test-hub').ledRgb).every(
        (value) => value <= 255
      )
    );
    hubColorCalibration.excludedHues = [[0, 360]];
    assert.throws(() => colorFromText('test'), /allow at least one hue/);
    hubColorCalibration.excludedHues = [];
    hubColorCalibration.gamma = 0;
    assert.throws(() => colorFromText('test'), /Invalid hub LED/);
  } finally {
    Object.assign(hubColorCalibration, saved);
  }
});
