#!/usr/bin/env node
/**
 * Run before you go live with real customers:  node clear-demo-data.js
 * Removes the seeded demo products, reviews, orders and coupons.
 * Keeps your admin login and settings intact.
 */
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

db.products = [];
db.reviews = [];
db.orders = [];
db.customCakeRequests = [];
db.coupons = [];
db.meta.demoData = false;

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('✔ Demo products, reviews, orders, coupons and requests cleared.');
console.log('Add your real products from the admin dashboard: /admin/products');
