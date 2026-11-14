import { includes, each } from 'lodash';

import { CONSTS } from '../clients/lego';
import { components } from '../../components/modules/controls/Control';

function getDeviceModes(devicesIndex, controls, key, modes = {}) {
  controls.forEach(control => {
    control.devices.forEach(({ mac, port }, index) => {
      modes[mac] = modes[mac] || {};
      modes[mac][port] = modes[mac][port] || {};

      const device = devicesIndex[mac] && devicesIndex[mac][port];
      if (!device || !device.connected) return;
      const { type } = device;
      const component = components[control.type];

      if (includes(component.devices[index].type, type.num)
        && component.devices[index].mode !== null) {
        modes[mac][port][key] = type.num === CONSTS.DeviceType.MOTION_SENSOR
          ? 0 : component.devices[index].mode;
      }
    });
  });
  return modes;
}

export default {
  select({ state }, { mac, port }) {
    return state.select('devices', { mac, port });
  },

  /**
   * Register new device (even if no device...)
   * @param {String} hubId
   * @param {String} portName
   */
  register({ clients, state, actions, callback, logger }, params) {
    const { lego } = clients;
    const { hub, detached = false } = params;
    const portName = params.portName || params.device && params.device.portName;
    if (!portName) {
      return callback(new Error('Attached device has no port name'));
    }
    const device = detached ? null : params.device
      || hub.getDeviceAtPort(portName);
    const deviceInfo = {
      mac: lego.identity(hub),
      port: portName,
      connected: Boolean(device),
      busy: false,
      type: lego.constToObject('DeviceType', device ? device.type : 0),
    };
    const cursor = actions.devices.select(deviceInfo);
    if (cursor.exists()) {
      cursor.set(deviceInfo);
    } else {
      state.select('devices').push(deviceInfo);
    }
    state.select('events').set([deviceInfo.mac, deviceInfo.port], {});
    state.select('commands').set([deviceInfo.mac, deviceInfo.port], {});
    if (device) {
      device.autoSubscribe = false;
      ['distance', 'tilt'].forEach(event => {
        device.on(event, values => {
          const data = event === 'tilt'
            ? [values.x, values.y, values.z] : [values.distance];
          actions.devices.update({ hub, portName, event, data });
        });
      });
      if (device.type === lego.CONSTS.DeviceType.VOLTAGE_SENSOR
        || device.type === lego.CONSTS.DeviceType.CURRENT_SENSOR) {
        Promise.resolve(hub.subscribe(device.portId, device.type, 0))
          .catch(error => {
            logger.error('Failed to subscribe to hub sensor', error);
          });
      }
    }
    state.once('update', () => callback());
    return null;
  },

  /**
   * Store event data in state
   * @param {String} hubId
   * @param {String} portName
   * @param {String} event
   * @param {Any} data
   */
  update({ clients, state, callback }, { hub, portName, event, data }) {
    state.set(['events', clients.lego.identity(hub), portName, event], data);
    return state.once('update', () => callback());
  },

  action({ clients, callback }, { mac, portName, action, params }) {
    clients.lego.action(
      { mac },
      action,
      [portName].concat(params),
      err => callback(err)
    );
  },

  remove({ actions }, { mac, port }) {
    actions.devices.select({ mac, port }).unset();
  },

  setSpeed({ clients, state, callback }, { mac, port, speed }) {
    const hub = clients.lego.get({ mac });
    const device = hub && hub.getDeviceAtPort(port);
    if (!device) return callback(40402);
    const value = Number(speed);
    if (!Number.isFinite(value) || value < -100 || value > 100) {
      return callback(new Error('Invalid motor speed'));
    }
    let result;
    if (typeof device.setSpeed === 'function'
      && hub.type !== clients.lego.CONSTS.HubType.WEDO2_SMART_HUB) {
      result = device.setSpeed(value, undefined, true);
    } else if (typeof device.setPower === 'function') {
      result = device.setPower(value, true);
    } else {
      return callback(40000);
    }
    state.select('commands', mac, port).set('speed', value);
    return Promise.resolve(result).then(() => callback(), callback);
  },

  subscribe({ clients, callback }, { mac, port, mode }) {
    const hub = clients.lego.get({ mac });
    const device = hub && hub.getDeviceAtPort(port);
    if (!device) return callback(40402);
    return Promise.resolve(hub.subscribe(device.portId, device.type, mode))
      .then(() => callback(), callback);
  },

  unsubscribe({ clients, callback }, { mac, port, mode }) {
    const hub = clients.lego.get({ mac });
    const device = hub && hub.getDeviceAtPort(port);
    if (!device) return callback(40402);
    const params = hub.type === clients.lego.CONSTS.HubType.WEDO2_SMART_HUB
      ? [device.portId, device.type, mode] : [device.portId, mode];
    return Promise.resolve(hub.unsubscribe(...params))
      .then(() => callback(), callback);
  },

  updateSubscription(
    { actions, callback },
    { previousControls, currentControls, devices }
  ) {
    const devicesIndex = devices.reduce((collection, device) => {
      collection[device.mac] = collection[device.mac] || {};
      collection[device.mac][device.port] = device;
      return collection;
    }, {});
    const subscriptions = getDeviceModes(
      devicesIndex,
      currentControls,
      'current',
      getDeviceModes(devicesIndex, previousControls, 'previous')
    );

    each(subscriptions, (ports, mac) => {
      each(ports, (modes, port) => {
        const { previous } = modes;
        const { current } = modes;

        if (previous !== current) {
          if (current === undefined) {
            actions.devices.unsubscribe({ mac, port, mode: previous });
          } else {
            actions.devices.subscribe({ mac, port, mode: current });
          }
        }
      });
    });

    callback();
  },
};
