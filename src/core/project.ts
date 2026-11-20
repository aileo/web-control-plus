import { controlOptions, validateControlShortcuts } from './controls';
import { isBoardColor } from './board-colors';
import { canPlace, isSupportedSize } from './control-layout';
import type {
  Board,
  Control,
  ControlType,
  DeviceInfo,
  DeviceTypeInfo,
  HubInfo,
} from './types';

export const PROJECT_FORMAT = 'web-control-plus/project';
export const PROJECT_VERSION = 2;
export const PROJECT_FILE_SUFFIX = '.wcp.json';
const STORAGE_PREFIX = 'web-control-plus:project:';

export type ProjectHub = Pick<
  HubInfo,
  'uuid' | 'name' | 'mac' | 'type' | 'color'
>;

export type ProjectDevice = Pick<
  DeviceInfo,
  'uuid' | 'mac' | 'port' | 'hubType' | 'type'
>;

export type ProjectHardware = {
  hubs: ProjectHub[];
  devices: ProjectDevice[];
};

export type ProjectSnapshot = {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  name: string;
  boards: Board[];
  selectedBoardId: string;
  controls: Control[];
  hubs: ProjectHub[];
  devices: ProjectDevice[];
};

export type SavedProject = {
  id: string;
  name: string;
  snapshot?: ProjectSnapshot;
  error?: string;
};

export type LocalProjectIdentity = Pick<SavedProject, 'id' | 'name'>;

// Narrow an unknown value to a non-array object.
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// Validate and normalize serialized device type metadata.
function deviceTypeInfo(value: unknown): DeviceTypeInfo | null {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.num) ||
    typeof value.text !== 'string' ||
    typeof value.compact !== 'string'
  ) {
    return null;
  }
  return {
    num: value.num as number,
    text: value.text,
    compact: value.compact,
  };
}

const unknownType: DeviceTypeInfo = {
  num: 0,
  text: 'UNKNOWN',
  compact: 'UNKNOWN',
};

// Create the stable lookup key for a device attached to a hub.
function deviceKey(uuid: string, port: string): string {
  return JSON.stringify([uuid, port]);
}

// Validate and trim a project name.
export function normalizeProjectName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    throw new Error('Enter a project name between 1 and 80 characters');
  }
  return name.trim();
}

// Create the browser storage key for a normalized project name.
function projectKey(name: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(name.toLowerCase())}`;
}

// Return local storage or report when browser storage is unavailable.
function browserStorage(): Storage {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('Browser storage is not available');
    }
    return window.localStorage;
  } catch {
    throw new Error(
      'Browser storage is unavailable. Your project and existing saves ' +
        'were not changed.'
    );
  }
}

// Validate a serialized project and return its normalized snapshot.
export function validateProject(value: unknown): ProjectSnapshot {
  if (
    !isRecord(value) ||
    value.format !== PROJECT_FORMAT ||
    value.version !== PROJECT_VERSION
  ) {
    throw new Error('Unsupported or invalid project format');
  }
  const name = normalizeProjectName(value.name);
  if (!Array.isArray(value.boards) || !Array.isArray(value.controls)) {
    throw new Error('Project boards or controls are invalid');
  }
  if (!Array.isArray(value.hubs) || !Array.isArray(value.devices)) {
    throw new Error('Project hubs or devices are invalid');
  }
  if (typeof value.selectedBoardId !== 'string' || !value.selectedBoardId) {
    throw new Error('Project selected board is invalid');
  }

  const hubIds = new Set<string>();
  const hubs = value.hubs.map((entry) => {
    const type = isRecord(entry) ? deviceTypeInfo(entry.type) : null;
    if (
      !isRecord(entry) ||
      typeof entry.uuid !== 'string' ||
      !entry.uuid ||
      typeof entry.name !== 'string' ||
      typeof entry.mac !== 'string' ||
      !type ||
      typeof entry.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(entry.color) ||
      hubIds.has(entry.uuid)
    ) {
      throw new Error('Project contains an invalid or duplicate hub');
    }
    hubIds.add(entry.uuid);
    return {
      uuid: entry.uuid,
      name: entry.name,
      mac: entry.mac,
      type,
      color: entry.color,
    };
  });
  const deviceIds = new Set<string>();
  const devices = value.devices.map((entry) => {
    const type = isRecord(entry) ? deviceTypeInfo(entry.type) : null;
    if (
      !isRecord(entry) ||
      typeof entry.uuid !== 'string' ||
      !hubIds.has(entry.uuid) ||
      typeof entry.mac !== 'string' ||
      typeof entry.port !== 'string' ||
      !entry.port ||
      !type ||
      (entry.hubType !== undefined &&
        (!Number.isSafeInteger(entry.hubType) || (entry.hubType as number) < 0))
    ) {
      throw new Error('Project contains an invalid device');
    }
    const id = deviceKey(entry.uuid, entry.port);
    if (deviceIds.has(id)) {
      throw new Error('Project contains a duplicate device');
    }
    deviceIds.add(id);
    return {
      uuid: entry.uuid,
      mac: entry.mac,
      port: entry.port,
      ...(entry.hubType !== undefined
        ? { hubType: entry.hubType as number }
        : {}),
      type,
    };
  });

  const boardIds = new Set<string>();
  const boards = value.boards.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.name !== 'string' ||
      !Array.isArray(entry.controlIds) ||
      !entry.controlIds.every((id) => typeof id === 'string' && id.length > 0)
    ) {
      throw new Error('Project contains an invalid board');
    }
    const boardName = entry.name.trim();
    if (!boardName || boardName.length > 80 || boardIds.has(entry.id)) {
      throw new Error('Project contains an invalid or duplicate board');
    }
    boardIds.add(entry.id);
    if (new Set(entry.controlIds).size !== entry.controlIds.length) {
      throw new Error(`Board "${boardName}" contains duplicate controls`);
    }
    const { color } = entry;
    if (color !== undefined && !isBoardColor(color)) {
      throw new Error(`Board "${boardName}" has an invalid tab color`);
    }
    return {
      id: entry.id,
      name: boardName,
      controlIds: [...entry.controlIds],
      ...(color !== undefined ? { color } : {}),
    };
  });
  if (!boards.length || !boardIds.has(value.selectedBoardId)) {
    throw new Error('Project must contain a selected board');
  }

  const controlsById = new Map<string, Control>();
  value.controls.forEach((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.type !== 'string' ||
      typeof entry.uuid !== 'string' ||
      !entry.uuid ||
      typeof entry.port !== 'string' ||
      !entry.port ||
      typeof entry.title !== 'string'
    ) {
      throw new Error('Project contains an invalid control');
    }
    const type = entry.type as ControlType;
    const title = entry.title.trim();
    if (
      controlsById.has(entry.id) ||
      !title ||
      title.length > 80 ||
      !isSupportedSize(type, { w: entry.w as number, h: entry.h as number })
    ) {
      throw new Error(`Project contains an invalid control "${entry.id}"`);
    }
    const control = {
      id: entry.id,
      type,
      uuid: entry.uuid,
      port: entry.port,
      title,
      x: entry.x as number,
      y: entry.y as number,
      w: entry.w as number,
      h: entry.h as number,
      options: controlOptions(type, entry.options),
    } as Control;
    controlsById.set(control.id, control);
  });
  controlsById.forEach((control) => {
    if (
      !hubIds.has(control.uuid) ||
      !deviceIds.has(deviceKey(control.uuid, control.port))
    ) {
      throw new Error('Project control references an unknown hub or device');
    }
  });

  const assignedControls = new Set<string>();
  boards.forEach((board) => {
    const occupancy = new Map<string, Control>();
    const boardControls: Control[] = [];
    board.controlIds.forEach((id) => {
      const control = controlsById.get(id);
      if (!control || assignedControls.has(id)) {
        throw new Error(`Project contains an invalid control assignment`);
      }
      if (!canPlace(occupancy, control)) {
        throw new Error(`Board "${board.name}" contains an invalid layout`);
      }
      assignedControls.add(id);
      occupancy.set(id, control);
      boardControls.push(control);
    });
    validateControlShortcuts(boardControls);
  });
  if (assignedControls.size !== controlsById.size) {
    throw new Error('Project contains unassigned controls');
  }

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    boards,
    selectedBoardId: value.selectedBoardId,
    controls: [...controlsById.values()],
    hubs,
    devices,
  };
}

// Validate and serialize a project snapshot.
export function serializeProject(snapshot: ProjectSnapshot): string {
  return JSON.stringify(validateProject(snapshot));
}

// Parse and validate a serialized project snapshot.
export function parseProject(serialized: string): ProjectSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('This saved project is not valid JSON');
  }
  return validateProject(value);
}

// Build a stable key from the editable contents of a project.
export function projectContentKey(snapshot: ProjectSnapshot): string {
  const validated = validateProject(snapshot);
  return JSON.stringify({
    boards: validated.boards,
    selectedBoardId: validated.selectedBoardId,
    controls: validated.controls,
    hubs: validated.hubs,
    devices: validated.devices,
  });
}

// Decode a user-facing project name from its storage key.
function displayNameFromKey(key: string): string {
  try {
    return decodeURIComponent(key.slice(STORAGE_PREFIX.length));
  } catch {
    return key.slice(STORAGE_PREFIX.length);
  }
}

// Read saved projects and report unreadable entries without hiding them.
export function listSavedProjects(storage = browserStorage()): SavedProject[] {
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter(
      (key): key is string => key !== null && key.startsWith(STORAGE_PREFIX)
    );
  } catch {
    throw new Error(
      'Browser storage could not be read. Your existing saves were not changed.'
    );
  }
  return keys
    .map((id) => {
      const name = displayNameFromKey(id);
      try {
        const serialized = storage.getItem(id);
        if (serialized === null)
          throw new Error('This saved project is missing');
        const snapshot = parseProject(serialized);
        if (projectKey(snapshot.name) !== id) {
          throw new Error('Saved project name does not match its storage key');
        }
        return { id, name: snapshot.name, snapshot };
      } catch (cause) {
        return {
          id,
          name,
          error:
            cause instanceof Error
              ? cause.message
              : 'Saved project is unreadable',
        };
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

// Validate and store a project, optionally replacing an existing save.
export function saveProject(
  snapshot: ProjectSnapshot,
  {
    overwrite = false,
    storage = browserStorage(),
  }: {
    overwrite?: boolean;
    storage?: Storage;
  } = {}
): void {
  const validated = validateProject(snapshot);
  const key = projectKey(validated.name);
  try {
    if (!overwrite && storage.getItem(key) !== null) {
      throw new Error('A project with this name already exists');
    }
    storage.setItem(key, serializeProject(validated));
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === 'A project with this name already exists'
    ) {
      throw cause;
    }
    throw new Error(
      'The project could not be saved. Check browser storage space and ' +
        'try again; existing saves were not changed.'
    );
  }
}

// Load and validate a saved project by its storage key.
export function readSavedProject(
  id: string,
  storage = browserStorage()
): ProjectSnapshot {
  if (!id.startsWith(STORAGE_PREFIX)) {
    throw new Error('Invalid saved project');
  }
  try {
    const serialized = storage.getItem(id);
    if (serialized === null) throw new Error('This saved project is missing');
    const snapshot = parseProject(serialized);
    if (projectKey(snapshot.name) !== id) {
      throw new Error('Saved project name does not match its storage key');
    }
    return snapshot;
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message !== 'This saved project is missing'
    ) {
      throw new Error(
        `Could not open "${displayNameFromKey(id)}": ${cause.message}`
      );
    }
    throw new Error(
      `Could not open "${displayNameFromKey(id)}". ` +
        'The saved project may be missing or unreadable.'
    );
  }
}

// Return the storage key for a validated project name.
export function storageKeyForProject(name: string): string {
  return projectKey(normalizeProjectName(name));
}

// Build a complete project snapshot, adding placeholder hardware as needed.
export function createProjectSnapshot(
  name: string,
  boards: Board[],
  selectedBoardId: string,
  controls: Iterable<Control>,
  hardware: ProjectHardware = { hubs: [], devices: [] }
): ProjectSnapshot {
  const controlList = [...controls];
  const hubs = [...hardware.hubs];
  const devices = [...hardware.devices];
  const hubIds = new Set(hubs.map(({ uuid }) => uuid));
  const deviceIds = new Set(
    devices.map(({ uuid, port }) => deviceKey(uuid, port))
  );
  controlList.forEach((control) => {
    if (!hubIds.has(control.uuid)) {
      hubs.push({
        uuid: control.uuid,
        name: control.uuid,
        mac: '',
        type: unknownType,
        color: '#808080',
      });
      hubIds.add(control.uuid);
    }
    const deviceId = deviceKey(control.uuid, control.port);
    if (!deviceIds.has(deviceId)) {
      devices.push({
        uuid: control.uuid,
        mac: hubs.find((hub) => hub.uuid === control.uuid)?.mac || '',
        port: control.port,
        type: unknownType,
      });
      deviceIds.add(deviceId);
    }
  });
  return validateProject({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    boards,
    selectedBoardId,
    controls: controlList,
    hubs,
    devices,
  });
}
