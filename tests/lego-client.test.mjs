import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

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
  const { default: lego } = await import('../src/core/clients/lego.js');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const error = await new Promise(resolve => lego.add(resolve));
    assert.match(error.message, /Bluetooth device selection failed: Cancelled/);
  }
  assert.equal(requests, 2);
});

test('connected hubs are indexed and removed when disconnected', async () => {
  const { PoweredUP } = await import(
    'node-poweredup/dist/poweredup-browser.js'
  );
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
    const { default: lego } = await import('../src/core/clients/lego.js');
    const result = await new Promise((resolve, reject) => {
      lego.add((error, value) => (error ? reject(error) : resolve(value)));
    });
    assert.equal(result.hub, hub);
    assert.equal(lego.get({ uuid: 'hub-id' }), hub);
    assert.equal(lego.get({ mac: '01:02:03:04:05:06' }), hub);
    hub.emit('disconnect');
    assert.equal(lego.get({ uuid: 'hub-id' }), undefined);
  } finally {
    PoweredUP.prototype.scan = originalScan;
  }
});

test('a late discovery after timeout cannot replace a later connection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { PoweredUP } = await import(
    'node-poweredup/dist/poweredup-browser.js'
  );
  const originalScan = PoweredUP.prototype.scan;
  const { default: lego } = await import('../src/core/clients/lego.js');
  const current = new EventEmitter();
  Object.assign(current, {
    uuid: 'current',
    primaryMACAddress: '01:02:03:04:05:06',
    connect: async () => {},
  });
  let firstClient;
  let calls = 0;
  let disconnected = false;
  PoweredUP.prototype.scan = function scan() {
    calls += 1;
    if (calls === 1) {
      firstClient = this;
      return new Promise(() => {});
    }
    this.emit('discover', current);
    return Promise.resolve(true);
  };
  try {
    const first = new Promise(resolve => lego.add(resolve));
    t.mock.timers.tick(30000);
    assert.match((await first).message, /timed out/);
    const second = await new Promise((resolve, reject) => {
      lego.add((error, result) => (error ? reject(error) : resolve(result)));
    });
    const late = {
      disconnect: async () => { disconnected = true; },
    };
    firstClient.emit('discover', late);
    await Promise.resolve();
    assert.equal(disconnected, true);
    assert.equal(second.hub, current);
    assert.equal(lego.get({ uuid: 'current' }), current);
    current.emit('disconnect');
  } finally {
    PoweredUP.prototype.scan = originalScan;
    t.mock.timers.reset();
  }
});
