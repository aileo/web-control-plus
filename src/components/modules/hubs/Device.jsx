import React from 'react';
import LinkOff from '@material-ui/icons/LinkOff';

import icons from '../../../utils/devicesIcons';

import PureRenderComponent from '../../utils/PureRender';
import { branch as actionsWrapper } from '../../high-order/actions';

class Device extends PureRenderComponent {
  constructor() {
    super();
    this.addControl = this.addControl.bind(this);
  }

  addControl() {
    const { port, connected, mac, actions } = this.props;

    if (!connected) {
      return undefined;
    }

    return actions.navigation.openModal({
      name: 'createControl',
      context: {
        portName: port,
        mac,
      },
    });
  }

  render() {
    const { port, connected, type } = this.props;

    const Icon = connected && icons[type.text] ? icons[type.text] : LinkOff;
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
