import { waterfall } from 'async';
import { pick } from 'lodash';

function getDeviceInfo(device) {
  return pick(device, [
    'connected',
    'busy',
    'type',
    'value',
  ]);
}

export default {
  /**
   * Register new device (even if no device...)
   * @param {String} hubId
   * @param {String} portName
   */
  register({ clients, state, callback }, { hubId, portName }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(hubId, cb),
        // get specific port
        (hub, cb) => cb(null, hub._ports[portName]),
        // set state
        (device, cb) => {
          const deviceInfo = getDeviceInfo(device);
          deviceInfo.port = portName;
          deviceInfo.type = lego.constToObject('DeviceType', deviceInfo.type);
          // erase eventData has it now refer to a new data
          deviceInfo.eventData = {};
          state.select('devices', hubId).set(portName, deviceInfo);
          state.once('update', () => cb());
        },
      ],
      callback
    );
  },

  /**
   * Store event data in state
   * @param {String} hubId
   * @param {String} portName
   * @param {String} event
   * @param {Any} data
   */
  update({ state, callback }, { hubId, portName, event, data }) {
    // update device with event data
    state.select('devices', hubId, portName, 'eventData', event).set(data);
    state.once('update', () => callback());
  },

  action({ clients, callback }, { hubId, portName, action, params }) {
    clients.lego.action(
      hubId,
      action,
      [portName].concat(params),
      err => callback(err)
    );
  },
};
