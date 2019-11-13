import React, { Component } from 'react';
import { branch } from 'baobab-react/higher-order';
import { values } from 'lodash';

import Build from '@material-ui/icons/Build';
import LinkOff from '@material-ui/icons/LinkOff';
import PowerSettingsNew from '@material-ui/icons/PowerSettingsNew';

import actionsWrapper from '../../../utils/mixin.actions.branch';

import Battery from './Battery';
import Device from './Device';

class Hub extends Component {
  constructor() {
    super();
    this.disconnect = this.disconnect.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.config = this.config.bind(this);
  }

  disconnect() {
    const { uuid, actions } = this.props;
    actions.hubs.disconnect({ uuid });
  }

  shutdown() {
    const { uuid, actions } = this.props;
    actions.hubs.shutdown({ uuid });
  }

  config() {
    const { uuid, actions } = this.props;
    actions.navigation.openModal({
      name: 'hubConfig',
      context: { uuid },
    });
  }

  render() {
    const { uuid, name, color, type, system, ports } = this.props;
    const devices = ports[uuid];

    return (
      <div className="list-group-item hub">
        <button className="primary" type="button">
          <div className="info">
            <div className="header" />
            <div className="body" title={ name }>{ type.compact }</div>
            <div className="footer">
              <Battery level={ system.batteryLevel } />
            </div>
          </div>
          <div className="color" style={ { backgroundColor: color } } />
        </button>
        <div className="secondary">
          {
            values(devices).map(device => (
              <Device key={ device.port } { ...device } />
            )).concat([
              <button
                key="config"
                type="button"
                className="button config"
                onClick={ this.config }
                title="Configure hub"
              >
                <Build />
              </button>,
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

export default branch({
  ports: ['devices'],
}, actionsWrapper(['hubs', 'navigation'], Hub));
