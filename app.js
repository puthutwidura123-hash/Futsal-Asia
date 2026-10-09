/* Futsal Asia Pro — aplikasi: menu, akun, lobi PvP, loop permainan */
(function () {
  'use strict';
  const FG = window.FG, Net = FG.Net, Sfx = FG.Sfx;
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TB = FG.TEAM_BY_ID;

  const S = {
    online: false, screen: 'auth', homeTeam: 'IDN', awayTeam: 'JPN', invTeam: 'IDN',
    mode: null, match: null, cfg: null, local: 0, rend: null, input: null, raf: 0, paused: false,
    room: null, started: false, guestIn: null, snaps: [], lastSnapAt: 0, lastSend: 0, lastIn: '', lastInAt: 0, evBuf: [],
    peerGoneAt: 0, ended: false, lastCs: -1, zoom: 15, view: '3d', invites: [], r3: null, gfx: 'auto'
  };
  try { const z = +localStorage.getItem('fap_zoom'); if (z) S.zoom = z; const gq = localStorage.getItem('fap_gfx'); if (gq) S.gfx = gq; const vw = localStorage.getItem('fap_view'); if (vw === 'top' || vw === 'side' || vw === '3d') S.view = vw; const t = localStorage.getItem('fap_team'); if (t && TB[t]) { S.homeTeam = t; S.invTeam = t; } } catch (e) {}

  /* ---------- navigation ---------- */
  function show(id) {
    $$('.scr').forEach((e) => e.classList.add('hide'));
    $('#scr-' + id).classList.remove('hide');
    S.screen = id;
    window.scrollTo(0, 0);
    if (id === 'home') renderHome();
    if (id === 'teams') renderTeams();
    if (id === 'setup') renderSetup();
    if (id === 'pvp') renderPvp();
    if (id === 'history') renderHistory();
  }
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go && !go.disabled) { Sfx.init(); show(go.dataset.go); }
  });

  /* ---------- auth ---------- */
  let authMode = 'in';
  $$('[data-auth]').forEach((b) => b.addEventListener('click', () => {
    authMode = b.dataset.auth;
    $$('[data-auth]').forEach((x) => x.classList.toggle('on', x === b));
    $$('.only-up').forEach((x) => x.classList.toggle('hide', authMode !== 'up'));
    $('#btn-auth').textContent = authMode === 'in' ? 'Masuk' : 'Daftar Akun';
    $('#f-auth').password.autocomplete = authMode === 'in' ? 'current-password' : 'new-password';
    msg('#auth-msg', '');
  }));
  function msg(sel, t, err) { const e = $(sel); e.textContent = t; e.classList.toggle('err', !!err); }
  function errText(e) {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return 'Email atau kata sandi salah.';
    if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
    if (/already registered/i.test(m)) return 'Email sudah terdaftar. Silakan masuk.';
    if (/rate limit/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar.';
    return m;
  }
  $('#f-auth').addEventListener('submit', async (e) => {
    e.preventDefault(); Sfx.init();
    const f = e.target, btn = $('#btn-auth');
    btn.disabled = true; msg('#auth-msg', 'Memproses…');
    try {
      if (authMode === 'up') {
        const name = f.username.value.trim();
        if (name.length < 3) throw new Error('Nama pemain minimal 3 karakter.');
        const d = await Net.signUp(f.email.value, f.password.value, name);
        if (d.session) { Net.user = d.user; await Net.loadProfile(); afterLogin(); }
        else msg('#auth-msg', 'Berhasil! Cek email Anda untuk konfirmasi, lalu masuk.');
      } else { await Net.signIn(f.email.value, f.password.value); afterLogin(); }
    } catch (err) { msg('#auth-msg', errText(err), true); }
    btn.disabled = false;
  });
  $('#btn-forgot').addEventListener('click', async () => {
    const em = $('#f-auth').email.value;
    if (!em) return msg('#auth-msg', 'Isi email dulu, lalu tekan "Lupa kata sandi".', true);
    try { await Net.resetPassword(em); msg('#auth-msg', 'Link reset kata sandi dikirim ke email Anda.'); } catch (e) { msg('#auth-msg', errText(e), true); }
  });
  $('#btn-guest').addEventListener('click', () => { Sfx.init(); show('home'); });
  $('#btn-logout').addEventListener('click', async () => { if (Net.user) await Net.signOut(); show('auth'); });

  function afterLogin() {
    if (Net.profile && Net.profile.favorite_team && TB[Net.profile.favorite_team]) { S.homeTeam = S.invTeam = Net.profile.favorite_team; }
    Net.subInvites(onInviteChange);
    refreshInvites();
    const mid = new URLSearchParams(location.search).get('match');
    if (mid) { history.replaceState(null, '', location.pathname); openInviteLink(mid); }
    else show('home');
  }

  /* ---------- home ---------- */
  function renderHome() {
    const on = S.online && Net.user;
    $$('[data-online]').forEach((b) => (b.disabled = !on));
    $('#btn-logout').classList.toggle('hide', !Net.user);
    const p = Net.profile;
    $('#me-box').innerHTML = on ? '<b>' + esc(p.username) + '</b>' + p.wins + 'M · ' + p.draws + 'S · ' + p.losses + 'K' : '<b>Tamu</b>offline';
    updateBadge();
  }
  function updateBadge() {
    const n = S.invites.filter((m) => m.status === 'pending' && m.guest_email === Net.myEmail()).length;
    const b = $('#inv-badge'); b.textContent = n; b.classList.toggle('hide', !n);
  }

  /* ---------- teams & squads ---------- */
  function teamCard(t, sel) {
    return '<button class="tcard' + (sel ? ' sel' : '') + '" data-team="' + t.id + '" style="--k0:' + t.home[0] + ';--k1:' + t.home[1] + '">' +
      '<span class="fl">' + t.flag + '</span><span class="ovr">' + t.rating + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.nick) + '</small></button>';
  }
  function renderTeams() {
    $('#team-grid').innerHTML = FG.TEAMS.map((t) => teamCard(t)).join('');
    $('#team-grid').onclick = (e) => { const c = e.target.closest('[data-team]'); if (c) openSquad(c.dataset.team, 'teams'); };
  }
  function openSquad(id, back) {
    const t = TB[id];
    show('squad');
    $('#squad-back').onclick = () => show(back);
    $('#squad-title').textContent = t.name;
    $('#squad-head').innerHTML = '<span class="fl">' + t.flag + '</span><div><b style="color:#fff;font-size:18px">' + esc(t.nick) + '</b><br>Gaya: ' + esc(t.style) + '<br>Rating tim: <b style="color:var(--gold)">' + t.rating + '</b></div>' +
      (Net.user ? '<button class="btn sm" id="btn-fav" style="margin-left:auto">★ Jadikan tim favorit</button>' : '');
    const keys = (r) => (r.pos === 'GK' ? ['ref', 'han', 'pas', 'pac'] : ['pac', 'sho', 'pas', 'drb', 'def', 'phy']);
    $('#squad').innerHTML = t.roster.map((r, i) =>
      '<div class="pcard' + (r.pos === 'GK' ? ' gk' : '') + '"><div class="top2"><canvas width="168" height="192" data-av="' + i + '"></canvas><div><div class="ov">' + r.ovr + '</div><div class="pos">' + FG.POS_NAME[r.pos] + '</div><div class="pos" style="color:var(--mut)">#' + r.num + (i < 5 ? ' · Inti' : ' · Cadangan') + '</div></div></div>' +
      '<h4>' + esc(r.name) + '</h4><div class="tr">★ ' + r.trait + '<small>' + FG.TRAITS[r.trait] + '</small></div>' +
      keys(r).map((k) => '<div class="st"><span>' + FG.STAT_NAME[k] + '</span><i><u style="width:' + r.s[k] + '%"></u></i><b>' + r.s[k] + '</b></div>').join('') + '</div>').join('');
    $$('[data-av]').forEach((cv) => { const r = t.roster[+cv.dataset.av]; FG.drawAvatar(cv, r, r.pos === 'GK' ? t.gk : t.home); });
    const fav = $('#btn-fav');
    if (fav) fav.onclick = async () => { S.homeTeam = S.invTeam = id; try { localStorage.setItem('fap_team', id); } catch (e) {} await Net.setFavorite(id); fav.textContent = '✓ Tim favorit'; };
  }
  let pickCb = null;
  function openPicker(cur, cb) {
    pickCb = cb;
    $('#pick-grid').innerHTML = FG.TEAMS.map((t) => teamCard(t, t.id === cur)).join('');
    $('#ov-pick').classList.remove('hide');
  }
  $('#pick-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-team]'); if (!c) return; $('#ov-pick').classList.add('hide'); const cb = pickCb; pickCb = null; cb && cb(c.dataset.team); });
  $('#pick-close').addEventListener('click', () => { $('#ov-pick').classList.add('hide'); pickCb = null; });
  function pickHtml(id) { const t = TB[id]; return '<span class="fl">' + t.flag + '</span><b>' + esc(t.name) + '</b><small>Rating ' + t.rating + '</small>'; }

  /* ---------- setup CPU ---------- */
  function renderSetup() {
    $('#pick-home').innerHTML = pickHtml(S.homeTeam);
    $('#pick-away').innerHTML = pickHtml(S.awayTeam);
    $('#opt-cam').value = String(S.zoom); $('#opt-view').value = S.view;
  }
  $('#pick-home').addEventListener('click', () => openPicker(S.homeTeam, (id) => { S.homeTeam = id; if (id === S.awayTeam) S.awayTeam = FG.TEAMS.find((t) => t.id !== id).id; renderSetup(); }));
  $('#pick-away').addEventListener('click', () => openPicker(S.awayTeam, (id) => { if (id === S.homeTeam) return; S.awayTeam = id; renderSetup(); }));
  $('#btn-kickoff').addEventListener('click', () => {
    Sfx.init();
    S.zoom = +$('#opt-cam').value; S.view = $('#opt-view').value; try { localStorage.setItem('fap_zoom', S.zoom); localStorage.setItem('fap_view', S.view); } catch (e) {}
    goLandscape();
    startGame('cpu', {
      teams: [S.homeTeam, S.awayTeam], ctrl: ['human', 'ai'],
      halfMinutes: +$('#opt-len').value, difficulty: +$('#opt-diff').value, autoSwitch: $('#opt-auto').checked
    });
  });

  /* ---------- PvP invites ---------- */
  function renderPvp() {
    $('#inv-team').innerHTML = pickHtml(S.invTeam);
    renderInvites();
    refreshInvites();
  }
  $('#inv-team').addEventListener('click', () => openPicker(S.invTeam, (id) => { S.invTeam = id; $('#inv-team').innerHTML = pickHtml(id); }));
  $('#btn-invite').addEventListener('click', async () => {
    const em = $('#inv-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return msg('#inv-msg', 'Email tidak valid.', true);
    msg('#inv-msg', 'Mengirim…'); goLandscape();
    try { const m = await Net.createInvite(em, S.invTeam, +$('#inv-len').value); msg('#inv-msg', ''); $('#inv-email').value = ''; enterLobby(m, 'host'); }
    catch (e) { msg('#inv-msg', errText(e), true); }
  });
  async function refreshInvites() {
    if (!Net.user) return;
    try { S.invites = await Net.listInvites(); } catch (e) { S.invites = []; }
    if (S.screen === 'pvp') renderInvites();
    updateBadge();
  }
  function onInviteChange(p) {
    refreshInvites();
    const m = p.new;
    if (p.eventType === 'INSERT' && m && m.guest_email === Net.myEmail() && S.screen !== 'game') toastDom('⚔️ Undangan baru dari ' + (m.host_name || m.host_email));
    if (S.screen === 'lobby' && S.room && m && m.id === S.room.id) {
      if (m.status === 'declined') { $('#lob-status').textContent = 'Undangan ditolak.'; }
      if (m.status === 'accepted' && S.room.role === 'host') { S.room.m = m; renderLobbyVs(); $('#lob-status').textContent = 'Teman menerima! Menunggu dia masuk ruang…'; }
    }
  }
  function renderInvites() {
    const me = Net.myEmail();
    const L = S.invites;
    if (!L.length) { $('#inv-list').innerHTML = '<div class="empty">Belum ada undangan aktif.</div>'; return; }
    $('#inv-list').innerHTML = L.map((m) => {
      const incoming = m.guest_email === me;
      const t = TB[m.host_team];
      const who = incoming ? 'Dari <b>' + esc(m.host_name || m.host_email) + '</b>' : 'Ke <b>' + esc(m.guest_email) + '</b>';
      let acts = '';
      if (incoming && m.status === 'pending') acts = '<button class="btn primary sm" data-acc="' + m.id + '">Terima</button><button class="btn sm" data-dec="' + m.id + '">Tolak</button>';
      else if (incoming) acts = '<button class="btn primary sm" data-join="' + m.id + '">Masuk</button>';
      else acts = '<button class="btn primary sm" data-host="' + m.id + '">Buka ruang</button><button class="btn sm" data-can="' + m.id + '">Batal</button>';
      return '<div class="inv"><span style="font-size:28px">' + t.flag + '</span><div class="who">' + who + '<small>' + esc(t.name) + ' · ' + m.half_minutes + ' mnt/babak · ' + statusName(m.status) + '</small></div><div class="acts">' + acts + '</div></div>';
    }).join('');
  }
  function statusName(s) { return { pending: 'menunggu', accepted: 'diterima', playing: 'sedang main' }[s] || s; }
  $('#inv-list').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const find = (id) => S.invites.find((m) => m.id === id);
    if (b.dataset.acc) acceptFlow(find(b.dataset.acc));
    if (b.dataset.dec) { await Net.setStatus(b.dataset.dec, 'declined'); refreshInvites(); }
    if (b.dataset.can) { await Net.setStatus(b.dataset.can, 'cancelled'); refreshInvites(); }
    if (b.dataset.host) enterLobby(find(b.dataset.host), 'host');
    if (b.dataset.join) enterLobby(find(b.dataset.join), 'guest');
  });
  function acceptFlow(m) {
    if (!m) return;
    openPicker(m.host_team === S.invTeam ? FG.TEAMS.find((t) => t.id !== m.host_team).id : S.invTeam, async (id) => {
      if (id === m.host_team) { toastDom('Pilih tim yang berbeda dari lawan.'); return acceptFlow(m); }
      goLandscape();
      try { const r = await Net.accept(m.id, id); enterLobby(r, 'guest'); } catch (e) { toastDom(errText(e)); refreshInvites(); }
    });
  }
  async function openInviteLink(id) {
    try {
      const m = await Net.getMatch(id);
      if (!m) { toastDom('Undangan tidak ditemukan atau bukan untuk akun ini.'); return show('home'); }
      show('pvp');
      if (m.host_id === Net.user.id) enterLobby(m, 'host');
      else if (m.status === 'pending') acceptFlow(m);
      else if (m.status === 'accepted' || m.status === 'playing') enterLobby(m, 'guest');
    } catch (e) { toastDom(errText(e)); show('home'); }
  }

  /* ---------- lobby ---------- */
  function renderLobbyVs() {
    const m = S.room.m, a = TB[m.host_team], b = m.guest_team ? TB[m.guest_team] : null;
    $('#lob-vs').innerHTML = a.flag + ' ' + esc(m.host_name || 'Host') + ' <span class="vs">VS</span> ' + (b ? b.flag + ' ' : '❔ ') + esc(m.guest_name || m.guest_email);
  }
  function enterLobby(m, role) {
    if (!m) return;
    leaveRoom();
    S.room = { id: m.id, role, m, peers: [] };
    S.started = false; S.ended = false;
    show('lobby');
    renderLobbyVs();
    $('#lob-status').textContent = role === 'host' ? (m.status === 'pending' ? 'Undangan terkirim. Menunggu teman menerima…' : 'Menunggu teman masuk ruang…') : 'Masuk ruang, menunggu host…';
    Net.joinRoom(m.id, role, {
      onPresence: (keys) => {
        S.room.peers = keys;
        const other = role === 'host' ? 'guest' : 'host';
        const here = keys.includes(other);
        if (here) S.peerGoneAt = 0; else if (S.started && !S.peerGoneAt) S.peerGoneAt = performance.now();
        if (role === 'host' && here) hostMaybeStart();
      },
      onCfg: (cfg) => { if (role === 'guest') guestStart(cfg); },
      onInput: (inp) => { if (role === 'host') S.guestIn = inp; },
      onSnap: (sn) => { if (role === 'guest') guestSnap(sn); },
      onEnd: (r) => { if (role === 'guest') { S.ended = true; showResult(r); } },
      onPing: () => { if (role === 'host' && S.started && S.match) Net.send('cfg', hostCfg()); },
      onJoined: () => { if (role === 'guest') Net.send('ping', {}); },
      onError: () => { $('#lob-status').textContent = 'Koneksi realtime gagal. Periksa internet lalu coba lagi.'; }
    });
  }
  $('#lobby-back').addEventListener('click', () => { leaveRoom(); show('pvp'); });
  $('#btn-copy-link').addEventListener('click', async () => {
    if (!S.room) return;
    const url = location.origin + location.pathname + '?match=' + S.room.id;
    try { await navigator.clipboard.writeText(url); toastDom('Link disalin!'); } catch (e) { prompt('Salin link ini:', url); }
  });
  function leaveRoom() { if (S.room) { Net.leaveRoom(); S.room = null; } }
  async function hostMaybeStart() {
    if (S.started) { Net.send('cfg', hostCfg()); return; }
    let m = S.room.m;
    if (!m.guest_team) { try { m = S.room.m = await Net.getMatch(m.id); } catch (e) {} }
    if (!m || !m.guest_team) { $('#lob-status').textContent = 'Teman di ruang, menunggu dia memilih tim…'; setTimeout(() => S.room && !S.started && hostMaybeStart(), 1500); return; }
    renderLobbyVs();
    $('#lob-status').textContent = 'Lawan siap! Kick-off…';
    await Net.setStatus(m.id, 'playing');
    startGame('host', { teams: [m.host_team, m.guest_team], ctrl: ['human', 'human'], halfMinutes: m.half_minutes, difficulty: 1, autoSwitch: true });
    Net.send('cfg', hostCfg());
  }
  function hostCfg() { return Object.assign({ names: [S.room.m.host_name, S.room.m.guest_name] }, S.cfg); }

  /* ---------- game ---------- */
  function ensureGameObjects() {
    if (!S.rend) {
      S.rend = new FG.Renderer($('#cv'));
      S.input = new FG.Input();
      S.input.bindTouch($('#touch'));
      S.input.onPause = () => { if (S.screen === 'game') togglePause(); };
      addEventListener('resize', () => { S.rend && S.rend.resize(); S.r3 && S.r3.resize(); });
      if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) $('#scr-game').classList.add('touch-on');
    }
  }
  function startGame(mode, opts) {
    ensureGameObjects();
    S.mode = mode; S.local = 0; S.paused = false; S.ended = false; S.started = true; S.evBuf = []; S.snaps = []; S.peerGoneAt = 0; S.guestIn = null;
    S.match = new FG.Match(opts);
    S.cfg = S.match.cfg();
    beginLoop();
  }
  function guestStart(cfg) {
    ensureGameObjects();
    S.mode = 'guest'; S.local = 1; S.cfg = cfg; S.started = true; S.ended = false; S.paused = false; S.match = null;
    if (S.screen !== 'game') { S.snaps = []; beginLoop(); }
  }
  function beginLoop() {
    show('game');
    ['#ov-pause', '#ov-half', '#ov-end'].forEach((s) => $(s).classList.add('hide'));
    S.rend.resize(); S.rend.setZoom(S.zoom); S.rend.parts = []; S.rend.sc.cx = null;
    applyView();
    $('#btn-zoom').textContent = 'Jarak kamera: ' + zoomName(S.zoom);
    const c = S.cfg;
    for (let i = 0; i < 2; i++) { $('#h-f' + i).textContent = c.teams[i].flag; $('#h-n' + i).textContent = c.teams[i].id; }
    $('#btn-quit').textContent = S.mode === 'cpu' ? 'Keluar pertandingan' : 'Menyerah & keluar';
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    cancelAnimationFrame(S.raf);
    let last = performance.now(), acc = 0, prevV = null, curV = null;
    const STEP = 1 / 60;
    const loop = (now) => {
      S.raf = requestAnimationFrame(loop);
      let dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (S.mode === 'guest') return guestFrame(now, dt);
      const m = S.match;
      const hostWait = S.mode === 'host' && S.peerGoneAt;
      if (!S.paused && !S.ended && !hostWait) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 4) {
          const li = S.input.poll();
          m.update(STEP, S.mode === 'host' ? [li, S.guestIn || FG.blankIn()] : [li, null]);
          prevV = curV; curV = m.view();
          for (const e of m.events) { S.evBuf.push(e); playEvent(e, curV); }
          acc -= STEP; steps++;
        }
        if (acc > STEP) acc = STEP; // HP lambat: jangan menumpuk langkah (penyebab tersendat)
      } else acc = 0;
      if (!curV) curV = m.view();
      // interpolasi antar langkah simulasi → gerakan halus di layar 60/90/120 Hz
      const v = prevV && prevV.cs === curV.cs && !curV.rp ? mixView(prevV, curV, acc / STEP) : Object.assign({}, curV);
      v.cut = v.cs !== S.lastCs; S.lastCs = v.cs;
      render(v, dt, S.local);
      hud(v);
      if (S.mode === 'host') {
        if (now - S.lastSend > 66) { S.lastSend = now; const sn = m.view(); sn.ev = S.evBuf; S.evBuf = []; Net.send('snap', sn); }
        if (hostWait) {
          const left = Math.ceil(30 - (now - S.peerGoneAt) / 1000);
          $('#h-net').textContent = 'Lawan terputus… menunggu ' + left + ' dtk';
          if (left <= 0 && !S.ended) endMatch(true);
        } else $('#h-net').textContent = '';
      } else S.evBuf = [];
      if (m.ended && !S.ended) endMatch(false);
    };
    S.raf = requestAnimationFrame(loop);
  }
  function guestFrame(now, dt) {
    const li = S.input.poll(), js = JSON.stringify(li);
    if ((js !== S.lastIn && now - S.lastInAt > 33) || now - S.lastInAt > 200) { Net.send('in', li); S.lastIn = js; S.lastInAt = now; }
    const v = interp(now);
    if (v) { render(v, dt, 1); hud(v); }
    const gap = now - S.lastSnapAt;
    if (!S.ended) {
      if (S.lastSnapAt && gap > 3000) {
        const left = Math.ceil(30 - gap / 1000);
        $('#h-net').textContent = 'Koneksi ke host terputus… ' + left + ' dtk';
        if (left <= 0) { S.ended = true; showResult(null, 'Host terputus. Pertandingan dibatalkan.'); }
      } else $('#h-net').textContent = '';
    }
  }
  function guestSnap(sn) {
    const now = performance.now();
    S.lastSnapAt = now;
    if (S.screen !== 'game' && S.cfg) { beginLoop(); }
    for (const e of sn.ev || []) playEvent(e, sn);
    S.snaps.push({ t: now, v: sn });
    if (S.snaps.length > 30) S.snaps.shift();
  }
  function lerpA(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
  function interp(now) {
    const L = S.snaps; if (!L.length) return null;
    const rt = now - 110;
    let i = L.length - 1;
    while (i > 0 && L[i - 1].t > rt) i--;
    const b = L[i], a = L[i - 1];
    if (!a || b.t <= rt) { const v = Object.assign({}, L[L.length - 1].v); v.cut = v.cs !== S.lastCs; S.lastCs = v.cs; return v; }
    const v = Object.assign({}, b.v);
    if (a.v.cs !== b.v.cs) { v.cut = b.v.cs !== S.lastCs; S.lastCs = b.v.cs; return v; }
    const t = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t)));
    const out = mixView(a.v, b.v, t);
    out.cut = false; S.lastCs = out.cs;
    return out;
  }
  function mixView(a, b, t) {
    const v = Object.assign({}, b);
    v.b = [a.b[0] + (b.b[0] - a.b[0]) * t, a.b[1] + (b.b[1] - a.b[1]) * t, a.b[2] + (b.b[2] - a.b[2]) * t, b.b[3]];
    v.p = b.p.map((q, k) => { const p0 = a.p[k]; return [p0[0] + (q[0] - p0[0]) * t, p0[1] + (q[1] - p0[1]) * t, lerpA(p0[2], q[2], t), p0[3] + (q[3] - p0[3]) * t, q[4], q[5], q[6], q[7], q[7] === p0[7] ? p0[8] + (q[8] - p0[8]) * t : q[8]]; });
    return v;
  }
  function playEvent(e, v) {
    Sfx.play(e);
    if (e === 'goal' && v) {
      const right = v.b[0] > FG.C.W / 2;
      const scorer = (right ? v.d0 > 0 : v.d0 < 0) ? 0 : 1;
      S.rend && S.rend.confetti(right ? FG.C.W : 0, S.cfg.teams[scorer].kit);
      S.r3 && S.view === '3d' && S.r3.confetti(right ? FG.C.W : 0, S.cfg.teams[scorer].kit);
      if (navigator.vibrate && scorer === S.local) navigator.vibrate([60, 40, 120]);
    }
  }

  /* ---------- HUD ---------- */
  let lastHud = {};
  function setText(id, t) { if (lastHud[id] !== t) { lastHud[id] = t; $(id).textContent = t; } }
  function setHtml(id, t) { if (lastHud[id] !== t) { lastHud[id] = t; $(id).innerHTML = t; } }
  function hud(v) {
    setText('#h-s0', v.sc[0]); setText('#h-s1', v.sc[1]);
    const ck = Math.max(0, v.ck); setText('#h-clock', String(Math.floor(ck / 60)).padStart(2, '0') + ':' + String(ck % 60).padStart(2, '0'));
    setText('#h-half', v.hf === 1 ? 'B1' : 'B2');
    for (let i = 0; i < 2; i++) {
      const n = v.fo[i]; let h = ''; for (let k = 1; k <= 5; k++) h += '<u class="' + (n >= k ? 'on' : '') + '"></u>';
      setHtml('#h-fo' + i, h); $('#h-fo' + i).classList.toggle('max', n >= 5);
    }
    const bn = $('#h-banner'); if (lastHud.bn !== v.bn) { lastHud.bn = v.bn; if (v.bn) bn.textContent = v.bn; bn.classList.toggle('on', !!v.bn && v.ph !== 'fulltime'); }
    const tt = $('#h-toast'); if (lastHud.tt !== v.tt) { lastHud.tt = v.tt; if (v.tt) tt.textContent = v.tt; tt.classList.toggle('on', !!v.tt); }
    let si = '';
    if (v.sp) si = FG.SET_NAMES[v.sp.t] + (v.sp.cd ? '<b>' + v.sp.cd + '</b>' : '') + (v.sp.tm === S.local ? '<br><small style="color:#93a4bf;font-size:11px">' + (v.sp.t.startsWith('PEN') ? 'Arahkan → Tembak' : 'Arahkan → Umpan') + '</small>' : '');
    else if (v.g4 && v.g4[S.local]) si = 'Kiper 4 detik<b>' + v.g4[S.local] + '</b>';
    setHtml('#h-set', si); $('#h-set').classList.toggle('on', !!si);
    const att = v.at[S.local];
    if (lastHud.att !== att) {
      lastHud.att = att;
      $('#lb-pass').textContent = att ? 'Umpan' : 'Ganti';
      $('#lb-shoot').textContent = att ? 'Tembak' : 'Tekel';
      $('#lb-lob').textContent = att ? 'Lambung' : 'Tekan';
      $('#lb-thru').textContent = att ? 'Terobos' : 'Jaga';
    }
    // halftime overlay
    const half = v.ph === 'halftime';
    if (half !== !$('#ov-half').classList.contains('hide')) {
      $('#ov-half').classList.toggle('hide', !half);
      if (half) $('#half-box').innerHTML = '<h2>Turun Minum</h2>' + scoreLine(v.sc) + '<p class="hint">Babak kedua dimulai sebentar lagi. Tim bertukar sisi lapangan.<br>Tekan Umpan / Tembak untuk lanjut.</p>';
    }
  }
  function scoreLine(sc) { const c = S.cfg; return '<div class="res-score"><span class="fl">' + c.teams[0].flag + '</span>' + sc[0] + ' - ' + sc[1] + '<span class="fl">' + c.teams[1].flag + '</span></div>'; }

  /* ---------- pause / end ---------- */
  function togglePause(force) {
    const on = force != null ? force : $('#ov-pause').classList.contains('hide');
    $('#ov-pause').classList.toggle('hide', !on);
    if (S.mode === 'cpu') S.paused = on;
  }
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#btn-resume').addEventListener('click', () => togglePause(false));
  $('#btn-sound').addEventListener('click', () => { Sfx.on = !Sfx.on; if (Sfx.crowd) Sfx.crowd.gain.value = Sfx.on ? 0.05 : 0; $('#btn-sound').textContent = 'Suara: ' + (Sfx.on ? 'Hidup' : 'Mati'); });
  $('#btn-view').addEventListener('click', () => { S.view = S.view === '3d' ? 'side' : S.view === 'side' ? 'top' : '3d'; S.rend.sc.cx = null; applyView(); try { localStorage.setItem('fap_view', S.view); } catch (e) {} });
  const GFX = ['auto', 'high', 'med', 'low'], GFXN = { auto: 'Otomatis', high: 'Tinggi', med: 'Sedang', low: 'Rendah (paling ringan)' };
  $('#btn-gfx').addEventListener('click', () => {
    S.gfx = GFX[(GFX.indexOf(S.gfx) + 1) % GFX.length]; try { localStorage.setItem('fap_gfx', S.gfx); } catch (e) {}
    $('#btn-gfx').textContent = 'Grafis: ' + GFXN[S.gfx];
    if (S.r3) { try { S.r3.r.dispose(); S.r3.r.forceContextLoss(); } catch (e) {} const old = $('#cv3'), nc = old.cloneNode(false); old.replaceWith(nc); S.r3 = null; }
    if (S.view === '3d') applyView();
  });
  function applyView() {
    $('#btn-gfx').textContent = 'Grafis: ' + GFXN[S.gfx];
    if (S.view === '3d' && !S.r3 && FG.Renderer3D && FG.has3D()) {
      try { S.r3 = new FG.Renderer3D($('#cv3'), S.rend, S.gfx); } catch (e) { console.warn('3D tidak tersedia', e); S.r3 = null; }
    }
    if (S.view === '3d' && !S.r3) S.view = 'side';
    const is3d = S.view === '3d';
    $('#cv3').classList.toggle('hide', !is3d);
    if (is3d) { S.r3.resize(); S.r3.setZoom(S.zoom); S.r3.lastBall = null; }
    S.rend.mode = is3d ? 'side' : S.view;
    $('#btn-view').textContent = 'Sudut: ' + (is3d ? '3D' : S.view === 'side' ? 'Samping 2D' : 'Atas');
  }
  function render(v, dt, local) {
    if (S.view === '3d' && S.r3) S.r3.draw(v, S.cfg, dt, local, S.rend);
    else S.rend.draw(v, S.cfg, dt, local);
  }
  $('#btn-fs').addEventListener('click', () => { goLandscape(); togglePause(false); });
  function goLandscape() {
    // layar penuh + kunci lanskap (didukung Android Chrome; iOS cukup putar HP)
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) {}
  }
  function zoomName(z) { return z <= 11 ? 'Dekat' : z >= 21 ? 'Jauh' : 'Sedang'; }
  $('#btn-zoom').addEventListener('click', () => { S.zoom = S.zoom <= 11 ? 15 : S.zoom >= 21 ? 11 : 21; S.rend.setZoom(S.zoom); S.r3 && S.r3.setZoom(S.zoom); $('#btn-zoom').textContent = 'Jarak kamera: ' + zoomName(S.zoom); try { localStorage.setItem('fap_zoom', S.zoom); } catch (e) {} });
  $('#btn-quit').addEventListener('click', () => {
    if (S.mode === 'cpu') { stopGame(); show('home'); return; }
    if (!confirm('Menyerah? Lawan akan dinyatakan menang 3-0.')) return;
    if (S.mode === 'host') { S.match.teams[0].score = 0; S.match.teams[1].score = Math.max(3, S.match.teams[1].score); endMatch(true); }
    else { Net.send('ping', { forfeit: true }); Net.setStatus(S.room.id, 'aborted'); stopGame(); leaveRoom(); show('home'); }
  });
  async function endMatch() {
    S.ended = true;
    const r = S.match.result();
    if (S.mode === 'host') { Net.send('end', r); await Net.finish(S.room.id, r.score[0], r.score[1]); Net.loadProfile(); }
    setTimeout(() => showResult(r), 900);
  }
  function showResult(r, note) {
    togglePause(false);
    const c = S.cfg;
    let html = '<h2>' + (note ? 'Pertandingan Berakhir' : 'Hasil Akhir') + '</h2>';
    if (r) {
      const me = S.local, my = r.score[me], op = r.score[1 - me];
      const label = S.mode === 'cpu' || S.mode === 'host' || S.mode === 'guest' ? (my > op ? '🏆 MENANG' : my < op ? 'KALAH' : 'SERI') : '';
      html += '<p style="font-family:var(--f-disp);font-size:22px;color:var(--gold);margin:0">' + label + '</p>' + scoreLine(r.score);
      const col = (t) => r.goals.filter((g) => g.team === t).map((g) => '⚽ ' + esc(g.name.split(' ').slice(-1)[0]) + ' ' + g.min + "'" + (g.og ? ' (bd)' : '')).join('<br>');
      html += '<div class="res-goals"><div>' + col(0) + '</div><div>' + col(1) + '</div></div>';
      const st = r.stats, tp = st.poss[0] + st.poss[1] || 1;
      const rows = [['Penguasaan', Math.round((st.poss[0] / tp) * 100) + '%', Math.round((st.poss[1] / tp) * 100) + '%'], ['Tembakan', st.shots[0], st.shots[1]], ['Tepat sasaran', st.onT[0], st.onT[1]], ['Umpan sukses', st.passes[0], st.passes[1]], ['Pelanggaran', st.fouls[0], st.fouls[1]], ['Kartu', st.cards[0], st.cards[1]]];
      html += '<table class="res-stats">' + rows.map((x) => '<tr><td>' + x[1] + '</td><td>' + x[0] + '</td><td>' + x[2] + '</td></tr>').join('') + '</table>';
    }
    if (note) html += '<p class="hint">' + esc(note) + '</p>';
    html += (S.mode === 'cpu' ? '<button class="btn primary" id="btn-again">Main lagi</button>' : '') + '<button class="btn" id="btn-menu">Kembali ke menu</button>';
    $('#end-box').innerHTML = html;
    $('#ov-end').classList.remove('hide');
    const again = $('#btn-again');
    if (again) again.onclick = () => { $('#ov-end').classList.add('hide'); startGame('cpu', S.match.o); };
    $('#btn-menu').onclick = () => { stopGame(); leaveRoom(); show(Net.user && S.mode !== 'cpu' ? 'pvp' : 'home'); };
  }
  function stopGame() { cancelAnimationFrame(S.raf); S.started = false; $('#ov-end').classList.add('hide'); $('#ov-pause').classList.add('hide'); }

  function toastDom(t) {
    let el = $('#dom-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dom-toast'; el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#12233d;border:1px solid #22395e;padding:10px 16px;border-radius:12px;z-index:50;font-size:14px;max-width:90vw;transition:opacity .3s'; document.body.appendChild(el); }
    el.textContent = t; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => (el.style.opacity = 0), 3200);
  }

  /* ---------- history ---------- */
  async function renderHistory() {
    if (!Net.user) return;
    await Net.loadProfile();
    const p = Net.profile, gp = p.wins + p.draws + p.losses;
    $('#prof-box').innerHTML = '<h3 style="margin:0 0 4px;font-family:var(--f-disp);font-size:26px">' + esc(p.username) + '</h3><p class="hint">' + esc(Net.myEmail()) + (p.favorite_team && TB[p.favorite_team] ? ' · Tim favorit ' + TB[p.favorite_team].flag + ' ' + TB[p.favorite_team].name : '') + '</p>' +
      '<div class="prof"><div><b>' + gp + '</b><small>Main</small></div><div><b style="color:var(--ok)">' + p.wins + '</b><small>Menang</small></div><div><b>' + (gp ? Math.round((p.wins / gp) * 100) : 0) + '%</b><small>Rasio</small></div><div><b>' + p.draws + '</b><small>Seri</small></div><div><b style="color:var(--hot)">' + p.losses + '</b><small>Kalah</small></div><div><b>' + p.goals_for + ':' + p.goals_against + '</b><small>Gol</small></div></div>';
    const L = await Net.history();
    $('#hist-list').innerHTML = L.length ? L.map((m) => {
      const host = m.host_id === Net.user.id, my = host ? m.score_host : m.score_guest, op = host ? m.score_guest : m.score_host;
      const res = my > op ? '<b style="color:var(--ok)">M</b>' : my < op ? '<b style="color:var(--hot)">K</b>' : '<b>S</b>';
      return '<div class="inv"><span style="font-size:22px">' + TB[m.host_team].flag + '</span><div class="who"><b>' + esc(m.host_name || m.host_email) + ' ' + m.score_host + ' - ' + m.score_guest + ' ' + esc(m.guest_name || m.guest_email) + '</b><small>' + new Date(m.finished_at).toLocaleString('id-ID') + '</small></div><span style="font-size:22px">' + (m.guest_team ? TB[m.guest_team].flag : '') + '</span>' + res + '</div>';
    }).join('') : '<div class="empty">Belum ada pertandingan PvP.</div>';
  }

  FG._state = S; // untuk debug di konsol

  /* ---------- boot ---------- */
  (async function boot() {
    S.online = Net.init();
    if (!S.online) { $('#auth-online').classList.add('hide'); $('#auth-offline').classList.remove('hide'); show('auth'); return; }
    try {
      const u = await Net.restore();
      Net.sb.auth.onAuthStateChange((ev, sess) => { if (ev === 'PASSWORD_RECOVERY') { const np = prompt('Masukkan kata sandi baru (min. 6 karakter):'); if (np) Net.sb.auth.updateUser({ password: np }).then(() => toastDom('Kata sandi diperbarui.')); } });
      if (u) afterLogin(); else show('auth');
    } catch (e) { show('auth'); }
  })();
})();
