const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  const cfgFile = path.join(__dirname, '..', 'data', 'pg-dev.json');
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
  }
}

const db = require('../src/db');

db.migrate()
  .then(() => { console.log('Migration xong.'); return db.close(); })
  .catch((err) => { console.error(err); process.exit(1); });

