import React from 'react';

import HubList from '../modules/hubs/HubList';
import Grid from '../modules/grid/Grid';

export default () => (
  <div className="page default">
    <div className="page-content">
      <HubList />
      <Grid />
    </div>
  </div>
);
