import React, { Component } from 'react';
import ReactDOM from 'react-dom';

export default function (Wrapped) {
  const name = Wrapped.name || Wrapped.displayName || 'Component';

  class ComposedComponent extends Component {
    constructor() {
      super();

      this.node = null;
      this.state = {
        width: 0,
        height: 0,
        pxPerPercent: 0,
      };

      this._handleResize = this._handleResize.bind(this);
    }

    componentDidMount() {
      window.addEventListener('resize', this._handleResize);
      this._handleResize();
    }

    componentWillUnmount() {
      window.removeEventListener('resize', this._handleResize);
    }

    _handleResize() {
      const { height, width } = this.state;
      let dom;
      try {
        // eslint-disable-next-line react/no-find-dom-node
        dom = ReactDOM.findDOMNode(this);
      } catch (e) {
        return;
      }

      if (dom && (width !== dom.offsetWidth || height !== dom.offsetHeight)) {
        this.setState({
          width: dom.offsetWidth,
          height: dom.offsetHeight,
          pxPerPercent: Math.min(dom.offsetWidth, dom.offsetHeight) / 100,
        });
      }
    }

    render() {
      const { height, width, pxPerPercent } = this.state;
      return (
        <Wrapped
          { ...this.props }
          width={ width }
          height={ height }
          pxPerPercent={ pxPerPercent }
        />
      );
    }
  }

  ComposedComponent.displayName = `Resizable${name}`;
  ComposedComponent.contextTypes = {};

  return ComposedComponent;
}
