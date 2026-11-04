const db = require('../src/db');

db.migrate()
  .then(() => { console.log('Migration xong.'); return db.close(); })
  .catch((err) => { console.error(err); process.exit(1); });
