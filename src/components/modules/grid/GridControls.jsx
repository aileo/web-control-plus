import React from 'react';
import { branch } from 'baobab-react/higher-order';

import Control from '../controls/Control';

const GridControl = props => {
  const { unit, controls } = props;
  return (
    <div className="grid-controls">
      {
        controls.map(control => (
          <Control
            key={ `${control.x}-${control.y}` }
            unit={ unit }
            { ...control }
          />
        ))
      }
    </div>
  );
};

export default branch({
  controls: 'controls',
}, GridControl);
