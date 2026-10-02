/* Futsal Asia Pro — data tim & karakter (semua nama pemain FIKTIF) */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  const SKINS = ['#f3d0ab', '#e8b78c', '#d49e6e', '#bb8154', '#98623b', '#714828'];
  const HAIRS = ['#121212', '#1d1510', '#2c1c12', '#43291a', '#5e3f26'];

  FG.TRAITS = {
    'Tembakan Roket': 'Tendangan lebih keras (+10% tenaga tembakan)',
    'Penyelesai Dingin': 'Tembakan jauh lebih akurat di depan gawang',
    'Visi Umpan': 'Umpan lebih presisi, terobosan lebih tajam',
    'Kaki Lincah': 'Gerak tipu (skill) lebih jauh & lebih lama lolos tekel',
    'Tembok Baja': 'Peluang merebut bola saat tekel lebih tinggi',
    'Paru-paru Kuda': 'Stamina terkuras 40% lebih lambat saat sprint',
    'Pelari Kilat': 'Kecepatan lari +5%',
    'Pivot Tangguh': 'Sulit direbut saat membelakangi lawan',
    'Refleks Kucing': 'Jangkauan penyelamatan kiper +12%',
    'Tangan Lem': 'Kiper lebih sering menangkap, bukan menepis'
  };

  // [nama, posisi, nomor, sifat]
  const TEAMS = [
    ['IDN', 'Indonesia', '🇮🇩', 'Garuda Futsal', 79, 'Transisi cepat & pressing tinggi', ['#d71f26', '#ffffff'], ['#ffffff', '#d71f26'], ['#1e1e1e', '#f5c400'], [1, 2, 3], [
      ['Rizky Pratama', 'GK', 1, 'Refleks Kucing'], ['Bagas Saputra', 'FIXO', 4, 'Tembok Baja'], ['Dimas Ardiansyah', 'ALA', 7, 'Kaki Lincah'], ['Fajar Nugroho', 'ALA', 11, 'Pelari Kilat'], ['Yusuf Hidayat', 'PIVOT', 9, 'Tembakan Roket'], ['Andika Maulana', 'ALA', 10, 'Visi Umpan'], ['Galih Ramadhan', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['JPN', 'Jepang', '🇯🇵', 'Samurai Biru', 84, 'Umpan pendek presisi & rotasi', ['#1b3f94', '#ffffff'], ['#ffffff', '#1b3f94'], ['#2bb673', '#111111'], [0, 1], [
      ['Haruto Kanemura', 'GK', 1, 'Tangan Lem'], ['Sota Morikawa', 'FIXO', 3, 'Visi Umpan'], ['Ren Takeshima', 'ALA', 8, 'Kaki Lincah'], ['Yuki Hoshino', 'ALA', 10, 'Penyelesai Dingin'], ['Kaito Arimura', 'PIVOT', 9, 'Pivot Tangguh'], ['Daichi Yoshinaga', 'ALA', 7, 'Pelari Kilat'], ['Shun Nakaoka', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['IRN', 'Iran', '🇮🇷', 'Singa Persia', 88, 'Teknik tinggi, raja futsal Asia', ['#ffffff', '#da0000'], ['#da0000', '#ffffff'], ['#222222', '#2a9d8f'], [1, 2], [
      ['Arman Kazemi', 'GK', 1, 'Refleks Kucing'], ['Behnam Rostami', 'FIXO', 6, 'Tembok Baja'], ['Farid Mousavi', 'ALA', 7, 'Kaki Lincah'], ['Saeed Tavakoli', 'ALA', 11, 'Visi Umpan'], ['Mehdi Javanmard', 'PIVOT', 10, 'Penyelesai Dingin'], ['Ali Asghari', 'ALA', 8, 'Tembakan Roket'], ['Reza Karimpour', 'FIXO', 4, 'Paru-paru Kuda']]],
    ['THA', 'Thailand', '🇹🇭', 'Gajah Perang', 82, 'Agresif & tembakan jarak jauh', ['#1546a0', '#ffffff'], ['#ffffff', '#c8102e'], ['#f28c28', '#111111'], [1, 2, 3], [
      ['Kittisak Wongsa', 'GK', 1, 'Tangan Lem'], ['Anucha Srisuk', 'FIXO', 4, 'Tembok Baja'], ['Thanawat Boonmee', 'ALA', 7, 'Pelari Kilat'], ['Pongsakorn Chaiyo', 'ALA', 11, 'Kaki Lincah'], ['Nattapong Rattana', 'PIVOT', 9, 'Tembakan Roket'], ['Sarawut Kaewmanee', 'ALA', 10, 'Visi Umpan'], ['Chaiwat Inthong', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['VIE', 'Vietnam', '🇻🇳', 'Bintang Emas', 77, 'Disiplin & serangan balik', ['#da251d', '#ffcd00'], ['#ffffff', '#da251d'], ['#14213d', '#ffcd00'], [0, 1, 2], [
      ['Nguyen Van Hieu', 'GK', 1, 'Refleks Kucing'], ['Tran Duc Long', 'FIXO', 4, 'Tembok Baja'], ['Pham Minh Khoa', 'ALA', 7, 'Pelari Kilat'], ['Le Quoc Bao', 'ALA', 10, 'Kaki Lincah'], ['Vu Thanh Tung', 'PIVOT', 9, 'Pivot Tangguh'], ['Do Hoang Nam', 'ALA', 11, 'Penyelesai Dingin'], ['Bui Tien Dat', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['KOR', 'Korea Selatan', '🇰🇷', 'Harimau Asia', 70, 'Fisik kuat & kerja keras', ['#e1251b', '#111111'], ['#ffffff', '#111111'], ['#2d6a4f', '#ffffff'], [0, 1], [
      ['Kim Do-hyun', 'GK', 1, 'Tangan Lem'], ['Park Seung-woo', 'FIXO', 4, 'Paru-paru Kuda'], ['Lee Ji-hoon', 'ALA', 7, 'Pelari Kilat'], ['Choi Jun-seo', 'ALA', 11, 'Visi Umpan'], ['Jung Hae-won', 'PIVOT', 9, 'Tembakan Roket'], ['Kang Tae-yang', 'ALA', 10, 'Kaki Lincah'], ['Yoon Sang-hoon', 'FIXO', 5, 'Tembok Baja']]],
    ['KSA', 'Arab Saudi', '🇸🇦', 'Elang Hijau', 73, 'Kontrol bola & umpan sabar', ['#0a7d3b', '#ffffff'], ['#ffffff', '#0a7d3b'], ['#111111', '#f4d35e'], [2, 3, 4], [
      ['Faisal Al-Harbi', 'GK', 1, 'Refleks Kucing'], ['Turki Al-Qahtani', 'FIXO', 4, 'Tembok Baja'], ['Nawaf Al-Otaibi', 'ALA', 7, 'Kaki Lincah'], ['Saud Al-Ghamdi', 'ALA', 11, 'Pelari Kilat'], ['Majed Al-Shehri', 'PIVOT', 9, 'Pivot Tangguh'], ['Bandar Al-Zahrani', 'ALA', 10, 'Visi Umpan'], ['Khalid Al-Mutairi', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['UZB', 'Uzbekistan', '🇺🇿', 'Serigala Putih', 80, 'Pivot kuat & bola panjang', ['#ffffff', '#0099b5'], ['#0099b5', '#ffffff'], ['#e63946', '#111111'], [0, 1, 2], [
      ['Jasur Karimov', 'GK', 1, 'Tangan Lem'], ['Bekzod Tursunov', 'FIXO', 4, 'Tembok Baja'], ['Sardor Rakhimov', 'ALA', 7, 'Kaki Lincah'], ['Otabek Yusupov', 'ALA', 11, 'Visi Umpan'], ['Dilshod Ergashev', 'PIVOT', 9, 'Pivot Tangguh'], ['Ulugbek Nazarov', 'ALA', 10, 'Tembakan Roket'], ['Sherzod Alimov', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['KUW', 'Kuwait', '🇰🇼', 'Ombak Teluk', 76, 'Tempo cepat di sayap', ['#0072bc', '#ffffff'], ['#ffffff', '#0072bc'], ['#111111', '#2a9d8f'], [2, 3, 4], [
      ['Hamad Al-Enezi', 'GK', 1, 'Refleks Kucing'], ['Abdullah Al-Rashidi', 'FIXO', 4, 'Tembok Baja'], ['Yousef Al-Kandari', 'ALA', 7, 'Pelari Kilat'], ['Fahad Al-Ajmi', 'ALA', 11, 'Kaki Lincah'], ['Mubarak Al-Dosari', 'PIVOT', 9, 'Tembakan Roket'], ['Salem Al-Hajri', 'ALA', 10, 'Penyelesai Dingin'], ['Nasser Al-Shammari', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['MAS', 'Malaysia', '🇲🇾', 'Harimau Malaya', 71, 'Semangat tinggi & gerak cepat', ['#ffcc00', '#111111'], ['#0a2b78', '#ffcc00'], ['#e63946', '#ffffff'], [1, 2, 3], [
      ['Hafiz Rahman', 'GK', 1, 'Tangan Lem'], ['Aiman Zulkifli', 'FIXO', 4, 'Tembok Baja'], ['Danish Hakimi', 'ALA', 7, 'Pelari Kilat'], ['Irfan Shahrul', 'ALA', 11, 'Kaki Lincah'], ['Syafiq Azman', 'PIVOT', 9, 'Tembakan Roket'], ['Haziq Ridzuan', 'ALA', 10, 'Visi Umpan'], ['Amirul Faiz', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['CHN', 'Tiongkok', '🇨🇳', 'Naga Merah', 70, 'Postur tinggi & bertahan rapat', ['#de2910', '#ffde00'], ['#ffffff', '#de2910'], ['#1d3557', '#ffffff'], [0, 1], [
      ['Wang Haoran', 'GK', 1, 'Refleks Kucing'], ['Li Zhiyuan', 'FIXO', 4, 'Tembok Baja'], ['Zhang Yifan', 'ALA', 7, 'Pelari Kilat'], ['Chen Junjie', 'ALA', 11, 'Visi Umpan'], ['Liu Zihao', 'PIVOT', 9, 'Pivot Tangguh'], ['Zhao Mingxuan', 'ALA', 10, 'Kaki Lincah'], ['Huang Tianyu', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['IRQ', 'Irak', '🇮🇶', 'Singa Mesopotamia', 74, 'Duel keras & tembakan spekulatif', ['#ffffff', '#007a3d'], ['#007a3d', '#ffffff'], ['#111111', '#e9c46a'], [2, 3], [
      ['Mustafa Al-Jubouri', 'GK', 1, 'Tangan Lem'], ['Ahmed Kadhim', 'FIXO', 4, 'Tembok Baja'], ['Haider Abbas', 'ALA', 7, 'Kaki Lincah'], ['Ali Hussein', 'ALA', 11, 'Pelari Kilat'], ['Karrar Jassim', 'PIVOT', 9, 'Tembakan Roket'], ['Hassan Salman', 'ALA', 10, 'Visi Umpan'], ['Murtadha Fadhil', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['LBN', 'Lebanon', '🇱🇧', 'Cedar', 72, 'Kreatif & penuh variasi', ['#e3242b', '#ffffff'], ['#ffffff', '#00a651'], ['#111111', '#00a651'], [1, 2], [
      ['Georges Haddad', 'GK', 1, 'Refleks Kucing'], ['Karim Nassar', 'FIXO', 4, 'Visi Umpan'], ['Rami Khoury', 'ALA', 7, 'Kaki Lincah'], ['Elie Rizk', 'ALA', 11, 'Pelari Kilat'], ['Hadi Mansour', 'PIVOT', 9, 'Penyelesai Dingin'], ['Tarek Fares', 'ALA', 10, 'Tembakan Roket'], ['Jad Sleiman', 'FIXO', 5, 'Tembok Baja']]],
    ['KGZ', 'Kirgizstan', '🇰🇬', 'Elang Tian Shan', 74, 'Daya tahan & pressing', ['#e8112d', '#ffef00'], ['#ffffff', '#e8112d'], ['#1d3557', '#ffef00'], [0, 1, 2], [
      ['Aibek Toktogulov', 'GK', 1, 'Tangan Lem'], ['Nurlan Asanov', 'FIXO', 4, 'Tembok Baja'], ['Bakyt Sydykov', 'ALA', 7, 'Paru-paru Kuda'], ['Emil Zhumabaev', 'ALA', 11, 'Kaki Lincah'], ['Daniyar Osmonov', 'PIVOT', 9, 'Pivot Tangguh'], ['Ruslan Abdyrakhmanov', 'ALA', 10, 'Pelari Kilat'], ['Timur Kaliev', 'FIXO', 5, 'Visi Umpan']]],
    ['AFG', 'Afganistan', '🇦🇫', 'Singa Khorasan', 75, 'Dribel berani & duel satu lawan satu', ['#be0000', '#111111'], ['#ffffff', '#007a36'], ['#f4a261', '#111111'], [1, 2, 3], [
      ['Farhad Ahmadzai', 'GK', 1, 'Refleks Kucing'], ['Naveed Sultani', 'FIXO', 4, 'Tembok Baja'], ['Omid Rahimi', 'ALA', 7, 'Kaki Lincah'], ['Sohail Nazari', 'ALA', 11, 'Pelari Kilat'], ['Bilal Hakimi', 'PIVOT', 9, 'Tembakan Roket'], ['Jawid Popal', 'ALA', 10, 'Penyelesai Dingin'], ['Mansoor Wardak', 'FIXO', 5, 'Paru-paru Kuda']]],
    ['TJK', 'Tajikistan', '🇹🇯', 'Mahkota Pamir', 73, 'Kolektif & umpan satu-dua', ['#00843d', '#ffffff'], ['#ffffff', '#cc0000'], ['#111111', '#f8c300'], [1, 2], [
      ['Firdavs Rahmonov', 'GK', 1, 'Tangan Lem'], ['Davron Nazarov', 'FIXO', 4, 'Tembok Baja'], ['Rustam Saidov', 'ALA', 7, 'Visi Umpan'], ['Behruz Kholov', 'ALA', 11, 'Kaki Lincah'], ['Komron Mirzoev', 'PIVOT', 9, 'Pivot Tangguh'], ['Parviz Sharipov', 'ALA', 10, 'Pelari Kilat'], ['Umed Davlatov', 'FIXO', 5, 'Paru-paru Kuda']]]
  ];

  const BIAS = {
    GK: { pac: -14, sho: -28, pas: -6, drb: -20, def: -12, phy: -2, ref: 8, han: 6 },
    FIXO: { pac: -3, sho: -5, pas: 3, drb: -4, def: 9, phy: 5, ref: -45, han: -45 },
    ALA: { pac: 6, sho: 0, pas: 2, drb: 6, def: -4, phy: -4, ref: -45, han: -45 },
    PIVOT: { pac: -2, sho: 8, pas: 0, drb: 2, def: -7, phy: 8, ref: -45, han: -45 }
  };
  const TRAIT_BOOST = {
    'Tembakan Roket': { sho: 4 }, 'Penyelesai Dingin': { sho: 3 }, 'Visi Umpan': { pas: 5 }, 'Kaki Lincah': { drb: 5 },
    'Tembok Baja': { def: 5 }, 'Paru-paru Kuda': { phy: 4 }, 'Pelari Kilat': { pac: 5 }, 'Pivot Tangguh': { phy: 5 },
    'Refleks Kucing': { ref: 5 }, 'Tangan Lem': { han: 5 }
  };

  function seeded(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 100000) / 100000; };
  }
  const cl = (v) => Math.max(40, Math.min(97, Math.round(v)));

  function ovr(pos, s) {
    if (pos === 'GK') return Math.round(s.ref * 0.42 + s.han * 0.36 + s.pas * 0.1 + s.pac * 0.12);
    if (pos === 'FIXO') return Math.round(s.def * 0.35 + s.pas * 0.2 + s.phy * 0.15 + s.pac * 0.12 + s.drb * 0.1 + s.sho * 0.08);
    if (pos === 'PIVOT') return Math.round(s.sho * 0.32 + s.phy * 0.2 + s.drb * 0.16 + s.pas * 0.14 + s.pac * 0.12 + s.def * 0.06);
    return Math.round(s.pac * 0.22 + s.drb * 0.26 + s.pas * 0.2 + s.sho * 0.2 + s.def * 0.06 + s.phy * 0.06);
  }

  FG.TEAMS = TEAMS.map(([id, name, flag, nick, rating, style, home, away, gk, skins, pl]) => {
    const roster = pl.map(([pname, pos, num, trait], ri) => {
      const r = seeded(id + pname);
      const s = {};
      for (const k of ['pac', 'sho', 'pas', 'drb', 'def', 'phy', 'ref', 'han']) {
        s[k] = cl(rating - 8 + BIAS[pos][k] + (r() - 0.5) * 10 + ((TRAIT_BOOST[trait] || {})[k] || 0));
      }
      if (pos !== 'GK') { s.ref = cl(30 + r() * 10); s.han = cl(30 + r() * 10); }
      return {
        ri, name: pname, pos, num, trait, s, ovr: ovr(pos, s),
        skin: SKINS[skins[Math.floor(r() * skins.length)]],
        hair: HAIRS[Math.floor(r() * 3)], hs: Math.floor(r() * 5)
      };
    });
    const ovrTeam = Math.round(roster.slice(0, 5).reduce((a, p) => a + p.ovr, 0) / 5);
    return { id, name, flag, nick, rating: ovrTeam, style, home, away, gk, roster };
  });
  FG.TEAM_BY_ID = {};
  FG.TEAMS.forEach((t) => (FG.TEAM_BY_ID[t.id] = t));
  FG.POS_NAME = { GK: 'Kiper', FIXO: 'Fixo (Bek)', ALA: 'Ala (Sayap)', PIVOT: 'Pivot (Penyerang)' };
  FG.STAT_NAME = { pac: 'Kecepatan', sho: 'Tembakan', pas: 'Umpan', drb: 'Dribel', def: 'Bertahan', phy: 'Fisik', ref: 'Refleks', han: 'Tangkapan' };
})();
