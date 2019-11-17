import React from 'react';
import { times } from 'lodash';

export default props => {
  const { height, rows, cols } = props;
  const width = height / rows * cols;
  return (
    <div className="grid-layout" style={ { width: `${width}px` } }>
      {
        times(rows, y => (
          <div key={ `row-${y}` } className="grid-row">
            {
              times(cols, x => (
                <div
                  key={ `cell-${x}-${y}` }
                  className="grid-cell"
                />
              ))
            }
          </div>
        ))
      }
    </div>
  );
};
