/* Futsal Asia Pro — renderer Canvas 2D (top-down semi-3D) */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const { W, H, GY0, GY1, GH, PR } = FG.C;
  const PPM = 36, M = 2.6;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * k))); g = Math.max(0, Math.min(255, Math.round(g * k))); b = Math.max(0, Math.min(255, Math.round(b * k)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }

  class Renderer {
    constructor(canvas) {
      this.c = canvas; this.g = canvas.getContext('2d');
      this.cam = { x: W / 2, y: H / 2 }; this.zoom = 15; this.parts = []; this.trail = [];
      this.pitch = this.buildPitch(false); this.pitchSide = this.buildPitch(true); this.stands = this.buildStands();
      this.mode = 'side'; this.sc = { x: W / 2, y: H / 2 };
      this.localTeam = 0; this.lastBall = null;
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.c.getBoundingClientRect();
      this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height);
      this.c.width = Math.round(this.cw * dpr); this.c.height = Math.round(this.ch * dpr);
      this.dpr = dpr;
    }
    buildPitch(side) {
      const cv = document.createElement('canvas');
      cv.width = (W + 2 * M) * PPM; cv.height = (H + 2 * M) * PPM;
      const g = cv.getContext('2d'), X = (v) => (v + M) * PPM;
      // arena
      g.fillStyle = '#0a1628'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#10223b'; g.fillRect(X(-1.6), X(-1.6), (W + 3.2) * PPM, (H + 3.2) * PPM);
      // court floor
      const grd = g.createLinearGradient(0, X(0), 0, X(H));
      grd.addColorStop(0, '#2378c4'); grd.addColorStop(0.5, '#1f6db3'); grd.addColorStop(1, '#2378c4');
      g.fillStyle = grd; g.fillRect(X(0), X(0), W * PPM, H * PPM);
      // planks
      for (let i = 0; i < H * 4; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
        g.fillRect(X(0), X(i * 0.25), W * PPM, 0.25 * PPM);
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(X(Math.random() * W), X(Math.floor(Math.random() * H * 4) * 0.25), (0.6 + Math.random() * 2.5) * PPM, 1);
      }
      // penalty areas (orange)
      const area = (gx) => {
        const s = gx === 0 ? 1 : -1;
        g.beginPath();
        g.moveTo(X(gx), X(GY0 - 6));
        if (s > 0) { g.arc(X(0), X(GY0), 6 * PPM, -Math.PI / 2, 0); g.lineTo(X(6), X(GY1)); g.arc(X(0), X(GY1), 6 * PPM, 0, Math.PI / 2); }
        else { g.arc(X(W), X(GY0), 6 * PPM, -Math.PI / 2, -Math.PI, true); g.lineTo(X(W - 6), X(GY1)); g.arc(X(W), X(GY1), 6 * PPM, Math.PI, Math.PI / 2, true); }
        g.closePath();
      };
      g.fillStyle = 'rgba(240,128,40,0.92)'; area(0); g.fill(); area(W); g.fill();
      g.beginPath(); g.arc(X(W / 2), X(H / 2), 3 * PPM, 0, Math.PI * 2); g.fill();
      // logo
      g.save(); g.globalAlpha = 0.16; g.fillStyle = '#ffffff'; g.font = '900 ' + 1.1 * PPM + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('FUTSAL ASIA PRO', X(W / 2), X(H / 2)); g.restore();
      // lines
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.08 * PPM; g.lineJoin = 'round';
      g.strokeRect(X(0), X(0), W * PPM, H * PPM);
      g.beginPath(); g.moveTo(X(W / 2), X(0)); g.lineTo(X(W / 2), X(H)); g.stroke();
      g.beginPath(); g.arc(X(W / 2), X(H / 2), 3 * PPM, 0, Math.PI * 2); g.stroke();
      area(0); g.stroke(); area(W); g.stroke();
      const spot = (x, y, r) => { g.beginPath(); g.arc(X(x), X(y), r * PPM, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); };
      spot(W / 2, H / 2, 0.12); spot(6, H / 2, 0.1); spot(W - 6, H / 2, 0.1); spot(10, H / 2, 0.1); spot(W - 10, H / 2, 0.1);
      // 5m marks right/left of second penalty spot
      for (const x of [10, W - 10]) for (const dy of [-5, 5]) spot(x, H / 2 + dy, 0.06);
      // corner arcs
      for (const [cx, cy, a0] of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) { g.beginPath(); g.arc(X(cx), X(cy), 0.25 * PPM, a0, a0 + Math.PI / 2); g.stroke(); }
      // substitution zones
      g.lineWidth = 0.06 * PPM;
      for (const x of [W / 2 - 10, W / 2 - 5, W / 2 + 5, W / 2 + 10]) { g.beginPath(); g.moveTo(X(x), X(H - 0.4)); g.lineTo(X(x), X(H + 0.4)); g.stroke(); }
      if (side) return cv;
      // nets
      for (const gx of [0, W]) {
        const s = gx === 0 ? -1 : 1;
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(Math.min(X(gx), X(gx + s * 1)), X(GY0), PPM, (GY1 - GY0) * PPM);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(X(gx), X(GY0 + i * 0.3)); g.lineTo(X(gx + s), X(GY0 + i * 0.3)); g.stroke(); }
        for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(X(gx + s * i * 0.25), X(GY0)); g.lineTo(X(gx + s * i * 0.25), X(GY1)); g.stroke(); }
      }
      // advertising boards
      const ads = ['LIGA FUTSAL ASIA', 'FAIR PLAY', 'FUTSAL ASIA PRO', 'RESPECT', 'LIGA FUTSAL ASIA'];
      g.font = '800 ' + 0.55 * PPM + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 5; i++) {
        const x0 = 1 + i * 7.8;
        for (const y0 of [-1.5, H + 0.75]) {
          g.fillStyle = i % 2 ? '#c81e3a' : '#121c2e'; g.fillRect(X(x0), X(y0), 7.2 * PPM, 0.75 * PPM);
          g.fillStyle = '#ffffff'; g.fillText(ads[i], X(x0 + 3.6), X(y0 + 0.38));
        }
      }
      // benches
      g.fillStyle = '#26364f';
      g.fillRect(X(W / 2 - 13), X(H + 1.7), 6 * PPM, 0.6 * PPM); g.fillRect(X(W / 2 + 7), X(H + 1.7), 6 * PPM, 0.6 * PPM);
      return cv;
    }
    setZoom(z) { this.zoom = z; }
    scale() {
      const portrait = this.ch > this.cw;
      return portrait ? this.cw / (this.zoom * 0.72) : this.ch / this.zoom;
    }
    draw(v, cfg, dt, local) {
      if (!v) return;
      if (this.mode === 'side') return this.drawSide(v, cfg, dt, local);
      const g = this.g, s = this.scale();
      this.localTeam = local;
      // camera
      const bx = v.b[0], by = v.b[1];
      let tx = bx, ty = by;
      if (this.lastBall && dt > 0) { const vx = (bx - this.lastBall[0]) / dt, vy = (by - this.lastBall[1]) / dt; if (Math.abs(vx) < 40) { tx += vx * 0.25; ty += vy * 0.15; } }
      this.lastBall = [bx, by];
      const vw = this.cw / s, vh = this.ch / s;
      const clampC = (c, view, size) => (view >= size + 4 ? size / 2 : Math.max(view / 2 - 2, Math.min(size - view / 2 + 2, c)));
      const k = Math.min(1, dt * 3.2);
      this.cam.x += (clampC(tx, vw, W) - this.cam.x) * k; this.cam.y += (clampC(ty, vh, H) - this.cam.y) * k;
      if (v.cut) { this.cam.x = clampC(tx, vw, W); this.cam.y = clampC(ty, vh, H); }
      let sx = 0, sy = 0;
      if (v.sh > 0) { sx = (Math.random() - 0.5) * v.sh * 10; sy = (Math.random() - 0.5) * v.sh * 10; }
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#0a1628'; g.fillRect(0, 0, this.cw, this.ch);
      const ox = this.cw / 2 - this.cam.x * s + sx, oy = this.ch / 2 - this.cam.y * s + sy;
      this.S = (x, y, z) => [ox + x * s, oy + y * s - (z || 0) * s * 0.75];
      g.imageSmoothingEnabled = true;
      g.drawImage(this.pitch, ox - M * s, oy - M * s, (W + 2 * M) * s, (H + 2 * M) * s);

      // shadows + players sorted by y
      const list = v.p.map((q, i) => ({ q, i })).filter((o) => !(o.q[5] & 16)).sort((a, b) => a.q[1] - b.q[1]);
      // ball shadow
      const [bsx, bsy] = this.S(v.b[0], v.b[1], 0);
      g.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.35 - v.b[2] * 0.08) + ')';
      g.beginPath(); g.ellipse(bsx + v.b[2] * s * 0.12, bsy + 1, 0.13 * s * (1 + v.b[2] * 0.15), 0.08 * s, 0, 0, Math.PI * 2); g.fill();
      // trail
      this.trail.push([v.b[0], v.b[1], v.b[2]]); if (this.trail.length > 8) this.trail.shift();
      if (this.trail.length > 2) {
        const a = this.trail[0], b = this.trail[this.trail.length - 1];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.6) {
          g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 0.12 * s; g.lineCap = 'round'; g.beginPath();
          this.trail.forEach((t, i) => { const p = this.S(t[0], t[1], t[2]); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
        }
      }
      let ballDrawn = false;
      for (const o of list) {
        if (!ballDrawn && o.q[1] > v.b[1] + 0.05) { this.drawBall(v.b, s); ballDrawn = true; }
        this.drawPlayer(o.q, o.i, cfg, s, v);
      }
      if (!ballDrawn) this.drawBall(v.b, s);
      // goal frames (front)
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.1 * s; g.lineCap = 'round';
      for (const gx of [0, W]) {
        const d = gx === 0 ? -1 : 1;
        const p0 = this.S(gx, GY0, 0), p1 = this.S(gx, GY1, 0), b0 = this.S(gx + d * 1, GY0, 0), b1 = this.S(gx + d * 1, GY1, 0);
        const t0 = this.S(gx, GY0, GH), t1 = this.S(gx, GY1, GH);
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.05 * s;
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.11 * s;
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
        for (let i = 1; i < 6; i++) { const a = this.S(gx, GY0 + i * 0.5, 0), b = this.S(gx, GY0 + i * 0.5, GH); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      }
      // particles
      this.parts = this.parts.filter((p) => (p.t -= dt) > 0);
      for (const p of this.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 6 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.9; p.vy *= 0.9; }
        const q = this.S(p.x, p.y, p.z); g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.t); g.fillRect(q[0], q[1], 0.12 * s, 0.07 * s); g.globalAlpha = 1;
      }
      this.drawRadar(v, cfg);
      if (v.rp) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, this.cw, 4); g.fillRect(0, this.ch - 4, this.cw, 4);
        g.font = '900 16px system-ui'; g.fillStyle = '#ffd23f'; g.textAlign = 'left'; g.fillText('● REPLAY', 16, this.ch - 22);
      }
    }
    confetti(x, kits) {
      for (let i = 0; i < 120; i++) this.parts.push({ x, y: H / 2 + (Math.random() - 0.5) * 3, z: 1 + Math.random(), vx: (x < W / 2 ? 1 : -1) * (2 + Math.random() * 7), vy: (Math.random() - 0.5) * 9, vz: 2 + Math.random() * 5, t: 2 + Math.random() * 1.5, c: Math.random() < 0.5 ? kits[0] : kits[1] });
    }
    drawBall(bv, s) {
      const g = this.g, [x, y] = this.S(bv[0], bv[1], bv[2]);
      const r = 0.13 * s * (1 + bv[2] * 0.12);
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c9d2dc');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8b400';
      const rot = bv[3];
      for (let i = 0; i < 3; i++) { const a = rot + (i * Math.PI * 2) / 3; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    drawPlayer(q, i, cfg, s, v) {
      const g = this.g;
      const team = i < 5 ? 0 : 1, T = cfg.teams[team], r = T.roster[q[4]] || T.roster[0];
      const isGK = i % 5 === 0;
      const kit = isGK ? T.gk : T.kit;
      const [x, y] = this.S(q[0], q[1], 0);
      const f = q[2], fl = q[5], down = fl & 4;
      const R = PR * s;
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + R * 0.25, y + R * 0.35, R * 1.05, R * 0.6, 0, 0, Math.PI * 2); g.fill();
      // control cursor
      if (fl & 2) {
        const mine = team === this.localTeam;
        g.strokeStyle = mine ? '#22e3ff' : '#ffd23f'; g.lineWidth = Math.max(2, 0.07 * s);
        g.beginPath(); g.ellipse(x, y + R * 0.3, R * 1.35, R * 0.8, 0, 0, Math.PI * 2); g.stroke();
        g.fillStyle = g.strokeStyle; g.beginPath();
        g.moveTo(x + Math.cos(f) * R * 1.9, y + R * 0.3 + Math.sin(f) * R * 1.2);
        g.lineTo(x + Math.cos(f + 0.35) * R * 1.4, y + R * 0.3 + Math.sin(f + 0.35) * R * 0.9);
        g.lineTo(x + Math.cos(f - 0.35) * R * 1.4, y + R * 0.3 + Math.sin(f - 0.35) * R * 0.9); g.fill();
      }
      g.save(); g.translate(x, y); g.rotate(f);
      // legs
      const ph = q[3] * 3.2, sw = down ? 0 : Math.sin(ph) * R * 0.55;
      g.fillStyle = '#121212';
      if (down) { g.fillRect(R * 0.3, -R * 0.35, R * 1.0, R * 0.22); g.fillRect(R * 0.3, R * 0.13, R * 1.0, R * 0.22); }
      else { g.beginPath(); g.ellipse(sw, -R * 0.3, R * 0.32, R * 0.17, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(-sw, R * 0.3, R * 0.32, R * 0.17, 0, 0, Math.PI * 2); g.fill(); }
      // torso
      const bodyL = down ? 1.15 : 0.62;
      g.fillStyle = kit[0];
      g.beginPath(); g.ellipse(0, 0, R * bodyL, R, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = shade(kit[0], 0.7); g.lineWidth = Math.max(1, s * 0.03); g.stroke();
      g.fillStyle = kit[1];
      g.beginPath(); g.ellipse(0, -R * 0.82, R * 0.32, R * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(0, R * 0.82, R * 0.32, R * 0.2, 0, 0, Math.PI * 2); g.fill();
      // head
      g.fillStyle = r.skin; g.beginPath(); g.arc(R * 0.05, 0, R * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = r.hair; g.beginPath();
      const hs = r.hs;
      if (hs === 1) g.arc(R * 0.0, 0, R * 0.38, Math.PI * 0.6, Math.PI * 1.4);
      else if (hs === 2) { g.arc(-R * 0.05, 0, R * 0.42, Math.PI * 0.45, Math.PI * 1.55); }
      else if (hs === 4) { g.arc(-R * 0.02, 0, R * 0.47, Math.PI * 0.35, Math.PI * 1.65); }
      else g.arc(-R * 0.04, 0, R * 0.43, Math.PI * 0.5, Math.PI * 1.5);
      g.fill();
      g.restore();
      // number
      if (s > 22) {
        g.font = '800 ' + Math.round(R * 0.62) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = lum(kit[0]) > 0.6 ? '#111' : '#fff';
        g.fillText(r.num, x, y + R * 1.05);
      }
      if (fl & 64) { g.fillStyle = '#ffd400'; g.fillRect(x + R * 0.8, y - R * 1.3, R * 0.3, R * 0.42); }
      if (fl & 2) {
        const mine = team === this.localTeam;
        g.font = '700 ' + Math.max(10, Math.round(s * 0.3)) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        const nm = r.name.split(' ').slice(-1)[0];
        const tw = g.measureText(nm).width + 10;
        g.fillStyle = 'rgba(5,12,24,0.72)'; g.fillRect(x - tw / 2, y - R * 2.6, tw, Math.max(13, s * 0.38));
        g.fillStyle = mine ? '#22e3ff' : '#ffd23f'; g.fillText(nm, x, y - R * 2.6 + Math.max(13, s * 0.38) - 1);
        // stamina
        const st = q[6] / 100;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - R, y - R * 1.55, R * 2, 3);
        g.fillStyle = st > 0.5 ? '#3ddc84' : st > 0.25 ? '#ffc107' : '#ff4d4d'; g.fillRect(x - R, y - R * 1.55, R * 2 * st, 3);
        const ch = v.ch[team];
        if (ch > 0) {
          g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - R * 1.4, y + R * 1.7, R * 2.8, 6);
          const cg = g.createLinearGradient(x - R * 1.4, 0, x + R * 1.4, 0); cg.addColorStop(0, '#3ddc84'); cg.addColorStop(0.7, '#ffc107'); cg.addColorStop(1, '#ff3b3b');
          g.fillStyle = cg; g.fillRect(x - R * 1.4, y + R * 1.7, R * 2.8 * ch, 6);
        }
      }
    }
    drawRadar(v, cfg) {
      const g = this.g, w = Math.min(this.ch < 520 ? 120 : 160, this.cw * 0.28), h = w / 2, x0 = this.cw / 2 - w / 2, y0 = this.ch - h - 10;
      if (this.ch < 300) return;
      g.globalAlpha = 0.8; g.fillStyle = 'rgba(6,14,28,0.45)'; g.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(x0, y0, w, h);
      g.beginPath(); g.moveTo(x0 + w / 2, y0); g.lineTo(x0 + w / 2, y0 + h); g.stroke();
      const k = w / W;
      v.p.forEach((q, i) => {
        if (q[5] & 16) return;
        const T = cfg.teams[i < 5 ? 0 : 1];
        g.fillStyle = q[5] & 2 ? (i < 5 === (this.localTeam === 0) ? '#22e3ff' : '#ffd23f') : T.kit[0];
        g.beginPath(); g.arc(x0 + q[0] * k, y0 + q[1] * k, q[5] & 2 ? 3.5 : 2.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
      });
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + v.b[0] * k, y0 + v.b[1] * k, 2.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }
  }

  // small avatar for player cards
  FG.drawAvatar = function (cv, r, kit) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    g.fillStyle = kit[0];
    g.beginPath(); g.moveTo(cx - w * 0.42, h); g.quadraticCurveTo(cx - w * 0.42, h * 0.62, cx - w * 0.18, h * 0.6); g.lineTo(cx + w * 0.18, h * 0.6); g.quadraticCurveTo(cx + w * 0.42, h * 0.62, cx + w * 0.42, h); g.fill();
    g.fillStyle = kit[1]; g.fillRect(cx - w * 0.42, h * 0.86, w * 0.12, h * 0.14); g.fillRect(cx + w * 0.3, h * 0.86, w * 0.12, h * 0.14);
    g.beginPath(); g.moveTo(cx - w * 0.1, h * 0.6); g.lineTo(cx, h * 0.7); g.lineTo(cx + w * 0.1, h * 0.6); g.fill();
    g.fillStyle = r.skin; g.fillRect(cx - w * 0.07, h * 0.5, w * 0.14, h * 0.12);
    g.beginPath(); g.ellipse(cx, h * 0.38, w * 0.17, h * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = r.hair; g.beginPath();
    if (r.hs === 1) g.ellipse(cx, h * 0.25, w * 0.16, h * 0.06, 0, Math.PI, 0);
    else if (r.hs === 2) { for (let i = -2; i <= 2; i++) { g.moveTo(cx + i * w * 0.07 - w * 0.04, h * 0.27); g.lineTo(cx + i * w * 0.07, h * 0.12); g.lineTo(cx + i * w * 0.07 + w * 0.04, h * 0.27); } }
    else if (r.hs === 3) { g.ellipse(cx - w * 0.03, h * 0.25, w * 0.19, h * 0.1, -0.2, Math.PI, 0); }
    else if (r.hs === 4) { g.ellipse(cx, h * 0.27, w * 0.2, h * 0.14, 0, Math.PI, 0); }
    else g.ellipse(cx, h * 0.26, w * 0.18, h * 0.09, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#111'; g.fillRect(cx - w * 0.07, h * 0.37, w * 0.03, h * 0.03); g.fillRect(cx + w * 0.04, h * 0.37, w * 0.03, h * 0.03);
    g.font = '900 ' + Math.round(h * 0.2) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lum(kit[0]) > 0.6 ? '#111' : '#fff'; g.fillText(r.num, cx, h * 0.83);
  };

  FG.Renderer = Renderer;
})();
