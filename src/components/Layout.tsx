import React from 'react';
import { Box } from '@mui/material';
import Page from './pages';
import Header from './Header';
import Footer from './Footer';
import Modal from './Modal';
import ToastViewport from './ToastViewport';
import { NavigationProvider } from '../core/hooks/useNavigation';
import { HubsProvider } from '../core/hooks/useHubs';
import { DevicesProvider } from '../core/hooks/useDevices';
import { ControlsProvider } from '../core/hooks/useControls';
import { ToastProvider } from '../core/hooks/useToast';

// Compose the application providers and primary page regions.
const Layout = () => (
  <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <ToastProvider>
      <NavigationProvider>
        <HubsProvider>
          <DevicesProvider>
            <ControlsProvider>
              <Header />
              <Page />
              <Footer />
              <Modal />
            </ControlsProvider>
          </DevicesProvider>
        </HubsProvider>
      </NavigationProvider>
      <ToastViewport />
    </ToastProvider>
  </Box>
);

export default Layout;
