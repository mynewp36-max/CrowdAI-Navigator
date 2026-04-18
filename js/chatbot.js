// Chatbot Engine - Intelligent Context-Aware System v3
class Chatbot {
    constructor(historyContainer, inputElement, simulator) {
        this.container = historyContainer;
        this.input = inputElement;
        this.simulator = simulator;
        this.busy = false;

        // Context memory — last 3 user inputs
        this.memory = [];
        this.lastIntent = null;
        this.lastResponse = null;
        this.lastVariantIdx = -1;

        // ── Insight engine state (anti-spam controls) ──
        this.lastLoad = -1;
        this.lastCongestedSig = '';
        this.lastScenario = '';
        this.lastInsightTime = 0;
        this.lastInsightText = '';
        this.insightCount = 0;
        this.MAX_INSIGHTS = 15;
        this.MIN_INSIGHT_GAP = 5000; // ms between insights

        // Intent patterns (ordered by specificity)
        this.intents = [
            { name: 'why', pattern: /^\s*(why|explain|how come|reason|because)\b/i },
            { name: 'again', pattern: /^\s*(again|repeat|another|different|more detail)\b/i },
            { name: 'emergency', pattern: /\b(emergency|help|evacuate|evacuation|danger|urgent|exit|escape|alarm|fire|sos)\b/i },
            { name: 'route', pattern: /\b(route|path|navigate|safest|best way|go|where|direction|travel|move|get to)\b/i },
            { name: 'safe', pattern: /\b(safe|safest|secure|low risk|protected)\b/i },
            { name: 'crowded', pattern: /\b(crowd|least|quiet|empty|calm|clear|space|avoid|uncrowded|open|busy)\b/i },
            { name: 'status', pattern: /\b(status|load|current|happening|overview|report|situation|update|tell me|how is)\b/i },
            { name: 'zone', pattern: /\bzone\s+([a-i])\b/i },
        ];

        this._startInsightEngine();
    }

    // ── Intent Detection ───────────────────────────────────────────────────────
    detectIntent(text) {
        for (const { name, pattern } of this.intents) {
            if (pattern.test(text)) return name;
        }
        return 'default';
    }

    // ── Smart Decision Engine ──────────────────────────────────────────────────
    analyzeCrowd(status, metrics) {
        const entries = Object.entries(metrics).sort((a, b) => a[1] - b[1]);
        const safest = entries[0];
        const busiest = entries[entries.length - 1];
        const safeList = entries.filter(([, d]) => d < 35);
        const congested = entries.filter(([, d]) => d > 60);
        const load = status.overallLoad;

        let crowdState = 'LOW';
        if (load > 80 || status.scenario === 'Evacuation') crowdState = 'CRITICAL';
        else if (load > 60 || congested.length > 2) crowdState = 'HIGH';
        else if (load > 40) crowdState = 'MODERATE';

        const bestRoute = safeList.length >= 2
            ? safeList.slice(0, 2).map(([z]) => `Zone ${z}`)
            : safeList.length === 1
                ? [`Zone ${safeList[0][0]}`]
                : [`Zone ${safest[0]}`];

        return {
            status, metrics, entries,
            safest, busiest, safeList, congested,
            crowdState, bestRoute, load,
            route: bestRoute.join(' → '),
            safestZones: entries.slice(0, 3).map(([z, d]) => `Zone ${z} (${d}%)`),
            busiestZones: entries.slice(-3).reverse().map(([z, d]) => `Zone ${z} (${d}%)`),
            congestedNames: congested.map(([z, d]) => `Zone ${z} (${d}%)`),
            safeNames: safeList.map(([z, d]) => `Zone ${z} (${d}%)`),
            flowRate: load < 40 ? '1.8 m/s' : load < 70 ? '1.2 m/s' : '0.5 m/s',
        };
    }

    getLiveData() {
        const status = this.simulator.getDensityStatus();
        const metrics = this.simulator.getZoneMetrics();
        return this.analyzeCrowd(status, metrics);
    }

    // ── Non-Repeating Variant Picker ───────────────────────────────────────────
    pick(arr) {
        if (arr.length === 1) return arr[0];
        let i;
        do { i = Math.floor(Math.random() * arr.length); }
        while (i === this.lastVariantIdx && arr.length > 1);
        this.lastVariantIdx = i;
        return arr[i];
    }

    // ── Response Templates ─────────────────────────────────────────────────────
    buildResponse(intent, rawText, d) {
        const {
            load, crowdState, route, safest, busiest,
            safeNames, congestedNames, safestZones, busiestZones,
            flowRate, congested
        } = d;
        const scenario = d.status.scenario;
        const avoid = congestedNames.length ? congestedNames[0] : busiestZones[0];

        // Context: "why?" → explain previous answer
        if (intent === 'why') {
            if (this.lastResponse) {
                return `My previous recommendation was based on live sensor data. The venue is at ${load}% capacity, ` +
                    `and ${avoid} is the most congested area at this moment. ` +
                    `${route} offers the least resistance, minimising crowd pressure and transit time.`;
            }
            return `Ask me something first and I'll explain my reasoning based on live density data.`;
        }

        // Context: "again?" → re-run last intent with fresh variant
        if (intent === 'again' && this.lastIntent) {
            intent = this.lastIntent;
        }

        switch (intent) {

            // ── EMERGENCY ────────────────────────────────────────────────────
            case 'emergency': {
                const exits = safeNames.length ? safeNames.slice(0, 2).join(' → ') : safestZones.slice(0, 2).join(' → ');
                return this.pick([
                    `⚠️ EMERGENCY PROTOCOL INITIATED. Safe exit corridors: ${exits}. Alert staff immediately. Avoid ${busiestZones[0]} — critically congested.`,
                    `CRITICAL ALERT: All personnel route to ${exits}. ${busiestZones[0]} is blocked — do NOT enter. Venue stress: ${load}%.`,
                    `Emergency mode active. Safest corridors: ${exits}. Halt non-essential movement. Load: ${load}%.`,
                ]);
            }

            // ── ROUTE ────────────────────────────────────────────────────────
            case 'route': {
                if (scenario === 'Evacuation') return this.pick([
                    `⚠️ EVACUATION ACTIVE — suspend all standard routes. Only safe corridor: ${route}. Move immediately, do not stop.`,
                    `Emergency routing: ${route} is the clearest exit path. ${avoid} is critically blocked — follow emergency signage.`,
                    `EVAC MODE: Use ${route} ONLY. ${avoid} is at crush risk. AI has re-calculated all paths.`,
                ]);
                if (congested.length > 0) return this.pick([
                    `${avoid} is congested (${busiest[1]}%). AI recommends bypassing via ${route}.`,
                    `Rerouting around ${avoid}. Optimal corridor: ${route}. ETA improved by ~35%.`,
                    `Heavy crowd in ${avoid}. Charted alternate path: ${route}. Follow the cyan route on the map.`,
                    `Avoid ${avoid} — risk of bottleneck. Take ${route} instead — density there is ${safest[1]}%.`,
                ]);
                return this.pick([
                    `All corridors clear. Fastest route: ${route}. Venue load: ${load}% — no delays.`,
                    `No congestion detected. Proceed through ${route}. Flow rate: ${flowRate}.`,
                    `Clear paths available. ${route} is optimal — lowest density at ${safest[1]}%.`,
                ]);
            }

            // ── SAFEST ZONE ──────────────────────────────────────────────────
            case 'safe': {
                return this.pick([
                    `Safest zone right now: Zone ${safest[0]} at ${safest[1]}% density. Head there for minimum risk.`,
                    `Based on live data, Zone ${safest[0]} (${safest[1]}%) is your safest option. ${safeNames.length > 1 ? `Also clear: ${safeNames[1]}.` : ''}`,
                    `AI recommends Zone ${safest[0]} — ${safest[1]}% and stable. ${congestedNames.length ? `Avoid ${congestedNames[0]}.` : 'All other zones are manageable.'}`,
                ]);
            }

            // ── LEAST CROWDED ────────────────────────────────────────────────
            case 'crowded': {
                if (safeNames.length > 0) return this.pick([
                    `Least crowded right now: ${safeNames.join(', ')} — all under 35% density.`,
                    `Clear sectors: ${safeNames.join(', ')}. ${safestZones[0]} has the absolute lowest reading.`,
                    `I'd send you to ${safeNames.slice(0, 2).join(' or ')} — quietest spots in the venue.`,
                ]);
                return this.pick([
                    `No fully clear zones (load: ${load}%). Best option: ${safestZones[0]} — least busy right now.`,
                    `All zones are active at ${load}%. ${safestZones[0]} gives you the most breathing room.`,
                ]);
            }

            // ── STATUS REPORT ────────────────────────────────────────────────
            case 'status': {
                const tag = crowdState === 'CRITICAL' ? '🔴 CRITICAL' : crowdState === 'HIGH' ? '🟠 HIGH' : crowdState === 'MODERATE' ? '🟡 MODERATE' : '🟢 LOW';
                const congNote = congestedNames.length ? `Congested: ${congestedNames.join(', ')}.` : 'No congestion detected.';
                const openNote = safeNames.length ? `Open zones: ${safeNames.join(', ')}.` : 'All zones in use.';
                return this.pick([
                    `Live status: ${tag} | Load: ${load}% | Flow: ${flowRate} | Mode: ${scenario}. ${congNote} ${openNote}`,
                    `Venue report — Capacity: ${load}% | ${tag} | Mode: ${scenario}. ${congNote}`,
                    `Snapshot: ${load}% occupied, ${tag}. ${congNote} ${openNote} Recommend: ${route}.`,
                ]);
            }

            // ── SPECIFIC ZONE QUERY ──────────────────────────────────────────
            case 'zone': {
                const m = rawText.match(/\bzone\s+([a-i])\b/i);
                if (m) {
                    const z = m[1].toUpperCase();
                    const density = d.metrics[z];
                    if (density !== undefined) {
                        const state = density > 80 ? `🔴 CRITICAL (${density}%)` :
                            density > 60 ? `🟠 HIGH (${density}%)` :
                                density > 35 ? `🟡 MODERATE (${density}%)` :
                                    `🟢 CLEAR (${density}%)`;
                        return this.pick([
                            `Zone ${z}: ${state}. ${density > 60 ? `Better alternative: ${safestZones[0]}.` : 'Safe to enter.'}`,
                            `Sensor reading — Zone ${z}: ${density}% occupancy. ${state}. ${density > 70 ? `Recommend ${route} instead.` : ''}`,
                            `Zone ${z} is at ${density}% — ${state}. ${density < 40 ? 'One of the clearest spots now.' : density > 70 ? `Switch to ${safestZones[0]}.` : 'Manageable flow.'}`,
                        ]);
                    }
                }
                return `I couldn't identify that zone. Try asking about "Zone A" through "Zone I" for live readings.`;
            }

            // ── DEFAULT (context-aware) ──────────────────────────────────────
            default: {
                if (crowdState === 'CRITICAL') return this.pick([
                    `⚠️ Venue at ${load}% — critical capacity. Congested: ${congestedNames.join(', ')}. Redistribute to ${route} immediately.`,
                    `High stress: ${load}% load. ${avoid} is a hotspot. Move crowds to ${route}.`,
                ]);
                if (congested.length > 0) return this.pick([
                    `Congestion flagged in ${congestedNames.join(', ')}. Best reroute: ${route}. Overall load: ${load}%.`,
                    `Elevated density in ${congestedNames[0]}. ${route} is the safest redirect right now.`,
                ]);
                return this.pick([
                    `Venue stable at ${load}%. Safest area: Zone ${safest[0]} (${safest[1]}%). No active alerts. Ask me for a route or zone status.`,
                    `All clear — ${load}% load. Zone ${safest[0]} is your best choice at ${safest[1]}%.`,
                    `System nominal. ${route} is open and flowing at ${flowRate}. Ask me anything — routes, zone info, or emergency guidance.`,
                ]);
            }
        }
    }

    // ── Real-Time Insight Engine (anti-spam, controlled) ─────────────────────
    _startInsightEngine() {
        setInterval(() => {
            if (!this.simulator) return;
            const status = this.simulator.getDensityStatus();
            this.generateSmartInsight(status);
        }, 3000);
    }

    generateSmartInsight(status) {
        if (!this.simulator) return;
        const now = Date.now();
        
        // 1. Add Throttling (MANDATORY)
        if (now - this.lastInsightTime < 5000) return;

        // 6. Limit total insights (Anti-spam safety)
        if (this.insightCount > 15) return;

        const metrics = this.simulator.getZoneMetrics();
        const entries = Object.entries(metrics).sort((a, b) => a[1] - b[1]);
        const crowdedZone = entries[entries.length - 1]; // most crowded
        const safeZone = entries[0]; // safest

        // 7. Priority filter
        // Only show insights when: overallLoad > 50 OR any zone density > 60
        if (status.overallLoad <= 50 && crowdedZone[1] <= 60) {
            // Still update tracking metrics so we notice future changes
            this.lastLoad = status.overallLoad;
            this.lastCongestedSig = crowdedZone[0];
            this.lastScenario = status.scenario;
            return;
        }

        // 3. Change-based trigger (IMPORTANT)
        const loadChanged = this.lastLoad !== -1 && Math.abs(status.overallLoad - this.lastLoad) >= 5;
        const congestChanged = crowdedZone[0] !== this.lastCongestedSig;
        const scenarioChanged = status.scenario !== this.lastScenario && this.lastScenario !== '';

        if (this.lastLoad !== -1 && !loadChanged && !congestChanged && !scenarioChanged) {
            return; // Nothing changed enough to warrant an insight
        }

        // 4. Smart Insight Function
        const insight = `AI insight: Zone ${crowdedZone[0]} is congested. Redirect to Zone ${safeZone[0]}.`;

        // 2. Duplicate Prevention
        if (insight === this.lastInsightText) return;

        this.lastInsightText = insight;
        this.lastInsightTime = now;
        this.lastLoad = status.overallLoad;
        this.lastCongestedSig = crowdedZone[0];
        this.lastScenario = status.scenario;
        this.insightCount++;

        this._injectInsight(insight);
    }

    _injectInsight(text, d) {
        // Don't stack if user is far from bottom (UX: don't interrupt scrolled-up reading)
        const isAtBottom = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < 80;

        const div = document.createElement('div');
        div.className = 'chat-msg bot insight-fade';
        div.style.cssText = 'animation: insightFadeIn 0.5s ease forwards; opacity:0;';

        const badge = document.createElement('div');
        badge.className = 'ai-suggestion-badge';
        badge.style.cssText = 'background:rgba(255,180,0,0.9);color:#000;';
        badge.textContent = '⚡ Live Insight';
        div.appendChild(badge);

        const content = document.createElement('div');
        div.appendChild(content);
        this.container.appendChild(div);

        if (isAtBottom) this.scrollBottom();

        this._streamText(content, text, 14);

        // Map sync — highlight mentioned zone
        const m = text.match(/Zone\s+([A-I])/i);
        if (m) window.dispatchEvent(new CustomEvent('crowdai:highlight', { detail: { zone: m[1].toUpperCase() } }));
    }

    // ── Streaming Text Effect ──────────────────────────────────────────────────
    _streamText(el, text, speed = 18) {
        el.textContent = '';
        let i = 0;
        const tick = () => {
            if (i < text.length) {
                el.textContent += text[i++];
                this.scrollBottom();
                setTimeout(tick, speed);
            }
        };
        tick();
    }

    // ── DOM Helpers ────────────────────────────────────────────────────────────
    addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'chat-msg user';
        div.textContent = text;
        this.container.appendChild(div);
        this.scrollBottom();
    }

    addBotMessage(text, isThinking = false) {
        const div = document.createElement('div');
        div.className = 'chat-msg bot' + (isThinking ? ' thinking' : '');

        if (!isThinking) {
            const badge = document.createElement('div');
            badge.className = 'ai-suggestion-badge';
            badge.textContent = 'AI';
            div.appendChild(badge);
            const content = document.createElement('div');
            div.appendChild(content);
            this.container.appendChild(div);
            this.scrollBottom();
            this._streamText(content, text);
        } else {
            div.textContent = text;
            this.container.appendChild(div);
            this.scrollBottom();
        }
        return div;
    }

    scrollBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    // ── Main Entry ─────────────────────────────────────────────────────────────
    async processInput(text) {
        if (this.busy) return;
        const cleanedText = text.trim();
        if (!cleanedText) return;

        // Keep system "smart": Maintain last 3 messages context (frontend side)
        this.memory.push(cleanedText);
        if (this.memory.length > 3) this.memory.shift();

        this.addUserMessage(cleanedText);
        this.input.value = '';
        this.busy = true;

        // Loading indicator
        const thinkMsg = [
            'Querying Vertex AI...',
            'Connecting to backend...',
            'Analyzing context...'
        ][Math.floor(Math.random() * 3)];
        const typingEl = this.addBotMessage(thinkMsg, true);

        try {
            // Combine the context array into a single string for the request
            const historyText = this.memory.join('\\n');

            const response = await fetch('https://3000-cs-1059097624928-default.cs-asia-southeast1-seal.cloudshell.dev/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: historyText })
            });

            if (!response.ok) {
                throw new Error(`Backend returned status ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply || "No response received.";

            this.lastResponse = reply;

            // Remove loading indicator and show actual reply
            typingEl.remove();
            this.addBotMessage(reply);

            // Map ↔ Chatbot zone highlight
            const zoneMatch = reply.match(/Zone\s+([A-I])/i);
            if (zoneMatch) {
                window.dispatchEvent(new CustomEvent('crowdai:highlight', {
                    detail: { zone: zoneMatch[1].toUpperCase() }
                }));
            }

        } catch (err) {
            console.error('[CrowdAI API] Error:', err);
            typingEl.classList.remove('thinking');
            typingEl.textContent = 'Warning: Vertex AI backend unreachable. Please try again.';
        } finally {
            this.busy = false;
        }
    }
}

window.Chatbot = Chatbot;