import React, { Component } from 'react';
import { isEqual } from 'lodash';

export default function (Wrapped) {
  const name = Wrapped.name || Wrapped.displayName || 'Component';

  class ComposedComponent extends Component {
    shouldComponentUpdate(nextProps) {
      return !isEqual(this.props, nextProps);
    }

    render() {
      return <Wrapped { ...this.props } />;
    }
  }

  ComposedComponent.displayName = `PureRender${name}`;
  ComposedComponent.contextTypes = {};

  return ComposedComponent;
}
