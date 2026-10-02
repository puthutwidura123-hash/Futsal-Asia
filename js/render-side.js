/* Futsal Asia Pro — kamera samping (siaran TV) dengan proyeksi perspektif
 * Kamera berdiri di sisi lapangan (y > H), tinggi ±10 m, menunduk ke tengah lapangan,
 * bergeser kiri-kanan mengikuti bola seperti kamera utama siaran futsal/sepak bola. */
(function () {
  'use strict';
  const FG = window.FG;
  const { W, H, GY0, GY1, GH } = FG.C;
  const PPM = 36, M = 2.6;
  const CAM_D = 13, CAM_H = 10;

  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }

  const R = FG.Renderer.prototype;

  R.buildStands = function () {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 360;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, '#050b16'); gr.addColorStop(1, '#16253d');
    g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    const cols = ['#d71f26', '#ffffff', '#1b3f94', '#ffcc00', '#0a7d3b', '#e8e8e8', '#ff7a3d', '#22e3ff', '#7d3cff', '#f3d0ab'];
    for (let row = 0; row < 14; row++) {
      const y = 40 + row * 22;
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, y + 14, cv.width, 3);
      for (let x = (row % 2) * 6; x < cv.width; x += 11 + Math.random() * 4) {
        if (Math.random() < 0.12) continue;
        g.fillStyle = cols[(Math.random() * cols.length) | 0]; g.globalAlpha = 0.35 + row * 0.03;
        g.fillRect(x, y + Math.random() * 3, 7, 9);
        g.fillStyle = '#f0c8a0'; g.fillRect(x + 1.5, y - 4 + Math.random() * 2, 4, 4);
      }
    }
    g.globalAlpha = 1;
    // roof lights
    for (let i = 0; i < 16; i++) { const x = 60 + i * 125; const lg = g.createRadialGradient(x, 14, 1, x, 14, 40); lg.addColorStop(0, 'rgba(255,255,240,0.9)'); lg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = lg; g.fillRect(x - 40, 0, 80, 50); }
    return cv;
  };

  R.sideSetup = function (dt, v) {
    const cw = this.cw, ch = this.ch, portrait = ch > cw;
    const viewW = portrait ? this.zoom * 1.05 : this.zoom * 1.95;
    const th = Math.atan2(CAM_H, CAM_D + H * 0.5);
    this.sc.c = Math.cos(th); this.sc.s = Math.sin(th);
    const depC = (H / 2 + CAM_D) * this.sc.c + CAM_H * this.sc.s;
    this.sc.F = (cw * depC) / viewW;
    // follow ball
    const bx = v.b[0], by = v.b[1];
    let tx = bx, ty = by;
    if (this.lastBall && dt > 0) { const vx = (bx - this.lastBall[0]) / dt; if (Math.abs(vx) < 40) tx += vx * 0.3; }
    this.lastBall = [bx, by];
    const half = viewW / 2;
    const cx = viewW >= W + 8 ? W / 2 : Math.max(half - 4, Math.min(W - half + 4, tx));
    const cy = H / 2 + (Math.max(-2, Math.min(H + 2, ty)) - H / 2) * 0.3;
    const k = Math.min(1, dt * 2.8);
    if (v.cut || this.sc.cx == null) { this.sc.cx = cx; this.sc.cy = cy; }
    else { this.sc.cx += (cx - this.sc.cx) * k; this.sc.cy += (cy - this.sc.cy) * k; }
    // anchor: ground point (cx, cy) sits at 58% of the screen height
    this.sc.oy = 0; this.sc.ox = 0;
    const p = this.P(this.sc.cx, this.sc.cy, 0);
    this.sc.oy = ch * (portrait ? 0.5 : 0.53) - p[1];
    if (v.sh > 0) { this.sc.ox = (Math.random() - 0.5) * v.sh * 10; this.sc.oy += (Math.random() - 0.5) * v.sh * 10; }
  };
  // returns [screenX, screenY, pixelsPerMetre]
  R.P = function (x, y, z) {
    const s = this.sc, ry = y - (H + CAM_D), rz = z - CAM_H;
    const dep = Math.max(0.5, -ry * s.c - rz * s.s), up = -ry * s.s + rz * s.c, k = s.F / dep;
    return [this.cw / 2 + (x - s.cx) * k + s.ox, s.oy - up * k, k];
  };

  R.drawSide = function (v, cfg, dt, local) {
    const g = this.g;
    this.localTeam = local;
    this.sideSetup(dt, v);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#050b16'; g.fillRect(0, 0, this.cw, this.ch);
    // stands (vertical wall behind far touchline)
    const sTop = this.P(-14, -4, 9), sBot = this.P(W + 14, -4, 0);
    g.drawImage(this.stands, sTop[0], sTop[1], sBot[0] - sTop[0], sBot[1] - sTop[1]);
    // floor strips
    const P = this.pitchSide, step = 0.1; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (let wy = -M; wy < H + M - 1e-6; wy += step) {
      const a = this.P(0, wy, 0), b = this.P(0, wy + step, 0);
      if (b[1] < 0 || a[1] > this.ch) continue;
      const ym = wy + step / 2, L = this.P(-M, ym, 0), Rr = this.P(W + M, ym, 0);
      g.drawImage(P, 0, (wy + M) * PPM, P.width, step * PPM, L[0], a[1], Rr[0] - L[0], b[1] - a[1] + 1);
    }
    // far advertising boards
    const ads = ['LIGA FUTSAL ASIA', 'FAIR PLAY', 'FUTSAL ASIA PRO', 'RESPECT', 'LIGA FUTSAL ASIA', 'FAIR PLAY'];
    for (let i = 0; i < 6; i++) {
      const x0 = -2 + i * 7.4, t = this.P(x0, -1.4, 0.9), bm = this.P(x0 + 7, -1.4, 0);
      g.fillStyle = i % 2 ? '#c81e3a' : '#121c2e'; g.fillRect(t[0], t[1], bm[0] - t[0], bm[1] - t[1]);
      g.fillStyle = '#fff'; g.font = '800 ' + Math.max(8, (bm[1] - t[1]) * 0.55) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ads[i], (t[0] + bm[0]) / 2, (t[1] + bm[1]) / 2);
    }
    // benches + subs zone near side (drawn later as foreground)
    this.drawGoal3D(0, -1); this.drawGoal3D(W, 1);

    // sprites sorted by depth
    const items = [];
    v.p.forEach((q, i) => { if (!(q[5] & 16)) items.push({ y: q[1], q, i }); });
    items.push({ y: v.b[1], ball: true });
    items.sort((a, b) => a.y - b.y);
    // shadows first
    for (const it of items) {
      if (it.ball) continue;
      const f = this.P(it.q[0], it.q[1], 0);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(f[0] + f[2] * 0.25, f[1], f[2] * 0.42, f[2] * 0.12, 0, 0, Math.PI * 2); g.fill();
      if (it.q[5] & 2) this.groundCursor(it.q, it.i);
    }
    { const sh = this.P(v.b[0], v.b[1], 0); g.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.38 - v.b[2] * 0.08) + ')'; g.beginPath(); g.ellipse(sh[0] + v.b[2] * sh[2] * 0.15, sh[1], sh[2] * 0.14, sh[2] * 0.05, 0, 0, Math.PI * 2); g.fill(); }
    // ball trail
    this.trail.push([v.b[0], v.b[1], v.b[2]]); if (this.trail.length > 8) this.trail.shift();
    if (this.trail.length > 2) {
      const a = this.trail[0], b = this.trail[this.trail.length - 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.6) {
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineCap = 'round'; g.beginPath();
        this.trail.forEach((t, i) => { const p = this.P(t[0], t[1], t[2] + 0.11); g.lineWidth = p[2] * 0.16; i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
      }
    }
    for (const it of items) { if (it.ball) this.ball3D(v.b); else this.figure(it.q, it.i, cfg, v); }
    // goal frames near post on top (only the front post line)
    this.goalFront(0, -1); this.goalFront(W, 1);
    // particles
    this.parts = this.parts.filter((p) => (p.t -= dt) > 0);
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 6 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.9; p.vy *= 0.9; }
      const q = this.P(p.x, p.y, p.z); g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.t); g.fillRect(q[0], q[1], q[2] * 0.12, q[2] * 0.08); g.globalAlpha = 1;
    }
    // vignette
    const vg = g.createRadialGradient(this.cw / 2, this.ch * 0.55, this.ch * 0.4, this.cw / 2, this.ch * 0.55, this.cw * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = vg; g.fillRect(0, 0, this.cw, this.ch);
    this.drawRadar(v, cfg);
    if (v.rp) { g.font = '900 16px system-ui'; g.fillStyle = '#ffd23f'; g.textAlign = 'left'; g.fillText('● REPLAY', 16, this.ch - 22); }
  };

  R.line3 = function (a, b) { const p = this.P(a[0], a[1], a[2]), q = this.P(b[0], b[1], b[2]); this.g.beginPath(); this.g.moveTo(p[0], p[1]); this.g.lineTo(q[0], q[1]); this.g.stroke(); };
  R.drawGoal3D = function (gx, d) {
    const g = this.g, bx = gx + d * 1.0, tx = gx + d * 0.8;
    // net fill (back + top + sides)
    const quad = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => { const q = this.P(p[0], p[1], p[2]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    quad([[bx, GY0, 0], [bx, GY1, 0], [tx, GY1, GH], [tx, GY0, GH]], 'rgba(255,255,255,0.10)');
    quad([[gx, GY0, GH], [tx, GY0, GH], [tx, GY1, GH], [gx, GY1, GH]], 'rgba(255,255,255,0.08)');
    quad([[gx, GY0, 0], [bx, GY0, 0], [tx, GY0, GH], [gx, GY0, GH]], 'rgba(255,255,255,0.08)');
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1;
    for (let i = 1; i < 10; i++) { const y = GY0 + (i * (GY1 - GY0)) / 10; this.line3([bx, y, 0], [tx, y, GH]); this.line3([gx, y, GH], [tx, y, GH]); }
    for (let i = 1; i < 6; i++) { const z = (i * GH) / 6, xx = bx + (tx - bx) * (z / GH); this.line3([xx, GY0, z], [xx, GY1, z]); this.line3([gx, GY0, z], [xx, GY0, z]); }
    // far post + crossbar
    const k = this.P(gx, H / 2, 0)[2];
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, k * 0.08); g.lineCap = 'round';
    this.line3([gx, GY0, 0], [gx, GY0, GH]); this.line3([gx, GY0, GH], [gx, GY1, GH]);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, k * 0.03);
    this.line3([gx, GY0, 0], [bx, GY0, 0]); this.line3([bx, GY0, 0], [bx, GY1, 0]); this.line3([tx, GY0, GH], [tx, GY1, GH]);
    this.line3([gx, GY0, GH], [tx, GY0, GH]); this.line3([tx, GY0, GH], [bx, GY0, 0]);
  };
  R.goalFront = function (gx, d) {
    const g = this.g, bx = gx + d * 1.0, tx = gx + d * 0.8, k = this.P(gx, H / 2, 0)[2];
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, k * 0.03);
    this.line3([gx, GY1, 0], [bx, GY1, 0]); this.line3([gx, GY1, GH], [tx, GY1, GH]); this.line3([tx, GY1, GH], [bx, GY1, 0]);
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, k * 0.085); g.lineCap = 'round';
    this.line3([gx, GY1, 0], [gx, GY1, GH]);
    // red-white post stripes like futsal goals
    g.strokeStyle = '#d71f26'; g.lineWidth = Math.max(2, k * 0.085); g.lineCap = 'butt';
    for (let z = 0.2; z < GH; z += 0.4) this.line3([gx, GY1, z], [gx, GY1, z + 0.2]);
    for (let y = GY0 + 0.2; y < GY1; y += 0.4) this.line3([gx, y, GH], [gx, y + 0.2, GH]);
  };

  R.groundCursor = function (q, i) {
    const g = this.g, mine = (i < 5 ? 0 : 1) === this.localTeam, col = mine ? '#22e3ff' : '#ffd23f';
    const c = this.P(q[0], q[1], 0), a = this.P(q[0] + 0.6, q[1], 0), b = this.P(q[0], q[1] + 0.6, 0);
    g.strokeStyle = col; g.lineWidth = Math.max(2, c[2] * 0.06);
    g.beginPath(); g.ellipse(c[0], c[1], Math.abs(a[0] - c[0]), Math.abs(b[1] - c[1]), 0, 0, Math.PI * 2); g.stroke();
    const f = q[2], t = this.P(q[0] + Math.cos(f) * 1.0, q[1] + Math.sin(f) * 1.0, 0), l = this.P(q[0] + Math.cos(f + 0.4) * 0.72, q[1] + Math.sin(f + 0.4) * 0.72, 0), r = this.P(q[0] + Math.cos(f - 0.4) * 0.72, q[1] + Math.sin(f - 0.4) * 0.72, 0);
    g.fillStyle = col; g.beginPath(); g.moveTo(t[0], t[1]); g.lineTo(l[0], l[1]); g.lineTo(r[0], r[1]); g.fill();
  };

  R.ball3D = function (bv) {
    const g = this.g, p = this.P(bv[0], bv[1], bv[2] + 0.11), r = Math.max(3, p[2] * 0.13);
    const gr = g.createRadialGradient(p[0] - r * 0.35, p[1] - r * 0.4, r * 0.1, p[0], p[1], r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bfc9d4');
    g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8b400';
    for (let i = 0; i < 3; i++) { const a = bv[3] + (i * Math.PI * 2) / 3; g.beginPath(); g.arc(p[0] + Math.cos(a) * r * 0.5, p[1] + Math.sin(a) * r * 0.5, r * 0.3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.stroke();
  };

  /* pemain sebagai figur berdiri (profil samping / depan / belakang) */
  R.figure = function (q, i, cfg, v) {
    const g = this.g, team = i < 5 ? 0 : 1, T = cfg.teams[team], r = T.roster[q[4]] || T.roster[0];
    const isGK = i % 5 === 0, kit = isGK ? T.gk : T.kit;
    const fl = q[5], f = q[2], down = fl & 4, sprint = fl & 32;
    const foot = this.P(q[0], q[1], 0), u = foot[2];
    const cf = Math.cos(f), sf = Math.sin(f);
    const front = Math.abs(cf) < 0.45, toward = sf > 0, dir = cf >= 0 ? 1 : -1;
    const ph = q[3] * 3.2, amp = sprint ? 0.75 : 0.5;
    const sw = Math.sin(ph) * amp;
    const shorts = isGK ? shade(kit[0], 0.45) : (lum(kit[0]) > 0.75 ? kit[1] : (lum(kit[1]) > 0.75 ? '#1d1d1d' : kit[1]));
    g.save(); g.translate(foot[0], foot[1]);
    if (down) g.rotate(dir * 1.25);
    g.lineCap = 'round';
    const limb = (x0, y0, ang, len, w, col, col2, frac) => {
      const x1 = x0 + Math.sin(ang) * len, y1 = y0 + Math.cos(ang) * len;
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (col2) { const xm = x0 + Math.sin(ang) * len * frac, ym = y0 + Math.cos(ang) * len * frac; g.strokeStyle = col2; g.beginPath(); g.moveTo(xm, ym); g.lineTo(x1, y1); g.stroke(); }
      return [x1, y1];
    };
    const hipY = -0.92 * u, shY = -1.42 * u;
    if (!front) {
      g.scale(dir, 1);
      // back leg & arm
      const a1 = limb(0, hipY, -sw, 0.9 * u, 0.14 * u, r.skin, kit[1], 0.45);
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(a1[0] + 0.05 * u, a1[1], 0.11 * u, 0.05 * u, 0, 0, Math.PI * 2); g.fill();
      limb(-0.02 * u, shY, sw * 0.9, 0.55 * u, 0.1 * u, shade(kit[0], 0.8), r.skin, 0.35);
      // shorts + torso
      g.fillStyle = shorts; g.fillRect(-0.17 * u, -1.0 * u, 0.34 * u, 0.24 * u);
      g.fillStyle = kit[0]; g.beginPath(); g.roundRect ? g.roundRect(-0.19 * u, -1.5 * u, 0.38 * u, 0.56 * u, 0.06 * u) : g.rect(-0.19 * u, -1.5 * u, 0.38 * u, 0.56 * u); g.fill();
      g.fillStyle = kit[1]; g.fillRect(-0.03 * u, -1.5 * u, 0.06 * u, 0.56 * u);
      // front leg & arm
      const a2 = limb(0, hipY, sw, 0.9 * u, 0.15 * u, r.skin, kit[1], 0.45);
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(a2[0] + 0.05 * u, a2[1], 0.11 * u, 0.05 * u, 0, 0, Math.PI * 2); g.fill();
      const hd = limb(0.02 * u, shY, -sw * 0.9, 0.55 * u, 0.11 * u, kit[0], r.skin, 0.35);
      if (isGK) { g.fillStyle = kit[1]; g.beginPath(); g.arc(hd[0], hd[1], 0.07 * u, 0, Math.PI * 2); g.fill(); }
      // head (profile)
      g.fillStyle = r.skin; g.fillRect(-0.04 * u, -1.6 * u, 0.08 * u, 0.12 * u);
      g.beginPath(); g.arc(0.02 * u, -1.68 * u, 0.12 * u, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(0.13 * u, -1.7 * u); g.lineTo(0.17 * u, -1.66 * u); g.lineTo(0.13 * u, -1.64 * u); g.fill();
      g.fillStyle = r.hair; g.beginPath(); g.arc(0.0 * u, -1.7 * u, 0.125 * u, Math.PI * 0.9, Math.PI * 2.05); g.fill();
      if (r.hs === 2) { g.beginPath(); g.moveTo(-0.1 * u, -1.78 * u); g.lineTo(-0.02 * u, -1.9 * u); g.lineTo(0.06 * u, -1.79 * u); g.fill(); }
    } else {
      // facing toward / away from camera
      limb(-0.09 * u, hipY, 0, 0.9 * u + Math.min(0, sw) * 0.25 * u, 0.15 * u, r.skin, kit[1], 0.45);
      limb(0.09 * u, hipY, 0, 0.9 * u + Math.min(0, -sw) * 0.25 * u, 0.15 * u, r.skin, kit[1], 0.45);
      g.fillStyle = '#111'; g.fillRect(-0.16 * u, -0.06 * u, 0.13 * u, 0.06 * u); g.fillRect(0.03 * u, -0.06 * u, 0.13 * u, 0.06 * u);
      g.fillStyle = shorts; g.fillRect(-0.2 * u, -1.0 * u, 0.4 * u, 0.24 * u);
      const hl = limb(-0.24 * u, shY, 0.25 + sw * 0.3, 0.55 * u, 0.1 * u, kit[0], r.skin, 0.35);
      const hr = limb(0.24 * u, shY, -0.25 - sw * 0.3, 0.55 * u, 0.1 * u, kit[0], r.skin, 0.35);
      if (isGK) { g.fillStyle = kit[1]; [hl, hr].forEach((h) => { g.beginPath(); g.arc(h[0], h[1], 0.07 * u, 0, Math.PI * 2); g.fill(); }); }
      g.fillStyle = kit[0]; g.fillRect(-0.24 * u, -1.5 * u, 0.48 * u, 0.56 * u);
      g.fillStyle = kit[1]; g.fillRect(-0.24 * u, -1.5 * u, 0.48 * u, 0.06 * u);
      g.fillStyle = r.skin; g.fillRect(-0.05 * u, -1.6 * u, 0.1 * u, 0.12 * u);
      g.beginPath(); g.arc(0, -1.68 * u, 0.125 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = r.hair;
      if (toward) { g.beginPath(); g.arc(0, -1.71 * u, 0.13 * u, Math.PI * 1.05, Math.PI * 1.95); g.fill(); g.fillStyle = '#111'; g.fillRect(-0.06 * u, -1.69 * u, 0.025 * u, 0.025 * u); g.fillRect(0.035 * u, -1.69 * u, 0.025 * u, 0.025 * u); }
      else { g.beginPath(); g.arc(0, -1.68 * u, 0.13 * u, 0, Math.PI * 2); g.fill(); }
      if (u > 18) { g.font = '900 ' + Math.round(0.3 * u) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = lum(kit[0]) > 0.6 ? '#111' : '#fff'; g.fillText(r.num, 0, -1.2 * u); }
    }
    g.restore();
    if (!front && u > 18) { // number on side of shirt
      g.font = '900 ' + Math.round(0.24 * u) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = lum(kit[0]) > 0.6 ? '#111' : '#fff';
      if (!down) g.fillText(r.num, foot[0] - dir * 0.07 * u, foot[1] - 1.22 * u);
    }
    if (fl & 64) { g.fillStyle = '#ffd400'; g.fillRect(foot[0] + 0.25 * u, foot[1] - 1.9 * u, 0.12 * u, 0.17 * u); }
    if (fl & 2) {
      const mine = team === this.localTeam;
      const fs = Math.max(10, Math.min(15, u * 0.32));
      g.font = '700 ' + fs + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const nm = r.name.split(' ').slice(-1)[0], tw = g.measureText(nm).width + 10, top = foot[1] - 2.05 * u - fs;
      g.fillStyle = 'rgba(5,12,24,0.75)'; g.fillRect(foot[0] - tw / 2, top, tw, fs + 4);
      g.fillStyle = mine ? '#22e3ff' : '#ffd23f'; g.fillText(nm, foot[0], top + fs / 2 + 2);
      const st = q[6] / 100;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(foot[0] - tw / 2, top + fs + 5, tw, 3);
      g.fillStyle = st > 0.5 ? '#3ddc84' : st > 0.25 ? '#ffc107' : '#ff4d4d'; g.fillRect(foot[0] - tw / 2, top + fs + 5, tw * st, 3);
      const ch = v.ch[team];
      if (ch > 0) {
        const w = Math.max(40, u * 1.2);
        g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(foot[0] - w / 2, foot[1] + 0.25 * u, w, 7);
        const cg = g.createLinearGradient(foot[0] - w / 2, 0, foot[0] + w / 2, 0); cg.addColorStop(0, '#3ddc84'); cg.addColorStop(0.7, '#ffc107'); cg.addColorStop(1, '#ff3b3b');
        g.fillStyle = cg; g.fillRect(foot[0] - w / 2, foot[1] + 0.25 * u, w * ch, 7);
      }
    }
  };
})();
