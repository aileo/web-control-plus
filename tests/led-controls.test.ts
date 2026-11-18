import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { errorMessage, inputField, present, query } from './helpers/dom.ts';
import {
  mount,
  fakeHub,
  fakeDevice,
  DeviceType,
  HubType,
  lego,
  create,
  loadSource,
  key,
  click,
  button,
  visibleText,
  input,
  pointer,
} from './helpers/controls.ts';

const { writeLight, lightSelection, ledCapabilities } = loadSource('core/leds');
const { getControlTypes } = loadSource('core/controlTypes');
const { colorAt, pointAt } = loadSource(
  'components/modules/controls/CustomColor'
);
const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const status = (view: Awaited<ReturnType<typeof mount>>, port = 'LED') =>
  present(present(view.api.devices.get('hub-one')).get(port));
const light = (view: Awaited<ReturnType<typeof mount>>, port = 'LED') =>
  status(view, port).commands.light;
const rgb = (selection?: readonly number[]) => {
  const { r, g, b } = lego.colorFromText('hub-one').ledRgb;
  return selection || [r, g, b];
};
async function attach(
  hub: ReturnType<typeof fakeHub>,
  device: ReturnType<typeof fakeDevice>
) {
  hub.devices[device.portName] = device;
  await act(() => hub.emit('attach', device));
}

test('dedicated controls follow light capabilities and never offer motor or sound power', () => {
  const offered = (num: number, hubType?: number) =>
    Array.from(
      getControlTypes({ type: { num, text: '', compact: '' }, hubType }),
      ({ type }) => type
    );
  assert.deepEqual(offered(DeviceType.HUB_LED), [
    'brightness',
    'power',
    'palette',
    'customColor',
  ]);
  assert.deepEqual(offered(DeviceType.COLOR_DISTANCE_SENSOR), [
    'distance',
    'color',
    'power',
    'palette',
  ]);
  assert.deepEqual(offered(DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX), [
    'brightness',
    'power',
    'palette',
  ]);
  for (const type of [DeviceType.LIGHT, DeviceType.TECHNIC_DISTANCE_SENSOR])
    assert.deepEqual(offered(type), ['brightness', 'power']);
  assert.deepEqual(offered(DeviceType.TECHNIC_COLOR_SENSOR), [
    'color',
    'brightness',
    'power',
  ]);
  assert.deepEqual(
    offered(DeviceType.COLOR_DISTANCE_SENSOR, HubType.WEDO2_SMART_HUB),
    ['color']
  );
  for (const type of [
    DeviceType.TECHNIC_LARGE_LINEAR_MOTOR,
    DeviceType.PIEZO_BUZZER,
    DeviceType.DUPLO_TRAIN_BASE_SPEAKER,
  ])
    assert.equal(offered(type).includes('power'), false);
});

test('custom plane maps scaled coordinates to saturated rainbow and neutral gray', () => {
  assert.equal(colorAt(pointAt(0, 0, 100, 50)), '#ff0000');
  assert.equal(colorAt(pointAt(100 / 3, 0, 100, 50)), '#00ff00');
  assert.equal(colorAt(pointAt(200 / 3, 0, 100, 50)), '#0000ff');
  assert.equal(colorAt(pointAt(0, 50, 100, 50)), '#808080');
  assert.equal(colorAt(pointAt(100, 50, 100, 50)), '#808080');
  assert.equal(colorAt(pointAt(-10, -5, 100, 50)), '#ff0000');
  assert.equal(colorAt(pointAt(110, 55, 100, 50)), '#808080');
  assert.equal(
    colorAt(pointAt(10, 5, 40, 20)),
    colorAt(pointAt(100, 50, 400, 200))
  );
});

test('brightness updates during input, keeps interrupted values and retains On brightness', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const matrix = fakeDevice('M', DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX);
  await attach(hub, matrix);
  const tile = await create(view, 'brightness', 'M');
  const section = query(document, `[aria-labelledby="${tile.id}-title"]`);
  const range = inputField(section, 'input[type="range"]');
  assert.equal(range.step, '10');
  await pointer(range, 'pointerdown');
  await input(range, 40);
  await input(range, 60);
  assert.equal(matrix.writes.length, 2);
  assert.equal(range.value, '60');
  await pointer(range, 'pointerup');
  assert.equal(matrix.writes.length, 2);
  assert.equal(present(light(view, 'M')).brightness, 60);
  assert.equal(present(light(view, 'M')).on, true);
  await pointer(range, 'pointerdown');
  await input(range, 30);
  await pointer(range, 'pointercancel');
  await pointer(range, 'pointerup');
  assert.equal(matrix.writes.length, 3);
  assert.equal(range.value, '30');
  await pointer(range, 'pointerdown');
  await input(range, 20);
  await act(() => window.dispatchEvent(new window.Event('blur')));
  await pointer(range, 'pointerup');
  assert.equal(matrix.writes.length, 4);
  assert.equal(range.value, '20');
  await input(range, 0);
  assert.equal(present(light(view, 'M')).on, false);
  const powerTile = await create(view, 'power', 'M');
  await click(
    query(document, `[aria-labelledby="${powerTile.id}-title"] [role="switch"]`)
  );
  assert.equal(present(light(view, 'M')).brightness, 20);
  assert.equal(range.value, '20');
  await pointer(range, 'pointerdown');
  await input(range, 30);
  const replacement = fakeDevice(
    'M',
    DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX
  );
  await attach(hub, replacement);
  await pointer(range, 'pointerup');
  assert.deepEqual(replacement.writes, []);
});

test('slow brightness writes coalesce, synchronize sliders and recover confirmed state on failure', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const lamp = fakeDevice('L', DeviceType.LIGHT);
  await attach(hub, lamp);
  const first = await create(view, 'brightness', 'L');
  const second = await create(view, 'brightness', 'L');
  const range = (id: string) =>
    inputField(document, `[aria-labelledby="${id}-title"] input`);
  const values = () => [range(first.id).value, range(second.id).value];
  let finish: (() => void) | undefined;
  lamp.writeDirect = async (mode, payload) => {
    lamp.writes.push([mode, [...payload]]);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  await pointer(range(first.id), 'pointerdown');
  await input(range(first.id), 20);
  for (const value of [30, 40, 50, 60, 70, 80]) {
    await input(range(first.id), value);
    assert.equal(range(first.id).disabled, false);
  }
  assert.deepEqual(values(), ['80', '80']);
  assert.deepEqual(lamp.writes, [[0, [20]]]);
  assert.equal(light(view, 'L'), undefined);
  await pointer(range(first.id), 'pointercancel');
  await pointer(range(first.id), 'pointerup');
  await act(() => window.dispatchEvent(new window.Event('blur')));
  await act(() => present(finish)());
  assert.deepEqual(lamp.writes, [
    [0, [20]],
    [0, [80]],
  ]);
  assert.equal(present(light(view, 'L')).brightness, 20);
  assert.deepEqual(values(), ['80', '80']);
  await act(() => present(finish)());
  assert.equal(present(light(view, 'L')).brightness, 80);
  assert.equal(status(view, 'L').lightPending, false);
  lamp.writeDirect = async () => {
    throw new Error('Brightness radio failed');
  };
  await input(range(first.id), 50);
  assert.deepEqual(values(), ['80', '80']);
  assert.match(visibleText(document.body), /Brightness radio failed/);
});

test('brightness coalescing preserves intervening color and power operations', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const matrix = fakeDevice('M', DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX);
  await attach(hub, matrix);
  const tile = await create(view, 'brightness', 'M');
  let finish: (() => void) | undefined;
  matrix.writeDirect = async (mode, payload) => {
    matrix.writes.push([mode, [...payload]]);
    if (payload[0] === 42)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  };
  const pending: Promise<unknown>[] = [];
  await act(async () => {
    pending.push(view.api.light(tile.id, { on: true, brightness: 20 }));
  });
  await act(async () => {
    pending.push(view.api.light(tile.id, { on: true, brightness: 30 }));
    pending.push(view.api.light(tile.id, { on: true, brightness: 40 }));
    pending.push(view.api.light(tile.id, { color: 9 }));
    pending.push(view.api.light(tile.id, { on: false }));
    pending.push(view.api.light(tile.id, { on: true, brightness: 70 }));
    pending.push(view.api.light(tile.id, { on: true, brightness: 80 }));
  });
  await act(async () => {
    present(finish)();
    await Promise.all(pending);
  });
  assert.deepEqual(
    matrix.writes.map(([, payload]) => payload[0]),
    [42, 74, 73, 0, 137]
  );
  assert.equal(present(light(view, 'M')).brightness, 80);
  assert.equal(present(light(view, 'M')).color, 9);
});

test('queued brightness retains its latest owner guard when that control is removed', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const lamp = fakeDevice('L', DeviceType.LIGHT);
  await attach(hub, lamp);
  const first = await create(view, 'brightness', 'L');
  const second = await create(view, 'brightness', 'L');
  let finish: (() => void) | undefined;
  lamp.writeDirect = async (mode, payload) => {
    lamp.writes.push([mode, [...payload]]);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  let initial: Promise<unknown> | undefined;
  let queued: Promise<unknown> | undefined;
  await act(async () => {
    initial = view.api.light(first.id, { on: true, brightness: 20 });
  });
  await act(async () => {
    queued = view.api.light(second.id, { on: true, brightness: 40 });
  });
  const rejected = assert.rejects(present(queued), /no longer exists/);
  await act(() => view.api.remove(second.id));
  await act(async () => {
    present(finish)();
    await initial;
    await rejected;
  });
  assert.deepEqual(lamp.writes, [[0, [20]]]);
  assert.equal(status(view, 'L').requestedBrightness, undefined);
  assert.equal(present(light(view, 'L')).brightness, 20);
});

test('replacement clears pending brightness and never receives an old queued value', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const lamp = fakeDevice('L', DeviceType.LIGHT);
  await attach(hub, lamp);
  const tile = await create(view, 'brightness', 'L');
  const range = () =>
    inputField(document, `[aria-labelledby="${tile.id}-title"] input`);
  let finish: (() => void) | undefined;
  lamp.writeDirect = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  await input(range(), 20);
  await input(range(), 40);
  assert.equal(range().value, '40');
  const replacement = fakeDevice('L', DeviceType.LIGHT);
  await attach(hub, replacement);
  assert.equal(range().value, '100');
  await act(() => present(finish)());
  assert.deepEqual(replacement.writes, []);
  assert.equal(light(view, 'L'), undefined);
  assert.equal(status(view, 'L').requestedBrightness, undefined);
});

test('custom drag previews and palette selections turn on the shared output without resetting brightness', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const tile = await create(view, 'customColor', 'LED');
  const palette = await create(view, 'palette', 'LED');
  await create(view, 'slider', 'A', {
    options: { increase1Key: 'ArrowRight' },
  });
  await act(() => view.api.light(tile.id, { brightness: 40, on: false }));
  const section = query(document, `[aria-labelledby="${tile.id}-title"]`);
  const plane = query(section, '[role="group"]');
  plane.getBoundingClientRect = () => new window.DOMRect(10, 20, 200, 100);
  const baseline = hub.devices.LED.rgb.length;
  await pointer(plane, 'pointerdown', { clientX: 10, clientY: 20 });
  await pointer(plane, 'pointermove', { clientX: 60, clientY: 20 });
  assert.equal(hub.devices.LED.rgb.length, baseline);
  await pointer(plane, 'pointerup', { clientX: 110, clientY: 20 });
  assert.equal(hub.devices.LED.rgb.length, baseline + 1);
  assert.equal(present(light(view)).color, '#00ffff');
  assert.equal(present(light(view)).brightness, 40);
  assert.equal(present(light(view)).on, true);
  await pointer(plane, 'pointerdown', { clientX: 10, clientY: 20 });
  await pointer(plane, 'pointercancel');
  await pointer(plane, 'pointerup', { clientX: 10, clientY: 20 });
  assert.equal(hub.devices.LED.rgb.length, baseline + 1);
  await input(inputField(section, '[aria-label="Light saturation"]'), 0);
  assert.equal(present(light(view)).color, '#808080');
  const hue = inputField(section, '[aria-label="Light hue"]');
  await act(() => hue.focus());
  await key(hue, 'keydown', 'ArrowRight');
  await key(hue, 'keyup', 'ArrowRight');
  assert.equal(hub.devices.A.speeds.length, 0);
  await input(hue, 180);
  await input(inputField(section, '[aria-label="Light saturation"]'), 100);
  assert.equal(present(light(view)).color, '#00ffff');
  await act(() => view.api.light(tile.id, { on: false }));
  await click(
    query(
      document,
      `[aria-labelledby="${palette.id}-title"] button[aria-label^="Light color:"]`
    )
  );
  assert.equal(present(light(view)).on, true);
  assert.equal(present(light(view)).brightness, 40);
  assert.equal(hub.devices.A.speeds.length, 0);
});

test('six light families emit correct output-only payloads and validate capabilities', async () => {
  const cases: [number, number, number[], number | null][] = [
    [DeviceType.COLOR_DISTANCE_SENSOR, 5, [9], null],
    [DeviceType.LIGHT, 0, [40], 1],
    [DeviceType.TECHNIC_COLOR_SENSOR, 3, [40, 40, 40], 1],
    [DeviceType.TECHNIC_DISTANCE_SENSOR, 5, [40, 40, 40, 40], 1],
    [
      DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX,
      2,
      Array<number>(9).fill(73),
      10,
    ],
  ];
  for (const [type, mode, values, step] of cases) {
    const device = fakeDevice('L', type);
    const capabilities = present(
      ledCapabilities(type, HubType.TECHNIC_MEDIUM_HUB)
    );
    const selection = lightSelection(capabilities, null, {
      on: true,
      ...(capabilities.color ? { color: 9 } : {}),
      ...(step ? { brightness: 40 } : {}),
    });
    await writeLight(device, type, selection);
    assert.deepEqual(device.writes, [[mode, values]]);
    await writeLight(device, type, { ...selection, on: false });
    assert.deepEqual(device.writes[1], [mode, values.map(() => 0)]);
  }
  const hubLED = fakeDevice('LED', DeviceType.HUB_LED);
  await writeLight(hubLED, hubLED.type, {
    color: '#ffffff',
    brightness: 40,
    lastBrightness: 40,
    on: true,
  });
  assert.deepEqual(hubLED.rgb, [[102, 51, 102]]);
  hubLED.setRGB = async () => lego.CONSTS.CommandFeedback.EXECUTION_DISCARDED;
  await assert.rejects(
    writeLight(hubLED, hubLED.type, {
      color: '#ff0000',
      brightness: 100,
      lastBrightness: 100,
      on: true,
    }),
    /not completed/
  );
  const matrix = present(
    ledCapabilities(DeviceType.TECHNIC_3X3_COLOR_LIGHT_MATRIX)
  );
  assert.throws(
    () => lightSelection(matrix, null, { brightness: 43 }),
    /brightness/
  );
  const sensor = present(ledCapabilities(DeviceType.COLOR_DISTANCE_SENSOR));
  assert.throws(
    () => lightSelection(sensor, null, { brightness: 50 }),
    /brightness/
  );
  assert.throws(() => lightSelection(sensor, null, { color: 99 }), /color/);
  assert.equal(
    ledCapabilities(DeviceType.COLOR_DISTANCE_SENSOR, HubType.WEDO2_SMART_HUB),
    null
  );
});

test('startup and shared LED state preserve hub hue through brightness, off, polling and layout edits', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  assert.deepEqual(hub.devices.LED.rgb, [rgb()]);
  assert.equal(present(light(view)).on, true);
  assert.equal(
    present(view.api.hubs.get(hub.uuid)).color,
    lego.colorFromText(hub.uuid).hex
  );
  const first = await create(view, 'power', 'LED');
  const second = await create(view, 'power', 'LED');
  await act(() =>
    view.api.update(first.id, { title: 'Lamp', options: { onKey: 'i' } })
  );
  await act(() => view.api.update(first.id, { x: 6, y: 3, w: 1, h: 1 }));
  assert.equal(hub.devices.LED.rgb.length, 1);
  await act(() => view.api.light(first.id, { color: '#ff8800' }));
  await act(() => view.api.light(second.id, { brightness: 40 }));
  assert.deepEqual(hub.devices.LED.rgb.at(-1), [102, 27, 0]);
  await act(() => view.api.light(first.id, { brightness: 0 }));
  assert.equal(present(light(view)).on, false);
  assert.deepEqual(hub.devices.LED.rgb.at(-1), [0, 0, 0]);
  await act(() => view.api.refresh(hub.uuid));
  assert.equal(present(view.api.hubs.get(hub.uuid)).color, '#ff8800');
  await act(() => view.api.light(second.id, { on: true }));
  assert.equal(present(light(view)).brightness, 40);
  const writes = hub.devices.LED.rgb.length;
  await act(() => view.api.remove(first.id));
  await act(() => view.api.remove(second.id));
  assert.equal(hub.devices.LED.rgb.length, writes);
});

test('unknown palette lights stage choices and keep combined color/distance streaming', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'color', 'B');
  await create(view, 'distance', 'B');
  const tile = await create(view, 'power', 'B');
  const subscriptions = JSON.stringify(hub.subscriptions);
  assert.equal(light(view, 'B'), undefined);
  await act(() => view.api.light(tile.id, { color: 9 }));
  assert.equal(present(light(view, 'B')).on, null);
  assert.deepEqual(hub.devices.B.writes, []);
  await act(() => view.api.light(tile.id, { on: true }));
  assert.deepEqual(hub.devices.B.writes, [[5, [9]]]);
  await act(() =>
    hub.devices.B.emit('colorAndDistance', { color: 6, distance: 45 })
  );
  assert.equal(present(status(view, 'B').events.color)[0], 6);
  assert.equal(present(status(view, 'B').events.distance)[0], 45);
  assert.equal(JSON.stringify(hub.subscriptions), subscriptions);
  await act(() => view.api.light(tile.id, { on: false }));
  await act(() => view.api.light(tile.id, { color: 3 }));
  assert.deepEqual(hub.devices.B.writes.at(-1), [5, [0]]);
  assert.equal(hub.devices.B.writes.length, 2);
  await act(() => view.api.light(tile.id, { on: true }));
  assert.deepEqual(hub.devices.B.writes.at(-1), [5, [3]]);
});

test('LED initialization and hub recoloring do not erase system sensor failures', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.subscribe = async () => {
    throw new Error('Voltage subscription failed');
  };
  await act(() => view.api.addHub());
  assert.equal(errorMessage(view.api.hubsError), 'Voltage subscription failed');
  const tile = await create(view, 'power', 'LED');
  await act(() => view.api.light(tile.id, { color: '#ff0000' }));
  assert.equal(errorMessage(view.api.hubsError), 'Voltage subscription failed');
});

test('mode-exclusive illumination never steals a reader and becomes usable after removal', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const sensor = fakeDevice('B', DeviceType.TECHNIC_COLOR_SENSOR);
  await attach(hub, sensor);
  const tile = await create(view, 'power', 'B');
  const reader = await create(view, 'color', 'B');
  await act(() =>
    assert.rejects(view.api.light(tile.id, { on: true }), /active sensor/)
  );
  assert.deepEqual(sensor.writes, []);
  assert.equal(present(hub.subscriptions.at(-1))[2], 0);
  await act(() => view.api.remove(reader.id));
  await act(() => view.api.light(tile.id, { on: true }));
  assert.equal(present(hub.subscriptions.at(-1))[2], 3);
  assert.deepEqual(sensor.writes, [[3, [100, 100, 100]]]);
  await create(view, 'color', 'B');
  assert.equal(present(hub.subscriptions.at(-1))[2], 0);
  assert.equal(present(light(view, 'B')).on, null);
  await act(() =>
    assert.rejects(view.api.light(tile.id, { on: false }), /active sensor/)
  );
  assert.equal(sensor.writes.length, 1);
});

test('a reader requested during light-mode activation takes priority before the LED write', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const sensor = fakeDevice('B', DeviceType.TECHNIC_COLOR_SENSOR);
  await attach(hub, sensor);
  const tile = await create(view, 'power', 'B');
  let finish: (() => void) | undefined;
  hub.subscribe = async (...args) => {
    hub.subscriptions.push(args);
    if (args[2] === 3)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  };
  let pending: Promise<unknown> | undefined;
  await act(async () => {
    pending = view.api.light(tile.id, { on: true });
  });
  const rejected = assert.rejects(present(pending), /active sensor/);
  await create(view, 'color', 'B');
  await act(async () => {
    present(finish)();
    await rejected;
  });
  assert.deepEqual(sensor.writes, []);
  assert.equal(present(hub.subscriptions.at(-1))[2], 0);
});

test('rapid writes serialize, rejected writes retain applied state and the queue recovers', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const tile = await create(view, 'power', 'LED');
  const led = hub.devices.LED;
  let finish: (() => void) | undefined;
  led.setRGB = async (...values) => {
    led.rgb.push(values);
    if (values[0] === 255)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  };
  let first: Promise<unknown> | undefined;
  let second: Promise<unknown> | undefined;
  let third: Promise<unknown> | undefined;
  await act(async () => {
    first = view.api.light(tile.id, { color: '#ff0000' });
    second = view.api.light(tile.id, { color: '#0000ff' });
    third = view.api.light(tile.id, { on: false });
  });
  assert.equal(led.rgb.length, 2);
  await act(async () => {
    present(finish)();
    await Promise.all([first, second, third]);
  });
  assert.deepEqual(led.rgb.slice(1), [
    [255, 0, 0],
    [0, 0, 255],
    [0, 0, 0],
  ]);
  assert.equal(present(light(view)).color, '#0000ff');
  led.setRGB = async () => {
    throw new Error('Radio failed');
  };
  await act(() =>
    assert.rejects(view.api.light(tile.id, { on: true }), /Radio failed/)
  );
  assert.equal(present(light(view)).on, false);
  assert.equal(errorMessage(status(view).lightError), 'Radio failed');
  led.setRGB = async (...values) => {
    led.rgb.push(values);
  };
  await act(() => view.api.light(tile.id, { on: true }));
  assert.equal(present(light(view)).on, true);
  assert.equal(status(view).lightError, null);
});

test('replacement rejects queued/stale completions without recoloring or writing to the replacement', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const tile = await create(view, 'power', 'LED');
  let finish: (() => void) | undefined;
  hub.devices.LED.setRGB = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let first: Promise<unknown> | undefined;
  let queued: Promise<unknown> | undefined;
  await act(async () => {
    first = view.api.light(tile.id, { color: '#ff0000' });
    queued = view.api.light(tile.id, { color: '#00ff00' });
  });
  const rejected = [
    assert.rejects(present(first), /connection changed/),
    assert.rejects(present(queued), /connection changed|not connected/),
  ];
  const replacement = fakeDevice('LED', DeviceType.HUB_LED);
  await attach(hub, replacement);
  await act(async () => {
    present(finish)();
    await Promise.all(rejected);
  });
  assert.deepEqual(replacement.rgb, [rgb()]);
  assert.equal(
    present(view.api.hubs.get(hub.uuid)).color,
    lego.colorFromText(hub.uuid).hex
  );
  assert.equal(present(light(view)).on, true);
});

test('LED keys latch, deduplicate, reject conflicting actions and never enter motor release logic', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const tile = await create(view, 'power', 'B', {
    options: { onKey: 'i', offKey: 'o' },
  });
  await create(view, 'power', 'B', { options: { onKey: 'i' } });
  await act(() =>
    assert.rejects(
      view.api.update(tile.id, { options: { offKey: 'i' } }),
      /conflicts/
    )
  );
  await key(document.body, 'keydown', 'i');
  await key(document.body, 'keydown', 'i', { repeat: true });
  await key(document.body, 'keyup', 'i');
  await act(() => window.dispatchEvent(new window.Event('blur')));
  assert.deepEqual(hub.devices.B.writes, [[5, [10]]]);
  await key(document.body, 'keydown', 'o');
  await key(document.body, 'keyup', 'o');
  assert.deepEqual(hub.devices.B.writes.at(-1), [5, [0]]);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(view.api.error, null);
});

test('disconnect clears app-set state and reconnect does not replay previous light commands', async (t) => {
  const view = await mount(t);
  const first = fakeHub();
  await act(() => view.api.addHub());
  const tile = await create(view, 'power', 'B');
  await act(() => view.api.light(tile.id, { color: 9 }));
  await act(() => view.api.light(tile.id, { on: true }));
  await act(() => view.api.disconnect(first.uuid));
  assert.equal(status(view, 'B').connected, false);
  assert.equal(light(view, 'B'), undefined);
  const replacement = fakeHub();
  await act(() => view.api.addHub());
  assert.deepEqual(replacement.devices.B.writes, []);
  assert.deepEqual(replacement.devices.LED.rgb, [rgb()]);
  assert.equal(light(view, 'B'), undefined);
  await act(() => view.api.light(tile.id, { on: true }));
  assert.deepEqual(replacement.devices.B.writes, [[5, [10]]]);
});

test('failed startup is reported, and a late hub LED initializes once through the shared owner', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  const led = hub.devices.LED;
  delete hub.devices.LED;
  await act(() => view.api.addHub());
  assert.equal(status(view).connected, false);
  led.setRGB = async () => {
    throw new Error('Startup light failed');
  };
  await attach(hub, led);
  assert.equal(present(light(view)).on, null);
  assert.equal(errorMessage(status(view).lightError), 'Startup light failed');
  const tile = await create(view, 'power', 'LED');
  led.setRGB = async (...values) => {
    led.rgb.push(values);
  };
  await act(() => view.api.light(tile.id, { on: true }));
  assert.deepEqual(led.rgb, [rgb()]);
  const replacement = fakeDevice('LED', DeviceType.HUB_LED);
  await attach(hub, replacement);
  await act(() => hub.emit('attach', replacement));
  assert.deepEqual(replacement.rgb, [rgb()]);
});

test('tile inputs adapt to capabilities and settings/layout/creation send no light commands', async (t) => {
  const view = await mount(t, {
    render: () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Grid),
        React.createElement(Modal)
      ),
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const color = await create(view, 'power', 'LED');
  const brightnessTile = await create(view, 'brightness', 'LED');
  const palette = await create(view, 'palette', 'B');
  const palettePower = await create(view, 'power', 'B');
  const custom = await create(view, 'customColor', 'LED');
  const lamp = fakeDevice('L', DeviceType.LIGHT);
  await attach(hub, lamp);
  const white = await create(view, 'power', 'L');
  const section = (tile: { id: string }) =>
    query(document, `[aria-labelledby="${tile.id}-title"]`);
  const power = (tile: { id: string }) => {
    const root = section(tile);
    return inputField(root, '[role="switch"]');
  };
  assert.ok(section(custom).querySelector('[data-color-plane]'));
  assert.equal(document.querySelector('input[type="color"]'), null);
  const brightness = inputField(section(brightnessTile), 'input[type="range"]');
  assert.equal(brightness.getAttribute('aria-orientation'), 'vertical');
  assert.equal(brightness.getAttribute('aria-label'), 'Light brightness');
  assert.equal(brightness.min, '0');
  assert.equal(brightness.max, '100');
  const swatches = section(palette).querySelectorAll(
    'button[aria-label^="Light color:"]'
  );
  assert.equal(swatches.length, 10);
  for (const swatch of swatches) {
    const style = window.getComputedStyle(swatch);
    assert.equal(style.aspectRatio, '1 / 1');
    assert.ok(parseFloat(style.borderRadius) >= 15);
  }
  assert.equal(section(palette).querySelector('input[type="range"]'), null);
  assert.match(visibleText(section(palette)), /Not set yet/);
  assert.equal(
    section(white).querySelector('[aria-label="Light color"]'),
    null
  );
  await act(() => view.api.openModal('controlConfig', { id: palette.id }));
  await click(button('Save'));
  assert.equal(hub.devices.B.writes.length, 0);
  assert.equal(hub.devices.LED.rgb.length, 1);
  assert.equal(lamp.writes.length, 0);
  assert.equal(power(palettePower).checked, false);
  await click(power(palettePower));
  assert.equal(power(palettePower).checked, true);
  assert.equal(present(light(view, 'B')).on, true);
  hub.devices.LED.setRGB = async () => {
    throw new Error('Light radio failed');
  };
  await click(power(color));
  assert.match(visibleText(section(color)), /Light radio failed/);
  assert.equal(present(light(view)).on, true);
  assert.equal(power(color).checked, true);
  hub.devices.LED.setRGB = async (...values) => {
    hub.devices.LED.rgb.push(values);
  };
  await act(() => view.api.light(color.id, { on: false }));
  assert.equal(power(color).checked, false);
  assert.doesNotMatch(visibleText(section(color)), /Light radio failed/);
});
