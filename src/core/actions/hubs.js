import { waterfall, whilst } from 'async';
import { pick } from 'lodash';

const registerEvents = [
  'attach',
  'detach',
];
const deviceEvents = [
  'accel',
  'button',
  'color',
  'colorAndDistance',
  'distance',
  'rotate',
  'speed',
  'temp',
  'tilt',
];

const hubTimeout = {};

/**
 * Helper to get hub's system data
 * @param {Object} hub
 */
function getSystemInfo(hub) {
  return pick(hub, [
    'firmware',
    'batteryLevel',
    'current',
    'voltage',
    'rssi',
  ]);
}

export default {
  /**
   * Search for new hub to add
   */
  add({ callback, clients, actions }) {
    waterfall(
      [
        // Get hub from client scan
        cb => clients.lego.add(cb),
        // register new hub in state
        ({ hub }, cb) => actions.hubs.register({ hub }, err => cb(err, hub)),
        (hub, cb) => {
          // wait for the MAC address to be synchronized
          whilst(
            testCb => testCb(
              null,
              hub.primaryMACAddress === '00:00:00:00:00:00'
            ),
            iterateeCb => setTimeout(() => iterateeCb(), 100),
            () => cb(null, hub)
          );
        },
        // Bootstrap hub (led color, event listeners)
        (hub, cb) => actions.hubs.bootsrap({ hub }, err => cb(err, hub)),
        // Init hub refresh timeout
        (hub, cb) => {
          actions.hubs.resetTimeout(hub);
          cb(null, hub);
        },
      ],
      callback
    );
  },

  selectByUuid({ state }, { uuid }) {
    return state.select('hubs', { uuid });
  },

  selectByMac({ state }, { mac }) {
    return state.select('hubs', { mac });
  },

  /**
   * Add hub information to state
   * @param {LPF2Hub} hub
   */
  register({ clients, state, actions, callback }, { hub }) {
    const { lego } = clients;
    // Add generic hub information to state
    const hubInfo = {
      uuid: hub.uuid,
      name: hub.name,
      mac: hub.primaryMACAddress,
      online: true,
      type: lego.constToObject('HubType', hub.getHubType()),
      color: lego.colorFromText(hub.uuid).hex,
      system: getSystemInfo(hub),
    };
    const cursor = actions.hubs.selectByUuid({ uuid: hub.uuid });
    if (cursor.exists()) {
      cursor.set(hubInfo);
    } else {
      state.select('hubs').push(hubInfo);
    }

    state.once('update', () => callback());
  },

  /**
   * Set builtin LED to color determined from uuid
   * @param {String} id
   */
  setLED({ clients, callback }, { hub }) {
    const { lego } = clients;
    const { rgb } = lego.colorFromText(hub.uuid);
    lego.action(
      { uuid: hub.uuid },
      'setLEDRGB',
      // HACK : green and blue leds are brighter than red ones
      // Lower G & B values then to match the screen display
      [rgb.r, rgb.g * 0.5, rgb.b * 0.5],
      err => callback(err)
    );
  },

  /**
   * Apply some initial action to newly associated hub
   * @param {String} id
   */
  bootsrap({ actions, callback }, { hub }) {
    waterfall(
      [
        // Set hub LED
        cb => actions.hubs.setLED({ hub }, cb),
        cb => {
          // register devices
          Object.keys(hub._ports).forEach(portName => {
            actions.devices.register({ hub, portName });
          });

          // Attach to some event (registerEvents)
          // to refresh hub's devices local state
          registerEvents.forEach(event => {
            hub.on(event, portName => actions.devices.register({
              hub,
              portName,
            }));
          });

          // Attach to some event (registerEvents)
          // to refresh hub's devices measurements state
          deviceEvents.forEach(event => {
            hub.on(event, (portName, ...data) => actions.devices.update({
              hub,
              portName,
              event,
              data,
            }));
          });

          cb();
        },
      ],
      callback
    );
  },

  /**
   * Clear hub refresh timeout by uuid
   * @param {String} uuid
   */
  clearTimeout(ctx, { uuid }) {
    if (hubTimeout[uuid]) {
      clearTimeout(hubTimeout[uuid]);
    }
  },

  /**
   * Reset hub refresh timeout by uuid
   * @param {String} uuid
   */
  resetTimeout({ actions }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    hubTimeout[uuid] = setTimeout(() => actions.hubs.update({ uuid }), 1000);
  },

  /**
   * Update hub local state by uuid
   * @param {String} uuid
   */
  update({ clients, state, actions, callback }, { uuid }) {
    const { lego } = clients;
    /**
     * reset hub refresh timeout
     * prevent this method from being call too often when already call from
     * an event (updateEvents).
     */
    actions.hubs.resetTimeout({ uuid });

    // get hub from client
    const hub = lego.get({ uuid });
    if (!hub) {
      actions.hubs.clearTimeout({ uuid });
      return callback(40400);
    }

    // update state with collected data
    const hubData = actions.hubs.selectByUuid({ uuid });

    hubData.set('name', hub.name);
    hubData.set('mac', hub.primaryMACAddress);
    hubData.set('online', true);
    hubData.set('system', getSystemInfo(hub));

    state.once('update', () => callback());
    return null;
  },

  /**
   * Disconnect from hub by uuid
   * @param {String} uuid
   */
  disconnect({ clients, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    actions.hubs.selectByUuid({ uuid }).set('online', false);
    clients.lego.action({ uuid }, 'disconnect', undefined, callback);
  },

  /**
   * Shutdown hub by uuid
   * @param {String} uuid
   */
  shutdown({ clients, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    actions.hubs.selectByUuid({ uuid }).set('online', false);
    clients.lego.action({ uuid }, 'shutdown', undefined, callback);
  },

  /**
   * Remove hub by uuid
   * @param {String} uuid
   */
  remove({ state, actions }, { uuid }) {
    const data = actions.hubs.selectByUuid({ uuid });
    state
      .get('devices')
      .filter(d => d.mac === data.get('mac'))
      .forEach(({ mac, port }) => actions.devices.remove({ mac, port }));
    data.unset();
  },

  /**
   * Rename hub
   * @param {String} uuid
   * @param {String} name
   */
  rename({ clients, callback }, { uuid, name }) {
    clients.lego.action({ uuid }, 'setName', [name], callback);
  },
};
