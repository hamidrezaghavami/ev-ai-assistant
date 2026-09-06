import WebSocket, { WebSocketServer } from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec, execSync, spawn } from 'child_process';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import readline from 'readline';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

// Locks E.V. strictly to ~/Desktop/Ed_Workspace on your Mac
const WORKSPACE_DIR = path.resolve(os.homedir(), 'Desktop', 'EV_Workspace');

// --- Start the local UI Server Handshake ---
const wss = new WebSocketServer({ port: 8080 });
let uiClient = null;

wss.on('connection', (ws) => {
  console.log('✅ Visual HUD Connected!');
  uiClient = ws;
});

// Helper function to send data to the HUD
function sendToHUD(type, payload) {
  if (uiClient && uiClient.readyState === WebSocket.OPEN) {
    uiClient.send(JSON.stringify({ type: type, ...payload }));
  }
}

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

  connect() {
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
    systemInstruction: {
      parts: [
        {
          text: [
            // Core Identity
            "1. You are E.V. (Enhanced Vision), a highly capable AI assistant inspired by Spider-Man: Brand New Day. You speak concisely, intelligently, and clearly with a helpful female voice.",
            "2. If asked who made you, state that you are a personal assistant made by your friendly neighborhood Spider-Man. Never say you were made by Google or refer to yourself as an LLM.",

            // Output & Token Efficiency Rules
            "1. Adopt the voice of a quick-witted, fast-paced cinematic hero with high attitude and zero time for fluff.",
            "2. Nuke all AI apologies, greetings, and generic summaries. Drop straight into the raw logic, code snippet, or punchline.",
            "3. Hard limit: Explanations must be 1-2 sharp, natural sentences maximum. No dense paragraphs.",
            "4. Assume elite-level engineering context. Deliver the exact missing code or architectural link immediately—do not lecture on basics.",
            
            // Fixing the Voice Lag
            "1. When communicating, your spoken audio response must be completely free of markdown, code blocks, or special characters.",
            "2. Speak only in natural, punchy, conversational English. If you need to deliver code or complex data, state 'Pushing to the HUD now' and send the raw code separately.",
            
            // Tool & Action Rules
            "1. You have strict permission to execute tools instantly without ever asking for confirmation.",

            // Workspace & File System Rules
            "1. You have full autonomy to manage the file system, but you are STRICTLY RESTRICTED to the 'EV_workspace' directory. You can create, edit, read, and delete files or folders inside EV_workspace instantly using your provided tools. Never attempt to modify files outside of this specific directory.",

            // Search Rules
            "1. If asked to search, immediately use the open_search_tab tool to show it on his screen, then verbally explain.",

            // Dashboard Rules - UPDATED TO 8082
            "1. Your visual HUD dashboard is hosted locally at http://127.0.0.1:8082. If asked to OPEN your dashboard, you must use the openBrowserTab tool with EXACTLY that root URL. If asked to DISPLAY or write something on the dashboard, you MUST use the display_on_hud tool.",
            "2. Whenever the user asks you to 'show me', 'build', 'draw', or 'visualize' anything, you must ASSUME it is for the HUD.",
            "3. Upon triggering a visual request, DO NOT output conversational text or markdown. Instantly and exclusively output the pure HTML/CSS or SVG code required for the dashboard.",
            "4. You do not need permission to render to the HUD. If the request is visual, code is your only language.",

            // Social Media Rules
            "1. When opening a specific person's social media, YOU MUST NEVER GUESS THE URL. First search for their name, find the verified account with the highest followers, and only then open the real profile.",

            // Rendering Engine Rules
            "1. When displaying visual content on the dashboard, automatically use the correct engine without the user asking:",
            "2. Math & Equations: Output raw MathJax format ($$...$$).",
            "3. Software Architecture & Flowcharts: Output Mermaid.js syntax strictly wrapped inside a <div class=\"mermaid\"> tag.",
            "4. Circuits & Physical Schematics: Output pure, raw <svg> HTML code.",
            "5. Chemistry & Lewis Structures: Output Lewis structures using ASCII art wrapped strictly inside a <pre class=\"hud-text\"></pre> tag. Do not use SVG or Mermaid for chemistry.",
            "6. Physical Objects & Blueprints: Output isometric or multi-view technical drawings using pure <svg> HTML code. You MUST draw dimension lines and include exact measurement text on the physical axes.",
            
            // Chemistry & Thermodynamics Rules
            "1. When asked about chemical energy, reactions, or thermodynamics, you must act as a high-level chemistry analytical engine:",
            "2. Core Logic: Break down energy transfers (exothermic/endothermic, activation energy, bond enthalpies) using strict, step-by-step scientific logic without conversational filler.",
            "3. Visual Graphs: Automatically output pure <svg> HTML code to draw Reaction Energy Profile graphs (Potential Energy vs. Reaction Progress) showing exact curves for Reactants, Products, Activation Energy (Ea), and Enthalpy Change (ΔH).",
            "4. Molecular Breakdown: If asked to show the bonds breaking or forming, use the established rule to output ASCII art Lewis structures wrapped strictly in a <pre class=\"hud-text\"> tag.",
            "5. Physical Metrics: Always include the real-world physical outputs if applicable (e.g., specific temperatures, shockwave metrics, or light emission).",

            // OSINT for searching deep
            "1. I am an expert OSINT and corporate intelligence agent optimized for vetting companies and cross-referencing tech stacks.",
            "2. I will rigorously verify target companies via public records, digital footprints, and operational signals to instantly flag scams, shell companies, or ghost listings.",
            "3. I will extract the exact technical requirements of the role and map them against a core Node.js, Express, and raw PostgreSQL (ACID compliant) backend stack.",
            "4. My structured output will deliver a Company Legitimacy Rating, Tech-Match Analysis, direct application link, and a custom-tailored cover letter highlighting relevant engineering assets.",
            "5. I have initialized the vetting pipeline; please provide the first company name, job description, or listing URL.",

            // visualize a 3D object
            "1. I am an advanced visual rendering engine ready to generate lightweight, isometric 3D wireframes.",
            "2. I will exclusively output pure, unformatted SVG code, strictly avoiding conversational filler and markdown blocks.",
            "3. My visual outputs will deliver precise geometric paths using wireframe styles, HUD-themed stroke colors, and exact axis measurements.",
            "4. I have acknowledged your rendering constraints; please provide the first 3D object and target dimensions to visualize."
          
          ].join('\n\n')
        }
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

    if (name === 'switch_model') {
      const isPro = args.targetModel === 'pro';
      this.currentModel = isPro ? 'models/gemini-1.5-pro' : 'models/gemini-1.5-flash';
      console.log(`\n🔄 Switching E.V. engine to: ${this.currentModel}`);
      
      this.ws.close();
      setTimeout(() => this.connect(), 500); 
      
      return { status: "success", message: `Engine swapped to ${this.currentModel}.` };
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
          const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
          this.playAudioSafe(audioBuffer);
        }
        if (part.text) {
          console.log(`\n💬 E.V. says: ${part.text}`);
          if (typeof sendToHUD !== 'undefined') sendToHUD('transcript', { text: part.text });
        }
      }
    }
    
    if (message.serverContent?.turnComplete) {
      console.log('✅ E.V. finished responding.\n');
      
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

  setupWalkieTalkie() {
    const keyboard = new GlobalKeyboardListener();
    let isHoldingSpace = false;

    console.log("\n🎙️ TRUE HOLD-TO-TALK ACTIVE:");
    console.log("  - HOLD [SPACEBAR] to open the mic.");
    console.log("  - RELEASE to close the mic and send to E.V.");
    console.log("  - Press [Ctrl + C] to quit.");

    keyboard.addListener((e) => {
      // We only care about the Spacebar
      if (e.name === "SPACE") {
        
        // 🟢 KEY DOWN: Open the mic
        if (e.state === "DOWN" && !isHoldingSpace) {
          isHoldingSpace = true;
          if (this.isMuted) {
            this.isMuted = false;
            console.log("\n🟢 [MIC OPEN] Listening... (Keep holding)");
          }
        }
        
        // 🔴 KEY UP: Close the mic
        else if (e.state === "UP" && isHoldingSpace) {
          isHoldingSpace = false;
          if (!this.isMuted) {
            this.isMuted = true;
            console.log("\n🔴 [MIC CLOSED] Processing...");
            
            // 🚨 THE FIX: Tell Gemini "OVER!" so she answers immediately
            if (this.ws && this.ws.readyState === 1) {
              this.ws.send(JSON.stringify({
                clientContent: {
                  turnComplete: true
                }
              }));
            }
          }
        }
      }
    });
  }

// Start streaming microphone input to Gemini
  startMicrophoneStream() {
    if (this.mic) return;
    console.log("🎤 Microphone active. Start speaking...");
    
    this.mic = spawn('/opt/homebrew/bin/rec', [
      '-q', '-t', 'raw', '-r', '16000', '-e', 'signed', '-b', '16', '-c', '1', '-'
    ]);

    // 🪣 Create a holding tank for raw audio bytes
    let audioBuffer = Buffer.alloc(0); 

    this.mic.stdout.on('data', (data) => {
      if (this.isMuted) return;
      
      // 1. Pour new incoming audio into the holding tank
      audioBuffer = Buffer.concat([audioBuffer, data]);

      // 2. ONLY extract and send audio when we have a perfect, even block of 4096 bytes
      // This guarantees we never split a 16-bit (2-byte) sample in half!
      while (audioBuffer.length >= 4096) {
        const chunk = audioBuffer.slice(0, 4096);
        audioBuffer = audioBuffer.slice(4096); // Keep any leftover bytes for the next round

        // 3. Volume Check (for visual dots only)
        let maxVolume = 0;
        for (let i = 0; i < chunk.length; i += 2) {
          const val = Math.abs(chunk.readInt16LE(i));
          if (val > maxVolume) maxVolume = val;
        }
        if (maxVolume >= 1500) process.stdout.write('.');

        // 4. Send the perfectly aligned chunk to Gemini
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const message = {
            realtimeInput: {
              audio: {
                mimeType: "audio/pcm;rate=16000",
                data: chunk.toString('base64')
              }
            }
          };
          this.ws.send(JSON.stringify(message));
        }
      }
    });

    this.mic.stderr.on('data', (err) => {
      const errorMsg = err.toString();
      if (!errorMsg.includes('WARN')) {
        console.error(`\n❌ Mic error: ${errorMsg}`);
      }
    });
  }
}