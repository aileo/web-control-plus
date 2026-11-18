import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
import type { Device } from 'node-poweredup/dist/devices/device.js';
import type { IDeviceInterface } from 'node-poweredup/dist/interfaces.js';
import { present } from './helpers/dom.ts';

const require = createRequire(import.meta.url);

test('browser polyfills provide Buffer and nextTick to transmit LED RGB commands', async () => {
  const context: {
    Buffer?: typeof Buffer;
    process?: Pick<NodeJS.Process, 'nextTick'>;
    exports: { send?: Device['sendPortOutputCommand'] };
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    require: (id: string) => unknown;
  } = {
    setTimeout,
    clearTimeout,
    exports: {},
    require: (id) => {
      if (id === 'buffer') return require('buffer/');
      if (id === 'process') return require('process/browser');
      throw new Error(`Unexpected browser polyfill import: ${id}`);
    },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(
      new URL('../src/core/clients/browser-polyfills.ts', import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }
  );
  runInNewContext(outputText, context);
  assert.equal(typeof context.Buffer, 'function');
  assert.equal(typeof context.process?.nextTick, 'function');

  const { HubLED } = await import('node-poweredup/dist/devices/hubled.js');
  const { Device } = await import('node-poweredup/dist/devices/device.js');
  const { HubType } = await import('node-poweredup/dist/consts.js');
  // Run the real output queue with browser globals, not Node's process/Buffer.
  const method = Device.prototype.sendPortOutputCommand.toString();
  const { PortOutputCommand } =
    await import('node-poweredup/dist/portoutputcommand.js');
  Object.assign(context, { PortOutputCommand, Consts: {} });
  runInNewContext(
    `exports.send = ({ ${method} }).sendPortOutputCommand;`,
    context
  );
  const packets: number[][] = [];
  const hub: IDeviceInterface = Object.assign(new EventEmitter(), {
    type: HubType.MOVE_HUB,
    getPortNameForPortId: () => 'LED',
    isPortVirtual: () => false,
    subscribe: async () => {},
    sleep: (delay: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      }),
    send: async (bytes: Buffer) => {
      packets.push([...bytes]);
    },
  });
  const led = new HubLED(hub, 50);
  led.sendPortOutputCommand = present(context.exports.send);
  led.setRGB(255, 0, 34);
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  assert.deepEqual(packets, [[0x81, 50, 1, 0x51, 1, 255, 0, 34]]);
});
