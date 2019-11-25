import React from 'react';
import { branch } from 'baobab-react/higher-order';
import classnames from 'classnames';

import Build from '@material-ui/icons/Build';
import LinkOff from '@material-ui/icons/LinkOff';
import PowerSettingsNew from '@material-ui/icons/PowerSettingsNew';
import DeleteForever from '@material-ui/icons/DeleteForever';

import PureRenderComponent from '../../utils/PureRender';
import { branch as actionsWrapper } from '../../high-order/actions';

import Battery from './Battery';
import Device from './Device';

class Hub extends PureRenderComponent {
  constructor() {
    super();
    this.disconnect = this.disconnect.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.remove = this.remove.bind(this);
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

  remove() {
    const { uuid, actions } = this.props;
    actions.hubs.remove({ uuid });
  }

  config() {
    const { uuid, actions } = this.props;
    actions.navigation.openModal({
      name: 'hubConfig',
      context: { uuid },
    });
  }

  render() {
    const { mac, name, color, type, system, online, devices } = this.props;

    return (
      <div
        className={
          classnames('list-group-item hub', { online, offline: !online })
        }
      >
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
            devices
              .filter(device => device.mac === mac)
              .map(device => (device.port
                ? <Device key={ device.port } { ...device } mac={ mac } />
                : undefined
              ))
              .concat([
                <button
                  key="config"
                  type="button"
                  className="button config online-only"
                  onClick={ this.config }
                  title="Configure hub"
                >
                  <Build />
                </button>,
                <button
                  key="disconnect"
                  type="button"
                  className="button disconnect online-only"
                  onClick={ this.disconnect }
                  title="Disconnect hub"
                >
                  <LinkOff />
                </button>,
                <button
                  key="shutdown"
                  type="button"
                  className="button shutdown online-only"
                  onClick={ this.shutdown }
                  title="Shutdown hub"
                >
                  <PowerSettingsNew />
                </button>,
                <button
                  key="remove"
                  type="button"
                  className="button remove offline-only"
                  onClick={ this.remove }
                  title="Remove hub"
                >
                  <DeleteForever />
                </button>,
              ])
          }
        </div>
      </div>
    );
  }
}

export default branch({
  devices: ['devices'],
}, actionsWrapper(['hubs', 'navigation'], Hub));
