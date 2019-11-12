import React from 'react';
import { BatteryStd } from '@material-ui/icons';

export default props => {
  const { level = 0 } = props;
  return (
    <div className="battery" title={ `Battery level: ${level}%` }>
      <BatteryStd />
      <span>
        {level}
%
      </span>
    </div>
  );
};
