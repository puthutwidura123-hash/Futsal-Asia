/* Futsal Asia Pro — renderer 3D siaran TV (WebGL / Three.js)
 * - Pemain 3D bertulang (pinggul, tulang belakang, leher, bahu, siku, paha, lutut, pergelangan)
 * - Animasi prosedural: diam/bernapas, jog, sprint, dribel, ancang-ancang tembakan, tendang, umpan,
 *   chip, tekel, sliding, gerak tipu, kiper siaga/lompat/tangkap/lempar, selebrasi, pemain cadangan duduk
 * - Stadion: lantai kayu, gawang berjaring, papan iklan, tribun penonton, 2 wasit, bayangan real-time
 * - Kamera siaran yang mengikuti bola + kamera sinematik untuk replay & selebrasi gol
 * Koordinat: x game → x Three, y game (lebar lapangan) → z Three, tinggi → y Three. */
(function () {
  'use strict';
  const FG = window.FG;
  if (!window.THREE) { FG.Renderer3D = null; return; }
  const T3 = window.THREE;
  const { W, H, GY0, GY1, GH } = FG.C;
  const M = 2.6;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  function angD(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }
  function shadeHex(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + ((1 << 24) + (f((n >> 16) & 255) << 16) + (f((n >> 8) & 255) << 8) + f(n & 255)).toString(16).slice(1); }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- geometry helpers ---------- */
  const GC = {};
  function lathe(key, pts, seg) {
    if (!GC[key]) GC[key] = new T3.LatheGeometry(pts.map((p) => new T3.Vector2(p[0], p[1])), seg || 16);
    return GC[key];
  }
  // tapered limb hanging down from y=0 to y=-len (points ordered bottom → top)
  function limb(key, len, r0, r1, bulge, bulgeAt) {
    const k = 'L' + key;
    if (GC[k]) return GC[k];
    const pts = [[0, -len - r1 * 0.85], [r1 * 0.75, -len - r1 * 0.5]];
    const n = 7, ba = bulgeAt == null ? 0.4 : bulgeAt;
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const bump = Math.exp(-Math.pow((t - ba) / 0.28, 2)) * bulge;
      pts.push([(r0 + (r1 - r0) * t) * (1 + bump), -len * t]);
    }
    pts.push([r0 * 0.75, r0 * 0.5]); pts.push([0, r0 * 0.85]);
    return (GC[k] = lathe(k, pts, 10));
  }
  const sphere = (r, ws, hs) => { const k = 'S' + r + ws; return GC[k] || (GC[k] = new T3.SphereGeometry(r, ws || 14, hs || 10)); };

  /* ---------- textures ---------- */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T3.RepeatWrapping; }
    return t;
  }
  function jerseyTex(kit, r, gk) {
    return canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = kit[0]; g.fillRect(0, 0, w, h);
      // subtle fabric pattern
      g.globalAlpha = 0.07; g.fillStyle = lum(kit[0]) > 0.5 ? '#000' : '#fff';
      for (let i = 0; i < w; i += 6) g.fillRect(i, 0, 2, h);
      g.globalAlpha = 1;
      // side panels (u≈0.25 & 0.75 are the flanks)
      g.fillStyle = kit[1];
      g.fillRect(w * 0.22, 0, w * 0.06, h * 0.75); g.fillRect(w * 0.72, 0, w * 0.06, h * 0.75);
      // collar ring
      g.fillRect(0, 0, w, h * 0.06);
      const ink = lum(kit[0]) > 0.6 ? '#141414' : '#ffffff';
      // back: surname + big number (u = 0.5)
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      const sur = r.name.split(' ').slice(-1)[0].toUpperCase();
      g.font = '800 22px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(sur, w * 0.5, h * 0.2);
      g.font = '900 96px "Saira Condensed", Impact, sans-serif'; g.lineWidth = 4; g.strokeStyle = kit[1];
      if (!gk) g.strokeText(String(r.num), w * 0.5, h * 0.5);
      g.fillText(String(r.num), w * 0.5, h * 0.5);
      // front: small number + crest (u = 0 / 1 seam → draw at both edges)
      g.font = '900 40px "Saira Condensed", Impact, sans-serif';
      g.fillText(String(r.num), 0, h * 0.42); g.fillText(String(r.num), w, h * 0.42);
      g.beginPath(); g.arc(w * 0.92, h * 0.24, 9, 0, Math.PI * 2); g.fillStyle = kit[1]; g.fill();
    });
  }
  function ballTex() {
    return canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
      const cols = ['#f2b705', '#1b3f94'];
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % 2]; g.beginPath();
        const x = (i / 8) * w + 10, y = i % 2 ? h * 0.3 : h * 0.68;
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); }
        g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo((i / 12) * w, 0); g.lineTo((i / 12) * w + 20, h); g.stroke(); }
    });
  }
  function netTex() {
    const t = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
    }, true);
    return t;
  }
  function adTex(text, bg, fg) {
    return canvasTex(512, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, bg); gr.addColorStop(1, shadeHex(bg, 0.7));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = '900 40px "Saira Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  /* ---------- humanoid ---------- */
  const BOOTS = ['#111111', '#f4f4f4', '#ff3b6b', '#18e0b0', '#ffd23f', '#3d7bff', '#ff8a00'];
  function mat(color, rough, extra) { return new T3.MeshStandardMaterial(Object.assign({ color: new T3.Color(color).convertSRGBToLinear(), roughness: rough == null ? 0.7 : rough, metalness: 0 }, extra || {})); }

  /* gabungkan banyak geometri menjadi satu (opsional: warna per-vertex, UV, indeks tulang) */
  function mergeGeos(items, o) {
    let nv = 0, ni = 0;
    for (const it of items) { nv += it.g.attributes.position.count; ni += it.g.index ? it.g.index.count : it.g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const uv = o.uv ? new Float32Array(nv * 2) : null, col = o.color ? new Float32Array(nv * 3) : null;
    const si = o.skin ? new Uint16Array(nv * 4) : null, sw = o.skin ? new Float32Array(nv * 4) : null;
    const idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const it of items) {
      const g = it.g, P = g.attributes.position, n = P.count;
      pos.set(P.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      for (let k = 0; k < n; k++) {
        const v = vo + k;
        if (col) { col[v * 3] = it.c.r; col[v * 3 + 1] = it.c.g; col[v * 3 + 2] = it.c.b; }
        if (si) { si[v * 4] = it.bi; sw[v * 4] = 1; }
      }
      if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo; io += I.length; }
      else { for (let k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
      vo += n;
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    if (si) { geo.setAttribute('skinIndex', new T3.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T3.Float32BufferAttribute(sw, 4)); }
    geo.setIndex(new T3.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
  function transformed(mesh) { const g = mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld); return g; }
  /* Ubah kumpulan ±50 mesh kecil menjadi 2 SkinnedMesh (badan berwarna per-vertex + jersey bertekstur).
   * Draw call per pemain turun dari ±50 menjadi 2 — kunci kelancaran di HP. */
  function skinPlayer(root, tilt, bones, jerseyMat, bodyMat, shadows) {
    root.updateMatrixWorld(true);
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const body = [], jer = [];
    for (const m of meshes) {
      let b = m.parent; while (b && !b.isBone) b = b.parent;
      const it = { g: transformed(m), c: m.material.color, bi: Math.max(0, bones.indexOf(b)) };
      (m.material === jerseyMat ? jer : body).push(it);
    }
    for (const m of meshes) m.parent.remove(m);
    const gBody = mergeGeos(body, { color: true, skin: true }), gJer = mergeGeos(jer, { uv: true, skin: true });
    for (const it of body.concat(jer)) it.g.dispose();
    const skel = new T3.Skeleton(bones);
    const mBody = new T3.SkinnedMesh(gBody, bodyMat);
    root.remove(tilt); mBody.add(tilt); root.add(mBody);
    mBody.updateMatrixWorld(true); mBody.bind(skel);
    const mJer = new T3.SkinnedMesh(gJer, jerseyMat); root.add(mJer); mJer.updateMatrixWorld(true); mJer.bind(skel);
    for (const m of [mBody, mJer]) { m.frustumCulled = false; m.castShadow = !!shadows; }
    return [mBody, mJer];
  }

  function buildPlayer(opt) {
    // opt: {kit:[a,b], shorts, socks, skin, hair, hs, num, name, gk, ref, boots}
    const skin = mat(shadeHex(opt.skin, 0.8), 0.55), shirt = mat(opt.kit[0], 0.75), trim = mat(opt.kit[1], 0.7);
    const shorts = mat(opt.shorts, 0.8), socks = mat(opt.socks, 0.85), boot = mat(opt.boots, 0.35);
    const hair = mat(opt.hair, 0.95), dark = mat('#1a1010', 0.5);
    const JM = opt.lite ? T3.MeshLambertMaterial : T3.MeshStandardMaterial;
    const jersey = new JM(Object.assign({ map: jerseyTex(opt.kit, opt, opt.gk || opt.ref) }, opt.lite ? {} : { roughness: 0.75 }));
    const glove = mat(opt.gk ? opt.kit[1] : opt.skin, 0.6);
    const root = new T3.Group();
    const tilt = new T3.Bone(); root.add(tilt);
    const hips = new T3.Bone(); hips.position.y = 0.92; tilt.add(hips);
    const add = (parent, geo, m, x, y, z, sx, sy, sz) => { const o = new T3.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); if (sx) o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    // pelvis / shorts
    add(hips, lathe('pelvis', [[0, -0.13], [0.12, -0.11], [0.15, -0.04], [0.15, 0.04], [0.135, 0.08], [0, 0.09]]), opt.gk ? shorts : shorts, 0, 0, 0, 1, 1, 0.78);
    // spine + torso
    const spine = new T3.Bone(); spine.position.y = 0.06; hips.add(spine);
    add(spine, lathe('torso', [[0, -0.02], [0.13, 0], [0.135, 0.1], [0.15, 0.2], [0.17, 0.31], [0.188, 0.41], [0.18, 0.47], [0.13, 0.52], [0.065, 0.545], [0, 0.55]], 24), jersey, 0, 0, 0, 1.06, 1, 0.66);
    // neck & head
    const neck = new T3.Bone(); neck.position.y = 0.53; spine.add(neck);
    add(neck, limb('neck', 0.09, 0.048, 0.052, 0, 0.5), skin, 0, 0.09, 0);
    const head = new T3.Bone(); head.position.y = 0.09; neck.add(head);
    add(head, sphere(0.105, 16, 12), skin, 0, 0.1, 0.005, 0.95, 1.13, 1.05);
    add(head, sphere(0.04, 10, 8), skin, 0, 0.035, 0.05, 1.2, 0.8, 1); // jaw
    add(head, sphere(0.026, 8, 6), skin, 0.1, 0.1, -0.005, 0.5, 1, 0.8); add(head, sphere(0.026, 8, 6), skin, -0.1, 0.1, -0.005, 0.5, 1, 0.8); // ears
    add(head, sphere(0.016, 8, 6), dark, 0.037, 0.115, 0.098); add(head, sphere(0.016, 8, 6), dark, -0.037, 0.115, 0.098); // eyes
    add(head, sphere(0.018, 8, 6), skin, 0, 0.088, 0.112, 0.8, 1.2, 1); // nose
    add(head, sphere(0.02, 8, 6), hair, 0.038, 0.142, 0.096, 1.6, 0.35, 0.6); add(head, sphere(0.02, 8, 6), hair, -0.038, 0.142, 0.096, 1.6, 0.35, 0.6); // brows
    add(head, sphere(0.022, 8, 6), mat(shadeHex(opt.skin, 0.75), 0.6), 0, 0.055, 0.1, 1.3, 0.3, 0.6); // mouth
    // hair styles
    const hs = opt.hs;
    if (opt.ref) add(head, sphere(0.112, 16, 10), hair, 0, 0.13, -0.008, 0.98, 0.9, 1.04);
    else if (hs === 1) add(head, sphere(0.108, 16, 10), hair, 0, 0.125, -0.008, 0.98, 0.95, 1.04); // buzz
    else {
      add(head, sphere(0.115, 16, 10), hair, 0, 0.14, -0.01, 1.0, 0.85, 1.05);
      if (hs === 2) for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const c = add(head, new T3.ConeGeometry(0.03, 0.08, 6), hair, Math.cos(a) * 0.05, 0.22, Math.sin(a) * 0.05 - 0.01); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      if (hs === 3) { const f = add(head, sphere(0.06, 10, 8), hair, 0.03, 0.19, 0.07, 1.4, 0.45, 0.8); f.rotation.z = -0.3; }
      if (hs === 4) for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(head, sphere(0.04, 8, 6), hair, Math.cos(a) * 0.075, 0.17 + (i % 2) * 0.03, Math.sin(a) * 0.075 - 0.01); }
      if (hs === 0) add(head, sphere(0.05, 10, 8), hair, 0, 0.2, 0.05, 1.6, 0.5, 0.9);
    }
    // arms
    const arms = [];
    for (const s of [1, -1]) {
      const sh = new T3.Bone(); sh.position.set(0.185 * s, 0.455, 0); spine.add(sh);
      add(sh, sphere(0.06, 12, 8), shirt, 0, -0.01, 0, 1, 0.9, 0.95); // deltoid
      add(sh, limb('uarm', 0.27, 0.046, 0.036, 0.18, 0.35), skin);
      add(sh, limb(opt.gk || opt.ref ? 'sleeveL' : 'sleeve', opt.gk ? 0.27 : 0.13, 0.058, 0.052, 0.05, 0.4), opt.gk ? shirt : shirt);
      const el = new T3.Bone(); el.position.y = -0.27; sh.add(el);
      add(el, limb('farm', 0.25, 0.037, 0.027, 0.22, 0.25), opt.gk ? shirt : skin);
      add(el, sphere(opt.gk ? 0.055 : 0.04, 10, 8), glove, 0, -0.29, 0.005, 0.85, 1.15, 0.7);
      arms.push({ sh, el });
    }
    // legs
    const legs = [];
    for (const s of [1, -1]) {
      const th = new T3.Bone(); th.position.set(0.09 * s, -0.04, 0); hips.add(th);
      add(th, limb('thigh', 0.42, 0.078, 0.05, 0.22, 0.3), skin);
      add(th, limb(opt.gk ? 'pantsL' : 'shortleg', opt.gk ? 0.42 : 0.2, 0.092, opt.gk ? 0.06 : 0.088, 0.04, 0.4), shorts);
      const kn = new T3.Bone(); kn.position.y = -0.42; th.add(kn);
      add(kn, limb('shin', 0.42, 0.052, 0.032, 0.32, 0.25), skin);
      const sk = add(kn, limb('sock', 0.3, 0.056, 0.038, 0.2, 0.15), socks, 0, -0.1, 0);
      add(sk, limb('sockband', 0.04, 0.058, 0.058, 0, 0.5), trim, 0, 0.01, 0);
      const an = new T3.Bone(); an.position.y = -0.42; kn.add(an);
      add(an, sphere(0.055, 12, 8), boot, 0, -0.035, 0.045, 0.85, 0.62, 2.0);
      add(an, sphere(0.03, 8, 6), mat(lum(opt.boots) > 0.5 ? '#111' : '#fff', 0.4), 0.045 * s, -0.035, 0.05, 0.3, 0.6, 1.8); // boot stripe
      legs.push({ th, kn, an });
    }
    const bones = [tilt, hips, spine, neck, head, arms[0].sh, arms[0].el, arms[1].sh, arms[1].el, legs[0].th, legs[0].kn, legs[0].an, legs[1].th, legs[1].kn, legs[1].an];
    skinPlayer(root, tilt, bones, jersey, opt.bodyMat, opt.shadows);
    root.userData = { tilt, hips, spine, neck, head, arms, legs, pose: null, phase: Math.random() * 6, px: null, py: null, spd: 0, vx: 0, vy: 0, rotY: 0, lastT: 0 };
    return root;
  }

  /* pose = target joint angles; smoothed every frame */
  function blankPose() {
    return { hipsY: 0.92, hipsRY: 0, hipsRZ: 0, spX: 0.05, spY: 0, spZ: 0, hdX: 0, hdY: 0, tiltX: 0, tiltZ: 0,
      thX: [0, 0], thZ: [0, 0], knX: [0.1, 0.1], anX: [0, 0], shX: [0, 0], shZ: [0.12, -0.12], elX: [-0.25, -0.25] };
  }
  function applyPose(u, P, k) {
    const c = u.pose || (u.pose = blankPose());
    for (const key in P) {
      if (Array.isArray(P[key])) for (let i = 0; i < 2; i++) c[key][i] = lerp(c[key][i], P[key][i], k);
      else c[key] = lerp(c[key], P[key], k);
    }
    u.hips.position.y = c.hipsY; u.hips.rotation.set(0, c.hipsRY, c.hipsRZ);
    u.spine.rotation.set(c.spX, c.spY, c.spZ);
    u.head.rotation.set(c.hdX, c.hdY, 0);
    u.tilt.rotation.set(c.tiltX, 0, c.tiltZ);
    for (let i = 0; i < 2; i++) {
      u.legs[i].th.rotation.set(c.thX[i], 0, c.thZ[i]);
      u.legs[i].kn.rotation.x = c.knX[i];
      u.legs[i].an.rotation.x = c.anX[i];
      u.arms[i].sh.rotation.set(c.shX[i], 0, c.shZ[i]);
      u.arms[i].el.rotation.x = c.elX[i];
    }
  }

  class Renderer3D {
    /* quality: 'auto' | 'high' | 'med' | 'low'
     *  high = bayangan asli + material PBR + antialias (PC)
     *  med  = bayangan bulat (blob) + material ringan (HP)
     *  low  = seperti med + resolusi 1x, tanpa efek lampu sorot */
    constructor(canvas, overlay, quality) {
      this.cv = canvas; this.ov = overlay; this.zoom = 15; this.cfgKey = '';
      const mobile = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
      this.auto = !quality || quality === 'auto';
      this.q = this.auto ? (mobile ? 1 : 2) : { high: 2, med: 1, low: 0 }[quality];
      this.lite = this.q < 2;
      this.r = new T3.WebGLRenderer({ canvas, antialias: this.q === 2, powerPreference: 'high-performance', stencil: false });
      this.pr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][this.q]);
      this.r.setPixelRatio(this.pr);
      this.r.outputEncoding = T3.sRGBEncoding;
      this.r.toneMapping = T3.ACESFilmicToneMapping; this.r.toneMappingExposure = this.lite ? 0.95 : 0.86;
      this.shadows = this.q === 2;
      this.r.shadowMap.enabled = this.shadows; this.r.shadowMap.type = T3.PCFShadowMap; this.r.shadowMap.autoUpdate = true;
      this.bodyMat = this.lite ? new T3.MeshLambertMaterial({ vertexColors: true }) : new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
      this.scene = new T3.Scene();
      this.scene.background = new T3.Color('#04080f');
      this.scene.fog = new T3.Fog('#04080f', 45, 95);
      this.cam = new T3.PerspectiveCamera(32, 16 / 9, 0.1, 200);
      this.camPos = new T3.Vector3(W / 2, 12, H + 18); this.camLook = new T3.Vector3(W / 2, 0, H / 2);
      this.perf = { acc: 0, n: 0, slow: 0 };
      this.v3 = [new T3.Vector3(), new T3.Vector3(), new T3.Vector3()]; this.qtmp = new T3.Quaternion();
      this.buildArena(mobile);
      this.figs = []; this.refs = [];
      this.parts = null; this.time = 0;
      this.tmp = new T3.Vector3();
      this.resize();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.r.setSize(this.w, this.h, false);
      this.cam.aspect = this.w / this.h; this.cam.fov = this.h > this.w ? 52 : 30; this.cam.updateProjectionMatrix();
    }
    setZoom(z) { this.zoom = z; }

    buildArena(mobile) {
      const S = this.scene;
      S.add(new T3.HemisphereLight(0xdde7ff, 0x1a1f2a, this.lite ? 0.75 : 0.5));
      const sun = new T3.DirectionalLight(0xfff6e8, this.lite ? 1.0 : 1.2);
      sun.position.set(W / 2 - 10, 32, H / 2 + 14); sun.target.position.set(W / 2, 0, H / 2);
      sun.castShadow = this.shadows; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 18, bottom: -18, near: 5, far: 80 });
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
      S.add(sun); S.add(sun.target); this.sun = sun;
      if (!this.lite) { const fill = new T3.DirectionalLight(0x9fb8ff, 0.35); fill.position.set(W / 2 + 15, 18, -10); S.add(fill); }
      // floor
      const tmp2d = new FG.Renderer(document.createElement('canvas'));
      const pt = new T3.CanvasTexture(tmp2d.pitchSide); pt.encoding = T3.sRGBEncoding; pt.anisotropy = this.r.capabilities.getMaxAnisotropy();
      this.stands2d = tmp2d.stands;
      const court = new T3.Mesh(new T3.PlaneGeometry(W + 2 * M, H + 2 * M), this.lite ? new T3.MeshLambertMaterial({ map: pt }) : new T3.MeshStandardMaterial({ map: pt, roughness: 0.42, metalness: 0.05 }));
      court.rotation.x = -Math.PI / 2; court.position.set(W / 2, 0, H / 2); court.receiveShadow = true; S.add(court);
      const outer = new T3.Mesh(new T3.PlaneGeometry(140, 100), new T3.MeshBasicMaterial({ color: new T3.Color('#0d141f').convertSRGBToLinear() })); outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.01, H / 2); outer.receiveShadow = true; S.add(outer);
      // ad boards
      const ads = [['LIGA FUTSAL ASIA', '#c81e3a', '#fff'], ['FAIR PLAY', '#0d1d38', '#ffd23f'], ['FUTSAL ASIA PRO', '#0d1d38', '#22e3ff'], ['RESPECT', '#c81e3a', '#fff'], ['GARUDA · SAMURAI · SINGA', '#13294b', '#fff']];
      const adMats = ads.map((a) => new T3.MeshBasicMaterial({ map: adTex(a[0], a[1], a[2]), color: 0xdddddd }));
      const adGeo = new T3.PlaneGeometry(7.2, 0.85);
      const board = (x, z, w, rotY, i) => { const m = new T3.Mesh(adGeo, adMats[i % ads.length]); m.position.set(x, 0.43, z); m.rotation.y = rotY; S.add(m); };
      for (let i = 0; i < 6; i++) board(-1.2 + i * 7.4 + 3.6, -1.5, 7.2, 0, i);
      for (let i = 0; i < 3; i++) { board(-2.3, 2.5 + i * 7.5, 7.2, Math.PI / 2, i + 1); board(W + 2.3, 2.5 + i * 7.5, 7.2, -Math.PI / 2, i + 3); }
      // stands (tiers with crowd)
      const crowd = new T3.CanvasTexture(this.stands2d); crowd.encoding = T3.sRGBEncoding; crowd.wrapS = T3.RepeatWrapping;
      const stand = (w, cx, cz, rotY, rep) => {
        const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(rep, 1);
        const m = new T3.Mesh(new T3.PlaneGeometry(w, 14), new T3.MeshBasicMaterial({ map: t, color: 0x9a9a9a }));
        m.position.set(cx, 4.2, cz); m.rotation.set(-0.62, rotY, 0, 'YXZ'); S.add(m);
        const base = new T3.Mesh(new T3.BoxGeometry(w, 1.2, 1), new T3.MeshBasicMaterial({ color: 0x050a12 })); base.position.set(cx, 0.6, cz + (rotY === 0 ? 4.5 : rotY === Math.PI ? -4.5 : 0)); base.rotation.y = rotY; S.add(base);
      };
      stand(W + 30, W / 2, -8.5, 0, 3);
      const s2 = new T3.Mesh(new T3.PlaneGeometry(H + 20, 14), new T3.MeshBasicMaterial({ map: crowd, color: 0x9a9a9a })); s2.position.set(-9.5, 4.2, H / 2); s2.rotation.set(0, Math.PI / 2, 0); s2.rotateX(-0.62); S.add(s2);
      const s3 = s2.clone(); s3.position.set(W + 9.5, 4.2, H / 2); s3.rotation.set(0, -Math.PI / 2, 0); s3.rotateX(-0.62); S.add(s3);
      // floodlight glows
      const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
      if (this.q > 0) for (let i = 0; i < 9; i++) { const sp = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, depthWrite: false, transparent: true, blending: T3.AdditiveBlending })); sp.position.set(-6 + i * 6.5, 14, -14); sp.scale.set(3.5, 3.5, 1); S.add(sp); }
      // goals
      this.netMat = new T3.MeshBasicMaterial({ map: netTex(), transparent: true, side: T3.DoubleSide, depthWrite: false, opacity: 0.85 });
      this.buildGoal(0, -1); this.buildGoal(W, 1);
      // benches
      for (const x of [W / 2 - 8.5, W / 2 + 8.5]) {
        const b = new T3.Mesh(new T3.BoxGeometry(6, 0.45, 0.6), new T3.MeshLambertMaterial({ color: 0x22324d })); b.position.set(x, 0.23, -2.6); S.add(b);
        const back = new T3.Mesh(new T3.PlaneGeometry(6, 1.1), new T3.MeshBasicMaterial({ color: 0x9fd5ff, transparent: true, opacity: 0.18, depthWrite: false })); back.position.set(x, 1.0, -2.95); S.add(back);
      }
      // ball
      const bt = ballTex();
      this.ball = new T3.Mesh(new T3.SphereGeometry(0.11, 20, 14), this.lite ? new T3.MeshLambertMaterial({ map: bt }) : new T3.MeshStandardMaterial({ map: bt, roughness: 0.35 }));
      this.ball.castShadow = this.shadows; S.add(this.ball);
      // bayangan bulat (1 draw call untuk semua pemain) dipakai saat bayangan asli mati
      const blobTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
      const blobGeo = new T3.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
      this.blobs = new T3.InstancedMesh(blobGeo, new T3.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), 24);
      this.blobs.position.y = 0.006; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; S.add(this.blobs);
      this.blobM = new T3.Matrix4(); this.blobN = 0;
      this.ballQ = new T3.Quaternion(); this.lastBall = null;
      // control cursors
      this.cursors = [0, 1].map((i) => {
        const g = new T3.Group();
        const ring = new T3.Mesh(new T3.RingGeometry(0.42, 0.5, 32), new T3.MeshBasicMaterial({ color: i === 0 ? 0x22e3ff : 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; g.add(ring);
        const arr = new T3.Mesh(new T3.ConeGeometry(0.16, 0.36, 3), ring.material); arr.rotation.set(Math.PI / 2, 0, 0); arr.position.set(0, 0, 0.82); arr.scale.y = 1; g.add(arr);
        g.position.y = 0.012; g.visible = false; S.add(g); return g;
      });
      // confetti
      const N = 260, geo = new T3.BufferGeometry();
      geo.setAttribute('position', new T3.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('color', new T3.BufferAttribute(new Float32Array(N * 3), 3));
      this.conf = new T3.Points(geo, new T3.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.95 }));
      this.conf.visible = false; this.confV = new Float32Array(N * 3); this.confT = 0; S.add(this.conf);
    }
    buildGoal(gx, d) {
      const S = this.scene, g = new T3.Group();
      const stripes = canvasTex(16, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#d71f26' : '#ffffff'; c.fillRect(0, (i * h) / 8, w, h / 8); } });
      const pm = new T3.MeshLambertMaterial({ map: stripes });
      const post = (y) => { const m = new T3.Mesh(new T3.CylinderGeometry(0.04, 0.04, GH, 12), pm); m.position.set(gx, GH / 2, y); m.castShadow = this.shadows; g.add(m); };
      post(GY0); post(GY1);
      const bar = new T3.Mesh(new T3.CylinderGeometry(0.04, 0.04, GY1 - GY0 + 0.08, 12), pm); bar.rotation.x = Math.PI / 2; bar.position.set(gx, GH, H / 2); bar.castShadow = this.shadows; g.add(bar);
      const frame = new T3.MeshLambertMaterial({ color: 0xdfe6ee }), rods = [];
      const rod = (x1, y1, z1, x2, y2, z2) => { const a = new T3.Vector3(x1, y1, z1), b = new T3.Vector3(x2, y2, z2); const len = a.distanceTo(b); const m = new T3.Mesh(new T3.CylinderGeometry(0.018, 0.018, len, 6), frame); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.updateMatrixWorld(true); rods.push({ g: transformed(m) }); };
      const bx = gx + d * 1.0, tx = gx + d * 0.8;
      rod(gx, 0.02, GY0, bx, 0.02, GY0); rod(gx, 0.02, GY1, bx, 0.02, GY1); rod(bx, 0.02, GY0, bx, 0.02, GY1);
      rod(gx, GH, GY0, tx, GH, GY0); rod(gx, GH, GY1, tx, GH, GY1); rod(tx, GH, GY0, tx, GH, GY1); rod(tx, GH, GY0, bx, 0.02, GY0); rod(tx, GH, GY1, bx, 0.02, GY1);
      g.add(new T3.Mesh(mergeGeos(rods, {}), frame));
      // net panels
      const nets = [];
      const quad = (pts, rx, ry) => {
        const geo = new T3.BufferGeometry();
        const v = new Float32Array([...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]]);
        geo.setAttribute('position', new T3.BufferAttribute(v, 3));
        geo.setAttribute('uv', new T3.BufferAttribute(new Float32Array([0, 0, rx, 0, rx, ry, 0, 0, rx, ry, 0, ry]), 2));
        geo.computeVertexNormals();
        nets.push({ g: geo });
      };
      quad([[bx, 0, GY0], [bx, 0, GY1], [tx, GH, GY1], [tx, GH, GY0]], 9, 6);
      quad([[gx, GH, GY0], [gx, GH, GY1], [tx, GH, GY1], [tx, GH, GY0]], 9, 2);
      quad([[gx, 0, GY0], [bx, 0, GY0], [tx, GH, GY0], [gx, GH, GY0]], 3, 6);
      quad([[gx, 0, GY1], [bx, 0, GY1], [tx, GH, GY1], [gx, GH, GY1]], 3, 6);
      g.add(new T3.Mesh(mergeGeos(nets, { uv: true }), this.netMat));
      S.add(g);
    }

    /* build all figures for this match (2 × 7 roster + 2 referees) */
    ensureFigures(cfg) {
      const key = cfg.teams.map((t) => t.id + t.kit.join() + t.gk.join()).join('|');
      if (key === this.cfgKey) return;
      this.cfgKey = key;
      for (const f of this.figs.flat()) this.scene.remove(f);
      for (const f of this.refs) this.scene.remove(f);
      this.figs = cfg.teams.map((T, ti) => T.roster.map((r) => {
        const gk = r.pos === 'GK', kit = gk ? T.gk : T.kit;
        const shorts = gk ? shadeHex(kit[0], 0.45) : kit[1];
        const h = hash(T.id + r.name);
        const fig = buildPlayer({ kit, shorts, socks: gk ? shadeHex(kit[0], 0.6) : kit[0], skin: r.skin, hair: r.hair, hs: r.hs, num: r.num, name: r.name, gk, boots: BOOTS[h % BOOTS.length], lite: this.lite, bodyMat: this.bodyMat, shadows: this.shadows });
        fig.visible = false; fig.userData.team = ti; this.scene.add(fig); return fig;
      }));
      this.refs = [0, 1].map((i) => {
        const fig = buildPlayer({ kit: ['#151515', '#ffd23f'], shorts: '#151515', socks: '#151515', skin: i ? '#d49e6e' : '#bb8154', hair: '#141414', hs: 1, num: '', name: 'WASIT', ref: true, boots: '#111111', lite: this.lite, bodyMat: this.bodyMat, shadows: this.shadows });
        fig.userData.ref = true; this.scene.add(fig); return fig;
      });
      // kompilasi shader di awal supaya tidak tersendat saat pertama kali muncul
      try { this.conf.visible = true; this.cursors.forEach((c) => (c.visible = true)); this.r.compile(this.scene, this.cam); this.conf.visible = false; } catch (e) {}
    }

    /* ---------- animation ---------- */
    animate(fig, x, y, f, flags, act, actT, hasBall, charge, dt, ctx) {
      const u = fig.userData;
      fig.visible = true; u.bench = !!ctx.bench;
      // velocity from movement
      if (u.px == null || ctx.cut) { u.px = x; u.py = y; u.vx = u.vy = 0; }
      const ivx = (x - u.px) / Math.max(dt, 1e-3), ivy = (y - u.py) / Math.max(dt, 1e-3);
      const kv = Math.min(1, dt * 10);
      if (Math.abs(ivx) < 15 && Math.abs(ivy) < 15) { u.vx = lerp(u.vx, ivx, kv); u.vy = lerp(u.vy, ivy, kv); }
      u.px = x; u.py = y;
      const spd = Math.hypot(u.vx, u.vy);
      fig.position.set(x, 0, y);
      // facing
      const target = Math.PI / 2 - f;
      u.rotY += angD(u.rotY, target) * Math.min(1, dt * 14);
      fig.rotation.y = u.rotY;
      const b = clamp(spd / 7.4, 0, 1), sprint = flags & 32;
      const stride = 1.15 + spd * 0.11;
      u.phase += (spd * dt / stride) * Math.PI;
      const ph = u.phase, sn = Math.sin(ph), cs = Math.cos(ph);
      const P = blankPose();
      const gk = ctx.gk, down = flags & 4, held = flags & 8;
      // locomotion base
      if (spd > 0.35) {
        const A = (0.22 + 0.68 * b) * (hasBall ? 0.85 : 1);
        P.thX = [-sn * A, sn * A];
        P.knX = [0.12 + Math.max(0, Math.sin(ph + 1.35)) * (0.55 + 1.15 * b), 0.12 + Math.max(0, Math.sin(ph + Math.PI + 1.35)) * (0.55 + 1.15 * b)];
        P.anX = [Math.max(0, -sn) * 0.3 * b, Math.max(0, sn) * 0.3 * b];
        const armA = 0.22 + 0.62 * b;
        P.shX = [sn * armA, -sn * armA];
        P.shZ = [0.14 + 0.05 * b, -0.14 - 0.05 * b];
        P.elX = [-(0.45 + 0.9 * b) - Math.max(0, -sn) * 0.3 * b, -(0.45 + 0.9 * b) - Math.max(0, sn) * 0.3 * b];
        P.spX = 0.06 + 0.2 * b + (sprint ? 0.1 : 0) + (hasBall ? 0.08 : 0);
        P.hipsY = 0.92 - 0.045 * b + Math.abs(cs) * 0.045 * b;
        P.hipsRY = sn * 0.14 * b; P.spY = -sn * 0.2 * b;
        P.hdX = hasBall ? 0.35 : -0.1 * b;
      } else {
        const br = Math.sin(this.time * 2.2 + u.phase) * 0.012;
        P.spX = 0.05 + br; P.knX = [0.14, 0.14]; P.thX = [-0.06, -0.06]; P.anX = [-0.06, -0.06];
        P.shZ = [0.16, -0.16]; P.elX = [-0.3, -0.3]; P.hipsY = 0.91;
        if (ctx.bench) { P.hipsY = 0.47; P.thX = [-1.5, -1.45]; P.knX = [1.5, 1.45]; P.anX = [-0.1, -0.1]; P.spX = 0.08; P.shX = [-0.35, -0.3]; P.elX = [-0.9, -0.8]; P.shZ = [0.25, -0.25]; }
      }
      // goalkeeper stances
      if (gk && !down && !held && spd < 2.5 && !act && !ctx.bench) {
        P.hipsY = 0.8; P.thX = [-0.42, -0.42]; P.thZ = [0.18, -0.18]; P.knX = [0.8, 0.8]; P.anX = [-0.35, -0.35];
        P.spX = 0.32; P.shX = [-0.55, -0.55]; P.shZ = [0.55, -0.55]; P.elX = [-0.6, -0.6]; P.hdX = -0.25;
      }
      if (gk && held) { P.shX = [-1.2, -1.2]; P.shZ = [-0.28, 0.28]; P.elX = [-1.05, -1.05]; P.spX = 0.1; }
      // shot wind-up while charging
      if (charge > 0 && hasBall) {
        P.thX[1] = 0.25 + charge * 0.75; P.knX[1] = 0.4 + charge * 1.3; P.thX[0] = -0.12; P.knX[0] = 0.3;
        P.shZ = [0.6 + charge * 0.6, -0.5]; P.shX = [-0.3, 0.4]; P.spX = 0.12; P.spY = 0.25 * charge; P.hdX = 0.3;
      }
      // actions
      if (act === 1 || act === 2 || act === 3) {
        const pw = act === 2 ? 1 : act === 3 ? 1.1 : 0.6, t = actT;
        if (t < 0.22) { const k = t / 0.22; P.thX[1] = lerp(0.3, 0.85 * pw, k); P.knX[1] = lerp(0.6, 1.6, k); }
        else { const k = ease(Math.min(1, (t - 0.22) / 0.45)); P.thX[1] = lerp(0.85 * pw, -1.35 * pw, k); P.knX[1] = lerp(1.6, 0.05, Math.min(1, k * 1.6)); if (t > 0.7) P.thX[1] = lerp(-1.35 * pw, -0.2, (t - 0.7) / 0.3); }
        P.anX[1] = -0.4; P.thX[0] = -0.18; P.knX[0] = 0.38; P.hipsY = 0.89;
        P.shZ = [1.05, -0.55]; P.shX = [-0.35, 0.3]; P.elX = [-0.4, -0.5];
        P.spY = lerp(0.35, -0.4, ease(t)); P.spX = act === 3 ? -0.12 : act === 2 ? 0.05 : 0.12; P.hdX = 0.35;
        if (act === 1) { P.hipsRY = -0.45; P.thZ[1] = -0.3; }
      } else if (act === 4) {
        const k = Math.sin(actT * Math.PI);
        P.thX = [0.5 * k, -1.15 * k]; P.knX = [0.9 * k + 0.1, 0.2]; P.hipsY = 0.92 - 0.16 * k; P.spX = 0.1 + 0.3 * k; P.shZ = [0.6 * k, -0.6 * k];
      } else if (act === 5) {
        P.shX = [-1.3, -1.3]; P.shZ = [-0.2, 0.2]; P.elX = [-0.9, -0.9]; P.spX = 0.2;
      } else if (act === 6) {
        const k = ease(actT); P.shX = [lerp(-3.0, -0.5, k), lerp(-1.2, -0.4, k)]; P.shZ = [0.2, -0.2]; P.elX = [-0.2, -0.6]; P.spX = lerp(-0.25, 0.35, k); P.thX = [-0.5 * k, 0.3]; P.knX = [0.3, 0.5];
      } else if (act === 8) {
        const k = Math.sin(actT * Math.PI); P.hipsRZ = 0.32 * k * (u.phase % 2 > 1 ? 1 : -1); P.spZ = -P.hipsRZ * 0.8; P.thZ = [0.35 * k, -0.15 * k]; P.hipsY = 0.86;
      } else if (act === 7) {
        const style = ctx.ri % 3;
        if (style === 0) { P.shZ = [1.45, -1.45]; P.shX = [0, 0]; P.elX = [-0.05, -0.05]; P.spZ = Math.sin(this.time * 2.5) * 0.25; P.tiltZ = Math.sin(this.time * 2.5) * 0.12; }
        else if (style === 1) { const pump = Math.sin(this.time * 9) > 0; P.shX = [-2.7, pump ? -2.9 : -2.3]; P.shZ = [0.25, -0.25]; P.elX = [-0.3, pump ? -0.1 : -0.9]; P.hdX = -0.35; }
        else { P.shX = [-1.0, -1.0]; P.shZ = [0.9, -0.9]; P.elX = [-1.2, -1.2]; P.spX = -0.2; P.hdX = -0.4; }
      }
      // slide tackle / goalkeeper dive
      if (down && !gk) {
        P.tiltX = -1.05; P.hipsY = 0.62; P.thX = [-0.55, -1.45]; P.knX = [1.65, 0.05]; P.spX = 0.35; P.shX = [0.6, 0.5]; P.shZ = [0.7, -0.7]; P.elX = [-0.2, -0.2]; P.hdX = 0.5;
      } else if (down && gk) {
        const rx = -Math.sin(f), ry = Math.cos(f);
        const lat = u.vx * rx + u.vy * ry;
        const side = lat >= 0 ? 1 : -1;
        P.tiltZ = side * 1.28; P.hipsY = 0.95; P.thX = [-0.2, 0.25]; P.knX = [0.4, 0.15]; P.thZ = [0.25, -0.25];
        P.shX = [-2.95, -2.95]; P.shZ = [0.25 - side * 0.25, -0.25 - side * 0.25]; P.elX = [-0.1, -0.1]; P.spZ = side * 0.15;
      }
      // head tracks the ball
      if (!down && act !== 7 && !ctx.bench) {
        const a = Math.atan2(ctx.bx - x, ctx.by - y);
        P.hdY = clamp(angD(u.rotY, a), -1.15, 1.15);
      } else if (ctx.bench) P.hdY = clamp(angD(u.rotY, Math.atan2(ctx.bx - x, ctx.by - y)), -1.1, 1.1);
      applyPose(u, P, Math.min(1, dt * (act || down ? 22 : 14)));
    }

    /* ---------- frame ---------- */
    draw(v, cfg, dt, local, rend2d) {
      this.time += dt;
      this.ensureFigures(cfg);
      const cut = !!v.cut;
      const bx = v.b[0], by = v.b[1], bz = v.b[2];
      const onCourt = this.onCourt || (this.onCourt = [new Set(), new Set()]); onCourt[0].clear(); onCourt[1].clear();
      v.p.forEach((q, i) => {
        const team = i < 5 ? 0 : 1, fig = this.figs[team][q[4]];
        if (!fig) return;
        if (q[5] & 16) { fig.visible = false; return; }
        onCourt[team].add(q[4]);
        const hasBall = !!(q[5] & 1);
        const charge = (q[5] & 2) && v.ch ? v.ch[team] : 0;
        const rest = (v.ph === 'dead' || v.ph === 'setpiece' || v.ph === 'halftime') && !(q[5] & 2) && i % 5 !== 0;
        this.animate(fig, q[0], q[1], q[2], q[5], q[7] || 0, q[8] || 0, hasBall, charge, dt, { gk: i % 5 === 0, cut, bx, by, ri: q[4], restPose: rest });
      });
      // bench players (seated, facing the court)
      for (let t = 0; t < 2; t++) {
        let seat = 0;
        this.figs[t].forEach((fig, ri) => {
          if (onCourt[t].has(ri)) return;
          const x = (t === 0 ? W / 2 - 10.5 : W / 2 + 6.5) + seat * 1.0; seat++;
          this.animate(fig, x, -2.45, Math.PI / 2, 0, 0, 0, false, 0, dt, { bench: true, cut: true, bx, by, ri });
        });
      }
      // referees run along both touchlines
      const rt = [clamp(bx - 3, 2, W - 2), clamp(bx + 3, 2, W - 2)];
      this.refs.forEach((fig, i) => {
        const u = fig.userData, cx = u.rx == null || cut ? rt[i] : u.rx;
        const nx = cx + clamp(rt[i] - cx, -6 * dt, 6 * dt); u.rx = nx;
        const ry = i === 0 ? -0.7 : H + 0.7;
        const mv = rt[i] - cx;
        const f = Math.abs(mv) > 0.4 ? (mv > 0 ? 0 : Math.PI) : (i === 0 ? Math.PI / 2 : -Math.PI / 2);
        this.animate(fig, nx, ry, f, 0, 0, 0, false, 0, dt, { cut, bx, by, ri: 0 });
      });
      // ball
      const bp = this.ball.position;
      if (this.lastBall && !cut) {
        const dx = bx - this.lastBall[0], dz = by - this.lastBall[1], d = Math.hypot(dx, dz);
        if (d > 0.0005 && d < 3) { const ax = this.v3[2].set(dz, 0, -dx).normalize(); this.qtmp.setFromAxisAngle(ax, d / 0.11); this.ball.quaternion.premultiply(this.qtmp); }
      }
      this.lastBall = this.lastBall || [0, 0]; this.lastBall[0] = bx; this.lastBall[1] = by;
      bp.set(bx, bz + 0.11, by);
      // cursors
      this.cursors.forEach((c) => (c.visible = false));
      v.p.forEach((q, i) => {
        if (!(q[5] & 2) || q[5] & 16) return;
        const team = i < 5 ? 0 : 1, c = this.cursors[team === local ? 0 : 1];
        c.visible = true; c.position.x = q[0]; c.position.z = q[1]; c.rotation.y = Math.PI / 2 - q[2];
      });
      // bayangan bulat
      this.blobs.visible = !this.shadows;
      if (!this.shadows) {
        let n = 0;
        const put = (x, z, s) => { if (n >= 24) return; this.blobM.makeScale(s, 1, s); this.blobM.setPosition(x, 0, z); this.blobs.setMatrixAt(n++, this.blobM); };
        for (const t of this.figs) for (const f of t) if (f.visible) put(f.position.x, f.position.z, f.userData.bench ? 0 : 1.05);
        for (const f of this.refs) put(f.position.x, f.position.z, 1.05);
        put(bx, by, Math.max(0.2, 0.32 - bz * 0.04));
        this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true;
      }
      this.updateConfetti(dt);
      this.updateCamera(v, dt, cut);
      // kualitas adaptif: bila rata-rata < ±38 fps, turunkan bayangan lalu resolusi
      if (this.auto) {
        this.perf.acc += Math.min(dt, 0.1); this.perf.n++;
        if (this.perf.n >= 120) {
          const avg = this.perf.acc / this.perf.n; this.perf.acc = 0; this.perf.n = 0;
          if (avg > 1 / 38) this.degrade();
        }
      }
      this.r.render(this.scene, this.cam);
      this.overlay(v, cfg, local, rend2d);
    }
    degrade() {
      if (this.shadows) {
        this.shadows = false; this.r.shadowMap.enabled = false; this.sun.castShadow = false;
        this.scene.traverse((o) => { if (o.isMesh) o.castShadow = false; if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
      } else if (this.pr > 1) { this.pr = Math.max(1, this.pr - 0.5); this.r.setPixelRatio(this.pr); this.resize(); }
    }
    updateCamera(v, dt, cut) {
      const bx = v.b[0], by = v.b[1], bz = v.b[2];
      const portrait = this.h > this.w;
      // jarak kamera: Dekat ≈ 19 m, Sedang ≈ 24 m, Jauh ≈ 31 m dari tengah lapangan
      const D = 8 + this.zoom * (portrait ? 1.35 : 1.08);
      const pos = this.v3[0], look = this.v3[1];
      if (v.rp) {
        // cinematic replay: low orbit around the ball
        const a = this.time * 0.35;
        pos.set(bx + Math.sin(a) * 7.5, 1.6 + bz * 0.5, by + Math.cos(a) * 7.5);
        look.set(bx, 0.7 + bz * 0.6, by);
        this.cam.fov = portrait ? 60 : 42;
      } else if (v.ph === 'goal') {
        let sx = bx, sy = by;
        const sc = v.p.find((q) => q[7] === 7);
        if (sc) { sx = sc[0]; sy = sc[1]; }
        pos.set(sx, 4.5, sy + 9); look.set(sx, 1.0, sy);
        this.cam.fov = portrait ? 52 : 34;
      } else {
        const edge = Math.max(4, 13 - (D - 19) * 0.5);
        const cx = clamp(bx, edge, W - edge);
        const cz = H / 2 + (clamp(by, -1, H + 1) - H / 2) * 0.25;
        pos.set(cx, D * 0.56, cz + D); look.set(cx, 0, cz - 1.0);
        this.cam.fov = portrait ? 56 : 32;
      }
      // pegas teredam: halus tanpa tertinggal jauh
      const k = cut ? 1 : 1 - Math.exp(-dt * (v.rp ? 3 : 3.2));
      this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
      this.cam.position.copy(this.camPos);
      if (v.sh > 0) { this.cam.position.x += (Math.random() - 0.5) * v.sh * 0.25; this.cam.position.y += (Math.random() - 0.5) * v.sh * 0.25; }
      this.cam.lookAt(this.camLook);
      this.cam.updateProjectionMatrix();
    }
    confetti(x, kits) {
      const pos = this.conf.geometry.attributes.position.array, col = this.conf.geometry.attributes.color.array, V = this.confV;
      const c1 = new T3.Color(kits[0]), c2 = new T3.Color(kits[1]);
      for (let i = 0; i < pos.length / 3; i++) {
        pos[i * 3] = x; pos[i * 3 + 1] = 2.5 + Math.random(); pos[i * 3 + 2] = H / 2 + (Math.random() - 0.5) * 4;
        V[i * 3] = (x < W / 2 ? 1 : -1) * (2 + Math.random() * 8); V[i * 3 + 1] = 3 + Math.random() * 6; V[i * 3 + 2] = (Math.random() - 0.5) * 10;
        const c = Math.random() < 0.5 ? c1 : c2; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      this.conf.geometry.attributes.color.needsUpdate = true; this.conf.visible = true; this.confT = 3.5;
    }
    updateConfetti(dt) {
      if (!this.conf.visible) return;
      this.confT -= dt; if (this.confT <= 0) { this.conf.visible = false; return; }
      const pos = this.conf.geometry.attributes.position.array, V = this.confV;
      for (let i = 0; i < pos.length; i += 3) {
        V[i + 1] -= 5 * dt; V[i] *= 0.985; V[i + 2] *= 0.985;
        pos[i] += V[i] * dt; pos[i + 1] = Math.max(0.02, pos[i + 1] + V[i + 1] * dt); pos[i + 2] += V[i + 2] * dt;
      }
      this.conf.geometry.attributes.position.needsUpdate = true;
    }
    project(x, y, z) { this.tmp.set(x, z, y).project(this.cam); return [(this.tmp.x * 0.5 + 0.5) * this.w, (-this.tmp.y * 0.5 + 0.5) * this.h, this.tmp.z < 1]; }
    overlay(v, cfg, local, rend) {
      const g = rend.g;
      g.setTransform(rend.dpr, 0, 0, rend.dpr, 0, 0);
      g.clearRect(0, 0, rend.cw, rend.ch);
      rend.localTeam = local;
      if (!v.rp) v.p.forEach((q, i) => {
        if (!(q[5] & 2) || q[5] & 16) return;
        const team = i < 5 ? 0 : 1, r = cfg.teams[team].roster[q[4]];
        const p = this.project(q[0], q[1], 2.15); if (!p[2]) return;
        const mine = team === local, nm = r.name.split(' ').slice(-1)[0];
        g.font = '700 10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tw = g.measureText(nm).width + 8;
        g.fillStyle = 'rgba(5,12,24,0.6)'; g.fillRect(p[0] - tw / 2, p[1] - 13, tw, 13);
        g.fillStyle = mine ? '#22e3ff' : '#ffd23f'; g.fillText(nm, p[0], p[1] - 6);
        const st = q[6] / 100;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(p[0] - tw / 2, p[1] + 1, tw, 2);
        g.fillStyle = st > 0.5 ? '#3ddc84' : st > 0.25 ? '#ffc107' : '#ff4d4d'; g.fillRect(p[0] - tw / 2, p[1] + 1, tw * st, 2);
        const ch = v.ch[team];
        if (ch > 0) {
          const f = this.project(q[0], q[1], 0), w = 40;
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(f[0] - w / 2, f[1] + 8, w, 5);
          const cg = g.createLinearGradient(f[0] - w / 2, 0, f[0] + w / 2, 0); cg.addColorStop(0, '#3ddc84'); cg.addColorStop(0.7, '#ffc107'); cg.addColorStop(1, '#ff3b3b');
          g.fillStyle = cg; g.fillRect(f[0] - w / 2, f[1] + 8, w * ch, 5);
        }
      });
      if (v.rp) {
        const bar = Math.round(rend.ch * 0.06);
        g.fillStyle = '#000'; g.fillRect(0, 0, rend.cw, bar); g.fillRect(0, rend.ch - bar, rend.cw, bar);
        g.font = '900 13px "Saira Condensed", system-ui'; g.fillStyle = '#ffd23f'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText('● REPLAY', 14, rend.ch - bar / 2);
        g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText('Ketuk Umpan/Tembak untuk lewati ▶', rend.cw - 14, rend.ch - bar / 2);
      } else rend.drawRadar(v, cfg);
    }
  }
  FG.Renderer3D = Renderer3D;
  FG.has3D = function () { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } };
})();
