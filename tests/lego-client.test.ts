import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { present } from './helpers/dom.ts';

test('cancelled Bluetooth scans report failure and allow another attempt', async () => {
  let requests = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      bluetooth: {
        requestDevice: async () => {
          requests += 1;
          throw new Error('Cancelled');
        },
      },
    },
  });
  const { default: lego } = await import('../src/core/clients/lego.ts');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      lego.add(),
      /Bluetooth device selection failed: Cancelled/
    );
  }
  assert.equal(requests, 2);
});

test('connected hubs are indexed and removed when disconnected', async () => {
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  const originalScan = PoweredUP.prototype.scan;
  const hub = new EventEmitter();
  Object.assign(hub, {
    uuid: 'hub-id',
    primaryMACAddress: '01:02:03:04:05:06',
    connect: async () => {},
  });

  PoweredUP.prototype.scan = async function scan() {
    this.emit('discover', hub);
    return true;
  };
  try {
    const { default: lego } = await import('../src/core/clients/lego.ts');
    const result = await lego.add();
    assert.equal(result, hub);
    assert.equal(lego.get({ uuid: 'hub-id' }), hub);
    assert.equal(lego.get({ mac: '01:02:03:04:05:06' }), hub);
    hub.emit('disconnect');
    assert.equal(lego.get({ uuid: 'hub-id' }), null);
  } finally {
    PoweredUP.prototype.scan = originalScan;
  }
});

test('a late discovery after timeout cannot replace a later connection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  const originalScan = PoweredUP.prototype.scan;
  const { default: lego } = await import('../src/core/clients/lego.ts');
  const current = new EventEmitter();
  Object.assign(current, {
    uuid: 'current',
    primaryMACAddress: '01:02:03:04:05:06',
    connect: async () => {},
  });

  const clients: InstanceType<typeof PoweredUP>[] = [];
  let calls = 0;
  let disconnected = false;
  PoweredUP.prototype.scan = function scan() {
    calls += 1;
    if (calls === 1) {
      clients.push(this);
      return new Promise(() => {});
    }
    this.emit('discover', current);
    return Promise.resolve(true);
  };
  try {
    const first = lego.add();
    const rejection = assert.rejects(first, /timed out/);
    await Promise.resolve();
    t.mock.timers.tick(30000);
    await rejection;
    const second = await lego.add();
    const late = {
      disconnect: async () => {
        disconnected = true;
      },
    };
    present(clients[0]).emit('discover', late);
    await Promise.resolve();
    assert.equal(disconnected, true);
    assert.equal(second, current);
    assert.equal(lego.get({ uuid: 'current' }), current);
    current.emit('disconnect');
  } finally {
    PoweredUP.prototype.scan = originalScan;
    t.mock.timers.reset();
  }
});

test('add stays pending until connect completes and prevents concurrent scans', async () => {
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  const originalScan = PoweredUP.prototype.scan;
  const { default: lego } = await import('../src/core/clients/lego.ts');
  let finish: (() => void) | undefined;
  const hub = new EventEmitter();
  Object.assign(hub, {
    uuid: 'connecting',
    connect: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    disconnect: async () => {},
  });
  PoweredUP.prototype.scan = async function scan() {
    this.emit('discover', hub);
    return true;
  };
  try {
    let settled = false;
    const pending = lego.add();
    pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.equal(settled, false);
    await assert.rejects(lego.add(), /already in progress/);
    present(finish)();
    assert.equal(await pending, hub);
    hub.emit('disconnect');
  } finally {
    PoweredUP.prototype.scan = originalScan;
  }
});
