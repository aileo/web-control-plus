// eslint-disable-next-line import/no-unresolved, import/extensions
import { PoweredUP } from 'node-poweredup/dist/poweredup-browser.js';
// eslint-disable-next-line import/no-unresolved, import/extensions
import * as CONSTS from 'node-poweredup/dist/consts.js';
import tinycolor from 'tinycolor2';
// eslint-disable-next-line import/extensions
import logger from '../../utils/logger.js';

const hubs = new Map();
let scanning = false;

/**
 * Translate from consts
 * @param {String} type
 * @param {String|Number} value
 * @return {String|Number}
 */
function translate(type, value) {
  return CONSTS[type][value];
}

/**
 * Returns initials from consts name
 * E.g: BOOST_MOVE_HUB => BMH
 * @param {String} id
 * @return {String}
 */
function compact(id) {
  return id.split('_').reduce((str, part) => str + part[0], '');
}

export default {
  CONSTS,
  /**
   * Associate new hub to the application
   * @param {Function} callback
   */
  add(callback = () => {}) {
    if (scanning) {
      callback(new Error('A hub scan is already in progress'));
      return;
    }
    scanning = true;
    const client = new PoweredUP();
    let finished = false;
    let hub;
    let timer;
    let discovered;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      scanning = false;
      clearTimeout(timer);
      client.removeListener('discover', discovered);
      callback(error, result);
    };
    discovered = async discoveredHub => {
      hub = discoveredHub;
      try {
        await hub.connect();
        if (finished) {
          await hub.disconnect();
          return;
        }
        hubs.set(hub.uuid, hub);
        hub.once('disconnect', () => {
          if (hubs.get(hub.uuid) === hub) hubs.delete(hub.uuid);
        });
        finish(null, { hub });
      } catch (error) {
        Promise.resolve().then(() => hub.disconnect())
          .catch(disconnectError => {
            logger.error('Failed to disconnect hub', disconnectError);
          });
        finish(error);
      }
    };
    timer = setTimeout(() => {
      if (hub) {
        Promise.resolve().then(() => hub.disconnect()).catch(error => {
          logger.error('Failed to disconnect timed-out hub', error);
        });
      } else {
        client.once('discover', lateHub => {
          Promise.resolve().then(() => lateHub.disconnect()).catch(error => {
            logger.error('Failed to disconnect timed-out hub', error);
          });
        });
      }
      finish(new Error('Hub discovery or connection timed out'));
    }, 30000);
    client.once('discover', discovered);
    client.scan().then(success => {
      if (!success) finish(new Error('Bluetooth scan or connection failed'));
    }, finish);
  },

  /**
   * Get hub object from its mac or uuid
   * @param {Object} selectors
   */
  get({ mac, uuid }) {
    if (mac) {
      return Array.from(hubs.values()).find(
        hub => hub.uuid === mac || hub.primaryMACAddress === mac
      );
    }

    if (uuid) {
      return hubs.get(uuid);
    }

    return null;
  },

  identity(hub) {
    return hub.primaryMACAddress
      && hub.primaryMACAddress !== '00:00:00:00:00:00'
      ? hub.primaryMACAddress : hub.uuid;
  },

  /**
   * Call hub method with params
   * @param {String} mac
   * @param {String} action
   * @param {Array} params
   * @param {Function} callback
   */
  action(selector, action, params = [], callback = () => {}) {
    const hub = this.get(selector);

    if (!hub) {
      return callback(40400);
    }

    if (!hub[action]) {
      return callback(40401);
    }

    return hub[action](...params).then(
      results => callback(null, results),
      err => callback(err)
    );
  },

  /**
   * Convert number from const to object
   * @param {String} type
   * @param {Number} value
   * @return {Object}
   */
  constToObject(type, value) {
    const text = translate(type, value) || 'UNKNOWN';
    return {
      num: value,
      text,
      compact: compact(text),
    };
  },

  /**
   * Generate color from text
   * Used to generate "unique" color for hubs from their uuid
   * @param {String} txt
   * @return {Object}
   */
  colorFromText(txt) {
    const h = txt.split('').reduce((sum, char) => sum + char.charCodeAt(), 0);
    const color = tinycolor({ h: h % 180 * 2, s: 1, l: 0.5 });
    return {
      hex: color.toHexString(),
      rgb: color.toRgb(),
    };
  },
};

export { CONSTS };
