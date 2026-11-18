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
  DeviceType,
  HubType,
} from './helpers/controls.ts';
import { errorMessage, installDOM, present } from './helpers/dom.ts';

const hooks = hubHooks;
const { HubsProvider } = hooks;
function fakeHub(uuid = 'hub-one') {
  const led = fakeDevice('LED', DeviceType.HUB_LED);
  led.portId = 50;
  const voltage = fakeDevice('VOLTAGE_SENSOR', DeviceType.VOLTAGE_SENSOR);
  voltage.portId = 60;
  voltage.values = { voltage: { voltage: 0 } };
  const hub = makeHub(uuid, HubType.TECHNIC_MEDIUM_HUB, {
    LED: led,
    VOLTAGE_SENSOR: voltage,
  });
  return Object.assign(hub, {
    get rgb() {
      return led.rgb.at(-1);
    },
  });
}

async function mount(t: TestContext, strict = false) {
  const dom = new JSDOM('<div id="root"></div>');
  resetHardware();
  function useAPI() {
    return {
      hubs: hooks.useHubs(),
      latest: hooks.useLatestConnectedHub(),
      hub: hooks.useHub('hub-one'),
      byMac: hooks.useHubByMac('01:02:03:04:05:06'),
      error: hooks.useHubsError(),
      add: hooks.useAddHub(),
      refresh: hooks.useRefreshHub(),
      rename: hooks.useRenameHub(),
      remove: hooks.useRemoveHub(),
      disconnect: hooks.useDisconnectHub(),
      shutdown: hooks.useShutdownHub(),
      setColor: hooks.useSetHubColor(),
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
    if (mounted) {
      await act(() => root.unmount());
      mounted = false;
    }
  };
  t.after(unmount);
  installDOM(t, dom.window);
  const content = React.createElement(
    HubsProvider,
    null,
    React.createElement(Probe)
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

test('hub hooks require their provider', () => {
  function Outside() {
    hooks.useHubs();
    return null;
  }
  assert.throws(
    () => renderToString(React.createElement(Outside)),
    /must be used within a HubsProvider/
  );
});

test('adding hubs publishes immutable metadata and subscribes system sensors', async (t) => {
  const view = await mount(t);
  const original = view.api.hubs;
  const hub = fakeHub();
  hub.ports = ['A', 'B'];
  lego.add = async () => hub;
  let result;
  await act(async () => {
    result = await view.api.add();
  });
  assert.equal(result, hub);
  assert.equal(original.size, 0);
  assert.notEqual(view.api.hubs, original);
  assert.equal(view.api.hubs.size, 1);
  assert.equal(view.api.hub, view.api.byMac);
  assert.equal(present(view.api.hub).name, 'Test hub');
  assert.equal(present(view.api.hub).online, true);
  assert.equal(present(view.api.hub).system.voltage, 0);
  assert.equal(present(view.api.hub).system.current, undefined);
  assert.equal(hub.rgb, undefined, 'LED writes belong to DevicesProvider');
  assert.equal(lego.colorFromText(hub.uuid).hex, present(view.api.hub).color);
  assert.deepEqual(hub.subscriptions, [
    [60, lego.CONSTS.DeviceType.VOLTAGE_SENSOR, 0],
  ]);
  const previous = view.api.hubs;
  await act(() => view.api.add());
  assert.equal(view.api.hubs.size, 1);
  assert.equal(hub.listenerCount('attach'), 1);
  assert.equal(hub.listenerCount('disconnect'), 1);
  assert.notEqual(view.api.hubs, previous);
});

test('telemetry refreshes every second and spontaneous disconnect stops updates', async (t) => {
  const view = await mount(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hub = fakeHub();
  lego.add = async () => hub;
  await act(() => view.api.add());
  const previous = view.api.hub;
  hub.batteryLevel = 42;
  await act(() => t.mock.timers.tick(1000));
  assert.equal(present(view.api.hub).system.batteryLevel, 42);
  assert.equal(present(previous).system.batteryLevel, 80);
  await act(() => hub.emit('disconnect'));
  assert.equal(present(view.api.hub).online, false);
  assert.equal(hub.listenerCount('attach'), 0);
  hub.batteryLevel = 10;
  await act(() => t.mock.timers.tick(5000));
  assert.equal(present(view.api.hub).system.batteryLevel, 42);
});

test('latest online hub follows successful connection order, not polling or Map order', async (t) => {
  const view = await mount(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(Object.is(view.api.latest, null), true);
  const first = fakeHub();
  const second = fakeHub('hub-two');
  lego.add = async () => first;
  await act(() => view.api.add());
  assert.equal(present(view.api.latest).uuid, first.uuid);
  lego.add = async () => second;
  await act(() => view.api.add());
  const order = present(view.api.latest).connectionOrder;
  await act(() => view.api.rename(first.uuid, 'Renamed'));
  await act(() => view.api.refresh(first.uuid));
  await act(() => t.mock.timers.tick(1000));
  assert.equal(present(view.api.latest).uuid, second.uuid);
  assert.equal(present(view.api.latest).connectionOrder, order);
  lego.add = async () => {
    throw new Error('Scan cancelled');
  };
  await act(() => assert.rejects(view.api.add(), /Scan cancelled/));
  assert.equal(present(view.api.latest).uuid, second.uuid);
  lego.add = async () => first;
  await act(() => view.api.add());
  assert.equal(present(view.api.latest).uuid, first.uuid);
  assert.ok(present(view.api.latest).connectionOrder > order);
  assert.deepEqual([...view.api.hubs.keys()], [first.uuid, second.uuid]);
  await act(() => first.emit('disconnect'));
  assert.equal(present(view.api.latest).uuid, second.uuid);
  await act(() => view.api.remove(first.uuid));
  assert.equal(present(view.api.latest).uuid, second.uuid);
  await act(() => view.api.add());
  assert.equal(present(view.api.latest).uuid, first.uuid);
  await act(() => view.api.shutdown(first.uuid));
  assert.equal(present(view.api.latest).uuid, second.uuid);
  await act(() => view.api.remove(second.uuid));
  assert.equal(Object.is(view.api.latest, null), true);
  await act(() => view.api.remove(first.uuid));
  assert.equal(Object.is(view.api.latest, null), true);
});

test('renaming, refreshing, disconnecting, shutdown and removal use the client', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  lego.add = async () => hub;
  await act(() => view.api.add());
  await act(() => view.api.rename(hub.uuid, 'Renamed'));
  assert.equal(present(view.api.hub).name, 'Renamed');
  hub.rssi = -30;
  await act(() => view.api.refresh(hub.uuid));
  assert.equal(present(view.api.hub).system.rssi, -30);
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(present(view.api.hub).online, false);
  await act(() => view.api.add());
  await act(() => view.api.shutdown(hub.uuid));
  assert.equal(present(view.api.hub).online, false);
  await act(() => view.api.remove(hub.uuid));
  assert.equal(view.api.hubs.size, 0);
  await act(() => view.api.add());
  await act(() => view.api.remove(hub.uuid));
  assert.equal(view.api.hubs.size, 0);
  assert.equal(hub.listenerCount('disconnect'), 0);
});

test('failed actions reject and expose errors without falsely marking hubs offline', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  lego.add = async () => {
    throw new Error('Scan cancelled');
  };
  await act(() => assert.rejects(view.api.add(), /Scan cancelled/));
  assert.equal(errorMessage(view.api.error), 'Scan cancelled');
  lego.add = async () => hub;
  await act(() => view.api.add());
  assert.equal(view.api.error, null);
  hub.disconnect = async () => {
    throw new Error('Disconnect failed');
  };
  await act(() =>
    assert.rejects(view.api.remove(hub.uuid), /Disconnect failed/)
  );
  assert.equal(present(view.api.hub).online, true);
  assert.equal(view.api.hubs.size, 1);
  await act(() => assert.rejects(view.api.refresh('unknown'), /not connected/));
  await act(() => assert.rejects(view.api.remove('unknown'), /not found/));
  assert.ok(errors.length >= 3);
});

test('late LED attachment preserves appearance and cleanup removes listeners and timers', async (t) => {
  const view = await mount(t, true);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hub = fakeHub();
  const led = hub.devices.LED;
  delete hub.devices.LED;
  lego.add = async () => hub;
  await act(() => view.api.add());
  assert.equal(hub.rgb, undefined);
  hub.devices.LED = led;
  await act(() => hub.emit('attach', led));
  assert.equal(hub.rgb, undefined);
  await act(() => view.api.setColor(hub.uuid, '#0088ee', hub));
  await act(() => view.api.refresh(hub.uuid));
  await act(() => t.mock.timers.tick(1000));
  assert.equal(present(view.api.hub).color, '#0088ee');
  await act(() => hub.emit('detach', led));
  await view.unmount();
  assert.equal(hub.listenerCount('attach'), 0);
  assert.equal(hub.listenerCount('detach'), 0);
  assert.equal(hub.listenerCount('disconnect'), 0);
  assert.deepEqual(hub.unsubscriptions, [[60, 0]]);
  t.mock.timers.tick(5000);
});

test('connection completing after unmount is disconnected and not registered', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  let finish: ((hub: ReturnType<typeof fakeHub>) => void) | undefined;
  let disconnected = false;
  hub.disconnect = async () => {
    disconnected = true;
  };
  lego.add = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.add();
  });
  const rejection = assert.rejects(
    present(pending),
    /unmounted during connection/
  );
  await view.unmount();
  present(finish)(hub);
  await rejection;
  assert.equal(disconnected, true);
  assert.equal(hub.listenerCount('attach'), 0);
});

test('a pending rename cannot bring a disconnected hub back online', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  lego.add = async () => hub;
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.setName = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.rename(hub.uuid, 'Late name');
  });
  await act(() => hub.emit('disconnect'));
  await act(async () => {
    present(finish)();
    await present(pending);
  });
  assert.equal(present(view.api.hub).online, false);
  assert.equal(present(view.api.hub).name, 'Test hub');
});

test('a pending removal cannot delete a replacement connection with the same UUID', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  lego.add = async () => hub;
  await act(() => view.api.add());
  let finish: (() => void) | undefined;
  hub.disconnect = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.remove(hub.uuid);
  });
  const rejected = assert.rejects(
    present(pending),
    /reconnected during removal/
  );
  const replacement = fakeHub();
  replacement.name = 'Replacement';
  lego.add = async () => replacement;
  await act(() => view.api.add());
  await act(async () => {
    present(finish)();
    await rejected;
  });
  assert.equal(present(view.api.hub).name, 'Replacement');
  assert.equal(present(view.api.hub).online, true);
  assert.equal(hub.listenerCount('disconnect'), 0);
  assert.equal(replacement.listenerCount('disconnect'), 1);
});

test('sensor and appearance errors are exposed without dropping the hub', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.subscribe = async () => {
    throw new Error('Subscription failed');
  };
  lego.add = async () => hub;
  await act(() => view.api.add());
  assert.equal(errorMessage(view.api.error), 'Subscription failed');
  assert.equal(present(view.api.hub).online, true);
  await act(() =>
    assert.rejects(
      Reflect.apply(view.api.setColor, undefined, [hub.uuid, '#0088ee', {}]),
      /connection changed/
    )
  );
  assert.equal(present(view.api.hub).online, true);
});
