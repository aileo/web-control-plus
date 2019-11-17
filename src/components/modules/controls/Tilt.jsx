import React from 'react';
import { CONSTS } from '../../../core/clients/lego';

const Tilt = props => {
  const { devices } = props;
  const { tilt = [] } = devices.sensor || {};

  const pitch = (tilt[1] || 0) / 180 * -100 + 50;
  const roll = tilt[0] || 0;

  return (
    <div className="tilt control-display">
      <div className="dial">
        <div
          className="rolling"
          style={ { transform: `rotate(${roll}deg)` } }
        >
          <div
            className="pitching"
            style={ { top: `calc(${pitch}% - .01ex)` } }
          />
        </div>
        <div className="pointer" />
      </div>
    </div>
  );
};

Tilt.devices = [
  {
    id: 'sensor',
    label: 'Sensor',
    type: [
      CONSTS.DeviceType.WEDO2_TILT,
      CONSTS.DeviceType.BOOST_TILT,
      CONSTS.DeviceType.CONTROL_PLUS_TILT,
    ],
  },
];

Tilt.options = [
  {
    id: 'rollAxis',
    label: 'Roll axis',
    default: 'X',
    values: [
      { label: 'X', value: 0 },
      { label: 'Y', value: 1 },
      { label: 'Z', value: 2 },
    ],
  },
  {
    id: 'rollReverseFactor',
    label: 'Reverse roll axis',
    default: 1,
    values: [
      { label: 'No', value: 1 },
      { label: 'Yes', value: -1 },
    ],
  },
  {
    id: 'pitchAxis',
    label: 'Pitch axis',
    default: 'Y',
    values: [
      { label: 'X', value: 0 },
      { label: 'Y', value: 1 },
      { label: 'Z', value: 2 },
    ],
  },
  {
    id: 'pitchReverseFactor',
    label: 'Reverse pitch axis',
    default: 1,
    values: [
      { label: 'No', value: 1 },
      { label: 'Yes', value: -1 },
    ],
  },
];

Tilt.sizes = [
  { w: 1, h: 1 },
  { w: 2, h: 2 },
];

export default Tilt;
