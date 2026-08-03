/* WebSocket / Gemini Multimodal Live client
Declarations to pass to the Gemini Multimodal Live API
so it can invoke these local handlers.
*/
import WebSocket from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';
import { Decibri, DecibriOutput } from 'decibri';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class EVLiveClient {
  constructor(onToolCall) {
    this.ws = null;
    this.onToolCall = onToolCall;
    this.currentModel = 'models/gemini-3.1-flash-live-preview'; 

    // NEW: Initialize Speaker Output (24kHz is standard for Gemini Audio)
    this.speaker = new DecibriOutput({
      sampleRate: 24000, 
      channels: 1
    });

    // NEW: Initialize Microphone Input (16kHz is standard for Gemini Input)
    this.mic = new Decibri({
      sampleRate: 16000,
      channels: 1,
      format: 'int16'
    });
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

      // Start listening to your microphone immediately instead of sending text
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

    // UPDATE: Expose the hidden disconnect reason from the server
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
          // UPDATE: Removed 'TEXT'. Some Live models reject dual modalities.
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
              text: 'You are E.V. (Enhanced Vision), a highly capable AI assistant inspired by Spider-Man: Brand New Day. You speak concisely, intelligently, and clearly with a helpful female voice.'
            }
          ]
        },
        // UPDATE: Defensively ensure tools is always an array to prevent 400 Bad Request
        tools: Array.isArray(evToolsDeclaration) ? evToolsDeclaration : [evToolsDeclaration]
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log('Configuration sent');
  }

  async handleServerMessage(message) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        
        // Handle Tool Calls (What we had before)
        if (part.functionCall) {
          const { name, args, id } = part.functionCall;
          console.log(`\n🛠️ E.V. action requested: ${name}`, args);

          const result = await this.onToolCall(name, args);
          this.sendToolResponse(id, name, result);
        }
        
        // NEW: Play Audio Data
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          // Gemini sends base64 PCM data. We need to decode it to raw bytes for the speaker.
          const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
          this.speaker.write(audioBuffer);
        }
      }
    }
    
    // NEW: Detect when E.V. is completely finished speaking
    if (message.serverContent?.turnComplete) {
      console.log('✅ E.V. finished responding.\n');
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

  // NEW: Start streaming microphone input to Gemini
  startMicrophoneStream() {
    console.log("🎤 Microphone active. Start speaking...");
    
    this.mic.on('data', (pcmBuffer) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Encode raw PCM chunks from the mic to base64
        const base64Audio = pcmBuffer.toString('base64');
        
        const message = {
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=16000",
              data: base64Audio
            }]
          }
        };
        this.ws.send(JSON.stringify(message));
      }
    });

    this.mic.start();
  }
}