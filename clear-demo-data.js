#!/usr/bin/env node
/**
 * Run before you go live with real customers:  node clear-demo-data.js
 * Removes the seeded demo products, reviews, orders and coupons.
 * Keeps your admin login and settings intact.
 */
const fs = require('fs');
const path = require('path');

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

async function main() {
  console.log(db.usingPostgres ? 'Using Postgres (DATABASE_URL detected)…' : 'Using local file data/db.json…');
  await db.update((data) => {
    data.products = [];
    data.reviews = [];
    data.orders = [];
    data.customCakeRequests = [];
    data.coupons = [];
    data.meta.demoData = false;
  });
  console.log('✔ Demo products, reviews, orders, coupons and requests cleared.');
  console.log('Add your real products from the admin dashboard: /admin/products');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
