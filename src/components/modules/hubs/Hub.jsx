import React, { Component } from 'react';
import { values } from 'lodash';

import {
  Build,
  LinkOff,
  PowerSettingsNew,
} from '@material-ui/icons';

import actionsWrapper from '../../../utils/mixin.actions.branch';

import Battery from './Battery';
import Port from './Port';

class Hub extends Component {
  constructor() {
    super();
    this.disconnect = this.disconnect.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }

  disconnect() {
    const { uuid, actions } = this.props;
    actions.hubs.disconnect({ uuid });
  }

  shutdown() {
    const { uuid, actions } = this.props;
    actions.hubs.shutdown({ uuid });
  }

  render() {
    const { color, type, system, ports } = this.props;
    return (
      <div className="list-group-item hub">
        <button className="primary" type="button">
          <div className="info">
            <div className="header" />
            <div className="body">{ type.compact }</div>
            <div className="footer">
              <Battery level={ system.batteryLevel } />
            </div>
          </div>
          <div className="color" style={ { backgroundColor: color } } />
        </button>
        <div className="secondary">
          {
            values(ports).map(port => (
              <Port key={ port.name } { ...port } />
            )).concat([
              <button
                key="disconnect"
                type="button"
                className="button disconnect"
                onClick={ this.disconnect }
                title="Disconnect hub"
              >
                <LinkOff />
              </button>,
              <button
                key="shutdown"
                type="button"
                className="button shutdown"
                onClick={ this.shutdown }
                title="Shutdown hub"
              >
                <PowerSettingsNew />
              </button>,
            ])
          }
        </div>
      </div>
    );
  }
}

export default actionsWrapper(['hubs', 'navigation'], Hub);
