import React from 'react';
import classnames from 'classnames';

import { CONSTS } from '../../../core/clients/lego';

const STEP = 5 / 255;

const Distance = props => {
  const { devices } = props;
  const { distance = [] } = devices.sensor || {};

  const value = Math.round((distance[0] || 255) * STEP);

  return (
    <div className="distance control-display">
      <div
        className={ classnames('arc', value < 4 ? 'safe' : 'inactive') }
      >
        <div
          className={ classnames('arc', value < 3 ? 'safe' : 'inactive') }
        >
          <div
            className={ classnames('arc', value < 2 ? 'warning' : 'inactive') }
          >
            <div
              className={ classnames('arc', value < 1 ? 'danger' : 'inactive') }
            >
              <div className="dot" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Distance.devices = [
  {
    id: 'sensor',
    label: 'Sensor',
    type: [
      CONSTS.DeviceType.BOOST_DISTANCE,
      CONSTS.DeviceType.WEDO2_DISTANCE,
    ],
    mode: 0x01,
    events: ['distance'],
  },
];

Distance.options = [];

Distance.sizes = [
  { w: 1, h: 1 },
  { w: 2, h: 2 },
];

export default Distance;
