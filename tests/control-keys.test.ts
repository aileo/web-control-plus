import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { asButton, asInput, present, query } from './helpers/dom.ts';
import {
  controlOf,
  mount,
  fakeHub,
  fakeDevice,
  create,
  loadSource,
  key,
  click,
  pointer,
  button,
  visibleText,
} from './helpers/controls.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const { normalizeShortcutKey } = loadSource('core/controlTypes');
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Grid),
    React.createElement(Modal)
  );
const speeds = (hub: ReturnType<typeof fakeHub>) =>
  hub.devices.A.speeds.map((call) => call[0]);
const press = async (
  value: string,
  target: EventTarget = document.body,
  options: KeyboardEventInit = {}
) => {
  await key(target, 'keydown', value, options);
  await key(target, 'keyup', value, options);
};
const field = (label: string) => {
  const node = [...document.querySelectorAll('label')].find(
    (element) => visibleText(element).trim() === label
  );
  assert.ok(node, label);
  return document.getElementById(node.htmlFor);
};

test('slider keys step once per press, clamp, share across motors and deduplicate one motor', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const options = {
    increase10Key: 'q',
    increase1Key: 'w',
    decrease1Key: 's',
    decrease10Key: 'a',
  };
  await create(view, 'slider', 'A', { options });
  await create(view, 'slider', 'A', { options });
  await create(view, 'slider', 'D', { options });
  await key(document.body, 'keydown', 'Q', { code: 'KeyQ' });
  await key(document.body, 'keydown', 'q', { code: 'KeyQ', repeat: true });
  await key(document.body, 'keydown', 'q', { code: 'KeyQ' });
  assert.deepEqual(speeds(hub), [10]);
  await key(document.body, 'keyup', 'q', { code: 'KeyQ' });
  await press('w');
  await press('s');
  await press('a');
  assert.deepEqual(speeds(hub), [10, 11, 10, 0]);
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [10, 11, 10, 0]
  );
  for (let i = 0; i < 12; i += 1) await press('q');
  assert.equal(speeds(hub).at(-1), 100);
  for (let i = 0; i < 24; i += 1) await press('a');
  assert.equal(speeds(hub).at(-1), -100);
});

for (const reverseRotation of [false, true]) {
  test(`rapid ${reverseRotation ? 'reversed ' : ''}shortcut presses add to queued physical intent`, async (t) => {
    const view = await mount(t);
    const hub = fakeHub();
    await act(() => view.api.addHub());
    const control = await create(view, 'slider', 'A', {
      options: { reverseRotation, increase10Key: 'q', increase1Key: 'w' },
    });
    const direction = reverseRotation ? -1 : 1;
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    hub.devices.A.setSpeed = async (speed) => {
      hub.devices.A.speeds.push([speed]);
      if (Math.abs(speed) === 10) await pending;
    };
    await press('q');
    await press('w');
    await press('q');
    assert.deepEqual(speeds(hub), [direction * 10]);
    await act(async () => {
      present(finish)();
      await pending;
    });
    assert.deepEqual(speeds(hub), [direction * 10, direction * 21]);
    await act(() => view.api.speed(control.id, 0));
  });
}

test('reversed keys step displayed values, deduplicate equivalent physical actions and reject opposite bindings', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const options = {
    increase10Key: 'q',
    increase1Key: 'w',
    decrease1Key: 's',
    decrease10Key: 'a',
  };
  const reversed = await create(view, 'slider', 'A', {
    options: { ...options, reverseRotation: true },
  });
  await create(view, 'slider', 'A', {
    options: {
      decrease10Key: 'q',
      decrease1Key: 'w',
      increase1Key: 's',
      increase10Key: 'a',
    },
  });
  await create(view, 'slider', 'D', { options });
  for (const binding of ['q', 'w', 's', 'a']) await press(binding);
  assert.deepEqual(speeds(hub), [-10, -11, -10, 0]);
  assert.deepEqual(
    hub.devices.D.speeds.map((call) => call[0]),
    [10, 11, 10, 0]
  );
  for (let i = 0; i < 12; i += 1) await press('q');
  assert.equal(speeds(hub).at(-1), -100);
  for (let i = 0; i < 24; i += 1) await press('a');
  assert.equal(speeds(hub).at(-1), 100);
  const before = speeds(hub);
  await act(() =>
    assert.rejects(
      view.api.update(reversed.id, {
        options: { reverseRotation: false },
      }),
      /conflicts/
    )
  );
  assert.equal(view.api.controls.get(reversed.id), reversed);
  await act(() =>
    assert.rejects(
      view.api.create({
        uuid: hub.uuid,
        port: 'A',
        type: 'slider',
        options: { increase10Key: 'q' },
      }),
      /conflicts/
    )
  );
  assert.deepEqual(speeds(hub), before);
  await act(() => view.api.speed(reversed.id, 0));
});

test('momentary keys release reliably and do not stop another attachment after rebinding', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', {
    options: { resetOnRelease: true, increase10Key: '+' },
  });
  await key(document.body, 'keydown', '+', { code: 'Equal', shiftKey: true });
  assert.equal(speeds(hub).at(-1), 10);
  await key(document.body, 'keyup', '=', { code: 'Equal' });
  assert.equal(speeds(hub).at(-1), 0);
  await key(document.body, 'keydown', '+', { code: 'Equal' });
  await act(() => view.api.update(control.id, { port: 'D' }));
  const count = hub.devices.D.speeds.length;
  await key(document.body, 'keyup', '=', { code: 'Equal' });
  assert.equal(hub.devices.D.speeds.length, count);
  await key(document.body, 'keydown', '+', { code: 'Equal' });
  await act(async () => window.dispatchEvent(new window.Event('blur')));
  assert.equal(present(hub.devices.D.speeds.at(-1))[0], 0);
});

test('typing, menus, dialogs, composition and native button keys cannot trigger shortcuts', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'slider', 'A', {
    options: { increase10Key: 'q' },
  });
  const input = document.createElement('input');
  document.body.append(input);
  await press('q', input);
  await press('q', document.body, { ctrlKey: true });
  await press('q', document.body, { altKey: true });
  await press('q', document.body, { metaKey: true });
  await press('q', document.body, { isComposing: true });
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  await press('q');
  menu.remove();
  await press(' ', button('Configure Motor slider'));
  await act(() => view.api.openModal('controlConfig', { id: control.id }));
  await press('q');
  assert.deepEqual(speeds(hub), []);
  await press('Q', present(field('Increase by 10 key')));
  assert.equal(asInput(field('Increase by 10 key')).value, 'q');
  await click(button('Clear increase by 10 key'));
  assert.equal(asInput(field('Increase by 10 key')).value, '');
  await click(button('Cancel'));
  assert.equal(
    controlOf(view.api.controls.get(control.id), 'slider').options
      .increase10Key,
    'q'
  );
  await press('q');
  assert.deepEqual(speeds(hub), [10]);
});

test('key conflicts reject atomic saves/adds/rebindings and identify the conflicting action', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  await act(() => view.api.addHub());
  await create(view, 'stop', 'A', {
    title: 'Emergency stop',
    options: { stopKey: 'x' },
  });
  const arrow = await create(view, 'arrows', 'A', {
    options: { forwardKey: 'w' },
  });
  const other = await create(view, 'arrows', 'D', {
    options: { forwardKey: 'x' },
  });
  await act(async () => {
    await assert.rejects(
      view.api.update(arrow.id, {
        title: 'Should not save',
        options: { forwardKey: 'x' },
      }),
      /conflicts with Emergency stop: Stop/
    );
    await assert.rejects(view.api.update(other.id, { port: 'A' }), /conflicts/);
    await assert.rejects(
      view.api.create({
        type: 'slider',
        uuid: hub.uuid,
        port: 'A',
        options: { increase1Key: 'x' },
      }),
      /conflicts/
    );
    await assert.rejects(
      view.api.update(arrow.id, {
        options: { backwardKey: 'w' },
      }),
      /conflicts/
    );
  });
  assert.equal(view.api.controls.get(arrow.id), arrow);
  assert.equal(view.api.controls.get(other.id), other);
  assert.equal(view.api.controls.size, 3);
  assert.deepEqual(speeds(hub), []);
});

test('remote arrows latch, keep running on ordinary focus changes, and Stop always works', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const arrow = await create(view, 'arrows', 'A', {
    options: {
      speed: 35,
      stopOnRelease: false,
      forwardKey: 'w',
      backwardKey: 's',
      stopKey: 'x',
    },
  });
  await press('w');
  assert.equal(speeds(hub).at(-1), 35);
  await act(() => button('Configure Motor arrows').focus());
  assert.equal(speeds(hub).at(-1), 35);
  await pointer(button('Backward'), 'pointerdown');
  await pointer(button('Backward'), 'pointerup');
  await act(() => button('Configure Motor arrows').focus());
  assert.equal(speeds(hub).at(-1), -35);
  await press('x');
  assert.equal(speeds(hub).at(-1), 0);
  await press('w');
  await click(button('Stop'));
  assert.equal(speeds(hub).at(-1), 0);
  await act(() =>
    view.api.update(arrow.id, { options: { stopOnRelease: true } })
  );
  const stop = button('Stop');
  assert.equal(asButton(stop).disabled, false);
  const gray = window.getComputedStyle(stop).backgroundColor;
  await act(() => view.api.speed(arrow.id, 75));
  await click(stop);
  assert.equal(speeds(hub).at(-1), 0);
  assert.equal(window.getComputedStyle(stop).backgroundColor, gray);
  await key(document.body, 'keydown', 'w');
  assert.equal(speeds(hub).at(-1), 35);
  await press('x');
  const count = speeds(hub).length;
  await key(document.body, 'keyup', 'w');
  assert.equal(speeds(hub).length, count);
});

test('held shortcuts keep their release snapshot when options change, and offline matches do not block others', async (t) => {
  const view = await mount(t);
  const first = fakeHub();
  await act(() => view.api.addHub());
  const arrow = await create(view, 'arrows', 'A', {
    options: { forwardKey: 'w' },
  });
  const second = fakeHub('hub-two');
  await act(() => view.api.addHub());
  await act(() =>
    view.api.create({
      uuid: second.uuid,
      port: 'A',
      type: 'arrows',
      options: { forwardKey: 'w' },
    })
  );
  await key(document.body, 'keydown', 'w');
  await act(() =>
    view.api.update(arrow.id, { options: { stopOnRelease: false } })
  );
  assert.equal(speeds(first).at(-1), 100);
  await key(document.body, 'keyup', 'w');
  assert.equal(speeds(first).at(-1), 0);
  await act(() => view.api.disconnect(first.uuid));
  await press('w');
  assert.deepEqual(speeds(second), [100, 0, 100, 0]);
});

test('older native/key releases cannot stop the newest input on the same motor', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'arrows', 'A', {
    options: { forwardKey: 'w', backwardKey: 's' },
  });
  await pointer(button('Forward'), 'pointerdown');
  await key(document.body, 'keydown', 's');
  assert.equal(speeds(hub).at(-1), -100);
  await pointer(button('Forward'), 'pointerup');
  assert.equal(speeds(hub).at(-1), -100);
  await key(document.body, 'keyup', 's');
  assert.equal(speeds(hub).at(-1), 0);
  await key(document.body, 'keydown', 'w');
  await key(document.body, 'keydown', 's');
  await key(document.body, 'keyup', 'w');
  assert.equal(speeds(hub).at(-1), -100);
  await key(document.body, 'keyup', 's');
  assert.equal(speeds(hub).at(-1), 0);
});

test('reserved keys cannot change a binding or dispatch a board action', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const arrow = await create(view, 'arrows', 'A', {
    options: { forwardKey: 'w' },
  });
  await click(button('Configure Motor arrows'));
  for (const reserved of ['Tab', 'Escape', ' ', 'Enter']) {
    assert.equal(normalizeShortcutKey(reserved), null);
    // Test capture independently of Escape's native dialog-close behavior.
    await press(reserved, present(field('Forward key')));
    if (!document.querySelector('[role="dialog"]')) {
      await act(() => view.api.openModal('controlConfig', { id: arrow.id }));
    }
    assert.equal(asInput(field('Forward key')).value, 'w');
    await act(() =>
      assert.rejects(
        view.api.update(arrow.id, { options: { forwardKey: reserved } }),
        /single key/i
      )
    );
  }
  await click(button('Save'));
  for (const reserved of ['Tab', 'Escape', ' ', 'Enter']) await press(reserved);
  assert.deepEqual(speeds(hub), []);
  await press('Enter', button('Forward'));
  await press(' ', button('Backward'));
  assert.deepEqual(speeds(hub), [100, 0, -100, 0]);
});

test('capture saves bindings without commands and conflicting saves preserve the draft', async (t) => {
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'stop', 'A', {
    title: 'Emergency stop',
    options: { stopKey: 'x' },
  });
  const arrow = await create(view, 'arrows');
  await act(() => view.api.speed(arrow.id, 60));
  await click(button('Configure Motor arrows'));
  await press('x', present(field('Forward key')));
  await click(button('Save'));
  assert.match(
    query(document, '[role="dialog"]').textContent,
    /conflicts with Emergency stop/
  );
  assert.equal(asInput(field('Forward key')).value, 'x');
  assert.equal(view.api.controls.get(arrow.id), arrow);
  await press('W', present(field('Forward key')));
  await press('x', present(field('Stop key')));
  await click(button('Save'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(
    controlOf(view.api.controls.get(arrow.id), 'arrows').options.forwardKey,
    'w'
  );
  assert.deepEqual(speeds(hub), [60]);
  await press('w');
  assert.deepEqual(speeds(hub), [60, 100, 0]);
});
