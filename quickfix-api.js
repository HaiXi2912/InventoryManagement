const express = require('express');
const app = express();
const PORT = Number(process.env.PORT || 3004) || 3004;
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/statistics/overview', (req, res) => {
  const { start_date, end_date, sale_type } = req.query || {};
  res.json({
    success: true,
    data: {
      period: { start_date: start_date || null, end_date: end_date || null, sale_type: sale_type || null },
      basic_info: { total_products: 0, total_inventory_value: 0, low_stock_count: 0 },
      purchase_stats: [],
      sale_stats: [],
      sale_stats_by_type: [],
      today_summary: { purchase: { count: 0, amount: 0 }, sale: { count: 0, amount: 0 } }
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Quickfix API on http://localhost:${PORT}`);
});
