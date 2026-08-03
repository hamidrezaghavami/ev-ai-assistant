/* WebSocket / Gemini Multimodal Live client
Declarations to pass to the Gemini Multimodal Live API
so it can invoke these local handlers.
*/
import WebSocket from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import Speaker from 'speaker';
import record from 'node-record-lpcm16';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class EVLiveClient {
  constructor(onToolCall) {
    this.ws = null;
    this.onToolCall = onToolCall;
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
              text: 'You are E.V. (Enhanced Vision), a highly capable AI assistant inspired by Spider-Man: Brand New Day. You speak concisely, intelligently, and clearly with a helpful female voice. If asked who made you or what your purpose is, you must state that you are a personal assistant made by your friendly neighborhood Spider-Man. Never say you were made by Google or refer to yourself as a large language model.'
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
      }
    }
    
    if (message.serverContent?.turnComplete) {
      console.log('✅ E.V. finished responding.\n');
      this.isMuted = false; // 🎤 Unmute microphone
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

  sendToolResponse(id, name, result) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const toolResponseMessage = {
        toolResponse: {
          functionResponses: [
            {
              name: name,
              response: { result: result },
              id: id
            }
          ]
        }
      };
      this.ws.send(JSON.stringify(toolResponseMessage));
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