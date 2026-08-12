/* macOS AppleScript tab controller
Native AppleScript execution through Node's child_process
to control browser windows without extra dependencies.
*/
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';

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
    end tell
    if frontApp is "Google Chrome" or frontApp is "Brave Browser" then
      tell application frontApp to close active tab of front window
    else if frontApp is "Safari" then
      tell application "Safari" to close current tab of front window
    end if
  `;
  await execFileAsync('osascript', ['-e', script]);
  return 'Closed active browser tab.';
}

// NEW: Grabs the URL from the frontmost active browser window
export async function getActiveTabUrl() {
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
    end tell
    if frontApp is "Google Chrome" or frontApp is "Brave Browser" then
      tell application frontApp to return URL of active tab of front window
    else if frontApp is "Safari" then
      tell application "Safari" to return URL of document 1
    end if
  `;
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim();
  } catch (error) {
    return 'Error: Could not read the active tab URL. Make sure a browser is open.';
  }
}

// NEW: Downloads the URL, strips the HTML/CSS, and returns pure text for EV to read
export async function readPageContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Load the HTML into Cheerio to parse it
    const $ = cheerio.load(html);
    
    // Rip out scripts, styles, navbars, and footers so EV doesn't read garbage code
    $('script, style, noscript, iframe, nav, footer, header').remove();
    
    // Extract pure text and clean up massive white spaces
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Return the first 8000 chars so we don't overload her context window
    return cleanText.substring(0, 8000);
  } catch (error) {
    return `Failed to read page content: ${error.message}`;
  }
}