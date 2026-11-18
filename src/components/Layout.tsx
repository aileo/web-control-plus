import React from 'react';
import { Box } from '@mui/material';
import Page from './pages';
import Header from './Header';
import Footer from './Footer';
import Modal from './Modal';
import ToastViewport from './ToastViewport';
import { NavigationProvider } from '../hooks/useNavigation';
import { HubsProvider } from '../hooks/useHubs';
import { DevicesProvider } from '../hooks/useDevices';
import { ControlsProvider } from '../hooks/useControls';
import { ToastProvider } from '../hooks/useToast';

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
