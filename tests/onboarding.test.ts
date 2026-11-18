import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import {
  mount,
  fakeHub,
  lego,
  create,
  loadSource,
  click,
  button,
  key,
  input,
  logs,
  visibleText,
} from './helpers/controls.ts';
import {
  asButton,
  asInput,
  inputField,
  present,
  query,
} from './helpers/dom.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const HubList = loadSource('components/modules/hubs/HubList').default;
const Modal = loadSource('components/Modal').default;
const Footer = loadSource('components/Footer').default;
const { HELP_PREFERENCE_KEY } = loadSource('hooks/useHelpPreference');
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(HubList),
    React.createElement(Grid),
    React.createElement(Footer),
    React.createElement(Modal)
  );

test('More help explains all control options and keys without actuating devices', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  await create(view, 'slider', 'A', { options: { increase10Key: 'w' } });
  await create(view, 'power', 'B', { options: { onKey: 'i' } });
  const baseline = hub.devices.LED.rgb.length;
  await click(button('How to use this board'));
  const dialog = query(document, '[role="dialog"]');
  const guide = query(dialog, '[data-board-guide]');
  assert.ok(
    [...dialog.querySelectorAll('button')].every(
      (control) => !/Do not show again|Dismiss tile/.test(visibleText(control))
    )
  );
  assert.equal(dialog.querySelector('input[type="checkbox"]'), null);
  assert.equal(guide.querySelectorAll(':scope > li').length, 4);
  const text = visibleText(guide);
  for (const phrase of [
    'Reverse rotation',
    'Stop on release',
    'Color stability',
    'Progressive',
    'Roll and Pitch',
    'LED lights',
    'Not set yet',
    'Increase by 10',
    'Example, not defaults',
    'Ctrl',
    'physical way to stop',
  ]) {
    assert.ok(text.includes(phrase), phrase);
  }
  assert.equal(
    guide.querySelectorAll('button,input,select,[tabindex]').length,
    0
  );
  await key(document.body, 'keydown', 'w');
  await key(document.body, 'keyup', 'w');
  await key(document.body, 'keydown', 'i');
  await key(document.body, 'keyup', 'i');
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(hub.devices.B.writes.length, 0);
  assert.equal(hub.devices.LED.rgb.length, baseline);
  await click(button('Close', dialog));
  await act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 350);
      })
  );
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, button('How to use this board'));
  assert.equal(view.api.instructions, true);
  assert.ok(document.querySelector('[data-board-instructions]'));
  assert.equal(window.localStorage.getItem(HELP_PREFERENCE_KEY), null);
  await key(document.body, 'keydown', 'i');
  await key(document.body, 'keyup', 'i');
  assert.equal(hub.devices.B.writes.length, 1);
});

test('onboarding groups Connect and the latest online hub shortcut with their steps', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const tile = () => document.querySelector('[data-board-instructions]');
  const connect = button('Connect hub', present(tile()));
  assert.equal(visibleText(connect), '');
  assert.match(
    visibleText(present(connect.closest('li'))),
    /^1\s*Connect your hub\./
  );
  const steps = [...present(tile()).querySelectorAll('ol > li')];
  assert.match(visibleText(steps[0]), /yellow button in the top bar/);
  assert.match(
    visibleText(steps[1]),
    /hub menu.*colored button in the top bar/
  );
  assert.equal(steps.length, 4);
  assert.deepEqual(
    steps.map((step) => query(step, '[data-step-number]').textContent),
    ['1', '2', '3', '4']
  );
  assert.equal(present(tile()).querySelector('[aria-label$="hub menu"]'), null);
  const first = fakeHub();
  first.name = 'First hub';
  const addFirst = lego.add;
  await act(() => view.api.addHub());
  const second = fakeHub('hub-two');
  second.name = 'Second hub';
  await act(() => view.api.addHub());
  let shortcut = button('Open Second hub hub menu', present(tile()));
  const header = button('Second hub actions');
  for (const property of [
    'borderBottomColor',
    'borderRadius',
    'flexDirection',
  ] as const)
    assert.equal(
      window.getComputedStyle(shortcut)[property],
      window.getComputedStyle(header)[property]
    );
  assert.equal(visibleText(shortcut), visibleText(header));
  assert.equal(
    window.getComputedStyle(present(shortcut.parentElement)).justifyContent,
    'space-between'
  );
  assert.match(
    visibleText(present(shortcut.closest('li'))),
    /^2\s*Open a hub menu/
  );
  await click(shortcut);
  await click(shortcut);
  assert.equal(
    button('Second hub actions').getAttribute('aria-expanded'),
    'true'
  );
  await key(present(document.activeElement), 'keydown', 'Escape');
  await act(() => view.api.refresh(first.uuid));
  assert.ok(button('Open Second hub hub menu', present(tile())));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  lego.add = addFirst;
  await act(() => view.api.addHub());
  shortcut = button('Open First hub hub menu', present(tile()));
  await click(shortcut);
  assert.equal(
    button('First hub actions').getAttribute('aria-expanded'),
    'true'
  );
  await key(present(document.activeElement), 'keydown', 'Escape');
  await act(() => view.api.disconnect(first.uuid));
  assert.ok(button('Open Second hub hub menu', present(tile())));
  await act(() => view.api.removeHub(first.uuid));
  assert.ok(button('Open Second hub hub menu', present(tile())));
  await act(() => view.api.disconnect(second.uuid));
  assert.equal(present(tile()).querySelector('[aria-label$="hub menu"]'), null);
  const unnamed = fakeHub('hub-without-name');
  unnamed.name = '';
  await act(() => view.api.addHub());
  assert.ok(button('Open hub-without-name hub menu', present(tile())));
  assert.equal(first.devices.A.speeds.length, 0);
  assert.equal(second.devices.A.speeds.length, 0);
  assert.equal(unnamed.devices.A.speeds.length, 0);
});

test('footer Help stays available after dismissal and returns focus to its own opener', async (t) => {
  const view = await mount(t, { instructions: true, render });
  await click(button('Dismiss tile'));
  assert.equal(document.querySelector('[data-board-instructions]'), null);
  const help = button('Help');
  await act(() => help.focus());
  await click(help);
  assert.ok(query(document, '[role="dialog"] [data-board-guide]'));
  await click(button('Close', query(document, '[role="dialog"]')));
  await act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 350);
      })
  );
  assert.equal(document.activeElement, help);
  assert.equal(view.api.instructions, false);
  assert.equal(document.querySelector('[data-board-instructions]'), null);
});

test('backdrop clicks over the current hub shortcut keep its menu and focus without click-through', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const hub = fakeHub();
  await click(
    button('Connect hub', query(document, '[data-board-instructions]'))
  );
  const shortcut = button('Open Test hub hub menu');
  shortcut.getBoundingClientRect = () => new window.DOMRect(80, 200, 100, 30);
  const backdropClick = async (x: number, y: number) =>
    act(async () => {
      query(document, '.MuiBackdrop-root').dispatchEvent(
        new window.MouseEvent('click', {
          bubbles: true,
          clientX: x,
          clientY: y,
        })
      );
    });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dialog = document.querySelector('[role="dialog"]');
    const focused = document.activeElement;
    await backdropClick(120, 215);
    assert.equal(
      button('Test hub actions').getAttribute('aria-expanded'),
      'true'
    );
    assert.equal(document.querySelector('[role="dialog"]'), dialog);
    assert.equal(document.activeElement, focused);
    assert.equal(hub.devices.A.speeds.length, 0);
    if (attempt === 0) {
      await key(present(document.activeElement), 'keydown', 'Escape');
      assert.equal(
        button('Test hub actions').getAttribute('aria-expanded'),
        null
      );
      await click(shortcut);
    }
  }
  await backdropClick(10, 10);
  assert.equal(button('Test hub actions').getAttribute('aria-expanded'), null);
  await click(shortcut);
  await act(() => view.api.dismissInstructions());
  await backdropClick(120, 215);
  assert.equal(button('Test hub actions').getAttribute('aria-expanded'), null);
});

test('Do not show again persists independently of dismissal and session controls', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const tile = () => document.querySelector('[data-board-instructions]');
  const checkbox = () =>
    present(tile()).querySelector('input[type="checkbox"]');
  await click(present(checkbox()));
  assert.ok(tile());
  assert.equal(window.localStorage.getItem(HELP_PREFERENCE_KEY), 'true');
  await click(present(checkbox()));
  assert.equal(window.localStorage.getItem(HELP_PREFERENCE_KEY), 'false');
  await click(present(checkbox()));
  fakeHub();
  await act(() => view.api.addHub());
  await create(view);
  await click(button('Dismiss tile', present(tile())));
  await view.hideControls();
  await view.showControls();
  assert.equal(tile(), null);
  assert.equal(view.api.instructions, false);
  assert.equal(view.api.occupancy.size, 0);
  assert.equal(view.api.controls.size, 0);
  assert.equal(window.localStorage.length, 1);
  window.localStorage.setItem(HELP_PREFERENCE_KEY, 'false');
  await view.hideControls();
  await view.showControls();
  assert.ok(tile());
});

test('blocked storage explicitly warns, does not claim a saved preference, and still allows dismissal', async (t) => {
  const view = await mount(t, {
    instructions: true,
    render,
    configureWindow(window) {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage blocked');
        },
      });
    },
  });
  assert.match(document.body.textContent, /Cannot read the help preference/);
  const checkbox = document.querySelector(
    '[data-board-instructions] input[type="checkbox"]'
  );
  await click(present(checkbox));
  assert.equal(asInput(checkbox).checked, false);
  assert.match(document.body.textContent, /Cannot save the help preference/);
  assert.ok(logs.some((args) => args[0] === 'Cannot save help preference'));
  await click(button('Dismiss tile'));
  assert.equal(view.api.instructions, false);
  await view.hideControls();
  await view.showControls();
  assert.equal(view.api.instructions, true);
});

test('both Connect buttons share pending state and open the new hub menu only on success', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const hub = fakeHub();
  const { add } = lego;
  let finish: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  lego.add = async () => {
    await waiting;
    return add();
  };
  await click(
    button('Connect hub', query(document, '[data-board-instructions]'))
  );
  const pending = [
    ...document.querySelectorAll('button[aria-label="Connecting hub..."]'),
  ];
  assert.equal(pending.length, 2);
  assert.ok(pending.every((element) => asButton(element).disabled));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await act(async () => {
    present(finish)();
    await waiting;
  });
  assert.equal(view.api.hubs.size, 1);
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(
    button('Test hub actions').getAttribute('aria-expanded'),
    'true'
  );
  assert.ok(button('Create control for A: Big motor'));
  assert.equal(
    view.api.toastMessages.filter((message) => message.level === 'success')
      .length,
    1
  );
  await key(present(document.activeElement), 'keydown', 'Escape');
  assert.equal(button('Test hub actions').getAttribute('aria-expanded'), null);
  await act(() => view.api.refresh(hub.uuid));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(
    [...document.querySelectorAll('button[aria-label="Connect hub"]')].every(
      (element) => !asButton(element).disabled
    )
  );
});

test('connection failure reports once without opening a menu or leaving either button busy', async (t) => {
  const view = await mount(t, { instructions: true, render });
  lego.add = async () => {
    throw new Error('Scan cancelled');
  };
  await click(button('Connect hub', query(document, 'nav')));
  assert.equal(view.api.hubs.size, 0);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(view.api.toastMessages.length, 1);
  assert.equal(view.api.toastMessages[0].text, 'Scan cancelled');
  assert.equal(view.api.toastMessages[0].level, 'error');
  assert.equal(
    document.querySelectorAll('button[aria-label="Connect hub"]').length,
    2
  );
});

test('a completing connection defers its menu without discarding an open settings draft', async (t) => {
  const view = await mount(t, { render });
  fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view);
  const second = fakeHub('hub-two');
  second.name = 'Second hub';
  const { add } = lego;
  let finish: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  lego.add = async () => {
    await waiting;
    return add();
  };
  await click(button('Connect hub'));
  await act(() => view.api.openModal('controlConfig', { id: control.id }));
  const title = document.querySelector('[role="dialog"] input');
  await input(present(title), 'My unsaved draft');
  await act(async () => {
    present(finish)();
    await waiting;
  });
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(
    inputField(document, '[role="dialog"] input').value,
    'My unsaved draft'
  );
  assert.equal(
    button('Second hub actions').getAttribute('aria-expanded'),
    null
  );
  await click(button('Cancel'));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(
    button('Second hub actions').getAttribute('aria-expanded'),
    'true'
  );
  assert.ok(button('Create control for A: Big motor'));
});
