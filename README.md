# Web Control Plus

A browser-based control panel for LEGO Bluetooth hubs. Drive motors, watch
sensors, and arrange your own controls on a LEGO-style board.

V1 was built by hand. V2 changes are human-initiated, with heavy AI support.

**[Open Web Control Plus](https://aileo.github.io/web-control-plus/)**

## What you need

- A compatible LEGO Boost, Powered Up, Control+, WeDo, or DUPLO hub and devices.
  Support varies by model and firmware; not every device is supported.
- Bluetooth and a browser with Web Bluetooth support, such as a supported
  Chrome or Edge installation. Safari and Firefox do not support Web Bluetooth.
- An HTTPS page, or localhost when running the app yourself.

The Technic Move Hub 88019 requires encrypted Bluetooth pairing and is not
currently supported. Pairing it in the operating system does not resolve this.

## Get started

1. Turn on your hub and select **Connect hub** in the header or help tile.
2. Choose the hub in the browser's Bluetooth dialog. Pairing through your
   operating system alone does not connect it to the app.
3. The newly connected hub's menu opens automatically. Select a connected
   motor or sensor. Reopen it using the hub's header button or the latest
   online hub shortcut in step two of the help tile.
4. Choose a control preview, then a tile size. The tile appears in the first
   available space on the board.

Hub colors help identify which controls belong together. Hub menus show battery
and connection status, connected devices, and disconnect/shutdown actions.
Hover or focus an action icon to read its tooltip.
Use **Enter fullscreen** in the header to expand the entire app, including
hub controls and dialogs. Select **Exit fullscreen** or press Escape to return.

## Make the board yours

Use the board tabs to add or switch boards. The selected tab's gear lets you
rename the board, choose a tab color, or remove it. Each board has its own
layout and shortcuts, while connected hubs are shared. Removing a
populated board requires confirmation and stops its motor controls. The
red **Stop all motors** button is always available in the footer and acts
immediately, without confirmation.

**Save project** and **Open project** keep named snapshots in this browser,
including all board tabs, preset colors, layouts, and controls. Saved projects
can be opened offline; live hardware state is not saved.

Switching boards releases momentary inputs; fixed-speed motors keep running.
The motor icon on a tab indicates a motor was commanded to run, not verified
physical motion. It clears on a confirmed stop or disconnect.

The header's **Download saved project** icon exports the active project's last
saved version as a `.wcp.json` file. Save first to include any unsaved edits.
The file uses the saved project's name and includes all boards, the selected
tab, controls, and saved hardware inventory—not live connection or motor state.

Use **Import project** above the local saves in the Open Project dialog.
Import validates the `.wcp.json` file, then opens and saves it in this browser
under the name in the file. It asks before replacing a same-name save or
discarding unsaved changes. Opening or importing does not connect hardware.

The board has 10 by 6 studs and grows or shrinks to fit the available screen
space, including fullscreen, without stretching its round studs. Tiles touch
edge-to-edge. The initial 3 by 3 **How it works** tile includes Connect hub in
step one and a shortcut to your newest online hub in step two, plus More help
and Dismiss tile buttons. Dismiss it to free its nine studs.
Tick **Do not show again** to remember that preference between sessions;
without the tick, help returns when you refresh.

The background is a mosaic of pale, colored LEGO plates. It stays the same
while you build and changes when you refresh; controls can cross plate edges.

Drag a tile's move or resize handle with a mouse or touch to arrange it.
Occupied spaces and positions outside the board cannot be used.

Use the **gear** to rename a tile, change its behavior, or remove it.
To use a different physical device, remove the tile and create a new one
from that device's hub menu.

**More help**, or **Help** in the footer, opens a larger illustrated guide to control options, action
keys, and connection behavior, using the same numbered steps as the help tile.
Its Close button leaves the instruction tile and visibility preference unchanged.
Dismissal and **Do not show again** are available on the instruction tile only.

**Controls, their settings/key bindings, and layout last only until you refresh
the page.** Only the help visibility preference is remembered.

## Controls and settings

| Control | What it does |
| --- | --- |
| Motor slider | Set speed from -100% to +100%. Speed stays set by default; enable **Reset to zero on release** for momentary operation. **Reverse rotation** reverses this slider's motor direction without moving its scale. |
| Motor arrows | Green direction buttons and a center Stop. Set **Speed (%)** from 1 to 100. **Stop on release** is on by default; turn it off to keep running until Stop or another direction. Stop is gray but usable in hold mode, red in keep-running mode. |
| Stop | Stop the motor assigned to this tile, including when another tile controls it. |
| Distance | One arc lights up, from the smallest nearby to the largest far away. Choose **Progressive** (default) or **Linear** spacing. |
| Color | Show a recognized color and its name. **Color stability** can filter brief changes: Immediate, Stable (150 ms), or Very stable (400 ms). This is not hardware sensitivity. |
| Tilt | Watch roll and pitch; choose their axes and reverse either direction. |
| Brightness | Set a light from 0% to 100%, using the motor slider's tile sizes. |
| On/Off | Turn a light on or off with a 1x1 toggle and optional action keys. |
| Color palette | Pick a rounded preset swatch on a 1x1, 1x2, 2x1, or 2x2 tile. |
| Custom color | Choose RGB hue and saturation on an inline gradient, in the same four color-tile sizes. |

Slider input supports mouse, touch, and keyboard. Arrow keys adjust the speed;
Home and End select -100% and +100%. Positive speed is at the top or right;
negative speed is at the bottom or left.
Momentary sliders also stop on cancellation or focus loss.

On supported angle-capable motors, slider and arrow tiles also offer **Servo**.
The default bounds are −180° to +180° and can be edited in Control settings.
Servo tiles for the same motor attachment share one virtual zero and requested
angle. Each tile uses its own bounds for the targets it sends.
In Servo settings, enable **Auto return to center** to request 0° when you
release an arrow or slider. It is off by default.
To interrupt a Servo slider move, use **Stop all motors** in the footer.
Place the motor at the intended zero before choosing **Servo**. The requested
angle starts at 0°, without sending a motion command or seeking mechanical stops.
The tile shows the requested angle, not a measured position. The bounds limit
requests, not actual motion; choose bounds that are safe for the model. If a
move is interrupted or another control drives the motor in Speed mode, switch
the tile out of Servo and back to set a fresh zero. Reconnecting, rebinding, or
editing bounds also sets a fresh zero without requesting an angle.
Absolute motors may reach less than the configured range to avoid wraparound.
**Step** is available on Servo-capable motors and verified Step adapters.
Each press moves by the configured angle. When only an absolute angle command
is available, Step uses encoder feedback and never wraps past the command range.

With Reverse rotation enabled, displayed +40% sends -40% to the motor.
Other controls on that motor keep their own direction settings; normal and
reversed sliders can therefore show opposite signs for the same running motor.

In the gear menu, optionally assign single **Action keys**: slider +10/+1/-1/-10,
arrow directions/Stop, a Stop tile, or light On/Off. Focus a key field and press a
key; use its clear button to unassign it. Adjustments happen once per press, not
while holding the key. A momentary slider resets on key release. Shared keys operate every
matching control, but conflicting actions for the same motor are rejected.
Keys stay inactive while typing or in dialogs/menus. Space, Enter, Tab, and Escape
are reserved for native activation and navigation; Ctrl/Alt/Meta shortcuts are
not supported. Light keys stay set after release and are not affected by motor
stops. Native focused controls still support keyboard operation.

Saving motor settings **does not change the running speed**. New settings apply
to your next interaction; an interaction already underway keeps its original
behavior until it ends.

Color and distance can be displayed together from one Color & distance device
on supported hubs. Dedicated Technic and DUPLO train-base color sensors are
also supported. WeDo Color & distance devices offer color only; WeDo motion
sensors offer distance. Tilt controls support compatible WeDo, Boost, and
Technic tilt sensors.

### Lights

Choose **Hub light** or a light-capable device in the hub menu, then choose a
dedicated light tile. Only supported controls are offered. Multiple tiles for
one light share its state. The On/Off tile has optional keys in its gear menu;
motors and sound devices are not eligible for this control.

The custom picker runs through rainbow hues from left to right, with full
saturation at the top and neutral gray at the bottom. Brightness is separate.
Tab to its Hue and Saturation inputs for native keyboard adjustment.

| Device | Available inputs |
| --- | --- |
| Hub light | RGB color, brightness, On/Off |
| Color & distance | Preset colors and On/Off; no brightness control, unavailable on WeDo |
| Light accessory | Brightness and On/Off |
| Technic color/distance sensor lights | Brightness and On/Off, all segments together |
| 3x3 light matrix | Preset colors, brightness in 10% steps, On/Off, all pixels together |

Changing a hub light's color also recolors that hub's menu and tiles.
The UI keeps this hue when the physical light is dimmed or off.
Other lights do not recolor their hub.

Creating or removing a light tile does not change the light. **Not set yet**
means the app has not controlled that output. Choosing a color or nonzero
brightness turns it on. Brightness updates as you slide; an interrupted gesture
keeps its last requested level. Custom color previews locally: release to apply,
or cancel to discard. Keyboard changes apply directly.
Zero brightness turns the light off; On restores its last nonzero brightness
(100% if none is known).
The display shows **app-set state**, not a hardware reading.

Sensor readings take priority when manual lighting needs an incompatible
mode, such as a Technic color sensor's illumination. The light tile explains
when another sensor control manages it. The Color & distance LED can be
controlled while its color/distance tiles keep receiving readings.

## Connections and safety

Disconnected tiles stay on the board but cannot operate their devices.
Reconnecting restores sensor readings without automatically restarting motors
or replaying previous light commands. Hub lights receive their normal startup
color. Lights are not switched off on key release or when hiding the page.
Removing a hub removes its tiles.

Releasing an arrow in hold mode or a momentary slider requests a motor stop.
Keep-running arrows do not stop on ordinary release or control focus changes.
Hiding/leaving the page requests a stop in either mode.
A closed page or lost Bluetooth connection cannot guarantee that
the stop reaches your model. Stop buttons are **not safety interlocks**:
another input can start the motor again. Keep a physical way to stop your model.

This project is a work in progress. Connection failures and action errors are
shown in the app.

## Contributing

Bug reports and pull requests are welcome:
[GitHub issues](https://github.com/aileo/web-control-plus/issues).

`main` contains V2, with the original handmade app preserved on `V1` for legacy
maintenance. The live site updates only when a stable V2 release tag is pushed,
not on ordinary branch updates.

For local setup, tests, builds, and implementation details, see
[the developer guide](DEVELOPMENT.md).
