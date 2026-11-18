import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { BaseHub } from 'node-poweredup/dist/hubs/basehub.js';
import { present } from './helpers/dom.ts';

type NotificationListener = (event: { target: { value: DataView } }) => void;

interface TestGatt {
  connect?: () => Promise<object>;
  disconnect(): void;
}

class Characteristic {
  readonly uuid: string;

  readonly listeners = new Set<NotificationListener>();

  readonly writes: number[][] = [];

  private notifying = false;

  constructor(uuid: string) {
    this.uuid = uuid;
  }

  addEventListener(_name: string, listener: NotificationListener) {
    this.listeners.add(listener);
  }

  removeEventListener(_name: string, listener: NotificationListener) {
    this.listeners.delete(listener);
  }

  async startNotifications() {
    this.notifying = true;
  }

  notify(bytes: number[]) {
    if (!this.notifying) return;
    const data = Uint8Array.from(bytes);
    for (const listener of this.listeners) {
      listener({ target: { value: new DataView(data.buffer) } });
    }
  }

  async writeValueWithoutResponse(bytes: Uint8Array) {
    const message = Array.from(bytes);
    this.writes.push(message);
    if (message[2] === 1 && message[4] === 5) {
      const property = message[3];
      let payload;
      if (property === 0x0b) payload = [0x80];
      else if (property === 0x0d) payload = [1, 2, 3, 4, 5, 6];
      else payload = [0, 0, 0, 0];
      const response = [5 + payload.length, 0, 1, property, 6, ...payload];
      setTimeout(() => this.notify(response), 0);
    } else if (message[2] === 0x81) {
      setTimeout(() => this.notify([5, 0, 0x82, message[3], 0x0a]), 10);
    }
  }
}

test('slow discovery still identifies and connects a Technic hub', async () => {
  const serviceId = '00001623-1212-efde-1623-785feabcd123';
  const characteristic = new Characteristic(
    '00001624-1212-efde-1623-785feabcd123'
  );
  const events = new EventEmitter();
  const gatt: TestGatt = { disconnect() {} };
  const peripheral = {
    id: 'fake-hub',
    name: 'Technic',
    addEventListener: events.on.bind(events),
    gatt,
  };
  const server = {
    device: peripheral,
    async getPrimaryService(uuid: string) {
      if (uuid !== serviceId) throw new Error('Unsupported service');
      await new Promise((resolve) => {
        setTimeout(resolve, 2100);
      });
      return { getCharacteristics: async () => [characteristic] };
    },
  };
  gatt.connect = async () => server;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  const client = new PoweredUP();
  const discovered = new Promise<BaseHub>((resolve) => {
    client.once('discover', resolve);
  });
  assert.equal(await client.scan(), true);
  const hub = await discovered;
  assert.equal(hub.type, 6);
  await hub.connect();
  assert.equal(hub.primaryMACAddress, '01:02:03:04:05:06');

  characteristic.notify([7, 0, 4, 0, 1, 46, 0]);
  const motor = present(hub.getDeviceAtPort('A'));
  assert.equal(motor.type, 46);
  assert.ok('setSpeed' in motor && typeof motor.setSpeed === 'function');
  await motor.setSpeed(50, undefined, true);
  assert.ok(
    characteristic.writes.some(
      (write) =>
        write[2] === 0x81 && write[3] === 0 && write[5] === 7 && write[6] === 50
    )
  );
  characteristic.notify([7, 0, 4, 99, 1, 59, 0]);
  const tilt = present(hub.getDeviceAtPort('TILT_SENSOR'));
  tilt.autoSubscribe = false;
  const measurement = new Promise((resolve) => {
    tilt.once('tilt', resolve);
  });
  await hub.subscribe(tilt.portId, tilt.type, 0);
  characteristic.notify([5, 0, 0x47, 99, 0]);
  characteristic.notify([10, 0, 0x45, 99, 5, 0, 20, 0, 10, 0]);
  assert.deepEqual(await measurement, { x: 10, y: 20, z: -5 });
  // Patched browser hubs accept port and mode; the vendor declaration still
  // describes the three-argument form.
  await Reflect.apply(hub.unsubscribe, hub, [tilt.portId, 0]);
  assert.ok(
    characteristic.writes.some(
      (write) => write[2] === 0x41 && write[3] === 99 && write[9] === 0
    )
  );
  characteristic.notify([5, 0, 4, 0, 0]);
  assert.equal(hub.getDeviceAtPort('A'), undefined);
});

test('a stalled Bluetooth discovery disconnects and reports the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let disconnected = false;
  const gatt: TestGatt = {
    disconnect() {
      disconnected = true;
    },
  };
  const peripheral = {
    id: 'stalled-hub',
    name: 'Stalled',
    addEventListener() {},
    gatt,
  };
  const server = {
    device: peripheral,
    getPrimaryService: () => new Promise(() => {}),
  };
  peripheral.gatt.connect = async () => server;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  const scan = new PoweredUP().scan();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  t.mock.timers.tick(20000);
  await assert.rejects(scan, /Hub discovery failed: Hub discovery timed out/);
  assert.equal(disconnected, true);
});

test('Bluetooth connection failures include the underlying error', async () => {
  const peripheral = {
    gatt: {
      connect: async () => {
        throw new Error('Connection refused');
      },
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  await assert.rejects(
    new PoweredUP().scan(),
    /Bluetooth connection failed: Connection refused/
  );
});

test('hub service discovery failures include the underlying error', async () => {
  let disconnected = false;
  const gatt: TestGatt = {
    disconnect() {
      disconnected = true;
    },
  };
  const peripheral = {
    id: 'unavailable-service',
    name: 'Unavailable',
    addEventListener() {},
    gatt,
  };
  const server = {
    device: peripheral,
    getPrimaryService: async (uuid: string) => {
      if (uuid === '00001623-1212-efde-1623-785feabcd123') {
        throw new Error('GATT service unavailable');
      }
      throw new Error('Unsupported service');
    },
  };
  peripheral.gatt.connect = async () => server;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  await assert.rejects(
    new PoweredUP().scan(),
    /Hub discovery failed: GATT service unavailable/
  );
  assert.equal(disconnected, true);
});

test('notification authentication failures are reported without waiting for timeout', async () => {
  const serviceId = '00001623-1212-efde-1623-785feabcd123';
  const characteristic = new Characteristic(
    '00001624-1212-efde-1623-785feabcd123'
  );
  characteristic.startNotifications = async () => {
    throw new Error('Authentication failed.');
  };
  let disconnected = false;
  const gatt: TestGatt = {
    disconnect() {
      disconnected = true;
    },
  };
  const peripheral = {
    id: 'auth-failed',
    name: 'Technic',
    addEventListener() {},
    gatt,
  };
  const server = {
    device: peripheral,
    async getPrimaryService(uuid: string) {
      if (uuid !== serviceId) throw new Error('Unsupported service');
      return { getCharacteristics: async () => [characteristic] };
    },
  };
  peripheral.gatt.connect = async () => server;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  await assert.rejects(
    new PoweredUP().scan(),
    /Hub discovery failed: Authentication failed\./
  );
  assert.equal(disconnected, true);
});

test('an unrecognized hub type reports unsupported instead of timing out', async () => {
  const serviceId = '00001623-1212-efde-1623-785feabcd123';
  const characteristic = new Characteristic(
    '00001624-1212-efde-1623-785feabcd123'
  );
  characteristic.writeValueWithoutResponse = async () => {
    setTimeout(() => characteristic.notify([6, 0, 1, 0x0b, 6, 0x84]), 0);
  };
  let disconnected = false;
  const gatt: TestGatt = {
    disconnect() {
      disconnected = true;
    },
  };
  const peripheral = {
    id: 'unknown-hub',
    name: 'Technic Move',
    addEventListener() {},
    gatt,
  };
  const server = {
    device: peripheral,
    async getPrimaryService(uuid: string) {
      if (uuid !== serviceId) throw new Error('Unsupported service');
      return { getCharacteristics: async () => [characteristic] };
    },
  };
  peripheral.gatt.connect = async () => server;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => peripheral } },
  });
  const { PoweredUP } =
    await import('node-poweredup/dist/poweredup-browser.js');
  await assert.rejects(
    new PoweredUP().scan(),
    /Hub discovery failed: Unsupported hub/
  );
  assert.equal(disconnected, true);
});
