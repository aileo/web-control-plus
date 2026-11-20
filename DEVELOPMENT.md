# Developer guide

For the app's purpose and user instructions, see [README](README.md).

## Local development

The app uses strict TypeScript, React 19, Vite 8, Material UI 9, and Emotion.
Use Node.js 24, or the Docker environment.

### Docker from VS Code

Start Docker Desktop and make sure Microsoft's **Dev Containers** extension
(`ms-vscode-remote.remote-containers`) is installed and enabled for this
workspace. The **Container Tools** extension does not provide the reopen
command. In a local VS Code window, use **File > Open Folder...** to open the
repository root.
Press `Ctrl+Shift+P`, type `Reopen in Container`, and select the Dev Containers
command. If it is missing, use **Dev Containers: Open Folder in Container...**
and select the repository root. If VS Code is already connected to this dev
container, use **Dev Containers: Rebuild Container** to apply configuration
changes.

VS Code starts the Compose service; no separate `docker compose up` is needed.
Open the **Local Address** for the Vite server in VS Code's **Ports** panel.
VS Code forwards container port 8000 to a different local port if 8000 is
busy. The Dev Container Compose override disables Docker's host port mapping
so it doesn't compete with VS Code. If startup fails, use **Dev Containers:
Show Container Log** to see the error.

On Windows, `EIO` errors reading files under `/app` can indicate a Docker
Desktop bind-mount problem. Restart Docker Desktop when it is safe to
interrupt other containers, then reopen the project in its dev container.
If the errors recur with the repo on `C:`, use a checkout in a WSL 2 Linux
filesystem (for example `~/dev`, not `/mnt/c`). Open that checkout in VS Code
from WSL with Docker Desktop WSL integration enabled, then reopen it in the
dev container. Preserve any uncommitted changes before switching checkouts.

### Docker from a terminal

```sh
docker compose up --build --watch
```

Open http://localhost:8000/. Stop Compose with Ctrl+C;
`docker compose down` removes the container.

With either Docker workflow, the workspace is bind-mounted and `node_modules`
stays in a container volume. The container enables the Vite lint watcher with
`LINT_FIX_WATCH=true` and polling for Docker Desktop. TS/TSX changes under `src`
run `npm run lint:fix`; fixes are written back to the host.

### Without Docker

```sh
npm ci --ignore-scripts
npm run dev
```

Skip install scripts because the browser does not use node-poweredup's native
Bluetooth bindings. Bluetooth runs in the browser, not the container. Use a
Web Bluetooth-compatible browser and a secure context: localhost permits HTTP;
access from another machine requires HTTPS. Optional proxies are configured in
`dev/proxies.json`.

| Command | Purpose |
| --- | --- |
| `npm test` | Node test runner with simulated Bluetooth and DOM/provider regressions |
| `npm run typecheck` | Strict checking for application, tests, and Vite configuration |
| `npm run lint` | ESLint for TypeScript application, tests, and Vite configuration |
| `npm run lint:fix` | Apply ESLint/Prettier fixes |
| `npm run build` | Typecheck, then build production assets into `dist` |
| `npm run preview` | Serve the production build on port 8000 |

Prettier uses `.prettierrc` and an 80-column target; ESLint also enforces
`max-len: 80`.
Long strings, URLs, and comments may need manual wrapping.
Tests allow long assertion strings and module fixtures, and sequential loops
for ordered hardware interactions; the same strict TypeScript rules apply.

The complete workspace is bind-mounted, so tests and configuration changes are
available in the container without copying files. From PowerShell:

```powershell
docker compose exec -T app npm test
docker compose exec -T app npm run typecheck
docker compose exec -T app npm run lint
docker compose exec -T app npm run build
```

For a focused run, replace `npm test` with `node --test` and the relevant
container-relative `.test.ts` filenames. Node 24 strips erasable TypeScript from
tests; Vite transpiles TSX in the app. DOM tests load actual source modules through
`tests/helpers/controls.ts`, mount the real providers, and use fake hubs.
The helper initializes Emotion in browser mode before loading components, then
gives each DOM fixture its own style cache. Markup-only checks use `staticMarkup()`.
Controlled timers cover color stability without wall-clock sleeps.
Simulated tests do not establish physical Bluetooth compatibility or accuracy.

### Motor positioning gate

Servo uses user-configured bounds relative to an attachment-local virtual
zero. The node-poweredup `TachoMotor` path uses `rotateByDegrees` deltas between
completed requests. The `AbsoluteMotor` path captures the encoder coordinate
at activation (rotation mode 2, not absolute sensor mode 3) and offsets each
`gotoAngle` target by that coordinate. Requests are also clamped to the
library's non-wrapping command range. Neither path displays
measured position or probes mechanical stops. WeDo 2.0 is excluded because
the library rejects both angle command APIs on that hub.

The provider arbitrates speed and angle requests per attachment. Cancellation,
unacknowledged angle commands, continuous Speed commands, disconnection,
rebinding and bound changes invalidate virtual zero.

Arrows offer Step on Servo-capable motors or when a verified `PositionDriver`
provides a finite step range. The verified driver uses its own feedback and
bounds. Otherwise Step prefers `rotateByDegrees`; on absolute-only motors, it
reads the encoder before each step and clamps the target to `gotoAngle`'s
non-wrapping command range. Neither Servo capability nor that command range
verifies mechanical travel or provides live position tracking.

## Releases and GitHub Pages

`main` is the default V2 branch; `v2` retains the V2 development history.
`V1` starts at the last pre-V2 `master` commit and is for legacy maintenance.
Target legacy fixes at `V1`, not `main`. V1 tags do not deploy the public site.

The **Validate and publish** workflow checks pushes to `main` and `v2`, and
pull requests targeting `main`. It installs with `npm ci --ignore-scripts`,
then runs lint, all tests, and the strict production build on Node 24.
The existing pretest/prebuild hooks apply the browser dependency patch.

Only a pushed stable `v2.x.y` tag deploys GitHub Pages. Branch pushes and
prerelease tags do not publish. The tag must match `package.json` and reference
a commit already merged into `main`; validation failures prevent deployment.
The workflow builds the tagged source and deploys `dist` through the native
Pages artifact actions using the `github-pages` environment. Repository
Settings > Pages must use **GitHub Actions** as its source. Relative asset URLs
preserve https://aileo.github.io/web-control-plus/.

For the next release, update both manifests without creating an automatic tag:

```sh
npm version 2.0.1 --no-git-tag-version --ignore-scripts
```

Commit that metadata with the intended changes, merge into `main`, and wait
for its checks to pass. From a clean, up-to-date `main`, publish the matching
annotated tag explicitly:

```sh
git tag -a v2.0.1 -m "Release v2.0.1"
git push origin v2.0.1
```

The initial V2 release is `v2.0.0`. No manual `npm run publish` command or npm
package publication is needed. A GitHub Release entry is optional and does not
trigger deployment by itself.

Check the tag's Actions run and Pages deployment before announcing a release;
confirm the live page and its JavaScript/CSS assets load at the repository URL.
Deployment jobs are serialized. The historical `gh-pages` branch is retained
but is no longer the publishing source.

If a transient infrastructure failure occurs, rerun the failed workflow jobs
for the same tag. Do not move or replace a published tag. A source fix or
rollback should be committed to `main`, validated, and published under a new
version and matching stable tag. Restoring legacy branch publishing is a
separate, deliberate Pages settings change, not part of the ordinary release.

## Active architecture

`src/components/Layout.tsx` nests Toast, Navigation, Hubs, Devices, and Controls
providers. The active page is a single control board; navigation owns the
current modal and selected hub menu. The unused V1 action/state/binding system
and Bootstrap/SCSS toolchain have been removed.

`src/core/types.ts` describes shared domain records and discriminated control
options. Hardware details stay at the client/provider boundary, where runtime
guards still validate external input. Type checking includes the test fixtures;
VM transpilation alone is not considered type checking.

Use meaningful function names and a concise purpose comment above each function.
Explain non-obvious connection ownership, ordering, and protocol decisions where
needed. Use PascalCase for components, useCamelCase for hooks, and kebab-case
for other source filenames.

`src/core/hooks/context-hook.ts` shares typed context access and missing-provider
checks; each provider still owns its state, lifecycle, actions, and public hooks.
`src/core/hooks/useModalAction.ts` shares duplicate-submit protection,
busy/error handling, and close-on-success, while each modal retains its draft
and explicit fields. Identical error-to-text conversion lives in
`src/utils/error-message.ts`; domain-specific reporting stays at its current
boundary.
Do not combine handlers merely because both use a ref or an async operation:
motor releases, custom-color drafts, and layout gestures have different rules.

### Hub state

`src/core/hooks/useHubs.tsx` owns a `Map` keyed by UUID, including offline
metadata. Metadata refreshes every second. The browser client loads with the
provider, but scanning starts only from the action returned by `useAddHub()`.

```tsx
import { useHubs, useAddHub, useRenameHub } from './src/core/hooks';

const hubs = useHubs();
const addHub = useAddHub();
const renameHub = useRenameHub();

// In async handlers; catch rejected actions.
const hub = await addHub();
await renameHub(hub.uuid, 'My hub');
```

Other hooks include `useHub(uuid)`, `useHubByMac(mac)`, `useHubsError()`,
`useRefreshHub()`, `useDisconnectHub()`, `useShutdownHub()`,
and `useRemoveHub()`. Action hooks take a UUID.

Disconnect/shutdown retain metadata; removal disconnects an online hub first.
Unmount removes owned listeners, timers, and subscriptions without disconnecting
established hubs. A connection completing after unmount is disconnected.
Voltage/current subscriptions are hub-owned. DevicesProvider owns LED writes,
including the initial generated hub light color. `useSetHubColor()` updates
only the matching hub session's appearance, not hardware. The chosen hue
survives metadata refreshes; a new hub session starts with its generated hue.

`useLatestConnectedHub()` selects the online hub with the highest session-local
`connectionOrder`. Successful connections/reconnections advance that sequence;
metadata refreshes and renaming preserve it without reordering the hub Map.
Disconnect/removal falls back to the next newest online hub, or null.

`ConnectHub.tsx` shares the toolbar/help button workflow, connection notifications,
and `useConnectingHub()` pending state. Only a successful explicit connection
requests opening that UUID's menu; polling does not. A pending menu waits for an
active control/help dialog to close instead of discarding its draft. Hub/device
tooltips are non-interactive so long descriptions cannot block device targets.
The help tile places Connect in step one and uses the latest-online-hub hook
for a step-two shortcut opening the same toolbar-anchored menu.
Navigation also owns a live reference to that shortcut and its hub UUID.
Popover backdrop clicks within the matching shortcut's rendered bounds keep
the current menu open; ordinary outside clicks and Escape still dismiss it.
The backdrop remains modal and does not pass clicks through to motor controls.

### Device state

`src/core/hooks/useDevices.tsx` owns
`Map<hub UUID, Map<port name, metadata>>`. Metadata includes `uuid`, `mac`,
`port`, numeric `hubType`, `type`, `connected`, attachment `connectionId`,
`events`, and `commands`. Hooks expose metadata, not hardware instances.

```tsx
import {
  useDevice, useSetDeviceSpeed, useSubscribeDevice, useUnsubscribeDevice,
} from './src/core/hooks';

const device = useDevice(uuid, 'A');
const setSpeed = useSetDeviceSpeed();
const subscribe = useSubscribeDevice();
const unsubscribe = useUnsubscribeDevice();

// In async handlers; catch rejected actions.
await setSpeed(uuid, 'A', 50);
await subscribe(uuid, sensorPort, 0);
await unsubscribe(uuid, sensorPort, 0);
```

`useDevices()`, `useHubDevices(uuid)`, and `useDevicesError()` expose collections
and action failures. Hardware actions optionally take an expected `connectionId`
as their last argument; a stale generation is rejected.

Sensor values remain arrays: `distance: [distance]`, `color: [recognizedColor]`,
and `tilt: [x, y, z]`. Combined events update color/distance atomically.
Only successful speed commands update `commands.speed`.

Detach/disconnect clears events and commands while retaining port/type metadata.
Reattachment creates a fresh generation; hub removal purges ports. Unnamed
ports are ignored quietly, while other failures are logged and surfaced.
Device hooks reject hub-owned system subscriptions. Subscription operations
are serialized per attachment; WeDo's motor-power and unsubscribe signatures
are handled at this boundary.

`src/utils/device-types` pairs friendly labels with icons. Keep enum identities
and telemetry independent of presentation. Voltage/current are types 20/21,
not the battery-percentage display. Unknown types use the dictionary fallback.

### Controls and layout

`src/core/hooks/useControls.tsx` owns session-only control records and sensor
subscription ownership. Records store hub UUID/port rather than hardware
instances. `src/features/controls/definitions.ts` collects control definitions
for compatible devices, sizes, modes, and defaults. `controlOptions()` validates
options and returns a fresh normalized object; partial updates retain other
saved options.

Each folder in `src/features/controls` owns its option types, definition,
widget and UI registration. Add a control by defining its type and options in
`types.ts`, registering its definition in `definitions.ts`, and registering its
`ui.tsx` module in `ui.ts`. Use `defineControlUI` to supply the typed widget,
an explicit settings component or `null`, and a provider-free preview. Shared
settings, shortcuts and the tile shell remain reusable; control-specific actions
and validation belong in the control's folder. Keep the saved control type
identifier stable when changing filenames.

```tsx
import {
  useControls, useAddControl, useUpdateControl, useRemoveControl,
} from './src/core/hooks';

const controls = useControls();
const add = useAddControl();
const update = useUpdateControl();
const remove = useRemoveControl();

// In async handlers; catch rejected actions.
const tile = await add({ uuid, port: 'A', type: 'slider', w: 2, h: 1 });
await update(tile.id, { options: { resetOnRelease: true } });
await remove(tile.id);
```

Other hooks include `useControl(id)`, `useControlStatus(id)`,
`useControlsError()`, `useClearControlsError()`, `useSetControlSpeed()`,
`useMotorControl(id)`, and `useRetryControls()`.

Defaults are `resetOnRelease: false, reverseRotation: false` for sliders,
`speed: 100, stopOnRelease: true` for arrows,
`scale: 'progressive'` for distance, and `stability: 0` for color. Arrow speed
is an integer from 1 through 100. Distance also accepts `'linear'`; color
stability accepts 0, 150, or 400 milliseconds. Tilt keeps axes 0/1 and reversal
factors 1/1; axes may be 0, 1, or 2 and factors must be 1 or -1.
Unknown options and invalid values are rejected, not silently coerced.

The settings form submits title/options only. Saving motor options sends no
hardware command and affects future input; active interactions retain their
captured behavior. Layout handles provide pointer/touch editing only.
The update API retains binding/layout support and stop-before-rebind safeguards.

Motor telemetry, intended speeds, queues, and `useSetControlSpeed()` remain
physical motor speeds. `motorDirection()` supplies the per-slider sign factor;
`useMotorControl()` converts native displayed input and reported speed once.
While a speed command is pending, it displays the latest shared requested
physical speed rather than stale Bluetooth feedback. Queue tickets prevent
older completions from clearing a newer request; failure restores confirmed
speed, and attachment changes discard obsolete pending values.
Other motor-control types use factor 1. Slider interactions capture their
command conversion, so changing reversal does not remap an active gesture.
Saving reversal sends no command; its readout reinterprets the unchanged
physical speed. Slider artwork/native input both put +100 at top/right and
-100 at bottom/left, independently of reversal.

`src/core/control-layout.ts` owns the 10-by-6 geometry, first-fit placement,
occupancy checks, and supported-size snapping. A dismissible 3-by-3 help tile
reserves space through `useBoardOccupancy()` but is not in `useControls()`.
`useBoardInstructions()` and `useDismissInstructions()` expose its lifecycle.
`useHelpPreference.ts` owns the one localStorage preference,
`web-control-plus:hide-help`. Checkbox changes persist immediately without
dismissing the current tile; ordinary dismissal affects the current session.
Storage failures are logged and shown, and failed writes retain the last known
preference. Nothing else about the board or motor state is persisted.

The nominal board is 1440 by 864 pixels. `GridLayout.tsx` uniformly fits it
to the available width/height, including scales above one for large/fullscreen
viewports. Cells remain square; aspect-ratio differences leave centered margins.
`Grid.tsx` validates/commits pointer gestures using rendered board bounds;
invalid edits leave the record intact.
`ControlPreview.tsx` uses provider-independent faces and sample sensor data,
never motor actions or subscriptions. Shared LEGO surfaces live in
`src/theme/lego.ts`.

`src/core/board-pattern.ts` splits the board into supported rectangular plates,
without overlaps, holes, or 1-by-1 fillers. Randomness is injectable for tests.
`GridLayout.tsx` generates the decorative pattern once per module load, so
rerenders, resizing, help dismissal, and board remounts retain it until refresh.
Cells use opaque 90%-white theme tints; separate inset outlines mark the plates
without changing stud geometry. Decoration is hidden from assistive technology
and ignores pointers. It never participates in control occupancy or snapping.

### Action keys

`shortcutFields`, `controlShortcuts()`, and key normalization live beside the
control registry. All bindings default to empty strings. Settings capture single
keys, normalize letter case, and reserve Space/Enter/Tab/Escape for native
activation and navigation. The provider validates shared bindings on
add/update/rebind and speed/mode changes: the same
hub/port/key must resolve to the same delta/speed and release behavior.
Identical same-motor bindings dispatch once; different motors may share keys.
Invalid changes reject atomically and never issue motor commands.
Slider shortcut deltas include the direction factor before conflict comparison
and dispatch. Thus Increase by 10 on a reversed slider changes its displayed
value by +10 while changing physical speed by -10. Opposite effective actions
for one motor/key still conflict; equivalent ones deduplicate.

ControlsProvider has one key dispatcher. It ignores repeat/duplicate keydowns,
typing/composition, modifier chords, dialogs/menus, and all four reserved keys.
Native focused controls still receive activation and navigation keys.
Physical key codes pair presses/releases even if Shift changes.
Slider +/-1 and +/-10 use the latest intended speed, including queued commands,
and clamp to +/-100. Failed commands remain visible and restore confirmed intent.
Ownership guards keep stale key/pointer releases from stopping newer input.
An explicit zero-speed command clears held-key actions for that attachment.

Normal release obeys the captured reset/stop-on-release option. Arrows with that
option off retain their speed across ordinary release/control focus changes;
explicit Stop remains usable in either mode. Page safety, attachment generations,
and stop-before-remove/rebind still apply. The mode is not a safety interlock.
Tests in `control-keys.test.ts` and `onboarding.test.ts` cover dispatch, pending
commands, input ownership, conflicts, capture, connection handoff, and storage.

### LED outputs and detailed help

`src/core/leds.ts` lists the six supported light families, hub restrictions,
color modes, brightness steps, and output payloads. `lego-colors.ts` shares
the recognized palette between color displays and LED swatches. Hub RGB
brightness uses the existing calibration at the hardware boundary; UI hue
does not incorporate brightness.

`useSetDeviceLight()(uuid, port, changes, connectionId)` and
`useSetControlLight()(id, changes, expectedTarget)` accept partial `on`, `color`,
and `brightness` changes. Shared selection/last applied state is in
`device.commands.light`; `lightPending`, `lightError`, and `lightBlocked`
describe progress and mode conflicts. Unknown power is `null`, not false.
Off/unknown selections are staged without implicitly turning the device on.
Creating, configuring, moving, resizing, or removing tiles sends no LED writes.

LED output and subscription operations share a per-attachment queue with
generation checks before sending/publishing. The control action also checks
prospective sensor owners, including readers created during a pending write.
Technic color illumination requires mode 3 and yields to sensor readers.
Output-only writes keep combined color/distance input mode 8 intact.
Avoid library wrappers that switch input modes or omit their write promise.
Hardware readback is not available; command completion is app-set state only.
Reconnect does not replay selections; normal hub startup coloring is preserved.

Power `onKey`/`offKey`/`toggleKey` default to empty strings and use the existing
dispatcher with explicit action identities. They participate in same-output
conflict validation/deduplication but never in motor speed or
release/safety-stop paths.
`led-controls.test.ts` covers payloads, state, races, mode ownership, and UI
using simulated devices, not physical hardware.

The `brightness`, `power`, `palette`, and `customColor` discriminants replace
the combined LED widget. `isLightControlType()` shares light-action and conflict
guards, while compatibility filters each kind against actual capabilities.
Motors, buzzers, and speakers are not general-purpose switch outputs.
Dedicated color and brightness UI commits include `on: true` atomically
(zero brightness includes `on: false`); the lower-level staging API above
is intentionally unchanged.

`Light.tsx` shares state/error handling and inert power/palette faces.
The power face uses a native checkbox with switch semantics; previews render
only its track and thumb. `SliderFace.tsx` owns slider artwork and the native
range presentation shared by motor and brightness controls, not their actions.
Brightness changes write immediately. Each attachment retains at most one
consecutive unsent brightness request, replacing its value/guard with the latest
input. Discrete light actions and subscription operations break that group and
retain their queue order. `requestedBrightness` keeps all sliders responsive
until the latest request settles; `commands.light` remains confirmed state.
Failed writes report shared errors and expose the last successful selection.
Cancellation never rolls back values already requested.

`usePointerDraft` is only for custom color: it keeps pointer drafts local and
cancels on capture loss, page hiding, blur, or unmount. Color writes happen on
release; native keyboard changes commit directly. The RGB picker maps normalized hue/saturation
coordinates at fixed 50% HSL lightness. Its gray-bottom plane is independent
of output brightness; two native ranges provide keyboard/assistive input.
Previews contain only decorative elements, not live form controls.

`InstructionStep.tsx` shares the numbered pastel presentation between the
compact instruction tile and `BoardHelp.tsx`. The latter contains only inert
guide content/keycaps. BoardInstructions keeps dialog navigation and live
hub-shortcut ownership. The guide offers Close only; dismissal and the remembered
visibility preference belong to the instruction tile, not its modal.
The larger guide also opens from the footer and restores the actual opener
through its return-focus id. `HubButton.tsx` shares header/shortcut presentation;
the shortcut remains open-only and never owns a second hub popover.
Examples cannot actuate devices, and the existing dialog shortcut guard stays
in effect.

## Sensors and library patch

Sensor controls sharing an attachment/mode own one subscription. Reconciliation
and availability use the same target calculation. Telemetry and display-option
changes do not switch modes or resubscribe; the final consumer releases it.

| Device | Stream |
| --- | --- |
| Color & distance on supported LPF2 hubs | Combined mode 8 for either/both tile types |
| Color & distance on WeDo | Color mode 0 only; distance/combined unsupported |
| Technic color | Color mode 0 |
| DUPLO train-base color | Color mode 1 |
| WeDo motion | Distance mode 0 |
| Supported tilt sensors | Tilt mode 0 |

Color is a recognized enum, not raw RGB, reflectance, or confidence. NONE (255)
is "No color detected", distinct from black (0), waiting, and unknown values.
Stability is per-tile display filtering; changing distance in a combined event
must not restart a timer when the color is unchanged. Timers are canceled on
new candidates, option changes, attachment changes, and unmount.

Distance uses the reported maxima 234 mm for Color & distance and 5100 mm for
motion. Clamp first, normalize, optionally take the square root, then map to
one of four arcs. Progressive transitions are 6.25%, 25%, and 56.25% of maximum:
14.625/58.5/131.625 mm or 318.75/1275/2868.75 mm respectively. Linear transitions
are 25%, 50%, and 75%. These are display scales, not physical accuracy claims.
The UI deliberately shows qualitative bands rather than numeric distance.

`patches/node-poweredup+10.1.0.patch` fixes browser compatibility, discovery
timing, and recognized-color parsing. Color parsers validate packet sizes and
report NONE; combined parsing normalizes colors consistently and keeps distance
updating when no color is detected. Review this version-specific patch when
upgrading the library. `predev`, `pretest`, and `prebuild:src` apply it.

`src/core/clients/browser-polyfills.ts` initializes browser `Buffer` and `process`,
including `process.nextTick` for queued LED/motor commands. Vite does not supply
Node globals automatically.

## Hardware lifecycle and errors

Keep these safeguards when simplifying code:

- Generation checks prevent stale events, command completions, releases, or
  subscription cleanup from targeting replacement attachments.
- Motor queues coalesce unsent commands and prevent older speeds overtaking a
  newer stop. Mutation locks protect stop-before-remove/rebind.
- Failed safety stops leave controls intact for retry. Disconnected controls
  remain disabled; reconnect does not restart motors.
- Momentary arrow/slider release, cancellation, or focus loss requests Stop.
  Latched arrows continue on ordinary release/control focus changes.
  Hiding/leaving the page and provider teardown request stops for active motors.
  Delivery after lost Bluetooth or browser exit remains best-effort.
- Sensor ownership includes pending subscribe/unsubscribe and explicit retry
  after failure; do not retry merely because a reading or metadata changed.
- Hardware/validation failures reject to callers, are logged, and remain visible
  through the relevant error hooks/UI. Catch rejected actions in async handlers.

## Theme and hub colors

`src/theme/colors.ts` defines the semantic palette. Connect uses primary.
Header/footer surfaces use info with contrasting text and inherited-color
underlined footer links; footer content and wrapped rows are centered.
Help steps use primary/info/success/error numbered badges with contrast text.
Arrow faces use contiguous square segments with rounded outer ends in both
orientations, including inert previews. Local size containers fit the largest
square segments to one third of the long axis and the cross-axis space.
The tilt dial similarly fills its dial area, above a compact Roll/Pitch row.
These faces use CSS sizing, not extra observers or component measurement state.
Hub Configure/Disconnect/Shutdown/Remove use primary/warning/error/error with
contrastText icons. Disabled actions remain neutral. Toolbar hub accents are a
more saturated, darker derivative of the assigned color, not a separate palette.

`src/core/clients/hub-colors.ts` deterministically hashes UUIDs into
`hubColorPalette`. Each entry pairs a pastel UI `hex` with saturated LED `rgb`.
Control tiles retain subtle hub tints; colors can repeat.

`hubColorCalibration` transforms LED RGB only: normalize, apply `gamma`, multiply
by channel `gains`, round, and clamp to 0-255. Green gain starts at 0.5 to reduce
an observed orange/yellow cast; this is a visual trial, not measured calibration.
Other gains and gamma start at 1. `excludedHues` uses half-open degree ranges;
split ranges crossing zero. Changes apply on reconnect. Physical output needs
visual verification and can differ between hub models.

## Toasts

Inside `ToastProvider`, `usePostMessage()` returns a posting function:

```tsx
const postMessage = usePostMessage();
const id = postMessage({ text: 'Connected', level: 'success' });
```

Levels are success, info (default), warning, and error. `duration` is a
non-negative millisecond value, defaulting to 3000; `icon` may be a React node.
Each toast expires independently and can be dismissed early.
`useToastMessages()` and `useDismissMessage()` expose messages and dismissal.
The returned ID supports programmatic dismissal. Hub connection success and
layout feedback use toasts; relevant inline errors remain visible too.
