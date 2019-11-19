import React from 'react';
import { branch } from 'baobab-react/higher-order';

import Control from '../controls/Control';

const GridControl = props => {
  const { unit, controls } = props;
  return (
    <div className="grid-controls">
      {
        controls
          .map(c => c)
          .sort((a, b) => {
            if (
              a.x + a.w === b.x && a.y <= b.y + b.h
              || a.y + a.h === b.y && a.x <= b.x + b.w
            ) {
              // if a ends right before b start (horizontally or vertically) and
              // start in the same range on the opposite direction
              return -1;
            } if (
              b.x + b.w === a.x && b.y <= a.y + a.h
              || b.y + b.h === a.y && b.x <= a.x + a.w
            ) {
              // if b ends right before a start (horizontally or vertically) and
              // start in the same range on the opposite direction
              return 1;
            }
            return 0;
          })
          .map(control => (
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
