/* Server entrypoint
This file acts as the router. When Gemini sends a tool request,
this dispatcher executes the safe local function and returns the output back
to the model.
*/
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { WebSocketServer } from 'ws';
import { initWorkspace, writeWorkspaceFile, readWorkspaceFile, deleteWorkspaceFile } from './tools/fsSandbox.js';
import { openBrowserTab, closeActiveBrowserTab } from './tools/browser.js';
import { evToolsDeclaration } from './tools/schemas.js';
import { EVLiveClient } from './gemini/liveClient.js';

export { evToolsDeclaration };

// --- HUD Server & Telemetry Setup ---
const hudClients = new Set();

export function broadcastHUD(payload) {
  if (hudClients.size > 0) {
    hudClients.forEach((client) => {
      if (client.readyState === 1) { 
        client.send(JSON.stringify(payload));
      }
    });
  } else {
    console.log("🚨 No HUD clients connected! Data cannot be sent to the HUD.");
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

  server.listen(8082, '0.0.0.0', () => {
    console.log('🚀 HUD Dashboard running at http://127.0.0.1:8082 (and accessible across local network)');
  });
}

// --- Tools Map ---
const toolMap = {
  writeWorkspaceFile: async (args) => await writeWorkspaceFile(args.filename, args.content),
  readWorkspaceFile: async (args) => await readWorkspaceFile(args.filename),
  deleteWorkspaceFile: async (args) => await deleteWorkspaceFile(args.filename),
  openBrowserTab: async (args) => {
    const result = await openBrowserTab(args.url);
    await new Promise(resolve => setTimeout(resolve, 2500));
    return result;
  },

  open_search_tab: async (args) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
    return await openBrowserTab(searchUrl);
  },

  closeActiveBrowserTab: async () => await closeActiveBrowserTab(),

  renderToHUD: async (args) => {
    console.log("🚨 INCOMING ARGS FROM E.V.:", args);
    
    // 🛡️ THE SMART LOCK: If the HUD isn't connected, FORCE IT OPEN automatically!
    if (hudClients.size === 0) {
      console.log("⚠️ HUD is closed! Auto-launching Safari to catch the data...");
      exec('open http://127.0.0.1:8082'); 
      
      console.log("⏳ Waiting for HUD to boot up and connect...");
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (hudClients.size > 0 || attempts > 25) { 
            clearInterval(checkInterval);
            resolve();
          }
        }, 200);
      });
    }

    // CRITICAL FIX: Changed args.content to args.htmlContent
    broadcastHUD({ type: 'display', content: args.htmlContent });
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