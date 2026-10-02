/* Futsal Asia Pro — mesin pertandingan (tanpa DOM, deterministik per tick 1/60 dtk)
 * Aturan yang diterapkan (Laws of the Game Futsal FIFA):
 *  - 5 vs 5 (1 kiper + 4), lapangan 40x20 m, gawang 3x2 m, daerah penalti 6 m
 *  - 2 babak, jam berhenti saat bola mati (waktu efektif)
 *  - Tendangan ke dalam (kick-in), sudut, lemparan kiper, sepak mula; lawan wajib 5 m (sepak mula 3 m)
 *  - Aturan 4 detik untuk semua bola mati & kiper menguasai bola di setengah lapangan sendiri
 *  - Larangan back-pass ke kiper, kiper tak boleh pegang umpan sengaja dari rekan
 *  - Akumulasi pelanggaran: mulai pelanggaran ke-6 = tendangan 10 meter tanpa pagar
 *  - Pelanggaran di daerah penalti = penalti 6 m; kartu kuning/merah (main kurang 2 menit / sampai kebobolan)
 *  - Gol tidak sah langsung dari kick-in / lemparan kiper / tendangan bebas tidak langsung
 *  - Pergantian pemain bebas (otomatis saat bola mati, berdasar stamina)
 */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const W = 40, H = 20, GW = 3, GH = 2, G = 9.81, PR = 0.38, BR = 0.11;
  const GY0 = H / 2 - GW / 2, GY1 = H / 2 + GW / 2;
  const rnd = Math.random, hyp = Math.hypot;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6; const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return hyp(px - ax - dx * t, py - ay - dy * t); }
  function inPenArea(x, y, gx) { const dx = gx === 0 ? x : W - x; if (dx < -0.3) return false; return hyp(Math.max(0, dx), y - clamp(y, GY0, GY1)) <= 6; }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function cdist(a, b) { const x = hexRgb(a), y = hexRgb(b); return hyp(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }

  FG.C = { W, H, GW, GH, PR, BR, GY0, GY1 };
  FG.inPenArea = inPenArea;
  const BTN = ['pass', 'shoot', 'lob', 'thru', 'skill', 'sprint', 'sw'];
  FG.BTN = BTN;
  function blankIn() { return { mx: 0, my: 0, h: {}, c: {}, r: {} }; }
  FG.blankIn = blankIn;
  const SET_NAMES = { KO: 'Sepak Mula', KI: 'Tendangan ke Dalam', CK: 'Tendangan Sudut', GC: 'Lemparan Kiper', FKD: 'Tendangan Bebas', FKI: 'Tendangan Bebas Tidak Langsung', PEN: 'Penalti', PEN10: 'Tendangan 10 Meter' };
  FG.SET_NAMES = SET_NAMES;
  const FOUR_SEC = { KI: 1, CK: 1, GC: 1, FKD: 1, FKI: 1 };

  function mkPlayer(team, r, role) {
    return { team, r, role, x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, f: 0, stam: 100, tcd: 0, acd: 0, stun: 0, evade: 0, dive: 0, dvX: 0, dvY: 0, diveCd: 0, slide: 0, slideHit: false, anim: 0, sprint: false, yellow: 0, off: false, runT: 0, runX: 0, runY: 0, aiT: 0, slot: 0, tx: 0, ty: 0, hold: 0, act: 0, actT: 0, actD: 0.45 };
  }

  class Match {
    constructor(o) {
      this.o = o;
      this.halfLen = (o.halfMinutes || 3) * 60;
      this.diff = o.difficulty == null ? 1 : o.difficulty;
      this.teams = [0, 1].map((i) => this.mkTeam(i, o.teams[i], o.ctrl[i]));
      this.teams[0].dir = 1; this.teams[1].dir = -1;
      this.pickKits();
      this.ball = { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, px: W / 2, owner: null, held: false, set: false, last: null, lastTeam: -1, kick: null, kickT: -9, kind: '', ind: null, gkRel: -1, mouth: null, rot: 0, intended: null, gkTried: -9 };
      this.time = 0; this.clock = this.halfLen; this.half = 1; this.phase = 'dead'; this.timer = 0; this.next = null;
      this.events = []; this.banner = ''; this.bannerT = 0; this.toast = ''; this.toastT = 0;
      this.ctrl = [null, null]; this.inputs = [blankIn(), blankIn()]; this.last = [blankIn(), blankIn()]; this.ed = [null, null];
      this.charge = [0, 0]; this.charging = [false, false]; this.buffer = [null, null]; this.pressHelp = [false, false]; this.seenOwner = [null, null];
      this.stats = { shots: [0, 0], onT: [0, 0], poss: [0, 0], passes: [0, 0], fouls: [0, 0], cards: [0, 0] };
      this.goals = []; this.replay = []; this.rpI = 0; this.rpStart = 0; this.cutSeq = 0;
      this.setpiece = null; this.ended = false; this.shake = 0; this.kickTeam = 0;
      this.autoSwitch = o.autoSwitch !== false;
      this.placeKickoff();
      this.setSet('KO', 0, W / 2, H / 2, { delay: 1.8 });
      this.say('BABAK 1', 1.8);
    }

    /* ---------- setup ---------- */
    mkTeam(i, id, ctrl) {
      const data = FG.TEAM_BY_ID[id];
      const roster = data.roster;
      const gk = roster.find((r) => r.pos === 'GK');
      const pool = roster.filter((r) => r.pos !== 'GK');
      const starters = [];
      for (const w of ['FIXO', 'ALA', 'ALA', 'PIVOT']) { const k = pool.findIndex((r) => r.pos === w); starters.push(pool.splice(k >= 0 ? k : 0, 1)[0]); }
      const roles = ['FIXO', 'ALA_L', 'ALA_R', 'PIVOT'];
      const players = [mkPlayer(i, gk, 'GK')].concat(starters.map((r, k) => mkPlayer(i, r, roles[k])));
      players.forEach((p, k) => (p.slot = i * 5 + k));
      const bench = pool.map((r) => mkPlayer(i, r, null));
      return { i, id, data, ctrl, players, bench, score: 0, fouls: 0, dir: 1, short: 0, gk4: 0, kit: data.home, gkKit: data.gk };
    }
    pickKits() {
      const a = this.teams[0], b = this.teams[1];
      a.kit = a.data.home;
      b.kit = b.data.home;
      if (cdist(a.kit[0], b.kit[0]) < 150) b.kit = b.data.away;
      if (cdist(a.kit[0], b.kit[0]) < 150) b.kit = ['#1b1b1b', '#f1f1f1'];
      a.gkKit = a.data.gk; b.gkKit = b.data.gk;
      for (const T of this.teams) for (const k of [a.kit[0], b.kit[0]]) if (cdist(T.gkKit[0], k) < 110) T.gkKit = T === a ? ['#7d3cff', '#ffffff'] : ['#ff7a00', '#111111'];
      if (cdist(a.gkKit[0], b.gkKit[0]) < 110) b.gkKit = ['#00b4d8', '#111111'];
    }
    cfg() {
      return {
        halfMinutes: this.halfLen / 60,
        teams: this.teams.map((T) => ({
          id: T.id, name: T.data.name, flag: T.data.flag, kit: T.kit, gk: T.gkKit,
          roster: T.data.roster.map((r) => ({ name: r.name, num: r.num, skin: r.skin, hair: r.hair, hs: r.hs, pos: r.pos }))
        }))
      };
    }

    /* ---------- helpers ---------- */
    ownGX(T) { return T.dir > 0 ? 0 : W; }
    attGX(T) { return T.dir > 0 ? W : 0; }
    act(T) { return T.players.filter((p) => !p.off); }
    all() { return this.act(this.teams[0]).concat(this.act(this.teams[1])); }
    u(T, x) { return T.dir > 0 ? x : W - x; }
    fromU(T, u) { return T.dir > 0 ? u : W - u; }
    ev(e) { this.events.push(e); }
    say(b, t) { this.banner = b; this.bannerT = t || 2; }
    note(t, d) { this.toast = t; this.toastT = d || 2.5; }
    defTeamOf(gx) { return this.teams.find((T) => this.ownGX(T) === gx); }
    gcPos(ti) { const g = this.ownGX(this.teams[ti]); return [g === 0 ? 1.3 : W - 1.3, H / 2]; }
    minute() { const el = (this.half - 1) * this.halfLen + (this.halfLen - this.clock); return Math.min(40, Math.floor((el / this.halfLen) * 20) + 1); }
    skill(T) { return T.ctrl === 'ai' ? [0.45, 0.72, 0.95][this.diff] : 0.8; }
    aiErr(p) { return this.teams[p.team].ctrl === 'ai' ? [1.5, 1.05, 0.8][this.diff] : 1; }
    attacking(t) { const b = this.ball; return !!(b.owner && b.owner.team === t) || (!b.owner && b.lastTeam === t); }
    nearestOut(T, x, y, excl) { let best = null, bd = 1e9; for (const p of this.act(T)) { if (p.role === 'GK' || p === excl) continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } } return best; }
    pressure(p) { let d = 9; for (const o of this.act(this.teams[1 - p.team])) d = Math.min(d, hyp(o.x - p.x, o.y - p.y)); return clamp((2.6 - d) / 2, 0, 1); }
    spd(p, sprint) {
      let v = 3.4 + p.r.s.pac * 0.026;
      if (sprint && p.stam > 5) v *= 1.33;
      if (p.r.trait === 'Pelari Kilat') v *= 1.05;
      v *= 0.8 + (0.2 * p.stam) / 100;
      if (this.ball.owner === p) v *= 0.9;
      return v;
    }
    ifkSpot(x, y, ti) {
      const D = this.teams[1 - ti], g = this.ownGX(D);
      x = clamp(x, 0.3, W - 0.3); y = clamp(y, 0.3, H - 0.3);
      if (!inPenArea(x, y, g)) return [x, y];
      const cy = clamp(y, GY0, GY1); let dx = x - g, dy = y - cy, d = hyp(dx, dy);
      if (d < 0.1) { dx = g === 0 ? 1 : -1; dy = 0; d = 1; }
      return [g + (dx / d) * 6.1, cy + (dy / d) * 6.1];
    }

    /* ---------- main loop ---------- */
    update(dt, inputs) {
      if (inputs) for (let t = 0; t < 2; t++) if (inputs[t]) this.inputs[t] = inputs[t];
      for (let t = 0; t < 2; t++) this.ed[t] = this.edges(t);
      this.events = [];
      this.time += dt;
      if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.banner = '';
      if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast = '';
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);
      for (const T of this.teams) for (const p of T.bench) p.stam = Math.min(100, p.stam + dt * 6);
      switch (this.phase) {
        case 'dead':
          this.timer -= dt; this.idle(dt); this.ballPhysics(dt); this.lineCross();
          if (this.timer <= 0 && this.next) { const n = this.next; this.next = null; n(); }
          break;
        case 'setpiece': this.updSet(dt); break;
        case 'play': this.updPlay(dt); break;
        case 'goal':
          this.timer -= dt; this.celebrate(dt); this.ballPhysics(dt); this.lineCross(); this.recordReplay();
          if (this.timer <= 0) this.startReplay();
          break;
        case 'replay':
          this.rpI += 0.5;
          if (this.rpI >= this.replay.length - 1 || (this.rpI - this.rpStart > 20 && this.anyPress())) this.endReplay();
          break;
        case 'halftime':
          this.timer -= dt;
          if (this.timer <= 0 || (this.timer < 6 && this.anyPress())) this.startHalf2();
          break;
      }
      for (let t = 0; t < 2; t++) this.last[t] = this.inputs[t];
    }
    edges(t) {
      const a = this.inputs[t] || blankIn(), b = this.last[t] || blankIn(), p = {}, r = {};
      for (const k of BTN) { p[k] = (a.c[k] || 0) > (b.c[k] || 0); r[k] = (a.r[k] || 0) > (b.r[k] || 0); }
      return { p, r };
    }
    anyPress() { for (let t = 0; t < 2; t++) { if (this.teams[t].ctrl === 'ai') continue; const e = this.ed[t]; if (e.p.pass || e.p.shoot) return true; } return false; }
    idle(dt) { for (const p of this.all()) { p.dvx = 0; p.dvy = 0; p.sprint = false; this.integrate(p, dt); } }

    /* ---------- set pieces ---------- */
    setSet(type, team, x, y, o) {
      o = o || {};
      this.phase = 'dead'; this.timer = o.delay == null ? 1.0 : o.delay;
      this.charging = [false, false]; this.buffer = [null, null];
      this.pendSet = { type, team, x, y, o };
      this.next = () => this.beginSet();
    }
    placeKickoff() {
      const base = { GK: [0.8, 10], FIXO: [8, 10], ALA_L: [13, 4], ALA_R: [13, 16], PIVOT: [17, 10] };
      for (const T of this.teams) for (const p of this.act(T)) {
        const bp = base[p.role] || [10, 10];
        p.x = this.fromU(T, bp[0]); p.y = T.dir > 0 ? bp[1] : H - bp[1];
        p.vx = p.vy = 0; p.dive = p.slide = p.stun = 0; p.act = 0; p.actT = 0; p.f = T.dir > 0 ? 0 : Math.PI;
      }
      const b = this.ball; Object.assign(b, { x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, held: false, mouth: null });
      this.cutSeq++;
    }
    beginSet() {
      const s = this.pendSet, T = this.teams[s.team], b = this.ball;
      this.autoSubs();
      Object.assign(b, { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: 0, owner: null, held: false, set: true, mouth: null, intended: null, ind: null, gkRel: -1 });
      const outs = this.act(T).filter((p) => p.role !== 'GK');
      let tk;
      if (s.type === 'GC') tk = T.players[0].off ? outs[0] : T.players[0];
      else if (s.type === 'PEN' || s.type === 'PEN10') tk = outs.slice().sort((a, c) => c.r.s.sho - a.r.s.sho)[0];
      else if (s.type === 'KO') tk = outs.find((p) => p.role === 'PIVOT') || outs[0];
      else tk = outs.slice().sort((a, c) => hyp(a.x - s.x, a.y - s.y) - hyp(c.x - s.x, c.y - s.y))[0];
      this.setpiece = Object.assign({}, s, { tk, cd: 4, ready: false, rt: 0, aiT: 0.7 + rnd() * 1.0 });
      b.owner = tk; b.held = s.type === 'GC' && tk.role === 'GK';
      if (T.ctrl !== 'ai') this.ctrl[T.i] = tk;
      const O = this.teams[1 - T.i];
      if (O.ctrl !== 'ai') this.ctrl[O.i] = this.nearestOut(O, s.x, s.y);
      this.setTargets();
      this.phase = 'setpiece';
      if (s.type !== 'KO') this.note(SET_NAMES[s.type] + ' — ' + T.data.name, 2.2);
    }
    setTargets() {
      const s = this.setpiece, T = this.teams[s.team], O = this.teams[1 - s.team], b = this.ball, tk = s.tk;
      const ag = this.attGX(T);
      let kx, ky;
      if (s.type === 'KI') { ky = b.y < 1 ? -0.45 : H + 0.45; kx = b.x; }
      else if (s.type === 'CK') { kx = b.x < 1 ? -0.4 : W + 0.4; ky = b.y < 1 ? -0.4 : H + 0.4; }
      else if (s.type === 'GC') { kx = b.x; ky = b.y; }
      else { const a = Math.atan2(H / 2 - b.y, ag - b.x); kx = b.x - Math.cos(a) * 0.55; ky = b.y - Math.sin(a) * 0.55; }
      tk.tx = kx; tk.ty = ky;
      const pen = s.type === 'PEN' || s.type === 'PEN10';
      for (const p of this.all()) {
        if (p === tk) continue;
        const Tp = this.teams[p.team], att = p.team === s.team;
        let t;
        if (p.role === 'GK') {
          const og = this.ownGX(Tp);
          t = { x: og === 0 ? 0.8 : W - 0.8, y: H / 2 };
          if (pen && !att) t.x = og === 0 ? 0.15 : W - 0.15;
          else if (att) t.x = this.fromU(Tp, clamp(this.u(Tp, b.x) - 8, 0.8, 5));
        } else t = this.shapeTarget(p, att, b.x, b.y);
        if (s.type === 'KO') {
          if (this.u(Tp, t.x) > W / 2 - 0.6) t.x = this.fromU(Tp, W / 2 - 0.7 - rnd() * 0.5);
          if (!att) { const d = hyp(t.x - b.x, t.y - b.y); if (d < 3.4) { const k = 3.4 / (d || 1); t.x = b.x + (t.x - b.x) * k; t.y = b.y + (t.y - b.y) * k; if (this.u(Tp, t.x) > W / 2 - 0.6) t.x = this.fromU(Tp, W / 2 - 0.7); } }
        } else if (pen) {
          if (!(p.role === 'GK' && !att)) { const ub = this.u(T, b.x); t.x = this.fromU(T, Math.min(this.u(T, t.x), ub - 5.3)); }
        } else if (!att && p.role !== 'GK') {
          let dx = t.x - b.x, dy = t.y - b.y, d = hyp(dx, dy);
          if (d < 5.2) { if (d < 0.1) { dx = -T.dir; dy = 0; d = 1; } t.x = b.x + (dx / d) * 5.3; t.y = b.y + (dy / d) * 5.3; }
          if (t.y < 0.5 || t.y > H - 0.5) { t.y = clamp(t.y, 0.5, H - 0.5); const ry = t.y - b.y; const rx = Math.sqrt(Math.max(0, 5.3 * 5.3 - ry * ry)); t.x = b.x + (t.x >= b.x ? rx : -rx); }
          if (s.type === 'GC' && inPenArea(t.x, t.y, this.ownGX(T))) t.x = this.fromU(T, 6.9);
        }
        p.tx = clamp(t.x, 0.4, W - 0.4); p.ty = clamp(t.y, 0.4, H - 0.4);
      }
      if (s.type === 'FKD' && !s.o.noWall) {
        const og = this.ownGX(O), dG = hyp(b.x - og, b.y - H / 2);
        if (dG < 16) {
          const a = Math.atan2(H / 2 - b.y, og - b.x);
          const ws = this.act(O).filter((p) => p.role !== 'GK').sort((p, q) => hyp(p.x - b.x, p.y - b.y) - hyp(q.x - b.x, q.y - b.y)).slice(0, 2);
          ws.forEach((p, i) => { const off = (i - 0.5) * 0.8; p.tx = b.x + Math.cos(a) * 5.1 - Math.sin(a) * off; p.ty = b.y + Math.sin(a) * 5.1 + Math.cos(a) * off; });
        }
      }
      // default facing for taker
      if (s.type === 'KI' || s.type === 'CK') s.face = Math.atan2(H / 2 - b.y, this.fromU(T, clamp(this.u(T, b.x) + 4, 4, W - 4)) - b.x);
      else if (s.type === 'GC') s.face = T.dir > 0 ? 0 : Math.PI;
      else s.face = Math.atan2(H / 2 - b.y, ag - b.x);
    }
    updSet(dt) {
      const s = this.setpiece, b = this.ball, T = this.teams[s.team], tk = s.tk;
      s.rt += dt;
      for (const p of this.all()) {
        const f = s.rt > 2.2 ? 2.4 : 1.25;
        this.steerTo(p, p.tx, p.ty, 1, f);
        if (p !== tk) p.f += clamp(angDiff(p.f, Math.atan2(b.y - p.y, b.x - p.x)), -dt * 8, dt * 8);
        this.integrate(p, dt);
      }
      if (s.type === 'GC' && b.held) { b.x = tk.x + Math.cos(tk.f) * 0.3; b.y = tk.y + Math.sin(tk.f) * 0.3; b.z = 1; }
      if (!s.ready) {
        if (T.ctrl !== 'ai') { const e = this.ed[s.team]; for (const k of ['pass', 'thru', 'lob', 'shoot']) if (e.p[k]) s.queued = k; }
        if ((hyp(tk.x - tk.tx, tk.y - tk.ty) < 0.25 && s.rt > 0.6) || s.rt > 3) {
          s.ready = true; tk.x = tk.tx; tk.y = tk.ty; tk.vx = tk.vy = 0; tk.f = s.face;
          if (s.rt > 3) for (const p of this.all()) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
          if (s.type === 'GC') { b.x = tk.x + Math.cos(tk.f) * 0.3; b.y = tk.y + Math.sin(tk.f) * 0.3; }
          this.ev('whistle_s');
        }
        return;
      }
      tk.x = tk.tx; tk.y = tk.ty; tk.vx = tk.vy = 0;
      if (FOUR_SEC[s.type]) s.cd -= dt;
      if (T.ctrl !== 'ai' && s.queued && s.rt > 0.4) {
        const k = s.queued, inp = this.inputs[s.team] || blankIn(); s.queued = null;
        const pen = s.type === 'PEN' || s.type === 'PEN10';
        if (k === 'shoot' && s.type !== 'GC') return this.humanShoot(tk, inp, 0.5);
        if (!pen && k !== 'shoot') return k === 'lob' ? this.humanPass(tk, inp, 'lob') : this.humanPass(tk, inp, k);
      }
      if (T.ctrl !== 'ai' && !FOUR_SEC[s.type] && s.rt > (s.type === 'KO' ? 6 : 9)) return this.aiSet(); // bantuan: sepak mula/penalti otomatis bila pemain diam
      if (T.ctrl !== 'ai') this.humanSet(dt);
      else { s.aiT -= dt; if (s.aiT <= 0) this.aiSet(); }
      if (this.phase === 'setpiece' && FOUR_SEC[s.type] && s.cd <= 0) this.fourSec(s);
    }
    go() {
      if (this.phase !== 'setpiece') return;
      const s = this.setpiece, b = this.ball;
      b.set = false; this.phase = 'play'; this.setpiece = null;
      if (s.type === 'KI' || s.type === 'FKI' || s.type === 'GC') b.ind = { team: s.team, by: s.tk, type: s.type };
    }
    humanSet(dt) {
      const s = this.setpiece, t = s.team, tk = s.tk, inp = this.inputs[t] || blankIn(), e = this.ed[t];
      if (hyp(inp.mx || 0, inp.my || 0) > 0.25) {
        const a = Math.atan2(inp.my, inp.mx);
        tk.f += clamp(angDiff(tk.f, a), -dt * 6, dt * 6);
        if (s.type === 'GC') { this.ball.x = tk.x + Math.cos(tk.f) * 0.3; this.ball.y = tk.y + Math.sin(tk.f) * 0.3; }
      }
      const pen = s.type === 'PEN' || s.type === 'PEN10';
      if (!pen) {
        if (e.p.pass) return this.humanPass(tk, inp, 'pass');
        if (e.p.thru) return this.humanPass(tk, inp, 'thru');
        if (e.p.lob) return this.humanPass(tk, inp, 'lob');
      }
      if (s.type === 'GC') return;
      if (e.p.shoot) { this.charging[t] = true; this.charge[t] = 0; }
      if (this.charging[t]) {
        this.charge[t] = Math.min(1, this.charge[t] + dt * 1.15);
        if (e.r.shoot || !inp.h.shoot) { const c = Math.max(0.22, this.charge[t]); this.charging[t] = false; this.humanShoot(tk, inp, c); }
      }
    }
    aiSet() {
      const s = this.setpiece, tk = s.tk, T = this.teams[s.team];
      this.go();
      if (s.type === 'PEN' || s.type === 'PEN10') return this.aiShoot(tk, true);
      const dG = hyp(this.attGX(T) - tk.x, H / 2 - tk.y);
      if (s.type === 'FKD' && dG < 12 && rnd() < 0.6) return this.aiShoot(tk, false);
      const bp = this.bestPass(tk);
      if (bp) this.passTo(tk, bp.p, s.type === 'GC' && bp.kind === 'thru' ? 'pass' : bp.kind);
      else this.passPoint(tk, this.fromU(T, clamp(this.u(T, tk.x) + 10, 4, W - 4)), H / 2 + (rnd() - 0.5) * 8, s.type === 'GC' ? 'lob' : 'pass');
    }
    fourSec(s) {
      const O = 1 - s.team, b = this.ball;
      this.ev('whistle'); this.note('Pelanggaran 4 detik!', 2.5);
      if (s.type === 'KI') this.setSet('KI', O, b.x, b.y < H / 2 ? 0 : H);
      else if (s.type === 'CK') { const p = this.gcPos(O); this.setSet('GC', O, p[0], p[1]); }
      else { const p = this.ifkSpot(b.x, b.y, O); this.setSet('FKI', O, p[0], p[1]); }
    }

    /* ---------- open play ---------- */
    updPlay(dt) {
      const b = this.ball;
      this.clock -= dt;
      if (this.clock <= 0) { this.clock = 0; this.endHalf(); return; }
      for (const T of this.teams) if (T.short > 0) { T.short -= dt; if (T.short <= 0) this.restoreShort(T); }
      if (b.owner) this.stats.poss[b.owner.team] += dt;
      for (let t = 0; t < 2; t++) { if (this.teams[t].ctrl !== 'ai') this.humanTick(t, dt); if (this.phase !== 'play') return; }
      this.aiTick(dt); if (this.phase !== 'play') return;
      for (const p of this.all()) this.integrate(p, dt);
      this.collide();
      if (b.owner) this.dribble(dt); else this.ballPhysics(dt);
      this.lineCross(); if (this.phase !== 'play') return;
      if (!b.owner) this.interact(); else this.ownerChecks(dt);
      if (this.phase !== 'play') return;
      this.checkOut();
      this.recordReplay();
    }

    integrate(p, dt) {
      if (p.off) return;
      const b = this.ball;
      if (p.act && p.act !== 7) { p.actT += dt / p.actD; if (p.actT >= 1) { p.act = 0; p.actT = 0; } }
      if (p.tcd > 0) p.tcd -= dt; if (p.acd > 0) p.acd -= dt; if (p.evade > 0) p.evade -= dt; if (p.diveCd > 0) p.diveCd -= dt;
      if (p.stun > 0) { p.stun -= dt; p.dvx *= 0.25; p.dvy *= 0.25; }
      if (p.dive > 0 || p.slide > 0) {
        if (p.dive > 0) { p.dive -= dt; if (p.dive <= 0) p.stun = Math.max(p.stun, 0.35); }
        if (p.slide > 0) { p.slide -= dt; if (p.slide <= 0) p.stun = Math.max(p.stun, 0.45); }
        p.vx = p.dvX; p.vy = p.dvY; p.dvX *= 0.94; p.dvY *= 0.94;
      } else {
        const acc = (b.owner === p ? 15 : 21) * dt;
        let ax = p.dvx - p.vx, ay = p.dvy - p.vy; const al = hyp(ax, ay);
        if (al > acc) { ax *= acc / al; ay *= acc / al; }
        p.vx += ax; p.vy += ay;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, -1.2, W + 1.2); p.y = clamp(p.y, -1.2, H + 1.2);
      const sp = hyp(p.vx, p.vy);
      if (sp > 0.4 && p.dive <= 0 && p.slide <= 0) {
        const ta = Math.atan2(p.vy, p.vx);
        const tr = (b.owner === p ? 5 + p.r.s.drb * 0.07 : 11) * dt;
        p.f += clamp(angDiff(p.f, ta), -tr, tr);
      }
      p.anim += sp * dt * 1.9;
      if (p.sprint && sp > 4) p.stam -= dt * (p.r.trait === 'Paru-paru Kuda' ? 4.2 : 7);
      else p.stam += dt * (sp < 2.5 ? 4.5 : 1.8);
      p.stam = clamp(p.stam, 0, 100);
    }
    collide() {
      const a = this.all();
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const p = a[i], q = a[j]; const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy);
        if (d < PR * 2 && d > 0.001) { const o = (PR * 2 - d) / 2, nx = dx / d, ny = dy / d; p.x -= nx * o; p.y -= ny * o; q.x += nx * o; q.y += ny * o; }
      }
    }
    steerTo(p, tx, ty, run, fac) {
      fac = fac || 1;
      const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
      if (d < 0.05) { p.dvx = p.dvy = 0; p.sprint = false; return d; }
      p.sprint = !!run && d > 2.5;
      const v = Math.min(this.spd(p, p.sprint) * fac, d * 2.6);
      p.dvx = (dx / d) * v; p.dvy = (dy / d) * v;
      return d;
    }

    dribble(dt) {
      const b = this.ball, p = b.owner;
      b.px = b.x;
      if (b.set) return;
      if (b.held) { b.x = p.x + Math.cos(p.f) * 0.3; b.y = p.y + Math.sin(p.f) * 0.3; b.z = 1.0; b.vx = p.vx; b.vy = p.vy; b.vz = 0; return; }
      const off = PR + 0.16;
      const k = clamp(dt * 18, 0, 1);
      b.x = lerp(b.x, p.x + Math.cos(p.f) * off, k); b.y = lerp(b.y, p.y + Math.sin(p.f) * off, k);
      b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
      b.rot += hyp(p.vx, p.vy) * dt * 4;
    }
    ballPhysics(dt) {
      const b = this.ball;
      if (b.owner) { if (b.set || b.held) return; }
      b.px = b.x;
      if (b.z > 0 || b.vz > 0) {
        b.vz -= G * dt; b.z += b.vz * dt;
        if (b.z <= 0) { b.z = 0; if (b.vz < -1.5) { b.vz = -b.vz * 0.4; this.ev('bounce'); } else b.vz = 0; }
      }
      const sp = hyp(b.vx, b.vy);
      if (sp > 0.001) { const dec = b.z > 0.05 ? 0.15 + 0.004 * sp * sp : 1.5 + 0.085 * sp; const ns = Math.max(0, sp - dec * dt); b.vx *= ns / sp; b.vy *= ns / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += sp * dt * 4;
      for (const gx of [0, W]) for (const gy of [GY0, GY1]) {
        const dx = b.x - gx, dy = b.y - gy, d = hyp(dx, dy);
        if (d < BR + 0.05 && b.z < GH && d > 0.0001) {
          const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; b.x = gx + nx * (BR + 0.05); b.y = gy + ny * (BR + 0.05); this.ev('post'); this.shake = 0.5; this.note('Membentur tiang!', 1.5); }
        }
      }
    }
    lineCross() {
      const b = this.ball;
      for (const gx of [0, W]) {
        const crossed = gx === 0 ? b.px >= 0 && b.x < 0 : b.px <= W && b.x > W;
        if (!crossed) continue;
        const inPosts = b.y > GY0 + BR * 0.5 && b.y < GY1 - BR * 0.5;
        if (inPosts && b.z < GH - BR) {
          b.mouth = gx;
          if (b.owner) { b.vx = b.owner.vx; b.vy = b.owner.vy; b.owner = null; b.held = false; }
          if (b.kind === 'shot' && this.phase === 'play') { const D = this.defTeamOf(gx); if (b.lastTeam !== D.i) this.stats.onT[b.lastTeam]++; }
        } else if (inPosts && b.z < GH + BR) {
          b.x = gx === 0 ? BR : W - BR; b.vx = -b.vx * 0.45; b.vz = -Math.abs(b.vz) * 0.3; this.ev('post'); this.shake = 0.5; this.note('Membentur mistar!', 1.5);
        } else b.mouth = null;
      }
      if (b.mouth !== null) {
        if (b.mouth === 0) { if (b.x < -0.95) { b.x = -0.95; b.vx = Math.abs(b.vx) * 0.15; } if (b.x > 0.2) b.mouth = null; }
        else { if (b.x > W + 0.95) { b.x = W + 0.95; b.vx = -Math.abs(b.vx) * 0.15; } if (b.x < W - 0.2) b.mouth = null; }
        if (b.mouth !== null) {
          if (b.y < GY0 + BR) { b.y = GY0 + BR; b.vy = Math.abs(b.vy) * 0.2; }
          if (b.y > GY1 - BR) { b.y = GY1 - BR; b.vy = -Math.abs(b.vy) * 0.2; }
          if (b.z > GH - BR) { b.z = GH - BR; b.vz = -Math.abs(b.vz) * 0.2; }
          if (this.phase === 'play' && (b.mouth === 0 ? b.x < -BR : b.x > W + BR)) this.goal(b.mouth);
        }
      }
    }
    checkOut() {
      const b = this.ball;
      if (b.mouth !== null) return;
      if (b.y < -BR || b.y > H + BR) {
        this.ev('whistle'); b.owner = null; b.held = false;
        const tm = b.lastTeam < 0 ? 0 : 1 - b.lastTeam;
        this.setSet('KI', tm, clamp(b.x, 0.3, W - 0.3), b.y < 0 ? 0 : H, { delay: 0.9 });
        return;
      }
      if (b.x < -BR || b.x > W + BR) {
        const gx = b.x < 0 ? 0 : W, D = this.defTeamOf(gx);
        this.ev('whistle'); b.owner = null; b.held = false;
        if (b.lastTeam === D.i) this.setSet('CK', 1 - D.i, gx, b.y < H / 2 ? 0 : H, { delay: 1 });
        else { const p = this.gcPos(D.i); this.setSet('GC', D.i, p[0], p[1], { delay: 1 }); }
      }
    }
    goal(gx) {
      const b = this.ball, C = this.defTeamOf(gx), S = this.teams[1 - C.i];
      if (b.ind && b.ind.by === b.last) {
        this.ev('whistle');
        if (b.ind.team === S.i) { this.note('Gol tidak sah — tidak boleh langsung dari ' + SET_NAMES[b.ind.type], 3); const p = this.gcPos(C.i); this.setSet('GC', C.i, p[0], p[1], { delay: 1.4 }); }
        else this.setSet('CK', S.i, gx, b.y < H / 2 ? 0 : H, { delay: 1.4 });
        return;
      }
      S.score++;
      const og = !!(b.last && b.last.team !== S.i);
      const name = b.last ? b.last.r.name : '?';
      const min = this.minute();
      this.goals.push({ team: S.i, name, min, og });
      this.ev('goal'); this.shake = 1;
      this.say('GOOOL!', 2.8);
      this.note((og ? 'Gol bunuh diri: ' : '⚽ ') + name + ' ' + min + "'", 4);
      this.phase = 'goal'; this.timer = 2.8; this.scorer = og ? null : b.last; this.kickTeam = C.i;
      this.charging = [false, false];
      if (C.short > 0) this.restoreShort(C);
    }
    celebrate(dt) {
      const sc = this.scorer;
      if (sc) for (const p of this.act(this.teams[sc.team])) if (p.role !== 'GK') { p.act = 7; p.actT = (p.actT + dt * 0.9) % 1; }
      for (const p of this.all()) {
        if (sc && p === sc) { const T = this.teams[p.team]; this.steerTo(p, this.attGX(T) === W ? W - 2 : 2, p.y < H / 2 ? 1.5 : H - 1.5, 1); }
        else if (sc && p.team === sc.team && p.role !== 'GK') this.steerTo(p, sc.x - 1, sc.y + (p.slot % 2 ? 1 : -1), 1, 0.9);
        else { p.dvx = 0; p.dvy = 0; p.sprint = false; }
        this.integrate(p, dt);
      }
      this.collide();
    }
    startReplay() {
      if (this.replay.length > 60) { this.phase = 'replay'; this.rpI = Math.max(0, this.replay.length - 320); this.rpStart = this.rpI; this.cutSeq++; this.ev('replay'); }
      else this.endReplay();
    }
    endReplay() { this.replay = []; this.placeKickoff(); this.setSet('KO', this.kickTeam, W / 2, H / 2, { delay: 0.7 }); }
    endHalf() {
      this.ev('whistle_end'); this.charging = [false, false];
      const b = this.ball; b.owner = null; b.held = false;
      if (this.half === 1) { this.phase = 'halftime'; this.timer = 9; this.say('TURUN MINUM', 3); }
      else { this.phase = 'fulltime'; this.ended = true; this.say('PERTANDINGAN SELESAI', 999); }
    }
    startHalf2() {
      this.half = 2; this.clock = this.halfLen;
      for (const T of this.teams) {
        T.fouls = 0; T.dir *= -1; T.gk4 = 0;
        for (const p of T.players.concat(T.bench)) p.stam = Math.min(100, p.stam + 40);
      }
      this.replay = [];
      this.placeKickoff();
      this.setSet('KO', 1, W / 2, H / 2, { delay: 1.4 });
      this.say('BABAK 2', 1.8);
    }

    /* ---------- possession & contact ---------- */
    touch(p) {
      const b = this.ball;
      if (b.ind && b.ind.by !== p) b.ind = null;
      if (b.gkRel !== -1 && b.gkRel !== p.team) b.gkRel = -1;
      b.last = p; b.lastTeam = p.team;
    }
    kick(p, vx, vy, vz, kind) {
      const b = this.ball, T = this.teams[p.team];
      this.setAct(p, b.held && p.role === 'GK' ? 6 : kind === 'shot' ? 2 : kind === 'lob' ? 3 : 1, b.held ? 0.5 : 0.42);
      b.owner = null; b.held = false; b.set = false;
      b.vx = vx; b.vy = vy; b.vz = vz; if (vz > 0 && b.z < 0.02) b.z = 0.02;
      b.kick = p; b.kickT = this.time; b.kind = kind; b.gkTried = -9; b.intended = null;
      this.touch(p);
      if (p.role === 'GK' && this.u(T, p.x) < W / 2) b.gkRel = p.team;
      p.acd = 0.25; T.gk4 = 0; p.hold = 0;
      this.charging[p.team] = false;
      this.ev(kind === 'shot' ? 'shot' : 'kick');
      if (kind === 'shot') this.stats.shots[p.team]++;
    }
    gain(p, hands) {
      const b = this.ball, T = this.teams[p.team];
      const prev = b.last, prevT = b.lastTeam, wasPass = b.kind === 'pass' || b.kind === 'lob' || b.kind === 'thru';
      if (p.role === 'GK' && b.gkRel === p.team && prev && prev !== p && prevT === p.team && this.u(T, p.x) < W / 2) {
        this.touch(p); this.ev('whistle'); this.note('Pelanggaran: bola kembali ke kiper (back-pass)', 3);
        const s = this.ifkSpot(p.x, p.y, 1 - p.team); b.owner = null;
        this.setSet('FKI', 1 - p.team, s[0], s[1], { delay: 1.2 });
        return;
      }
      if (prevT === p.team && wasPass && prev !== p) this.stats.passes[p.team]++;
      b.owner = p; b.vz = 0; b.z = 0; b.intended = null; b.held = !!hands; b.mouth = null;
      this.touch(p); T.gk4 = 0; p.hold = 0; p.aiT = 0.2 + rnd() * 0.35;
      if (T.ctrl !== 'ai') this.ctrl[p.team] = p;
      if (b.held) { this.ev('catch'); this.setAct(p, 5, 0.4); } else this.ev('touch');
    }
    interact() {
      const b = this.ball;
      if (b.z > 2.4) return;
      for (const T of this.teams) { const g = T.players[0]; if (g.off || g.role !== 'GK') continue; if (this.gkTry(g)) return; }
      let best = null, bd = 1e9;
      for (const p of this.all()) {
        if (p.stun > 0.15 && p.slide <= 0) continue;
        if (b.kick === p && this.time - b.kickT < 0.28) continue;
        if (p.role === 'GK' && b.gkTried === b.kickT && b.lastTeam !== p.team) continue;
        if (b.z > (p.slide > 0 ? 0.3 : 1.5)) continue;
        const reach = PR + (p.slide > 0 ? 0.45 : 0.28);
        const d = hyp(b.x - p.x, b.y - p.y);
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (best) this.receive(best);
    }
    receive(p) {
      const b = this.ball, rel = hyp(b.vx - p.vx, b.vy - p.vy), s = p.r.s;
      if (p.slide > 0) { b.vx = Math.cos(p.f) * 6 + (rnd() - 0.5) * 3; b.vy = Math.sin(p.f) * 6 + (rnd() - 0.5) * 3; this.touch(p); p.acd = 0.4; this.ev('kick'); return; }
      const ctl = s.drb * 0.6 + s.pas * 0.4;
      const thr = 9 + ctl * 0.06;
      if (rel < thr || rnd() < (ctl / 100) * (thr / rel) * 0.75) {
        let hands = false;
        if (p.role === 'GK' && inPenArea(p.x, p.y, this.ownGX(this.teams[p.team]))) {
          const deliberate = b.lastTeam === p.team && b.last !== p && (b.kind === 'pass' || b.kind === 'lob' || b.kind === 'thru');
          hands = !deliberate;
        }
        this.gain(p, hands);
      } else {
        const nx = b.x - p.x, ny = b.y - p.y, d = hyp(nx, ny) || 1;
        b.vx = b.vx * 0.3 + (nx / d) * rel * 0.25 + (rnd() - 0.5) * 2; b.vy = b.vy * 0.3 + (ny / d) * rel * 0.25 + (rnd() - 0.5) * 2;
        if (b.z > 0.3) b.vz = Math.abs(b.vz) * 0.3;
        this.touch(p); p.acd = 0.3; b.kind = 'deflect'; this.ev('kick');
      }
    }
    gkTry(g) {
      const b = this.ball, T = this.teams[g.team], gx = this.ownGX(T);
      if (!inPenArea(g.x, g.y, gx) || b.gkTried === b.kickT) return false;
      if (b.kick === g && this.time - b.kickT < 0.4) return false;
      if (b.lastTeam === g.team) return false;
      const reach = (g.dive > 0 ? 0.95 + g.r.s.ref * 0.004 : 0.65) * (g.r.trait === 'Refleks Kucing' ? 1.12 : 1);
      const d = hyp(b.x - g.x, b.y - g.y);
      if (d > reach || b.z > 2.35) return false;
      const sp = hyp(b.vx, b.vy);
      if (sp < 8) { this.gain(g, true); return true; }
      const isShot = b.kind === 'shot';
      const dAdj = T.ctrl === 'ai' ? [-0.12, 0, 0.06][this.diff] : 0;
      const pSave = clamp(0.98 - Math.max(0, sp - 12) * 0.033 + (g.r.s.ref - 72) * 0.006 - (d / reach) * 0.22 + (g.dive > 0 ? 0.04 : 0) + dAdj, 0.15, 0.97);
      if (rnd() < pSave) {
        const catchP = (g.r.s.han / 100) * (sp < 18 ? 0.9 : 0.42) * (g.r.trait === 'Tangan Lem' ? 1.2 : 1);
        if (isShot) { this.stats.onT[1 - g.team]++; }
        if (rnd() < catchP) { this.gain(g, true); this.note('Tangkapan aman ' + g.r.name, 1.6); }
        else {
          const away = gx === 0 ? 1 : -1;
          b.vx = away * (Math.abs(b.vx) * 0.32 + 2) ; b.vy = (b.y > g.y ? 1 : -1) * (3 + rnd() * 5); b.vz = 1 + rnd() * 2;
          this.touch(g); g.acd = 0.45; b.kind = 'deflect'; b.kick = g; b.kickT = this.time; this.ev('save'); this.note('Penyelamatan! ' + g.r.name, 1.6);
        }
        return true;
      }
      b.gkTried = b.kickT;
      return false;
    }
    ownerChecks(dt) {
      const b = this.ball, o = b.owner, T = this.teams[o.team];
      for (const p of this.act(this.teams[1 - o.team])) {
        if (p.slide > 0 && !p.slideHit) {
          const d = Math.min(hyp(p.x - b.x, p.y - b.y), hyp(p.x - o.x, p.y - o.y));
          if (d < PR + 0.45) { p.slideHit = true; this.resolveTackle(p, o, true); if (this.phase !== 'play' || b.owner !== o) return; }
        }
      }
      if (o.role === 'GK') {
        const og = this.ownGX(T);
        if (b.held && !inPenArea(o.x, o.y, og)) { const gx = og, a = Math.atan2(H / 2 - o.y, gx - o.x); o.x += Math.cos(a) * 0.1; o.y += Math.sin(a) * 0.1; o.vx = o.vy = 0; }
        if (this.u(T, o.x) < W / 2) {
          T.gk4 += dt;
          if (T.gk4 > 4) {
            T.gk4 = 0; this.ev('whistle'); this.note('Kiper menguasai bola lebih dari 4 detik!', 3);
            const s = this.ifkSpot(o.x, o.y, 1 - T.i); b.owner = null; b.held = false;
            this.setSet('FKI', 1 - T.i, s[0], s[1], { delay: 1.2 });
          }
        } else T.gk4 = 0;
      }
    }
    tackle(p, slide) {
      if (p.tcd > 0 || p.stun > 0 || p.slide > 0) return;
      const b = this.ball, o = b.owner;
      if (!slide) this.setAct(p, 4, 0.4);
      if (slide) { p.tcd = 1.4; p.slide = 0.38; p.slideHit = false; p.dvX = Math.cos(p.f) * 8; p.dvY = Math.sin(p.f) * 8; this.ev('slide'); return; }
      p.tcd = 0.6;
      p.vx += Math.cos(p.f) * 1.5; p.vy += Math.sin(p.f) * 1.5;
      if (!o || o.team === p.team || b.held || b.set) return;
      const d = hyp(o.x - p.x, o.y - p.y);
      if (d > 1.3) { p.stun = 0.15; return; }
      this.resolveTackle(p, o, false);
    }
    resolveTackle(p, o, slide) {
      const b = this.ball, so = o.r.s, sp = p.r.s;
      if (b.held) return;
      const angBall = Math.atan2(o.y - p.y, o.x - p.x);
      const behind = Math.abs(angDiff(o.f, angBall)) < 0.9;
      const T = this.teams[p.team];
      let succ = 0.42 + ((sp.def - so.drb) / 100) * 0.9 + (p.r.trait === 'Tembok Baja' ? 0.12 : 0) - (o.evade > 0 ? 0.45 : 0) - (o.r.trait === 'Pivot Tangguh' ? 0.1 : 0) + (slide ? 0.1 : 0) - (behind ? 0.15 : 0);
      if (T.ctrl === 'ai') succ += [-0.08, 0, 0.05][this.diff];
      if (rnd() < succ) {
        if (slide && behind && rnd() < 0.5) { this.foul(p, o, o.x, o.y, 0.55); return; }
        b.owner = null;
        this.touch(p); o.stun = 0.3; this.ev('tackle');
        if (!slide && rnd() < 0.55) this.gain(p, false);
        else { b.vx = Math.cos(angBall) * 4 + (rnd() - 0.5) * 3; b.vy = Math.sin(angBall) * 4 + (rnd() - 0.5) * 3; b.kind = 'deflect'; b.kick = p; b.kickT = this.time; }
      } else {
        const fp = (slide ? 0.4 : 0.09) + (behind ? 0.25 : 0);
        if (rnd() < fp) { this.foul(p, o, o.x, o.y, behind && slide ? 0.6 : slide ? 0.22 : 0.07); return; }
        p.stun = slide ? 0.7 : 0.35;
      }
    }
    foul(off, vic, x, y, cardP) {
      const T = this.teams[off.team], V = this.teams[vic.team], b = this.ball;
      T.fouls++; this.stats.fouls[T.i]++; this.ev('whistle');
      b.owner = null; b.held = false; this.charging = [false, false];
      vic.stun = 0.6;
      let card = '';
      if (rnd() < cardP) {
        off.yellow++; this.stats.cards[T.i]++;
        if (off.yellow >= 2) { off.off = true; off.x = W / 2; off.y = H + 2; T.short = this.halfLen * 0.1; card = '🟥 Kartu merah: ' + off.r.name + ' — ' + T.data.name + ' main dengan 4 pemain'; this.ev('card'); if (this.ctrl[T.i] === off) this.ctrl[T.i] = null; }
        else { card = '🟨 Kartu kuning: ' + off.r.name; this.ev('card'); }
      }
      const og = this.ownGX(T);
      x = clamp(x, 0.2, W - 0.2); y = clamp(y, 0.2, H - 0.2);
      const info = 'Pelanggaran ' + off.r.name + ' (akumulasi ' + T.fouls + ')';
      if (inPenArea(x, y, og)) { this.say('PENALTI!', 2); this.setSet('PEN', V.i, og === 0 ? 6 : W - 6, H / 2, { delay: 1.6 }); }
      else if (T.fouls >= 6) {
        this.say('TENDANGAN 10 METER', 2.2);
        if (Math.abs(x - og) < 10) this.setSet('FKD', V.i, x, y, { delay: 1.6, noWall: true });
        else this.setSet('PEN10', V.i, og === 0 ? 10 : W - 10, H / 2, { delay: 1.6 });
      } else this.setSet('FKD', V.i, x, y, { delay: 1.2 });
      this.note(card || info, 3);
    }
    restoreShort(T) {
      T.short = 0;
      const k = T.players.findIndex((p) => p.off);
      if (k < 0 || !T.bench.length) return;
      let bi = 0; T.bench.forEach((q, i) => { if (q.stam > T.bench[bi].stam) bi = i; });
      const q = T.bench.splice(bi, 1)[0], old = T.players[k];
      q.role = old.role; q.slot = old.slot; q.x = W / 2 + (T.dir > 0 ? -2 : 2); q.y = H - 0.5; q.vx = q.vy = 0;
      T.players[k] = q;
      this.note(T.data.name + ' kembali lengkap: ' + q.r.name + ' masuk', 2.5);
    }
    autoSubs() {
      if (this.o.autoSubs === false) return;
      for (const T of this.teams) for (let k = 1; k < 5; k++) {
        const p = T.players[k];
        if (p.off || p.stam > 45) continue;
        let bi = -1; T.bench.forEach((q, i) => { if (q.stam > 75 && (bi < 0 || q.stam > T.bench[bi].stam)) bi = i; });
        if (bi < 0) continue;
        const q = T.bench[bi];
        q.role = p.role; q.slot = p.slot; q.x = p.x; q.y = p.y; q.vx = q.vy = 0; q.f = p.f; q.runT = 0;
        T.players[k] = q; T.bench[bi] = p; p.role = null;
        if (this.ctrl[T.i] === p) this.ctrl[T.i] = q;
        this.note('🔁 ' + T.data.name + ': ' + q.r.name + ' masuk, ' + p.r.name + ' keluar', 2.5);
      }
    }

    /* ---------- player actions ---------- */
    passPoint(p, tx, ty, kind) {
      this.go();
      const b = this.ball, s = p.r.s;
      const dx = tx - b.x, dy = ty - b.y, d = Math.max(0.5, hyp(dx, dy));
      let a = Math.atan2(dy, dx);
      const err = (0.015 + ((100 - s.pas) / 100) * 0.11 + this.pressure(p) * 0.05) * (p.r.trait === 'Visi Umpan' ? 0.6 : 1) * (b.held ? 0.7 : 1) * this.aiErr(p);
      a += (rnd() * 2 - 1) * err;
      if (kind === 'lob') { const vh = clamp(5 + d * 0.62, 7, 16), t = d / vh; const vz = Math.min(8, (G * t) / 2); this.kick(p, Math.cos(a) * vh, Math.sin(a) * vh, vz, 'lob'); }
      else { const v = clamp(3.5 + d * 0.95, 6, kind === 'thru' ? 18 : 17) * (b.held ? 0.92 : 1); this.kick(p, Math.cos(a) * v, Math.sin(a) * v, b.held ? 0.6 : 0, kind); }
    }
    passTo(p, m, kind) {
      const T = this.teams[p.team];
      const lead = kind === 'thru' ? 0.9 : 0.35;
      let tx = m.x + m.vx * lead, ty = m.y + m.vy * lead;
      if (kind === 'thru') { tx += T.dir * 3; ty += (H / 2 - ty) * 0.15; m.runT = 1.8; m.runX = tx; m.runY = ty; }
      tx = clamp(tx, 0.6, W - 0.6); ty = clamp(ty, 0.6, H - 0.6);
      this.passPoint(p, tx, ty, kind);
      this.ball.intended = m;
      if (T.ctrl !== 'ai') this.ctrl[p.team] = m;
    }
    shoot(p, ty, c, chip) {
      this.go();
      const b = this.ball, T = this.teams[p.team], s = p.r.s, gx = this.attGX(T);
      ty = clamp(ty, GY0 + 0.18, GY1 - 0.18);
      const dx = gx - b.x, dy = ty - b.y, d = Math.max(1, hyp(dx, dy));
      let a = Math.atan2(dy, dx);
      const facing = Math.abs(angDiff(p.f, a));
      const roket = p.r.trait === 'Tembakan Roket' ? 1.1 : 1, dingin = p.r.trait === 'Penyelesai Dingin' ? 0.65 : 1;
      const err = (0.012 + ((100 - s.sho) / 100) * 0.075 + c * c * 0.04 + Math.min(facing, 2) * 0.03 + this.pressure(p) * 0.04) * dingin * this.aiErr(p);
      a += (rnd() * 2 - 1) * err;
      if (chip) {
        const vh = clamp(d * 0.85, 7, 13), t = d / vh, h = 1.1 + rnd() * 0.5;
        const vz = (h + (G * t * t) / 2) / t;
        this.kick(p, Math.cos(a) * vh, Math.sin(a) * vh, vz, 'shot');
      } else {
        const v = (13 + c * 15) * (0.72 + s.sho / 330) * roket;
        let h = 0.12 + rnd() * 1.4 * (0.4 + c * 0.6);
        if (c > 0.85 && rnd() < 0.35 * (1 - s.sho / 120)) h = GH + 0.2 + rnd() * 0.8;
        const t = d / v; const vz = Math.max(0, (h + (G * t * t) / 2) / t - 0.0);
        this.kick(p, Math.cos(a) * v, Math.sin(a) * v, Math.min(vz, 9), 'shot');
      }
    }
    setAct(p, a, d) { p.act = a; p.actT = 0; p.actD = d; }
    feint(p, mx, my) {
      if (p.acd > 0) return;
      let px = -Math.sin(p.f), py = Math.cos(p.f);
      if ((mx || my) ? mx * px + my * py < 0 : rnd() < 0.5) { px = -px; py = -py; }
      const lin = p.r.trait === 'Kaki Lincah' ? 1.25 : 1;
      const k = (2.6 + p.r.s.drb * 0.02) * lin;
      p.vx += px * k; p.vy += py * k; p.evade = 0.45 * lin; p.acd = 0.7; this.setAct(p, 8, 0.45);
      this.ev('skill');
    }

    /* ---------- human control ---------- */
    humanTick(t, dt) {
      const T = this.teams[t], b = this.ball, inp = this.inputs[t] || blankIn(), e = this.ed[t];
      let p = this.ctrl[t];
      if (b.owner && b.owner.team === t && b.owner !== p) p = this.ctrl[t] = b.owner;
      if (!p || p.off || (p.role === 'GK' && b.owner !== p)) p = this.ctrl[t] = this.nearestOut(T, b.x, b.y);
      if (!p) return;
      let mx = inp.mx || 0, my = inp.my || 0; const m = hyp(mx, my); if (m > 1) { mx /= m; my /= m; }
      const has = b.owner === p;
      p.sprint = !!inp.h.sprint;
      const sp = this.spd(p, p.sprint);
      if (m > 0.12 && p.dive <= 0 && p.slide <= 0) {
        p.dvx = mx * sp; p.dvy = my * sp;
        if (!has) p.f += clamp(angDiff(p.f, Math.atan2(my, mx)), -dt * 14, dt * 14);
      } else {
        p.dvx = 0; p.dvy = 0;
        if (!b.owner && b.intended === p) this.steerTo(p, b.x + b.vx * 0.25, b.y + b.vy * 0.25, 0);
      }
      if (has) {
        if (b.held && m > 0.12) { p.dvx *= 0.6; p.dvy *= 0.6; }
        if (p.role === 'GK' && T.gk4 > 2.8 && this.o.gkAssist !== false) { p.hold = 9; return this.aiGKBall(p, dt); } // bantuan: kiper melepas bola otomatis sebelum 4 detik
        const buf = this.buffer[t];
        this.buffer[t] = null;
        if (buf && this.time - buf.t < 0.5) return this.doAction(p, buf.a, inp, buf.c);
        if (e.p.pass) return this.humanPass(p, inp, 'pass');
        if (e.p.thru) return this.humanPass(p, inp, 'thru');
        if (e.p.lob) return this.humanLob(p, inp);
        if (e.p.skill && !b.held) this.feint(p, mx, my);
        if (e.p.shoot && !b.held) { this.charging[t] = true; this.charge[t] = 0; }
        if (this.charging[t]) {
          this.charge[t] = Math.min(1, this.charge[t] + dt * 1.15);
          if (e.r.shoot || !inp.h.shoot) { const c = Math.max(0.22, this.charge[t]); this.charging[t] = false; this.humanShoot(p, inp, c); }
        }
        return;
      }
      this.charging[t] = false;
      const oppHas = b.owner && b.owner.team !== t;
      if (oppHas) {
        if (e.p.pass || e.p.sw) this.switchCtrl(t, mx, my);
        p = this.ctrl[t];
        if (e.p.shoot) this.tackle(p, false);
        if (e.p.skill) this.tackle(p, true);
        if (this.phase !== 'play' || !b.owner || b.owner.team === t) { this.seenOwner[t] = b.owner; return; }
        this.pressHelp[t] = !!inp.h.lob;
        if (inp.h.thru && m < 0.12) {
          const o = b.owner, og = this.ownGX(T), a = Math.atan2(H / 2 - o.y, og - o.x);
          this.steerTo(p, o.x + Math.cos(a) * 1.5, o.y + Math.sin(a) * 1.5, 0); p.f = Math.atan2(o.y - p.y, o.x - p.x);
        }
        if (this.autoSwitch && this.seenOwner[t] !== b.owner) {
          const q = this.nearestOut(T, b.owner.x, b.owner.y);
          if (q && q !== p && hyp(p.x - b.x, p.y - b.y) > hyp(q.x - b.x, q.y - b.y) + 3.5) { this.ctrl[t] = q; this.ev('switch'); }
        }
      } else {
        this.pressHelp[t] = false;
        const mine = b.lastTeam === t && b.kind !== 'shot';
        if (e.p.sw) this.switchCtrl(t, mx, my);
        else if (mine && (e.p.pass || e.p.thru || e.p.lob || e.p.shoot)) {
          const a = e.p.pass ? 'pass' : e.p.thru ? 'thru' : e.p.lob ? 'lob' : 'shoot';
          this.buffer[t] = { a, t: this.time, c: 0.6 };
        } else if (e.p.pass) this.switchCtrl(t, mx, my);
        if (this.autoSwitch && !b.owner && !mine && !b.intended) {
          const q = this.nearestOut(T, b.x, b.y);
          if (q && q !== p && hyp(p.x - b.x, p.y - b.y) > hyp(q.x - b.x, q.y - b.y) + 4.5) this.ctrl[t] = q;
        }
      }
      this.seenOwner[t] = b.owner;
    }
    doAction(p, a, inp, c) {
      if (a === 'pass') return this.humanPass(p, inp, 'pass');
      if (a === 'thru') return this.humanPass(p, inp, 'thru');
      if (a === 'lob') return this.humanLob(p, inp);
      return this.humanShoot(p, inp, c);
    }
    switchCtrl(t, mx, my) {
      const T = this.teams[t], b = this.ball, cur = this.ctrl[t], m = hyp(mx, my);
      let best = null, bs = 1e9;
      for (const p of this.act(T)) {
        if (p === cur || p.role === 'GK') continue;
        let s = hyp(p.x - b.x, p.y - b.y);
        if (m > 0.3 && cur) s += Math.abs(angDiff(Math.atan2(my, mx), Math.atan2(p.y - cur.y, p.x - cur.x))) * 6;
        if (s < bs) { bs = s; best = p; }
      }
      if (best) { this.ctrl[t] = best; this.ev('switch'); }
    }
    humanPass(p, inp, kind) {
      const T = this.teams[p.team], b = this.ball;
      let dx = inp.mx || 0, dy = inp.my || 0;
      if (hyp(dx, dy) < 0.2) { dx = Math.cos(p.f); dy = Math.sin(p.f); }
      const a = Math.atan2(dy, dx);
      let best = null, bs = -1e9;
      for (const m of this.act(T)) {
        if (m === p) continue;
        const vx = m.x - p.x, vy = m.y - p.y, d = hyp(vx, vy);
        if (d < 1.4) continue;
        const da = Math.abs(angDiff(a, Math.atan2(vy, vx)));
        if (da > 0.95) continue;
        let s = -da * 2.4 - d * 0.035;
        if (m.role === 'GK') { if (b.gkRel === T.i || p.role === 'GK') continue; s -= 1.2; }
        if (s > bs) { bs = s; best = m; }
      }
      if (best) this.passTo(p, best, kind);
      else this.passPoint(p, b.x + Math.cos(a) * 9, b.y + Math.sin(a) * 9, kind === 'lob' ? 'lob' : 'pass');
    }
    humanLob(p, inp) {
      const T = this.teams[p.team], gx = this.attGX(T), dG = hyp(gx - p.x, H / 2 - p.y), aG = Math.atan2(H / 2 - p.y, gx - p.x);
      const dx = inp.mx || 0, dy = inp.my || 0;
      const dir = hyp(dx, dy) > 0.2 ? Math.atan2(dy, dx) : p.f;
      if (this.phase === 'play' && p.role !== 'GK' && dG < 13 && dG > 4 && Math.abs(angDiff(dir, aG)) < 0.6) { this.note('Chip!', 1); return this.shoot(p, H / 2 + dy * 0.8, 0.5, true); }
      this.humanPass(p, inp, 'lob');
    }
    humanShoot(p, inp, c) {
      const O = this.teams[1 - p.team], gk = O.players[0];
      const my = inp.my || 0;
      let ty;
      if (Math.abs(my) > 0.15) ty = H / 2 + clamp(my, -1, 1) * 1.35;
      else ty = H / 2 + clamp((H / 2 - (gk.off ? H / 2 : gk.y)) * 0.8, -1.2, 1.2);
      this.shoot(p, ty, c, false);
    }

    /* ---------- AI ---------- */
    aiTick(dt) {
      const b = this.ball;
      for (const T of this.teams) {
        const hum = T.ctrl !== 'ai' ? this.ctrl[T.i] : null;
        const poss = b.owner ? b.owner.team === T.i : false;
        const opp = b.owner && b.owner.team !== T.i ? b.owner : null;
        const outs = this.act(T).filter((p) => p.role !== 'GK');
        let chaser = null, presser = null;
        if (!b.owner) {
          if (b.intended && b.intended.team === T.i) { if (b.intended !== hum) chaser = b.intended; }
          else {
            let bd = 1e9;
            for (const p of outs) { const d = hyp(b.x + b.vx * 0.35 - p.x, b.y + b.vy * 0.35 - p.y); if (d < bd) { bd = d; chaser = p; } }
            if (chaser === hum) chaser = null;
          }
        } else if (opp && !b.held) {
          const ai = outs.filter((p) => p !== hum).sort((a, c) => hyp(a.x - opp.x, a.y - opp.y) - hyp(c.x - opp.x, c.y - opp.y));
          if (!hum || hyp(hum.x - opp.x, hum.y - opp.y) > 3.5 || this.pressHelp[T.i]) presser = ai[0] || null;
        }
        for (const p of this.act(T)) {
          if (p === hum) continue;
          if (p.runT > 0) p.runT -= dt;
          if (p.role === 'GK') { if (b.owner === p) this.aiGKBall(p, dt); else this.aiGK(p, dt); continue; }
          if (b.owner === p) { this.aiOnBall(p, dt); continue; }
          if (p.dive > 0 || p.slide > 0) continue;
          if (p === chaser) { this.steerTo(p, b.x + b.vx * 0.3, b.y + b.vy * 0.3, 1); continue; }
          if (p === presser) {
            const og = this.ownGX(T), a = Math.atan2(H / 2 - opp.y, og - opp.x);
            this.steerTo(p, opp.x + Math.cos(a) * 0.9, opp.y + Math.sin(a) * 0.9, 1);
            p.f = Math.atan2(opp.y - p.y, opp.x - p.x);
            if (hyp(opp.x - p.x, opp.y - p.y) < 1.15 && p.tcd <= 0 && rnd() < dt * (0.7 + 1.6 * this.skill(T))) { this.tackle(p, false); if (this.phase !== 'play') return; }
            continue;
          }
          const tg = this.shapeTarget(p, poss, b.x, b.y);
          const d = hyp(tg.x - p.x, tg.y - p.y);
          this.steerTo(p, tg.x, tg.y, d > 5 ? 1 : 0, d > 1.5 ? 1 : 0.6);
          if (hyp(p.vx, p.vy) < 1) p.f += clamp(angDiff(p.f, Math.atan2(b.y - p.y, b.x - p.x)), -dt * 6, dt * 6);
        }
      }
    }
    shapeTarget(p, poss, bx, by) {
      const T = this.teams[p.team], ub = this.u(T, bx);
      let u, y;
      switch (p.role) {
        case 'FIXO': u = poss ? clamp(ub - 6.5, 4, 21) : clamp(ub - 4.5, 3, 13); y = poss ? lerp(H / 2, by, 0.35) : lerp(H / 2, by, 0.55); break;
        case 'ALA_L': case 'ALA_R': {
          const top = (p.role === 'ALA_L') === (T.dir > 0);
          u = poss ? clamp(ub + 0.5, 7, 32) : clamp(ub - 2.5, 4, 20);
          y = poss ? (top ? 2.6 : H - 2.6) : lerp(top ? 5.5 : H - 5.5, by, 0.4); break;
        }
        case 'PIVOT': u = poss ? clamp(ub + 6.5, 15, 35.5) : clamp(ub + 0.5, 9, 24); y = poss ? lerp(H / 2, H - by, 0.25) : lerp(H / 2, by, 0.6); break;
        default: u = 6; y = H / 2;
      }
      if (poss && p.runT > 0) return { x: clamp(p.runX, 0.8, W - 0.8), y: clamp(p.runY, 0.8, H - 0.8) };
      if (poss && p.runT <= 0 && p.role !== 'FIXO' && rnd() < 0.004) {
        p.runT = 1.6; p.runX = this.fromU(T, Math.min(36, u + 4 + rnd() * 3)); p.runY = clamp(y + (H / 2 - y) * 0.6 + (rnd() - 0.5) * 3, 1, H - 1);
      }
      let x = this.fromU(T, u);
      if (!poss) {
        const O = this.teams[1 - p.team]; let best = null, bd = 6;
        for (const o of this.act(O)) { if (o.role === 'GK' || o === this.ball.owner) continue; const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
        if (best) { const og = this.ownGX(T), a = Math.atan2(H / 2 - best.y, og - best.x); x = lerp(x, best.x + Math.cos(a) * 1.2, 0.55); y = lerp(y, best.y + Math.sin(a) * 1.2, 0.55); }
      }
      if (poss && this.ball.owner && this.ball.owner !== p) {
        const o = this.ball.owner, d = hyp(x - o.x, y - o.y);
        if (d < 4 && d > 0.01) { x = o.x + ((x - o.x) / d) * 4; y = o.y + ((y - o.y) / d) * 4; }
      }
      return { x: clamp(x, 0.7, W - 0.7), y: clamp(y, 0.7, H - 0.7) };
    }
    spaceAhead(p) {
      const T = this.teams[p.team]; let d = 6;
      for (const o of this.act(this.teams[1 - p.team])) {
        const dx = o.x - p.x, dy = o.y - p.y, dd = hyp(dx, dy);
        if (dx * T.dir > 0 && Math.abs(Math.atan2(dy, dx * T.dir)) < 1.05) d = Math.min(d, dd);
      }
      return clamp(d / 6, 0, 1);
    }
    shotOpen(p) {
      const T = this.teams[p.team], gx = this.attGX(T); let d = 9;
      for (const o of this.act(this.teams[1 - p.team])) { if (o.role === 'GK') continue; d = Math.min(d, segDist(o.x, o.y, p.x, p.y, gx, H / 2)); }
      return clamp((d - 0.3) / 1.2, 0, 1);
    }
    bestPass(p) {
      const T = this.teams[p.team], O = this.teams[1 - p.team], b = this.ball, opps = this.act(O);
      let best = null;
      const pr = this.pressure(p);
      for (const m of this.act(T)) {
        if (m === p) continue;
        if (m.role === 'GK' && (b.gkRel === T.i || p.role === 'GK' || pr < 0.7 || this.u(T, p.x) > W / 2)) continue;
        const tx = clamp(m.x + m.vx * 0.35, 0.5, W - 0.5), ty = clamp(m.y + m.vy * 0.35, 0.5, H - 0.5);
        const d = hyp(tx - b.x, ty - b.y);
        if (d < 2.2 || d > 24) continue;
        let lane = 9, recv = 9;
        for (const o of opps) { lane = Math.min(lane, segDist(o.x, o.y, b.x, b.y, tx, ty)); recv = Math.min(recv, hyp(o.x - tx, o.y - ty)); }
        const s1 = clamp((lane - 0.45) / 2, 0, 1), s2 = clamp((recv - 0.7) / 3, 0, 1);
        const prog = (this.u(T, tx) - this.u(T, b.x)) / 9;
        const shotPot = hyp(this.attGX(T) - tx, H / 2 - ty) < 9 ? 0.3 : 0;
        let sc = s1 * 0.6 + s2 * 0.45 + prog * 0.5 + shotPot - (d > 15 ? 0.2 : 0);
        if (s1 < 0.25) sc -= 0.7;
        let kind = 'pass';
        if (s1 < 0.35 && d > 7 && recv > 2) { kind = 'lob'; sc += 0.6; }
        if (!best || sc > best.s) best = { p: m, s: sc, kind };
        if (m.runT > 0 && m.role !== 'GK') {
          const ux = clamp(tx + T.dir * 3, 0.8, W - 0.8); let l2 = 9;
          for (const o of opps) l2 = Math.min(l2, segDist(o.x, o.y, b.x, b.y, ux, ty));
          const s3 = clamp((l2 - 0.45) / 2, 0, 1), sc2 = s3 * 0.6 + 0.3 + prog * 0.5 + 0.25;
          if (s3 > 0.4 && sc2 > best.s) best = { p: m, s: sc2, kind: 'thru' };
        }
      }
      return best;
    }
    aiOnBall(p, dt) {
      const T = this.teams[p.team], sk = this.skill(T);
      const gx = this.attGX(T), gy = H / 2, dG = hyp(gx - p.x, gy - p.y), pr = this.pressure(p);
      p.aiT -= dt;
      if (p.aiT <= 0) {
        p.aiT = lerp(0.5, 0.2, sk) + rnd() * 0.2;
        let bestS = 0.35 + this.spaceAhead(p) * 0.6 - pr * 0.6 + (this.u(T, p.x) > W - 12 ? 0.1 : 0), act = null;
        if (dG < 17 && this.u(T, p.x) > W / 2 - 2) {
          const open = this.shotOpen(p), ang = Math.abs(Math.atan2(gy - p.y, Math.abs(gx - p.x)));
          const s = (1 - dG / 18) * 1.5 * (0.35 + open * 0.65) + (dG < 8 ? 0.4 : 0) - ang * 0.2;
          if (s > bestS) { bestS = s; act = () => this.aiShoot(p, false); }
        }
        const bp = this.bestPass(p);
        if (bp) { const s = bp.s + pr * 0.35; if (s > bestS) { bestS = s; act = () => this.passTo(p, bp.p, bp.kind); } }
        if (act && rnd() < 0.65 + sk * 0.35) { act(); return; }
        if (pr > 0.6 && rnd() < 0.3 * sk) this.feint(p, 0, 0);
      }
      let tx = gx - T.dir * 2, ty = gy + (p.y - gy) * 0.5;
      if (this.u(T, p.x) > W - 8) { ty = gy + (p.y < gy ? -1 : 1) * 1.5; tx = gx - T.dir * 4; }
      let ax = 0, ay = 0;
      for (const o of this.act(this.teams[1 - p.team])) { const dx = p.x - o.x, dy = p.y - o.y, d = hyp(dx, dy); if (d < 3 && d > 0.01) { const w = (3 - d) / 3; ax += (dx / d) * w; ay += (dy / d) * w; } }
      const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy) || 1;
      let vx = dx / d + ax * 1.3, vy = dy / d + ay * 1.3;
      if (p.y < 1.5) vy += 0.8; if (p.y > H - 1.5) vy -= 0.8; if (p.x < 1.2) vx += 0.8; if (p.x > W - 1.2) vx -= 0.8;
      const vl = hyp(vx, vy) || 1;
      p.sprint = this.spaceAhead(p) > 0.6 && p.stam > 30;
      const sp = this.spd(p, p.sprint);
      p.dvx = (vx / vl) * sp; p.dvy = (vy / vl) * sp;
    }
    aiShoot(p, pen) {
      const T = this.teams[p.team], O = this.teams[1 - p.team], gk = O.players[0];
      const gy = gk.off ? H / 2 : gk.y;
      let ty = gy < H / 2 ? GY1 - 0.35 : GY0 + 0.35;
      if (rnd() < 0.25) ty = H / 2 + (rnd() - 0.5) * 2;
      const gx = this.attGX(T), dG = hyp(gx - p.x, H / 2 - p.y);
      const gkOut = gk.off ? 0 : Math.abs(gk.x - this.ownGX(O));
      const chip = !pen && gkOut > 3 && dG < 13 && dG > 5 && rnd() < 0.6;
      const c = pen ? 0.55 + rnd() * 0.35 : clamp(0.35 + dG / 25 + rnd() * 0.3, 0.3, 1);
      p.f = Math.atan2(ty - p.y, gx - p.x);
      this.shoot(p, ty, c, chip);
    }
    aiGK(g, dt) {
      const T = this.teams[g.team], gx = this.ownGX(T), b = this.ball;
      if (g.dive > 0) return;
      const sp = hyp(b.vx, b.vy);
      const toward = gx === 0 ? b.vx < -2 : b.vx > 2;
      if (!b.owner && toward && sp > 6) {
        const tl = gx === 0 ? (b.x - g.x) / -b.vx : (g.x - b.x) / b.vx;
        if (tl > 0 && tl < 1.5) {
          const py = b.y + b.vy * tl;
          if (py > GY0 - 1 && py < GY1 + 1) {
            const dy = py - g.y;
            const react = T.ctrl === 'ai' ? [0.32, 0.42, 0.5][this.diff] : 0.45;
            if (Math.abs(dy) > 0.55 && g.diveCd <= 0 && tl < react) { g.dive = 0.35; g.dvY = Math.sign(dy) * Math.min(8.5, Math.abs(dy) / 0.28); g.dvX = 0; g.diveCd = 1.2; this.ev('dive'); }
            else { g.dvx = 0; g.dvy = clamp(dy * 9, -8, 8); }
            g.f = Math.atan2(b.y - g.y, b.x - g.x);
            return;
          }
        }
      }
      if (!b.owner && inPenArea(b.x, b.y, gx) && sp < 10 && b.lastTeam !== T.i) {
        const dg = hyp(b.x - g.x, b.y - g.y); let od = 9;
        for (const o of this.act(this.teams[1 - g.team])) od = Math.min(od, hyp(o.x - b.x, o.y - b.y));
        if (dg < 5 && dg < od + 0.8) { this.steerTo(g, b.x, b.y, 1, 1.15); return; }
      }
      const ang = Math.atan2(b.y - H / 2, b.x - gx), bd = hyp(b.x - gx, b.y - H / 2);
      const r = clamp(0.6 + bd * 0.06, 0.7, 2.2);
      let tx = gx + Math.cos(ang) * r, ty = clamp(H / 2 + Math.sin(ang) * r, GY0 - 0.4, GY1 + 0.4);
      tx = gx === 0 ? Math.max(tx, 0.45) : Math.min(tx, W - 0.45);
      this.steerTo(g, tx, ty, 0, 1.1);
      g.f = Math.atan2(b.y - g.y, b.x - g.x);
    }
    aiGKBall(g, dt) {
      const T = this.teams[g.team], b = this.ball;
      g.dvx = 0; g.dvy = 0; g.hold += dt;
      const pr = this.pressure(g);
      if (g.hold > (b.held ? 1.1 + rnd() * 0.6 : pr > 0.3 ? 0.25 : 0.7)) {
        const bp = this.bestPass(g);
        if (bp && bp.s > 0.15) this.passTo(g, bp.p, bp.kind === 'thru' ? 'pass' : bp.kind);
        else this.passPoint(g, this.fromU(T, 22), rnd() < 0.5 ? 4 : 16, 'lob');
      }
    }

    /* ---------- views ---------- */
    recordReplay() { this.replay.push(this.posFrame()); if (this.replay.length > 420) this.replay.shift(); }
    posFrame() {
      const b = this.ball, r2 = (v) => Math.round(v * 100) / 100, P = [];
      for (const T of this.teams) for (const p of T.players) {
        let fl = 0;
        if (b.owner === p) fl |= 1;
        if (T.ctrl !== 'ai' && this.ctrl[p.team] === p) fl |= 2;
        if (p.dive > 0 || p.slide > 0) fl |= 4;
        if (b.owner === p && b.held) fl |= 8;
        if (p.off) fl |= 16;
        if (p.sprint && hyp(p.vx, p.vy) > 4) fl |= 32;
        if (p.yellow) fl |= 64;
        P.push([r2(p.x), r2(p.y), r2(p.f), r2(p.anim % 100), p.r.ri, fl, Math.round(p.stam), p.act, r2(p.actT)]);
      }
      return { b: [r2(b.x), r2(b.y), r2(b.z), r2(b.rot % 100)], p: P };
    }
    view() {
      let pos = this.posFrame(), rp = 0;
      if (this.phase === 'replay') { const i = Math.min(Math.floor(this.rpI), this.replay.length - 1); pos = this.replay[i] || pos; rp = 1; }
      const s = this.setpiece, b = this.ball;
      return {
        b: pos.b, p: pos.p, rp, cs: this.cutSeq, ph: this.phase,
        sc: [this.teams[0].score, this.teams[1].score],
        ck: Math.ceil((this.clock / this.halfLen) * 1200), hf: this.half,
        fo: [this.teams[0].fouls, this.teams[1].fouls], d0: this.teams[0].dir,
        sp: s ? { t: s.type, tm: s.team, cd: FOUR_SEC[s.type] && s.ready ? Math.ceil(Math.max(0, s.cd)) : 0 } : null,
        bn: this.banner, tt: this.toast,
        ch: [this.charging[0] ? r1(this.charge[0]) : 0, this.charging[1] ? r1(this.charge[1]) : 0],
        at: [this.attacking(0) ? 1 : 0, this.attacking(1) ? 1 : 0],
        g4: this.teams.map((T) => (b.owner && b.owner.team === T.i && b.owner.role === 'GK' && T.gk4 > 0 ? Math.ceil(4 - T.gk4) : 0)),
        sh: r1(this.shake), sh2: [this.teams[0].short > 0 ? 1 : 0, this.teams[1].short > 0 ? 1 : 0]
      };
    }
    result() {
      return { score: [this.teams[0].score, this.teams[1].score], goals: this.goals, stats: this.stats, teams: [this.teams[0].id, this.teams[1].id] };
    }
  }
  function r1(v) { return Math.round(v * 100) / 100; }
  FG.Match = Match;
})();
