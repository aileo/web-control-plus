import React from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import Layout from './components/Layout';
import palette from './theme/colors';

const root = document.getElementById('root');
if (!root) throw new Error('Application root not found');
createRoot(root).render(
  <ThemeProvider
    theme={createTheme({
      palette,
      components: {
        MuiAppBar: {
          defaultProps: {
            color: 'secondary',
          },
        },
      },
    })}
  >
    <CssBaseline />
    <Layout />
  </ThemeProvider>
);
