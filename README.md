# E.V. ( Enhanced Vision )

*Capabilities & Options E.V. Will Have*

1. ### Sandboxed Desktop File Manager
Restricted Workspace: E.V. can read, write, edit, and delete files only inside a single designated directory (e.g., `~/Desktop/EV_Workspace/`).
Hard Lockdown: Any command target outside this path is blocked immediately by the Node.js backend wrapper before execution.

2. ### Browser & Social Search Agent:
Tab & Window Control: Open links, launch new windows, and close tabs using native macOS AppleScript calls.
Deep Research: Perform targeted web and social media queries, summarizing key insights into voice responses or saving formatted summaries straight into your sandboxed workspace.

3. ### Movie-Style Visual UI (Dashboard):
High-Tech Interface: A visual dashboard inspired by the movie HUD, featuring live processing status indicators, audio waveform visualizers, active task feeds, and telemetry logs.
4. ### Continuous Voice Interaction:
Live Audio Stream: Low-latency, two-way conversational voice streaming using Gemini's female voice profiles (e.g., Aoede or Kore via Gemini Live / Multimodal Live API).

# Design and Architecture:
```
┌───────────────────────────────────────────┐
│              SAMSUNG PHONE                │
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
│                     │                     │
│         ┌───────────┴───────────┐         │
│         ▼                       ▼         │
│  ┌──────────────┐       ┌──────────────┐  │
│  │ Safety Engine│       │ Gemini Client│  │
│  │(Sandbox FS / │       │ (Live Voice /│  │
│  │ AppleScript) │       │ Function Call│  │
│  └──────┬───────┘       └──────┬───────┘  │
└─────────┼──────────────────────┼──────────┘
          │                      │
          ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│ ~/Desktop/       │   │  Google Gemini API │
│   EV_Workspace/  │   │  (Female Voice /   │
│ macOS System     │   │   Multimodal Live) │
└──────────────────┘   └────────────────────┘

ev-ai-assistant/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
└── src/
    ├── config.js          # Path configurations & constants
    ├── index.js           # Server entrypoint
    ├── tools/
    │   ├── fsSandbox.js   # Sandboxed file manager (desktop only)
    │   └── browser.js     # macOS AppleScript tab controller
    └── gemini/
        └── liveClient.js  # WebSocket / Gemini Multimodal Live client
```
- this is the structure of `online` mode of `E.V.` but for situation that there is no Internet we thinking about enhancing situation by adding a parallel ai system into our existant one with `Ollama "Qwen2.5-coder:1.5b" that is 1GB for download` lighweight model that run locally on our own device to do limited important parts.