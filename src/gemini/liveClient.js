/* WebSocket / Gemini Multimodal Live client
Declarations to pass to the Gemini Multimodal Live API
so it can invoke these local handlers.
*/
import WebSocket from 'ws';
import { evToolsDeclaration } from '../tools/schemas.js';

const API_KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
// 1. UPDATE: Live API requires the v1beta endpoint
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class EVLiveClient {
  constructor(onToolCall) {
    this.ws = null;
    this.onToolCall = onToolCall;
    // 2. UPDATE: Use the current model string supported for Live API WebSocket
    this.currentModel = 'models/gemini-2.0-flash-exp'; 
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

  sendInitialSetup() {
    // 3. UPDATE: Fixed configuration payload schema
    const setupMessage = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
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
        // Assuming evToolsDeclaration is an array of tool objects.
        tools: evToolsDeclaration 
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
      // 4. UPDATE: Format the Tool Response exactly as BidiGenerateContentToolResponse
      const toolResponseMessage = {
        toolResponse: {
          functionResponses: [
            {
              name: name, // Provide the function name
              response: { result: result }, // Use "result" property for the return data
              id: id
            }
          ]
        }
      };
      this.ws.send(JSON.stringify(toolResponseMessage));
    }
  }
}