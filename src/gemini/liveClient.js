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
    // Set to a valid native audio Live API model
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
      const response = JSON.parse(data.toString());
      await this.handleServerMessage(response);
    });

    this.ws.on('close', () => console.log('🔌 Connection closed.'));
    this.ws.on('error', (err) => console.error('❌ WebSocket Error:', err));
  }

  // Hot-swapping model engine is disabled because the Live API currently only supports the 2.5 Flash architecture.
  // E.V. can instead use a tool call to query a standard Pro model in the background if deep reasoning is needed.

  sendInitialSetup() {
    const setupMessage = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }
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

          // Route the tool call to the handler passed into the constructor
          const result = await this.onToolCall(name, args);

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