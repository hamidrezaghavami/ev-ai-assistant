/* WebSocket / Gemini Multimodal Live client
Declarations to pass to the Gemini Multimodal Live API
so it can invoke these local handlers.
*/
import WebSocket from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class EVLiveClient {
  constructor(onToolCall) {
    this.ws = null;
    this.onToolCall = onToolCall;
    // Default model engine on boot
    this.currentModel = 'models/gemini-3.6-flash';
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
      const response = JSON.parse(data.toString());
      await this.handleServerMessage(response);
    });

    this.ws.on('close', () => console.log('🔌 Connection closed.'));
    this.ws.on('error', (err) => console.error('❌ WebSocket Error:', err));
  }

  // Hot-swap model engine and re-establish WebSocket connection
  switchEngine(target) {
    const isPro = target.toLowerCase().includes('pro');
    this.currentModel = isPro ? 'models/gemini-3.1-pro' : 'models/gemini-3.6-flash';
    
    console.log(`🔄 Switching E.V. engine to ${this.currentModel}...`);
    if (this.ws) {
      this.ws.close();
    }
    this.connect();
    return `Engine successfully switched to ${isPro ? '3.1 Pro' : '3.6 Flash'}.`;
  }

  sendInitialSetup() {
    const setupMessage = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Ursa' }
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
        tools: evToolsDeclaration
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  async handleServerMessage(message) {
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.functionCall) {
          const { name, args, id } = part.functionCall;
          console.log(`🛠️ E.V. action requested: ${name}`, args);

          let result;
          if (name === 'switchModel') {
            result = this.switchEngine(args.targetModel);
          } else {
            result = await this.onToolCall(name, args);
          }

          this.sendToolResponse(id, name, result);
        }
      }
    }
  }

  sendToolResponse(id, name, result) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const toolResponse = {
        toolResponse: {
          functionResponses: [
            {
              response: { output: result },
              id: id
            }
          ]
        }
      };
      this.ws.send(JSON.stringify(toolResponse));
    }
  }
}