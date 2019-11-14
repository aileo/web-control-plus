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
        ({ hub }, cb) => {
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
        // register new hub in state
        (hub, cb) => actions.hubs.register({
          id: hub.primaryMACAddress,
        }, cb),
        // Bootstrap hub (led color, event listeners)
        (hub, cb) => actions.hubs.bootsrap({ id: hub.primaryMACAddress }, cb),
        // Init hub refresh timeout
        (hub, cb) => {
          actions.hubs.resetTimeout({ id: hub.primaryMACAddress });
          cb(null, hub);
        },
      ],
      callback
    );
  },

  /**
   * Add hub information to state
   * @param {String} id
   */
  register({ callback, clients, state, actions }, { id }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(id, cb),
        (hub, cb) => {
          // Add generic hub information to state
          state.select('hubs').set(id, {
            id,
            uuid: hub.uuid,
            name: hub.name,
            type: lego.constToObject('HubType', hub.getHubType()),
            color: lego.colorFromText(hub.uuid).hex,
            system: getSystemInfo(hub),
          });

          // register devices
          Object.keys(hub._ports).forEach(portName => {
            actions.devices.register({ hubId: id, portName });
          });

          state.once('update', () => cb(null, hub));
        },
      ],
      callback
    );
  },

  /**
   * Set builtin LED to color determined from uuid
   * @param {String} id
   */
  setLED({ clients, callback }, { id }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(id, cb),
        (hub, cb) => {
          const { rgb } = lego.colorFromText(hub.uuid);
          lego.action(
            id,
            'setLEDRGB',
            // HACK : green and blue leds are brighter than red ones
            // Lower G & B values then to match the screen display
            [rgb.r, rgb.g * 0.5, rgb.b * 0.5],
            err => cb(err, hub)
          );
        },
      ],
      callback
    );
  },

  /**
   * Apply some initial action to newly associated hub
   * @param {String} id
   */
  bootsrap({ actions, callback }, { id }) {
    waterfall(
      [
        // Set hub LED
        cb => actions.hubs.setLED({ id }, cb),
        // Unsuscribe to TILT event (as they spam, at least on BOOST MOVE HUB)
        (hub, cb) => hub.unsubscribe('TILT').then(
          () => cb(null, hub),
          // ignore error on this one
          () => cb(null, hub)
        ),
        (hub, cb) => {
          // Attach to some event (registerEvents)
          // to refresh hub's devices local state
          registerEvents.forEach(event => {
            hub.on(event, portName => actions.devices.register({
              hubId: id,
              portName,
            }));
          });

          // Attach to some event (registerEvents)
          // to refresh hub's devices measurements state
          deviceEvents.forEach(event => {
            hub.on(event, (portName, ...data) => actions.devices.update({
              hubId: id,
              portName,
              event,
              data,
            }));
          });

          cb(null, hub);
        },
      ],
      callback
    );
  },

  /**
   * Clear hub refresh timeout by uuid
   * @param {String} uuid
   */
  clearTimeout(ctx, { id }) {
    if (hubTimeout[id]) {
      clearTimeout(hubTimeout[id]);
    }
  },

  /**
   * Reset hub refresh timeout by id
   * @param {String} id
   */
  resetTimeout({ actions }, { id }) {
    actions.hubs.clearTimeout({ id });
    hubTimeout[id] = setTimeout(() => actions.hubs.update({ id }), 1000);
  },

  /**
   * Update hub local state by id
   * @param {String} id
   */
  update({ clients, state, actions, callback }, { id }) {
    const { lego } = clients;
    /**
     * reset hub refresh timeout
     * prevent this method from being call too often when already call from
     * an event (updateEvents).
     */
    actions.hubs.resetTimeout({ id });

    // get hub from client
    lego.get(id, (err, hub) => {
      if (err) {
        return callback(err);
      }

      // update state with collected data
      const hubData = state.select(['hubs', id]);
      hubData.set('name', hub.name);
      hubData.set('system', getSystemInfo(hub));

      return callback(null, hub);
    });
  },

  /**
   * Disconnect from hub by id
   * @param {String} id
   */
  disconnect({ clients, state, actions, callback }, { id }) {
    actions.hubs.clearTimeout({ id });
    state.set(['hubs', id], undefined);
    clients.lego.action(id, 'disconnect', undefined, callback);
  },

  /**
   * Shutdown hub by id
   * @param {String} id
   */
  shutdown({ clients, state, actions, callback }, { id }) {
    actions.hubs.clearTimeout({ id });
    state.set(['hubs', id], undefined);
    clients.lego.action(id, 'shutdown', undefined, callback);
  },

  /**
   * Rename hub
   * @param {String} id
   * @param {String} name
   */
  rename({ clients, callback }, { id, name }) {
    clients.lego.action(id, 'setName', [name], callback);
  },
};
