/* macOS AppleScript tab controller
Native AppleScript execution through Node's child_process
to control browser windows without extra dependencies.
*/
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function openBrowserTab(url) {
  // execFile avoids shell execution, preventing command injection
  await execFileAsync('open', [url]);
  return `Opened URL: ${url}`;
}

export async function closeActiveBrowserTab() {
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      if frontApp is "Google Chrome" or frontApp is "Safari" or frontApp is "Brave Browser" then
        keystroke "w" using {command down}
      end if
    end tell
  `;
  await execFileAsync('osascript', ['-e', script]);
  return 'Closed active browser tab.';
}