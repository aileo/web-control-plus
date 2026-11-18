import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lego, loadSource } from './helpers/controls.ts';
import { present } from './helpers/dom.ts';

const definitions = loadSource('core/controlTypes');
const layout = loadSource('core/control-layout');
const { controlTypes, getControlTypes, controlOptions } = definitions;
const { canPlace, findSpace, snapSize } = layout;

test('registry offers Stop for every supported motor, not sensors', () => {
  const types = (type: number) =>
    Array.from(
      getControlTypes({ type: { num: type, text: '', compact: '' } }),
      (d) => d.type
    );
  const motorNames = (
    Object.keys(
      lego.CONSTS.DeviceType
    ) as (keyof typeof lego.CONSTS.DeviceType)[]
  ).filter((name) => /_MOTOR(?:_GREY)?$/.test(name));
  assert.ok(motorNames.length > 0);
  for (const name of motorNames) {
    assert.deepEqual(
      types(lego.CONSTS.DeviceType[name]),
      ['slider', 'arrows', 'stop'],
      name
    );
  }
  assert.equal(controlTypes.stop.motor, true);
  assert.deepEqual(
    Array.from(controlTypes.stop.sizes, (size) => `${size.w}x${size.h}`),
    ['1x1', '2x2']
  );
  assert.deepEqual(types(lego.CONSTS.DeviceType.COLOR_DISTANCE_SENSOR), [
    'distance',
    'color',
    'power',
    'palette',
  ]);
  assert.deepEqual(types(lego.CONSTS.DeviceType.TECHNIC_COLOR_SENSOR), [
    'color',
    'brightness',
    'power',
  ]);
  assert.deepEqual(
    types(lego.CONSTS.DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR),
    ['color']
  );
  assert.deepEqual(types(lego.CONSTS.DeviceType.MOTION_SENSOR), ['distance']);
  assert.deepEqual(types(lego.CONSTS.DeviceType.TILT_SENSOR), ['tilt']);
  assert.deepEqual(types(-1), []);
  assert.equal(
    present(controlTypes.distance.mode)(
      lego.CONSTS.DeviceType.COLOR_DISTANCE_SENSOR
    ),
    8
  );
  assert.equal(
    present(controlTypes.distance.mode)(lego.CONSTS.DeviceType.MOTION_SENSOR),
    0
  );
  assert.equal(controlOptions('tilt').rollAxis, 0);
  assert.equal(controlOptions('tilt').pitchAxis, 1);
  assert.throws(() => controlOptions('tilt', { rollAxis: 'X' }), /axis/);
  assert.throws(
    () => controlOptions('tilt', { rollReverseFactor: 0 }),
    /reversal/
  );
  assert.throws(() => controlOptions('slider', { anything: true }), /Unknown/);
});

test('layout rejects bounds, fractions, overlaps and malformed input without mutation', () => {
  const controls = new Map([['one', { id: 'one', x: 0, y: 0, w: 2, h: 2 }]]);
  assert.equal(canPlace(controls, { x: 0, y: 0, w: 2, h: 2 }), false);
  assert.equal(canPlace(controls, { x: 0, y: 0, w: 2, h: 2 }, 'one'), true);
  assert.equal(canPlace(controls, { x: 2, y: 0, w: 8, h: 6 }), true);
  for (const rect of [
    { x: 10, y: 0, w: 1, h: 1 },
    { x: 0, y: 6, w: 1, h: 1 },
    { x: -1, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 0, h: 1 },
    { x: 0.1, y: 0, w: 1, h: 1 },
    { x: 9, y: 0, w: 2, h: 1 },
    null,
  ])
    assert.equal(canPlace(controls, rect), false);
  assert.equal(present(controls.get('one')).x, 0);
});

test('behavior options validate types and limits without mutating defaults', () => {
  for (const [type, invalid] of [
    ['slider', { resetOnRelease: 1 }],
    ['slider', { resetOnRelease: 'false' }],
    ['slider', { reverseRotation: 1 }],
    ['slider', { reverseRotation: 'false' }],
    ...[0, 101, 1.5, '50', NaN, Infinity].map((speed) => ['arrows', { speed }]),
    ['distance', { scale: 'logarithmic' }],
    ['color', { stability: 151 }],
    ['color', { stability: '150' }],
    ['stop', { speed: 10 }],
    ['arrows', { stopOnRelease: 'false' }],
    ['arrows', { forwardKey: 'Tab' }],
    ['slider', { increase10Key: 'Escape' }],
    ['stop', { stopKey: ' ' }],
    ['stop', { stopKey: 'Enter' }],
    ['stop', { stopKey: null }],
    ['stop', { stopKey: 10 }],
    ['stop', { stopKey: 'Control' }],
  ])
    assert.throws(
      () => Reflect.apply(controlOptions, undefined, [type, invalid]),
      /reset|speed|scale|stability|Unknown|setting|single key/,
      `${type}: ${JSON.stringify(invalid)}`
    );
  for (const invalid of [null, [], 3, 'options']) {
    assert.throws(() => controlOptions('slider', invalid), /options/);
  }
  for (const speed of [1, 50, 100]) {
    assert.equal(controlOptions('arrows', { speed }).speed, speed);
  }
  const first = controlOptions('slider');
  first.resetOnRelease = true;
  assert.equal(controlOptions('slider').resetOnRelease, false);
  assert.equal(controlOptions('slider').reverseRotation, false);
});

test('first fit is deterministic and full or fragmented boards give no placement', () => {
  const controls = new Map([['one', { id: 'one', x: 0, y: 0, w: 2, h: 6 }]]);
  const space = present(findSpace(controls, { w: 2, h: 1 }));
  assert.equal(space.x, 2);
  assert.equal(space.y, 0);
  controls.set('two', { id: 'two', x: 2, y: 0, w: 8, h: 6 });
  assert.equal(findSpace(controls, { w: 1, h: 1 }), null);
  assert.equal(findSpace(new Map(), { w: 11, h: 1 }), null);
});

test('resize snaps to supported shapes, including orientation changes and extremes', () => {
  assert.equal(snapSize('slider', 5.9, 1).w, 6);
  assert.equal(snapSize('slider', 1, 5.9).h, 6);
  assert.equal(snapSize('arrows', 10, 1).w, 2);
  assert.equal(snapSize('stop', 1, 1).w, 1);
  assert.equal(snapSize('stop', 2, 2).w, 2);
  assert.equal(snapSize('distance', 1.8, 1.9).w, 2);
  assert.throws(
    () => Reflect.apply(snapSize, undefined, ['unknown', 1, 1]),
    /Invalid/
  );
  assert.throws(() => snapSize('tilt', NaN, 1), /Invalid/);
});
