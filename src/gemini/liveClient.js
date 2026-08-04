import WebSocket, { WebSocketServer } from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import Speaker from 'speaker';
import record from 'node-record-lpcm16';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

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

    // Initialize standard Mac Speaker Output (24kHz is standard for Gemini Audio)
    this.speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: 24000
    });

    this.speaker.setMaxListeners(0);
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

      // Start listening to your microphone immediately
      this.startMicrophoneStream();
    });

    this.ws.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());
        await this.handleServerMessage(response);
      } catch (e) {
        console.error('❌ Error parsing message:', e);
      }
    });

    // Expose the hidden disconnect reason from the server
    this.ws.on('close', (code, reason) => {
      console.log(`🔌 Connection closed. Code: ${code}, Reason: ${reason.toString() || 'None'}`);
    });
    
    this.ws.on('error', (err) => console.error('❌ WebSocket Error:', err));
  }

  sendInitialSetup() {
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
        // Defensively ensure tools is always an array to prevent 400 Bad Request
        tools: Array.isArray(evToolsDeclaration) ? evToolsDeclaration : [evToolsDeclaration]
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log('Configuration sent');
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

    // 📄 CREATE FILE (Locked to .md, .json, .txt)
    if (name === 'create_file') {
      try {
        const ext = args.filename.split('.').pop().toLowerCase();
        if (!['md', 'json', 'txt', 'text'].includes(ext)) {
          return { status: "error", message: "Denied. I can only create .md, .json, or .txt files." };
        }

        fs.writeFileSync(args.filename, args.content);
        console.log(`\n📄 E.V. created file: ${args.filename}`);
        
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

    // 🌐 VISUAL WEB SEARCH
    if (name === 'open_search_tab') {
      try {
        // Formats the query for a URL and opens it in the default Mac browser
        const url = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
        exec(`open "${url}"`); 
        
        console.log(`\n🌐 E.V. opened browser search for: ${args.query}`);
        return { 
          status: "success", 
          message: "Search tab opened successfully. Now verbally explain the topic to him." 
        };
      } catch (err) {
        return { status: "error", message: `Failed to open browser: ${err.message}` };
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
    if (message.serverContent?.modelTurn?.parts) {
      this.isMuted = true; // 🔇 Mute microphone

      for (const part of message.serverContent.modelTurn.parts) {
        if (part.functionCall) {
          const { name, args, id } = part.functionCall;
          console.log(`\n🛠️ E.V. action requested: ${name}`, args);
          const result = await this.onToolCall(name, args);
          this.sendToolResponse(id, name, result);
        }
        
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
          this.playAudioSafe(audioBuffer);
        }
        if (part.text) {
          sendToHUD('transcript', { text: part.text });
        }
      }
    }
    
    if (message.serverContent?.turnComplete) {
      console.log('✅ E.V. finished responding.\n');
      this.isMuted = false; // 🎤 Unmute microphone

      // ⚡ Kill the process if the shutdown flag was tripped
      if (this.pendingShutdown) {
        console.log('⚡ E.V. is offline.');
        process.exit(0); 
      }
    }
  }

  playAudioSafe(audioBuffer) {
    // If the speaker buffer is full, it returns false. 
    // We then wait for the 'drain' event before continuing.
    const canWrite = this.speaker.write(audioBuffer);
    
    if (!canWrite) {
      this.speaker.once('drain', () => {
        // You could add logic here to write the next chunk if you queue them, 
        // but for now, just letting it drain often resolves the severe stutter.
      });
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

// Start streaming microphone input to Gemini
  startMicrophoneStream() {
    if (this.mic) return;
    console.log("🎤 Microphone active. Start speaking...");
    
    // Capture from SoX and pipe to Gemini
    this.mic = record.record({
      sampleRate: 16000,
      channels: 1,
      threshold: 0
    });

    this.mic.stream().on('data', (data) => {
      // 🔇 Ignore mic input while E.V. is speaking to prevent echo loops
      if (this.isMuted) return;
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const base64Audio = data.toString('base64');
        
        const message = {
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Audio
            }
          }
        };
        this.ws.send(JSON.stringify(message));
      }
    });
  }
}