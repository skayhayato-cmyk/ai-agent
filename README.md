# 🚀 NexaCode

**NexaCode** adalah CLI *coding agent* interaktif yang ditenagai oleh **MAIA Router** (`api.maiarouter.ai`). Kamu bisa bebas memilih model AI apa saja yang didukung oleh router (seperti DeepSeek, OpenAI, dll) hanya dengan mengganti nama modelnya.

Dirancang dengan prinsip **Zero Dependency**—hanya mengandalkan modul bawaan Node.js (`fetch`, `fs`, `readline`, `child_process`). Sangat ringan, cepat, dan **aman dipasang di Termux** tanpa perlu khawatir berurusan dengan *native module* atau drama konfigurasi ESM.

---

## ✨ Fitur Utama

- ⚡ **Live Streaming Response:** Teks dicetak *token-per-token* secara *real-time*. Tidak perlu menunggu AI selesai berpikir untuk mulai membaca.
- ⏳ **Interactive UI:** Dilengkapi *spinner* dan indikator waktu (*elapsed time*) saat agent sedang memproses atau memanggil API.
- 🔍 **Diff View (Smart Edit):** Khusus untuk `edit_file`, perubahan akan ditampilkan dalam format *diff*—baris lama (merah) dan baris baru (hijau). Kamu tahu persis apa yang akan diubah sebelum menyetujuinya.
- 🖥️ **Live Command Output:** Saat menjalankan perintah terminal (`run_command`), output akan mengalir langsung tanpa menahan *stdout*.
- ⌨️ **Slash Commands:** Kelola sesi dengan cepat menggunakan:
  - `/help` — Menampilkan menu bantuan.
  - `/clear` — Mereset riwayat obrolan (*context*).
  - `/model [nama]` — Mengganti model secara *on-the-fly*.
  - `/exit` — Mengakhiri sesi.

---

## ⚙️ Instalasi & Setup

1. **Pastikan Node.js terinstal (Versi 18+)**
   Untuk mengecek versi, jalankan `node -v`. Jika menggunakan Termux, instal dengan perintah:
   ```bash
   pkg install nodejs
   ```

2. **Konfigurasi Environment**
   Salin *template* konfigurasi menjadi file `.env` yang valid:
   ```bash
   cp .env.example .env
   ```
   Buka file `.env` dan isi dengan kredensial kamu:
   ```env
   MAIAROUTER_API_KEY=isi_api_key_kamu_di_sini
   MAIAROUTER_MODEL=deepseek/deepseek-v3.2
   ```

3. **Jalankan NexaCode**
   ```bash
   node index.js
   ```

---

## 🧰 Kemampuan Agent (Tools)

NexaCode dibekali beberapa *tools* bawaan untuk membaca, mengedit, dan mengeksekusi sistem di dalam direktori kerja tempat script dijalankan:

*   `read_file` — Membaca seluruh isi file.
*   `write_file` — Membuat file baru atau menimpa file lama secara keseluruhan.
*   `edit_file` — Mencari dan mengganti string spesifik di dalam file tanpa menimpa seluruh konten.
*   `list_dir` — Melihat daftar file dan folder dalam sebuah direktori.
*   `run_command` — Menjalankan perintah shell/terminal.

**🛡️ Sistem Konfirmasi (Keamanan)**
Untuk mencegah eksekusi yang tidak diinginkan, `write_file`, `edit_file`, dan `run_command` akan menampilkan *preview* (seperti *diff* atau teks perintah) dan meminta konfirmasi. Silakan jawab dengan:
*   `y` — Izinkan eksekusi untuk aksi ini saja.
*   `n` — Tolak eksekusi.
*   `a` — Izinkan semua *tools* di sesi obrolan ini tanpa bertanya lagi (*auto-approve*).

---

## 🔧 Opsi Lanjutan

Kamu bisa memodifikasi perilaku NexaCode melalui argumen CLI atau file `.env`.

**Melalui CLI:**
```bash
node index.js --model=openai/gpt-3.5-turbo-0125   # Ganti model AI
node index.js --no-stream                          # Matikan fitur streaming teks
node index.js -y                                   # Mode bahaya: Auto-approve semua aksi!
```

**Melalui `.env`:**
```env
AGENT_STREAM=false
AGENT_AUTO_APPROVE=true
```
> ⚠️ **Peringatan:** Mengaktifkan *auto-approve* (`-y` atau `AGENT_AUTO_APPROVE=true`) membuat agent bisa langsung mengeksekusi perintah shell dan memodifikasi file tanpa bertanya. Output tetap akan ditampilkan, namun gunakan dengan sangat hati-hati!

---

## 📂 Struktur Proyek

```text
nexacode/
├── index.js          # Entry point aplikasi
├── src/
│   ├── config.js     # Menangani load .env dan argumen CLI
│   ├── ui.js         # Formatting warna, spinner, diff view, dan banner
│   ├── tools.js      # Definisi tools dan eksekutor sistem (termasuk live spawn)
│   ├── client.js     # Logic fetch ke API MAIA Router (Streaming SSE & Fallback)
│   └── agent.js      # Loop obrolan utama (REPL), eksekusi tool, & slash command
├── .env.example      # Template konfigurasi
└── package.json
```

---

## 📝 Catatan Teknis (Untuk Developer)

*   **Standarisasi API:** NexaCode berkomunikasi menggunakan standar *OpenAI-compatible* via endpoint `POST {MAIAROUTER_BASE_URL}/chat/completions`. Format pengiriman menggunakan `messages`, `tools`, `tool_calls`, dan `stream: true`. Base URL dapat disesuaikan pada file `.env`.
*   **Status Pengujian (Testing):** Logic *streaming* (termasuk *parsing* SSE dan akumulasi `tool_calls` per-chunk) telah diuji coba dan divalidasi menggunakan *mocking* `ReadableStream`. Semua skenario berhasil *pass*: streaming teks, *tool_calls* yang terpotong per-chunk, *fallback* ke non-SSE, mode non-streaming, `run_command` (sukses/gagal), hingga *full loop* `edit_file`/`run_command` dengan konfirmasi.
*   **Penyesuaian API MAIA Router Asli:** Mengingat pengujian berpatokan pada klaim standar *OpenAI-compatible*, bentuk respons ASLI dari server MAIA Router saat *production* belum sepenuhnya divalidasi. Jika terdapat *mismatch* saat dipraktikkan (seperti nama *field* yang berbeda), penyesuaian sangat mudah dilakukan cukup dengan mengedit logic di dalam file `src/client.js`.
*   **Fallback Cerdas:** Jika backend model tiba-tiba tidak merespons dengan format *Server-Sent Events* (SSE) meskipun `stream: true` aktif, `client.js` akan secara otomatis melakukan *fallback* ke mode JSON (non-stream) sehingga aplikasi tidak *crash*.
*   **Proses Eksekusi:** Fitur `run_command` memanfaatkan `child_process.spawn` (bukan `execSync`) agar aliran *stdout/stderr* dapat diteruskan langsung secara *live* ke terminal. Batas waktu eksekusi (*timeout*) ditetapkan pada **60 detik** sebelum proses dihentikan paksa.
*   **Keamanan Path:** Agent hanya diizinkan untuk beroperasi pada direktori relatif tempat `node index.js` dieksekusi.
