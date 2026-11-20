import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { asInput, present } from './helpers/dom.ts';
import {
  mount,
  fakeHub,
  fakeDevice,
  create,
  loadSource,
  input,
  click,
  button,
  DeviceType,
  lego,
} from './helpers/controls.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Grid),
    React.createElement(Modal)
  );
const tile = (id: string) =>
  document.querySelector(`[data-control-id="${id}"]`);
const stopButton = (id: string) =>
  present(tile(id)).querySelector('button[aria-label^="Stop motor on "]');

test('chooser creates both Stop sizes without sending commands', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  for (const [w, h] of [
    [1, 1],
    [2, 2],
  ]) {
    await act(() =>
      view.api.openModal('createControl', { uuid: hub.uuid, port: 'A' })
    );
    await click(button('Choose Stop'));
    assert.ok(button('Create Stop, 1 by 1'));
    assert.ok(button('Create Stop, 2 by 2'));
    assert.equal(hub.devices.A.speeds.length, 0);
    await click(button(`Create Stop, ${w} by ${h}`));
    const control = [...view.api.controls.values()].at(-1);
    assert.equal(present(control).type, 'stop');
    assert.equal(present(control).port, 'A');
    assert.deepEqual([present(control).w, present(control).h], [w, h]);
    assert.equal(
      present(stopButton(present(control).id)).getAttribute('type'),
      'button'
    );
    assert.equal(
      present(stopButton(present(control).id)).getAttribute('aria-label'),
      'Stop motor on Test hub, port A'
    );
    const style = window.getComputedStyle(
      present(stopButton(present(control).id))
    );
    assert.equal(style.borderRadius, '50%');
    assert.equal(style.aspectRatio, '1 / 1');
    assert.equal(style.backgroundColor, 'rgb(222, 0, 41)');
    assert.equal(style.borderTopColor, 'rgb(255, 237, 0)');
    assert.equal(hub.devices.A.speeds.length, 0);
  }
  const first = [...view.api.controls.values()][0];
  await click(present(stopButton(first.id)));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [0]
  );
});

test('Stop affects only its bound motor, synchronizes sliders, and is not latched', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.ports.push('D');
  await act(() => view.api.addHub());
  const first = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const second = await create(view, 'slider', 'D', { w: 2, h: 1 });
  const stop = await create(view, 'stop', 'A', { w: 1, h: 1 });
  const firstSlider = present(tile(first.id)).querySelector(
    'input[type="range"]'
  );
  const secondSlider = present(tile(second.id)).querySelector(
    'input[type="range"]'
  );
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(hub.devices.D.speeds.length, 0);
  await input(present(firstSlider), 40);
  await input(present(secondSlider), 65);
  await click(present(stopButton(stop.id)));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [40, 0]
  );
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [65]
  );
  assert.equal(asInput(firstSlider).value, '0');
  assert.equal(asInput(secondSlider).value, '65');
  await input(present(firstSlider), -20);
  assert.equal(asInput(firstSlider).value, '-20');
  await click(present(stopButton(stop.id)));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [40, 0, -20, 0]
  );
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [65]
  );
});

test('failed Stop remains visible and does not report a successful motor state', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const stop = await create(view, 'stop', 'A', { w: 2, h: 2 });
  const range = present(tile(slider.id)).querySelector('input');
  await input(present(range), 55);
  const write = hub.devices.A.setSpeed;
  hub.devices.A.setSpeed = async () => {
    throw new Error('Stop failed');
  };
  await click(present(stopButton(stop.id)));
  assert.match(present(tile(stop.id)).textContent, /Stop failed/);
  assert.equal(present(range).value, '55');
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    55
  );
  hub.devices.A.setSpeed = write;
  await click(present(stopButton(stop.id)));
  assert.equal(present(range).value, '0');
  assert.doesNotMatch(present(tile(stop.id)).textContent, /Stop failed/);
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [55, 0]
  );
});

test('Stop rejects stale, incompatible, and disconnected motor targets', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const stop = await create(view, 'stop', 'A', { w: 1, h: 1 });
  const { connectionId } = present(
    present(view.api.devices.get(hub.uuid)).get('A')
  );
  const replacement = fakeDevice('A');
  await act(() => {
    hub.devices.A = replacement;
    hub.emit('attach', replacement);
  });
  await act(async () => {
    await assert.rejects(
      view.api.speed(stop.id, 0, {
        uuid: hub.uuid,
        port: 'A',
        connectionId: present(connectionId),
      }),
      /Motor connection changed/
    );
  });
  assert.equal(replacement.speeds.length, 0);
  await click(present(stopButton(stop.id)));
  assert.deepEqual(
    replacement.speeds.map((call) => call[0]),
    [0]
  );
  const sensor = fakeDevice('A', DeviceType.COLOR_DISTANCE_SENSOR);
  await act(() => {
    hub.devices.A = sensor;
    hub.emit('attach', sensor);
  });
  assert.equal(stopButton(stop.id), null);
  assert.match(present(tile(stop.id)).textContent, /Different device attached/);
  await act(async () => {
    await assert.rejects(view.api.speed(stop.id, 0), /not compatible/);
  });
  assert.equal(sensor.speeds.length, 0);
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(stopButton(stop.id), null);
  assert.match(present(tile(stop.id)).textContent, /Device disconnected/);
});

test('Stop permits only zero and supersedes older queued motor commands', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const slider = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const stop = await create(view, 'stop', 'A', { w: 1, h: 1 });
  await act(async () => {
    await assert.rejects(view.api.speed(stop.id, 1), /only support zero/);
    await assert.rejects(view.api.speed(stop.id, -1), /only support zero/);
  });
  assert.equal(hub.devices.A.speeds.length, 0);
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
    running = view.api.speed(slider.id, 50);
  });
  let older: Promise<unknown> | undefined;
  let stopping: Promise<unknown> | undefined;
  let duplicate: Promise<unknown> | undefined;
  await act(async () => {
    older = view.api.speed(slider.id, 80);
    stopping = view.api.speed(stop.id, 0);
    duplicate = view.api.speed(stop.id, 0);
  });
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [50]
  );
  await act(async () => {
    present(finish)();
    await Promise.all([running, older, stopping, duplicate]);
  });
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [50, 0]
  );
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    0
  );
  await act(() => view.api.speed(slider.id, 25));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [50, 0, 25]
  );
});

test('failed stops preserve Stop tile removal and rebind for retry', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.ports.push('D');
  await act(() => view.api.addHub());
  const first = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const second = await create(view, 'slider', 'D', { w: 2, h: 1 });
  const stop = await create(view, 'stop', 'A', { w: 1, h: 1 });
  await act(() => view.api.speed(first.id, 70));
  const write = hub.devices.A.setSpeed;
  hub.devices.A.setSpeed = async () => {
    throw new Error('Stop failed');
  };
  await act(async () => {
    await assert.rejects(
      view.api.update(stop.id, { port: 'D' }),
      /Stop failed/
    );
    await assert.rejects(view.api.remove(stop.id), /Stop failed/);
  });
  assert.equal(present(view.api.controls.get(stop.id)).port, 'A');
  hub.devices.A.setSpeed = write;
  await act(() => view.api.update(stop.id, { port: 'D' }));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [70, 0]
  );
  assert.equal(hub.devices.D.speeds.length, 0);
  await act(() => view.api.speed(second.id, 35));
  await act(() => view.api.remove(stop.id));
  assert.equal(view.api.controls.has(stop.id), false);
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [35, 0]
  );
});
