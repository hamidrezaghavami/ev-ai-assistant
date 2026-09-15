import WebSocket, { WebSocketServer } from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import readline from 'readline';
import { evPrompt } from './prompt.js';
import Parser from 'rss-parser';

// gemini API URls and hosting, keys
const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

// Locks E.V. strictly to ~/Desktop/Ed_Workspace on your Mac
const WORKSPACE_DIR = path.resolve(os.homedir(), 'Desktop', 'EV_Workspace');

// --- Start the local UI Server Handshake ---
const wss = new WebSocketServer({ port: 8080 });
let globalEV = null;

// Routes incoming mobile app text and OSINT triggers to E.V.
wss.on('connection', (ws) => {
  console.log('✅ New Device Connected to Network (Port 8080)!');
  
  // Catch incoming text from the mobile app
  ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    
    // Normal conversation
    if (msg.type === 'prompt' && msg.text) {
      if (globalEV) globalEV.sendTextMessage(msg.text);
    }
    
    // 🎯 THE OSINT TRIGGER
    if (msg.type === 'osint_trigger' && msg.target) {
      console.log(`\n🎯 MOBILE OVERRIDE: OSINT Target Locked -> ${msg.target}`);
      
      const tacticalPrompt = `Initiate OSINT vetting pipeline for target: ${msg.target}. Open the dashboard and render the Company Legitimacy Rating and Tech-Match Analysis immediately to the HUD.`;
      
      if (globalEV) globalEV.sendTextMessage(tacticalPrompt);
    }
  } catch (err) { }
});
});

// Broadcast E.V.'s replies back to ALL screens (HUD + Mobile)
function sendToHUD(type, payload) {
    const message = JSON.stringify({ type, ...payload });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
    });
}

// Stores RSS feed URLs for keyword-based news sweeps.
const parser = new Parser();
const FEED_SOURCES = {
  crypto: [
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss'
  ],
  tech: [
    'https://techcrunch.com/feed/',
    'https://news.ycombinator.com/rss'
  ],
  stocks: [
    'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', // CNBC Markets
    'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' // WSJ Markets
  ],
};

export class EVLiveClient {
  constructor(onToolCall) {
    this.externalToolHandler = onToolCall;
    this.ws = null;
    this.currentModel = 'models/gemini-3.1-flash-live-preview'; 

    // Start the persistent SoX audio process
    this.audioPlayer = spawn('sox', ['-q', '-t', 'raw', '-r', '24000', '-e', 'signed', '-b', '16', '-c', '1', '-', '-d']);

    this.audioQueue = [];
    this.isPlayingAudio = false;
  }

// Connects to Gemini API and starts local input listeners.
  connect() {
    globalEV = this;
    if (!API_KEY) {
      console.error('❌ Error: GEMINI_API_KEY is not set.');
      process.exit(1);
    }

    this.ws = new WebSocket(URI);

    this.ws.on('open', () => {
      console.log(`⚡ Connected to Gemini Live API using engine: [${this.currentModel}]`);
      this.sendInitialSetup();

      // 💬 ADD TEXT CHAT TO TERMINAL
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });      
      
      rl.on('line', (input) => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: input }] }],
              turnComplete: true
            }
          }));
          console.log(`📤 Sent to E.V.: "${input}"`);
        } else {
          console.log(`⚠️ E.V. is currently disconnected from the cloud network.`);
        }
      });

      // 📱 CATCH TEXT FROM YOUR EXPO MOBILE APP
      wss.on('connection', (mobileWs) => {
        mobileWs.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'prompt' && msg.text) {
              this.sendTextMessage(msg.text);
              console.log(`📱 Received from Mobile: "${msg.text}"`);
            }
          } catch (err) {
            console.error("Mobile parse error:", err);
          }
        });
      });
    });

    this.ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      
      // 🕵️ KEEP THIS: Great for debugging
      // console.log("\n📥 RAW SERVER RESPONSE:", JSON.stringify(message, null, 2));
      
      if (message.error) {
        console.log("\n❌ API ERROR:", JSON.stringify(message.error, null, 2));
      } else if (message.setupComplete) {
        console.log("\n✅ Server is fully ready to receive commands!");
      }

      // 👉 THE INTERCEPTOR: Catch tool requests from E.V.
      if (message.serverContent && message.serverContent.modelTurn) {
        const parts = message.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.functionCall) {
            const toolName = part.functionCall.name;
            const args = part.functionCall.args;
            
            console.log(`\n⚡ E.V. IS FIRING TOOL: ${toolName}`);
            
            // 1. Run the tool from your toolMap
            if (toolMap[toolName]) {
              try {
                const result = await toolMap[toolName](args);
                console.log(`✅ ${toolName} success!`);
                
                // 2. YOU MUST TELL E.V. THE TOOL FINISHED!
                // If you don't send this back, she will freeze and wait forever.
                const toolResponse = {
                  clientContent: {
                    turnComplete: true,
                    turns: [{
                      parts: [{
                        functionResponse: {
                          name: toolName,
                          response: { result: "Success" }
                        }
                      }]
                    }]
                  }
                };
                this.ws.send(JSON.stringify(toolResponse));

              } catch (err) {
                console.error(`❌ Error in ${toolName}:`, err);
              }
            } else {
              console.log(`⚠️ E.V. tried to use a tool that isn't in toolMap: ${toolName}`);
            }
          }
        }
      }

      // Pass the rest of the message (like audio/text) to your normal handler
      this.handleServerMessage(message);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`🔌 Connection closed. Code: ${code}, Reason: ${reason.toString() || 'None'}`);
    });
    
    this.ws.on('error', (err) => console.error('❌ WebSocket Error:', err));
  }

// Sends system prompt, voice, and tool configs to Gemini.
  sendInitialSetup() {
    let rawFunctions = [];
    
    if (Array.isArray(evToolsDeclaration)) {
      if (evToolsDeclaration[0] && evToolsDeclaration[0].functionDeclarations) {
        rawFunctions = evToolsDeclaration[0].functionDeclarations;
      } else {
        rawFunctions = evToolsDeclaration;
      }
    } else if (evToolsDeclaration && evToolsDeclaration.functionDeclarations) {
      rawFunctions = evToolsDeclaration.functionDeclarations;
    } else if (evToolsDeclaration && evToolsDeclaration.tools) {
       rawFunctions = evToolsDeclaration.tools;
    } else {
       rawFunctions = [evToolsDeclaration];
    }

    // 🏗️ THE EXACT GEMINI PAYLOAD
    const setupMessage = {
  setup: {
    model: this.currentModel,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    },
    outputAudioTranscription: {},
    systemInstruction: {
      parts: [
        { text: evPrompt }
      ]
    },
    // 🚨 STRICT STRUCTURE: One "tools" array containing exactly one object with "functionDeclarations"
    tools: [{
      functionDeclarations: [
        ...rawFunctions,
        {
          name: "renderToHUD",
          description: "Renders pure HTML, CSS, or SVG directly to the user's visual dashboard. Use this automatically whenever the user asks to see an interface, model, or visual data.",
          parameters: {
            type: "OBJECT",
            properties: {
              htmlContent: {
                type: "STRING",
                description: "The raw, unformatted HTML/CSS/SVG code to inject into the dashboard."
              }
            },
            required: ["htmlContent"]
          }
        }
      ]
    }]
  }
};

    this.ws.send(JSON.stringify(setupMessage));
    console.log(`✅ Configuration sent with ${rawFunctions.length} tools attached`);
  }

  // 🛠️ Handle incoming tool requests from E.V.
  async onToolCall(name, args) {
    if (name === 'initiate_shutdown') {
      console.log('\n🔴 Shutdown sequence initiated by E.V...');
      this.pendingShutdown = true;
      return { status: "success", message: "System ready to power off." };
    }

    // 🖥️ EXPLICIT RENDER CATCH
    if (name === 'renderToHUD') {
      console.log(`\n🖥️ SENDING DATA TO HUD... Length: ${args.htmlContent?.length}`);
      sendToHUD('display', { content: args.htmlContent });
      return { status: "success", message: "Successfully rendered to the user's screen." };
    }

    // 📝 WRITE / UPDATE FILE
    if (name === 'writeWorkspaceFile') {
      try {
        // SAFETY: Resolve the absolute path and ensure it stays inside WORKSPACE_DIR
        const safePath = path.resolve(WORKSPACE_DIR, args.filename);
        if (!safePath.startsWith(WORKSPACE_DIR)) {
          return { status: "error", message: "Access denied. You can only modify files in the workspace directory." };
        }
        
        // Create the workspace folder if it doesn't exist yet, then write the file
        await fs.mkdir(WORKSPACE_DIR, { recursive: true });
        await fs.writeFile(safePath, args.content, 'utf-8');
        
        console.log(`\n📝 E.V. saved file: ${args.filename}`);
        return { status: "success", message: `Successfully wrote to ${args.filename}` };
      } catch (err) {
        return { status: "error", message: `Failed to write file: ${err.message}` };
      }
    }

    // 🗑️ DELETE FILE
    if (name === 'deleteWorkspaceFile') {
      try {
        // SAFETY: Same path validation
        const safePath = path.resolve(WORKSPACE_DIR, args.filename);
        if (!safePath.startsWith(WORKSPACE_DIR)) {
          return { status: "error", message: "Access denied." };
        }
        
        await fs.unlink(safePath);
        console.log(`\n🗑️ E.V. deleted file: ${args.filename}`);
        return { status: "success", message: `Successfully deleted ${args.filename}` };
      } catch (err) {
        return { status: "error", message: `Failed to delete file: ${err.message}` };
      }
    }

    // 📄 CREATE FILE (Locked to .md, .json, .txt AND restricted to EV_Workspace)
    if (name === 'create_file') {
      try {
        const ext = args.filename.split('.').pop().toLowerCase();
        if (!['md', 'json', 'txt', 'text'].includes(ext)) {
          return { status: "error", message: "Denied. I can only create .md, .json, or .txt files." };
        }

        // SAFETY: Resolve the absolute path and ensure it stays inside WORKSPACE_DIR
        const safePath = path.resolve(WORKSPACE_DIR, args.filename);
        if (!safePath.startsWith(WORKSPACE_DIR)) {
          return { status: "error", message: "Access denied. You can only create files inside the EV_Workspace directory." };
        }

        // Create the workspace folder if it doesn't exist yet, then write the file
        await fs.mkdir(WORKSPACE_DIR, { recursive: true });
        await fs.writeFile(safePath, args.content, 'utf-8');
        
        console.log(`\n📄 E.V. created file: ${safePath}`);
        return { status: "success", message: `File ${args.filename} created successfully.` };
      } catch (err) {
        return { status: "error", message: `Failed to create file: ${err.message}` };
      }
    }

    // 📖 READ FILE (This allows her to "edit" by reading first, then overwriting)
    if (name === 'readWorkspaceFile') {
      try {
        const safePath = path.resolve(WORKSPACE_DIR, args.filename);
        if (!safePath.startsWith(WORKSPACE_DIR)) {
          return { status: "error", message: "Access denied." };
        }
        
        const content = await fs.readFile(safePath, 'utf-8');
        console.log(`\n📖 E.V. read file: ${args.filename}`);
        return { status: "success", content: content };
      } catch (err) {
        return { status: "error", message: `Failed to read file: ${err.message}` };
      }
    }

    // 📁 CREATE FOLDER
    if (name === 'createWorkspaceFolder') {
      try {
        const safePath = path.resolve(WORKSPACE_DIR, args.folderName);
        if (!safePath.startsWith(WORKSPACE_DIR)) {
          return { status: "error", message: "Access denied." };
        }
        
        await fs.mkdir(safePath, { recursive: true });
        console.log(`\n📁 E.V. created folder: ${args.folderName}`);
        return { status: "success", message: `Folder ${args.folderName} created successfully.` };
      } catch (err) {
        return { status: "error", message: `Failed to create folder: ${err.message}` };
      }
    }

    // 🚫 CLOSE ACTIVE BROWSER TAB
    if (name === 'closeActiveBrowserTab') {
      try {
        const script = `
          tell application "System Events"
            if exists (processes where name is "Google Chrome") then
              tell application "Google Chrome" to close active tab of front window
            else if exists (processes where name is "Safari") then
              tell application "Safari" to close current tab of front window
            end if
          end tell
        `;
        execSync(`osascript -e '${script}'`);
        console.log(`\n🚫 E.V. closed the active browser tab.`);
        return { status: "success", message: "Tab closed successfully." };
      } catch (err) {
        return { status: "error", message: `Failed to close tab: ${err.message}` };
      }
    }

    // 👁️ READ ACTIVE BROWSER TAB (Brave & Safari Support)
    if (name === 'readActiveBrowserTab') {
      try {
        const script = `
          tell application "System Events"
            set braveRunning to exists (processes where name is "Brave Browser")
            set safariRunning to exists (processes where name is "Safari")
          end tell
          
          if braveRunning then
            tell application "Brave Browser"
              tell active tab of front window
                set pageText to execute javascript "document.body.innerText"
              end tell
              return pageText
            end tell
          else if safariRunning then
            tell application "Safari"
              set pageText to do JavaScript "document.body.innerText" in front document
              return pageText
            end tell
          else
            return "Error: No supported browser running."
          end if
        `;
        
        // Make sure you require 'child_process' if execSync isn't imported at the top of your file!
        const { execSync } = await import('child_process');
        
        const pageText = execSync('osascript', { input: script, encoding: 'utf-8' });
        console.log(`\n👁️ E.V. is reading the active browser tab...`);
        
        return { status: "success", content: pageText.substring(0, 15000) };
      } catch (err) {
        return { status: "error", message: `Failed to read tab. Error: ${err.message}` };
      }
    }
    if (this.externalToolHandler) {
      return await this.externalToolHandler(name, args);
    }
    
    return { status: "error", message: `Tool ${name} not found.` };
  }

  // 📤 Send the tool result back to the API so E.V. knows it worked
  sendToolResponse(id, name, response) {
    if (this.ws && this.ws.readyState === 1) {
      const message = {
        toolResponse: {
          functionResponses: [{
            id: id,
            name: name,
            response: { output: response }
          }]
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

// Handles incoming API responses, tool calls, and outputs.
  async handleServerMessage(message) {
    // 🛑 The only tools E.V. needs permission for
    const dangerousTools = ['edit_file', 'delete_file'];

    // 🧠 Quick helper function to ask you for permission in the terminal
    const askPermission = async (toolName) => {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      return new Promise(resolve => {
        rl.question(`\n⚠️ E.V. wants to run [${toolName}]. Type 'yes' to allow, or 'no' to block: `, (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === 'yes');
        });
      });
    };

    // 🛠️ CATCH AND EXECUTE TOOL CALLS (LIVE API FORMAT)
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        console.log(`\n⚙️ Executing E.V.'s command: ${call.name}`);
        
        let result;
        
        // 🔒 Check if the tool is dangerous
        if (dangerousTools.includes(call.name)) {
          const isAllowed = await askPermission(call.name);
          if (!isAllowed) {
            console.log(`\n🚫 Blocked E.V. from running: ${call.name}`);
            result = "Error: User denied permission to execute this tool.";
          } else {
            result = await this.onToolCall(call.name, call.args);
          }
        } else {
          // 🟢 Safe tool! Auto-execute instantly
          result = await this.onToolCall(call.name, call.args);
        }
        
        // 2. Send the result back to E.V. so she knows it finished!
        this.ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: call.id,
              name: call.name,
              response: { result: result || "Success" }
            }]
          }
        }));
      }
    }

    // Live API streaming audio transcript format
    if (message.serverContent?.outputAudioTranscription?.text) {
      if (!this.textBuffer) this.textBuffer = '';
      this.textBuffer += message.serverContent.outputAudioTranscription.text;
    }

    // 🛠️ CATCH AND EXECUTE TOOL CALLS (STANDARD API FORMAT) & AUDIO/TEXT
    if (message.serverContent?.modelTurn?.parts) {
      
      // 🚨 FIX: Auto-lock the mic the second E.V. takes action!
      if (!this.isMuted) {
        this.isMuted = true;
        console.log("\n🔴 [MIC AUTO-CLOSED] E.V. is processing...");
        if (typeof sendToHUD !== 'undefined') sendToHUD('log', { message: '🔒 MIC AUTO-CLOSED by system.' });
      }

      for (const part of message.serverContent.modelTurn.parts) {
        if (part.functionCall) {
          const { name, args, id } = part.functionCall;
          console.log(`\n🛠️ E.V. action requested: ${name}`, args);
          
          let result;
          
          // 🔒 Check if the tool is dangerous
          if (dangerousTools.includes(name)) {
            const isAllowed = await askPermission(name);
            if (!isAllowed) {
              console.log(`\n🚫 Blocked E.V. from running: ${name}`);
              result = "Error: User denied permission to execute this tool.";
            } else {
              result = await this.onToolCall(name, args);
            }
          } else {
            // 🟢 Safe tool! Auto-execute instantly
            result = await this.onToolCall(name, args);
          }
          
          this.sendToolResponse(id, name, result);
        }
        
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          if (this.originDevice !== 'mobile') {
            const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
            this.playAudioSafe(audioBuffer);
          }
        }
        if (part.text) {
          if (!this.textBuffer) this.textBuffer = '';
          this.textBuffer += part.text;
          console.log(`💬 E.V. chunk: ${part.text}`);
        }
      }
    }
    
    if (message.serverContent?.turnComplete) {
      console.log('\n✅ E.V. finished responding.\n');
      this.originDevice = 'mac';

      // 2️⃣ Blast the FULL completed sentence to the phone so it speaks smoothly!
      if (this.textBuffer && typeof sendToHUD !== 'undefined') {
        console.log(`💬 E.V. Sent to Phone: ${this.textBuffer}`);
        sendToHUD('transcript', { text: this.textBuffer });
        this.textBuffer = '';
      }
      
      if (this.pendingShutdown) {
        console.log('⚡ E.V. is offline.');
        process.exit(0); 
      }
    }
  }

  // 📥 1. Catch chunks and put them in line
  playAudioSafe(audioBuffer) {
    this.audioQueue.push(audioBuffer);
    this.processAudioQueue();
  }

  // 🎧 2. Feed them to your existing SoX stream smoothly
  processAudioQueue() {
    // If we are currently writing a chunk, or the line is empty, wait.
    if (this.isPlayingAudio || this.audioQueue.length === 0) {
      return;
    }

    this.isPlayingAudio = true;
    const nextBuffer = this.audioQueue.shift();

    // Write it directly to the SoX stream you opened in the constructor!
    this.audioPlayer.stdin.write(nextBuffer, (error) => {
      if (error) {
        console.error("Audio stream error:", error);
      }
      
      this.isPlayingAudio = false;
      this.processAudioQueue();
    });
  }

// Sends text prompts directly to E.V.
  sendTextMessage(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: text }]
            }
          ],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(message));
      console.log(`📤 Sent text prompt: "${text}"`);
    }
  }

// Function called when E.V. executes the feed tool
async fetchBriefingFeed(category) {
  const urls = FEED_SOURCES[category] || FEED_SOURCES.tech;
  let briefingItems = [];

  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      const topItems = feed.items.slice(0, 3).map(item => ({
        title: item.title,
        source: feed.title,
        link: item.link,
        date: item.pubDate
      }));
      briefingItems.push(...topItems);
    } catch (err) {
      console.error(`Feed pull failed for ${url}:`, err.message);
    }
  }
  return briefingItems;
}
}