#!/usr/bin/env node
/**
 * Run this once before launching:  node setup.js "YourStrongPassword123"
 *
 * It will:
 *  1. Hash the admin password and store it (in Supabase if DATABASE_URL is
 *     set, otherwise in the local data/db.json file) — never plain text.
 *  2. Generate a random SESSION_SECRET and write/update .env
 *     (only useful for local runs — on Render, set SESSION_SECRET as an
 *     Environment Variable instead, see README).
 *
 * Re-run any time to change the admin password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env manually here too, so this script also sees DATABASE_URL when
// run locally (server.js does the same thing).
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const db = require('./lib/db');
const { hashPassword } = require('./lib/auth');

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 8) {
    console.error('Usage: node setup.js "YourStrongPassword123" (min 8 characters)');
    process.exit(1);
  }

  console.log(db.usingPostgres ? 'Using Postgres (DATABASE_URL detected)…' : 'Using local file data/db.json…');

  const { hash, salt } = hashPassword(password);
  const admin = await db.update((data) => {
    data.admins[0].passwordHash = hash;
    data.admins[0].salt = salt;
    return data.admins[0];
  });
  console.log('✔ Admin password set for username:', admin.username);

  if (!db.usingPostgres) {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    if (!/SESSION_SECRET=.+/.test(envContent)) {
      const secret = crypto.randomBytes(32).toString('hex');
      envContent += (envContent.endsWith('\n') || !envContent ? '' : '\n') + `SESSION_SECRET=${secret}\n`;
      fs.writeFileSync(envPath, envContent);
      console.log('✔ Generated SESSION_SECRET in .env');
    } else {
      console.log('ℹ SESSION_SECRET already set in .env — left unchanged');
    }
  } else {
    console.log('ℹ Remember: SESSION_SECRET should be set as an Environment Variable on your host (not in this database).');
  }

  console.log('\nDone! Start the server with: npm start');
  console.log('Then log in at /admin/login with username "admin" and the password you just set.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
