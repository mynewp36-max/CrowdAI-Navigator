# CrowdAI Navigator Pro

A revolutionary, highly advanced AI-powered system designed to optimize large-scale event experiences using real-time data simulation and predictive intelligence.

## Core Features
1. **Real-time Map Context**: An interactive 2D canvas displaying venue paths and live agent movements dynamically modeling large-scale crowds.
2. **AI-Powered Pathfinder**: A sophisticated A* pathfinding algorithm that dynamically updates its optimal path to avoid congested (red) zones and redirects users toward less dense flow grids.
3. **AI Chatbot Assistant**: A context-aware chatbot capable of fetching local heuristics from the simulator—answering queries about wait times, current capacity, and safe zones.
4. **Emergency Identification**: An alert logic system designed to continuously monitor high-density choke points and trigger instant alerts in the data feed dashboard when crowds surge unexpectedly.
5. **Modern Dashboard UI**: A dark-theme, glassmorphism-enabled interface using dynamic neon glows (`#00f0ff` & `#ff003c`) to immediately highlight critical information while reducing visual fatigue.

## Setup Instructions
Since this project uses a native web-standards approach (HTML5, Vanilla CSS, and Modular JS) it does not require a bulky Node.js or `npm` backend environment, which makes it incredibly fast.

1. Clone or download this directory.
2. Simply double-click **`index.html`** to open it natively in any modern browser (Chrome, Edge, Firefox).
3. The dashboard and AI simulator will start continuously mapping layout and metrics within milliseconds!

## How it Works
- `js/simulator.js`: Instantiates a global grid mapping thousands of individual agent dots using a customized physics update loop prioritizing cluster formations.
- `js/app.js`: Connects DOM metrics, charts, alert overlays, and orchestrates the Canvas 2D API renderer on every screen frame (`requestAnimationFrame`).
- `js/chatbot.js`: Manages the simulated intelligence bot UI and intent-parsers.

## Screenshots/Demo
Once running, you will observe real-time "agents" (white dots) clumping. When enough gather inside an algorithmic grid space, the zone glows red and the predictive AI line will recalculate a safe detour!