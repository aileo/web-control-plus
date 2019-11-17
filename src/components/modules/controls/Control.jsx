import React, { Component } from 'react';
import { branch } from 'baobab-react/higher-order';
import classnames from 'classnames';

import { branch as actionsWrapper } from '../../high-order/actions';
import pureRender from '../../high-order/pure-render';

import Error from './Error';

import Tilt from './Tilt';
import Distance from './Distance';

export const components = {
  tilt: Tilt,
  distance: Distance,
};

class Control extends Component {
  getDevice(index, definition) {
    const { devices, actions } = this.props;
    const { mac, port } = devices[index];
    const device = actions.devices.select({ mac, port }).get();

    if (!device) {
      return { error: 40402, device: {} };
    }

    if (!definition.type.includes(device.type.num)) {
      return { error: 40000, device: {} };
    }

    return { device };
  }

  render() {
    const { type, x, y, w, h, unit } = this.props;
    const sizeUnit = 2 * unit * Math.min(w, h);
    const ControlComponent = components[type];
    const Renderer = pureRender(ControlComponent);
    const errors = [];

    const devices = ControlComponent.devices.reduce(
      (collection, definition, index) => {
        const { error, device } = this.getDevice(index, definition);
        if (error) {
          errors.push({
            id: definition.id,
            label: definition.label,
            code: error,
          });
        }
        collection[definition.id] = device;
        return collection;
      },
      {}
    );

    return (
      <div
        className={ classnames('control', { 'has-error': errors.length }) }
        style={ {
          left: `${x * unit}px`,
          top: `${y * unit}px`,
          width: `${w * unit}px`,
          height: `${h * unit}px`,
          fontSize: `${sizeUnit}px`,
        } }
      >
        <div className="tile" data-unit={ sizeUnit }>
          {
            errors.length
              ? <Error errors={ errors } />
              : <Renderer devices={ devices } />
          }
        </div>
      </div>
    );
  }
}

export default branch({
  ports: ['devices'],
}, actionsWrapper(['devices'], Control));
