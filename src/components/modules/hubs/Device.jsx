import React from 'react';
import LinkOff from '@material-ui/icons/LinkOff';

import icons from '../../../utils/devicesIcons';

export default props => {
  const { port, connected, type } = props;

  const Icon = connected ? icons[type.text] : LinkOff;
  const text = connected ? type.text : 'Disconnected';
  return (
    <div className="port">
      <div className="name">{ port }</div>
      <div className="type" title={ text }>
        <Icon />
      </div>
    </div>
  );
};
