import React, { Component } from 'react';

import { branch as actionsWrapper } from '../../high-order/actions';
import resize from '../../high-order/resize';

import GridLayout from './GridLayout';
import GridControls from './GridControls';

export const ROWS = 6;
export const COLS = 10;

class Grid extends Component {
  constructor() {
    super();
    this.select = this.select.bind(this);
  }

  select() {
    const { actions } = this.props;
    actions.hubs.select();
  }

  render() {
    const { height } = this.props;
    const unit = height / ROWS;
    return (
      <div className="grid">
        <GridLayout rows={ ROWS } cols={ COLS } height={ height } />
        <GridControls unit={ unit } />
      </div>
    );
  }
}

export default actionsWrapper(['hubs'], resize(Grid));
