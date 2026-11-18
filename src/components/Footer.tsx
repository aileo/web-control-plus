import React from 'react';
import { AppBar, Toolbar, Stack, Link, Button } from '@mui/material';
import { useOpenModal } from '../hooks';

function Footer() {
  const openModal = useOpenModal();
  return (
    <AppBar
      position="static"
      component="footer"
      color="info"
      sx={{ top: 'auto', bottom: 0 }}
    >
      <Toolbar sx={{ justifyContent: 'center' }}>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            py: 1,
            '& :is(a, button):focus-visible': {
              outline: '2px solid currentColor',
              outlineOffset: 3,
            },
          }}
        >
          <img
            src={new URL(
              '../../assets/images/GitHub-Mark-Light-32px.png',
              import.meta.url
            ).toString()}
            alt=""
          />
          <span>View on github :</span>
          <Link
            color="inherit"
            href="https://github.com/aileo/web-control-plus"
          >
            Sources
          </Link>
          <Link
            color="inherit"
            href="https://github.com/aileo/web-control-plus/issues"
          >
            Issues
          </Link>
          <Button
            type="button"
            id="footer-help"
            color="inherit"
            onClick={() =>
              openModal('boardHelp', { returnFocusId: 'footer-help' })
            }
            sx={{
              font: 'inherit',
              p: 0,
              minWidth: 0,
              textDecoration: 'underline',
              textTransform: 'none',
            }}
          >
            Help
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

export default Footer;
