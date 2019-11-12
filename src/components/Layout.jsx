import React from 'react';
import { branch } from 'baobab-react/higher-order';

import pages from './pages/pages';
import Header from './Header';
import Footer from './Footer';
import Modal from './Modal';

const Layout = ({ page }) => {
  const Page = page in pages ? pages[page] : pages.main;

  return (
    <div className="layout">
      <Header />
      <Page />
      <Footer />
      <Modal />
    </div>
  );
};

export default branch({
  modal: ['navigation', 'modal'],
  page: ['page'],
}, Layout);
