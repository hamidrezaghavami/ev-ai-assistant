# E.V. ( Enhanced Vision )
A lightweight, dual-engine AI assistant featuring a sandboxed local environment, macOS system control, and a cinematic visual HUD. Built for continuous voice interaction and offline resilience.

*Capabilities & Options*

1. ### Sandboxed Desktop File Manager
Restricted Workspace: E.V. can read, write, edit, and delete files only inside a single designated directory (e.g., `~/Desktop/EV_Workspace/`).
Hard Lockdown: Any command target outside this path is blocked immediately by the Node.js backend wrapper before execution.

2. ### Browser & Social Search Agent:
Tab & Window Control: Open links, launch new windows, and close tabs using native macOS AppleScript calls.
Deep Research: Perform targeted web and social media queries, summarizing key insights into voice responses or saving formatted summaries straight into your sandboxed workspace.

3. ### Movie-Style Visual UI (Dashboard):
High-Tech Interface: A visual dashboard inspired by the movie HUD, featuring live processing status indicators, audio waveform visualizers, active task feeds, and telemetry logs.
4. ### Continuous Voice Interaction ( Online Mode):
Live Audio Stream: Low-latency, two-way conversational voice streaming using Gemini's female voice profiles (Kore via Gemini Live / Multimodal Live API).
5. ### Offline Fallback Engine (Local Mode):
Air-Gapped Operation: When internet access is unavailable, E.V. seamlessly routes core text and visual dashboard logic to a local instance of `Ollama`.
Lightweight LLM: Utilizes `Qwen2.5-coder:1.5b`, a highly optimized `~1GB model` that runs locally on the host machine to handle code, dashboard rendering, and essential sandbox tasks without bottlenecking system hardware.

# Design and Architecture:
```
┌───────────────────────────────────────────┐
│               SAMSUNG PHONE               │
│    (React Native Voice & Visual HUD)      │
└─────────────────────┬─────────────────────┘
                      │ WebSockets (Audio Stream + HUD Telemetry)
                      ▼
┌───────────────────────────────────────────┐
│               MACBOOK PRO                 │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │   Node.js Daemon + WebSocket Hub    │  │
│  └──────────────────┬──────────────────┘  │
│          ┌──────────┴──────────┐          │
│          ▼                     ▼          │
│ ┌──────────────┐     ┌──────────────┐     │
│ │ Safety Engine│     │ Gemini Live  │     │
│ │(Sandbox FS / │     │ API Client   │     │
│ │ AppleScript) │     └──────┬───────┘     │
│ └──────┬───────┘            │             │
└────────┼────────────────────┼─────────────┘
         │                    │
         ▼                    ▼
┌──────────────────┐ ┌──────────────────┐
│ ~/Desktop/       │ │ Google           │
│   EV_Workspace/  │ │ Gemini Live API  │
│ macOS System     │ │ (Cloud Only)     │
└──────────────────┘ └──────────────────┘
```
### Project Structure:
```
ev-ai-assistant/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── .env
└── src/
    ├── config.js          # Path configurations & constants
    ├── index.js           # Server entrypoint & LLM Router (Gemini/Ollama)
    ├── tools/
    │   ├── fsSandbox.js   # Sandboxed file manager (desktop only)
    │   ├── browser.js     # macOS AppleScript tab controller
    │   └── schemas.js     # E.V. schema definitions and system prompts
    └── gemini/
        ├── index.html     # Movie-Style Visual UI (Dashboard)
        ├── liveClient.js  # WebSocket / Gemini Multimodal Live client (Online)
```
1. ### Quick Start & Execution:
*Prerequisites*
*Docker installed on your host machine*
*A Google AI Studio / Gemini API Key*

2. ### 2. Environment Setup:
Clone the repository and install the backend dependencies:
```
git clone https://github.com/yourusername/ev-ai-assistant.git
cd ev-ai-assistant
npm install
```
Create a .env file in the root directory and add your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```
3. ### 3. System Ignition (Dockerized):
Build and spin up the central Node.js daemon, WebSocket hub, and dual-LLM router using your Dockerfile:
```
docker build -t ev-backend .
docker run -d -p 8081:8081 --env-file .env ev-backend
```
The containerized server is now running and bound to `http://127.0.0.1:8081`.

4. ### Launching the HUD
Desktop Dashboard: Open `src/gemini/index.html in your browser.
Mobile Connection: Ensure your phone is on the same Wi-Fi network and navigate to your host machine's local IP (e.g., `http://192.168.1.105:8081`) to access the React Native voice `interface. E.V.` is now containerized and fully operational.