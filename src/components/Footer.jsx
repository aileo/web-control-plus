import React from 'react';

export default () => (
  <nav className="footer">
    <div>
      <div>
        <img
          src={ new URL(
            '../../assets/images/GitHub-Mark-Light-32px.png',
            import.meta.url
          ).toString() }
          alt=""
        />
        <span>View on github :</span>
      </div>
    </div>
    <div>
      <a href="https://github.com/aileo/web-control-plus">Sources</a>
    </div>
    <div>
      <a href="https://github.com/aileo/web-control-plus/issues">Issues</a>
    </div>
  </nav>
);
