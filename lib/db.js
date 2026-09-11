const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

// Very small write queue so concurrent requests don't corrupt the JSON file.
let writeChain = Promise.resolve();

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(data) {
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

// Read-modify-write helper to reduce race conditions between read and write.
async function update(mutatorFn) {
  const data = readDB();
  const result = mutatorFn(data);
  await writeDB(data);
  return result;
}

module.exports = { readDB, writeDB, update, DB_PATH };
