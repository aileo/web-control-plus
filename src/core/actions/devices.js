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
   * @param {String} hubUuid
   * @param {String} portName
   */
  register({ clients, state, callback }, { hubUuid, portName }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(hubUuid, cb),
        // get specific port
        (hub, cb) => cb(null, hub._ports[portName]),
        // set state
        (device, cb) => {
          const deviceInfo = getDeviceInfo(device);
          deviceInfo.port = portName;
          deviceInfo.type = lego.constToObject('DeviceType', deviceInfo.type);
          // erase eventData has it now refer to a new data
          deviceInfo.eventData = {};
          state.select('devices', hubUuid).set(portName, deviceInfo);
          state.once('update', () => cb());
        },
      ],
      callback
    );
  },

  /**
   * Store event data in state
   * @param {String} hubUuid
   * @param {String} portName
   * @param {String} event
   * @param {Any} data
   */
  update({ state, callback }, { hubUuid, portName, event, data }) {
    // update device with event data
    state.select('devices', hubUuid, portName, 'eventData', event).set(data);
    state.once('update', () => callback());
  },
};
