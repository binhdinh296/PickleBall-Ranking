function getAthletesList() {
  const errors = [];
  try {
    const list = require('./pickna-athletes.json');
    if (Array.isArray(list) && list.length > 0) return { list };
  } catch (err) {
    errors.push('require ./pickna-athletes.json: ' + err.message);
  }

  try {
    const list = require('../data/pickna-athletes.json');
    if (Array.isArray(list) && list.length > 0) return { list };
  } catch (err) {
    errors.push('require ../data/pickna-athletes.json: ' + err.message);
  }

  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(__dirname, 'pickna-athletes.json'),
    path.join(__dirname, '../data/pickna-athletes.json'),
    path.join(process.cwd(), 'src/lib/pickna-athletes.json'),
    path.join(process.cwd(), 'src/data/pickna-athletes.json'),
    path.resolve('src/data/pickna-athletes.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const list = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(list) && list.length > 0) return { list };
      } else {
        errors.push('not found: ' + p);
      }
    } catch (err) {
      errors.push('read ' + p + ': ' + err.message);
    }
  }

  let cwdFiles = [];
  try { cwdFiles = fs.readdirSync(process.cwd()); } catch (e) { cwdFiles = [e.message]; }
  let dirFiles = [];
  try { dirFiles = fs.readdirSync(__dirname); } catch (e) { dirFiles = [e.message]; }

  return { list: [], debug: { errors, cwd: process.cwd(), __dirname, cwdFiles, dirFiles } };
}

module.exports = { getAthletesList };
