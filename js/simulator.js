// Physics and Data Engine - Smart Navigation System
class CrowdSimulator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.gridSize = 40;
    this.cols = Math.ceil(this.width / this.gridSize);
    this.rows = Math.ceil(this.height / this.gridSize);

    // Density Grids — start neutral (0.2–0.5 range, not full random)
    this.grid = [];
    this.displayGrid = [];
    for (let c = 0; c < this.cols; c++) {
      this.grid[c] = [];
      this.displayGrid[c] = [];
      for (let r = 0; r < this.rows; r++) {
        const val = 0.2 + Math.random() * 0.35;
        this.grid[c][r] = val;
        this.displayGrid[c][r] = val;
      }
    }

    // Fewer, cleaner particles (was 150)
    this.particles = [];
    for (let i = 0; i < 55; i++) {
      this.particles.push(this._createParticle());
    }

    this.aiPath = [];
    this.scenario = 'Normal';
    this.userRole = 'Guest';
    this.overallLoad = 0;
    this.frameCount = 0;

    // Compute initial smart path
    this.computeAIPath();
  }

  _createParticle() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 1.0,
      vy: (Math.random() - 0.5) * 1.0,
      life: 60 + Math.random() * 120
    };
  }

  /**
   * Dijkstra pathfinding on the density grid.
   * Cost = movement cost + density penalty (avoids red zones).
   * Runs from top-left to bottom-right.
   */
  computeAIPath() {
    const end = { c: this.cols - 1, r: this.rows - 1 };
    const key = (c, r) => c * 200 + r;

    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    const queue = [[0, 0, 0]]; // [cost, c, r]
    dist.set(key(0, 0), 0);

    let iterations = 0;
    while (queue.length > 0 && iterations < 3000) {
      iterations++;

      // Find minimum-cost node (simple linear scan — grid is small)
      let minI = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i][0] < queue[minI][0]) minI = i;
      }
      const [cost, c, r] = queue.splice(minI, 1)[0];
      const k = key(c, r);
      if (visited.has(k)) continue;
      visited.add(k);

      if (c === end.c && r === end.r) break;

      // 8-directional neighbors
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
          const nk = key(nc, nr);
          if (visited.has(nk)) continue;
          const moveCost = (dc !== 0 && dr !== 0) ? 1.414 : 1;
          const density = this.grid[nc]?.[nr] ?? 0.5;
          // AI Aggressiveness (1-100)
          // Higher aggressiveness = lower density penalty (takes riskier/faster paths)
          const aggFactor = window.settingsState ? (105 - window.settingsState.aiAggressiveness) / 10 : 10;
          const newCost = cost + moveCost + density * aggFactor;
          if (!dist.has(nk) || newCost < dist.get(nk)) {
            dist.set(nk, newCost);
            prev.set(nk, { c, r });
            queue.push([newCost, nc, nr]);
          }
        }
      }
    }

    // Reconstruct path and downsample to ~8 waypoints
    const path = [];
    let cur = { c: end.c, r: end.r };
    for (let safety = 0; safety < 500 && cur; safety++) {
      path.unshift(cur);
      const p = prev.get(key(cur.c, cur.r));
      if (!p || (p.c === cur.c && p.r === cur.r)) break;
      cur = p;
    }

    if (path.length > 1) {
      const step = Math.max(1, Math.floor(path.length / 8));
      this.aiPath = path
        .filter((_, i) => i % step === 0 || i === path.length - 1)
        .map(({ c, r }) => ({
          x: c * this.gridSize + this.gridSize / 2,
          y: r * this.gridSize + this.gridSize / 2
        }));
    }
  }

  update() {
    this.frameCount++;

    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        if (this.targetGrid && this.targetGrid[c] && this.targetGrid[c][r] !== undefined) {
             this.grid[c][r] += (this.targetGrid[c][r] - this.grid[c][r]) * 0.05;
        }

        // Scale drift and scenario intensity by densityMultiplier
        const dMult = window.settingsState ? window.settingsState.densityMultiplier : 1.0;
        this.grid[c][r] += (Math.random() - 0.5) * 0.015 * dMult;

        if (this.scenario === 'Flashmob') {
          const distToCenter = Math.sqrt(
            Math.pow(c - this.cols / 2, 2) + Math.pow(r - this.rows / 2, 2)
          );
          if (distToCenter < 4) this.grid[c][r] += 0.015 * dMult;
        } else if (this.scenario === 'Evacuation') {
          this.grid[c][r] -= 0.007 * dMult;
        }

        this.grid[c][r] = Math.max(0, Math.min(1, this.grid[c][r]));
        // Smooth display interpolation
        this.displayGrid[c][r] += (this.grid[c][r] - this.displayGrid[c][r]) * 0.07;
      }
    }

    // Particle update — flow away from dense zones
    this.particles.forEach(p => {
      const c = Math.floor(p.x / this.gridSize);
      const r = Math.floor(p.y / this.gridSize);
      const density = this.grid[c]?.[r] ?? 0;
      if (density > 0.65) {
        p.vx += (Math.random() - 0.5) * 0.3;
        p.vy += (Math.random() - 0.5) * 0.3;
      }
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.4;
      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height || p.life <= 0) {
        Object.assign(p, this._createParticle());
      }
    });

    // Recompute smart path every 2 seconds (~120 frames)
    if (this.frameCount % 120 === 0) {
      this.computeAIPath();
    }

    // Overall load
    let total = 0;
    this.displayGrid.forEach(col => col.forEach(val => (total += val)));
    this.overallLoad = Math.floor((total / (this.cols * this.rows)) * 100);
  }

  getZoneMetrics() {
    const zones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const cw = this.cols / 3;
    const rw = this.rows / 3;
    const metrics = {};

    zones.forEach((z, i) => {
      const startC = Math.floor((i % 3) * cw);
      const startR = Math.floor(Math.floor(i / 3) * rw);
      let zoneSum = 0, count = 0;
      for (let c = startC; c < startC + cw && c < this.cols; c++) {
        for (let r = startR; r < startR + rw && r < this.rows; r++) {
          zoneSum += this.grid[c][r];
          count++;
        }
      }
      metrics[z] = Math.floor((zoneSum / count) * 100);
    });
    return metrics;
  }

  setScenario(name) {
    this.scenario = name;
    // Immediately recompute path for new scenario
    if (this.frameCount > 0) this.computeAIPath();
  }

  toggleVIP() {
    this.userRole = this.userRole === 'Guest' ? 'VIP' : 'Guest';
  }

  getDensityStatus() {
    const metrics = this.getZoneMetrics();
    const congestedZones = Object.entries(metrics)
      .filter(([, density]) => density > 70)
      .map(([zone]) => zone);

    return {
      overallLoad: this.overallLoad,
      isEmergency: this.overallLoad > 70 || this.scenario === 'Evacuation',
      congestedZones: congestedZones.length > 0 ? congestedZones.join(', ') : 'None',
      userDensity: Math.floor((this.grid[Math.floor(this.cols / 2)]?.[Math.floor(this.rows / 2)] ?? 0) * 100),
      scenario: this.scenario,
      userRole: this.userRole
    };
  }
}

window.CrowdSimulator = CrowdSimulator;
