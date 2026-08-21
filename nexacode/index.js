#!/usr/bin/env node
'use strict';

if (typeof fetch !== 'function') {
  console.error('Node.js versi kamu belum ada fetch bawaan. Upgrade ke Node 18+ ya (cek dengan: node -v).');
  process.exit(1);
}

require('./src/agent').start();
