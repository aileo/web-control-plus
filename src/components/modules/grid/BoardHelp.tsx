import React from 'react';
import { Box, Typography } from '@mui/material';
import InstructionStep from './InstructionStep';

function Section({
  number,
  title,
  children,
}: React.PropsWithChildren<{
  number: number;
  title: string;
}>) {
  return (
    <InstructionStep number={number} top>
      <Box sx={{ minWidth: 0, py: 1 }}>
        <Typography
          component="h3"
          variant="h6"
          sx={{ color: 'info.main', fontWeight: 800 }}
        >
          {title}
        </Typography>
        {children}
      </Box>
    </InstructionStep>
  );
}

function BoardHelp() {
  return (
    <Box
      component="ol"
      data-board-guide
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 14,
        lineHeight: 1.6,
        overflowWrap: 'anywhere',
        '& p': { my: 1 },
        '& h4': { mb: 0, mt: 2 },
        '& kbd': {
          display: 'inline-block',
          px: 0.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0.5,
          bgcolor: 'background.paper',
          fontFamily: 'monospace',
          lineHeight: 1.5,
        },
      }}
    >
      <Section number={1} title="Build your board">
        <p>
          <strong>Connect your hub</strong> with the yellow Connect hub button
          in the top bar or instruction tile, then select it in the browser
          Bluetooth chooser. Its menu opens when connected. Reopen it with the
          hub&apos;s colored button in the top bar, beside Connect hub, or the
          latest-hub shortcut in step two. Choose a connected motor, sensor, or
          light in that menu.
        </p>
        <p>
          Pick a control using its live-looking preview, then choose a tile
          size. Previews never operate your devices. Drag the dotted handle to
          move a tile and the corner handle to resize it into empty studs. The
          pastel plates are decoration: controls can cross their edges.
        </p>
        <p>
          The gear opens <strong>Control settings</strong> for a title,
          behavior, optional action keys, or removal. To change the assigned
          device, remove the tile and create another one.
        </p>
      </Section>
      <Section number={2} title="Choose control behavior">
        <h4>Motor slider</h4>
        <p>
          Set a speed from -100 to +100; positive is at the top or right. Speed
          stays set. Enable <strong>Reset to zero on release</strong> to stop
          after input ends.
          <strong> Reverse rotation</strong> changes the motor direction:
          displayed +40 sends -40 to the motor. Normal and reversed sliders on
          the same motor can therefore display opposite signs.
        </p>
        <h4>Motor arrows and Stop</h4>
        <p>
          <strong>Speed (%)</strong> ranges from 1 to 100 and defaults to 100.
          <strong> Stop on release</strong> is on by default: hold an arrow to
          run. Turn it off to keep running until Stop. The center Stop is always
          usable, even when gray; it becomes red in keep-running mode.
        </p>
        <p>
          A Stop tile stops its assigned motor, including motion requested by
          another tile. It is not a global stop or a safety interlock. Saving
          motor settings does not change current speed; new settings apply to
          your next interaction, not an already-held input.
        </p>
        <h4>Distance, color, and tilt</h4>
        <p>
          Distance uses small arcs for nearby objects and large arcs for far
          objects. <strong>Progressive</strong>, the default scale, gives finer
          nearby bands; <strong>Linear</strong> uses equal bands.
        </p>
        <p>
          <strong>Color stability</strong> can be Immediate, Stable (150 ms), or
          Very stable (400 ms). These filter brief changes; they do not change
          the physical sensor sensitivity. Tilt settings choose X, Y, or Z for
          Roll and Pitch and can reverse either direction.
        </p>
        <h4>LED lights</h4>
        <p>
          Create separate <strong>On/Off</strong>, <strong>Brightness</strong>,
          <strong> Color palette</strong>, or <strong>Custom color</strong>{' '}
          tiles. On/Off is a toggle that fits one stud; brightness uses the
          motor slider sizes. Both color tiles fit 1x1, 1x2, 2x1, or 2x2 studs.
          Hub lights offer RGB colors; Color &amp; distance lights and the 3x3
          matrix offer preset colors. White lights only show brightness.
          Unsupported inputs are hidden: Color &amp; distance has no adjustable
          brightness. Matrix brightness changes in 10% steps, and all segments
          or pixels on a device change together.
        </p>
        <p>
          Color selections and nonzero brightness turn the light on immediately.
          Zero brightness turns it off. On restores its last nonzero brightness,
          or 100% if none is known. Brightness updates as you slide;
          interrupting the gesture keeps the last requested level. Custom color
          previews locally: release to apply, or cancel to discard its preview.
          Creating a tile changes nothing. An unknown light shows
          <strong> Not set yet</strong>. State is app-set, not a hardware
          measurement, and tiles sharing one light stay synchronized.
        </p>
        <p>
          Custom color is available on RGB hub lights only. Move left/right
          through the rainbow and down toward gray to reduce saturation.
          Brightness stays separate. Keyboard users can Tab to the Hue and
          Saturation inputs and use their native arrow keys.
        </p>
        <p>
          Changing a hub light color also colors its hub menu and tiles. Dimming
          or switching it off keeps the selected UI hue readable. Sensor
          readings take priority if manual illumination requires another
          measuring mode; the tile explains when lighting is managed by an
          active sensor control.
        </p>
      </Section>
      <Section number={3} title="Assign action keys">
        <p>
          Open the gear, focus an <strong>Action keys (optional)</strong> field,
          press one key, then Save. Use its clear button to unassign. No keys
          are assigned by default.
        </p>
        <p>
          Motor sliders offer Increase by 10, Increase by 1, Decrease by 1, and
          Decrease by 10. Each physical press takes one step: +10 turns 20 into
          30, without repeating while held. Arrows offer Forward, Stop, and
          Backward; Stop tiles offer Stop. Release follows the tile&apos;s
          reset/stop-on-release setting. The On/Off tile&apos;s keys stay set
          after key release.
        </p>
        <p>
          <strong>Example, not defaults:</strong> bind <kbd>W</kbd> to Increase
          by 10, <kbd>S</kbd> to Decrease by 10, and <kbd>X</kbd> to a Stop
          tile.
        </p>
        <p>
          One key can operate several devices. Equivalent actions on one device
          are sent once; conflicting actions on the same device cannot save.
          Shortcuts pause while typing or while menus, dialogs, and help are
          open. Focused inputs keep their native keys: a focused slider uses
          arrows, <kbd>Home</kbd> for -100, and <kbd>End</kbd> for +100.
        </p>
        <p>
          Use single keys. <kbd>Space</kbd>, <kbd>Enter</kbd>, <kbd>Tab</kbd>,
          and <kbd>Escape</kbd> stay reserved for native activation and
          navigation; Ctrl, Alt, and Meta combinations are not supported.
        </p>
      </Section>
      <Section number={4} title="Save space and stay safe">
        <p>
          <strong>Close</strong> closes this guide without changing your board.
          On the instruction tile itself, <strong>Dismiss tile</strong> frees
          its studs and <strong>Do not show again</strong> remembers that
          preference between sessions. The footer Help link always opens this
          guide, even after hiding the tile.
        </p>
        <p>
          Save project stores all board tabs, their order, selection, layouts,
          device bindings, settings, and keys in this browser. Open project
          restores them even while hubs are disconnected; controls stay disabled
          until a compatible device is connected. Live connections, sensor
          readings, motor speeds, and light commands are never saved or
          restored. Reconnecting restores sensor readings, not previous motor
          speeds or light commands. The hub still receives its normal startup
          color. Browser saves are not synced to other devices or origins.
        </p>
        <p>
          Hiding or leaving the page requests a motor stop; it does not switch
          lights off. Bluetooth loss or a closed page cannot guarantee a stop.
          Always keep a physical way to stop your model.
        </p>
      </Section>
    </Box>
  );
}

export default BoardHelp;
