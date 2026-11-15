import React, { PureComponent } from 'react';
import classnames from 'classnames';

import { CONSTS } from '../../../core/clients/lego';

const defaults = {
  max: 100,
  min: -100,
  initialValue: 0,
};

class Slider extends PureComponent {
  constructor() {
    super();
    this.updateValue = this.updateValue.bind(this);
    this.state = {
      value: defaults.initialValue,
    };
  }

  updateValue(event) {
    const { devices, actions } = this.props;
    const value = event.target.valueAsNumber;
    const { mac, port } = devices.motor;

    this.setState({ value });
    actions.devices.setSpeed({ mac, port, speed: value });
  }

  render() {
    const { value } = this.state;
    const { isVertical } = this.props;
    const { min, max } = defaults;
    const position = `${(value - min) / (max - min) * 100}%`;

    return (
      <div
        className={ classnames('slider', 'control-display', {
          horizontal: !isVertical,
          vertical: isVertical,
        }) }
      >
        <div className="slide">
          <input
            type="range"
            className="slider-input"
            aria-label="Motor speed"
            aria-orientation={ isVertical ? 'vertical' : 'horizontal' }
            min={ min }
            max={ max }
            step="1"
            value={ value }
            onChange={ this.updateValue }
          />
          <div className="slider-overlay" aria-hidden="true">
            <span
              className="handle"
              style={ { [isVertical ? 'top' : 'left']: position } }
            />
          </div>
        </div>
      </div>
    );
  }
}

Slider.devices = [
  {
    id: 'motor',
    label: 'Motor',
    type: [
      CONSTS.DeviceType.SIMPLE_MEDIUM_LINEAR_MOTOR,
      CONSTS.DeviceType.TRAIN_MOTOR,
      CONSTS.DeviceType.MEDIUM_LINEAR_MOTOR,
      CONSTS.DeviceType.MOVE_HUB_MEDIUM_LINEAR_MOTOR,
      CONSTS.DeviceType.DUPLO_TRAIN_BASE_MOTOR,
      CONSTS.DeviceType.TECHNIC_LARGE_LINEAR_MOTOR,
      CONSTS.DeviceType.TECHNIC_XLARGE_LINEAR_MOTOR,
      CONSTS.DeviceType.TECHNIC_SMALL_ANGULAR_MOTOR,
      CONSTS.DeviceType.TECHNIC_MEDIUM_ANGULAR_MOTOR,
      CONSTS.DeviceType.TECHNIC_LARGE_ANGULAR_MOTOR,
      CONSTS.DeviceType.TECHNIC_MEDIUM_ANGULAR_MOTOR_GREY,
      CONSTS.DeviceType.TECHNIC_LARGE_ANGULAR_MOTOR_GREY,
    ],
    mode: null,
    events: [],
    commands: ['speed'],
  },
];

Slider.options = [];

Slider.sizes = [
  { w: 1, h: 2 },
  { w: 2, h: 1 },
  { w: 1, h: 4 },
  { w: 4, h: 1 },
  { w: 1, h: 6 },
  { w: 6, h: 1 },
  { w: 8, h: 1 },
];

export default Slider;
