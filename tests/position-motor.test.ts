import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import PositionMotor, {
  type Endpoint,
  type PositionDriver,
} from '../src/core/position-motor.ts';
import {
  button,
  click,
  create,
  fakeDevice,
  fakeHub,
  input as setInput,
  key,
  loadSource,
  lego,
  mount,
} from './helpers/controls.ts';
import { asButton, query } from './helpers/dom.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;

function fake() {
  const calls: string[] = [];
  const pending: {
    endpoint: Endpoint;
    signal: AbortSignal;
    resolve: (value: { kind: 'endpoint'; position: number }) => void;
  }[] = [];
  let valid = true;
  let lost = () => {};
  const driver: PositionDriver = {
    referenceValid: () => valid,
    onReferenceLost: (listener) => {
      lost = listener;
      return () => {
        lost = () => {};
      };
    },
    seekEndpoint: (endpoint, { signal, maxPower, maxDurationMs }) => {
      calls.push(`seek:${endpoint}:${maxPower}:${maxDurationMs}`);
      return new Promise((resolve) => {
        pending.push({ endpoint, signal, resolve });
      });
    },
    moveTo: async (target) => {
      calls.push(`move:${target}`);
    },
    stop: async () => {
      calls.push('stop');
    },
  };
  return {
    driver,
    calls,
    pending,
    lose: () => {
      valid = false;
      lost();
    },
    restore: () => {
      valid = true;
    },
  };
}

async function flush() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

test('calibration requires explicit ordered endpoints and clamps targets', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  assert.deepEqual(adapter.calls, ['stop', 'seek:left:15:5000']);
  await assert.rejects(() => motor.moveFraction(0), /not calibrated/);
  adapter.pending[0].resolve({ kind: 'endpoint', position: -20 });
  await flush();
  assert.equal(adapter.pending[1].endpoint, 'right');
  adapter.pending[1].resolve({ kind: 'endpoint', position: 40 });
  await calibrating;
  assert.equal(motor.snapshot().stage, 'ready');
  await motor.moveFraction(-1);
  await motor.moveFraction(2);
  assert.ok(adapter.calls.includes('move:-20'));
  assert.ok(adapter.calls.includes('move:40'));
});

test('stop aborts calibration and never accepts a late endpoint', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  const result = assert.rejects(calibrating, /cancelled/);
  await motor.stop();
  await result;
  assert.equal(adapter.pending[0].signal.aborted, true);
  adapter.pending[0].resolve({ kind: 'endpoint', position: -1 });
  await flush();
  assert.equal(adapter.pending.length, 1);
  assert.equal(motor.snapshot().stage, 'uncalibrated');
  await assert.rejects(() => motor.moveFraction(0), /not calibrated/);
});

test('reference loss invalidates limits and stops the adapter', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  adapter.pending[0].resolve({ kind: 'endpoint', position: -1 });
  await flush();
  adapter.pending[1].resolve({ kind: 'endpoint', position: 1 });
  await calibrating;
  const stops = adapter.calls.filter((call) => call === 'stop').length;
  adapter.lose();
  await flush();
  assert.equal(
    adapter.calls.filter((call) => call === 'stop').length,
    stops + 1
  );
  await assert.rejects(() => motor.moveFraction(0), /reference/);
});

test('timeout stops the motor and does not commit a partial range', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  const result = assert.rejects(calibrating, /timed out/);
  t.mock.timers.tick(5000);
  await result;
  assert.equal(adapter.pending[0].signal.aborted, true);
  assert.equal(adapter.calls.at(-1), 'stop');
  assert.equal(motor.snapshot().stage, 'uncalibrated');
  await assert.rejects(() => motor.moveFraction(0), /not calibrated/);
});

test('invalid right endpoint aborts without committing the left endpoint', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibration = motor.calibrate();
  await flush();
  adapter.pending[0].resolve({ kind: 'endpoint', position: 10 });
  await flush();
  const result = assert.rejects(calibration, /right endpoint/);
  adapter.pending[1].resolve({ kind: 'endpoint', position: 10 });
  await result;
  assert.equal(adapter.calls.at(-1), 'stop');
  await assert.rejects(() => motor.moveFraction(0), /not calibrated/);
});

test('a later move waits for every outstanding stop', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  adapter.pending[0].resolve({ kind: 'endpoint', position: -1 });
  await flush();
  adapter.pending[1].resolve({ kind: 'endpoint', position: 1 });
  await calibrating;
  let release: (() => void) | undefined;
  let calls = 0;
  adapter.driver.stop = () => {
    calls += 1;
    if (calls === 1)
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    return Promise.resolve();
  };
  const firstStop = motor.stop();
  await flush();
  const move = motor.moveFraction(1);
  await flush();
  assert.equal(adapter.calls.includes('move:1'), false);
  assert.ok(release);
  release();
  await firstStop;
  await move;
  assert.equal(adapter.calls.includes('move:1'), true);
});

test('stop cancels an in-flight move even if its completion never arrives', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const calibrating = motor.calibrate();
  await flush();
  adapter.pending[0].resolve({ kind: 'endpoint', position: -1 });
  await flush();
  adapter.pending[1].resolve({ kind: 'endpoint', position: 1 });
  await calibrating;
  let signal: AbortSignal | undefined;
  adapter.driver.moveTo = (_target, input) => {
    signal = input;
    return new Promise<void>(() => {});
  };
  const move = motor.moveFraction(1);
  await flush();
  const result = assert.rejects(move, /cancelled/);
  await motor.stop();
  await result;
  assert.equal(signal?.aborted, true);
  assert.equal(motor.snapshot().active, false);
});

test('only an explicitly injected adapter is attached to a live device', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  assert.equal(
    view.api.devices.get(hub.uuid)?.get('A')?.positionDriver,
    adapter.driver
  );
  assert.equal(
    view.api.devices.get(hub.uuid)?.get('B')?.positionDriver,
    undefined
  );
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(
    view.api.devices.get(hub.uuid)?.get('A')?.positionDriver,
    undefined
  );
  assert.deepEqual(adapter.calls, []);
});

test('unsupported devices reject Servo creation without commands', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await act(async () => {
    await assert.rejects(
      view.api.create({
        type: 'arrows',
        uuid: hub.uuid,
        port: 'A',
        options: { mode: 'servo' },
      }),
      /not available/
    );
  });
  assert.equal(view.api.controls.size, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
});

test('provider excludes speed during calibration and Stop aborts it immediately', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  const speed = await create(view, 'arrows');
  const stop = await create(view, 'stop');
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  assert.equal(adapter.pending[0].endpoint, 'left');
  await act(async () => {
    await assert.rejects(view.api.speed(speed.id, 40), /calibration/);
  });
  await act(async () => {
    await view.api.speed(stop.id, 0);
    await calibration;
  });
  assert.equal(adapter.pending[0].signal.aborted, true);
  adapter.pending[0].resolve({ kind: 'endpoint', position: -10 });
  await flush();
  assert.equal(adapter.pending.length, 1);
  assert.equal(
    hub.devices.A.speeds.some(([value]) => value === 40),
    false
  );
});

test('Stop sends speed zero even when the position stop fails', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  const priorSpeeds = hub.devices.A.speeds.length;
  adapter.driver.stop = async () => {
    throw new Error('position stop failed');
  };
  await act(async () => {
    await assert.rejects(view.api.speed(slider.id, 0), /position stop failed/);
    await calibration;
  });
  assert.equal(adapter.pending[0].signal.aborted, true);
  assert.deepEqual(
    hub.devices.A.speeds.slice(priorSpeeds).map(([v]) => v),
    [0]
  );
  adapter.driver.stop = async () => {};
});

test('Stop sends speed zero without waiting for a stalled position stop', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  const priorSpeeds = hub.devices.A.speeds.length;
  let release: (() => void) | undefined;
  adapter.driver.stop = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  let stopped: Promise<void> | undefined;
  await act(async () => {
    stopped = view.api.speed(slider.id, 0);
    await flush();
  });
  assert.equal(adapter.pending[0].signal.aborted, true);
  assert.deepEqual(
    hub.devices.A.speeds.slice(priorSpeeds).map(([v]) => v),
    [0]
  );
  await act(async () => {
    assert.ok(release);
    release();
    await stopped;
    await calibration;
  });
  adapter.driver.stop = async () => {};
});

test('provider Stop invalidates calibration waiting behind a speed command', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  const speed = await create(view, 'arrows');
  let release: (() => void) | undefined;
  hub.devices.A.setSpeed = async (value) => {
    if (value === 30)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return lego.CONSTS.CommandFeedback.EXECUTION_COMPLETED;
  };
  let running: Promise<unknown> | undefined;
  await act(async () => {
    running = view.api.speed(speed.id, 30);
  });
  let calibration: Promise<unknown> | undefined;
  let stopped: Promise<unknown> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
    stopped = view.api.speed(speed.id, 0);
  });
  await act(async () => {
    assert.ok(release);
    release();
    await Promise.all([running, calibration, stopped]);
  });
  assert.equal(adapter.pending.length, 0);
});

test('rebinding cancels calibration and discards its old reference', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName && ['A', 'D'].includes(device.portName)
        ? adapter.driver
        : undefined,
  });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.ports.push('D');
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  await act(async () => {
    await view.api.update(slider.id, { port: 'D' });
    await calibration;
  });
  assert.equal(adapter.pending[0].signal.aborted, true);
  await act(async () => {
    await assert.rejects(view.api.position(slider.id, 1), /not calibrated/);
  });
  assert.ok(hub.devices.D.speeds.every(([value]) => value === 0));
});

test('Stop interrupts an in-flight position without waiting for completion', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  const stop = await create(view, 'stop');
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  await act(async () => {
    adapter.pending[0].resolve({ kind: 'endpoint', position: -10 });
  });
  await act(async () => {
    adapter.pending[1].resolve({ kind: 'endpoint', position: 30 });
    await calibration;
  });
  let signal: AbortSignal | undefined;
  adapter.driver.moveTo = (target, input) => {
    adapter.calls.push(`move:${target}`);
    signal = input;
    return new Promise<void>(() => {});
  };
  let move: Promise<void> | undefined;
  await act(async () => {
    move = view.api.position(slider.id, 2);
  });
  assert.equal(adapter.calls.at(-1), 'move:30');
  await act(async () => {
    await view.api.speed(stop.id, 0);
    await move;
  });
  assert.equal(signal?.aborted, true);
  assert.equal(adapter.calls.at(-1), 'stop');
});

test('disconnect aborts positioning and never replays it on reconnect', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  await act(async () => {
    await view.api.disconnect(hub.uuid);
  });
  await act(async () => {
    await calibration;
  });
  assert.equal(adapter.pending[0].signal.aborted, true);
  const replacement = fakeHub();
  await act(() => view.api.addHub());
  assert.equal(adapter.pending.length, 1);
  assert.equal(replacement.devices.A.speeds.length, 0);
  await act(async () => {
    await assert.rejects(view.api.position(slider.id, 1), /not calibrated/);
  });
});

test('a speed request interrupts position before driving the motor', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  const speed = await create(view, 'arrows');
  let calibration: Promise<void> | undefined;
  await act(async () => {
    calibration = view.api.calibrate(slider.id);
  });
  await act(async () => {
    adapter.pending[0].resolve({ kind: 'endpoint', position: -10 });
  });
  await act(async () => {
    adapter.pending[1].resolve({ kind: 'endpoint', position: 30 });
    await calibration;
  });
  let signal: AbortSignal | undefined;
  adapter.driver.moveTo = (_target, input) => {
    signal = input;
    return new Promise<void>(() => {});
  };
  let move: Promise<void> | undefined;
  await act(async () => {
    move = view.api.position(slider.id, 1);
  });
  await act(async () => {
    await view.api.speed(speed.id, 40);
    await move;
  });
  assert.equal(signal?.aborted, true);
  assert.equal(hub.devices.A.speeds.at(-1)?.[0], 40);
});

test('reference loss cancels a queued calibration and still stops speed', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const servo = await create(view, 'slider', 'A', {
    options: { mode: 'servo' },
  });
  const speed = await create(view, 'arrows');
  let release: (() => void) | undefined;
  hub.devices.A.setSpeed = async (value) => {
    hub.devices.A.speeds.push([value]);
    if (value === 30)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return lego.CONSTS.CommandFeedback.EXECUTION_COMPLETED;
  };
  let running: Promise<unknown> | undefined;
  let calibration: Promise<unknown> | undefined;
  await act(async () => {
    running = view.api.speed(speed.id, 30);
  });
  await act(async () => {
    calibration = view.api.calibrate(servo.id);
    adapter.lose();
    adapter.restore();
  });
  await act(async () => {
    assert.ok(release);
    release();
    await Promise.all([running, calibration]);
  });
  assert.equal(adapter.pending.length, 0);
  assert.deepEqual(
    hub.devices.A.speeds.map(([value]) => value),
    [30, 0]
  );
});

test('Servo creation, calibration, arrows and slider use the provider path', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
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
  await act(() =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'A' })
  );
  assert.ok(button('Choose Motor slider - Servo'));
  await click(button('Choose Motor arrows - Servo'));
  await click(button('Create Motor arrows - Servo, 2 by 1'));
  assert.equal(adapter.calls.length, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.ok(document.querySelector('[data-motor-mode="servo"]'));
  assert.equal(
    asButton(query(document, 'button[aria-label="Forward"]')).disabled,
    true
  );
  await click(button('Configure Motor arrows'));
  await click(query(document, '[role="dialog"] input[type="checkbox"]'));
  await click(button('Start calibration'));
  assert.equal(adapter.pending[0].endpoint, 'left');
  await act(async () => {
    adapter.pending[0].resolve({ kind: 'endpoint', position: -20 });
  });
  assert.equal(adapter.pending[1].endpoint, 'right');
  await act(async () => {
    adapter.pending[1].resolve({ kind: 'endpoint', position: 40 });
  });
  await click(button('Cancel'));
  let signal: AbortSignal | undefined;
  adapter.driver.moveTo = (target, input) => {
    adapter.calls.push(`move:${target}`);
    signal = input;
    return new Promise<void>(() => {});
  };
  const forward = button('Forward');
  await key(forward, 'keydown', 'Enter');
  assert.equal(adapter.calls.at(-1), 'move:40');
  await key(forward, 'keydown', 'Enter', { repeat: true });
  assert.equal(adapter.calls.at(-1), 'move:40');
  await key(forward, 'keyup', 'Enter');
  assert.equal(adapter.calls.at(-1), 'move:40');
  assert.equal(signal?.aborted, false);
  await click(button('Stop'));
  assert.equal(signal?.aborted, true);
  adapter.driver.moveTo = async (target) => {
    adapter.calls.push(`move:${target}`);
  };
  await click(button('Backward'));
  assert.equal(adapter.calls.at(-1), 'move:-20');
  await act(() =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'A' })
  );
  await click(button('Choose Motor slider - Servo'));
  await click(button('Create Motor slider - Servo, 1 by 2'));
  const range = query(document, 'input[aria-label="Servo target position"]');
  await setInput(range, 50);
  assert.equal(adapter.calls.at(-1), 'move:10');
});

test('calibration cancellation from settings aborts and leaves Servo disabled', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
    render: () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Grid),
        React.createElement(Modal)
      ),
  });
  fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'arrows', 'A', { options: { mode: 'servo' } });
  await click(button('Configure Motor arrows'));
  await click(query(document, '[role="dialog"] input[type="checkbox"]'));
  await click(button('Start calibration'));
  await click(button('Cancel calibration and stop'));
  assert.equal(adapter.pending[0].signal.aborted, true);
  adapter.pending[0].resolve({ kind: 'endpoint', position: -20 });
  await act(flush);
  assert.equal(adapter.pending.length, 1);
  await click(button('Cancel'));
  assert.equal(asButton(button('Forward')).disabled, true);
});

test('changing mode updates the tile cue without starting motion', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: (_hub, device) =>
      device.portName === 'A' ? adapter.driver : undefined,
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
  await create(view, 'arrows');
  await click(button('Configure Motor arrows'));
  await setInput(query(document, '[role="dialog"] select'), 'servo');
  await click(button('Save'));
  assert.ok(document.querySelector('[data-motor-mode="servo"]'));
  await click(button('Configure Motor arrows'));
  await setInput(query(document, '[role="dialog"] select'), 'speed');
  await click(button('Save'));
  assert.ok(document.querySelector('[data-motor-mode="speed"]'));
  assert.equal(adapter.pending.length, 0);
  assert.ok(hub.devices.A.speeds.every(([value]) => value === 0));
});
