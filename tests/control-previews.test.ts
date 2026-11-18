import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { asHtml, present, query } from './helpers/dom.ts';
import {
  loadSource,
  mount,
  fakeHub,
  click,
  button,
  visibleText,
  staticMarkup,
} from './helpers/controls.ts';

const Preview = loadSource(
  'components/modules/controls/ControlPreview'
).default;
const { SizePreview } = loadSource('components/modules/controls/Size');
const Modal = loadSource('components/Modal').default;
const Grid = loadSource('components/modules/grid/Grid').default;
const { ArrowsFace } = loadSource('components/modules/controls/Arrows');

test('arrow faces form contiguous segments with rounded ends in both orientations and previews', async (t) => {
  await mount(t, {
    render: () =>
      React.createElement(
        React.Fragment,
        null,
        ...[false, true].flatMap((vertical) =>
          [false, true].map((preview) =>
            React.createElement(
              'section',
              {
                key: `${vertical}-${preview}`,
                'data-vertical': vertical,
                'data-preview': preview,
              },
              React.createElement(ArrowsFace, { vertical, preview })
            )
          )
        )
      ),
  });
  for (const section of document.querySelectorAll('section[data-vertical]')) {
    const vertical = asHtml(section).dataset.vertical === 'true';
    const preview = asHtml(section).dataset.preview === 'true';
    const group = section.querySelector('div');
    const segments = [...present(group).children].filter((element) =>
      ['BUTTON', 'SPAN'].includes(element.tagName)
    );
    assert.equal(segments.length, 3);
    const groupStyle = window.getComputedStyle(present(group));
    assert.equal(groupStyle.flexDirection, vertical ? 'column' : 'row');
    assert.equal(groupStyle.justifyContent, 'center');
    assert.equal(parseFloat(groupStyle.gap), 0);
    const corners = vertical
      ? [[8, 8, 0, 0], [0], [0, 0, 8, 8]]
      : [[8, 0, 0, 8], [0], [0, 8, 8, 0]];
    segments.forEach((element, index) => {
      const style = window.getComputedStyle(element);
      assert.equal(element.tagName, preview ? 'SPAN' : 'BUTTON');
      assert.equal(style.width, style.height);
      assert.equal(parseFloat(style.minWidth), 44);
      assert.equal(parseFloat(style.minHeight), 44);
      assert.deepEqual(
        style.borderRadius.split(' ').map(parseFloat),
        corners[index]
      );
      if (index > 0) {
        assert.equal(
          parseFloat(vertical ? style.borderTopWidth : style.borderLeftWidth),
          0
        );
      }
    });
  }
});

test('all previews render without providers and contain no interactive widgets', () => {
  for (const type of [
    'slider',
    'arrows',
    'stop',
    'distance',
    'color',
    'tilt',
    'brightness',
    'power',
    'palette',
    'customColor',
  ] as const) {
    const markup = staticMarkup(
      React.createElement(Preview, { type, hubColor: '#c4e0ff' })
    );
    const dom = new JSDOM(markup);
    assert.ok(
      dom.window.document.querySelector(
        `[data-control-preview="${type}"][aria-hidden="true"]`
      )
    );
    assert.equal(
      dom.window.document.querySelectorAll(
        'input,button,select,[tabindex],[role="switch"],[role="slider"]'
      ).length,
      0
    );
    if (type === 'slider') {
      assert.equal(
        dom.window.document.querySelectorAll('[data-slider-mark]').length,
        21
      );
      assert.match(
        query(dom.window.document, '[data-slider-handle]').textContent,
        /0%/
      );
      assert.doesNotMatch(visibleText(dom.window.document.body), /Stop/);
    }
    if (type === 'stop') {
      assert.match(visibleText(dom.window.document.body), /Stop/);
    }
    if (type === 'color') {
      assert.equal(visibleText(dom.window.document.body), 'Red');
    }
    if (type === 'distance') {
      assert.equal(dom.window.document.querySelectorAll('path').length, 4);
      assert.equal(visibleText(dom.window.document.body), '');
      assert.match(
        present(query(dom.window.document, 'svg').getAttribute('aria-label')),
        /^Distance indicator: (Very close|Close|Far|Very far)$/
      );
    }
    dom.window.close();
  }
});

test('size previews contain exactly one stud per footprint cell, in both orientations', () => {
  for (const [w, h] of [
    [1, 1],
    [2, 2],
    [1, 6],
    [8, 1],
  ]) {
    const markup = staticMarkup(React.createElement(SizePreview, { w, h }));
    const dom = new JSDOM(markup);
    assert.equal(
      dom.window.document.querySelectorAll('[data-stud]').length,
      w * h
    );
    assert.ok(
      dom.window.document.querySelector(`[data-size-preview="${w}x${h}"]`)
    );
    dom.window.close();
  }
});

test('browsing control and size previews never creates controls or invokes hardware', async (t) => {
  const view = await mount(t, {
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
  const subscriptions = hub.subscriptions.length;
  assert.equal(
    document.querySelectorAll('[data-control-board] > [data-stud]').length,
    60
  );
  await act(async () =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'A' })
  );
  await click(button('Choose Motor slider'));
  const previews = [...document.querySelectorAll('[data-size-preview]')];
  assert.equal(previews.length, 7);
  for (const preview of previews) {
    const [w, h] = present(asHtml(preview).dataset.sizePreview)
      .split('x')
      .map(Number);
    assert.equal(preview.querySelectorAll('[data-stud]').length, w * h);
  }
  await click(button('Back'));
  await click(button('Choose Motor arrows'));
  await click(button('Back'));
  await click(button('Choose Stop'));
  assert.ok(button('Create Stop, 1 by 1'));
  assert.ok(button('Create Stop, 2 by 2'));
  await click(button('Cancel'));
  assert.equal(view.api.controls.size, 0);
  assert.equal(hub.devices.A.speeds.length, 0);
  assert.equal(hub.subscriptions.length, subscriptions);
  await act(async () =>
    view.api.openModal('createControl', { uuid: hub.uuid, port: 'B' })
  );
  await click(button('Choose Distance'));
  await click(button('Back'));
  await click(button('Choose Color'));
  assert.ok(button('Create Color, 1 by 1'));
  assert.ok(button('Create Color, 2 by 2'));
  await click(button('Cancel'));
  assert.equal(hub.subscriptions.length, subscriptions);
  assert.equal(view.api.controls.size, 0);
});
