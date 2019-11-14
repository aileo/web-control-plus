import React, { Component } from 'react';
import LinkOff from '@material-ui/icons/LinkOff';

import icons from '../../../utils/devicesIcons';

import { branch as actionsWrapper } from '../../high-order/actions';

class Device extends Component {
  constructor() {
    super();
    this.addControl = this.addControl.bind(this);
  }

  addControl() {
    const { port, connected, hubId, actions } = this.props;

    if (!connected) {
      return undefined;
    }

    return actions.navigation.openModal({
      name: 'createControl',
      context: {
        portName: port,
        hubId,
      },
    });
  }

  render() {
    const { port, connected, type } = this.props;

    const Icon = connected ? icons[type.text] : LinkOff;
    const text = connected ? type.text : 'Disconnected';
    return (
      <button className="device" type="button" onClick={ this.addControl }>
        <div className="name">{ port }</div>
        <div className="type" title={ text }>
          <Icon />
        </div>
      </button>
    );
  }
}

export default actionsWrapper(['navigation'], Device);
