import React from 'react';
import classnames from 'classnames';

import { CONSTS } from '../../../core/clients/lego';
import PureRenderComponent from '../../utils/PureRender';

const defaults = {
  max: 100,
  min: -100,
};

class Arrows extends PureRenderComponent {
  constructor() {
    super();
    this.hold = this.hold.bind(this);
    this.release = this.release.bind(this);
  }

  hold(e) {
    e.preventDefault();
    const { devices, actions } = this.props;
    const { mac, port } = devices.motor;
    window.addEventListener('mouseup', this.release, false);
    window.addEventListener('touchend', this.release, false);
    actions.devices.setSpeed({ mac, port, speed: e.target.dataset.speed });
  }

  release(e) {
    e.preventDefault();
    const { devices, actions } = this.props;
    const { mac, port } = devices.motor;
    window.removeEventListener('mouseup', this.release, false);
    window.removeEventListener('touchend', this.release, false);
    actions.devices.setSpeed({ mac, port, speed: 0 });
  }

  componentWillUnmount() {
    window.removeEventListener('mouseup', this.release, false);
    window.removeEventListener('touchend', this.release, false);
  }

  render() {
    const { isVertical } = this.props;

    return (
      <div
        className={ classnames('arrows', 'control-display', {
          horizontal: !isVertical,
          vertical: isVertical,
        }) }
      >
        <button
          type="button"
          className="min"
          data-speed={ defaults.min }
          onMouseDown={ this.hold }
          onTouchStart={ this.hold }
        >
min
        </button>
        <button
          type="button"
          className="max"
          data-speed={ defaults.max }
          onMouseDown={ this.hold }
          onTouchStart={ this.hold }
        >
max
        </button>
      </div>
    );
  }
}

Arrows.devices = [
  {
    id: 'motor',
    label: 'Motor',
    type: [
      CONSTS.DeviceType.BASIC_MOTOR,
      CONSTS.DeviceType.TRAIN_MOTOR,
      CONSTS.DeviceType.BOOST_TACHO_MOTOR,
      CONSTS.DeviceType.BOOST_MOVE_HUB_MOTOR,
      CONSTS.DeviceType.DUPLO_TRAIN_BASE_MOTOR,
      CONSTS.DeviceType.CONTROL_PLUS_LARGE_MOTOR,
      CONSTS.DeviceType.CONTROL_PLUS_XLARGE_MOTOR,
    ],
    mode: null,
    events: [],
    commands: ['speed'],
  },
];

Arrows.options = [];

Arrows.sizes = [
  { w: 1, h: 2 },
  { w: 2, h: 1 },
];

export default Arrows;
