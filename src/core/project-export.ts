import { serializeProject } from './project';
import type { ProjectSnapshot } from './project';

export const PROJECT_FILE_SUFFIX = '.wcp.json';

export function projectExportFilename(projectName: string | undefined): string {
  const sanitized = Array.from(projectName ?? '')
    .map((character) =>
      character.charCodeAt(0) < 0x20 || /[<>:"/\\|?*]/.test(character)
        ? '_'
        : character
    )
    .join('')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 80)
    .replace(/[. ]+$/g, '');
  const stem = sanitized.replace(/(?:\.wcp\.json)+$/i, '');
  const name =
    stem && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)
      ? stem
      : 'project';
  return `${name}${PROJECT_FILE_SUFFIX}`;
}

export function downloadProject(snapshot: ProjectSnapshot): void {
  const blob = new Blob([serializeProject(snapshot)], {
    type: 'application/json',
  });
  const url = window.URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement('a');
    link.href = url;
    link.download = projectExportFilename(snapshot.name);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    window.URL.revokeObjectURL(url);
  }
}
