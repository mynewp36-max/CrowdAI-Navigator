document.addEventListener("DOMContentLoaded", () => {
    console.log("System initialization starting...");

    // 1. Initialize Canvas & Simulator
    const canvas = document.getElementById('crowd-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('map-tooltip');

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 600;

    const simulator = new CrowdSimulator(canvas.width, canvas.height);

    // 2. Google Charts Integration
    let chartInstance = null;
    let chartData = [['Time', 'Live Load', 'Forecast']];

    function initGoogleChart() {
        const container = document.getElementById('chart-div');
        if (!container) return;
        chartInstance = new google.visualization.LineChart(container);

        // Hide loading placeholder
        const loader = document.getElementById('chart-loading');
        if (loader) loader.style.display = 'none';

        // Seed with initial data points so chart isn't empty on first render
        for (let i = 10; i >= 1; i--) {
            const t = new Date(Date.now() - i * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const load = 40 + Math.random() * 20;
            chartData.push([t, load, Math.min(100, load + (Math.random() - 0.2) * 8)]);
        }
        drawGoogleChart();
    }

    function drawGoogleChart() {
        if (!chartInstance || chartData.length < 2) return;
        const options = {
            backgroundColor: 'transparent',
            colors: ['#00f0ff', '#ffb800'],
            legend: { position: 'none' },
            hAxis: { textPosition: 'none', baselineColor: 'rgba(255,255,255,0.05)', gridlines: { color: 'transparent' } },
            vAxis: { textPosition: 'none', gridlines: { color: 'rgba(255,255,255,0.05)' }, minValue: 0, maxValue: 100 },
            chartArea: { width: '98%', height: '85%', top: 5 },
            curveType: 'function',
            lineWidth: 2,
            tooltip: { isHtml: false }
        };
        const data = google.visualization.arrayToDataTable(chartData);
        chartInstance.draw(data, options);
    }

    function updateGoogleChart() {
        if (!chartInstance) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const live = simulator.overallLoad;
        const forecast = Math.min(100, live + (Math.random() - 0.2) * 10);
        chartData.push([time, live, forecast]);
        if (chartData.length > 22) chartData.splice(1, 1); // keep last 20 data points
        drawGoogleChart();
    }

    // Load Google Charts safely - handles both sync and async CDN availability
    if (window.google && window.google.charts) {
        google.charts.load('current', { packages: ['corechart'] });
        google.charts.setOnLoadCallback(initGoogleChart);
    } else {
        // CDN not yet ready - poll until available
        const gcInterval = setInterval(() => {
            if (window.google && window.google.charts) {
                clearInterval(gcInterval);
                google.charts.load('current', { packages: ['corechart'] });
                google.charts.setOnLoadCallback(initGoogleChart);
            }
        }, 200);
    }

    // --- Chatbot ↔ Map link state ---
    let activeHighlightZone = null;
    let highlightExpiry = 0;

    window.addEventListener('crowdai:highlight', (e) => {
        activeHighlightZone = e.detail.zone;
        highlightExpiry = Date.now() + 5000; // glow for 5 seconds
    });

    // 2. Rendering Logic
    function drawHeatmap() {
        const gs = simulator.gridSize;
        ctx.save();
        for (let c = 0; c < simulator.cols; c++) {
            for (let r = 0; r < simulator.rows; r++) {
                const density = simulator.displayGrid[c][r];
                const x = c * gs;
                const y = r * gs;

                // Smooth color blend based on density
                if (density < 0.3) {
                    ctx.fillStyle = `rgba(0, 255, 102, ${0.08 + density * 0.45})`;
                } else if (density < 0.7) {
                    ctx.fillStyle = `rgba(255, 184, 0, ${0.15 + density * 0.45})`;
                } else {
                    ctx.fillStyle = `rgba(255, 0, 60, ${0.25 + density * 0.5})`;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = 'rgba(255, 0, 60, 0.7)';
                }

                ctx.fillRect(x + 1, y + 1, gs - 2, gs - 2);
                ctx.shadowBlur = 0;
            }
        }
        ctx.restore();
    }

    function drawZoneHighlights() {
        const zw = canvas.width / 3;
        const zh = canvas.height / 3;
        const zones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
        const metrics = simulator.getZoneMetrics();
        const values = Object.values(metrics);
        const minDensity = Math.min(...values);
        ctx.save();
        ctx.setLineDash([]);

        zones.forEach((label, i) => {
            const density = metrics[label];
            const rx = i % 3;
            const ry = Math.floor(i / 3);
            const x = rx * zw, y = ry * zh;

            // Red pulsing border for congested zones (>70%)
            if (density > 70) {
                const pulse = (Math.sin(Date.now() / 180) + 1) / 2;
                ctx.strokeStyle = `rgba(255, 0, 60, ${0.4 + pulse * 0.45})`;
                ctx.lineWidth = 3;
                ctx.strokeRect(x + 4, y + 4, zw - 8, zh - 8);
            }

            // Cyan recommended zone (lowest density, <45%)
            if (density === minDensity && density < 45) {
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 8, y + 8, zw - 16, zh - 16);
                ctx.setLineDash([]);

                // "AI ROUTE" pill label
                const labelText = '✦ AI ROUTE';
                ctx.font = '600 9px Inter';
                const tw = ctx.measureText(labelText).width;
                ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
                ctx.fillRect(x + zw / 2 - tw / 2 - 5, y + 12, tw + 10, 14);
                ctx.fillStyle = '#00f0ff';
                ctx.textAlign = 'center';
                ctx.fillText(labelText, x + zw / 2, y + 22);
            }

            // Chatbot-mentioned zone → bright glow highlight
            if (activeHighlightZone === label && Date.now() < highlightExpiry) {
                const t = (highlightExpiry - Date.now()) / 5000; // 0→1 fade
                const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
                ctx.strokeStyle = `rgba(180, 0, 255, ${(0.5 + pulse * 0.4) * t})`;
                ctx.lineWidth = 4;
                ctx.shadowBlur = 20;
                ctx.shadowColor = 'rgba(180, 0, 255, 0.8)';
                ctx.strokeRect(x + 6, y + 6, zw - 12, zh - 12);
                ctx.shadowBlur = 0;

                // Zone glow label
                ctx.fillStyle = `rgba(180, 0, 255, ${t})`;
                ctx.font = '700 10px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(`ZONE ${label} — CHATBOT TARGET`, x + zw / 2, y + zh - 12);
            } else if (activeHighlightZone === label && Date.now() >= highlightExpiry) {
                activeHighlightZone = null;
            }
        });
        ctx.restore();
    }

    function drawParticles() {
        ctx.save();
        simulator.particles.forEach(p => {
            const alpha = Math.min(1, p.life / 40) * 0.45; // fade in/out
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawAIPath() {
        const path = simulator.aiPath;
        if (path.length < 2) return;
        ctx.save();

        // Outer glow pass
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length - 1; i++) {
            const mx = (path[i].x + path[i + 1].x) / 2;
            const my = (path[i].y + path[i + 1].y) / 2;
            ctx.quadraticCurveTo(path[i].x, path[i].y, mx, my);
        }
        ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
        ctx.stroke();

        // Main animated dashed line
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00f0ff';
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -(simulator.frameCount % 14);
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length - 1; i++) {
            const mx = (path[i].x + path[i + 1].x) / 2;
            const my = (path[i].y + path[i + 1].y) / 2;
            ctx.quadraticCurveTo(path[i].x, path[i].y, mx, my);
        }
        ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
        ctx.stroke();

        // Waypoint dots
        ctx.setLineDash([]);
        ctx.shadowBlur = 8;
        path.forEach((pt, i) => {
            if (i === 0 || i === path.length - 1) {
                // Start/end bigger dot
                ctx.fillStyle = i === 0 ? '#00ff66' : '#ff003c';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.restore();
    }

    function drawZoneLabels() {
        const zoneNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
        const zw = canvas.width / 3;
        const zh = canvas.height / 3;
        const metrics = simulator.getZoneMetrics();
        ctx.save();
        ctx.textAlign = 'center';

        zoneNames.forEach((label, i) => {
            const rx = i % 3;
            const ry = Math.floor(i / 3);
            const cx = rx * zw + zw / 2;
            const cy = ry * zh + zh / 2;
            const density = metrics[label] ?? 0;

            // Zone boundary line
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(rx * zw, ry * zh, zw, zh);

            // Zone letter — large, subtle
            ctx.font = '800 28px Outfit';
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillText(label, cx, cy + 10);

            // "ZONE X" label
            ctx.font = '700 10px Inter';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText(`ZONE ${label}`, cx, cy - 10);

            // Density % badge
            const color = density > 70 ? '#ff003c' : density > 40 ? '#ffb800' : '#00ff66';
            ctx.font = '600 9px Inter';
            ctx.fillStyle = color;
            ctx.fillText(`${density}%`, cx, cy + 8);
        });
        ctx.restore();
    }

    function renderLoop() {
        simulator.update();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawHeatmap();
        drawZoneHighlights();
        drawParticles();
        drawAIPath();
        drawZoneLabels();

        updateUIMetrics();

        // Update chart every ~1 second (60 frames)
        if (simulator.frameCount % 60 === 0) {
            updateGoogleChart();
        }

        requestAnimationFrame(renderLoop);
    }

    // 3. UI & Interaction
    const loadMetric = document.getElementById('load-metric');
    const totalAttendeesContainer = document.getElementById('total-attendees');
    const debugContent = document.getElementById('debug-content');

    function updateUIMetrics() {
        if (loadMetric) loadMetric.innerText = `${simulator.overallLoad}%`;
        if (totalAttendeesContainer) {
            const base = 14000;
            const fluctuation = Math.floor(simulator.overallLoad * 10);
            totalAttendeesContainer.innerText = (base + fluctuation).toLocaleString();
        }

        if (debugContent && simulator.frameCount % 30 === 0) {
            const status = simulator.getDensityStatus();
            debugContent.innerHTML = `
                <div class="debug-line"><span class="debug-label">ID:</span><span>${Math.random().toString(36).substring(7).toUpperCase()}</span></div>
                <div class="debug-line"><span class="debug-label">MODE:</span><span>${status.scenario}</span></div>
                <div class="debug-line"><span class="debug-label">LOAD:</span><span>${status.overallLoad}%</span></div>
                <div class="debug-line"><span class="debug-label">ROLE:</span><span>${status.userRole}</span></div>
                <div class="debug-line"><span class="debug-label">PARTICLES:</span><span>${simulator.particles.length}</span></div>
            `;
        }
    }

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const c = Math.floor(x / simulator.gridSize);
        const r = Math.floor(y / simulator.gridSize);
        const density = simulator.grid[c]?.[r];

        if (density !== undefined && tooltip) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.clientX - rect.left + 15}px`;
            tooltip.style.top = `${e.clientY - rect.top + 15}px`;

            const perc = Math.floor(density * 100);
            const zones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
            const zi = Math.floor(c / (simulator.cols / 3)) + Math.floor(r / (simulator.rows / 3)) * 3;
            const zone = zones[zi] || '?';

            tooltip.innerHTML = `
                <div style="color:var(--accent-cyan); font-weight:bold; margin-bottom:4px;">SENSOR NODE ${zone}-${c}${r}</div>
                <div style="display:flex; justify-content:space-between; gap:20px;">
                    <span>DENSITY:</span>
                    <span style="color:${perc > 70 ? 'var(--accent-magenta)' : (perc > 30 ? 'var(--accent-yellow)' : 'var(--accent-green)')}">${perc}%</span>
                </div>
            `;
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.style.display = 'none';
    });

    const scenarioMap = { 'btn-normal': 'Normal', 'btn-flashmob': 'Flashmob', 'btn-evac': 'Evacuation' };
    ['btn-normal', 'btn-flashmob', 'btn-evac'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            simulator.setScenario(scenarioMap[id]);
            refreshActiveBtn(id);
        });
    });

    document.getElementById('btn-vip')?.addEventListener('click', () => {
        simulator.toggleVIP();
        const btnVip = document.getElementById('btn-vip');
        if (btnVip) {
            btnVip.style.background = simulator.userRole === 'VIP' ? 'var(--accent-magenta)' : 'rgba(255, 255, 255, 0.1)';
        }
    });

    function refreshActiveBtn(id) {
        ['btn-normal', 'btn-flashmob', 'btn-evac'].forEach(bid => {
            document.getElementById(bid)?.classList.remove('active');
        });
        document.getElementById(id)?.classList.add('active');
    }

    document.querySelectorAll("#side-nav button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#side-nav li").forEach(li => li.classList.remove("active"));
            btn.parentElement.classList.add("active");
            const target = btn.getAttribute("data-target");
            document.querySelectorAll(".main-view").forEach(v => v.style.display = "none");
            const rightPanel = document.getElementById("live-aside");
            if (target === 'live') {
                document.getElementById("live-main").style.display = "flex";
                if (rightPanel) rightPanel.style.display = "flex";
            } else {
                if (rightPanel) rightPanel.style.display = "none";
                const section = document.getElementById(target + "-view");
                if (section) section.style.display = "flex";
            }
        });
    });

    if (window.Chatbot) {
        const chatInput = document.getElementById('chat-input');
        const chatHistory = document.getElementById('chat-history');
        const chatbot = new window.Chatbot(chatHistory, chatInput, simulator);
        document.getElementById('chat-send-btn')?.addEventListener('click', () => chatbot.processInput(chatInput.value));
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') chatbot.processInput(chatInput.value);
        });
    }

    renderLoop();
});