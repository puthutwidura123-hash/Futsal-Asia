/* Futsal Asia Pro — input (keyboard, layar sentuh, gamepad) & audio sintetis */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  const KEYMAP = {
    KeyJ: 'pass', KeyK: 'shoot', Space: 'shoot', KeyL: 'lob', KeyU: 'thru', KeyI: 'skill',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'sw', KeyE: 'sw'
  };
  const DIRS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  // Xbox layout: A pass, X shoot, B lob, Y through, RB skill, RT sprint, LB switch
  const PADMAP = { 0: 'pass', 2: 'shoot', 1: 'lob', 3: 'thru', 5: 'skill', 7: 'sprint', 4: 'sw', 6: 'sprint' };

  class Input {
    constructor() {
      this.st = { mx: 0, my: 0, h: {}, c: {}, r: {} };
      this.keys = {}; this.joy = null; this.pad = {}; this.onPause = null; this.enabled = true;
      addEventListener('keydown', (e) => {
        if (!this.enabled) return;
        if (e.code === 'Escape' || e.code === 'KeyP') { this.onPause && this.onPause(); return; }
        if (DIRS[e.code]) { this.keys[e.code] = 1; e.preventDefault(); }
        const b = KEYMAP[e.code]; if (b) { e.preventDefault(); if (!e.repeat) this.press(b); }
      });
      addEventListener('keyup', (e) => {
        if (DIRS[e.code]) this.keys[e.code] = 0;
        const b = KEYMAP[e.code]; if (b) this.release(b);
      });
      addEventListener('blur', () => { this.keys = {}; for (const k in this.st.h) this.release(k); });
    }
    press(k) { if (!this.st.h[k]) { this.st.h[k] = true; this.st.c[k] = (this.st.c[k] || 0) + 1; } }
    release(k) { if (this.st.h[k]) { this.st.h[k] = false; this.st.r[k] = (this.st.r[k] || 0) + 1; } }
    bindTouch(root) {
      const zone = root.querySelector('.joy-zone'), base = root.querySelector('.joy-base'), knob = root.querySelector('.joy-knob');
      const R = 52;
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault(); zone.setPointerCapture(e.pointerId);
        this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
        const zr = zone.getBoundingClientRect();
        base.style.left = e.clientX - zr.left + 'px'; base.style.top = e.clientY - zr.top + 'px'; base.classList.add('on');
        knob.style.transform = 'translate(-50%,-50%)';
      });
      zone.addEventListener('pointermove', (e) => {
        if (!this.joy || e.pointerId !== this.joy.id) return;
        let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y; const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.joy.dx = dx / R; this.joy.dy = dy / R;
        knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      });
      const end = (e) => { if (this.joy && e.pointerId === this.joy.id) { this.joy = null; base.classList.remove('on'); } };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
      root.querySelectorAll('[data-btn]').forEach((el) => {
        const k = el.dataset.btn;
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); this.press(k); if (navigator.vibrate) navigator.vibrate(8); });
        const up = (e) => { el.classList.remove('down'); this.release(k); };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      });
    }
    poll() {
      let mx = 0, my = 0;
      for (const k in this.keys) if (this.keys[k]) { mx += DIRS[k][0]; my += DIRS[k][1]; }
      const m = Math.hypot(mx, my); if (m > 0) { mx /= m; my /= m; }
      if (this.joy) { mx = this.joy.dx; my = this.joy.dy; if (Math.hypot(mx, my) < 0.18) mx = my = 0; }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && Array.from(pads).find((p) => p && p.connected);
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.2) { mx = ax; my = ay; }
        if (gp.buttons[14] && gp.buttons[14].pressed) mx = -1; if (gp.buttons[15] && gp.buttons[15].pressed) mx = 1;
        if (gp.buttons[12] && gp.buttons[12].pressed) my = -1; if (gp.buttons[13] && gp.buttons[13].pressed) my = 1;
        for (const i in PADMAP) {
          const b = gp.buttons[i]; const on = !!(b && (b.pressed || b.value > 0.5)); const key = 'p' + i;
          if (on && !this.pad[key]) this.press(PADMAP[i]); if (!on && this.pad[key]) this.release(PADMAP[i]);
          this.pad[key] = on;
        }
        const st = gp.buttons[9] && gp.buttons[9].pressed;
        if (st && !this.pad.st && this.onPause) this.onPause(); this.pad.st = st;
      }
      this.st.mx = Math.round(mx * 100) / 100; this.st.my = Math.round(my * 100) / 100;
      return { mx: this.st.mx, my: this.st.my, h: Object.assign({}, this.st.h), c: Object.assign({}, this.st.c), r: Object.assign({}, this.st.r) };
    }
  }
  FG.Input = Input;

  /* ---------- Audio (WebAudio, tanpa file) ---------- */
  class Sfx {
    constructor() { this.ctx = null; this.on = true; this.crowd = null; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.crowd = g;
    }
    burst(dur, freq, q, vol, type) {
      const c = this.ctx; if (!c || !this.on) return;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 1;
      const g = c.createGain(); const t = c.currentTime;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    tone(freq, dur, vol, type, slide) {
      const c = this.ctx; if (!c || !this.on) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    }
    whistle(n, len) {
      const c = this.ctx; if (!c || !this.on) return;
      for (let i = 0; i < n; i++) {
        const t = c.currentTime + i * (len + 0.12), o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
        o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 120; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + len - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
      }
    }
    cheer(level) {
      const c = this.ctx; if (!c || !this.crowd) return;
      const t = c.currentTime; this.crowd.gain.cancelScheduledValues(t);
      this.crowd.gain.setValueAtTime(this.crowd.gain.value, t); this.crowd.gain.linearRampToValueAtTime(level, t + 0.25); this.crowd.gain.linearRampToValueAtTime(0.05, t + 3.5);
    }
    play(e) {
      if (!this.ctx || !this.on) return;
      switch (e) {
        case 'kick': this.burst(0.08, 900, 1, 0.5); this.tone(110, 0.08, 0.35, 'sine', 60); break;
        case 'shot': this.burst(0.12, 1400, 1, 0.8); this.tone(90, 0.12, 0.6, 'sine', 45); this.cheer(0.12); break;
        case 'touch': this.burst(0.04, 600, 1, 0.2); break;
        case 'bounce': this.tone(160, 0.05, 0.15, 'sine', 90); break;
        case 'post': this.tone(1350, 0.5, 0.18, 'triangle', 1200); this.tone(2650, 0.35, 0.08, 'sine'); this.cheer(0.2); break;
        case 'save': case 'catch': this.burst(0.12, 500, 1, 0.5); this.cheer(0.14); break;
        case 'tackle': case 'slide': this.burst(0.15, 400, 0.8, 0.35); break;
        case 'whistle': case 'card': this.whistle(1, 0.32); break;
        case 'whistle_s': this.whistle(1, 0.14); break;
        case 'whistle_end': this.whistle(3, 0.4); break;
        case 'goal': this.cheer(0.45); this.tone(523, 0.18, 0.15, 'square'); setTimeout(() => this.tone(659, 0.18, 0.15, 'square'), 150); setTimeout(() => this.tone(784, 0.35, 0.15, 'square'), 300); break;
        case 'switch': this.tone(880, 0.04, 0.05, 'sine'); break;
        case 'skill': this.burst(0.06, 2500, 2, 0.15, 'highpass'); break;
      }
    }
  }
  FG.Sfx = new Sfx();
})();
