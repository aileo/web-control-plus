import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { inputField, query } from './helpers/dom.ts';
import {
  button,
  click,
  controlOf,
  create,
  fakeDevice,
  fakeHub,
  input,
  lego,
  loadSource,
  mount,
  project,
  visibleText,
} from './helpers/controls.ts';
import type { Board, Control } from '../src/core/types.ts';

const Main = loadSource('components/pages/Main').default;
const Header = loadSource('components/Header').default;
const renderHeader = () => React.createElement(Header);
const renderApp = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Header),
    React.createElement(Main)
  );

function sampleProject(name = 'Workshop') {
  const control = {
    id: 'control-1',
    type: 'arrows',
    title: 'Train',
    uuid: 'hub-offline',
    port: 'A',
    x: 2,
    y: 1,
    w: 1,
    h: 2,
    options: { speed: 42, stopOnRelease: false, forwardKey: 'q' },
  } as Control;
  return project.createProjectSnapshot(
    name,
    [{ id: 'board-1', name: 'Yard', controlIds: [control.id] }] as Board[],
    'board-1',
    [control]
  );
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  failWrites = false;

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
  }
}

test('project snapshots round-trip board, control, and hardware metadata only', () => {
  const first = sampleProject();
  const second = project.createProjectSnapshot(
    'Workshop',
    [
      { id: 'board-1', name: 'Yard', controlIds: ['control-1'] },
      { id: 'board-2', name: 'Cab', controlIds: [] },
    ],
    'board-2',
    first.controls
  );
  const serialized = project.serializeProject(second);
  const reopened = project.parseProject(serialized);
  assert.equal(JSON.stringify(reopened), JSON.stringify(second));
  assert.equal(reopened.hubs.length, 1);
  assert.equal(reopened.devices.length, 1);
  assert.match(serialized, /"forwardKey":"q"/);
  assert.doesNotMatch(serialized, /commands|connected|events|speed":0/);
});

test('version 2 snapshots round-trip preset colors and normalize Default', () => {
  const legacy = sampleProject();
  const colors = ['red', 'blue', 'green', 'purple'];
  const snapshot = project.validateProject({
    ...legacy,
    boards: [
      ...legacy.boards,
      { id: 'default', name: 'Default', controlIds: [], color: undefined },
      ...colors.map((color) => ({
        id: color,
        name: color,
        controlIds: [],
        color,
      })),
    ],
  });
  const restored = project.parseProject(project.serializeProject(snapshot));
  assert.equal(restored.version, 2);
  assert.equal(Object.hasOwn(restored.boards[0], 'color'), false);
  assert.equal(Object.hasOwn(restored.boards[1], 'color'), false);
  assert.deepEqual(
    Array.from(restored.boards.slice(2), (board) => board.color),
    colors
  );
  [null, '', 'orange', 'constructor', 1].forEach((color) => {
    assert.throws(
      () =>
        project.validateProject({
          ...legacy,
          boards: [{ ...legacy.boards[0], color }],
        }),
      /invalid tab color/
    );
  });
});

test('project validation rejects unsupported versions, invalid options and overlapping layout', () => {
  const snapshot = sampleProject();
  assert.throws(
    () => project.parseProject(JSON.stringify({ ...snapshot, version: 1 })),
    /Unsupported or invalid project format/
  );
  assert.throws(
    () =>
      project.validateProject({
        ...snapshot,
        controls: [{ ...snapshot.controls[0], options: { speed: 101 } }],
      }),
    /speed/
  );
  assert.throws(
    () =>
      project.validateProject({
        ...snapshot,
        boards: [
          {
            id: 'board-1',
            name: 'Yard',
            controlIds: ['control-1', 'control-2'],
          },
        ],
        controls: [
          ...snapshot.controls,
          {
            ...snapshot.controls[0],
            id: 'control-2',
            title: 'Second',
          },
        ],
      }),
    /invalid layout/
  );
  assert.throws(
    () =>
      project.validateProject({
        ...snapshot,
        devices: [{ ...snapshot.devices[0], uuid: 'unknown-hub' }],
      }),
    /invalid device/
  );
  assert.throws(
    () =>
      project.validateProject({
        ...snapshot,
        hubs: [{ ...snapshot.hubs[0], color: 'yellow' }],
      }),
    /invalid or duplicate hub/
  );
  assert.throws(
    () =>
      project.validateProject({
        ...snapshot,
        boards: [
          {
            id: 'board-1',
            name: 'Yard',
            controlIds: ['control-1', 'control-2'],
          },
        ],
        controls: [
          ...snapshot.controls,
          {
            ...snapshot.controls[0],
            id: 'control-2',
            title: 'Second',
            x: 4,
            options: {
              speed: 42,
              stopOnRelease: false,
              backwardKey: 'q',
            },
          },
        ],
      }),
    /conflicts/
  );
});

test('corrupt local saves remain visible and are not overwritten without consent', () => {
  const storage = new MemoryStorage();
  const snapshot = sampleProject();
  const key = project.storageKeyForProject(snapshot.name);
  storage.setItem(key, '{corrupt');
  const [saved] = project.listSavedProjects(storage);
  assert.equal(saved.name, 'workshop');
  assert.match(saved.error ?? '', /valid JSON/);
  assert.throws(() => project.readSavedProject(key, storage), /Could not open/);
  assert.throws(
    () => project.saveProject(snapshot, { storage }),
    /already exists/
  );
  assert.equal(storage.getItem(key), '{corrupt');
  project.saveProject(snapshot, { storage, overwrite: true });
  assert.equal(
    JSON.stringify(project.readSavedProject(key, storage)),
    JSON.stringify(snapshot)
  );
});

test('a failed storage write leaves the previous saved project intact', () => {
  const storage = new MemoryStorage();
  const snapshot = sampleProject();
  const key = project.storageKeyForProject(snapshot.name);
  project.saveProject(snapshot, { storage });
  const previous = storage.getItem(key);
  storage.failWrites = true;
  assert.throws(
    () =>
      project.saveProject(
        {
          ...snapshot,
          controls: [{ ...snapshot.controls[0], title: 'Updated' }],
        },
        { storage, overwrite: true }
      ),
    /could not be saved/
  );
  assert.equal(storage.getItem(key), previous);
});

test('named project save, reopen, resave, copy and collision use active identity', async (t) => {
  const view = await mount(t, { render: renderHeader });
  const saveDialog = () =>
    query(document, '[role="dialog"][aria-labelledby="project-save-title"]');
  const projectName = () => inputField(saveDialog(), 'input');
  const confirmationSelector =
    '[role="dialog"][aria-labelledby="project-confirm-title"]';
  const confirmationDialog = () => query(document, confirmationSelector);
  const submitSave = () => click(button('Save', saveDialog()));
  const assertNoOverwrite = () =>
    assert.equal(
      document
        .querySelector(`${confirmationSelector} #project-confirm-title`)
        ?.textContent?.trim() === 'Overwrite saved project?',
      false,
      'Resaving the active project should not prompt for overwrite'
    );

  fakeHub();
  await act(() => view.api.addHub());
  const boardId = view.api.selectedBoardId;
  await act(() => view.api.updateBoardSettings(boardId, 'Board 1', 'blue'));
  assert.equal(view.api.projectDirty, true);
  await click(button('Save project'));
  assert.equal(projectName().value, '');
  await input(projectName(), 'Workshop');
  await submitSave();
  assert.equal(project.listSavedProjects().length, 1);
  assert.equal(view.api.projectDirty, false);
  assert.equal(
    view.api.activeLocalSave?.id,
    project.storageKeyForProject('Workshop')
  );
  assert.equal(view.api.activeLocalSave?.name, 'Workshop');

  await act(() => view.api.updateBoardSettings(boardId, 'Board 1'));
  assert.equal(view.api.projectDirty, true);
  await click(button('Open project'));
  const openDialog = query(
    document,
    '[role="dialog"][aria-labelledby="project-open-title"]'
  );
  await click(query(openDialog, '.MuiListItemButton-root'));
  await click(button('Discard and open', confirmationDialog()));
  assert.equal(view.api.boards[0].color, 'blue');
  assert.equal(view.api.projectDirty, false);
  assert.equal(view.api.activeLocalSave?.name, 'Workshop');

  await act(() => view.api.updateBoardSettings(boardId, 'Renamed', 'blue'));
  await click(button('Save project'));
  assert.equal(projectName().value, 'Workshop');
  await submitSave();
  assertNoOverwrite();
  assert.equal(view.api.projectDirty, false);
  let saved = project
    .listSavedProjects()
    .find((item) => item.name === 'Workshop');
  assert.equal(saved?.snapshot?.boards[0].name, 'Renamed');

  await click(button('Save project'));
  assert.equal(projectName().value, 'Workshop');
  await input(projectName(), 'Workshop Copy');
  await submitSave();
  assert.equal(project.listSavedProjects().length, 2);
  assert.equal(view.api.activeLocalSave?.name, 'Workshop Copy');
  const savedCopy = project
    .listSavedProjects()
    .find((item) => item.name === 'Workshop Copy');
  assert.equal(savedCopy?.snapshot?.boards[0].name, 'Renamed');

  await act(() =>
    view.api.updateBoardSettings(boardId, 'Copy changes', 'blue')
  );
  await click(button('Save project'));
  assert.equal(projectName().value, 'Workshop Copy');
  await input(projectName(), 'Workshop');
  await submitSave();
  const confirmation = confirmationDialog();
  assert.match(confirmation.textContent ?? '', /Overwrite saved project/);
  assert.equal(view.api.activeLocalSave?.name, 'Workshop Copy');
  await click(button('Cancel', confirmation));
  saved = project.listSavedProjects().find((item) => item.name === 'Workshop');
  assert.equal(saved?.snapshot?.boards[0].name, 'Renamed');
  assert.equal(
    project.listSavedProjects().find((item) => item.name === 'Workshop Copy')
      ?.snapshot?.boards[0].name,
    'Renamed'
  );
  assert.equal(view.api.activeLocalSave?.name, 'Workshop Copy');
});

test('header project actions gate Save by live hubs or hub-linked controls', async (t) => {
  const view = await mount(t, { render: renderApp });
  const save = button('Save project');
  const open = button('Open project');
  const waitForTransition = () =>
    act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 650);
      });
    });
  assert.equal(save.textContent?.trim(), '');
  assert.equal(open.textContent?.trim(), '');
  assert.equal(save.getAttribute('disabled') !== null, true);
  assert.equal(open.getAttribute('disabled'), null);
  await act(() => open.focus());
  await click(open);
  assert.match(
    document.querySelector('[aria-labelledby="project-open-title"]')
      ?.textContent ?? '',
    /No saved projects yet/
  );
  await click(button('Close'));
  await waitForTransition();
  assert.equal(document.activeElement === open, true);

  await act(async () =>
    view.api.restoreProject(
      project.createProjectSnapshot(
        'Offline',
        [
          {
            id: 'offline-board',
            name: 'Offline',
            controlIds: ['offline-control'],
          },
          { id: 'empty-board', name: 'Empty', controlIds: [] },
        ],
        'empty-board',
        [
          {
            ...sampleProject().controls[0],
            id: 'offline-control',
            uuid: 'disconnected-hub',
          },
        ]
      )
    )
  );
  assert.equal(button('Save project').getAttribute('disabled'), null);
  await act(() => save.focus());
  await click(save);
  assert.equal(
    document.activeElement === document.querySelector('input'),
    true
  );
  await click(button('Cancel'));
  await waitForTransition();
  assert.equal(document.activeElement === save, true);
  await click(save);
  await input(document.querySelector('input')!, 'Offline');
  await click(button('Save'));
  assert.equal(project.listSavedProjects().length, 1);
  assert.equal(view.api.activeLocalSave?.name, 'Offline');
  await act(() => view.api.updateBoardSettings('empty-board', 'Empty changed'));
  await click(button('Save project'));
  assert.equal(document.querySelector('input')?.value, 'Offline');
  await click(button('Save'));
  assert.equal(
    document.querySelector('[aria-labelledby="project-confirm-title"]'),
    null
  );
  assert.equal(
    project.listSavedProjects()[0].snapshot?.boards[1].name,
    'Empty changed'
  );
  await click(button('Save project'));
  await act(async () => view.api.remove('offline-control'));
  assert.equal(button('Save project').getAttribute('disabled') !== null, true);
  assert.equal(button('Save').getAttribute('disabled') !== null, true);
});

test('offline restore loads all hubs and devices without hardware side effects', async (t) => {
  const view = await mount(t, { render: renderApp });
  const hub = fakeHub();
  hub.devices.D = fakeDevice('D');
  hub.devices.E = fakeDevice('E');
  await act(() => view.api.addHub());
  const first = await create(view, 'arrows', 'A', {
    options: { speed: 37, stopOnRelease: false, forwardKey: 'q' },
  });
  const firstBoard = view.api.selectedBoardId;
  await act(() => view.api.updateBoardSettings(firstBoard, 'Yard'));
  await act(() => view.api.update(first.id, { x: 2, y: 1 }));
  await act(() => view.api.addBoard());
  const secondBoard = view.api.selectedBoardId;
  await act(() => view.api.updateBoardSettings(secondBoard, 'Cab'));
  const second = await create(view, 'slider', 'D', {
    options: { resetOnRelease: true, increase10Key: 'e' },
  });
  await act(() => view.api.update(second.id, { x: 4, y: 2 }));
  const snapshot = view.api.snapshotProject('Offline rig');
  assert.equal(snapshot.hubs.length, 1);
  assert.equal(
    snapshot.devices.some((device) => device.port === 'E'),
    true
  );
  await act(() => view.api.speed(first.id, 56));
  await act(() => view.api.removeHub(hub.uuid));
  assert.equal(view.api.snapshotProject('After hub removal').devices.length, 0);
  const commandCount = hub.devices.A.speeds.length;
  const subscriptionCount = hub.subscriptions.length;
  const unsubscriptionCount = hub.unsubscriptions.length;

  await act(async () => view.api.restoreProject(snapshot));
  assert.equal(
    JSON.stringify(view.api.boards.map(({ id, name }) => [id, name])),
    JSON.stringify([
      [firstBoard, 'Yard'],
      [secondBoard, 'Cab'],
    ])
  );
  assert.equal(view.api.selectedBoardId, secondBoard);
  const restoredSlider = controlOf(view.api.controls.get(second.id), 'slider');
  assert.equal(restoredSlider.x, 4);
  assert.equal(restoredSlider.options.resetOnRelease, true);
  await act(() => view.api.selectBoard(firstBoard));
  const restoredArrows = controlOf(view.api.controls.get(first.id), 'arrows');
  assert.equal(restoredArrows.options.speed, 37);
  assert.equal(restoredArrows.options.forwardKey, 'q');
  assert.equal(view.api.hubs.get(hub.uuid)?.online, false);
  assert.equal(view.api.devices.get(hub.uuid)?.get('E')?.connected, false);
  assert.equal(hub.devices.A.speeds.length, commandCount);
  assert.equal(hub.subscriptions.length, subscriptionCount);
  assert.equal(hub.unsubscriptions.length, unsubscriptionCount);

  await click(button('Test hub actions'));
  const offlineDevice = document.querySelector('[aria-label^="E:"]');
  assert.ok(offlineDevice);
  assert.match(offlineDevice.getAttribute('aria-label') || '', /Disconnected/);
  assert.match(visibleText(document.body), /Offline/);
  assert.equal(
    button('Disconnect hub').getAttribute('disabled') !== null,
    true
  );
  assert.equal(button('Remove hub').getAttribute('disabled'), null);
});

test('removing an offline hub omits its stale device inventory from snapshots', async (t) => {
  const view = await mount(t);
  const hub = fakeHub('removed-hub');
  await act(() => view.api.addHub());
  await act(() => view.api.disconnect(hub.uuid));
  await act(() => view.api.removeHub(hub.uuid));

  assert.equal(view.api.hubs.has(hub.uuid), false);
  assert.equal(view.api.snapshotProject('After hub removal').devices.length, 0);
});

test('opening a project preserves an already connected hub and its devices', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const snapshot = view.api.snapshotProject('Live hub');
  snapshot.hubs[0].name = 'Saved hub label';
  const subscriptionCount = hub.subscriptions.length;
  const commandCount = hub.devices.A.speeds.length;

  await act(async () => view.api.restoreProject(snapshot));

  assert.equal(view.api.hubs.get(hub.uuid)?.online, true);
  assert.equal(view.api.hubs.get(hub.uuid)?.name, 'Test hub');
  assert.equal(view.api.devices.get(hub.uuid)?.get('A')?.connected, true);
  assert.equal(hub.subscriptions.length, subscriptionCount);
  assert.equal(hub.devices.A.speeds.length, commandCount);
});

test('replacing a matching offline hub rebinds controls and transfers color only', async (t) => {
  const view = await mount(t);
  const oldHub = fakeHub('saved-hub');
  await act(() => view.api.addHub());
  assert.equal(view.api.hubs.get(oldHub.uuid)?.online, true);
  assert.equal(view.api.devices.get(oldHub.uuid)?.get('A')?.connected, true);
  assert.equal(view.api.isDeviceCurrent(oldHub.uuid, 'A'), true);
  const control = await create(view, 'slider', 'A', { uuid: oldHub.uuid });
  await act(() => view.api.addBoard());
  const secondControl = await create(view, 'arrows', 'A', {
    uuid: oldHub.uuid,
  });
  const snapshot = view.api.snapshotProject('Saved rig');
  snapshot.hubs[0].color = '#8040c0';
  await act(() => view.api.removeHub(oldHub.uuid));
  await act(() => view.api.restoreProject(snapshot));

  const newHub = fakeHub('connected-hub');
  newHub.name = 'New physical name';
  let renameCalls = 0;
  newHub.setName = async (name: string) => {
    renameCalls += 1;
    newHub.name = name;
  };
  await act(() => view.api.addHub());
  const speedWrites = newHub.devices.A.speeds.length;

  await act(() => view.api.replaceOfflineHub(oldHub.uuid, newHub.uuid));

  assert.equal(view.api.hubs.has(oldHub.uuid), false);
  assert.equal(view.api.devices.has(oldHub.uuid), false);
  assert.equal(view.api.allControls.get(control.id)?.uuid, newHub.uuid);
  assert.equal(view.api.allControls.get(secondControl.id)?.uuid, newHub.uuid);
  assert.equal(view.api.hubs.get(newHub.uuid)?.color, '#8040c0');
  assert.equal(view.api.hubs.get(newHub.uuid)?.name, 'New physical name');
  assert.equal(newHub.name, 'New physical name');
  assert.equal(renameCalls, 0);
  assert.equal(newHub.devices.A.speeds.length, speedWrites);
});

test('a changed device signature leaves the saved hub and controls intact', async (t) => {
  const view = await mount(t);
  const oldHub = fakeHub('saved-hub');
  await act(() => view.api.addHub());
  assert.equal(view.api.hubs.get(oldHub.uuid)?.online, true);
  assert.equal(view.api.devices.get(oldHub.uuid)?.get('A')?.connected, true);
  assert.equal(view.api.isDeviceCurrent(oldHub.uuid, 'A'), true);
  const control = await create(view, 'slider', 'A', { uuid: oldHub.uuid });
  const snapshot = view.api.snapshotProject('Saved rig');
  await act(() => view.api.removeHub(oldHub.uuid));
  await act(() => view.api.restoreProject(snapshot));

  const newHub = fakeHub(
    'connected-hub',
    lego.CONSTS.HubType.TECHNIC_MEDIUM_HUB,
    {
      A: fakeDevice('A', lego.CONSTS.DeviceType.COLOR_DISTANCE_SENSOR),
    }
  );
  await act(() => view.api.addHub());
  await act(() =>
    assert.rejects(
      view.api.replaceOfflineHub(oldHub.uuid, newHub.uuid),
      /no longer match/
    )
  );

  assert.equal(view.api.hubs.get(oldHub.uuid)?.online, false);
  assert.equal(view.api.controls.get(control.id)?.uuid, oldHub.uuid);
  assert.equal(view.api.hubs.get(newHub.uuid)?.online, true);
});

test('adding after restore avoids huge numeric-looking snapshot IDs', async (t) => {
  const view = await mount(t);
  fakeHub();
  await act(() => view.api.addHub());
  const original = sampleProject();
  const boardId = 'board-9007199254740992';
  const controlId = 'control-9007199254740992';
  const snapshot = project.validateProject({
    ...original,
    selectedBoardId: boardId,
    boards: [
      {
        ...original.boards[0],
        id: boardId,
        controlIds: [controlId],
      },
    ],
    controls: [
      {
        ...original.controls[0],
        id: controlId,
      },
    ],
  });
  await act(async () => view.api.restoreProject(snapshot));

  await act(() => view.api.addBoard());
  const nextBoardId = view.api.selectedBoardId;
  assert.notEqual(nextBoardId, boardId);
  assert.equal(new Set(view.api.boards.map(({ id }) => id)).size, 2);
  const added = await create(view, 'arrows', 'A');
  assert.notEqual(added.id, controlId);
  await act(() => view.api.selectBoard(boardId));
  assert.equal(view.api.controls.has(controlId), true);
});

test('failed stop keeps the current project active when restore is rejected', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'arrows', 'A');
  await act(() => view.api.speed(control.id, 40));
  const currentBoard = view.api.selectedBoardId;
  const snapshot = sampleProject();
  hub.devices.A.setSpeed = async () => {
    throw new Error('stop failed');
  };
  await act(async () =>
    assert.rejects(view.api.restoreProject(snapshot), /stop failed/)
  );
  assert.equal(view.api.selectedBoardId, currentBoard);
  assert.equal(view.api.controls.get(control.id)?.id, control.id);
});

test('failed sensor cleanup keeps the outgoing project active', async (t) => {
  const view = await mount(t);
  const hub = fakeHub();
  await act(() => view.api.addHub());
  const control = await create(view, 'distance', 'B');
  const boardId = view.api.selectedBoardId;
  const replacement = sampleProject('Replacement');
  hub.unsubscribe = async () => {
    throw new Error('unsubscribe failed');
  };
  await act(async () =>
    assert.rejects(view.api.restoreProject(replacement), /unsubscribe failed/)
  );
  assert.equal(view.api.selectedBoardId, boardId);
  assert.equal(view.api.controls.get(control.id)?.id, control.id);
});
