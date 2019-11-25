import React from 'react';
import classnames from 'classnames';

import { CONSTS } from '../../../core/clients/lego';
import PureRenderComponent from '../../utils/PureRender';

const defaults = {
  max: 100,
  min: -100,
  initialValue: 0,
};

class Slider extends PureRenderComponent {
  constructor() {
    super();
    this.updateValue = this.updateValue.bind(this);
    this.hold = this.hold.bind(this);
    this.move = this.move.bind(this);
    this.release = this.release.bind(this);

    this.slide = null;
    this.interval = null;

    this.state = {
      offset: 0,
      size: 0,
      delta: 0,
    };
  }

  componentDidMount() {
    this.initDelta(this.initOffset());
  }

  initOffset() {
    const { isVertical, unit } = this.props;
    const { x, y, width, height } = this.slide.getBoundingClientRect();

    let init = {};
    if (isVertical) {
      init = {
        offset: y,
        size: height - unit * 0.15,
      };
    } else {
      init = {
        offset: x,
        size: width - unit * 0.15,
      };
    }

    this.setState(init);
    return init;
  }

  initDelta(init) {
    const { size } = init;
    const { initialValue, min, max } = defaults;

    this.setState({
      delta: (initialValue - min) / (max - min) * size,
    });
  }

  updateValue() {
    const { devices, actions } = this.props;
    const { delta, size } = this.state;
    const { min, max } = defaults;

    const speed = Math.max(
      Math.min(
        delta / size * (max - min) + min,
        max
      ),
      min
    );

    const { mac, port } = devices.motor;
    actions.devices.setSpeed({ mac, port, speed });
  }

  hold() {
    this.initOffset();
    window.addEventListener('mouseup', this.release, false);
    window.addEventListener('mousemove', this.move, true);
    // this.interval = setInterval(this.updateValue, 50);
  }

  move(e) {
    const { isVertical } = this.props;
    const { offset } = this.state;
    this.setState({
      delta: (isVertical ? e.clientY : e.clientX) - offset,
    });
  }

  release() {
    window.removeEventListener('mouseup', this.release, false);
    window.removeEventListener('mousemove', this.move, true);
    this.updateValue();
    // clearInterval(this.interval);
  }

  componentWillUnmount() {
    window.removeEventListener('mouseup', this.release, false);
    window.removeEventListener('mousemove', this.move, true);
    // clearInterval(this.interval);
  }

  render() {
    const { isVertical } = this.props;
    const { delta, size } = this.state;

    return (
      <div
        className={ classnames('slider', 'control-display', {
          horizontal: !isVertical,
          vertical: isVertical,
        }) }
      >
        <div
          className="slide"
          ref={ slide => { this.slide = slide; } }
        >
          <button
            type="button"
            className="handle"
            onMouseDown={ this.hold }
            style={ {
              [isVertical ? 'top' : 'left']: Math.max(Math.min(delta, size), 0),
            } }
          >
handle
          </button>
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
