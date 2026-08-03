/* macOS AppleScript tab controller
Native AppleScript execution through Node's child_process
to control browser windows without extra dependencies.
*/
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function openBrowserTab(url) {
  // Uses macOS native 'open' to launch URL in default browser
  const command = `open "${url}"`;
  await execAsync(command);
  return `Opened URL: ${url}`;
}

export async function closeActiveBrowserTab() {
  // AppleScript targeting the frontmost browser tab (Safari/Chrome default)
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      if frontApp is "Google Chrome" or frontApp is "Safari" or frontApp is "Brave Browser" then
        keystroke "w" using {command down}
      end if
    end tell
  `;
  await execAsync(`osascript -e '${script}'`);
  return 'Closed active browser tab.';
}