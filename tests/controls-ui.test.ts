import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { asButton, asInput, html, present, query } from './helpers/dom.ts';
import {
  controlOf,
  mount,
  fakeHub,
  fakeDevice,
  create,
  loadSource,
  input,
  pointer,
  click,
  button,
  visibleText,
  DeviceType,
} from './helpers/controls.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const Hub = loadSource('components/modules/hubs/Hub').default;
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Hub, { uuid: 'hub-one' }),
    React.createElement(Grid),
    React.createElement(Modal)
  );
const field = (label: string) => {
  const node = [...document.querySelectorAll('label')].find(
    (element) =>
      visibleText(element)
        .replace(/\s*\*\s*$/, '')
        .trim() === label
  );
  assert.ok(node, `Field ${label} exists`);
  return document.getElementById(node.htmlFor) || node.querySelector('input');
};
const key = async (
  element: EventTarget,
  type: string,
  value: string,
  options: KeyboardEventInit = {}
) =>
  act(async () => {
    element.dispatchEvent(
      new window.KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: value,
        ...options,
      })
    );
  });
const submit = async () =>
  act(async () => {
    query(document, '[role="dialog"] form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
  });
const boardGeometry = () => {
  const board = document.querySelector('[data-control-board]');
  present(board).getBoundingClientRect = () =>
    new window.DOMRect(-200, 50, 1440, 864);
  return board;
};

test('color chooser creates live named swatches alongside distance and supports dedicated sensors', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D', DeviceType.TECHNIC_COLOR_SENSOR);
  await act(() => view.api.addHub());
  const subscriptions = () =>
    hub.subscriptions.filter((call) => call[0] === hub.devices.B.portId);
  await act(() =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'B' })
  );
  await click(button('Choose Color'));
  assert.equal(subscriptions().length, 0);
  await click(button('Create Color, 1 by 1'));
  const color = [...view.api.controls.values()][0];
  const tile = () => document.querySelector(`[data-control-id="${color.id}"]`);
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  const distance = await create(view, 'distance', 'B');
  const distanceTile = document.querySelector(
    `[data-control-id="${distance.id}"]`
  );
  assert.equal(subscriptions().length, 1);
  for (const [value, label, swatch] of [
    [0, 'Detected color: Black', 'rgb(23, 23, 23)'],
    [10, 'Detected color: White', 'rgb(255, 255, 255)'],
    [9, 'Detected color: Red', 'rgb(229, 57, 53)'],
    [255, 'No color detected'],
    [99, 'Unknown color'],
  ] as const) {
    await act(() =>
      hub.devices.B.emit('colorAndDistance', { color: value, distance: 81 })
    );
    const indicator = present(tile()).querySelector(
      `[role="img"][aria-label="${label}"]`
    );
    assert.ok(indicator, label);
    if (swatch)
      assert.equal(
        window.getComputedStyle(query(indicator, '[aria-hidden="true"]'))
          .backgroundColor,
        swatch
      );
    assert.ok(
      present(distanceTile).querySelector(
        '[aria-label="Distance indicator: Far"]'
      )
    );
  }
  await act(() => view.api.update(color.id, { w: 2, h: 2, x: 3 }));
  await act(() => view.api.update(color.id, { port: 'D' }));
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  await act(() => hub.devices.D.emit('color', { color: 3 }));
  assert.ok(
    present(tile()).querySelector('[aria-label="Detected color: Blue"]')
  );
  assert.equal(subscriptions().length, 1);
  assert.equal(
    hub.unsubscriptions.filter((call) => call[0] === hub.devices.B.portId)
      .length,
    0
  );
});

test('tilt pitch references move with readings and reversals while rim marks remain fixed', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const tilt = await create(view, 'tilt', 'C');
  const tile = () => document.querySelector(`[data-control-id="${tilt.id}"]`);
  for (const size of [1, 2]) {
    await act(() => view.api.update(tilt.id, { w: size, h: size }));
    await act(() => hub.devices.C.emit('tilt', { x: 15, y: 0 }));
    const horizon = () => present(tile()).querySelector('[data-tilt-horizon]');
    const pitchMark = () =>
      present(horizon()).querySelector('[data-tilt-pitch-mark="30"]');
    const rim = present(tile()).querySelector('[data-tilt-rim-mark="30"]');
    const fixedTransform = window.getComputedStyle(present(rim)).transform;
    const initialTop = parseFloat(
      window.getComputedStyle(present(pitchMark())).top
    );
    assert.equal(
      window.getComputedStyle(present(horizon())).transform,
      'rotate(15deg)'
    );
    assert.equal(
      present(horizon()).querySelector('[data-tilt-rim-mark]'),
      null
    );
    await act(() => hub.devices.C.emit('tilt', { x: 15, y: 30 }));
    const movedTop = parseFloat(
      window.getComputedStyle(present(pitchMark())).top
    );
    assert.ok(movedTop < initialTop);
    assert.ok(Math.abs(movedTop - 50) < 0.001);
    assert.equal(
      window.getComputedStyle(present(rim)).transform,
      fixedTransform
    );
  }
  await act(() =>
    view.api.update(tilt.id, {
      options: {
        rollReverseFactor: -1,
        pitchReverseFactor: -1,
      },
    })
  );
  assert.equal(
    window.getComputedStyle(query(present(tile()), '[data-tilt-horizon]'))
      .transform,
    'rotate(-15deg)'
  );
  assert.ok(
    parseFloat(
      window.getComputedStyle(
        query(present(tile()), '[data-tilt-pitch-mark="30"]')
      ).top
    ) > 80
  );
  await act(() => hub.devices.C.emit('tilt', { x: 15 }));
  assert.equal(present(tile()).querySelector('[data-tilt-pitch-mark]'), null);
  assert.match(
    present(
      query(present(tile()), '[data-tilt-area] [role="img"]').getAttribute(
        'aria-label'
      )
    ),
    /Pitch: unavailable/
  );
  assert.match(
    query(present(tile()), '[data-tilt-values]').textContent,
    /Pitch: --/
  );
});

test('arrows hold on pointer or keyboard, stop on cancellation/focus loss, and ignore extra inputs', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'arrows');
  const forward = button('Forward');
  const backward = button('Backward');
  await pointer(forward, 'pointerdown', { pointerType: 'touch' });
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 100);
  await pointer(backward, 'pointerdown', { pointerId: 2, isPrimary: false });
  await pointer(backward, 'pointerup', { pointerId: 2, isPrimary: false });
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 100);
  await pointer(forward, 'pointercancel', { pointerType: 'touch' });
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  await pointer(backward, 'pointerdown');
  await pointer(backward, 'lostpointercapture');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  await key(forward, 'keydown', ' ');
  const count = hub.devices.A.speeds.length;
  await key(forward, 'keydown', ' ', { repeat: true });
  assert.equal(hub.devices.A.speeds.length, count);
  await key(forward, 'keyup', ' ');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  await key(backward, 'keydown', 'Enter');
  await act(async () => window.dispatchEvent(new window.Event('blur')));
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
  const beforeClick = hub.devices.A.speeds.length;
  await click(forward);
  assert.equal(hub.devices.A.speeds.length, beforeClick);
});

test('distance preserves zero and tilt uses configured axes/reversals without invented readings', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const distance = await create(view, 'distance', 'B');
  const tilt = await create(view, 'tilt', 'C');
  assert.match(document.body.textContent, /Waiting for distance/);
  assert.match(document.body.textContent, /Waiting for tilt/);
  await act(async () => {
    hub.devices.B.emit('distance', { distance: 0 });
    hub.devices.C.emit('tilt', { x: 10, y: -20 });
  });
  const distanceTile = document.querySelector(
    `[data-control-id="${distance.id}"]`
  );
  assert.ok(
    present(distanceTile).querySelector(
      'svg[aria-label="Distance indicator: Very close"]'
    )
  );
  assert.doesNotMatch(present(distanceTile).textContent, /0 mm/);
  await act(() =>
    view.api.update(tilt.id, {
      options: {
        rollAxis: 1,
        pitchAxis: 2,
        rollReverseFactor: -1,
        pitchReverseFactor: 1,
      },
    })
  );
  const tile = document.querySelector(`[data-control-id="${tilt.id}"]`);
  assert.match(
    present(
      query(present(tile), '[data-tilt-area] [role="img"]').getAttribute(
        'aria-label'
      )
    ),
    /Roll: 20 degrees, Pitch: unavailable/
  );
  const sensor = hub.devices.B;
  await act(async () => {
    delete hub.devices.B;
    hub.emit('detach', sensor);
  });
  assert.match(
    query(document, `[data-control-id="${distance.id}"]`).textContent,
    /disconnected/
  );
  const motor = fakeDevice('B');
  await act(async () => {
    hub.devices.B = motor;
    hub.emit('attach', motor);
  });
  assert.match(
    query(document, `[data-control-id="${distance.id}"]`).textContent,
    /Different device attached/
  );
});

test('device activation closes the popup; dialogs create/configure/remove with no preview commands', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const trigger = button('Test hub actions');
  trigger.getBoundingClientRect = () => new window.DOMRect(10, 10, 40, 40);
  await click(trigger);
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  await click(button('Create control for A: Big motor'));
  assert.equal(trigger.getAttribute('aria-expanded'), null);
  assert.match(
    query(document, '[role="dialog"]').textContent,
    /Choose a control/
  );
  assert.equal(hub.devices.A.speeds.length, 0);
  await click(button('Choose Motor arrows'));
  assert.match(
    query(document, '[role="dialog"]').textContent,
    /Choose a tile size/
  );
  await click(button('Back'));
  assert.equal(view.api.controls.size, 0);
  await click(button('Choose Motor arrows'));
  await click(button('Create Motor arrows, 2 by 1'));
  assert.equal(view.api.controls.size, 1);
  const control = [...view.api.controls.values()][0];
  assert.equal(control.type, 'arrows');
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(document.activeElement, trigger);
  await click(button('Configure Motor arrows'));
  await input(present(field('Title')), 'My train');
  await input(present(field('Speed (%)')), '45');
  assert.deepEqual(
    [...document.querySelectorAll('[role="dialog"] label')].map((label) =>
      visibleText(label).replace(/\s*\*$/, '')
    ),
    [
      'Title',
      'Speed (%)',
      'Stop on release',
      'Forward key',
      'Stop key',
      'Backward key',
    ]
  );
  await submit();
  const updated = view.api.controls.get(control.id);
  assert.equal(present(updated).title, 'My train');
  assert.equal(present(updated).x, control.x);
  assert.equal(present(updated).y, control.y);
  assert.equal(present(updated).h, control.h);
  assert.equal(controlOf(updated, 'arrows').options.speed, 45);
  assert.equal(hub.devices.A.speeds.length, 0);
  await click(button('Configure My train'));
  await input(present(field('Title')), 'Discarded');
  await click(button('Cancel'));
  assert.equal(present(view.api.controls.get(control.id)).title, 'My train');
  await click(button('Configure My train'));
  await click(button('Remove control'));
  assert.equal(view.api.controls.size, 0);
});

test('modal actions block duplicate submissions and preserve a failed draft for retry', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const names: string[] = [];
  let reject: ((cause: Error) => void) | undefined;
  hub.setName = (name) => {
    names.push(name);
    return new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
  };
  await act(() => view.api.openModal('hubConfig', { uuid: hub.uuid }));
  await input(present(field('Name')), 'My train');
  await act(async () => {
    const form = query(document, '[role="dialog"] form');
    for (let i = 0; i < 2; i += 1)
      form.dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      );
  });
  assert.deepEqual(names, ['My train']);
  assert.equal(asButton(button('Save')).disabled, true);
  assert.equal(asButton(button('Cancel')).disabled, true);
  await key(query(document, '[role="dialog"]'), 'keydown', 'Escape');
  assert.ok(document.querySelector('[role="dialog"]'));
  await act(() => present(reject)(new Error('Rename radio failed')));
  assert.match(
    visibleText(query(document, '[role="dialog"]')),
    /Rename radio failed/
  );
  assert.equal(asInput(present(field('Name'))).value, 'My train');
  assert.equal(asButton(button('Save')).disabled, false);
  hub.setName = async (name) => {
    names.push(name);
    hub.name = name;
  };
  await submit();
  assert.deepEqual(names, ['My train', 'My train']);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(present(view.api.hubs.get(hub.uuid)).name, 'My train');
});

test('settings preserve concurrent layout edits, work offline, and creation explains a full board', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'distance', 'B', { w: 2, h: 2 });
  const second = await create(view, 'distance', 'B', { w: 2, h: 2 });
  await act(async () => view.api.openModal('controlConfig', { id: second.id }));
  await input(present(field('Scale')), 'linear');
  await act(() => view.api.update(second.id, { x: 4 }));
  await submit();
  assert.equal(
    controlOf(view.api.controls.get(second.id), 'distance').options.scale,
    'linear'
  );
  assert.equal(present(view.api.controls.get(second.id)).x, 4);
  await act(() => view.api.disconnect(hub.uuid));
  await act(() => view.api.openModal('controlConfig', { id: second.id }));
  await input(present(field('Title')), 'Offline distance');
  await submit();
  assert.equal(
    present(view.api.controls.get(second.id)).title,
    'Offline distance'
  );
  await act(async () =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'B' })
  );
  assert.match(query(document, '[role="dialog"]').textContent, /disconnected/);
  assert.equal(asButton(button('Choose Distance')).disabled, true);
  await click(button('Cancel'));
  fakeHub();
  await act(() => view.api.addHub());
  for (let i = 0; i < 13; i += 1)
    await create(view, 'distance', 'B', { w: 2, h: 2 });
  await act(async () =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'B' })
  );
  assert.match(query(document, '[role="dialog"]').textContent, /Board full/);
  await click(button('Choose Distance'));
  assert.equal(asButton(button('Create Distance, 1 by 1')).disabled, true);
  assert.equal(asButton(button('Create Distance, 2 by 2')).disabled, true);
});

test('board move/resize snap, account for scroll offsets, and roll back invalid or cancelled gestures', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const obstacle = await create(view, 'distance', 'B');
  const board = boardGeometry();
  const move = button('Move Motor slider');
  await pointer(move, 'pointerdown', { clientX: -180, clientY: 70 });
  await pointer(present(board), 'pointermove', { clientX: 252, clientY: 358 });
  assert.equal(
    query(document, '[data-layout-preview]').getAttribute(
      'data-layout-preview'
    ),
    'valid'
  );
  await pointer(present(board), 'pointerup', { clientX: 252, clientY: 358 });
  assert.equal(present(view.api.controls.get(control.id)).x, 3);
  assert.equal(present(view.api.controls.get(control.id)).y, 2);
  assert.equal(hub.devices.A.speeds.length, 0);
  const region = document.querySelector('[aria-label="Notifications"]');
  assert.match(present(region).textContent, /Motor slider moved\./);
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'success');
  assert.doesNotMatch(
    present(query(document, '[data-board-viewport]').parentElement).textContent,
    /Motor slider moved\./
  );
  const resize = button('Resize Motor slider');
  await pointer(resize, 'pointerdown', { clientX: 500, clientY: 400 });
  await pointer(present(board), 'pointermove', { clientX: 1050, clientY: 400 });
  await pointer(present(board), 'pointerup', { clientX: 1050, clientY: 400 });
  assert.equal(present(view.api.controls.get(control.id)).w, 6);
  assert.match(present(region).textContent, /Motor slider resized\./);
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'success');
  const before = view.api.controls.get(control.id);
  await pointer(move, 'pointerdown', { clientX: 300, clientY: 400 });
  await pointer(present(board), 'pointermove', { clientX: 1600, clientY: 400 });
  assert.equal(
    query(document, '[data-layout-preview]').getAttribute(
      'data-layout-preview'
    ),
    'invalid'
  );
  await pointer(present(board), 'pointerup', { clientX: 1600, clientY: 400 });
  assert.equal(view.api.controls.get(control.id), before);
  assert.match(present(region).textContent, /Control unchanged/);
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'warning');
  const count = view.api.toastMessages.length;
  await pointer(move, 'pointerdown', { clientX: 300, clientY: 400 });
  await pointer(present(board), 'pointermove', { clientX: 300, clientY: 544 });
  await pointer(present(board), 'pointercancel');
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  assert.equal(view.api.controls.get(control.id), before);
  assert.equal(view.api.controls.get(obstacle.id), obstacle);
  assert.equal(view.api.toastMessages.length, count);
  await pointer(move, 'pointerdown', { clientX: 300, clientY: 400 });
  await act(() => view.api.update(control.id, { x: 4 }));
  await pointer(present(board), 'pointerup', { clientX: 300, clientY: 400 });
  assert.equal(present(view.api.controls.get(control.id)).x, 4);
  assert.equal(
    present(view.api.toastMessages.at(-1)).text,
    'Control changed. Try again.'
  );
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'warning');
  await click(move);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  await key(move, 'keydown', 'Escape');
});

test('layout handles no longer respond to keyboard editing or become dead tab stops', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', { w: 2, h: 1 });
  await create(view, 'distance', 'B');
  const move = button('Move Motor slider');
  await key(move, 'keydown', 'Enter');
  await key(move, 'keydown', 'Enter', { repeat: true });
  await key(move, 'keydown', 'ArrowRight');
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  assert.equal(document.getElementById('board-layout-help'), null);
  await key(move, 'keydown', 'Enter');
  assert.equal(view.api.controls.get(control.id), control);
  await key(move, 'keydown', ' ');
  await key(move, 'keydown', 'ArrowDown');
  await key(move, 'keydown', 'ArrowRight');
  assert.equal(view.api.controls.get(control.id), control);
  await key(move, 'keydown', 'Enter');
  assert.equal(view.api.controls.get(control.id), control);
  const resize = button('Resize Motor slider');
  await key(resize, 'keydown', 'Enter');
  await key(resize, 'keydown', 'ArrowRight');
  assert.equal(document.getElementById('board-layout-help'), null);
  await key(resize, 'keydown', 'Enter');
  assert.equal(view.api.controls.get(control.id), control);
  const before = view.api.controls.get(control.id);
  await key(move, 'keydown', 'Enter');
  await key(move, 'keydown', 'ArrowLeft');
  await key(move, 'keydown', 'ArrowLeft');
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  await key(move, 'keydown', 'Escape');
  assert.equal(view.api.controls.get(control.id), before);
  await key(resize, 'keydown', 'Enter');
  await key(resize, 'keydown', 'ArrowLeft');
  await act(() => move.focus());
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  assert.equal(view.api.controls.get(control.id), before);
  await key(move, 'keydown', 'Enter');
  await key(move, 'keydown', 'ArrowDown');
  await act(() => window.dispatchEvent(new window.Event('blur')));
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  assert.equal(view.api.controls.get(control.id), before);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(move.tagName, 'SPAN');
  assert.equal(move.tabIndex, -1);
  assert.equal(resize.tabIndex, -1);
});

test('failed move reports an error toast without changing the control', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const replacement = fakeDevice('D');
  await act(() => {
    hub.devices.D = replacement;
    hub.emit('attach', replacement);
  });
  let releaseStop: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    releaseStop = resolve;
  });
  hub.devices.A.setSpeed = async () => waiting;
  let pending: Promise<unknown> | undefined;
  await act(() => {
    pending = view.api.update(control.id, { port: 'D' });
  });
  const board = boardGeometry();
  await pointer(button('Move Motor slider'), 'pointerdown', {
    clientX: -180,
    clientY: 70,
  });
  await pointer(present(board), 'pointerup', { clientX: 252, clientY: 358 });
  assert.equal(view.api.controls.get(control.id), control);
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'error');
  assert.match(present(view.api.toastMessages.at(-1)).text, /Control is busy/);
  assert.match(
    query(document, '[aria-label="Notifications"]').textContent,
    /Control is busy/
  );
  await act(async () => {
    present(releaseStop)();
    await present(pending);
  });
});

test('invalid resize reports a warning toast and preserves the control', async (t) => {
  const view = await mount(t, { render });
  fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', { w: 2, h: 1 });
  await create(view, 'distance', 'B');
  const board = boardGeometry();
  await pointer(button('Resize Motor slider'), 'pointerdown', {
    clientX: 0,
    clientY: 70,
  });
  await pointer(present(board), 'pointermove', { clientX: 288, clientY: 70 });
  assert.equal(
    html(document, '[data-layout-preview]').dataset.layoutPreview,
    'invalid'
  );
  await pointer(present(board), 'pointerup', { clientX: 288, clientY: 70 });
  assert.equal(view.api.controls.get(control.id), control);
  assert.equal(present(view.api.toastMessages.at(-1)).level, 'warning');
  assert.match(
    query(document, '[aria-label="Notifications"]').textContent,
    /Control unchanged/
  );
});

test('settings expose only each control behavior and keep failed saves open', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  for (const [type, port, expected] of [
    [
      'slider',
      'A',
      [
        'Title',
        'Reset to zero on release',
        'Reverse rotation',
        'Increase by 10 key',
        'Increase by 1 key',
        'Decrease by 1 key',
        'Decrease by 10 key',
      ],
    ],
    [
      'arrows',
      'A',
      [
        'Title',
        'Speed (%)',
        'Stop on release',
        'Forward key',
        'Stop key',
        'Backward key',
      ],
    ],
    ['distance', 'B', ['Title', 'Scale']],
    ['color', 'B', ['Title', 'Color stability']],
    [
      'tilt',
      'C',
      ['Title', 'Roll axis', 'Reverse roll', 'Pitch axis', 'Reverse pitch'],
    ],
    ['stop', 'A', ['Title', 'Stop key']],
  ] as const) {
    const control = await create(view, type, port);
    await act(() => view.api.openModal('controlConfig', { id: control.id }));
    const labels = [...document.querySelectorAll('[role="dialog"] label')].map(
      (label) => visibleText(label).replace(/\s*\*$/, '')
    );
    assert.deepEqual(labels, expected);
    if (type === 'slider') {
      for (const checkbox of document.querySelectorAll(
        '[role="dialog"] input[type="checkbox"]'
      )) {
        await click(checkbox);
      }
    } else if (type === 'arrows') {
      await input(present(field('Speed (%)')), '0');
      await submit();
      assert.match(
        query(document, '[role="dialog"]').textContent,
        /between 1 and 100/
      );
      assert.equal(
        controlOf(view.api.controls.get(control.id), 'arrows').options.speed,
        100
      );
      await input(present(field('Speed (%)')), '35');
    } else if (type === 'distance') {
      await input(present(field('Scale')), 'linear');
    } else if (type === 'color') {
      await input(present(field('Color stability')), '150');
    } else if (type === 'stop') {
      assert.equal(asInput(field('Stop key')).value, '');
    }
    await submit();
    const saved = view.api.controls.get(control.id);
    if (type === 'slider') {
      assert.equal(controlOf(saved, 'slider').options.resetOnRelease, true);
      assert.equal(controlOf(saved, 'slider').options.reverseRotation, true);
    }
    if (type === 'arrows')
      assert.equal(controlOf(saved, 'arrows').options.speed, 35);
    if (type === 'distance')
      assert.equal(controlOf(saved, 'distance').options.scale, 'linear');
    if (type === 'color')
      assert.equal(controlOf(saved, 'color').options.stability, 150);
    assert.equal(document.querySelector('[role="dialog"]'), null);
  }
  assert.equal(hub.devices.A.speeds.length, 0);
});

test('arrow speed affects new presses without changing a held command', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const arrows = await create(view, 'arrows', 'A', { options: { speed: 35 } });
  const forward = button('Forward');
  const idle = window.getComputedStyle(forward).backgroundColor;
  await pointer(forward, 'pointerdown');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 35);
  assert.notEqual(window.getComputedStyle(forward).backgroundColor, idle);
  await act(() => view.api.update(arrows.id, { options: { speed: 70 } }));
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [35]
  );
  assert.notEqual(window.getComputedStyle(forward).backgroundColor, idle);
  await pointer(forward, 'pointerup');
  await key(button('Backward'), 'keydown', 'Enter');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], -70);
  await key(button('Backward'), 'keyup', 'Enter');
  assert.equal(present(hub.devices.A.speeds.at(-1))[0], 0);
});

test('saving or cancelling slider reversal does not change a running motor before new input', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view);
  const slider = document.querySelector('input[type="range"]');
  await input(present(slider), 48);
  await click(button('Configure Motor slider'));
  await click(present(field('Reverse rotation')));
  await click(button('Cancel'));
  assert.equal(
    controlOf(view.api.controls.get(control.id), 'slider').options
      .reverseRotation,
    false
  );
  assert.equal(asInput(slider).value, '48');
  await click(button('Configure Motor slider'));
  await click(present(field('Reverse rotation')));
  await click(present(field('Reset to zero on release')));
  await submit();
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [48]
  );
  assert.equal(asInput(slider).value, '-48');
  await pointer(present(slider), 'pointerdown');
  await input(present(slider), 60);
  await pointer(present(slider), 'pointerup');
  assert.deepEqual(
    hub.devices.A.speeds.map((call) => call[0]),
    [48, -60, 0]
  );
});

test('color stability filters flicker per tile without delaying shared distance updates', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const immediate = await create(view, 'color', 'B');
  const fast = await create(view, 'color', 'B', {
    options: { stability: 150 },
  });
  const slow = await create(view, 'color', 'B', {
    options: { stability: 400 },
  });
  const distance = await create(view, 'distance', 'B');
  const tile = (control: { id: string }) =>
    document.querySelector(`[data-control-id="${control.id}"]`);
  const colorIs = (control: { id: string }, label: string) =>
    assert.ok(
      present(tile(control)).querySelector(
        `[role="img"][aria-label="${label}"]`
      ),
      `${control.id}: ${label}`
    );
  const tick = async (ms: number) => act(() => t.mock.timers.tick(ms));
  const emit = async (color: number, reading = 81) =>
    act(() =>
      hub.devices.B.emit('colorAndDistance', { color, distance: reading })
    );
  await emit(9);
  colorIs(immediate, 'Detected color: Red');
  colorIs(fast, 'Waiting for color');
  await tick(149);
  await emit(9, 0);
  assert.ok(
    present(tile(distance)).querySelector(
      '[aria-label="Distance indicator: Very close"]'
    )
  );
  await tick(1);
  colorIs(fast, 'Detected color: Red');
  colorIs(slow, 'Waiting for color');
  await tick(250);
  colorIs(slow, 'Detected color: Red');
  await emit(3);
  await tick(100);
  await emit(9);
  await tick(400);
  colorIs(fast, 'Detected color: Red');
  colorIs(slow, 'Detected color: Red');
  await emit(255);
  await tick(149);
  colorIs(fast, 'Detected color: Red');
  await tick(1);
  colorIs(fast, 'No color detected');
  colorIs(slow, 'Detected color: Red');
  await tick(250);
  colorIs(slow, 'No color detected');
  await act(() => view.api.update(fast.id, { options: { stability: 0 } }));
  await emit(3);
  colorIs(fast, 'Detected color: Blue');
  await tick(400);
  assert.equal(
    hub.subscriptions.filter((call) => call[0] === hub.devices.B.portId).length,
    1
  );
  assert.equal(hub.unsubscriptions.length, 0);
});

test('color stability discards pending readings on option changes, replacement and removal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await mount(t, { render: () => React.createElement(Grid) });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const color = await create(view, 'color', 'B', {
    options: { stability: 150 },
  });
  const tile = () => document.querySelector(`[data-control-id="${color.id}"]`);
  const tick = async (ms: number) => act(() => t.mock.timers.tick(ms));
  await act(() =>
    hub.devices.B.emit('colorAndDistance', { color: 9, distance: 81 })
  );
  await tick(100);
  await act(() => view.api.update(color.id, { options: { stability: 400 } }));
  await tick(50);
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  const replacement = fakeDevice('B', DeviceType.COLOR_DISTANCE_SENSOR);
  await act(() => {
    hub.devices.B = replacement;
    hub.emit('attach', replacement);
  });
  await act(() =>
    replacement.emit('colorAndDistance', { color: 3, distance: 0 })
  );
  await tick(399);
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  await tick(1);
  assert.ok(
    present(tile()).querySelector('[aria-label="Detected color: Blue"]')
  );
  await act(() => view.api.update(color.id, { options: { stability: 0 } }));
  await act(() =>
    replacement.emit('colorAndDistance', { color: 9, distance: 0 })
  );
  assert.ok(
    present(tile()).querySelector('[aria-label="Detected color: Red"]')
  );
  await act(() => view.api.update(color.id, { options: { stability: 400 } }));
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  await tick(399);
  assert.ok(present(tile()).querySelector('[aria-label="Waiting for color"]'));
  await tick(1);
  assert.ok(
    present(tile()).querySelector('[aria-label="Detected color: Red"]')
  );
  await act(() =>
    replacement.emit('colorAndDistance', { color: 3, distance: 0 })
  );
  await act(() => view.api.remove(color.id));
  await tick(400);
  assert.equal(tile(), null);
  assert.equal(present(hub.unsubscriptions.at(-1))[0], replacement.portId);
});
