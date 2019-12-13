import { Component } from 'react';
import { isEqual } from 'lodash';

export default class PureRenderComponent extends Component {
  shouldComponentUpdate(nextProps) {
    const shouldRender = !isEqual(this.props, nextProps);
    return shouldRender;
  }
}
