import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { asButton, asHtml, html, present, query } from './helpers/dom.ts';
import {
  mount,
  loadSource,
  fakeHub,
  create,
  click,
  button,
  key,
  pointer,
  DeviceType,
  visibleText,
  staticMarkup,
} from './helpers/controls.ts';

const Grid = loadSource('components/modules/grid/Grid').default;
const Modal = loadSource('components/Modal').default;
const Distance = loadSource('components/modules/controls/Distance').default;
const createBoardPattern = loadSource('core/board-pattern').default;
const render = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Grid),
    React.createElement(Modal)
  );

function seededRandom(seed: number) {
  // Wrap at 32 bits to keep the seeded sequence deterministic.
  // eslint-disable-next-line no-bitwise
  let state = seed >>> 0;
  return () => {
    // eslint-disable-next-line no-bitwise
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function patternSnapshot() {
  return Array.from(
    document.querySelectorAll('[data-control-board] > [data-stud]'),
    (cell) => ({
      plate: asHtml(cell).dataset.plateCell,
      className: cell.className,
    })
  );
}

test('plate patterns exactly cover the board using only supported rectangles and theme colors', () => {
  const allowed = new Set([
    '1x2',
    '2x1',
    '2x2',
    '1x3',
    '3x1',
    '3x2',
    '2x3',
    '2x4',
    '4x2',
    '6x2',
    '2x6',
  ]);
  const seen = new Set();
  const sources = [
    () => 0,
    () => 0.999999,
    ...Array.from({ length: 256 }, (_, seed) =>
      seededRandom(seed * 0x9e3779b1)
    ),
  ];
  for (const random of sources) {
    const cells = new Set();
    for (const plate of createBoardPattern(random)) {
      const { x, y, w, h, color } = plate;
      const size = `${w}x${h}`;
      assert.ok([x, y, w, h].every(Number.isInteger));
      assert.ok(x >= 0 && y >= 0 && x + w <= 10 && y + h <= 6);
      assert.ok(allowed.has(size), `Unexpected plate ${size}`);
      assert.ok(
        ['primary', 'info', 'success', 'error', 'secondary'].includes(color)
      );
      seen.add(size);
      for (let row = y; row < y + h; row += 1) {
        for (let column = x; column < x + w; column += 1) {
          const cell = `${column},${row}`;
          assert.ok(!cells.has(cell), `Overlapping stud ${cell}`);
          cells.add(cell);
        }
      }
    }
    assert.equal(cells.size, 60);
  }
  assert.deepEqual(seen, allowed);
  assert.equal(
    JSON.stringify(createBoardPattern(seededRandom(123))),
    JSON.stringify(createBoardPattern(seededRandom(123)))
  );
  assert.notEqual(
    JSON.stringify(createBoardPattern(seededRandom(123))),
    JSON.stringify(createBoardPattern(seededRandom(456)))
  );
});

test('fresh instructions reserve nine cells, open help, and stay dismissed until a fresh provider', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const pattern = patternSnapshot();
  assert.equal(pattern.length, 60);
  const cells = [...document.querySelectorAll('[data-plate-cell]')];
  assert.equal(
    new Set(
      cells.map((cell) => {
        const style = window.getComputedStyle(cell);
        return `${style.gridColumn},${style.gridRow}`;
      })
    ).size,
    60
  );
  for (const outline of document.querySelectorAll('[data-board-plate]')) {
    const members = cells.filter(
      (cell) =>
        asHtml(cell).dataset.plateCell === asHtml(outline).dataset.plateId
    );
    const [w, h] = present(asHtml(outline).dataset.boardPlate)
      .split('x')
      .map(Number);
    const colors = members.map(
      (cell) => window.getComputedStyle(cell).backgroundColor
    );
    assert.equal(members.length, w * h);
    assert.equal(new Set(colors).size, 1);
    assert.match(colors[0], /^rgb\(/);
    assert.equal(outline.getAttribute('aria-hidden'), 'true');
    assert.equal(window.getComputedStyle(outline).pointerEvents, 'none');
  }
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const subscriptions = hub.subscriptions.length;
  assert.equal(view.api.controls.size, 0);
  const reserved = [...view.api.occupancy.values()][0];
  assert.deepEqual(
    [reserved.x, reserved.y, reserved.w, reserved.h],
    [0, 0, 3, 3]
  );
  assert.ok(document.querySelector('[data-board-instructions]'));
  await click(button('How to use this board'));
  assert.match(
    query(document, '[role="dialog"]').textContent,
    /Connect your hub/
  );
  await click(button('Close'));
  assert.equal(view.api.instructions, true);
  await click(
    button('Dismiss tile', query(document, '[data-board-instructions]'))
  );
  assert.equal(view.api.instructions, false);
  assert.equal(view.api.occupancy.size, 0);
  assert.equal(document.querySelector('[data-board-instructions]'), null);
  assert.deepEqual(patternSnapshot(), pattern);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(hub.subscriptions.length, subscriptions);
  const motor = await create(view, 'slider', 'A', { w: 2, h: 1 });
  assert.deepEqual([motor.x, motor.y], [0, 0]);
  assert.deepEqual(patternSnapshot(), pattern);
  await act(() => view.api.remove(motor.id));
  assert.deepEqual(patternSnapshot(), pattern);
  assert.equal(view.api.instructions, false);
  await view.hideControls();
  await view.showControls();
  assert.equal(view.api.instructions, true);
  assert.ok(document.querySelector('[data-board-instructions]'));
  assert.deepEqual(patternSnapshot(), pattern);
});

test('reserved instructions block occupied gestures and placement until dismissed', async (t) => {
  const view = await mount(t, { instructions: true, render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const first = await create(view, 'distance', 'B', { w: 2, h: 2 });
  assert.deepEqual([first.x, first.y], [3, 0]);
  await act(async () => {
    await assert.rejects(
      view.api.update(first.id, { x: 0, y: 0 }),
      /empty position/
    );
  });
  const move = button('Move Distance');
  await key(move, 'keydown', 'Enter');
  await key(move, 'keydown', 'ArrowLeft');
  await key(move, 'keydown', 'ArrowLeft');
  assert.equal(document.querySelector('[data-layout-preview]'), null);
  await key(move, 'keydown', 'Enter');
  assert.equal(view.api.controls.get(first.id), first);
  const board = document.querySelector('[data-control-board]');
  present(board).getBoundingClientRect = () =>
    new window.DOMRect(0, 0, 360, 216);
  await pointer(button('Move Distance'), 'pointerdown', {
    clientX: 80,
    clientY: 10,
  });
  await pointer(present(board), 'pointermove', { clientX: 8, clientY: 10 });
  assert.equal(
    html(document, '[data-layout-preview]').dataset.layoutPreview,
    'invalid'
  );
  await pointer(present(board), 'pointerup', { clientX: 8, clientY: 10 });
  assert.equal(view.api.controls.get(first.id), first);
  for (let i = 0; i < 9; i += 1)
    await create(view, 'distance', 'B', { w: 2, h: 2 });
  while (view.api.occupancy.size < 22) await create(view, 'distance', 'B');
  assert.match(document.body.textContent, /Board full/);
  await act(async () =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'B' })
  );
  await click(button('Choose Distance'));
  assert.equal(asButton(button('Create Distance, 1 by 1')).disabled, true);
  assert.equal(asButton(button('Create Distance, 2 by 2')).disabled, true);
  await click(button('Cancel'));
  await click(button('Dismiss tile'));
  const last = await create(view, 'distance', 'B', { w: 2, h: 2 });
  assert.deepEqual([last.x, last.y], [0, 0]);
  assert.equal(view.api.controls.size, 22);
  assert.equal(hub.devices.A.speeds.length, 0);
});

test('board fits resize measurements and gestures keep working at different scales', async (t) => {
  let rect = { width: 360, height: 216 };
  const observers: { resize(): void; disconnected: boolean }[] = [];
  class TestResizeObserver implements ResizeObserver {
    disconnected = false;

    constructor(privateCallback: ResizeObserverCallback) {
      this.callback = privateCallback;
      observers.push(this);
    }

    private readonly callback: ResizeObserverCallback;

    observe(element: Element) {
      element.getBoundingClientRect = () =>
        new window.DOMRect(0, 0, rect.width, rect.height);
      this.resize();
    }

    resize() {
      this.callback([], this);
    }

    unobserve() {
      this.disconnect();
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  globalThis.ResizeObserver = TestResizeObserver;
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  const view = await mount(t, { render });
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const motor = await create(view, 'slider', 'A', { w: 2, h: 1 });
  const board = document.querySelector('[data-control-board]');
  const frame = document.querySelector('[data-board-frame]');
  const pattern = patternSnapshot();
  assert.equal(
    window.getComputedStyle(present(board)).transform,
    'scale(0.25)'
  );
  assert.equal(window.getComputedStyle(present(frame)).width, '360px');
  assert.equal(window.getComputedStyle(present(frame)).height, '216px');
  present(board).getBoundingClientRect = () =>
    new window.DOMRect(100, 50, rect.width, rect.height);
  await pointer(button('Move Motor slider'), 'pointerdown', {
    clientX: 104,
    clientY: 54,
  });
  await pointer(present(board), 'pointerup', { clientX: 212, clientY: 126 });
  assert.deepEqual(
    [
      present(view.api.controls.get(motor.id)).x,
      present(view.api.controls.get(motor.id)).y,
    ],
    [3, 2]
  );
  rect = { width: 180, height: 108 };
  await act(async () => observers[0].resize());
  assert.equal(
    window.getComputedStyle(present(board)).transform,
    'scale(0.125)'
  );
  assert.equal(window.getComputedStyle(present(frame)).width, '180px');
  await pointer(button('Resize Motor slider'), 'pointerdown', {
    clientX: 190,
    clientY: 90,
  });
  await pointer(present(board), 'pointerup', { clientX: 226, clientY: 90 });
  assert.equal(present(view.api.controls.get(motor.id)).w, 4);
  rect = { width: 2880, height: 1728 };
  await act(async () => observers[0].resize());
  assert.equal(window.getComputedStyle(present(board)).transform, 'scale(2)');
  assert.equal(window.getComputedStyle(present(frame)).width, '2880px');
  assert.equal(window.getComputedStyle(present(frame)).height, '1728px');
  await pointer(button('Move Motor slider'), 'pointerdown', {
    clientX: 110,
    clientY: 60,
  });
  await pointer(present(board), 'pointerup', { clientX: 398, clientY: 348 });
  assert.deepEqual(
    [
      present(view.api.controls.get(motor.id)).x,
      present(view.api.controls.get(motor.id)).y,
    ],
    [4, 3]
  );
  await pointer(button('Resize Motor slider'), 'pointerdown', {
    clientX: 110,
    clientY: 60,
  });
  await pointer(present(board), 'pointerup', { clientX: 686, clientY: 60 });
  assert.equal(present(view.api.controls.get(motor.id)).w, 6);
  for (const viewport of [
    { width: 4000, height: 1728 },
    { width: 2880, height: 2400 },
  ]) {
    rect = viewport;
    await act(async () => observers[0].resize());
    assert.equal(window.getComputedStyle(present(board)).transform, 'scale(2)');
    assert.equal(window.getComputedStyle(present(frame)).width, '2880px');
    assert.equal(window.getComputedStyle(present(frame)).height, '1728px');
  }
  rect = { width: 360, height: 216 };
  await act(async () => observers[0].resize());
  assert.equal(
    window.getComputedStyle(present(board)).transform,
    'scale(0.25)'
  );
  assert.deepEqual(patternSnapshot(), pattern);
  assert.equal(hub.devices.A.speeds.length, 0);
  await view.unmount();
  assert.equal(observers[0].disconnected, true);
});

test('distance uses smoother near-to-far bands without numeric readings for both sensors', () => {
  const descriptions = ['Very close', 'Close', 'Far', 'Very far'];
  const sensorCases: [number, number, number[], [number, number][]][] = [
    [
      DeviceType.COLOR_DISTANCE_SENSOR,
      234,
      [14.625, 58.5, 131.625],
      [
        [5, 0],
        [30, 1],
        [81, 2],
        [157, 3],
      ],
    ],
    [
      DeviceType.MOTION_SENSOR,
      5100,
      [318.75, 1275, 2868.75],
      [
        [100, 0],
        [500, 1],
        [2000, 2],
        [4000, 3],
      ],
    ],
  ];
  for (const [type, maximum, boundaries, samples] of sensorCases) {
    for (const [value, expected] of [
      [-10, 0],
      [0, 0],
      ...boundaries.flatMap((boundary, index) => [
        [boundary - 0.0001, index],
        [boundary, index + 1],
        [boundary + 0.0001, index + 1],
      ]),
      ...samples,
      [maximum, 3],
      [maximum * 2, 3],
    ]) {
      const dom = new JSDOM(
        staticMarkup(
          React.createElement(Distance, {
            control: { w: 1 },
            device: { type: { num: type }, events: { distance: [value] } },
          })
        )
      );
      const paths = [...dom.window.document.querySelectorAll('path')];
      assert.equal(paths.length, 4);
      assert.deepEqual(
        paths.flatMap((p, index) =>
          present(p.getAttribute('stroke')).startsWith('rgba') ? [] : [index]
        ),
        [expected]
      );
      assert.equal(dom.window.document.querySelector('p'), null);
      assert.equal(
        query(dom.window.document, 'svg').getAttribute('aria-label'),
        `Distance indicator: ${descriptions[expected]}`
      );
      assert.equal(visibleText(dom.window.document.body), '');
      dom.window.close();
    }
  }
  for (const value of [undefined, NaN, Infinity]) {
    const markup = staticMarkup(
      React.createElement(Distance, {
        control: { w: 1 },
        device: {
          type: { num: DeviceType.COLOR_DISTANCE_SENSOR },
          events: { distance: value === undefined ? [] : [value] },
        },
      })
    );
    assert.match(markup, /Waiting for distance/);
    assert.doesNotMatch(markup, /<svg/);
  }
  const unsupported = staticMarkup(
    React.createElement(Distance, {
      control: { w: 1 },
      device: { type: { num: -1 }, events: { distance: [10] } },
    })
  );
  assert.match(unsupported, /Distance range unavailable/);
  assert.doesNotMatch(unsupported, /<svg/);
});

test('linear distance scale changes exactly at each quarter for both sensor ranges', () => {
  for (const [type, maximum] of [
    [DeviceType.COLOR_DISTANCE_SENSOR, 234],
    [DeviceType.MOTION_SENSOR, 5100],
  ]) {
    const boundaries = [maximum / 4, maximum / 2, (maximum * 3) / 4];
    for (const [value, expected] of [
      [-1, 0],
      [0, 0],
      [maximum, 3],
      [maximum * 2, 3],
      ...boundaries.flatMap((boundary, index) => [
        [boundary - 0.0001, index],
        [boundary, index + 1],
        [boundary + 0.0001, index + 1],
      ]),
    ]) {
      const dom = new JSDOM(
        staticMarkup(
          React.createElement(Distance, {
            control: { w: 1, options: { scale: 'linear' } },
            device: { type: { num: type }, events: { distance: [value] } },
          })
        )
      );
      const paths = [...dom.window.document.querySelectorAll('path')];
      assert.deepEqual(
        paths.flatMap((p, index) =>
          present(p.getAttribute('stroke')).startsWith('rgba') ? [] : [index]
        ),
        [expected]
      );
      assert.equal(visibleText(dom.window.document.body), '');
      dom.window.close();
    }
  }
});
