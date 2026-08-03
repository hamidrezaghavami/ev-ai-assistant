/* Server entrypoint
This file acts as the router. When Gemini sends a tool request,
this dispatcher executes the safe local function and returns the output back
to the model.
*/
import { initWorkspace, writeWorkspaceFile, readWorkspaceFile, deleteWorkspaceFile } from './tools/fsSandbox.js';
import { openBrowserTab, closeActiveBrowserTab } from './tools/browser.js';
import { evToolsDeclaration } from './tools/schemas.js';
import { EVLiveClient } from './gemini/liveClient.js';

export { evToolsDeclaration };

const toolMap = {
  writeWorkspaceFile: async (args) => await writeWorkspaceFile(args.filename, args.content),
  readWorkspaceFile: async (args) => await readWorkspaceFile(args.filename),
  deleteWorkspaceFile: async (args) => await deleteWorkspaceFile(args.filename),
  openBrowserTab: async (args) => await openBrowserTab(args.url),
  closeActiveBrowserTab: async () => await closeActiveBrowserTab()
};

export async function executeToolCall(functionName, args) {
  const handler = toolMap[functionName];
  if (!handler) return `Error: Unknown tool ${functionName}`;
  
  try {
    return await handler(args);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

async function bootstrap() {
  await initWorkspace();
  console.log('🤖 E.V. Workspace sandbox active.');

  const client = new EVLiveClient(executeToolCall);
  client.connect();
}

bootstrap();