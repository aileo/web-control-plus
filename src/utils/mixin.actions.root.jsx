import React, { Component } from 'react';
import PropTypes from 'prop-types';

export default function (actions, WrapComponent) {
  const name = WrapComponent.name || WrapComponent.displayName || 'Component';

  const ComposedComponent = class extends Component {
    // Handling child context
    getChildContext() {
      return {
        actions,
      };
    }

    // Render shim
    render() {
      return <WrapComponent { ...this.props } />;
    }
  };

  ComposedComponent.displayName = `ActionRoot${name}`;
  ComposedComponent.childContextTypes = {
    actions: PropTypes.object,
  };

  return ComposedComponent;
}
