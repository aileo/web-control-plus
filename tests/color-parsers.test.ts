import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColorDistanceSensor } from 'node-poweredup/dist/devices/colordistancesensor.js';
import { TechnicColorSensor } from 'node-poweredup/dist/devices/techniccolorsensor.js';
import { DuploTrainBaseColorSensor } from 'node-poweredup/dist/devices/duplotrainbasecolorsensor.js';

type Sensor =
  | typeof ColorDistanceSensor
  | typeof TechnicColorSensor
  | typeof DuploTrainBaseColorSensor;
function receive(
  sensor: Sensor,
  mode: number,
  packet: number[],
  isWeDo2SmartHub = false
) {
  const events: { event: string; color?: number; distance?: number }[] = [];
  // Exercise the parser without constructing a Bluetooth transport.
  Reflect.apply(
    sensor.prototype.receive,
    {
      _mode: mode,
      isWeDo2SmartHub,
      notify: (event: string, values: { color?: number; distance?: number }) =>
        events.push({ event, ...values }),
    },
    [Buffer.from(packet)]
  );
  return events;
}

test('dedicated color parsers report recognized colors and NONE, ignoring wrong-size packets', () => {
  for (const [Sensor, mode, wedo] of [
    [ColorDistanceSensor, 0, false],
    [ColorDistanceSensor, 0, true],
    [TechnicColorSensor, 0, false],
    [DuploTrainBaseColorSensor, 1, false],
  ] as const) {
    const packet = (color: number) =>
      wedo ? [3, 0, color] : [5, 0, 0x45, 1, color];
    for (const [raw, color] of [
      [9, 9],
      [1, 2],
      [5, 6],
      [255, 255],
    ]) {
      assert.deepEqual(receive(Sensor, mode, packet(raw), wedo), [
        { event: 'color', color },
      ]);
    }
    assert.deepEqual(receive(Sensor, mode, packet(9).slice(0, -1), wedo), []);
    assert.deepEqual(receive(Sensor, mode, [...packet(9), 0], wedo), []);
  }
});

test('combined color packets preserve distance on NONE and match dedicated color decoding', () => {
  for (const [raw, color] of [
    [9, 9],
    [1, 2],
    [5, 6],
    [255, 255],
  ]) {
    const packet = [8, 0, 0x45, 1, raw, 2, 0, 2];
    assert.deepEqual(receive(ColorDistanceSensor, 8, packet), [
      { event: 'colorAndDistance', color, distance: 43 },
    ]);
    assert.deepEqual(receive(ColorDistanceSensor, 8, packet, true), []);
  }
  const packet = [8, 0, 0x45, 1, 9, 2, 0, 2];
  assert.deepEqual(receive(ColorDistanceSensor, 8, packet.slice(0, 5)), []);
  assert.deepEqual(receive(ColorDistanceSensor, 8, [...packet, 0]), []);
});
