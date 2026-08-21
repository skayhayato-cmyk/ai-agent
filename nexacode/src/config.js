'use strict';
const fs = require('fs');
const path = require('path');

// Parser .env minimal, biar gak perlu install package dotenv (aman dari
// masalah native module / ESM di Termux).
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));

const config = {
  apiKey: process.env.MAIAROUTER_API_KEY || '',
  model: process.env.MAIAROUTER_MODEL || 'deepseek/deepseek-v3.2',
  baseUrl: (process.env.MAIAROUTER_BASE_URL || 'https://api.maiarouter.ai/v1').replace(/\/+$/, ''),
  autoApprove: process.env.AGENT_AUTO_APPROVE === 'true',
  stream: process.env.AGENT_STREAM !== 'false',
};

// Flag CLI ringan: -y/--yes buat auto-approve, --model=... buat ganti model
// tanpa edit .env, --no-stream buat matiin streaming.
for (const arg of process.argv.slice(2)) {
  if (arg === '-y' || arg === '--yes') {
    config.autoApprove = true;
  } else if (arg === '--no-stream') {
    config.stream = false;
  } else if (arg.startsWith('--model=')) {
    config.model = arg.slice('--model='.length);
  }
}

module.exports = config;
