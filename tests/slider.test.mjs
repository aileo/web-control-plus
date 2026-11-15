import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL(
  '../src/components/modules/controls/Slider.jsx',
  import.meta.url
), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
});
const exports = {};
runInNewContext(outputText, {
  exports,
  require: id => id === '../../../core/clients/lego'
    ? { CONSTS: { DeviceType: {} } }
    : require(id),
});
const Slider = exports.default;

function createSlider(isVertical = false) {
  const commands = [];
  const slider = new Slider();
  slider.props = {
    isVertical,
    devices: { motor: { mac: 'test-hub', port: 'A' } },
    actions: { devices: { setSpeed: command => commands.push(command) } },
  };
  slider.setState = state => Object.assign(slider.state, state);
  return { slider, commands };
}

function elements(slider) {
  const root = slider.render();
  const [input, overlay] = root.props.children.props.children;
  return { root, input, overlay, handle: overlay.props.children };
}

test('slider uses a centered native range with a decorative overlay', () => {
  const { slider, commands } = createSlider();
  const { input, overlay, handle } = elements(slider);
  assert.equal(input.type, 'input');
  assert.equal(input.props.type, 'range');
  assert.equal(input.props.min, -100);
  assert.equal(input.props.max, 100);
  assert.equal(input.props.step, '1');
  assert.equal(input.props.value, 0);
  assert.equal(input.props['aria-label'], 'Motor speed');
  assert.equal(input.props['aria-orientation'], 'horizontal');
  assert.equal(overlay.props['aria-hidden'], 'true');
  assert.equal(handle.props.style.left, '50%');
  assert.equal(commands.length, 0);
});

for (const isVertical of [false, true]) {
  test(`slider updates speed and overlay (${isVertical ? 'vertical' : 'horizontal'})`, () => {
    const { slider, commands } = createSlider(isVertical);
    for (const value of [-100, -25, 0, 60, 100]) {
      elements(slider).input.props.onChange({
        target: { valueAsNumber: value },
      });
      const { input, handle } = elements(slider);
      assert.equal(input.props.value, value);
      assert.equal(input.props['aria-orientation'],
        isVertical ? 'vertical' : 'horizontal');
      assert.equal(handle.props.style[isVertical ? 'top' : 'left'],
        `${(value + 100) / 2}%`);
      assert.deepEqual({ ...commands.at(-1) }, {
        mac: 'test-hub', port: 'A', speed: value,
      });
    }
    assert.equal(commands.length, 5);
  });
}

test('slider preserves its selected speed when orientation changes', () => {
  const { slider, commands } = createSlider();
  slider.updateValue({ target: { valueAsNumber: 40 } });
  slider.props = { ...slider.props, isVertical: true };
  const { input, handle } = elements(slider);
  assert.equal(input.props.value, 40);
  assert.equal(handle.props.style.top, '70%');
  assert.equal(commands.length, 1);
});
