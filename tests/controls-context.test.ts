import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { errorMessage, present } from './helpers/dom.ts';
import {
  controlOf,
  mount,
  fakeHub,
  fakeDevice,
  create,
  DeviceType,
  HubType,
  lego,
} from './helpers/controls.ts';

test('controls use immutable stable-ID session state and validate changes atomically', async (t) => {
  const view = await mount(t, { strict: true });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const initial = view.api.controls;
  const first = await create(view);
  const second = await create(view, 'arrows');
  assert.notEqual(first.id, second.id);
  assert.equal(initial.size, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
  await act(() => view.api.update(first.id, { x: 8, y: 4, title: 'Train' }));
  const updated = view.api.controls.get(first.id);
  assert.equal(present(updated).id, first.id);
  assert.equal(present(updated).title, 'Train');
  await act(async () => {
    await assert.rejects(
      view.api.update(first.id, { x: second.x, y: second.y }),
      /empty position/
    );
    await assert.rejects(
      view.api.create({ type: 'distance', uuid: hub.uuid, port: 'A' }),
      /compatible/
    );
    await assert.rejects(view.api.update(first.id, { w: 3 }), /Unsupported/);
    await assert.rejects(view.api.update(first.id, { title: '' }), /title/);
    await assert.rejects(
      Reflect.apply(view.api.update, undefined, [first.id, { options: null }]),
      /options/
    );
  });
  assert.equal(view.api.controls.get(first.id), updated);
  await view.hideControls();
  await view.showControls();
  assert.equal(view.api.controls.size, 0);
});

test('board full gives explicit feedback without losing existing controls', async (t) => {
  const view = await mount(t);
  fakeHub();
  await act(() => view.api.addHub());
  for (let i = 0; i < 15; i += 1) {
    await create(view, 'distance', 'B', { w: 2, h: 2 });
  }
  await act(async () => {
    await assert.rejects(
      view.api.create({
        type: 'distance',
        uuid: 'hub-one',
        port: 'B',
        w: 2,
        h: 2,
      }),
      /Board full/
    );
  });

  assert.equal(view.api.controls.size, 15);
});

test('behavior updates preserve running motors, partial options and shared sensor subscriptions', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view);
  const arrows = await create(view, 'arrows');
  const color = await create(view, 'color', 'B');
  const distance = await create(view, 'distance', 'B');
  const tilt = await create(view, 'tilt', 'C', { options: { rollAxis: 2 } });
  const count = hub.subscriptions.length;
  await act(() => view.api.speed(slider.id, 57));
  await act(() =>
    view.api.update(slider.id, { options: { resetOnRelease: true } })
  );
  await act(() => view.api.update(arrows.id, { options: { speed: 25 } }));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [57]
  );
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    57
  );
  await act(() => view.api.update(color.id, { options: { stability: 400 } }));
  await act(() =>
    view.api.update(distance.id, { options: { scale: 'linear' } })
  );
  await act(() =>
    view.api.update(tilt.id, { options: { pitchReverseFactor: -1 } })
  );
  assert.equal(
    controlOf(view.api.controls.get(tilt.id), 'tilt').options.rollAxis,
    2
  );
  assert.equal(
    controlOf(view.api.controls.get(tilt.id), 'tilt').options
      .pitchReverseFactor,
    -1
  );
  assert.equal(hub.subscriptions.length, count);
  assert.equal(hub.unsubscriptions.length, 0);
  const previous = view.api.controls.get(arrows.id);
  await act(async () => {
    await assert.rejects(
      view.api.update(arrows.id, {
        title: 'Invalid speed',
        options: { speed: 0 },
      }),
      /speed/
    );
  });
  assert.equal(view.api.controls.get(arrows.id), previous);
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [57]
  );
});

test('shared sensor subscriptions ignore readings/layout edits and release the last consumer', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const first = await create(view, 'distance', 'B');
  const second = await create(view, 'distance', 'B');
  const sensor = hub.devices.B;
  const subscriptions = () =>
    hub.subscriptions.filter((call) => call[0] === sensor.portId);
  assert.equal(subscriptions().length, 1);
  assert.equal(subscriptions()[0][2], 8);
  await act(() => sensor.emit('distance', { distance: 0 }));
  await act(() => view.api.update(first.id, { title: 'Front', x: 3 }));
  assert.equal(subscriptions().length, 1);
  await act(() => view.api.remove(first.id));
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === sensor.portId).length,
    0
  );
  await act(() => view.api.remove(second.id));
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === sensor.portId).length,
    1
  );
});

for (const order of [
  ['color', 'distance'],
  ['distance', 'color'],
] as const) {
  test(`${order.join(' then ')} share one stream until the final consumer leaves`, async (t) => {
    const view = await mount(t);
    const hub = fakeHub();
    await act(() => view.api.addHub());
    const first = await create(view, order[0], 'B');
    const second = await create(view, order[1], 'B');
    const sensor = hub.devices.B;
    const subscriptions = () =>
      hub.subscriptions.filter((call) => call[0] === sensor.portId);
    const unsubscriptions = () =>
      hub.unsubscriptions.filter((call) => call[0] === sensor.portId);
    assert.deepEqual(subscriptions(), [[sensor.portId, sensor.type, 8]]);
    await act(() =>
      sensor.emit('colorAndDistance', { color: 9, distance: 43 })
    );
    await act(() => view.api.update(second.id, { title: 'Shared sensor' }));
    await act(() => view.api.remove(first.id));
    assert.equal(unsubscriptions().length, 0);
    assert.equal(subscriptions().length, 1);
    await act(() => view.api.remove(second.id));
    assert.deepEqual(unsubscriptions(), [[sensor.portId, 8]]);
  });
}

test('dedicated color sensors select their own modes; WeDo only offers supported streams', async (t) => {
  const view = await mount(t);
  const hub = fakeHub('hub-one', HubType.WEDO2_SMART_HUB);
  hub.devices.C = fakeDevice('C', DeviceType.TECHNIC_COLOR_SENSOR);
  hub.devices.D = fakeDevice('D', DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR);
  hub.devices.E = fakeDevice('E', DeviceType.MOTION_SENSOR);
  await act(() => view.api.addHub());
  await create(view, 'color', 'B');
  await create(view, 'color', 'C');
  await create(view, 'color', 'D');
  await create(view, 'distance', 'E');
  for (const [port, mode] of [
    ['B', 0],
    ['C', 0],
    ['D', 1],
    ['E', 0],
  ]) {
    assert.equal(
      present(
        hub.subscriptions.find((call) => call[0] === hub.devices[port].portId)
      )[2],
      mode
    );
  }
  await act(async () => {
    await assert.rejects(
      view.api.create({ type: 'distance', uuid: hub.uuid, port: 'B' }),
      /compatible/
    );
  });
});

test('subscription failures stay visible without telemetry-driven retries and retry explicitly', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  let attempts = 0;
  const { subscribe } = hub;
  hub.subscribe = async (...args) => {
    if (args[0] !== hub.devices.B.portId) {
      await subscribe(...args);
      return;
    }
    attempts += 1;
    if (attempts <= 2) throw new Error('Sensor busy');
    hub.subscriptions.push(args);
  };
  await create(view, 'distance', 'B');
  assert.match(errorMessage(view.api.error), /Sensor busy/);
  await create(view, 'color', 'B');
  await act(() => hub.devices.B.emit('distance', { distance: 7 }));
  await act(() => view.api.refresh(hub.uuid));
  assert.equal(attempts, 1);
  await act(() => view.api.retry());
  assert.equal(attempts, 2);
  await create(view, 'tilt', 'C');
  assert.equal(attempts, 2);
  await act(() => view.api.retry());
  assert.equal(attempts, 3);
});

test('failed cleanup is visible and retried without resubscribing', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const sensor = await create(view, 'distance', 'B');
  let attempts = 0;
  const { unsubscribe } = hub;
  hub.unsubscribe = async (...args) => {
    if (args[0] === hub.devices.B.portId) {
      attempts += 1;
      if (attempts === 1) throw new Error('Cleanup failed');
    }
    return unsubscribe(...args);
  };
  await act(() => view.api.remove(sensor.id));
  assert.match(errorMessage(view.api.error), /Cleanup failed/);
  await act(async () => view.api.retry());
  assert.equal(attempts, 2);
  assert.equal(
    hub.subscriptions.filter((call) => call[0] === hub.devices.B.portId).length,
    1
  );
});

test('ControlsProvider-only unmount releases a pending subscription after it settles', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  let finish: (() => void) | undefined;
  const { subscribe } = hub;
  hub.subscribe = (...args) =>
    args[0] === hub.devices.B.portId
      ? new Promise((resolve) => {
          finish = () => {
            subscribe(...args);
            resolve();
          };
        })
      : subscribe(...args);
  await create(view, 'distance', 'B');
  await view.hideControls();
  await act(async () => present(finish)());
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === hub.devices.B.portId)
      .length,
    1
  );
});

test('full-provider teardown stops an active motor exactly once', async (t) => {
  const view = await mount(t, { strict: true });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view);
  await act(() => view.api.speed(control.id, -60));
  await view.unmount();
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [-60, 0]
  );
});

test('removing a sensor while subscribe is pending waits and releases it', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  let finish: (() => void) | undefined;
  const { subscribe } = hub;
  hub.subscribe = (...args) =>
    args[0] === hub.devices.B.portId
      ? new Promise((resolve) => {
          finish = () => {
            subscribe(...args);
            resolve();
          };
        })
      : subscribe(...args);
  const control = await create(view, 'distance', 'B');
  await act(() => view.api.remove(control.id));
  assert.equal(hub.unsubscriptions.length, 0);
  await act(() => present(finish)());
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === hub.devices.B.portId)
      .length,
    1
  );
});

test('pending old-generation subscription cleanup never unsubscribes its replacement', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  let finish: (() => void) | undefined;
  const { subscribe } = hub;
  let first = true;
  hub.subscribe = (...args) => {
    if (first) {
      first = false;
      return new Promise((resolve) => {
        finish = () => {
          subscribe(...args);
          resolve();
        };
      });
    }
    return subscribe(...args);
  };
  await create(view, 'distance', 'B');
  await create(view, 'color', 'B');
  const replacement = fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR);
  hub.devices.B = replacement;
  await act(() => hub.emit('attach', replacement));
  await act(() => present(finish)());
  assert.equal(
    hub.subscriptions.filter((call) => call[0] === replacement.portId).length,
    2
  );
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === replacement.portId).length,
    0
  );
});

test('disconnect retains disabled controls; reconnect restores sensors without starting motors; removal deletes controls', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const motor = await create(view);
  await create(view, 'distance', 'B');
  await act(() => view.api.speed(motor.id, 65));
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(view.api.controls.size, 2);
  await act(async () => {
    await assert.rejects(view.api.speed(motor.id, 100), /disconnected/);
  });
  const replacement = fakeHub();
  await act(() => view.api.addHub());
  assert.equal(view.api.controls.size, 2);
  assert.equal(replacement.devices.A.speeds.length, 0);
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    undefined
  );
  assert.equal(
    replacement.subscriptions.filter(
      (call) => call[0] === replacement.devices.B.portId
    ).length,
    1
  );
  await act(() => view.api.disconnect(hub.uuid));
  await act(() => view.api.removeHub(hub.uuid));
  assert.equal(view.api.controls.size, 0);
});

test('motor commands are ordered and pending speed changes cannot overtake the latest stop', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const first = await create(view);
  const second = await create(view, 'arrows');
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
    running = view.api.speed(first.id, 50);
  });
  let later: Promise<unknown> | undefined;
  let stop: Promise<unknown> | undefined;
  await act(async () => {
    later = view.api.speed(first.id, 80);
    stop = view.api.speed(second.id, 0);
  });
  await act(async () => {
    present(finish)();
    await Promise.all([running, later, stop]);
  });
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [50, 0]
  );
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    0
  );
});

test('failed safety stops keep controls on removal or rebinding for an explicit retry', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.ports.push('D');
  await act(() => view.api.addHub());
  const control = await create(view);
  await act(() => view.api.speed(control.id, 70));
  const write = hub.devices.A.setSpeed;
  hub.devices.A.setSpeed = async () => {
    throw new Error('Stop failed');
  };
  await act(async () => {
    await assert.rejects(view.api.remove(control.id), /Stop failed/);
    await assert.rejects(
      view.api.update(control.id, { port: 'D' }),
      /Stop failed/
    );
  });
  assert.equal(present(view.api.controls.get(control.id)).port, 'A');
  hub.devices.A.setSpeed = write;
  await act(() => view.api.update(control.id, { port: 'D' }));
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  assert.equal(hub.devices.D.speeds.length, 0);
  await act(() => view.api.remove(control.id));
  assert.equal(view.api.controls.size, 0);
});

test('Stop All retries motors unless feedback confirms stop completion', async (t) => {
  const feedback = lego.CONSTS.CommandFeedback;
  for (const [label, result, status] of [
    ['discarded', feedback.EXECUTION_DISCARDED, 'EXECUTION_DISCARDED'],
    ['pending', feedback.TRANSMISSION_PENDING, 'TRANSMISSION_PENDING'],
    ['busy', feedback.EXECUTION_BUSY, 'EXECUTION_BUSY'],
    ['disabled', feedback.FEEDBACK_DISABLED, 'FEEDBACK_DISABLED'],
    ['missing', feedback.FEEDBACK_MISSING, 'FEEDBACK_MISSING'],
    ['absent', undefined, 'FEEDBACK_MISSING'],
  ] as const) {
    await t.test(label, async (subtest) => {
      const view = await mount(subtest);
      const hub = fakeHub();
      await act(() => view.api.addHub());
      const control = await create(view);
      await act(() => view.api.speed(control.id, 70));
      const stops: number[] = [];
      Reflect.set(hub.devices.A, 'setSpeed', async (speed: number) => {
        if (speed === 0) {
          stops.push(speed);
          return result;
        }
        return feedback.EXECUTION_COMPLETED;
      });

      await act(async () => {
        await assert.rejects(view.api.stopAll(), new RegExp(status));
      });
      assert.deepEqual(stops, [0]);

      hub.devices.A.setSpeed = async (speed) => {
        if (speed === 0) stops.push(speed);
        return feedback.EXECUTION_COMPLETED;
      };
      await act(() => view.api.stopAll());
      assert.deepEqual(stops, [0, 0]);
    });
  }
});

test('hidden/pagehide stops once per device and visible/reconnected controls never auto-resume', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const first = await create(view);
  await create(view, 'arrows');
  await act(() => view.api.speed(first.id, 45));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  await act(async () => {
    document.dispatchEvent(new window.Event('visibilitychange'));
    window.dispatchEvent(new window.Event('pagehide'));
  });
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [45, 0]
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  await act(() => document.dispatchEvent(new window.Event('visibilitychange')));
  assert.equal(hub.devices.A.speeds.length, 2);
  await act(() => view.api.speed(first.id, 30));
  await view.hideControls();
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
});
