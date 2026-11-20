import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import PositionMotor, {
  type PositionDriver,
} from '../src/core/position-motor.ts';
import VirtualServo from '../src/core/virtual-servo.ts';
import { defaultServoBounds } from '../src/core/servo-bounds.ts';
import { CONSTS } from '../src/core/clients/lego.ts';
import {
  button,
  click,
  create,
  fakeDevice,
  fakeHub,
  input as setInput,
  key,
  loadSource,
  mount,
} from './helpers/controls.ts';
import { query } from './helpers/dom.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const { controlOptions, getControlChoices, motorPositionCapabilities } =
  loadSource('core/controls');
const servoOptions = { mode: 'servo', servoMin: -20, servoMax: 40 } as const;

test('virtual Servo validates bounds and sends signed deltas between clamped requests', async () => {
  const deltas: number[] = [];
  const targets: (number | null)[] = [];
  const servo = new VirtualServo(
    {
      kind: 'relative',
      rotate: async (delta) => {
        deltas.push(delta);
      },
    },
    () => true,
    (state) => targets.push(state.target)
  );
  for (const [servoMin, servoMax] of [
    [Infinity, 180],
    [0, 0],
    [1, 180],
    [-180, -181],
  ]) {
    assert.throws(
      () => controlOptions('slider', { mode: 'servo', servoMin, servoMax }),
      /bounds/
    );
  }
  await assert.rejects(servo.moveFraction(1, servoOptions), /virtual zero/);
  await servo.activate();
  assert.equal(targets.at(-1), 0);
  assert.deepEqual(deltas, []);
  await servo.moveFraction(10, servoOptions);
  await servo.moveFraction(-10, servoOptions);
  await servo.moveFraction(0.5, servoOptions);
  assert.deepEqual(deltas, [40, -60, 30]);
  assert.equal(targets.at(-1), 10);
});

test('absolute Servo offsets default bounds from its zero without wrapping', async () => {
  const angles: number[] = [];
  let origin = 25;
  const servo = new VirtualServo(
    {
      kind: 'absolute',
      origin: async () => origin,
      gotoAngle: async (angle) => {
        angles.push(angle);
      },
    },
    () => true,
    () => {}
  );
  await servo.activate();
  assert.deepEqual(angles, []);
  await servo.moveFraction(2, defaultServoBounds);
  await servo.moveFraction(-2, defaultServoBounds);
  assert.deepEqual(angles, [179, -155]);
  origin = 180;
  await assert.rejects(servo.activate(), /absolute command range/);
  await assert.rejects(
    servo.moveFraction(1, defaultServoBounds),
    /virtual zero/
  );
});

test('Servo tile starts at zero with default bounds and persists edits', async (t) => {
  const view = await mount(t, {
    render: () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Grid),
        React.createElement(Modal)
      ),
  });
  const angles: number[] = [];
  const motor = Object.assign(fakeDevice('A'), {
    requestUpdate: () => motor.emit('rotate', { degrees: 25 }),
    gotoAngle: async (target: number) => {
      angles.push(target);
      return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
    },
  });
  const hub = fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  await act(() =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'A' })
  );
  await click(button('Choose Motor arrows - Servo'));
  const size = button('Create Motor arrows - Servo, 2 by 1');
  const bounds = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '[role="dialog"] input[type="number"]'
      )
    );
  assert.equal(bounds().length, 0);
  await click(size);
  assert.equal(hub.subscriptions.at(-1)?.[2], 2);
  assert.deepEqual(angles, []);
  assert.deepEqual(motor.speeds, []);
  const tile = query(document, '[data-control-id]');
  assert.match(tile.textContent ?? '', /Requested: 0/);
  assert.doesNotMatch(tile.textContent ?? '', /Activate Servo/);
  await click(button('Forward'));
  assert.deepEqual(angles, [179]);
  assert.match(tile.textContent ?? '', /Requested: 154/);
  await click(button('Configure Motor arrows'));
  assert.deepEqual(
    bounds().map((field) => field.value),
    ['-180', '180']
  );
  const autoReturn = query(document, '[role="dialog"] input[type="checkbox"]');
  await click(autoReturn);
  await setInput(bounds()[0], -20);
  await setInput(bounds()[1], 40);
  await click(button('Save'));
  assert.deepEqual(angles, [179]);
  assert.doesNotMatch(tile.textContent ?? '', /Requested: 154/);
  const snapshot = view.api.snapshotProject('Servo bounds');
  assert.equal(Reflect.get(snapshot.controls[0].options, 'servoMin'), -20);
  assert.equal(Reflect.get(snapshot.controls[0].options, 'servoMax'), 40);
  assert.equal(
    Reflect.get(snapshot.controls[0].options, 'autoReturnToCenter'),
    true
  );
  assert.match(tile.textContent ?? '', /Requested: 0/);
  const forward = button('Forward');
  await key(forward, 'keydown', 'Enter');
  assert.deepEqual(angles, [179, 65]);
  await key(forward, 'keyup', 'Enter');
  assert.deepEqual(angles, [179, 65, 25]);
  await key(forward, 'keydown', 'Enter');
  await act(async () => window.dispatchEvent(new window.Event('blur')));
  await key(forward, 'keyup', 'Enter');
  assert.deepEqual(angles, [179, 65, 25, 65]);
});

test('adding Servo arrows reuses the slider reference and honors each tile’s bounds', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  let originReads = 0;
  const angles: number[] = [];
  const motor = Object.assign(fakeDevice('A'), {
    requestUpdate: () => {
      originReads += 1;
      motor.emit('rotate', { degrees: originReads === 1 ? 25 : 400 });
    },
    gotoAngle: async (target: number) => {
      angles.push(target);
      return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
    },
  });
  fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', {
    options: { ...servoOptions, autoReturnToCenter: true },
  });
  await act(() => view.api.position(slider.id, 0));
  const arrows = await create(view, 'arrows', 'A', {
    options: { ...servoOptions, servoMax: 60 },
  });
  const forward = button('Forward');
  assert.equal((forward as HTMLButtonElement).disabled, false);
  assert.equal(originReads, 1);
  const input = query(document, 'input[aria-label="Servo target position"]');
  assert.equal(input.getAttribute('aria-valuetext'), 'Requested -20 degrees');
  await key(input, 'keydown', 'End');
  await setInput(input, 100);
  await click(forward);
  await key(input, 'keyup', 'End');
  assert.deepEqual(angles, [5, 65, 85]);
  assert.equal(input.getAttribute('aria-valuetext'), 'Requested 60 degrees');
  assert.equal(originReads, 1);
  await act(() => view.api.update(arrows.id, { options: { mode: 'speed' } }));
  assert.equal(input.getAttribute('aria-valuetext'), 'Requested 60 degrees');
  await act(() => view.api.update(arrows.id, { options: { mode: 'servo' } }));
  await act(() => view.api.remove(arrows.id));
  assert.equal(input.getAttribute('aria-valuetext'), 'Requested 60 degrees');
  await act(() => view.api.position(slider.id, 0));
  assert.deepEqual(angles, [5, 65, 85, 5]);
  assert.equal(originReads, 1);
});

test('removing a sibling during a move exposes the invalidated Servo reference', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  let finish: ((result: number) => void) | undefined;
  const motor = Object.assign(fakeDevice('A'), {
    rotateByDegrees: () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  });
  fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', { options: servoOptions });
  const arrows = await create(view, 'arrows', 'A', { options: servoOptions });
  let move: Promise<void> | undefined;
  await act(async () => {
    move = view.api.position(slider.id, 1);
  });
  assert.ok(finish);
  await act(() => view.api.remove(arrows.id));
  await act(async () => {
    finish?.(CONSTS.CommandFeedback.EXECUTION_COMPLETED);
    await move;
  });
  assert.equal(motor.speeds.at(-1)?.[0], 0);
  assert.match(
    document.body.textContent ?? '',
    /Select Servo again to reset zero/
  );
  await act(async () => {
    await assert.rejects(view.api.position(slider.id, 0), /virtual zero/);
  });
});

test('Servo slider has no Stop button and Stop all clears its queued return', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const commands: number[][] = [];
  let complete: (() => void) | undefined;
  const motor = Object.assign(fakeDevice('A'), {
    rotateByDegrees: (degrees: number, speed: number) => {
      commands.push([degrees, speed]);
      return new Promise<number>((resolve) => {
        complete = () => resolve(CONSTS.CommandFeedback.EXECUTION_COMPLETED);
      });
    },
  });
  fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  await create(view, 'slider', 'A', {
    options: { ...servoOptions, autoReturnToCenter: true },
  });
  const slider = query(document, 'input[aria-label="Servo target position"]');
  assert.ok(
    !Array.from(document.querySelectorAll('button')).some(
      (element) => element.textContent?.trim() === 'Stop'
    )
  );
  await key(slider, 'keydown', 'End');
  await setInput(slider, 100);
  await key(slider, 'keyup', 'End');
  assert.deepEqual(commands, [[40, 15]]);
  await act(async () => complete?.());
  assert.deepEqual(commands, [
    [40, 15],
    [40, -15],
  ]);
  await act(async () => complete?.());
  assert.match(
    slider.getAttribute('aria-valuetext') ?? '',
    /Requested 0 degrees/
  );
  await key(slider, 'keydown', 'Home');
  await setInput(slider, 0);
  await key(slider, 'keyup', 'Home');
  await act(() => view.api.stopAll());
  await act(async () => complete?.());
  assert.deepEqual(commands, [
    [40, 15],
    [40, -15],
    [20, -15],
  ]);
});

test('relative driver is exposed only for supported hubs and is reset on rebind and disconnect', async (t) => {
  const view = await mount(t);
  const calls: number[][] = [];
  const motor = (port: string) =>
    Object.assign(fakeDevice(port), {
      rotateByDegrees: async (...args: [number, number, boolean]) => {
        calls.push([args[0], args[1]]);
        return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
      },
    });
  const hub = fakeHub(undefined, undefined, { A: motor('A'), B: motor('B') });
  await act(() => view.api.addHub());
  const servo = await create(view, 'slider', 'A', { options: servoOptions });
  await act(async () => {
    await view.api.activateServo(servo.id);
    await view.api.position(servo.id, 0);
    await view.api.position(servo.id, 1);
    await view.api.update(servo.id, { port: 'B' });
    await assert.rejects(view.api.position(servo.id, 1), /virtual zero/);
    await view.api.activateServo(servo.id);
  });
  assert.deepEqual(calls, [
    [20, -15],
    [60, 15],
  ]);
  await act(() => view.api.disconnect(hub.uuid));
  fakeHub(undefined, undefined, { A: motor('A'), B: motor('B') });
  await act(() => view.api.addHub());
  await act(async () => {
    await assert.rejects(view.api.position(servo.id, 1), /virtual zero/);
  });
  assert.equal(calls.length, 2);
  const wedo = fakeHub('wedo', CONSTS.HubType.WEDO2_SMART_HUB, {
    A: motor('A'),
  });
  await act(() => view.api.addHub());
  assert.equal(
    view.api.devices.get(wedo.uuid)?.get('A')?.servoDriver,
    undefined
  );
  assert.ok(
    !getControlChoices(view.api.devices.get(wedo.uuid)?.get('A')).some(
      (choice: { motorMode?: string }) => choice.motorMode === 'step'
    )
  );
});

test('Stop aborts an in-flight relative command and discards its late completion', async (t) => {
  const view = await mount(t);
  let finish: ((result: number) => void) | undefined;
  const motor = Object.assign(fakeDevice('A'), {
    rotateByDegrees: () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  });
  fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  const servo = await create(view, 'slider', 'A', { options: servoOptions });
  await act(() => view.api.activateServo(servo.id));
  let move: Promise<void>;
  await act(async () => {
    move = view.api.position(servo.id, 1);
  });
  await act(async () => {
    assert.ok(finish);
    await view.api.speed(servo.id, 0);
    finish(CONSTS.CommandFeedback.EXECUTION_COMPLETED);
    await move;
    await assert.rejects(view.api.position(servo.id, 0), /virtual zero/);
  });
  assert.equal(motor.speeds.at(-1)?.[0], 0);
});

function fake() {
  const calls: string[] = [];
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
    absoluteAngle: {
      min: -20,
      max: 40,
      readPosition: async () => 0,
      gotoAngle: async (target) => {
        calls.push(`move:${target}`);
      },
    },
    stop: async () => {
      calls.push('stop');
    },
  };
  return {
    driver,
    calls,
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

test('Verified Step path is gated on an absolute command, feedback and a valid range', () => {
  const adapter = fake();
  const device = {
    uuid: 'hub',
    mac: 'hub',
    port: 'A',
    type: { num: 0, text: '', compact: '' },
    connected: true,
    events: {},
    commands: {},
    positionDriver: adapter.driver,
  };
  const { absoluteAngle } = adapter.driver;
  assert.equal(motorPositionCapabilities(device).absolutePosition, true);
  for (const range of [
    { ...absoluteAngle, min: 40 },
    { ...absoluteAngle, max: Infinity },
    { ...absoluteAngle, readPosition: undefined },
    { ...absoluteAngle, gotoAngle: undefined, rotateByDegrees: async () => {} },
  ]) {
    assert.equal(
      Reflect.apply(motorPositionCapabilities, undefined, [
        {
          ...device,
          positionDriver: { ...adapter.driver, absoluteAngle: range },
        },
      ]).absolutePosition,
      false
    );
  }
  assert.equal(controlOptions('arrows').mode, 'speed');
  assert.throws(
    () => controlOptions('slider', { mode: 'step' }),
    /not supported/
  );
});

test('Verified position controller clamps absolute targets and never moves without in-range feedback', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  await motor.moveFraction(-Number.MAX_VALUE);
  await motor.moveFraction(0.5);
  await motor.moveFraction(Number.MAX_VALUE);
  for (const feedback of [NaN, -21, 41]) {
    adapter.driver.absoluteAngle.readPosition = async () => feedback;
    await assert.rejects(motor.moveFraction(0.5), /feedback/);
  }
  assert.deepEqual(
    adapter.calls.filter((call) => call.startsWith('move:')),
    ['move:-20', 'move:10', 'move:40']
  );
});

test('reference loss invalidates limits and stops the adapter', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  const stops = adapter.calls.filter((call) => call === 'stop').length;
  adapter.lose();
  await flush();
  assert.equal(
    adapter.calls.filter((call) => call === 'stop').length,
    stops + 1
  );
  await assert.rejects(() => motor.moveFraction(0), /reference/);
});

test('a later move waits for every outstanding stop', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
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
  assert.equal(adapter.calls.includes('move:40'), false);
  assert.ok(release);
  release();
  await firstStop;
  await move;
  assert.equal(adapter.calls.includes('move:40'), true);
});

test('stop cancels an in-flight move even if its completion never arrives', async () => {
  const adapter = fake();
  const motor = new PositionMotor(
    adapter.driver,
    () => true,
    () => {}
  );
  let signal: AbortSignal | undefined;
  adapter.driver.absoluteAngle.gotoAngle = (_target, input) => {
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
  assert.equal(adapter.calls.length, 0);
});

test('unsupported devices reject Servo creation without commands', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const device = view.api.devices.get(hub.uuid)?.get('A');
  assert.deepEqual(
    Array.from(getControlChoices(device))
      .map((choice) => choice.motorMode)
      .filter(Boolean),
    ['speed', 'speed']
  );
  await act(async () => {
    await assert.rejects(
      view.api.create({
        type: 'arrows',
        uuid: hub.uuid,
        port: 'A',
        options: { mode: 'servo', servoMin: -20, servoMax: 40 },
      }),
      /not available/
    );
  });
  assert.equal(view.api.controls.size, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
});

test('Step is offered on relative, absolute-only, and dual-angle motors', async (t) => {
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const relativeMoves: number[][] = [];
  const absoluteTargets: number[] = [];
  let position = 175;
  const rotateByDegrees = async (degrees: number, speed: number) => {
    relativeMoves.push([degrees, speed]);
    return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
  };
  const absolute = (port: string) => {
    const device = Object.assign(fakeDevice(port), {
      requestUpdate: () => device.emit('rotate', { degrees: position }),
      gotoAngle: async (target: number) => {
        absoluteTargets.push(target);
        position = target;
        return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
      },
    });
    return device;
  };
  const hub = fakeHub(undefined, undefined, {
    A: Object.assign(fakeDevice('A'), { rotateByDegrees }),
    B: absolute('B'),
    C: Object.assign(absolute('C'), { rotateByDegrees }),
  });
  await act(() => view.api.addHub());
  for (const [port, direction] of [
    ['A', -1],
    ['B', 1],
    ['C', 1],
  ] as const) {
    const choices = getControlChoices(
      view.api.devices.get(hub.uuid)?.get(port)
    );
    assert.ok(
      choices.some(
        (choice: { motorMode?: string }) => choice.motorMode === 'servo'
      )
    );
    assert.ok(
      choices.some(
        (choice: { motorMode?: string }) => choice.motorMode === 'step'
      )
    );
    const step = await create(view, 'arrows', port, {
      options: { mode: 'step', angle: 12 },
    });
    await act(() => view.api.step(step.id, direction));
    if (port === 'B') await act(() => view.api.step(step.id, -1));
  }
  assert.deepEqual(relativeMoves, [
    [12, -15],
    [12, 15],
  ]);
  assert.deepEqual(absoluteTargets, [179, 167]);
});

test('Stop all cancels angle Step while waiting for absolute feedback', async (t) => {
  const view = await mount(t);
  let reading = false;
  const targets: number[] = [];
  const motor = Object.assign(fakeDevice('A'), {
    requestUpdate: () => {
      reading = true;
    },
    gotoAngle: async (target: number) => {
      targets.push(target);
      return CONSTS.CommandFeedback.EXECUTION_COMPLETED;
    },
  });
  fakeHub(undefined, undefined, { A: motor });
  await act(() => view.api.addHub());
  const step = await create(view, 'arrows', 'A', { options: { mode: 'step' } });
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = view.api.step(step.id, 1);
    await flush();
  });
  assert.equal(reading, true);
  await act(() => view.api.stopAll());
  await act(async () => {
    motor.emit('rotate', { degrees: 25 });
    await pending;
  });
  assert.deepEqual(targets, []);
});

test('Step creation, feedback, limits, repeated inputs and Stop share the position path', async (t) => {
  const adapter = fake();
  let position = 35;
  adapter.driver.finiteAngle = {
    minDegrees: 1,
    maxDegrees: 90,
  };
  adapter.driver.absoluteAngle.readPosition = async () => position;
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
  assert.equal(
    document.querySelector('[aria-label="Choose Motor slider - Step"]'),
    null
  );
  await click(button('Choose Motor arrows - Step'));
  await click(button('Create Motor arrows - Step, 2 by 1'));
  assert.equal(adapter.calls.length, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.ok(document.querySelector('[data-motor-mode="step"]'));
  await click(button('Configure Motor arrows'));
  assert.match(
    document.querySelector('[role="dialog"]')?.textContent ?? '',
    /Verified absolute angle range/
  );
  assert.doesNotMatch(
    document.querySelector('[role="dialog"]')?.textContent ?? '',
    /calibrat|seek/i
  );
  await click(button('Cancel'));
  let signal: AbortSignal | undefined;
  adapter.driver.absoluteAngle.gotoAngle = (target, input) => {
    adapter.calls.push(`move:${target}`);
    signal = input;
    return new Promise<void>(() => {});
  };
  const forward = button('Forward');
  await key(forward, 'keydown', 'Enter');
  assert.equal(adapter.calls.at(-1), 'move:40');
  await key(forward, 'keydown', 'Enter', { repeat: true });
  await click(button('Backward'));
  assert.equal(
    adapter.calls.filter((call) => call.startsWith('move:')).length,
    1
  );
  await key(forward, 'keyup', 'Enter');
  await click(button('Stop'));
  assert.equal(signal?.aborted, true);
  position = -18;
  adapter.driver.absoluteAngle.gotoAngle = async (target) => {
    adapter.calls.push(`move:${target}`);
  };
  await click(button('Backward'));
  assert.equal(adapter.calls.at(-1), 'move:-20');
  position = 0;
  await click(forward);
  assert.equal(adapter.calls.at(-1), 'move:15');
});

test('a Step-only motor can switch an existing arrow from Speed to Step and back', async (t) => {
  const adapter = fake();
  adapter.driver.finiteAngle = { minDegrees: 1, maxDegrees: 90 };
  const view = await mount(t, {
    positionDriverFactory: () => adapter.driver,
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
  const arrows = await create(view, 'arrows', 'A');
  for (const [current, next] of [
    ['speed', 'step'],
    ['step', 'speed'],
  ]) {
    await click(button('Configure Motor arrows'));
    const select = query(document, '[role="dialog"] select');
    assert.ok(select instanceof window.HTMLSelectElement);
    assert.equal(select.value, current);
    assert.deepEqual(
      Array.from(select.options, (option) => option.value),
      ['speed', 'step']
    );
    await setInput(select, next);
    await click(button('Save'));
    const saved = view.api.controls.get(arrows.id);
    assert.ok(saved?.type === 'arrows');
    assert.equal(saved.options.mode, next);
  }
});

test('Step rejects unsupported adapters and invalid or unsupported angles', async (t) => {
  const adapter = fake();
  const view = await mount(t, {
    positionDriverFactory: () => adapter.driver,
  });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await act(async () => {
    await assert.rejects(
      view.api.create({
        type: 'arrows',
        uuid: hub.uuid,
        port: 'A',
        options: { mode: 'step' },
      }),
      /not available/
    );
  });
  adapter.driver.finiteAngle = {
    minDegrees: 1,
    maxDegrees: 90,
  };
  for (const angle of [0, -1, NaN, Infinity, 91]) {
    await act(async () => {
      await assert.rejects(
        view.api.create({
          type: 'arrows',
          uuid: hub.uuid,
          port: 'A',
          options: { mode: 'step', angle },
        }),
        /angle/i
      );
    });
  }
  assert.equal(adapter.calls.length, 0);
});

test('Stop cancels pending Step feedback and late feedback cannot move', async (t) => {
  const adapter = fake();
  let release: ((position: number) => void) | undefined;
  adapter.driver.finiteAngle = {
    minDegrees: 1,
    maxDegrees: 90,
  };
  adapter.driver.absoluteAngle.readPosition = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const view = await mount(t, {
    positionDriverFactory: () => adapter.driver,
  });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.ports.push('D');
  await act(() => view.api.addHub());
  const step = await create(view, 'arrows', 'A', { options: { mode: 'step' } });
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = view.api.step(step.id, 1);
  });
  assert.ok(release);
  await act(async () => {
    await view.api.speed(step.id, 0);
    await pending;
  });
  await act(async () => {
    release?.(0);
    await flush();
  });
  assert.equal(
    adapter.calls.some((call) => call.startsWith('move:')),
    false
  );
  for (const invalid of [NaN, 41]) {
    adapter.driver.absoluteAngle.readPosition = async () => invalid;
    await act(async () => {
      await assert.rejects(view.api.step(step.id, 1), /feedback/);
    });
  }
  adapter.driver.absoluteAngle.readPosition = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  await act(async () => {
    pending = view.api.step(step.id, -1);
  });
  await act(async () => {
    await view.api.update(step.id, { port: 'D' });
    await pending;
  });
  await act(async () => {
    release?.(0);
    await flush();
  });
  assert.equal(
    adapter.calls.some((call) => call.startsWith('move:')),
    false
  );
  await act(async () => {
    await view.api.disconnect(hub.uuid);
  });
  const replacement = fakeHub();
  replacement.devices.D = fakeDevice('D');
  replacement.ports.push('D');
  await act(() => view.api.addHub());
  assert.equal(
    adapter.calls.some((call) => call.startsWith('move:')),
    false
  );
});
