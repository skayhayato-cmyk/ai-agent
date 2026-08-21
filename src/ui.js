'use strict';

const codes = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function paint(color, text) {
  const code = codes[color] || '';
  return `${code}${text}${codes.reset}`;
}

// Warna per kategori tool: biru/cyan = baca (aman), kuning = ubah file, magenta = shell.
const TOOL_COLOR = {
  read_file: 'cyan',
  list_dir: 'cyan',
  write_file: 'yellow',
  edit_file: 'yellow',
  run_command: 'magenta',
};

function toolLine(name, args) {
  const color = TOOL_COLOR[name] || 'cyan';
  let detail = '';
  if (args) {
    if (name === 'run_command') detail = args.command || '';
    else if (args.path) detail = args.path;
  }
  const head = paint(color, `\u25cf ${name}`);
  return detail ? `${head}${paint('dim', `  ${detail}`)}` : head;
}

// Tampilan before/after ala diff buat edit_file. Ini bukan diff generik (gak nyari
// baris yang sama), cuma nampilin old_str (merah) lalu new_str (hijau) apa adanya --
// cukup buat snippet kecil yang ditarget edit_file.
function printDiff(oldStr, newStr) {
  for (const line of String(oldStr ?? '').split('\n')) {
    console.log(paint('red', `  - ${line}`));
  }
  for (const line of String(newStr ?? '').split('\n')) {
    console.log(paint('green', `  + ${line}`));
  }
}

function printWritePreview(content) {
  const text = content || '';
  const lines = text.split('\n');
  const shown = lines.slice(0, 8);
  console.log(paint('dim', `  ${text.length} karakter, ${lines.length} baris`));
  for (const line of shown) console.log(paint('green', `  + ${line}`));
  if (lines.length > shown.length) {
    console.log(paint('dim', `  ... (${lines.length - shown.length} baris lagi, dipotong)`));
  }
}

// Kotak ASCII yang lebar-nya nyesuaiin panjang teks otomatis, biar gak perlu
// itung manual jumlah spasi/dash (gampang salah kalau di-hardcode).
function box(text) {
  const pad = 2;
  const width = text.length + pad * 2;
  const top = `\u256d${'\u2500'.repeat(width)}\u256e`;
  const mid = `\u2502${' '.repeat(pad)}${text}${' '.repeat(pad)}\u2502`;
  const bot = `\u2570${'\u2500'.repeat(width)}\u256f`;
  return `${top}\n${mid}\n${bot}`;
}

class Spinner {
  constructor(label) {
    // braille dots ala ora/cli-spinners "dots"
    this.frames = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
    this.label = label;
    this.i = 0;
    this.timer = null;
    this.startedAt = 0;
  }
  start() {
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
      const frame = this.frames[this.i];
      this.i = (this.i + 1) % this.frames.length;
      process.stdout.write(`\r${paint('magenta', frame)} ${paint('dim', `${this.label} (${elapsed}s)`)}   `);
    }, 80);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const width = Math.min(process.stdout.columns || 40, 60);
    process.stdout.write(`\r${' '.repeat(width)}\r`);
  }
}

module.exports = {
  paint,
  info: (msg) => console.log(paint('cyan', msg)),
  success: (msg) => console.log(paint('green', msg)),
  warn: (msg) => console.log(paint('yellow', msg)),
  error: (msg) => console.log(paint('red', msg)),
  dim: (msg) => console.log(paint('dim', msg)),
  toolLine,
  printDiff,
  printWritePreview,
  box,
  Spinner,
};
