import React from 'react';
import { branch } from 'baobab-react/higher-order';

import { branch as actionsWrapper } from '../../high-order/actions';
import resize from '../../high-order/resize';

import GridLayout from './GridLayout';
import GridControls from './GridControls';

const Grid = props => {
  const { height, rows, cols } = props;
  const unit = height / rows;
  return (
    <div className="grid">
      <GridLayout rows={ rows } cols={ cols } height={ height } />
      <GridControls unit={ unit } />
    </div>
  );
};

export default branch({
  rows: ['grid', 'rows'],
  cols: ['grid', 'cols'],
}, actionsWrapper(['hubs'], resize(Grid)));
