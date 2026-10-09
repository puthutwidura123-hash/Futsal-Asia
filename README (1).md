# Futsal Asia Pro ⚽

Game futsal web 5 lawan 5 dengan 16 tim nasional Asia (112 karakter fiksi), aturan futsal FIFA, mode lawan CPU, dan **PvP online** dengan akun email + undangan.

Berjalan di browser HP & PC (layar sentuh, keyboard, gamepad). Tanpa build tool — cukup file statis.

---

## Isi proyek

Semua file berada dalam **satu folder** (tanpa subfolder). Unggah ke-15 file ini apa adanya ke repo GitHub.

```
index.html           – semua layar (login, menu, tim, lobi, game)
style.css            – tampilan
config.js            – ← isi URL & anon key Supabase di sini
data.js              – 16 tim, 7 pemain/tim, atribut, sifat khusus, jersey
engine.js            – mesin pertandingan: fisika, AI, aturan futsal, replay
render.js            – grafis 2D: kamera atas + radar
render-side.js       – kamera samping 2D (mode ringan)
render3d.js          – grafis 3D WebGL (Three.js)
input.js             – kontrol keyboard / sentuh / gamepad + suara
net.js               – Supabase Auth, undangan, Realtime PvP
app.js               – alur menu & loop permainan
manifest.webmanifest – pasang di layar utama HP (layar penuh, lanskap)
icon.svg             – ikon aplikasi
schema.sql           – tabel, keamanan (RLS) & fungsi skor (dijalankan di Supabase, tidak wajib diunggah)
README.md            – panduan ini
```

## Performa

- Tiap pemain 3D digambar hanya dengan 2 *draw call* (dulu ±50), sehingga jauh lebih ringan di HP.
- Gerakan diinterpolasi antar langkah simulasi, jadi tetap halus di layar 60/90/120 Hz.
- Tombol jeda ❚❚ → **Grafis**: Otomatis / Tinggi / Sedang / Rendah. Bila masih berat, pilih **Rendah** atau sudut **Samping 2D**.

## Coba langsung (offline)

Buka `index.html` lewat server lokal, misalnya:

```bash
npx serve .      # atau: python3 -m http.server
```

Tanpa konfigurasi Supabase, game otomatis berjalan dalam mode **lawan CPU**.

## Mengaktifkan akun email & PvP (±10 menit)

1. **Buat project** di [supabase.com](https://supabase.com) (gratis).
2. **SQL Editor → New query**, tempel seluruh isi `schema.sql`, lalu **Run**.
3. **Authentication → Sign In / Providers → Email**: pastikan aktif. "Confirm email" boleh dibiarkan hidup (pemain harus klik link konfirmasi) atau dimatikan saat uji coba.
4. **Project Settings → API**: salin *Project URL* dan *anon public key* ke `config.js`.
5. **Authentication → URL Configuration**: isi *Site URL* dengan alamat game Anda (mis. `https://futsal-asia.vercel.app`) dan tambahkan juga ke *Redirect URLs* — supaya link konfirmasi & reset kata sandi kembali ke game.

## Deploy ke Vercel lewat GitHub

1. Buat repo baru di GitHub, unggah seluruh folder ini (termasuk `config.js` yang sudah diisi).
2. Di Vercel: **Add New → Project → Import** repo tersebut.
3. Framework Preset: **Other**. Build command & output dibiarkan kosong. **Deploy**.
4. Salin domain Vercel ke langkah 5 di atas.

## Cara main PvP

1. Kedua pemain daftar akun dengan email masing-masing.
2. Pemain A buka **Tantang Teman**, masukkan email pemain B, pilih tim & durasi → **Kirim Undangan**. A otomatis masuk ruang tunggu (bisa juga **Salin link undangan** dan kirim lewat WhatsApp).
3. Pemain B melihat undangan (badge kuning di menu) → **Terima** → pilih tim.
4. Begitu keduanya di ruang, pertandingan langsung dimulai. Skor & statistik menang/seri/kalah tersimpan di akun.

**Arsitektur jaringan:** host menjalankan simulasi (otoritatif) 60×/detik dan mengirim snapshot ±15×/detik; tamu mengirim input saja. Tamu melihat posisi dengan interpolasi ±110 ms. Skor akhir hanya bisa ditulis host lewat fungsi `finish_match` di database.

**Batas paket gratis Supabase Realtime:** sekitar 35 pesan/detik per pertandingan; paket gratis cukup untuk beberapa pertandingan bersamaan. Untuk banyak pemain sekaligus, naikkan paket atau pindahkan ke server WebSocket khusus.

## Kamera & lanskap

- Default **3D Siaran TV**: pemain 3D dengan animasi lari, sprint, dribel, ancang-ancang tembakan, tendangan, tekel, sliding, kiper siaga/melompat/menangkap/melempar, selebrasi gol, pemain cadangan duduk di bangku, 2 wasit, replay gol dengan kamera sinematik.
- Pilihan lain: **Samping 2D** (ringan untuk HP lama) dan **Atas** (taktis). Ganti di menu *Lawan CPU* atau tombol jeda ❚❚.
- Kualitas grafis otomatis turun (resolusi lalu bayangan) jika HP tidak kuat menjaga ±30 fps.
- Saat kick-off, game meminta layar penuh dan mengunci posisi lanskap (Android Chrome). Di iPhone, putar HP manual dan matikan kunci rotasi.
- Di HP, buka situsnya lalu pilih **Tambahkan ke Layar Utama** agar terbuka seperti aplikasi, layar penuh dan lanskap.

## Kontrol

| Aksi (menyerang / bertahan) | Keyboard | Gamepad | Layar |
|---|---|---|---|
| Gerak | WASD / panah | Stik kiri | Joystick |
| Umpan / ganti pemain | J | A | Umpan / Ganti |
| Tembak (tahan) / tekel | K / Spasi | X | Tembak / Tekel |
| Lambung & chip / panggil rekan menekan | L | B | Lambung / Tekan |
| Terobosan / jaga jarak | U | Y | Terobos / Jaga |
| Gerak tipu / sliding | I | RB | ✦ |
| Sprint | Shift | RT | » |
| Ganti pemain | Q / E | LB | — |
| Jeda | Esc / P | Start | ❚❚ |

## Aturan yang diterapkan

5v5, lapangan 40×20 m, gawang 3×2 m · 2 babak dengan jam berhenti saat bola mati · kick-in, sudut, lemparan kiper (tidak bisa langsung gol dari kick-in/lemparan kiper/tendangan bebas tak langsung) · aturan 4 detik untuk bola mati & kiper · larangan back-pass ke kiper · akumulasi pelanggaran → tendangan 10 m tanpa pagar mulai pelanggaran ke-6 · penalti 6 m · kartu kuning/merah (main kurang 2 menit atau sampai kebobolan) · jarak 5 m (3 m saat sepak mula) · pergantian bebas.

Penyederhanaan: tidak ada time-out, sundulan, kiper terbang (power play), dan adu penalti.

## Catatan

- Semua nama pemain **fiksi**; kemiripan dengan orang nyata tidak disengaja. Jersey hanya memakai warna nasional, tanpa logo federasi.
- Debug: buka konsol browser, `FG._state` berisi status game.
