/* Sandboxed file manager (desktop only)
This enforces path validation. If the path requested 
by the AI strays outside ~/Desktop/EV_Workspace/,
it throws an execution error and blocks the operation.
*/
import fs from 'fs/promises';
import path from 'path';
import { WORKSPACE_DIR } from '../config.js';

// Validate path is strictly inside the sandbox
function resolveSafePath(relativePath) {
  const safePath = path.normalize(path.join(WORKSPACE_DIR, relativePath));
  if (!safePath.startsWith(WORKSPACE_DIR)) {
    throw new Error('Access Denied: Path is outside the authorized E.V. workspace.');
  }
  return safePath;
}

// Ensure workspace directory exists on startup
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