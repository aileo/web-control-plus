import './browser-polyfills.ts';

import { PoweredUP } from 'node-poweredup/dist/poweredup-browser.js';

import * as CONSTS from 'node-poweredup/dist/consts.js';

import type { BaseHub } from 'node-poweredup/dist/hubs/basehub.js';

import { colorFromText } from './hub-colors.ts';

import logger from '../../utils/logger.ts';
import type { DeviceTypeInfo, RawHub } from '../types';

type HubSelector = { mac?: string; uuid?: string };
type HubConstName = 'DeviceType' | 'HubType';

const hubs = new Map<string, BaseHub>();
let scanning = false;

// Convert a numeric LEGO constant to its symbolic name.
function translate(type: HubConstName, value: number): string | undefined {
  const result = CONSTS[type][value];
  return typeof result === 'string' ? result : undefined;
}

// Create a compact device label from its constant name.
function compact(id: string): string {
  return id.split('_').reduce((result, part) => result + part[0], '');
}

// Expose the runtime hub API through the application's raw hub type.
function asRawHub(hub: BaseHub): RawHub {
  // The declared BaseHub API hides the LPF2 two-argument unsubscribe override.
  return hub as RawHub;
}

const lego = {
  CONSTS,
  // Scan for and connect to a LEGO hub with timeout and cleanup handling.
  async add(): Promise<RawHub> {
    if (scanning) throw new Error('A hub scan is already in progress');
    scanning = true;
    return new Promise<RawHub>((resolve, reject) => {
      const client = new PoweredUP();
      let finished = false;
      let hub: BaseHub | undefined;
      let timer: ReturnType<typeof setTimeout>;
      // Connect a discovered hub and resolve the pending scan.
      const discovered = (discoveredHub: BaseHub): void => {
        hub = discoveredHub;
        void (async () => {
          try {
            await hub?.connect();
            if (finished) {
              await hub?.disconnect();
              return;
            }
            if (!hub) return;
            hubs.set(hub.uuid, hub);
            hub.once('disconnect', () => {
              if (hubs.get(discoveredHub.uuid) === discoveredHub)
                hubs.delete(discoveredHub.uuid);
            });
            finish(null, asRawHub(hub));
          } catch (error) {
            Promise.resolve()
              .then(() => hub?.disconnect())
              .catch((disconnectError: unknown) => {
                logger.error('Failed to disconnect hub', disconnectError);
              });
            finish(error);
          }
        })();
      };
      // Settle the scan once and remove its listeners and timer.
      function finish(error?: unknown, result?: RawHub): void {
        if (finished) return;
        finished = true;
        scanning = false;
        clearTimeout(timer);
        client.removeListener('discover', discovered);
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('Hub discovery finished without a hub'));
      }
      timer = setTimeout(() => {
        if (hub) {
          Promise.resolve()
            .then(() => hub?.disconnect())
            .catch((error: unknown) => {
              logger.error('Failed to disconnect timed-out hub', error);
            });
        } else {
          client.once('discover', (lateHub: BaseHub) => {
            Promise.resolve()
              .then(() => lateHub.disconnect())
              .catch((error: unknown) => {
                logger.error('Failed to disconnect timed-out hub', error);
              });
          });
        }
        finish(new Error('Hub discovery or connection timed out'));
      }, 30000);
      client.once('discover', discovered);
      void Promise.resolve()
        .then(() => client.scan())
        .then((success) => {
          if (!success)
            finish(new Error('Bluetooth scan or connection failed'));
        }, finish);
    });
  },

  // Find a connected hub by its MAC address or UUID.
  get({ mac, uuid }: HubSelector): RawHub | null {
    if (mac) {
      const hub = Array.from(hubs.values()).find(
        (candidate) =>
          candidate.uuid === mac || candidate.primaryMACAddress === mac
      );
      return hub ? asRawHub(hub) : null;
    }
    if (uuid) {
      const hub = hubs.get(uuid);
      return hub ? asRawHub(hub) : null;
    }
    return null;
  },

  // Return the stable hardware identity for a hub.
  identity(hub: Pick<BaseHub, 'primaryMACAddress' | 'uuid'>): string {
    return hub.primaryMACAddress &&
      hub.primaryMACAddress !== '00:00:00:00:00:00'
      ? hub.primaryMACAddress
      : hub.uuid;
  },

  // Build typed device metadata from a LEGO constant.
  constToObject(type: HubConstName, value: number): DeviceTypeInfo {
    const text = translate(type, value) || 'UNKNOWN';
    return { num: value, text, compact: compact(text) };
  },

  colorFromText,
};

export default lego;
export { CONSTS };
