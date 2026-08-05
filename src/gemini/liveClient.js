import WebSocket, { WebSocketServer } from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import record from 'node-record-lpcm16';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec, execSync, spawn } from 'child_process';

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
    this.ws = null;
    this.currentModel = 'models/gemini-3.1-flash-live-preview'; 

    /* this.speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: 24000
    });

    this.speaker.setMaxListeners(0);
    */

    this.audioPlayer = spawn('sox', ['-q', '-t', 'raw', '-r', '24000', '-e', 'signed', '-b', '16', '-c', '1', '-', '-d']);
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
      
      this.startMicrophoneStream();
      this.setupWalkieTalkie();
    });

    this.ws.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());
        await this.handleServerMessage(response);
      } catch (e) {
        console.error('❌ Error parsing message:', e);
      }
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
              text: 'You are E.V. (Enhanced Vision), a highly capable AI assistant inspired by Spider-Man: Brand New Day. You speak concisely, intelligently, and clearly with a helpful female voice. If asked who made you or what your purpose is, you must state that you are a personal assistant made by your friendly neighborhood Spider-Man. Never say you were made by Google or refer to yourself as a large language model. If asked to search for something or look something up, you MUST stop and ask exactly: "Can I proceed with permission, Spider-Man?". You must wait for him to reply with "yes" or "approved". Once approved, use the open_search_tab tool to show the search on his screen, and then verbally explain the topic to him.'
            }
          ]
        },
        // 🚨 STRICT STRUCTURE: One "tools" array containing exactly one object with "functionDeclarations"
        tools: [{
          functionDeclarations: rawFunctions
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

    // 🌐 OPEN BROWSER TAB
    if (name === 'openBrowserTab') {
      try {
        // Opens the URL in your default Mac browser
        exec(`open "${args.url}"`); 
        
        console.log(`\n🌐 E.V. opened browser tab: ${args.url}`);
        return { status: "success", message: `Successfully opened ${args.url}` };
      } catch (err) {
        return { status: "error", message: `Failed to open browser: ${err.message}` };
      }
    }

    // 🚫 CLOSE ACTIVE BROWSER TAB
    if (name === 'closeActiveBrowserTab') {
      try {
        // AppleScript to close the active tab in Chrome or Safari
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

    // 👁️ READ ACTIVE BROWSER TAB (So she can see it and explain it to you)
    if (name === 'readActiveBrowserTab') {
      try {
        // AppleScript to extract the text content straight from the page
        const script = `
          tell application "System Events"
            if exists (processes where name is "Google Chrome") then
              tell application "Google Chrome" to execute front window's active tab javascript "document.body.innerText"
            else if exists (processes where name is "Safari") then
              tell application "Safari" to do JavaScript "document.body.innerText" in front document
            else
              return "Error: No supported browser running."
            end if
          end tell
        `;
        
        const pageText = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' });
        console.log(`\n👁️ E.V. is reading the active browser tab...`);
        
        // Give her the first 15,000 characters so she doesn't get overwhelmed by massive pages
        return { status: "success", content: pageText.substring(0, 15000) };
      } catch (err) {
        return { status: "error", message: `Failed to read tab. Ensure Chrome/Safari is open. Error: ${err.message}` };
      }
    }
    
    return { status: "error", message: `Tool ${name} not found.` };
  }

  // 📤 Send the tool result back to the API so E.V. knows it worked
  sendToolResponse(id, name, response) {
    if (this.ws && this.ws.readyState === 1) { // 1 = WebSocket.OPEN
      const message = {
        toolResponse: {
          functionResponses: [{
            id: id,
            name: name,
            response: response
          }]
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  async handleServerMessage(message) {
    // 1. Handle regular text and audio
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
          this.playAudioSafe(audioBuffer);
        }
        if (part.text) {
          console.log(`\n💬 E.V. says: ${part.text}`);
          sendToHUD('transcript', { text: part.text });
        }
      }
    }

    // 2. 🚨 THE FIX: Handle top-level tool calls correctly!
    if (message.toolCall?.functionCalls) {
      for (const call of message.toolCall.functionCalls) {
        const { name, args, id } = call;
        console.log(`\n🛠️ E.V. action requested: ${name}`, args);
        
        // Execute the tool
        const result = await this.onToolCall(name, args);
        
        // Send the result back so she knows it succeeded
        this.sendToolResponse(id, name, result);
      }
    }
    
    // 3. Handle turn completion
    if (message.serverContent?.turnComplete) {
      console.log('✅ E.V. finished responding.\n');

      if (this.pendingShutdown) {
        console.log('⚡ E.V. is offline.');
        process.exit(0); 
      }
    }
  }

  playAudioSafe(audioBuffer) {
    if (this.audioPlayer && this.audioPlayer.stdin) {
      this.audioPlayer.stdin.write(audioBuffer);
    }
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
    // Start with the mic strictly muted
    this.isMuted = true; 
    
    // Listen to raw keyboard inputs in the terminal
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    console.log("\n📻 WALKIE-TALKIE MODE ACTIVE:");
    console.log("   - Press [SPACEBAR] to open the mic and talk.");
    console.log("   - Press [SPACEBAR] again to send the audio to E.V.");
    console.log("   - Press [Ctrl + C] to quit the app.\n");

    process.stdin.on('data', (key) => {
      // Keep Ctrl+C working to quit the app safely
      if (key.toString() === '\u0003') {
        console.log("Shutting down...");
        process.exit();
      }

      // When you press Spacebar
      if (key.toString() === ' ') {
        this.isMuted = !this.isMuted;

        if (!this.isMuted) {
          console.log("\n🟢 [MIC OPEN] E.V. is listening...");
          sendToHUD('log', { message: '🎙️ MIC OPEN - Receiving audio...' });
        } else {
          console.log("\n🔴 [MIC CLOSED] Sending audio to E.V...");
          sendToHUD('log', { message: '🔒 MIC CLOSED - Processing data...' });
          
          // 👈 THIS IS THE MAGIC SIGNAL! It tells Gemini you are done speaking.
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ clientContent: { turnComplete: true } }));
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