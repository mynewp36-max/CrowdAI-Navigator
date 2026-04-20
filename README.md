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

# 🚀 CrowdAI Navigator - Backend

An intelligent real-time backend system powering **CrowdAI Navigator**, designed to optimize crowd movement, detect congestion, and provide AI-driven navigation assistance.

This backend is deployed on **Google Cloud Run** and uses **Google Vertex AI (Gemini)** for real-time intelligent decision making.

---

## 🌐 Live Backend URL

👉 https://crowdai-backend-1007858189738.us-central1.run.app

---

## 🧠 Technologies Used

- Node.js (Express)
- Google Cloud Run (Deployment)
- Google Firestore (Database)
- Google Vertex AI (Gemini 2.5 Flash)
- REST API Architecture

---

## ⚡ Key Features

### 🔹 Real-Time Crowd Data
- Fetches live zone data from **Firestore**
- Automatically falls back to simulated data if database is empty

---

### 🔹 Predictive Intelligence
- Predicts future crowd load based on current density
- Helps avoid congestion before it happens

---

### 🔹 Emergency Detection
- Detects high congestion zones (>70%)
- Generates real-time alerts

---

### 🔹 AI Chat Assistant (Powered by Vertex AI)
- Uses **Gemini 2.5 Flash model**
- Provides:
  - Safe route suggestions
  - Crowd-aware navigation
  - Real-time decision making

---

## 🧩 API Endpoints

---

### 1️⃣ Health Check

GET /

Response:


---

### 2️⃣ Get Live Zone Data

GET /zones

Response:
```json
{
  "zones": [
    {
      "zone": "A",
      "level": "LOW",
      "load": "30%",
      "predicted": "40%"
    }
  ],
  "alerts": [
    "🚨 High crowd in Zone B (85%)"
  ]
}

POST /chat

Request:

{
  "message": "Which route is safest?"
}

Response:

{
  "reply": "Use Zone A (30%) as it has the lowest crowd density."
}

Firestore Data Structure

Collection: crowdData

Example document:

{
  "name": "Zone A",
  "crowd": "LOW",
  "density": 30
}
