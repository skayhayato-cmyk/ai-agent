'use strict';
const readline = require('readline');
const config = require('./config');
const ui = require('./ui');
const { schemas, implementations, dangerousTools } = require('./tools');
const { chatCompletion } = require('./client');

const MAX_STEPS = 25;

const SYSTEM_PROMPT = `Kamu adalah asisten coding yang jalan lewat CLI/terminal (termasuk di Termux) milik user.
Kamu punya tool buat baca file, tulis file, edit file (cari & ganti string persis), lihat isi folder,
dan jalanin perintah shell di direktori kerja saat ini.

Panduan:
- Sebelum ubah/asumsikan isi file, cek dulu pakai read_file atau list_dir kalau belum yakin isinya.
- Buat ubah file yang sudah ada, utamakan edit_file (cari-ganti presisi) daripada write_file (timpa semua file),
  kecuali memang lagi bikin file baru dari nol.
- run_command dipakai untuk hal di luar baca/tulis file: install dependency, jalanin script, git, dll.
- Jelasin singkat apa yang kamu lakuin & kenapa. Kalau instruksi user ambigu, ambil asumsi paling masuk akal,
  sebutkan asumsinya, terus lanjut kerja -- jangan banyak nanya balik.
- Gaya jawaban: singkat, padat, to the point, gaya developer ke developer. Boleh campur Bahasa Indonesia
  dan istilah teknis Inggris.`;

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printBanner() {
  console.log(ui.paint('magenta', ui.box('nexacode')));
  console.log(ui.paint('dim', `  model  : ${config.model}`));
  console.log(ui.paint('dim', `  dir    : ${process.cwd()}`));
  console.log(ui.paint('dim', `  stream : ${config.stream ? 'on' : 'off'}`));
  console.log(ui.paint('dim', '  ketik /help buat liat command, "exit" buat keluar.'));
  console.log();
}

function printHelp() {
  console.log(`
${ui.paint('bold', 'Command:')}
  /help          tampilin ini
  /clear         reset riwayat percakapan (system prompt tetep)
  /model [nama]  ganti model, atau liat model sekarang kalau kosong
  /exit          keluar (sama kayak ketik "exit")

${ui.paint('bold', 'Tool yang dipunya agent:')}
  read_file, write_file, edit_file, list_dir, run_command
  (write_file / edit_file / run_command minta konfirmasi dulu sebelum jalan)
`);
}

async function confirmAction(rl, toolName, args) {
  if (toolName === 'run_command') {
    console.log(ui.paint('yellow', `  $ ${args.command}`));
  } else if (toolName === 'write_file') {
    ui.printWritePreview(args.content);
  } else if (toolName === 'edit_file') {
    ui.printDiff(args.old_str, args.new_str);
  }

  if (config.autoApprove) return true;

  const answer = (await ask(rl, ui.paint('yellow', '  lanjut? (y/n/a=izinkan semua sesi ini) > ')))
    .trim()
    .toLowerCase();
  if (answer === 'a' || answer === 'all') {
    config.autoApprove = true;
    ui.dim('  (auto-approve nyala buat sisa sesi ini)');
    return true;
  }
  return answer === 'y' || answer === 'yes';
}

async function executeTool(rl, name, argsJson) {
  let args;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (e) {
    const msg = `argumen tool bukan JSON valid: ${e.message}`;
    ui.error(`  ${msg}`);
    return { error: msg };
  }

  console.log();
  console.log(ui.toolLine(name, args));

  const fn = implementations[name];
  if (!fn) return { error: `tool tidak dikenal: ${name}` };

  if (dangerousTools.has(name)) {
    const ok = await confirmAction(rl, name, args);
    if (!ok) {
      ui.warn('  dibatalkan.');
      return { error: 'user menolak menjalankan tool ini.' };
    }
  }

  const ctx = {};
  if (name === 'run_command') {
    ctx.onOutput = (text) => process.stdout.write(ui.paint('dim', text));
    console.log(ui.paint('dim', '  menjalankan...'));
  }

  try {
    const result = await fn(args, ctx);
    if (name === 'run_command') {
      console.log();
      console.log(
        result.exitCode === 0
          ? ui.paint('green', `  selesai (exit ${result.exitCode})`)
          : ui.paint('red', `  gagal (exit ${result.exitCode})`)
      );
    } else {
      ui.success('  selesai');
    }
    return result;
  } catch (e) {
    ui.error(`  error: ${e.message}`);
    return { error: e.message };
  }
}

async function runTurn(rl, messages) {
  for (let step = 0; step < MAX_STEPS; step++) {
    const spinner = new ui.Spinner('mikir');
    spinner.start();

    let labelPrinted = false;
    const onDelta = (text) => {
      spinner.stop();
      if (!labelPrinted) {
        process.stdout.write(`\n${ui.paint('magenta', 'agent')} `);
        labelPrinted = true;
      }
      process.stdout.write(text);
    };

    let assistantMessage;
    try {
      assistantMessage = await chatCompletion({ model: config.model, messages, tools: schemas, onDelta });
    } catch (e) {
      ui.error(`\nerror: ${e.message}`);
      return;
    } finally {
      spinner.stop();
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      if (labelPrinted) {
        console.log('\n');
      } else if (assistantMessage.content) {
        console.log(`\n${ui.paint('magenta', 'agent')} ${assistantMessage.content}\n`);
      } else {
        ui.warn('(model gak ngasih jawaban teks maupun tool call)');
      }
      return;
    }

    if (labelPrinted) console.log('\n');

    for (const call of toolCalls) {
      const fname = call.function.name;
      const result = await executeTool(rl, fname, call.function.arguments);
      messages.push({ role: 'tool', tool_call_id: call.id, name: fname, content: JSON.stringify(result) });
    }
  }
  ui.warn(`Berhenti: udah ${MAX_STEPS} langkah tool berturut-turut. Coba pecah instruksi jadi lebih kecil.`);
}

async function start() {
  if (!config.apiKey) {
    ui.error('MAIAROUTER_API_KEY belum di-set. Isi dulu di file .env (lihat .env.example).');
    process.exit(1);
  }

  printBanner();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  const loop = () => {
    rl.question(ui.paint('cyan', 'you > '), async (input) => {
      const text = input.trim();
      if (!text) return loop();

      const lower = text.toLowerCase();
      if (['exit', 'quit', ':q'].includes(lower)) {
        rl.close();
        return;
      }

      if (text.startsWith('/')) {
        const [cmd, ...rest] = text.slice(1).split(' ');
        if (cmd === 'help') {
          printHelp();
        } else if (cmd === 'clear') {
          messages.length = 1;
          ui.success('riwayat percakapan direset.');
        } else if (cmd === 'model') {
          const newModel = rest.join(' ').trim();
          if (newModel) {
            config.model = newModel;
            ui.success(`model diganti ke: ${newModel}`);
          } else {
            ui.info(`model sekarang: ${config.model}`);
          }
        } else if (cmd === 'exit' || cmd === 'quit') {
          rl.close();
          return;
        } else {
          ui.warn(`command gak dikenal: /${cmd}. Ketik /help buat liat daftar command.`);
        }
        return loop();
      }

      messages.push({ role: 'user', content: text });
      try {
        await runTurn(rl, messages);
      } catch (e) {
        ui.error(`error: ${e.message}`);
      }
      loop();
    });
  };

  loop();
}

module.exports = { start, runTurn, executeTool, confirmAction };
