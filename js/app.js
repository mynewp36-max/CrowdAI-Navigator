document.addEventListener("DOMContentLoaded", () => {
    console.log("System initialization starting...");

    window.appState = {
        zones: [
            { name: "A", load: 30, level: "LOW" },
            { name: "B", load: 80, level: "HIGH" },
            { name: "C", load: 60, level: "BUSY" },
            { name: "D", load: 35, level: "LOW" },
            { name: "E", load: 48, level: "BUSY" },
            { name: "F", load: 42, level: "BUSY" },
            { name: "G", load: 38, level: "LOW" },
            { name: "H", load: 36, level: "LOW" },
            { name: "I", load: 40, level: "LOW" }
        ],
        filterTime: "5m",
        selectedZone: "ALL",
        showMode: "percentage", // Consistent with user's initial structure
        live: false,
        timeRange: "5m"
    };

    window.settingsState = {
        densityMultiplier: 1.0,
        aiAggressiveness: 85,
        autoRerouting: true,
        systemAlerts: true,
        predictions: true,
        mode: "normal" // normal | emergency | vip
    };

    if (!window.appState.simulation) {
        window.appState.simulation = {
            running: true,
            zones: {
                A: 30, B: 70, C: 55, D: 40,
                E: 65, F: 50, G: 35, H: 60, I: 45
            },
            history: [],
            lastMode: "normal"
        };
    }

    console.log("Settings State Initialized:", window.settingsState);

    function debounce(fn, delay = 150) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), delay);
        };
    }

    let lastLogTime = 0;
    function safeLog(data) {
        const now = Date.now();
        if (now - lastLogTime > 500) {
            console.log("Updated Settings:", data);
            lastLogTime = now;
        }
    }

    function isSameState(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    function fluctuate(value, mode) {
        let change = Math.random() * 10 - 5;
        if (mode === "emergency") change *= 2;
        if (mode === "vip") change *= 0.5;
        let newVal = value + change;
        return Math.max(10, Math.min(100, newVal));
    }

    function runSimulation() {
        if (!window.appState.simulation.running) return;

        const sim = window.appState.simulation;
        const mode = window.settingsState.mode || "normal";

        Object.keys(sim.zones).forEach(zone => {
            sim.zones[zone] = fluctuate(sim.zones[zone], mode);
        });

        sim.history.push({...sim.zones});
        if (sim.history.length > 20) sim.history.shift();

        updateDashboard(sim.zones);
        generateAlerts(sim.zones, mode);
    }

    setInterval(runSimulation, 2000);

    function updateDashboard(zones) {
        const values = Object.values(zones);
        const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
        const highest = Object.entries(zones).reduce((a, b) => a[1] > b[1] ? a : b);
        const lowest = Object.entries(zones).reduce((a, b) => a[1] < b[1] ? a : b);

        // Sync with appState for UI/Chart rendering
        window.appState.zones = window.appState.zones.map(z => ({
            ...z,
            load: Math.round(zones[z.name] || z.load),
            level: getLevel(zones[z.name] || z.load)
        }));

        // Sync with Simulator Physics
        if (window.simulator) {
            if (!window.simulator.targetGrid) {
                window.simulator.targetGrid = window.simulator.grid.map(col => [...col]);
            }
            const cw = window.simulator.cols / 3;
            const rw = window.simulator.rows / 3;
            const zoneLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
            Object.entries(zones).forEach(([zName, val]) => {
                const zIdx = zoneLetters.indexOf(zName);
                if (zIdx !== -1) {
                    const tDens = val / 100;
                    const startC = Math.floor((zIdx % 3) * cw);
                    const startR = Math.floor(Math.floor(zIdx / 3) * rw);
                    for (let c = startC; c < startC + cw && c < window.simulator.cols; c++) {
                        for (let r = startR; r < startR + rw && r < window.simulator.rows; r++) {
                            window.simulator.targetGrid[c][r] = tDens + (Math.random() - 0.5) * 0.1;
                        }
                    }
                }
            });
        }

        safeLog({
            avgLoad: avg,
            highestZone: highest,
            safestZone: lowest
        });

        // Update Charts & Stats
        updateAnalyticsDashboard(true);
    }

    function generateAlerts(zones, mode) {
        if (!window.settingsState.systemAlerts) return;
        const highZones = Object.entries(zones).filter(z => z[1] > 80);
        
        highZones.forEach(z => {
            // Check if already notified via local cache or similar logic to avoid spam
            if (!notifiedZones.has(z[0])) {
                safeLog("🚨 High crowd detected in Zone " + z[0] + " (" + Math.round(z[1]) + "%)");
                addSmartLog(`Alert: Zone ${z[0]}`, `Extreme load detected (${Math.round(z[1])}%). Diverting pathing.`, 'alert');
                notifiedZones.add(z[0]);
            }
        });
        
        // Resolve logic
        Object.entries(zones).forEach(([zName, val]) => {
            if (val < 50 && notifiedZones.has(zName)) {
                addSmartLog(`Resolved: Zone ${zName}`, `Crowd density has stabilized.`, 'resolved');
                notifiedZones.delete(zName);
            }
        });

        if (mode === "emergency") {
            safeLog("⚠ Emergency Mode Active: Rerouting crowd...");
        }
    }

    window.setMode = function(mode) {
        window.appState.simulation.lastMode = mode;
        window.settingsState.mode = mode;
        safeLog("Simulation adjusted for mode: " + mode);
        
        // Handle side-effects (Mode button syncing)
        const modeMap = { 'normal': 'set-btn-normal', 'emergency': 'set-btn-emergency', 'vip': 'set-btn-vip' };
        const btnId = modeMap[mode];
        const btn = document.getElementById(btnId);
        if (btn) {
           document.querySelectorAll('.ctrl-btn').forEach(b => {
               if (b.id && b.id.startsWith('set-btn-')) b.classList.remove('active');
           });
           btn.classList.add('active');
        }
    };

    window.toggleSimulation = function() {
        window.appState.simulation.running = !window.appState.simulation.running;
        safeLog("Simulation running: " + window.appState.simulation.running);
    };

    let liveInterval = null;

    function getLevel(load) {
        if (load > 75) return "HIGH";
        if (load > 50) return "BUSY";
        return "LOW";
    }

    function updateZoneData() {
        if (!window.simulator) return;
        const metrics = window.simulator.getZoneMetrics();
        window.appState.zones = window.appState.zones.map(zone => {
            const realLoad = metrics[zone.name] || 0;
            return {
                ...zone,
                load: Math.round(realLoad),
                level: getLevel(realLoad)
            };
        });
    }

    const notifiedZones = new Set();
    function runAIAudit() {
        if (!window.settingsState.systemAlerts) return;
        
        window.appState.zones.forEach(z => {
            if (z.load > 75 && !notifiedZones.has(z.name)) {
                addSmartLog(`Congestion Alert: Zone ${z.name}`, `Density peaking at ${z.load}%. AI recommends alternative routing.`, 'alert');
                notifiedZones.add(z.name);
            } else if (z.load < 50 && notifiedZones.has(z.name)) {
                addSmartLog(`Congestion Resolved: Zone ${z.name}`, `Traffic flow in Zone ${z.name} has returned to safe levels.`, 'resolved');
                notifiedZones.delete(z.name);
            }
        });
    }

    setInterval(runAIAudit, 6000);

    function updateDashboard(isManual = false) {
        // 1. Simulate variation based on timeRange if manual trigger
        // This makes the data "shift" when clicking a time button
        if (isManual) {
            window.appState.zones.forEach(z => {
                const shift = (Math.random() * 20 - 10);
                const newVal = Math.max(10, Math.min(95, z.load + shift));
                z.load = Math.round(newVal);
                z.level = getLevel(newVal);
            });
        }

        // 2. Call the main analytics update function using appState
        updateAnalyticsDashboard(true);
    }

    setInterval(() => {
        updateZoneData();
        updateDashboard();
    }, 4000);

    // 1. Time filter buttons
    const timeBtns = [document.getElementById("btn-time-5m"), document.getElementById("btn-time-15m"), document.getElementById("btn-time-1h")];
    timeBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener("click", () => {
                timeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.appState.timeRange = btn.innerText;
                console.log("State Updated:", window.appState);
                updateDashboard(true);
            });
        }
    });

    // 2. Zone dropdown
    const zoneFilterEl = document.getElementById("zone-filter-select");
    if (zoneFilterEl) {
        zoneFilterEl.addEventListener("change", (e) => {
            window.appState.selectedZone = e.target.value;
            console.log("State Updated:", window.appState);
            updateDashboard(true);
        });
    }

    // 3. Toggle % / Level
    const pctBtn = document.getElementById("btn-toggle-pct");
    const lvlBtn = document.getElementById("btn-toggle-lvl");
    if (pctBtn && lvlBtn) {
        pctBtn.addEventListener("click", () => {
            if (window.appState.showMode === "percentage") return;
            pctBtn.classList.add('active');
            lvlBtn.classList.remove('active');
            window.appState.showMode = "percentage";
            console.log("State Updated:", window.appState);
            updateDashboard(true);
        });
        lvlBtn.addEventListener("click", () => {
            if (window.appState.showMode === "level") return;
            lvlBtn.classList.add('active');
            pctBtn.classList.remove('active');
            window.appState.showMode = "level";
            console.log("State Updated:", window.appState);
            updateDashboard(true);
        });
    }

    // 4. On LIVE toggle
    const liveToggle = document.querySelector(".auto-refresh");
    if (liveToggle) {
        liveToggle.addEventListener("click", () => {
            liveToggle.classList.toggle('active');
            window.appState.live = liveToggle.classList.contains('active');
            console.log("State Updated:", window.appState);
            
            if (window.appState.live) {
                if (!liveInterval) {
                   liveInterval = setInterval(() => {
                       updateZoneData();
                       updateDashboard();
                   }, 2500); // every 2.5sec
                }
            } else {
                if (liveInterval) {
                    clearInterval(liveInterval);
                    liveInterval = null;
                }
            }
            updateDashboard();
        });
    }

    window.logState = {
        query: "",
        filter: "all"
    };

    const logSearchInput = document.getElementById("log-search");
    if (logSearchInput) {
        logSearchInput.addEventListener("input", (e) => {
            window.logState.query = e.target.value.toLowerCase();
            console.log("Log State:", window.logState);
        });
    }

    const logFilters = document.querySelectorAll("#log-filters .ctrl-btn");
    logFilters.forEach(btn => {
        btn.addEventListener("click", () => {
            logFilters.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            window.logState.filter = btn.getAttribute("data-filter") || "all";
            console.log("Log State:", window.logState);
            if (typeof updateLogs === 'function') updateLogs();
        });
    });

    window.apiZonesData = [];

    async function fetchLiveAPI() {
        try {
            const res = await fetch('https://crowdai-backend-1007858189738.us-central1.run.app/zones');
            if (res.ok) {
                const data = await res.json();
                window.apiZonesData = data.zones || [];
                const alerts = data.alerts || [];

                if (window.simulator) {
                    if (!window.simulator.targetGrid) {
                        window.simulator.targetGrid = window.simulator.grid.map(col => [...col]);
                    }
                    const cw = window.simulator.cols / 3;
                    const rw = window.simulator.rows / 3;
                    const zoneLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
                    window.apiZonesData.forEach(zData => {
                        const zName = zData.zone.replace('Zone ', '');
                        const zIdx = zoneLetters.indexOf(zName);
                        if (zIdx !== -1) {
                            let tDens = parseInt(zData.load);
                            if (isNaN(tDens)) {
                                if (zData.level === 'LOW') tDens = 20;
                                else if (zData.level === 'BUSY') tDens = 50;
                                else if (zData.level === 'HIGH') tDens = 80;
                                else tDens = 30;
                            }
                            tDens /= 100;
                            
                            const startC = Math.floor((zIdx % 3) * cw);
                            const startR = Math.floor(Math.floor(zIdx / 3) * rw);
                            for (let c = startC; c < startC + cw && c < window.simulator.cols; c++) {
                                for (let r = startR; r < startR + rw && r < window.simulator.rows; r++) {
                                    window.simulator.targetGrid[c][r] = tDens + (Math.random() - 0.5) * 0.15;
                                }
                            }
                        }
                    });
                }

                const alertsList = document.getElementById('alerts-list');
                if (alertsList) {
                    const alertsPanel = alertsList.parentElement;
                    if (alerts.length > 0) {
                        alertsPanel.style.boxShadow = '0 0 15px rgba(255, 0, 60, 0.6)';
                        alertsPanel.style.borderColor = 'rgba(255, 0, 60, 0.8)';
                        alertsList.innerHTML = alerts.map(a => `<div style="color:var(--accent-magenta); padding:8px; border-left:3px solid var(--accent-magenta); background:rgba(255,0,60,0.1); margin-bottom:5px; font-size:12px; font-weight:bold;">${a}</div>`).join('');
                    } else {
                        alertsPanel.style.boxShadow = 'none';
                        alertsPanel.style.borderColor = 'var(--panel-border)';
                        alertsList.innerHTML = '<div style="color:var(--text-muted); padding:5px;">No active alerts.</div>';
                    }
                }
            }
        } catch(e) { console.error('API Error:', e); }
    }

    setInterval(fetchLiveAPI, 5000);
    setTimeout(fetchLiveAPI, 500);

    // 1. Initialize Canvas & Simulator
    const canvas = document.getElementById('crowd-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('map-tooltip');

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 600;

    const simulator = new CrowdSimulator(canvas.width, canvas.height);
    window.simulator = simulator;

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

    // --- Analytics Dashboard Logic ---
    let analyticsTrendData = [['Time', 'Load %']];
    let aBarChart = null, aPieChart = null, aTrendChart = null;

    // Seed empty trend
    for (let i = 5; i >= 1; i--) {
        const t = new Date(Date.now() - i * 5000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        analyticsTrendData.push([t, 40]); 
    }

    function initAnalyticsCharts() {
        if (!aPieChart && document.getElementById('analytics-pie-chart')) aPieChart = new google.visualization.PieChart(document.getElementById('analytics-pie-chart'));
        if (!aTrendChart && document.getElementById('analytics-trend-chart')) aTrendChart = new google.visualization.LineChart(document.getElementById('analytics-trend-chart'));
    }

    function renderCSSBarChart(zonesDataArray) {
        const container = document.getElementById('analytics-bar-chart-container');
        if (!container) return;
        
        const selectedZone = window.appState.selectedZone;
        const showMode = window.appState.showMode;

        if (container.children.length === 0) {
            container.innerHTML = '';
            zonesDataArray.forEach(z => {
                let isActive = (selectedZone === z.zone);
                let opacity = (selectedZone === 'ALL' || isActive) ? 1 : 0.3;
                let activeClass = isActive ? 'active-zone' : '';
                let labelTxt = (showMode === 'level') ? z.level : `${z.val}%`;
                container.innerHTML += `
                    <div class="css-bar-wrapper ${activeClass}" id="bar-wrapper-${z.zone}" style="opacity: ${opacity}; transition: all 0.5s ease;">
                       <div class="bar-tooltip" id="tooltip-${z.zone}">Zone ${z.zone}: ${labelTxt}</div>
                       <div class="css-bar" style="height: 100%;">
                          <div class="css-bar-inner" id="bar-inner-${z.zone}" style="height: ${z.val}%; background: ${z.color}; box-shadow: 0 0 10px ${z.color};"></div>
                       </div>
                       <div class="bar-label">${z.zone}</div>
                    </div>
                `;
            });
        } else {
            zonesDataArray.forEach(z => {
                const wrapper = document.getElementById(`bar-wrapper-${z.zone}`);
                const inner = document.getElementById(`bar-inner-${z.zone}`);
                const tt = document.getElementById(`tooltip-${z.zone}`);
                
                if (wrapper) {
                    let isActive = (selectedZone === z.zone);
                    wrapper.style.opacity = (selectedZone === 'ALL' || isActive) ? 1 : 0.3;
                    if (isActive) wrapper.classList.add('active-zone');
                    else wrapper.classList.remove('active-zone');
                }
                if (inner) {
                    inner.style.height = `${z.val}%`;
                    inner.style.background = z.color;
                    inner.style.boxShadow = `0 0 10px ${z.color}`;
                }
                if (tt) {
                    let labelTxt = (showMode === 'level') ? z.level : `${z.val}%`;
                    tt.innerText = `Zone ${z.zone}: ${labelTxt}`;
                }
            });
        }
    }

    function updateAnalyticsDashboard(forceRedraw = false) {
        if (!window.google || !google.visualization || !document.getElementById('analytics-view')) return;
        
        const isVisible = document.getElementById('analytics-view').style.display !== 'none';
        
        // Push trend data from appState average load
        const totalL = window.appState.zones.reduce((sum, z) => sum + z.load, 0);
        const overall = Math.floor(totalL / window.appState.zones.length);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        if (simulator.frameCount % 120 === 0) {
            analyticsTrendData.push([timeStr, overall]);
            if (analyticsTrendData.length > 6) analyticsTrendData.splice(1, 1);
        }

        if (!isVisible && !forceRedraw) return;

        initAnalyticsCharts();

        let highestZone = 'A', highestVal = -1;
        let lowestZone = 'A', lowestVal = 999;
        let countLow = 0, countBusy = 0, countHigh = 0;
        let activeZonesCount = 0;
        let totalLoad = 0;
        let cssBarsData = [];

        window.appState.zones.forEach(z => {
            const val = z.load;
            totalLoad += val;
            if (val > 40) activeZonesCount++;

            if (val > highestVal) { highestVal = val; highestZone = z.name; }
            if (val < lowestVal) { lowestVal = val; lowestZone = z.name; }

            let color = '#00ff66';
            if (val >= 70) { countHigh++; color = '#ff003c'; }
            else if (val >= 40) { countBusy++; color = '#ffb800'; }
            else { countLow++; }

            cssBarsData.push({zone: z.name, val: val, color: color, level: z.level});
        });

        const avgLoad = Math.floor(totalLoad / window.appState.zones.length);
        const kpiAvg = document.getElementById('kpi-avg-load');
        if (kpiAvg) {
            if (window.appState.showMode === 'level') {
                kpiAvg.innerText = getLevel(avgLoad);
            } else {
                kpiAvg.innerText = avgLoad + '%';
            }
        }

        const kpiActive = document.getElementById('kpi-active-zones');
        if (kpiActive) kpiActive.innerText = activeZonesCount;

        const kpiTrend = document.getElementById('kpi-trend');
        if (kpiTrend) {
            const lastVal = analyticsTrendData.length > 1 ? analyticsTrendData[analyticsTrendData.length - 2][1] : 40;
            const trendDir = avgLoad >= lastVal ? '↑ UP' : '↓ DOWN';
            kpiTrend.innerText = trendDir;
            kpiTrend.style.color = trendDir === '↑ UP' ? 'var(--accent-magenta)' : 'var(--accent-green)';
        }
        
        // 4 & 5. RISK / SAFE CARDS
        const riskEl = document.getElementById('analytics-risk-zone');
        if (riskEl) riskEl.innerText = `Zone ${highestZone} (${highestVal}%)`;
        
        const safeEl = document.getElementById('analytics-safe-zone');
        if (safeEl) safeEl.innerText = `Zone ${lowestZone} (${lowestVal}%)`;

        // 1. BAR CHART (CSS Glass 3D)
        renderCSSBarChart(cssBarsData);

        // 2. PIE CHART (3D Mode)
        if (aPieChart) {
            const pieData = google.visualization.arrayToDataTable([
                ['Level', 'Count'], ['LOW', countLow], ['BUSY', countBusy], ['HIGH', countHigh]
            ]);
            aPieChart.draw(pieData, {
                backgroundColor: 'transparent',
                legend: {position: 'right', textStyle: {color: '#aaa', fontSize: 12}},
                colors: ['#00ff66', '#ffb800', '#ff003c'],
                is3D: true,
                chartArea: {width: '100%', height: '90%', left: 0},
                pieSliceBorderColor: 'transparent',
                tooltip: {trigger: 'selection'}
            });
        }

        // 3. TREND CHART
        if (aTrendChart) {
            const trendData = google.visualization.arrayToDataTable(analyticsTrendData);
            aTrendChart.draw(trendData, {
                backgroundColor: 'transparent',
                legend: {position: 'none'},
                colors: ['#00f0ff'],
                hAxis: {textStyle: {color: '#aaa', fontSize: 10}},
                vAxis: {textStyle: {color: '#aaa'}, minValue: 0, maxValue: 100, gridlines: {color: 'rgba(255,255,255,0.05)'}},
                chartArea: {width: '95%', height: '70%', left: 40},
                curveType: 'function',
                lineWidth: 3,
                pointSize: 6,
                pointShape: 'circle',
                animation: {duration: 400, easing: 'out'}
            });
        }
    }

    // --- Smart Logs Engine ---
    const smartLogsTimeline = [];
    let lastAlertTime = 0;

    function addSmartLog(title, desc, type) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        smartLogsTimeline.unshift({ time: timeStr, title, desc, type });
        if (smartLogsTimeline.length > 50) smartLogsTimeline.pop();
        renderSmartLogs();
    }

    function renderSmartLogs() {
        const container = document.getElementById('smart-logs-timeline');
        if (!container) return;
        
        // Render all logs in timeline with data-type attribute
        let html = '';
        smartLogsTimeline.forEach(log => {
            let tagColor = log.type === 'alert' ? '#ff003c' : (log.type === 'resolved' ? '#00ff66' : '#00f0ff');
            
            html += `
              <div class="log-entry" data-type="${log.type}" style="border-left: 3px solid ${tagColor};">
                  <div class="log-marker" style="border-color: ${tagColor};"></div>
                  <div class="log-header">
                      <span class="log-time">${log.time}</span>
                      <span class="log-tag" style="background: rgba(${log.type==='alert'?'255,0,60':(log.type==='resolved'?'0,255,102':'0,240,255')}, 0.2); color: ${tagColor};">${log.type.toUpperCase()}</span>
                  </div>
                  <div class="log-title">${log.title}</div>
                  <div class="log-desc">${log.desc}</div>
              </div>
            `;
        });
        container.innerHTML = html;
        updateLogs(); // Apply current filters after render
    }

    function updateLogs() {
        const entries = document.querySelectorAll('.log-entry');
        const query = window.logState.query || "";
        const filter = window.logState.filter || "all";

        entries.forEach(entry => {
            let type = entry.getAttribute('data-type');
            
            // Fallback: detect type via color if attribute is missing
            if (!type) {
                const borderCol = entry.style.borderLeftColor || "";
                if (borderCol.includes('255, 0, 60') || borderCol.includes('ff003c')) type = "alert";
                else if (borderCol.includes('0, 255, 102') || borderCol.includes('00ff66')) type = "resolved";
                else type = "info";
                
                entry.setAttribute("data-type", type);
            }

            const text = entry.innerText.toLowerCase();
            
            // SEARCH FILTER
            const matchesSearch = text.includes(query);
            
            // TYPE FILTER
            const matchesType = (filter === "all" || type === filter || (filter === "alerts" && type === "alert"));

            if (matchesSearch && matchesType) {
                entry.style.display = "block";
            } else {
                entry.style.display = "none";
            }
        });
    }

    document.querySelectorAll('#log-filters .ctrl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#log-filters .ctrl-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.logState.filter = btn.getAttribute('data-filter') || "all";
            console.log("Log State:", window.logState);
            updateLogs();
        });
    });

    const lSearch = document.getElementById('log-search');
    if (lSearch) {
        lSearch.addEventListener('input', (e) => {
            window.logState.query = e.target.value.toLowerCase();
            console.log("Log State:", window.logState);
            updateLogs();
        });
    }

    addSmartLog('System Initiated', 'Pathfinder algorithms deployed. AI routing operational.', 'info');

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

            // Show Predicted Load
            const apiZone = (window.apiZonesData || []).find(z => z.zone === `Zone ${label}` || z.zone === label);
            if (apiZone && apiZone.predicted) {
                 ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
                 ctx.fillText(`Next: ${apiZone.predicted}`, cx, cy + 20);
            }
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

        if (simulator.frameCount % 120 === 0) {
            updateAnalyticsDashboard();

            // Check for smart logs threshold automations
            if (window.simulator.overallLoad > 75 && Date.now() - lastAlertTime > 20000) { 
                addSmartLog('High Congestion Alert', `System-wide capacity exceeded ${Math.floor(window.simulator.overallLoad)}%.`, 'alert');
                lastAlertTime = Date.now();
            } else if (window.simulator.overallLoad < 40 && Date.now() - lastAlertTime > 20000 && smartLogsTimeline[0]?.type === 'alert') {
                addSmartLog('Load Neutralized', `Capacity parameters returned to nominal thresholds.`, 'resolved');
                lastAlertTime = Date.now();
            }
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
                if (target === 'analytics') updateAnalyticsDashboard(true);
            }
        });
    });

    // Settings Live Integrations
    // Debounced update for settings
    const debouncedSettingsUpdate = debounce(() => {
        safeLog(window.settingsState);
    }, 150);

    const setDensity = document.getElementById('set-density');
    const lblDensity = document.getElementById('label-density');
    if (setDensity && lblDensity) {
        setDensity.addEventListener('input', () => { 
            // Immediate UI feedback
            lblDensity.innerText = parseFloat(setDensity.value).toFixed(1) + 'x'; 
            // Debounced State Update
            window.settingsState.densityMultiplier = parseFloat(setDensity.value);
            debouncedSettingsUpdate();
        });
    }

    const setAi = document.getElementById('set-ai');
    const lblAi = document.getElementById('label-ai');
    if (setAi && lblAi) {
        setAi.addEventListener('input', () => { 
            // Immediate UI feedback
            lblAi.innerText = setAi.value + '%'; 
            // Debounced State Update
            window.settingsState.aiAggressiveness = parseInt(setAi.value);
            debouncedSettingsUpdate();
        });
    }

    // Toggle Bindings
    const tReroute = document.getElementById('toggle-reroute');
    if (tReroute) {
        tReroute.addEventListener('change', () => {
            if (window.settingsState.autoRerouting !== tReroute.checked) {
                window.settingsState.autoRerouting = tReroute.checked;
                safeLog(window.settingsState);
            }
        });
    }

    const tAlerts = document.getElementById('toggle-alerts');
    if (tAlerts) {
        tAlerts.addEventListener('change', () => {
            if (window.settingsState.systemAlerts !== tAlerts.checked) {
                window.settingsState.systemAlerts = tAlerts.checked;
                safeLog(window.settingsState);
            }
        });
    }

    const tPredict = document.getElementById('toggle-predict');
    if (tPredict) {
        tPredict.addEventListener('change', () => {
            if (window.settingsState.predictions !== tPredict.checked) {
                window.settingsState.predictions = tPredict.checked;
                safeLog(window.settingsState);
            }
        });
    }

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        try {
            localStorage.setItem("routegen_settings", JSON.stringify(window.settingsState));
            console.log("Settings saved successfully:", window.settingsState);

             const t = document.createElement('div');
             t.className = 'toast-popup show';
             t.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg> 
                Settings Applied & Saved Successfully`;
             t.style.background = 'rgba(0, 240, 255, 0.9)';
             t.style.borderColor = '#00f0ff';
             t.style.color = '#000';
             document.body.appendChild(t);
             setTimeout(() => t.remove(), 3000);
        } catch (e) {
            console.error("Save Error:", e);
        }
    });

    function applySettingsToUI() {
        const s = window.settingsState;
        
        // Sliders
        const setDensity = document.getElementById('set-density');
        const lblDensity = document.getElementById('label-density');
        if (setDensity && lblDensity) {
            setDensity.value = s.densityMultiplier;
            lblDensity.innerText = parseFloat(s.densityMultiplier).toFixed(1) + 'x';
        }

        const setAi = document.getElementById('set-ai');
        const lblAi = document.getElementById('label-ai');
        if (setAi && lblAi) {
            setAi.value = s.aiAggressiveness;
            lblAi.innerText = s.aiAggressiveness + '%';
        }

        // Toggles
        const tReroute = document.getElementById('toggle-reroute');
        if (tReroute) tReroute.checked = s.autoRerouting;

        const tAlerts = document.getElementById('toggle-alerts');
        if (tAlerts) tAlerts.checked = s.systemAlerts;

        const tPredict = document.getElementById('toggle-predict');
        if (tPredict) tPredict.checked = s.predictions;

        // Mode Buttons
        const modeIdMap = { "normal": "set-btn-normal", "emergency": "set-btn-emergency", "vip": "set-btn-vip" };
        const activeId = modeIdMap[s.mode] || "set-btn-normal";
        document.getElementById(activeId)?.click(); // Trigger click to sync all logic
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem("routegen_settings");
            if (saved) {
                const data = JSON.parse(saved);
                window.settingsState = { ...window.settingsState, ...data };
                console.log("Settings Loaded:", window.settingsState);
                applySettingsToUI();
            }
        } catch (e) {
            console.error("Load Error:", e);
        }
    }

    // Initial Load
    loadSettings();

    const modeBtns = ['set-btn-normal', 'set-btn-emergency', 'set-btn-vip'];
    modeBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
           btn.addEventListener('click', () => {
               modeBtns.forEach(b => document.getElementById(b)?.classList.remove('active'));
               btn.classList.add('active');
               
               // Update global state via new hook
               const newMode = id === 'set-btn-normal' ? 'normal' : (id === 'set-btn-emergency' ? 'emergency' : 'vip');
               if (window.settingsState.mode !== newMode) {
                   window.setMode(newMode);
               }

               // Handle logical side-effects
               if (id==='set-btn-normal') {
                   window.simulator.setScenario('Normal');
               }
               if (id==='set-btn-emergency') {
                   window.simulator.setScenario('Evacuation');
                   // Increase aggressiveness slightly as requested
                   window.settingsState.aiAggressiveness = Math.min(100, window.settingsState.aiAggressiveness + 10);
                   const setAi = document.getElementById('set-ai');
                   const lblAi = document.getElementById('label-ai');
                   if (setAi && lblAi) {
                       setAi.value = window.settingsState.aiAggressiveness;
                       lblAi.innerText = setAi.value + '%';
                   }
               }
               if (id==='set-btn-vip') {
                   window.simulator.setScenario('Flashmob'); 
                   // Ensure VIP pathing is prioritized
                   window.simulator.userRole = 'VIP';
               } else {
                   window.simulator.userRole = 'Guest';
               }
               
               // Sync with identical side-panel buttons visually
               const sideMap = {'set-btn-normal': 'btn-normal', 'set-btn-emergency': 'btn-evac', 'set-btn-vip': 'btn-flashmob'};
               ['btn-normal', 'btn-flashmob', 'btn-evac'].forEach(bid => document.getElementById(bid)?.classList.remove('active'));
               document.getElementById(sideMap[id])?.classList.add('active');
           });
        }
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