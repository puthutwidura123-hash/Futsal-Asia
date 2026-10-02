/* Futsal Asia Pro — layanan online (Supabase Auth + Postgres + Realtime) */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  const Net = {
    sb: null, user: null, profile: null, room: null, invSub: null,
    ready() { return !!this.sb; },
    init() {
      const c = FG.CONFIG || {};
      if (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY || !window.supabase) return false;
      this.sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 40 } }
      });
      return true;
    },
    async restore() {
      const { data } = await this.sb.auth.getSession();
      this.user = data.session ? data.session.user : null;
      if (this.user) await this.loadProfile();
      return this.user;
    },
    async signUp(email, password, username) {
      const { data, error } = await this.sb.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { username: username.trim() }, emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw error;
      return data;
    },
    async signIn(email, password) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      this.user = data.user; await this.loadProfile(); return data.user;
    },
    async resetPassword(email) {
      const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname });
      if (error) throw error;
    },
    async signOut() { this.unsubInvites(); await this.sb.auth.signOut(); this.user = null; this.profile = null; },
    async loadProfile() {
      const { data } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
      this.profile = data || { username: this.user.email.split('@')[0], wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 };
      return this.profile;
    },
    async setFavorite(team) { await this.sb.from('profiles').update({ favorite_team: team }).eq('id', this.user.id); },
    myEmail() { return (this.user && this.user.email || '').toLowerCase(); },

    async createInvite(guestEmail, team, halfMinutes) {
      const g = guestEmail.trim().toLowerCase();
      if (g === this.myEmail()) throw new Error('Tidak bisa mengundang diri sendiri.');
      const { data, error } = await this.sb.from('matches').insert({
        host_email: this.myEmail(), host_name: this.profile.username, host_team: team, guest_email: g, half_minutes: halfMinutes
      }).select().single();
      if (error) throw error;
      return data;
    },
    async listInvites() {
      const { data, error } = await this.sb.from('matches').select('*').in('status', ['pending', 'accepted', 'playing'])
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      // buang undangan basi (> 6 jam)
      const now = Date.now();
      return (data || []).filter((m) => now - new Date(m.created_at).getTime() < 6 * 3600 * 1000);
    },
    async getMatch(id) { const { data, error } = await this.sb.from('matches').select('*').eq('id', id).maybeSingle(); if (error) throw error; return data; },
    async accept(id, team) {
      const { data, error } = await this.sb.from('matches').update({ status: 'accepted', guest_id: this.user.id, guest_name: this.profile.username, guest_team: team })
        .eq('id', id).eq('status', 'pending').select().single();
      if (error) throw error;
      return data;
    },
    async setStatus(id, status) { await this.sb.from('matches').update({ status }).eq('id', id); },
    async finish(id, h, g) { const { error } = await this.sb.rpc('finish_match', { p_match: id, p_host: h, p_guest: g }); if (error) console.warn(error); },
    async history() {
      const { data } = await this.sb.from('matches').select('*').eq('status', 'finished').order('finished_at', { ascending: false }).limit(25);
      return data || [];
    },
    subInvites(cb) {
      this.unsubInvites();
      const me = this.myEmail();
      this.invSub = this.sb.channel('inv-' + this.user.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'guest_email=eq.' + me }, (p) => cb(p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'host_id=eq.' + this.user.id }, (p) => cb(p))
        .subscribe();
    },
    unsubInvites() { if (this.invSub) { this.sb.removeChannel(this.invSub); this.invSub = null; } },

    /* Ruang pertandingan: host = otoritas simulasi; tamu kirim input, host kirim snapshot */
    joinRoom(matchId, role, h) {
      this.leaveRoom();
      const ch = this.sb.channel('match-' + matchId, { config: { broadcast: { self: false, ack: false }, presence: { key: role } } });
      ch.on('broadcast', { event: 'in' }, ({ payload }) => h.onInput && h.onInput(payload));
      ch.on('broadcast', { event: 'snap' }, ({ payload }) => h.onSnap && h.onSnap(payload));
      ch.on('broadcast', { event: 'cfg' }, ({ payload }) => h.onCfg && h.onCfg(payload));
      ch.on('broadcast', { event: 'end' }, ({ payload }) => h.onEnd && h.onEnd(payload));
      ch.on('broadcast', { event: 'ping' }, ({ payload }) => h.onPing && h.onPing(payload));
      ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(); h.onPresence && h.onPresence(Object.keys(st)); });
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await ch.track({ role, user: this.user.id, at: Date.now() }); h.onJoined && h.onJoined(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') h.onError && h.onError(status);
      });
      this.room = ch;
      return ch;
    },
    send(event, payload) { if (this.room) this.room.send({ type: 'broadcast', event, payload }); },
    leaveRoom() { if (this.room) { try { this.room.untrack(); } catch (e) {} this.sb.removeChannel(this.room); this.room = null; } }
  };
  FG.Net = Net;
})();
