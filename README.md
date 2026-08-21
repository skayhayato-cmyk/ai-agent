# nexacode -- CLI coding agent (Node.js + MAIA Router)

CLI agent ala Claude Code, tapi lewat MAIA Router (`api.maiarouter.ai`) -- bisa pilih model apa
aja yang di-support router-nya (deepseek, openai, dll, tinggal ganti nama model). Zero dependency,
cuma pakai built-in Node.js (`fetch`, `fs`, `readline`, `child_process`), jadi aman dipasang di
Termux tanpa drama native module / ESM.

## Setup

1. Butuh Node.js 18+ (`node -v` buat cek). Di Termux: `pkg install nodejs`
2. Copy `.env.example` jadi `.env` -- **`.env`**, bukan `.env.example`, itu cuma template:
   ```
   cp .env.example .env
   ```
   lalu isi:
   ```
   MAIAROUTER_API_KEY=isi_api_key_kamu
   MAIAROUTER_MODEL=deepseek/deepseek-v3.2
   ```
3. Jalanin:
   ```
   node index.js
   ```

## Fitur CLI

- **Jawaban ngetik live (streaming)** -- teks muncul token-per-token kayak Claude Code, bukan
  nunggu model selesai baru muncul semua.
- **Spinner + elapsed time** pas agent lagi mikir/manggil API.
- **Diff view** buat `edit_file` -- baris lama (merah) & baris baru (hijau) ditampilin pas minta
  konfirmasi, jadi kamu tau persis apa yang bakal diubah sebelum approve.
- **Output live** buat `run_command` -- output command ngalir pas dijalanin, gak nunggu sampe
  command selesai baru muncul.
- **Slash command**: `/help`, `/clear` (reset riwayat chat), `/model [nama]` (ganti model on the
  fly), `/exit`.

## Tool yang dipunya agent

- `read_file` -- baca isi file
- `write_file` -- bikin file baru / timpa file
- `edit_file` -- cari & ganti string persis di dalam file (bukan timpa semua isi)
- `list_dir` -- lihat isi folder
- `run_command` -- jalanin perintah shell di folder kerja saat ini

`write_file`, `edit_file`, dan `run_command` bakal nampilin dulu apa yang mau dilakuin (diff /
command / preview isi file) terus minta konfirmasi sebelum jalan. Pas ditanya, jawab:
- `y` -- izinin sekali ini aja
- `n` -- tolak
- `a` -- izinin semua sisa tool call di sesi ini (gak ditanya lagi)

Mau skip konfirmasi dari awal? `node index.js -y`, atau set `AGENT_AUTO_APPROVE=true` di `.env`.
Hati-hati pakai mode ini -- agent bisa langsung eksekusi command tanpa nanya dulu (tetep kelihatan
apa yang dijalanin, cuma gak nunggu approve).

## Opsi lain

```
node index.js --model=openai/gpt-3.5-turbo-0125   # ganti model tanpa edit .env
node index.js --no-stream                          # matiin streaming, balik ke mode jawaban sekaligus
node index.js -y                                    # auto-approve dari awal
```

Atau lewat `.env`:
```
AGENT_STREAM=false
AGENT_AUTO_APPROVE=true
```

## Struktur

```
nexacode/
|- index.js         entry point
|- src/
|  |- config.js      load .env + argv
|  |- ui.js           warna terminal, spinner, diff view, banner
|  |- tools.js         definisi & implementasi tool (termasuk run_command live output)
|  |- client.js        pemanggil endpoint chat/completions (streaming + fallback non-stream)
|  |- agent.js          loop utama (REPL + tool-calling + slash command)
|- .env.example
`- package.json
```

## Catatan teknis

- Endpoint yang dipakai: `POST {MAIAROUTER_BASE_URL}/chat/completions`, format standar
  OpenAI-compatible (`messages` + `tools` + `tool_calls`, plus `stream: true` buat streaming),
  sesuai klaim MAIA Router di web mereka ("Use OpenAI compatible API standard") dan contoh curl
  yang kamu kasih. Base URL bisa diganti lewat `MAIAROUTER_BASE_URL` di `.env`.
- Kalau server ternyata balikin JSON biasa walau diminta `stream: true` (gak semua backend model
  konsisten dukung streaming), client otomatis fallback ke mode non-stream tanpa error.
- `run_command` jalan pakai `spawn` (bukan `execSync`) supaya output bisa ngalir live, timeout 60
  detik (proses di-kill paksa kalau kelewatan).
- Semua tool dibatasi ke direktori kerja tempat kamu jalanin `node index.js` (pakai path relatif).

**Soal testing:** gak bisa dites langsung ke API MAIA Router beneran (sandbox tempat aku kerja gak
ada akses network ke domain itu + gak ada API key), jadi request/response ngikutin standar
OpenAI-compatible yang mereka klaim + contoh curl kamu. Logic streaming (termasuk parsing SSE &
akumulasi `tool_calls` per-chunk) udah dites pakai `ReadableStream` beneran + response event palsu
(mock), semua skenario pass: streaming teks, streaming tool_calls yang argumennya kepotong per-chunk,
fallback ke non-SSE, mode non-streaming, `run_command` sukses/gagal, dan full loop
`edit_file`/`run_command` dengan konfirmasi. Yang belum tervalidasi cuma bentuk respons ASLI dari
server MAIA Router. Kalau pas dipakai beneran ada mismatch (field beda nama, dll), paling gampang
di-adjust di `src/client.js`.
