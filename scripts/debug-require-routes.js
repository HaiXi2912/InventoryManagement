try {
  const r = require('../routes');
  console.log('[OK] routes loaded. keys=', Object.keys(r || {}));
} catch (e) {
  console.error('[ERR] load routes failed:', e && (e.stack || e.message || e));
  process.exit(2);
}
