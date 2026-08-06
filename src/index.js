/* Server entrypoint
This file acts as the router. When Gemini sends a tool request,
this dispatcher executes the safe local function and returns the output back
to the model.
*/
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { initWorkspace, writeWorkspaceFile, readWorkspaceFile, deleteWorkspaceFile } from './tools/fsSandbox.js';
import { openBrowserTab, closeActiveBrowserTab } from './tools/browser.js';
import { evToolsDeclaration } from './tools/schemas.js';
import { EVLiveClient } from './gemini/liveClient.js';

export { evToolsDeclaration };

// --- HUD Server & Telemetry Setup ---
const hudClients = new Set();

export function broadcastHUD(payload) {
  if (typeof wss !== 'undefined') {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { 
        client.send(JSON.stringify(payload));
      }
    });
  } else {
    console.log("🚨 wss is not defined! Data cannot be sent to the HUD.");
  }
}

function startHUDServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(process.cwd(), 'src', 'gemini', 'index.html'); 
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading dashboard');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    hudClients.add(ws);
    broadcastHUD({ type: 'log', message: 'HUD Visual Link Established.' });

    ws.on('close', () => {
      hudClients.delete(ws);
    });
  });

  console.log('---> ATTEMPTING TO START HUD SERVER <---');

  server.listen(8081, '127.0.0.1', () => {
    console.log('🚀 HUD Dashboard running at http://127.0.0.1:8081');
  });
}

// --- Tools Map ---
const toolMap = {
  writeWorkspaceFile: async (args) => await writeWorkspaceFile(args.filename, args.content),
  readWorkspaceFile: async (args) => await readWorkspaceFile(args.filename),
  deleteWorkspaceFile: async (args) => await deleteWorkspaceFile(args.filename),
  openBrowserTab: async (args) => await openBrowserTab(args.url),

  open_search_tab: async (args) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
    return await openBrowserTab(searchUrl);
  },

  closeActiveBrowserTab: async () => await closeActiveBrowserTab(),

  display_on_hud: async (args) => {
    broadcastHUD({ type: 'display', content: args.content });
    return "Successfully displayed the content on the HUD.";
  },
  
  switchModel: async (args) => `Model switching to ${args.targetModel} is logged.`
};

export async function executeToolCall(functionName, args) {
  const handler = toolMap[functionName];
  if (!handler) return `Error: Unknown tool ${functionName}`;

  try {
    broadcastHUD({ type: 'log', message: `Executing tool: ${functionName}` });
    const result = await handler(args);
    return result;
  } catch (error) {
    broadcastHUD({ type: 'log', message: `Tool Error [${functionName}]: ${error.message}` });
    return `Error: ${error.message}`;
  }
}

startHUDServer();

async function bootstrap() {
  await initWorkspace();
  console.log('🤖 E.V. Workspace sandbox active.');

  const client = new EVLiveClient(executeToolCall);
  client.connect();
}

bootstrap();