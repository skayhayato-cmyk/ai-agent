'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Schema function-calling format OpenAI-compatible (dipakai MAIA Router).
const schemas = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Baca isi sebuah file teks dari disk. Pakai ini sebelum edit_file supaya tahu isi file saat ini.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file, relatif terhadap direktori kerja saat ini.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Buat file baru atau timpa (overwrite) file yang sudah ada dengan konten baru. Folder induk dibuat otomatis kalau belum ada.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file tujuan.' },
          content: { type: 'string', description: 'Isi lengkap file.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Cari string persis (old_str) di dalam file lalu ganti dengan new_str. old_str harus unik (cuma muncul sekali) di file itu.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file yang mau diedit.' },
          old_str: { type: 'string', description: 'Teks persis yang mau diganti, harus unik dalam file.' },
          new_str: { type: 'string', description: 'Teks pengganti.' },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'Lihat isi sebuah folder (nama file & subfolder).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path folder, default "." untuk direktori kerja saat ini.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Jalankan perintah shell di direktori kerja saat ini. Dipakai untuk hal di luar baca/tulis file: install dependency, jalanin script, git, dll. User akan diminta konfirmasi dulu sebelum perintah dieksekusi.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah shell yang mau dijalankan.' },
        },
        required: ['command'],
      },
    },
  },
];

function safeResolve(p) {
  return path.resolve(process.cwd(), p || '.');
}

function readFile({ path: p }) {
  const content = fs.readFileSync(safeResolve(p), 'utf8');
  return { path: p, content };
}

function writeFile({ path: p, content }) {
  const target = safeResolve(p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return { path: p, bytes: Buffer.byteLength(content, 'utf8') };
}

function editFile({ path: p, old_str, new_str }) {
  const target = safeResolve(p);
  const content = fs.readFileSync(target, 'utf8');
  const occurrences = content.split(old_str).length - 1;
  if (occurrences === 0) {
    throw new Error(`old_str tidak ditemukan di ${p}`);
  }
  if (occurrences > 1) {
    throw new Error(`old_str muncul ${occurrences}x di ${p}, harus unik. Perjelas konteksnya lalu coba lagi.`);
  }
  fs.writeFileSync(target, content.replace(old_str, new_str), 'utf8');
  return { path: p, status: 'edited' };
}

function listDir({ path: p }) {
  const entries = fs.readdirSync(safeResolve(p || '.'), { withFileTypes: true });
  return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
}

// ctx.onOutput (opsional) dipanggil tiap ada chunk stdout/stderr baru -> dipakai
// agent.js buat nampilin output live di terminal, bukan nunggu command selesai dulu.
function runCommand({ command }, ctx = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';

    let child;
    try {
      child = spawn(command, { cwd: process.cwd(), shell: true });
    } catch (err) {
      resolve({ command, exitCode: 1, output: err.message });
      return;
    }

    const onChunk = (chunk) => {
      const text = chunk.toString('utf8');
      output += text;
      if (ctx.onOutput) ctx.onOutput(text);
    };
    child.stdout && child.stdout.on('data', onChunk);
    child.stderr && child.stderr.on('data', onChunk);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ command, exitCode: 124, output: (output + '\n[timeout 60 detik, proses dihentikan paksa]').trim() });
    }, 60_000);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ command, exitCode: 1, output: output || err.message });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ command, exitCode: code === null ? 1 : code, output: output.trim() || '(tidak ada output)' });
    });
  });
}

const implementations = {
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  list_dir: listDir,
  run_command: runCommand,
};

// Tool yang bisa mengubah sistem / jalanin sesuatu -> wajib konfirmasi user.
const dangerousTools = new Set(['write_file', 'edit_file', 'run_command']);

module.exports = { schemas, implementations, dangerousTools };
