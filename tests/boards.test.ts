import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { present } from './helpers/dom.ts';
import {
  mount,
  fakeHub,
  fakeDevice,
  create,
  loadSource,
  key,
  pointer,
  click,
  button,
  input,
} from './helpers/controls.ts';

const Main = loadSource('components/pages/Main').default;
const Footer = loadSource('components/Footer').default;
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Main),
    React.createElement(Footer)
  );

test('boards retain independent layouts and shortcuts while sharing devices and motor state', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const attachListeners = hub.listenerCount('attach');
  const first = await create(view, 'arrows', 'A', {
    options: { stopOnRelease: false, forwardKey: 'q' },
  });
  const firstBoard = view.api.selectedBoardId;
  await key(document.body, 'keydown', 'q', { code: 'KeyQ' });
  await key(document.body, 'keyup', 'q', { code: 'KeyQ' });
  assert.deepEqual(
    hub.devices.A.speeds.map((item) => item[0]),
    [100]
  );
  await click(button('Add board'));
  const secondBoard = view.api.selectedBoardId;
  assert.notEqual(firstBoard, secondBoard);
  assert.equal(view.api.controls.size, 0);
  assert.ok(
    document.querySelector(
      `#tab-${firstBoard} [aria-label="Motor commanded to run"]`
    )
  );
  assert.notEqual(
    document
      .querySelector(`#tab-${firstBoard} [aria-label="Motor commanded to run"]`)
      ?.getAttribute('aria-hidden'),
    'true'
  );
  const second = await create(view, 'arrows', 'D', {
    options: { forwardKey: 'q' },
  });
  assert.equal(first.x, second.x);
  assert.equal(first.y, second.y);
  await key(document.body, 'keydown', 'q', { code: 'KeyQ' });
  assert.deepEqual(
    hub.devices.D.speeds.map((item) => item[0]),
    [100]
  );
  await act(() => view.api.selectBoard(firstBoard));
  assert.deepEqual(
    hub.devices.D.speeds.map((item) => item[0]),
    [100, 0]
  );
  assert.deepEqual(
    hub.devices.A.speeds.map((item) => item[0]),
    [100]
  );
  await key(document.body, 'keydown', 'q', { code: 'KeyQ' });
  assert.deepEqual(
    hub.devices.A.speeds.map((item) => item[0]),
    [100]
  );
  await key(document.body, 'keyup', 'q', { code: 'KeyQ' });
  assert.equal(view.api.controls.get(first.id)?.id, first.id);
  await act(() => view.api.renameBoard(firstBoard, 'Trains'));
  assert.equal(view.api.boards[0].name, 'Trains');
  await act(() => view.api.stopAll());
  assert.deepEqual(
    hub.devices.A.speeds.map((item) => item[0]),
    [100, 0]
  );
  assert.equal(view.api.activeBoards.has(firstBoard), false);
  assert.equal(hub.listenerCount('attach'), attachListeners);
});

test('tab activity clears on disconnect and populated removal asks for confirmation', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider');
  await act(() => view.api.speed(control.id, 35));
  assert.ok(document.querySelector('[aria-label="Motor commanded to run"]'));
  await click(button('Add board'));
  await act(() => view.api.selectBoard(view.api.boards[0].id));
  await click(button('Settings for Board 1'));
  await click(button('Remove board'));
  assert.match(
    present(document.querySelector('[role="dialog"]')).textContent ?? '',
    /Remove Board 1/
  );
  await click(button('Cancel'));
  assert.equal(view.api.boards.length, 2);
  await act(() => view.api.disconnect(hub.uuid));
  assert.equal(
    document.querySelector('[aria-label="Motor commanded to run"]'),
    null
  );
});

test('tab actions rename and configure colors while preserving tab keyboard navigation', async (t) => {
  const view = await mount(t, { render });
  const edit = button('Rename Board 1');
  await act(() => edit.focus());
  await click(edit);
  const nameInput = present(
    document.querySelector<HTMLInputElement>('[role="dialog"] input')
  );
  assert.equal(document.activeElement, nameInput);
  await input(nameInput, 'Trains');
  await click(button('Save'));
  assert.equal(view.api.boards[0].name, 'Trains');
  await click(button('Settings for Trains'));
  const blue = button('Blue');
  await act(() => blue.focus());
  await click(blue);
  assert.equal(blue.getAttribute('aria-pressed'), 'true');
  const settingsName = present(
    document.querySelector<HTMLInputElement>('[role="dialog"] input')
  );
  await input(settingsName, ' ');
  await click(button('Save'));
  assert.equal(view.api.boards[0].name, 'Trains');
  assert.equal(view.api.boards[0].color, undefined);
  await input(settingsName, 'Trains');
  await click(button('Save'));
  assert.equal(view.api.boards[0].color, 'blue');
  assert.equal(document.querySelectorAll('[role="tab"] button').length, 0);
  await click(button('Add board'));
  const secondId = view.api.selectedBoardId;
  const second = present(document.getElementById(`tab-${secondId}`));
  await act(() => second.focus());
  await key(second, 'keydown', 'ArrowLeft');
  assert.equal(view.api.selectedBoardId, view.api.boards[0].id);
  assert.equal(document.activeElement?.id, `tab-${view.api.boards[0].id}`);
  assert.ok(button('Rename Trains'));
  await click(button('Settings for Trains'));
  await click(button('Default'));
  await click(button('Save'));
  assert.equal(view.api.boards[0].color, undefined);
});

test('the footer stop immediately stops motors running on different tabs', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const first = await create(view, 'slider', 'A');
  await act(() => view.api.speed(first.id, 50));
  await click(button('Add board'));
  const second = await create(view, 'slider', 'D');
  await act(() => view.api.speed(second.id, 30));
  const stop = button(
    'Stop all motors',
    present(document.querySelector('footer'))
  );
  await act(() => stop.focus());
  await click(stop);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.deepEqual(
    hub.devices.A.speeds.map(([speed]) => speed),
    [50, 0]
  );
  assert.deepEqual(
    hub.devices.D.speeds.map(([speed]) => speed),
    [30, 0]
  );
  assert.equal(view.api.activeBoards.size, 0);
});

test('closing settings returns focus and deleting a board focuses the surviving tab', async (t) => {
  const view = await mount(t, { render });
  const settings = button('Settings for Board 1');
  await act(() => settings.focus());
  await click(settings);
  await click(button('Cancel'));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  });
  assert.equal(document.activeElement, settings);
  await click(button('Add board'));
  const first = view.api.boards[0].id;
  await click(button('Settings for Board 2'));
  await click(button('Remove board'));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  });
  assert.equal(view.api.selectedBoardId, first);
  assert.equal(document.activeElement?.id, `tab-${first}`);
});

test('switching releases momentary pointer inputs and removal stops only that board', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  await create(view, 'arrows', 'A');
  const firstBoard = view.api.selectedBoardId;
  await pointer(button('Forward'), 'pointerdown');
  await click(button('Add board'));
  assert.deepEqual(
    hub.devices.A.speeds.map((item) => item[0]),
    [100, 0]
  );
  const second = await create(view, 'arrows', 'D', {
    options: { stopOnRelease: false },
  });

  await act(() => view.api.speed(second.id, 50));
  await act(() => view.api.selectBoard(firstBoard));
  await act(() => view.api.removeBoard(firstBoard));
  assert.equal(view.api.selectedBoardId, view.api.boards[0].id);
  assert.equal(view.api.controls.has(second.id), true);
  assert.deepEqual(
    hub.devices.D.speeds.map((item) => item[0]),
    [50]
  );
  await act(async () =>
    assert.rejects(
      view.api.removeBoard(view.api.selectedBoardId),
      /at least one/
    )
  );
  await act(() => view.api.stopAll());
  assert.equal(
    present(view.api.devices.get(hub.uuid)?.get('D')).commands.speed,
    0
  );
});

test('a failed motor stop prevents removing its board', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider');
  const firstBoard = view.api.selectedBoardId;
  await act(() => view.api.speed(control.id, 50));
  await act(() => view.api.addBoard());
  const { setSpeed } = hub.devices.A;
  hub.devices.A.setSpeed = async () => {
    throw new Error('stop failed');
  };
  await act(async () => {
    await assert.rejects(view.api.removeBoard(firstBoard), /stop failed/);
  });
  assert.ok(view.api.boards.some((board) => board.id === firstBoard));
  await act(() => view.api.selectBoard(firstBoard));
  assert.ok(view.api.controls.has(control.id));
  hub.devices.A.setSpeed = setSpeed;
  await act(() => view.api.stopAll());
});
