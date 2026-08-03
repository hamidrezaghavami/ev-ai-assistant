/* WebSocket / Gemini Multimodal Live client
Declarations to pass to the Gemini Multimodal Live API
so it can invoke these local handlers.
*/
import WebSocket from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class EVLiveClient {
  constructor(onToolCall) {
    this.ws = null;
    this.onToolCall = onToolCall;
    this.currentModel = 'models/gemini-3.1-flash-live-preview'; 
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
        if (part.functionCall) {
          const { name, args, id } = part.functionCall;
          console.log(`🛠️ E.V. action requested: ${name}`, args);

          const result = await this.onToolCall(name, args);
          this.sendToolResponse(id, name, result);
        }
      }
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
}