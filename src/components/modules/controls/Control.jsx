import React from 'react';
import { branch } from 'baobab-react/higher-order';
import classnames from 'classnames';
import { pick } from 'lodash';

import Lauch from '@material-ui/icons/Launch';

import PureRenderComponent from '../../utils/PureRender';
import { branch as actionsWrapper } from '../../high-order/actions';

import Error from './Error';

import Tilt from './Tilt';
import Distance from './Distance';
import Slider from './Slider';
import Arrows from './Arrows';

export const components = {
  tilt: Tilt,
  distance: Distance,
  slider: Slider,
  arrows: Arrows,
};

class Control extends PureRenderComponent {
  constructor() {
    super();
    this.openConfig = this.openConfig.bind(this);
  }

  openConfig() {
    const { x, y, actions } = this.props;

    return actions.navigation.openModal({
      name: 'controlConfig',
      context: { x, y },
    });
  }

  getDevice(index, definition) {
    const { devices, ports } = this.props;
    const { mac, port } = devices[index];
    const device = ports.reduce((d, p) => {
      if (p.mac === mac && p.port === port) {
        return p;
      }
      return d;
    }, null);

    if (!device) {
      return { error: 40402, device: {}, events: [] };
    }

    if (!definition.type.includes(device.type.num)) {
      return { error: 40000, device: {}, events: [] };
    }

    return {
      device,
      events: definition.events,
    };
  }

  render() {
    const { data, type, x, y, w, h, unit, actions } = this.props;
    const sizeUnit = 2 * unit * Math.min(w, h);
    const ControlComponent = components[type];
    const errors = [];

    const devices = ControlComponent.devices.reduce(
      (collection, definition, index) => {
        const { error, device, events } = this.getDevice(index, definition);
        if (error) {
          errors.push({
            id: definition.id,
            label: definition.label,
            code: error,
          });
        }
        collection[definition.id] = {
          ...device,
          ...pick((data[device.mac] || {})[device.port] || {}, events),
        };
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
          <button
            type="button"
            className="control-parameters"
            onClick={ this.openConfig }
          >
            <Lauch />
          </button>
          {
            errors.length
              ? <Error errors={ errors } />
              : (
                <ControlComponent
                  actions={ actions }
                  devices={ devices }
                  unit={ unit }
                  isVertical={ w <= h }
                />
              )
          }
        </div>
      </div>
    );
  }
}

export default branch({
  data: ['events'],
  ports: ['devices'],
}, actionsWrapper(['navigation', 'devices'], Control));
