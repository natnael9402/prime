// HubX API stub for local end-to-end testing (emulates the reseller API v1).
const http = require('http');

const products = [
  { id: 'hubx-uuid-gemini', slug: 'gemini-pro-1m', name: 'Gemini Pro · 1 month', price_usdt: 3.5, stock: 42, active: true },
  { id: 'hubx-uuid-canva', slug: 'canva-pro-1y', name: 'Canva Pro · 1 year', price_usdt: 1.0, stock: 150, active: true },
  { id: 'sandbox-test', slug: 'sandbox-test', name: 'Sandbox Test Product', price_usdt: 0.5, stock: 999999, active: true },
];
const orders = new Map();
let orderSeq = 0;

const server = http.createServer((req, res) => {
  const auth = req.headers['authorization'] || '';
  res.setHeader('Content-Type', 'application/json');

  if (!auth.startsWith('Bearer rsk_')) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: 'Invalid or revoked API key' }));
  }

  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/balance') {
    return res.end(JSON.stringify({ balance_usdt: '125.5000', currency: 'USDT' }));
  }
  if (req.method === 'GET' && path === '/products') {
    return res.end(JSON.stringify({ products }));
  }
  const prodMatch = path.match(/^\/products\/(.+)$/);
  if (req.method === 'GET' && prodMatch) {
    const p = products.find((x) => x.id === prodMatch[1] || x.slug === prodMatch[1]);
    if (!p) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Not found' })); }
    return res.end(JSON.stringify({ product: p }));
  }
  if (req.method === 'POST' && path === '/orders') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      // Idempotency: same external_order_id replays original delivery
      if (orders.has(data.external_order_id)) {
        const o = orders.get(data.external_order_id);
        return res.end(JSON.stringify({ ok: true, ...o, idempotent_replay: true }));
      }
      const p = products.find((x) => x.id === data.product_id || x.slug === data.product_id);
      if (!p) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Product not found' })); }
      const qty = data.quantity || 1;
      if (p.stock < qty) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'Out of stock' })); }
      p.stock -= qty;
      const items = Array.from({ length: qty }, (_, i) => `SANDBOX-USER-${orderSeq + 1}-${i + 1}:SANDBOX-PASS-${orderSeq + 1}-${i + 1}`);
      const o = { order_id: `stub-order-${++orderSeq}`, status: 'delivered', items, total_usdt: p.price_usdt * qty, idempotent_replay: false };
      orders.set(data.external_order_id, o);
      return res.end(JSON.stringify({ ok: true, ...o }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(5055, () => console.log('HubX stub listening on :5055'));
