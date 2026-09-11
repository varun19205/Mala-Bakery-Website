const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DATABASE_URL = process.env.DATABASE_URL;

// =========================================================================
// MODE 1: Postgres (Supabase) — used in production so data survives
// restarts/redeploys/sleep-wake cycles on free hosting tiers that don't
// offer a persistent disk (e.g. Render's free plan).
//
// The whole app's data is stored as ONE JSON blob in a single database
// row. This keeps every route in server.js unchanged — they all just call
// db.readDB() / db.update() and get back the same shape of object they
// always did, whether it's backed by a file or a database.
// =========================================================================

let pgPool = null;
let pgReadyPromise = null;

function getPgPool() {
  if (!pgPool) {
    // Only require('pg') when it's actually needed, so local development
    // without DATABASE_URL never needs the package installed.
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required by Supabase
      max: 5,
    });
  }
  return pgPool;
}

async function ensurePgReady() {
  if (!pgReadyPromise) {
    pgReadyPromise = (async () => {
      const pool = getPgPool();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSONB NOT NULL)`
      );
      const { rows } = await pool.query('SELECT id FROM app_state WHERE id = 1');
      if (rows.length === 0) {
        // First-ever boot against this database: seed it with the demo
        // data shipped in the repo (data/db.json) so the site isn't empty.
        const seed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [
          JSON.stringify(seed),
        ]);
        console.log('[db] Postgres table created and seeded with demo data.');
      }
    })();
  }
  return pgReadyPromise;
}

async function readDBFromPg() {
  await ensurePgReady();
  const { rows } = await getPgPool().query('SELECT data FROM app_state WHERE id = 1');
  return rows[0].data;
}

async function writeDBToPg(data) {
  await ensurePgReady();
  await getPgPool().query('UPDATE app_state SET data = $1 WHERE id = 1', [
    JSON.stringify(data),
  ]);
}

// =========================================================================
// MODE 2: local JSON file — used automatically when DATABASE_URL isn't
// set (e.g. running on your own computer with `node server.js`).
// =========================================================================

let writeChain = Promise.resolve();

function readDBFromFile() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDBToFile(data) {
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        const tmpPath = DB_PATH + '.tmp';
        fs.writeFile(tmpPath, JSON.stringify(data, null, 2), (err) => {
          if (err) return reject(err);
          fs.rename(tmpPath, DB_PATH, (err2) => {
            if (err2) return reject(err2);
            resolve();
          });
        });
      })
  );
  return writeChain;
}

// =========================================================================
// Public API — identical regardless of which mode is active.
// =========================================================================

async function readDB() {
  return DATABASE_URL ? readDBFromPg() : readDBFromFile();
}

async function writeDB(data) {
  return DATABASE_URL ? writeDBToPg(data) : writeDBToFile(data);
}

// Read-modify-write helper to reduce race conditions between read and write.
async function update(mutatorFn) {
  const data = await readDB();
  const result = mutatorFn(data);
  await writeDB(data);
  return result;
}

module.exports = { readDB, writeDB, update, DB_PATH, usingPostgres: !!DATABASE_URL };
