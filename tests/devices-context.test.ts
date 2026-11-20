import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { TestContext } from 'node:test';
import {
  fakeHub as makeHub,
  fakeDevice,
  lego,
  logs as errors,
  resetHardware,
  hubs as hubHooks,
  devices as deviceHooks,
  DeviceType,
  HubType,
} from './helpers/controls.ts';
import { errorMessage, installDOM, present } from './helpers/dom.ts';

const hooks = deviceHooks;
function fakeHub(uuid = 'hub-one', type: number = HubType.TECHNIC_MEDIUM_HUB) {
  const hub = makeHub(uuid, type, {
    LED: fakeDevice('LED', DeviceType.HUB_LED),
    VOLTAGE_SENSOR: fakeDevice('VOLTAGE_SENSOR', DeviceType.VOLTAGE_SENSOR),
    A: fakeDevice('A'),
  });
  hub.ports = ['A', 'B', 'LED', 'VOLTAGE_SENSOR'];
  return hub;
}

async function mount(t: TestContext, strict = false) {
  const dom = new JSDOM('<div id="root"></div>');
  resetHardware();
  function useAPI() {
    return {
      devices: hooks.useDevices(),
      ports: hooks.useHubDevices('hub-one'),
      motor: hooks.useDevice('hub-one', 'A'),
      missing: hooks.useHubDevices('missing'),
      error: hooks.useDevicesError(),
      speed: hooks.useSetDeviceSpeed(),
      subscribe: hooks.useSubscribeDevice(),
      unsubscribe: hooks.useUnsubscribeDevice(),
      add: hubHooks.useAddHub(),
      refresh: hubHooks.useRefreshHub(),
      disconnect: hubHooks.useDisconnectHub(),
      remove: hubHooks.useRemoveHub(),
    };
  }
  let api: ReturnType<typeof useAPI> | undefined;
  function Probe() {
    api = useAPI();
    return null;
  }
  const root = createRoot(present(dom.window.document.getElementById('root')));
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    await act(() => root.unmount());
    mounted = false;
  };
  t.after(unmount);
  installDOM(t, dom.window);
  const content = React.createElement(
    hubHooks.HubsProvider,
    null,
    React.createElement(hooks.DevicesProvider, null, React.createElement(Probe))
  );
  await act(() =>
    root.render(
      strict ? React.createElement(React.StrictMode, null, content) : content
    )
  );
  return {
    get api() {
      return present(api);
    },
    unmount,
  };
}

async function attach(
  hub: ReturnType<typeof fakeHub>,
  device: ReturnType<typeof fakeDevice>
) {
  hub.devices[device.portName] = device;
  await act(() => hub.emit('attach', device));
}

async function detach(hub: ReturnType<typeof fakeHub>, port: string) {
  const device = hub.devices[port];
  delete hub.devices[port];
  await act(() => hub.emit('detach', device));
  return device;
}

test('device hooks require a provider', () => {
  function Outside() {
    hooks.useDevices();
    return null;
  }
  assert.throws(
    () => renderToString(React.createElement(Outside)),
    /must be used within a DevicesProvider/
  );
});

test('attachment generations remain stable for telemetry and guard replacement actions', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  const first = present(view.api.motor).connectionId;
  await act(() => hub.devices.A.emit('distance', { distance: 0 }));
  assert.equal(present(view.api.motor).connectionId, first);
  await act(() => hub.emit('attach', hub.devices.A));
  assert.equal(present(view.api.motor).connectionId, first);
  const replacement = fakeDevice('A');
  await attach(hub, replacement);
  assert.notEqual(present(view.api.motor).connectionId, first);
  await act(async () => {
    await assert.rejects(
      view.api.speed(hub.uuid, 'A', 80, first),
      /not connected/
    );
    await assert.rejects(
      view.api.subscribe(hub.uuid, 'A', 0, first),
      /not connected/
    );
  });
  assert.equal(replacement.speeds.length, 0);
});

test('color and combined readings update immutably and stale listeners cannot publish', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  const sensor = fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR);
  await attach(hub, sensor);
  const before = view.api.ports.get('B');
  assert.equal(present(before).hubType, hub.type);
  const late = sensor.listeners('colorAndDistance')[0];
  await act(() => sensor.emit('colorAndDistance', { color: 9, distance: 43 }));
  const reading = view.api.ports.get('B');
  assert.deepEqual(Array.from(present(present(reading).events.color)), [9]);
  assert.deepEqual(Array.from(present(present(reading).events.distance)), [43]);
  assert.deepEqual(Object.keys(present(before).events), []);
  assert.equal(present(reading).connectionId, present(before).connectionId);
  await act(() =>
    sensor.emit('colorAndDistance', { color: 255, distance: 157 })
  );
  assert.equal(present(present(view.api.ports.get('B')).events.color)[0], 255);
  assert.equal(
    present(present(view.api.ports.get('B')).events.distance)[0],
    157
  );
  const replacement = fakeDevice('B', DeviceType.TECHNIC_COLOR_SENSOR);
  await attach(hub, replacement);
  for (const name of ['color', 'colorAndDistance', 'distance', 'tilt']) {
    assert.equal(sensor.listenerCount(name), 0);
  }
  await act(() => late({ color: 6, distance: 81 }));
  assert.deepEqual(Object.keys(present(view.api.ports.get('B')).events), []);
  await act(() => replacement.emit('color', { color: 3 }));
  assert.equal(present(present(view.api.ports.get('B')).events.color)[0], 3);
  await detach(hub, 'B');
  assert.deepEqual(Object.keys(present(view.api.ports.get('B')).events), []);
  assert.equal(replacement.listenerCount('color'), 0);
});

test('late motor completion cannot overwrite a newer stop and unmount stops active motors', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.devices.A.setSpeed = (...args) => {
    hub.devices.A.speeds.push(args);
    return args[0] === 50
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(lego.CONSTS.CommandFeedback.EXECUTION_COMPLETED);
  };
  let running: Promise<unknown> | undefined;
  await act(async () => {
    running = view.api.speed(hub.uuid, 'A', 50);
  });
  await act(() => view.api.speed(hub.uuid, 'A', 0));
  await act(async () => {
    present(finish)();
    await present(running);
  });
  assert.equal(present(view.api.motor).commands.speed, 0);
  await act(() => view.api.speed(hub.uuid, 'A', 100));
  await view.unmount();
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
});

test('enumerates immutable per-hub ports without duplicating hub sensors', async (t) => {
  const view = await mount(t);
  const original = view.api.devices;
  const hub = fakeHub();
  await act(() => view.api.add());
  assert.equal(original.size, 0);
  assert.equal(view.api.ports.size, 4);
  assert.equal(view.api.missing.size, 0);
  assert.equal(present(view.api.motor).connected, true);
  assert.equal(present(view.api.motor).uuid, hub.uuid);
  assert.equal(present(view.api.motor).mac, hub.primaryMACAddress);
  assert.equal(present(view.api.motor).type.num, hub.devices.A.type);
  assert.equal(present(view.api.ports.get('B')).connected, false);
  assert.equal(hub.devices.A.autoSubscribe, false);
  assert.deepEqual(hub.subscriptions, [
    [hub.devices.VOLTAGE_SENSOR.portId, DeviceType.VOLTAGE_SENSOR, 0],
  ]);
  const snapshot = view.api.ports;
  const callbacks = hub.listenerCount('attach');
  const { speed } = view.api;
  await act(() => view.api.refresh(hub.uuid));
  assert.equal(view.api.ports, snapshot);
  assert.equal(view.api.speed, speed);
  assert.equal(hub.listenerCount('attach'), callbacks);
  await act(() => hub.emit('attach', hub.devices.A));
  assert.equal(hub.devices.A.listenerCount('distance'), 1);
  assert.equal(view.api.ports, snapshot);
});

test('telemetry, replacement and detach clear old data and listeners', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  const sensor = fakeDevice('B', DeviceType.MOVE_HUB_TILT_SENSOR);
  await attach(hub, sensor);
  const before = view.api.ports.get('B');
  await act(() => sensor.emit('tilt', { x: 1, y: 2, z: 3 }));
  assert.deepEqual(
    Array.from(present(present(view.api.ports.get('B')).events.tilt)),
    [1, 2, 3]
  );
  assert.equal(present(before).events.tilt, undefined);
  const replacement = fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR);
  await attach(hub, replacement);
  assert.equal(sensor.listenerCount('tilt'), 0);
  assert.equal(present(view.api.ports.get('B')).events.tilt, undefined);
  await act(() => hub.emit('detach', sensor));
  assert.equal(present(view.api.ports.get('B')).connected, true);
  await act(() => replacement.emit('distance', { distance: 0 }));
  assert.deepEqual(
    Array.from(present(present(view.api.ports.get('B')).events.distance)),
    [0]
  );
  await detach(hub, 'B');
  assert.equal(present(view.api.ports.get('B')).connected, false);
  assert.equal(present(view.api.ports.get('B')).type.num, replacement.type);
  assert.equal(Object.keys(present(view.api.ports.get('B')).events).length, 0);
  assert.equal(replacement.listenerCount('distance'), 0);
});

test('disconnect retains offline ports, reconnect replaces instances and removal purges', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  const oldMotor = hub.devices.A;
  await act(() => view.api.speed(hub.uuid, 'A', 50));
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(present(view.api.motor).connected, false);
  assert.equal(Object.keys(present(view.api.motor).commands).length, 0);
  assert.equal(oldMotor.listenerCount('distance'), 0);
  const replacement = fakeHub();
  await act(() => view.api.add());
  assert.equal(present(view.api.motor).connected, true);
  assert.equal(replacement.devices.A.listenerCount('distance'), 1);
  await act(() => oldMotor.emit('distance', { distance: 20 }));
  assert.equal(present(view.api.motor).events.distance, undefined);
  const other = fakeHub('hub-two');
  await act(() => view.api.add());
  await act(() => view.api.remove(replacement.uuid));
  assert.equal(view.api.devices.has(replacement.uuid), false);
  assert.equal(view.api.devices.has(other.uuid), true);
});

test('speed validates bounds, uses motor APIs and stores only successful commands', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  for (const speed of [-100, 0, '100']) {
    await act(() =>
      Reflect.apply(view.api.speed, undefined, [hub.uuid, 'A', speed])
    );
  }
  assert.deepEqual(hub.devices.A.speeds, [
    [-100, undefined, true],
    [0, undefined, true],
    [100, undefined, true],
  ]);
  assert.equal(present(view.api.motor).commands.speed, 100);
  for (const speed of [-101, 101, NaN, Infinity, 'invalid']) {
    await act(() =>
      assert.rejects(
        Reflect.apply(view.api.speed, undefined, [hub.uuid, 'A', speed]),
        /Invalid motor speed/
      )
    );
  }
  assert.equal(errorMessage(view.api.error), 'Invalid motor speed');
  hub.devices.A.setSpeed = async () => {
    throw new Error('Motor failed');
  };
  await act(() =>
    assert.rejects(view.api.speed(hub.uuid, 'A', 5), /Motor failed/)
  );
  assert.equal(present(view.api.motor).commands.speed, 100);
  await act(() =>
    assert.rejects(view.api.speed(hub.uuid, 'B', 5), /Device not connected/)
  );
  const sensor = fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR);
  Reflect.deleteProperty(sensor, 'setSpeed');
  Reflect.deleteProperty(sensor, 'setPower');
  await attach(hub, sensor);
  await act(() =>
    assert.rejects(
      view.api.speed(hub.uuid, 'B', 5),
      /does not support motor speed/
    )
  );
  assert.ok(errors.length >= 8);
});

test('WeDo uses power and its device-type unsubscribe signature', async (t) => {
  const view = await mount(t);
  const hub = fakeHub('hub-one', HubType.WEDO2_SMART_HUB);
  await act(() => view.api.add());
  await act(() => view.api.speed(hub.uuid, 'A', -40));
  assert.deepEqual(hub.devices.A.powers, [[-40, true]]);
  assert.equal(hub.devices.A.speeds.length, 0);
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  await act(() => view.api.unsubscribe(hub.uuid, 'A', 0));
  assert.deepEqual(hub.unsubscriptions, [
    [hub.devices.A.portId, hub.devices.A.type, 0],
  ]);
});

test('explicit subscriptions deduplicate, reject system sensors and clean up on unmount', async (t) => {
  const view = await mount(t, true);
  const hub = fakeHub();
  await act(() => view.api.add());
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  assert.equal(hub.subscriptions.length, 2);
  await act(() =>
    assert.rejects(view.api.subscribe(hub.uuid, 'LED', 0), /managed by hubs/)
  );
  for (const mode of [-1, 256, 1.5, undefined]) {
    await act(() =>
      assert.rejects(
        // Exercise runtime validation even when the caller omits a valid mode.
        Reflect.apply(view.api.subscribe, view.api, [hub.uuid, 'A', mode]),
        /Invalid device mode/
      )
    );
  }
  await act(() => view.api.unsubscribe(hub.uuid, 'A', 0));
  assert.equal(view.api.error, null);
  await act(() => view.api.subscribe(hub.uuid, 'A', 1));
  await view.unmount();
  assert.equal(hub.devices.A.listenerCount('distance'), 0);
  assert.equal(hub.listenerCount('attach'), 0);
  assert.equal(hub.listenerCount('detach'), 0);
  assert.equal(hub.listenerCount('disconnect'), 0);
  assert.ok(
    hub.unsubscriptions.some(
      (args) => args[0] === hub.devices.A.portId && args[1] === 1
    )
  );
  assert.equal(lego.get({ uuid: hub.uuid }), hub);
});

test('subscription failures reject, expose errors and can be retried', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  hub.subscribe = async () => {
    throw new Error('Subscribe failed');
  };
  await act(() =>
    assert.rejects(view.api.subscribe(hub.uuid, 'A', 0), /Subscribe failed/)
  );
  assert.equal(errorMessage(view.api.error), 'Subscribe failed');
  hub.subscribe = async (...args) => {
    hub.subscriptions.push(args);
  };
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  hub.unsubscribe = async () => {
    throw new Error('Unsubscribe failed');
  };
  await act(() =>
    assert.rejects(view.api.unsubscribe(hub.uuid, 'A', 0), /Unsubscribe failed/)
  );
  assert.equal(errorMessage(view.api.error), 'Unsubscribe failed');
  hub.unsubscribe = async (...args) => {
    hub.unsubscriptions.push(args);
  };
  await act(() => view.api.unsubscribe(hub.uuid, 'A', 0));
  assert.equal(hub.unsubscriptions.length, 1);
});

test('pending commands cannot update a replacement device', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.devices.A.setSpeed = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.speed(hub.uuid, 'A', 30);
  });
  await attach(hub, fakeDevice('A'));
  await act(async () => {
    present(finish)();
    await present(pending);
  });
  assert.equal(present(view.api.motor).commands.speed, undefined);
});

test('pending subscriptions are released after unmount', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.subscribe = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.subscribe(hub.uuid, 'A', 0);
  });
  await view.unmount();
  present(finish)();
  await present(pending);
  assert.ok(
    hub.unsubscriptions.some(
      (args) => args[0] === hub.devices.A.portId && args[1] === 0
    )
  );
});

test('disconnect does not unsubscribe over a lost connection', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(hub.unsubscriptions.length, 0);
  await act(() =>
    assert.rejects(view.api.subscribe(hub.uuid, 'A', 0), /Device not connected/)
  );
});

test('overlapping subscriptions deduplicate and unsubscribe waits for subscribe', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  const calls: string[] = [];
  hub.subscribe = () => {
    calls.push('subscribe');
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  hub.unsubscribe = async () => {
    calls.push('unsubscribe');
  };
  let first: Promise<unknown> | undefined;
  let duplicate: Promise<unknown> | undefined;
  let last: Promise<unknown> | undefined;
  await act(() => {
    first = view.api.subscribe(hub.uuid, 'A', 0);
    duplicate = view.api.subscribe(hub.uuid, 'A', 0);
    last = view.api.unsubscribe(hub.uuid, 'A', 0);
  });
  assert.deepEqual(calls, ['subscribe']);
  await act(async () => {
    present(finish)();
    await Promise.all([first, duplicate, last]);
  });
  assert.deepEqual(calls, ['subscribe', 'unsubscribe']);
});

test('pending subscription completion after disconnect cannot affect a new hub', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.subscribe = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.subscribe(hub.uuid, 'A', 0);
  });
  await act(() => view.api.disconnect(hub.uuid));
  const replacement = fakeHub();
  await act(() => view.api.add());
  await act(async () => {
    present(finish)();
    await present(pending);
  });
  assert.equal(present(view.api.motor).connected, true);
  assert.equal(hub.unsubscriptions.length, 0);
  assert.equal(replacement.unsubscriptions.length, 0);
  await view.unmount();
  assert.equal(
    replacement.unsubscriptions.some(
      (args) => args[0] === replacement.devices.A.portId
    ),
    false
  );
});

test('unnamed devices and ports are quietly ignored during enumeration and attachment', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  const unnamed = [undefined, null, '', '  ', 7].map((portName) =>
    Object.assign(fakeDevice('X'), { portName })
  );
  hub.ports.push(...unnamed.map((device) => device.portName));
  unnamed.forEach((device, index) => {
    hub.devices[`unnamed-${index}`] = device;
  });
  await act(() => view.api.add());
  assert.deepEqual([...view.api.ports.keys()].sort(), [
    'A',
    'B',
    'LED',
    'VOLTAGE_SENSOR',
  ]);
  const snapshot = view.api.devices;
  for (const device of unnamed) {
    await act(() => hub.emit('attach', device));
    assert.equal(device.listenerCount('distance'), 0);
    assert.equal(device.listenerCount('tilt'), 0);
    assert.equal(device.autoSubscribe, true);
  }
  assert.equal(view.api.devices, snapshot);
  assert.equal(present(view.api.motor).connected, true);
  assert.equal(view.api.error, null);
  assert.equal(errors.length, 0);
  await attach(hub, fakeDevice('B'));
  assert.equal(present(view.api.ports.get('B')).connected, true);
});

test('ignoring an unnamed attachment does not clear a genuine error', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  await act(() =>
    assert.rejects(view.api.speed(hub.uuid, 'B', 10), /Device not connected/)
  );
  const failure = view.api.error;
  const logCount = errors.length;
  await act(() => hub.emit('attach', fakeDevice('')));
  assert.equal(view.api.error, failure);
  assert.equal(errors.length, logCount);
});

test('genuine attachment failures are logged without losing devices', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  const broken = fakeDevice('B');
  const failure = new Error('Cannot read device type');
  Object.defineProperty(broken, 'type', {
    get() {
      throw failure;
    },
  });
  await act(async () => {
    hub.emit('attach', broken);
  });
  assert.equal(view.api.error, failure);
  assert.ok(
    errors.some(
      (args) => args[0] === 'Device action failed' && args[1] === failure
    )
  );
  assert.equal(present(view.api.ports.get('B')).connected, false);
  assert.equal(present(view.api.motor).connected, true);
});

test('cleanup failures are still logged', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  hub.unsubscribe = async () => {
    throw new Error('Cleanup failed');
  };
  await view.unmount();
  assert.ok(
    errors.some(
      (args) =>
        args[0] === 'Device action failed' &&
        errorMessage(args[1]) === 'Cleanup failed'
    )
  );
});

test('a replacement hub session cleans up the old live session only', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.add());
  await act(() => view.api.subscribe(hub.uuid, 'A', 0));
  const replacement = fakeHub();
  await act(() => view.api.add());
  assert.equal(hub.devices.A.listenerCount('distance'), 0);
  assert.equal(replacement.devices.A.listenerCount('distance'), 1);
  assert.ok(
    hub.unsubscriptions.some(
      (args) => args[0] === hub.devices.A.portId && args[1] === 0
    )
  );
  assert.equal(replacement.unsubscriptions.length, 0);
  await act(() => hub.emit('disconnect'));
  assert.equal(present(view.api.motor).connected, true);
});
