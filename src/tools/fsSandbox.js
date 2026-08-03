/* Sandboxed file manager (desktop only)
This enforces path validation. If the path requested 
by the AI strays outside ~/Desktop/EV_Workspace/,
it throws an execution error and blocks the operation.
*/
import fs from 'fs/promises';
import path from 'path';
import { WORKSPACE_DIR } from '../config.js';

// Strictly validate that path remains inside the sandbox boundary
function resolveSafePath(relativePath) {
  const safePath = path.resolve(WORKSPACE_DIR, relativePath);
  const relative = path.relative(WORKSPACE_DIR, safePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access Denied: Path is outside the authorized E.V. workspace.');
  }
  return safePath;
}

export async function initWorkspace() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

export async function writeWorkspaceFile(filename, content) {
  const targetPath = resolveSafePath(filename);
  await fs.writeFile(targetPath, content, 'utf8');
  return `File successfully written to workspace: ${path.basename(targetPath)}`;
}

export async function readWorkspaceFile(filename) {
  const targetPath = resolveSafePath(filename);
  return await fs.readFile(targetPath, 'utf8');
}

export async function deleteWorkspaceFile(filename) {
  const targetPath = resolveSafePath(filename);
  await fs.unlink(targetPath);
  return `File successfully removed from workspace: ${path.basename(targetPath)}`;
}