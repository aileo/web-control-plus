import {
  PROJECT_FILE_SUFFIX,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  parseProject,
  serializeProject,
  storageKeyForProject,
} from './project';
import type { ProjectSnapshot } from './project';

export const MAX_PROJECT_FILE_SIZE = 5 * 1024 * 1024;

// Validate a project filename and parse its serialized contents.
export function parseProjectFile(
  filename: string,
  serialized: string
): ProjectSnapshot {
  if (!filename.toLowerCase().endsWith(PROJECT_FILE_SUFFIX)) {
    throw new Error(`Choose a project file ending in ${PROJECT_FILE_SUFFIX}.`);
  }
  try {
    return parseProject(serialized);
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === 'Unsupported or invalid project format'
    ) {
      throw new Error(
        `Choose a ${PROJECT_FORMAT} file with ` +
          `project format version ${PROJECT_VERSION}.`
      );
    }
    throw cause;
  }
}

// Read and validate a project snapshot from a browser file.
export async function readProjectFile(file: File): Promise<ProjectSnapshot> {
  if (!file.name.toLowerCase().endsWith(PROJECT_FILE_SUFFIX)) {
    throw new Error(`Choose a project file ending in ${PROJECT_FILE_SUFFIX}.`);
  }
  if (file.size > MAX_PROJECT_FILE_SIZE) {
    throw new Error('Project files must be no larger than 5 MB.');
  }
  let serialized: string;
  try {
    serialized = await file.text();
  } catch {
    throw new Error(
      'The selected project file could not be read. ' +
        'Check the file and try again.'
    );
  }
  return parseProjectFile(file.name, serialized);
}

// Prepare a guarded save operation for an imported project snapshot.
export function prepareProjectImport(snapshot: ProjectSnapshot) {
  const identity = {
    id: storageKeyForProject(snapshot.name),
    name: snapshot.name,
  };
  const serialized = serializeProject(snapshot);
  // Read the current saved project while surfacing storage access failures.
  const readTarget = () => {
    try {
      return window.localStorage.getItem(identity.id);
    } catch {
      throw new Error(
        'Browser storage could not be read. Check access and try again.'
      );
    }
  };
  const observed = readTarget();
  return {
    snapshot,
    identity,
    replacesSave: observed !== null,
    commit: () => {
      if (readTarget() !== observed) {
        throw new Error(
          'The saved project changed. Select the file again to review it.'
        );
      }
      try {
        window.localStorage.setItem(identity.id, serialized);
      } catch {
        throw new Error(
          'The project could not be saved. Check browser storage space ' +
            'and try again.'
        );
      }
    },
  };
}
