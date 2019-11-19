import React from 'react';
import { times } from 'lodash';


const Pin = props => {
  const { x, y, unit } = props;

  return (
    <div
      className="pin"
      style={ {
        width: `${unit}px`,
        height: `${unit}px`,
        left: `${x * unit}px`,
        top: `${y * unit}px`,
      } }
    />
  );
};

export default props => {
  const { w, h, unit } = props;
  const pUnit = unit / Math.max(w, h);

  return (
    <div
      className="control"
      style={ {
        width: `${w * pUnit}px`,
        height: `${h * pUnit}px`,
        fontSize: `${pUnit}px`,
      } }
    >
      <div className="tile">
        {
          times(w)
            .map(
              x => times(
                h,
                y => <Pin key={ `${x}-${y}` } x={ x } y={ y } unit={ pUnit } />
              )
            ).flat(1)
        }
      </div>
    </div>
  );
};
