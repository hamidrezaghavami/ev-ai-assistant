/* Path configurations & constants, This defines 
the hard isolated boundary for file operations.
*/
import path from 'path';
import os from 'os';

// Absolute lock to ~/Desktop/EV_Workspace/
export const WORKSPACE_DIR = path.join(os.homedir(), 'Desktop', 'EV_Workspace');