import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { asHtml, asInput, present, query } from './helpers/dom.ts';
import {
  controlOf,
  mount,
  fakeHub,
  fakeDevice,
  create,
  loadSource,
  input,
  pointer,
  key,
} from './helpers/controls.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const render = () => React.createElement(Grid);

test('direction changes keep the requested speed visible while feedback is pending', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view);
  await create(view, 'slider', 'A', {
    options: { reverseRotation: true },
  });
  const slider = asInput(document.querySelector('input[type="range"]'));
  const handle = query(document, '[data-slider-handle]');
  let finish: (() => void) | undefined;
  hub.devices.A.setSpeed = async (speed) => {
    hub.devices.A.speeds.push([speed]);
    if (speed < 0)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  };
  await pointer(slider, 'pointerdown');
  await input(slider, 40);
  await input(slider, 0);
  await input(slider, -40);
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], -40);
  assert.equal(slider.value, '-40');
  assert.equal(handle.textContent, '-40%');
  assert.deepEqual(
    [...document.querySelectorAll('input[type="range"]')].map(
      (element) => asInput(element).value
    ),
    ['-40', '40']
  );
  await act(async () => present(finish)());
  await pointer(slider, 'pointerup');
  assert.equal(slider.value, '-40');
});

test('older feedback cannot reset a newer slider request and rejected reverse restores confirmed speed', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view);
  const slider = asInput(document.querySelector('input[type="range"]'));
  let forward: (() => void) | undefined;
  let reverse: ((reason: Error) => void) | undefined;
  hub.devices.A.setSpeed = async (speed) => {
    hub.devices.A.speeds.push([speed]);
    if (speed > 0)
      await new Promise<void>((resolve) => {
        forward = resolve;
      });
    else if (speed < 0)
      await new Promise<void>((_resolve, reject) => {
        reverse = reject;
      });
  };
  await input(slider, 40);
  await input(slider, 0);
  await input(slider, -40);
  assert.equal(slider.value, '-40');
  await act(() => present(forward)());
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], -40);
  assert.equal(slider.value, '-40');
  await act(() => present(reverse)(new Error('Reverse failed')));
  assert.equal(slider.value, '40');
  assert.match(document.body.textContent, /Reverse failed/);
});

test('slider starts centered and sends bounded speed changes, not release commands', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', { w: 2, h: 1 });
  let slider = document.querySelector('input[type="range"]');
  assert.equal(asInput(slider).min, '-100');
  assert.equal(asInput(slider).max, '100');
  assert.equal(asInput(slider).step, '1');
  assert.equal(asInput(slider).value, '0');
  assert.equal(present(slider).getAttribute('aria-orientation'), 'horizontal');
  const marks = [...document.querySelectorAll('[data-slider-mark]')];
  assert.deepEqual(
    marks.map((mark) => Number(asHtml(mark).dataset.sliderMark)),
    Array.from({ length: 21 }, (_, index) => index * 10 - 100)
  );
  assert.equal(window.getComputedStyle(marks[0]).width, '1px');
  const handle = document.querySelector('[data-slider-handle]');
  assert.equal(present(handle).querySelector('button'), null);
  assert.equal(
    document.querySelector('button[aria-label^="Stop motor"]'),
    null
  );
  assert.match(present(handle).textContent, /0%/);
  const handleStyle = window.getComputedStyle(present(handle));
  assert.equal(handleStyle.width, '48px');
  assert.equal(handleStyle.height, '28px');
  assert.equal(handleStyle.backgroundColor, 'rgb(255, 237, 0)');
  assert.equal(handleStyle.color, 'rgb(0, 0, 0)');
  assert.equal(
    window.getComputedStyle(present(handle)).left,
    window.getComputedStyle(marks[10]).left
  );
  assert.equal(hub.devices.A.speeds.length, 0);
  for (const value of [-100, -25, 0, 1, 60, 100]) {
    await input(present(slider), value);
    assert.equal(
      present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
      value
    );
    assert.equal(asInput(slider).value, String(value));
    assert.equal(present(slider).getAttribute('aria-valuetext'), `${value}%`);
    assert.match(present(handle).textContent, new RegExp(`${value}%`));
  }
  assert.equal(
    window.getComputedStyle(present(handle)).left,
    window.getComputedStyle(marks[20]).left
  );
  await pointer(present(slider), 'pointerup', { pointerType: 'touch' });
  await act(async () => asInput(slider).blur());
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [-100, -25, 0, 1, 60, 100]
  );
  await act(() => view.api.update(control.id, { w: 1, h: 2 }));
  slider = document.querySelector('input[type="range"]');
  assert.equal(present(slider).getAttribute('aria-orientation'), 'vertical');
  assert.equal(window.getComputedStyle(present(slider)).direction, 'rtl');
  assert.equal(window.getComputedStyle(marks[0]).height, '1px');
  assert.equal(asInput(slider).value, '100');
  assert.equal(hub.devices.A.speeds.length, 6);
  assert.equal(
    window.getComputedStyle(present(handle)).top,
    window.getComputedStyle(marks[20]).top
  );
  await input(present(slider), 0);
  assert.equal(asInput(slider).value, '0');
  assert.match(present(handle).textContent, /0%/);
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [-100, -25, 0, 1, 60, 100, 0]
  );
});

test('reversed sliders map displayed speeds and shared physical telemetry without reversing other controls', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const normal = await create(view);
  const reversed = await create(view, 'slider', 'A', {
    options: { reverseRotation: true },
  });
  const arrows = await create(view, 'arrows');
  const stop = await create(view, 'stop');
  const sliders = [...document.querySelectorAll('input[type="range"]')];
  await act(() => view.api.speed(normal.id, 30));
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['30', '-30']
  );
  await pointer(sliders[1], 'pointerdown');
  await input(sliders[1], 40);
  await pointer(sliders[1], 'pointerup');
  assert.equal(
    present(present(view.api.devices.get(hub.uuid)).get('A')).commands.speed,
    -40
  );
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['-40', '40']
  );
  assert.match(
    query(document, `[data-control-id="${arrows.id}"]`).textContent,
    /-40%/
  );
  await act(() => view.api.speed(stop.id, 0));
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['0', '0']
  );
  hub.devices.A.setSpeed = async () => {
    throw new Error('Motor busy');
  };
  await pointer(sliders[1], 'pointerdown');
  await input(sliders[1], 70);
  await pointer(sliders[1], 'pointerup');
  assert.match(document.body.textContent, /Motor busy/);
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['0', '0']
  );
  assert.equal(
    controlOf(view.api.controls.get(reversed.id), 'slider').options
      .reverseRotation,
    true
  );
});

test('slider reversal changes only new interactions and momentary releases still send zero', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', {
    options: { resetOnRelease: true },
  });
  const slider = document.querySelector('input[type="range"]');
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 40);
  await act(() =>
    view.api.update(control.id, { options: { reverseRotation: true } })
  );
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [40]
  );
  await input(present(slider), 50);
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 50);
  await pointer(present(slider), 'pointerup');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 50);
  await pointer(present(slider), 'pointercancel');
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [40, 50, 0, -50, 0]
  );
});

test('slider controls share successful speed state and show command failures', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view);
  await create(view, 'slider', 'A', { w: 2, h: 1 });
  const sliders = [...document.querySelectorAll('input[type="range"]')];
  await input(sliders[0], 40);
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['40', '40']
  );
  hub.devices.A.setSpeed = async () => {
    throw new Error('Motor busy');
  };
  await input(sliders[1], 70);
  assert.match(document.body.textContent, /Motor busy/);
  assert.deepEqual(
    sliders.map((slider) => asInput(slider).value),
    ['40', '40']
  );
  for (const handle of document.querySelectorAll('[data-slider-handle]')) {
    assert.match(handle.textContent, /40%/);
    assert.doesNotMatch(handle.textContent, /70%/);
  }
});

test('momentary sliders stop on release, cancellation, lost capture and keyboard/focus loss', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'slider', 'A', { options: { resetOnRelease: true } });
  const slider = document.querySelector('input[type="range"]');
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    await pointer(present(slider), 'pointerdown', { pointerType: 'touch' });
    await input(present(slider), 60);
    await pointer(present(slider), 'pointerup', {
      pointerId: 2,
      isPrimary: false,
    });
    assert.equal(asInput(slider).value, '60');
    await pointer(present(slider), ending);
    assert.equal(asInput(slider).value, '0', ending);
  }
  await key(present(slider), 'keydown', 'ArrowUp');
  await input(present(slider), 1);
  await key(present(slider), 'keydown', 'ArrowUp', { repeat: true });
  await input(present(slider), 2);
  await key(present(slider), 'keyup', 'ArrowLeft');
  assert.equal(asInput(slider).value, '2');
  await key(present(slider), 'keyup', 'ArrowUp');
  assert.equal(asInput(slider).value, '0');
  await act(() => asHtml(slider).focus());
  await key(present(slider), 'keydown', 'Home');
  await input(present(slider), -100);
  await act(() => asInput(slider).blur());
  assert.equal(asInput(slider).value, '0');
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 30);
  await act(() => window.dispatchEvent(new window.Event('blur')));
  assert.equal(asInput(slider).value, '0');
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [60, 0, 60, 0, 60, 0, 1, 2, 0, -100, 0, 30, 0]
  );
});

test('slider option changes affect future gestures and stale releases cannot stop a new binding', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const control = await create(view);
  const slider = document.querySelector('input[type="range"]');
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 45);
  await act(() =>
    view.api.update(control.id, { options: { resetOnRelease: true } })
  );
  assert.equal(asInput(slider).value, '45');
  await pointer(present(slider), 'pointerup');
  assert.equal(asInput(slider).value, '45');
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 55);
  await act(() =>
    view.api.update(control.id, { options: { resetOnRelease: false } })
  );
  assert.equal(asInput(slider).value, '55');
  await pointer(present(slider), 'pointerup');
  assert.equal(asInput(slider).value, '0');
  await act(() =>
    view.api.update(control.id, { options: { resetOnRelease: true } })
  );
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 65);
  await act(() => view.api.update(control.id, { port: 'D' }));
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  await pointer(present(slider), 'pointerdown', { pointerId: 2 });
  await input(present(slider), 35);
  await pointer(present(slider), 'pointerup', { pointerId: 1 });
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [35]
  );
  await pointer(present(slider), 'pointerup', { pointerId: 2 });
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [35, 0]
  );
});
