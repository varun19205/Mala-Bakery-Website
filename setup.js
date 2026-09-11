#!/usr/bin/env node
/**
 * Run this once before launching:  node setup.js "YourStrongPassword123"
 *
 * It will:
 *  1. Hash the admin password and store it in data/db.json (never stores plain text)
 *  2. Generate a random SESSION_SECRET and write/update .env
 *
 * Re-run any time to change the admin password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./lib/auth');

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: node setup.js "YourStrongPassword123" (min 8 characters)');
  process.exit(1);
}

const dbPath = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
const { hash, salt } = hashPassword(password);
db.admins[0].passwordHash = hash;
db.admins[0].salt = salt;
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('✔ Admin password set for username:', db.admins[0].username);

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

console.log('\nDone! Start the server with: npm start');
console.log('Then log in at /admin/login with username "admin" and the password you just set.');
