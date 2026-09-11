const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ---- tiny built-in .env loader (no npm dependency needed) ----
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
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
const auth = require('./lib/auth');
const notify = require('./lib/notify');
const { genId, priceOrder } = require('./lib/orders');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BUSINESS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config', 'business.json'), 'utf-8')
);

// ---------- tiny helpers ----------

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message, extra) {
  sendJSON(res, status, { error: true, message, ...(extra || {}) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function requireAdmin(req, res) {
  const token = getCookie(req, 'admin_session');
  const session = auth.verifySessionToken(token);
  if (!session) {
    sendError(res, 401, 'Not authenticated');
    return null;
  }
  return session;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(res, filePath, statusCode) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendError(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(statusCode || 200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// naive in-memory rate limiter for admin login (per-process; fine for a small bakery)
const loginAttempts = new Map(); // ip -> { count, resetAt }
function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8; // 8 attempts / 15 min
}

// idempotency store for order creation (per-process; small bakery scale)
const idempotencyCache = new Map(); // key -> orderId

// ---------- request handler ----------

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const method = req.method;

    // ===== PUBLIC API =====

    if (pathname === '/api/config' && method === 'GET') {
      return sendJSON(res, 200, BUSINESS);
    }

    if (pathname === '/api/products' && method === 'GET') {
      const data = await db.readDB();
      return sendJSON(res, 200, {
        categories: data.categories.sort((a, b) => a.order - b.order),
        products: data.products.filter((p) => p.available !== false || true).map((p) => p),
      });
    }

    if (pathname === '/api/settings/public' && method === 'GET') {
      const data = await db.readDB();
      const s = data.settings;
      return sendJSON(res, 200, {
        deliveryCharge: s.deliveryCharge,
        freeDeliveryThreshold: s.freeDeliveryThreshold,
        minOrderAmount: s.minOrderAmount,
        paymentMethods: s.paymentMethods,
        holidayMode: s.holidayMode,
        holidayMessage: s.holidayMessage,
        orderCutoffTime: s.orderCutoffTime,
        upi: s.upi,
      });
    }

    if (pathname === '/api/coupons/validate' && method === 'POST') {
      const body = await readBody(req);
      const data = await db.readDB();
      const coupon = data.coupons.find(
        (c) => c.code.toUpperCase() === (body.code || '').toUpperCase()
      );
      const { validateCoupon } = require('./lib/orders');
      const result = validateCoupon(coupon, Number(body.subtotal) || 0);
      return sendJSON(res, 200, result);
    }

    if (pathname === '/api/reviews' && method === 'GET') {
      const data = await db.readDB();
      return sendJSON(
        res,
        200,
        data.reviews.filter((r) => r.approved)
      );
    }

    if (pathname === '/api/reviews' && method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !body.rating || !body.text) {
        return sendError(res, 400, 'Name, rating and review text are required');
      }
      const review = {
        id: genId('REV'),
        name: String(body.name).slice(0, 80),
        rating: Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5)),
        text: String(body.text).slice(0, 1000),
        approved: false,
        createdAt: new Date().toISOString(),
      };
      await db.update((d) => d.reviews.push(review));
      return sendJSON(res, 201, { success: true, id: review.id });
    }

    if (pathname === '/api/custom-cake' && method === 'POST') {
      const body = await readBody(req);
      const required = ['name', 'phone', 'cakeType', 'requiredDate'];
      for (const f of required) {
        if (!body[f]) return sendError(res, 400, `Missing required field: ${f}`);
      }
      const request = {
        id: genId('CC'),
        name: body.name,
        phone: body.phone,
        email: body.email || '',
        cakeType: body.cakeType,
        size: body.size || '',
        flavour: body.flavour || '',
        eggless: !!body.eggless,
        occasion: body.occasion || '',
        requiredDate: body.requiredDate,
        requiredTime: body.requiredTime || '',
        budgetRange: body.budgetRange || '',
        theme: body.theme || '',
        message: body.message || '',
        additionalRequirements: body.additionalRequirements || '',
        status: 'new',
        createdAt: new Date().toISOString(),
      };
      await db.update((d) => d.customCakeRequests.push(request));
      notify
        .sendTelegramMessage(
          `🎂 <b>NEW CUSTOM CAKE REQUEST</b> — ${request.id}\n` +
            `${request.name} (${request.phone})\n` +
            `Type: ${request.cakeType} | Date needed: ${request.requiredDate}\n` +
            `Theme: ${request.theme || '—'}\n` +
            `Message: ${request.message || '—'}`
        )
        .catch(() => {});
      return sendJSON(res, 201, { success: true, id: request.id });
    }

    // create order
    if (pathname === '/api/orders' && method === 'POST') {
      const body = await readBody(req);
      const idempotencyKey =
        req.headers['idempotency-key'] || body.clientRef || null;

      if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
        const existingId = idempotencyCache.get(idempotencyKey);
        const data = await db.readDB();
        const existing = data.orders.find((o) => o.id === existingId);
        if (existing) return sendJSON(res, 200, { success: true, order: existing, deduped: true });
      }

      if (!body.customer || !body.customer.name || !body.customer.phone) {
        return sendError(res, 400, 'Customer name and phone are required');
      }
      if (!/^[\d+\-\s()]{7,15}$/.test(body.customer.phone)) {
        return sendError(res, 400, 'Please enter a valid phone number');
      }
      if (!['pickup', 'delivery'].includes(body.deliveryType)) {
        return sendError(res, 400, 'Invalid delivery type');
      }
      if (body.deliveryType === 'delivery' && !body.address) {
        return sendError(res, 400, 'Delivery address is required');
      }
      if (!body.date || !body.time) {
        return sendError(res, 400, 'Preferred date and time are required');
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return sendError(res, 400, 'Cart is empty');
      }

      const data = await db.readDB();

      if (data.settings.holidayMode) {
        return sendError(res, 400, data.settings.holidayMessage || 'We are currently closed for orders.');
      }

      let coupon = null;
      if (body.couponCode) {
        coupon = data.coupons.find(
          (c) => c.code.toUpperCase() === body.couponCode.toUpperCase()
        );
      }

      let priced;
      try {
        priced = priceOrder({
          cartItems: body.items,
          products: data.products,
          settings: data.settings,
          coupon,
        });
      } catch (e) {
        return sendError(res, 400, e.message);
      }

      if (priced.subtotal < (data.settings.minOrderAmount || 0)) {
        return sendError(
          res,
          400,
          `Minimum order amount is ${BUSINESS.currency}${data.settings.minOrderAmount}`
        );
      }

      const order = {
        id: genId('ORD'),
        clientRef: idempotencyKey,
        customer: {
          name: body.customer.name,
          phone: body.customer.phone,
          email: body.customer.email || '',
        },
        deliveryType: body.deliveryType,
        address: body.address || '',
        landmark: body.landmark || '',
        pincode: body.pincode || '',
        date: body.date,
        time: body.time,
        notes: (body.notes || '').slice(0, 500),
        items: priced.lineItems,
        subtotal: priced.subtotal,
        discount: priced.discount,
        couponCode: priced.couponCode,
        deliveryFee: priced.deliveryFee,
        total: priced.total,
        paymentMethod: body.paymentMethod || 'cod',
        paymentStatus: body.paymentMethod === 'cod' ? 'cash_on_delivery' : 'pending',
        status: 'new',
        statusHistory: [{ status: 'new', at: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      };

      await db.update((d) => {
        d.orders.push(order);
        if (priced.couponCode) {
          const c = d.coupons.find((c) => c.code === priced.couponCode);
          if (c) c.usedCount = (c.usedCount || 0) + 1;
        }
      });

      if (idempotencyKey) idempotencyCache.set(idempotencyKey, order.id);

      // Fire-and-forget notification to bakery owner (Telegram if configured).
      notify.sendTelegramMessage(notify.formatOrderForOwner(order, BUSINESS)).catch(() => {});

      const ownerWhatsAppLink = notify.buildWhatsAppOwnerLink(
        order,
        BUSINESS,
        BUSINESS.whatsapp
      );

      return sendJSON(res, 201, { success: true, order, ownerWhatsAppLink });
    }

    // order tracking (public, requires order id + phone to prevent snooping)
    if (pathname.match(/^\/api\/orders\/[^/]+$/) && method === 'GET') {
      const orderId = pathname.split('/').pop();
      const phone = parsedUrl.searchParams.get('phone') || '';
      const data = await db.readDB();
      const order = data.orders.find((o) => o.id === orderId);
      if (!order || order.customer.phone.replace(/\D/g, '') !== phone.replace(/\D/g, '')) {
        return sendError(res, 404, 'Order not found. Check your Order ID and phone number.');
      }
      return sendJSON(res, 200, {
        id: order.id,
        status: order.status,
        statusHistory: order.statusHistory,
        deliveryType: order.deliveryType,
        date: order.date,
        time: order.time,
        total: order.total,
        items: order.items,
        paymentStatus: order.paymentStatus,
      });
    }

    // ===== ADMIN AUTH =====

    if (pathname === '/api/admin/login' && method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (isRateLimited(ip)) {
        return sendError(res, 429, 'Too many login attempts. Try again in 15 minutes.');
      }
      const body = await readBody(req);
      const data = await db.readDB();
      const admin = data.admins.find((a) => a.username === body.username);
      if (
        !admin ||
        admin.passwordHash === 'REPLACE_ME_SEE_README' ||
        !auth.verifyPassword(body.password || '', admin.salt, admin.passwordHash)
      ) {
        return sendError(res, 401, 'Invalid username or password');
      }
      const token = auth.createSessionToken(admin.username);
      res.setHeader(
        'Set-Cookie',
        `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200`
      );
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/me' && method === 'GET') {
      const session = requireAdmin(req, res);
      if (!session) return;
      return sendJSON(res, 200, { username: session.username });
    }

    // Everything below this line is admin-protected.
    if (pathname.startsWith('/api/admin/')) {
      const session = requireAdmin(req, res);
      if (!session) return; // requireAdmin already sent 401

      // overview / analytics
      if (pathname === '/api/admin/analytics' && method === 'GET') {
        const data = await db.readDB();
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const orders = data.orders;
        const sum = (list) => list.reduce((s, o) => s + o.total, 0);
        const since = (d) => orders.filter((o) => new Date(o.createdAt) >= d);

        const productCounts = {};
        for (const o of orders) {
          for (const item of o.items) {
            productCounts[item.name] = (productCounts[item.name] || 0) + item.qty;
          }
        }
        const bestSellers = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, qty]) => ({ name, qty }));

        const customerPhones = orders.map((o) => o.customer.phone);
        const uniqueCustomers = new Set(customerPhones);
        const phoneCounts = {};
        customerPhones.forEach((p) => (phoneCounts[p] = (phoneCounts[p] || 0) + 1));
        const repeatCustomers = Object.values(phoneCounts).filter((c) => c > 1).length;

        return sendJSON(res, 200, {
          todayOrders: since(startOfDay).length,
          todayRevenue: sum(since(startOfDay)),
          weekRevenue: sum(since(startOfWeek)),
          monthRevenue: sum(since(startOfMonth)),
          pendingOrders: orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length,
          completedOrders: orders.filter((o) => o.status === 'completed').length,
          totalOrders: orders.length,
          avgOrderValue: orders.length ? Math.round(sum(orders) / orders.length) : 0,
          bestSellers,
          totalCustomers: uniqueCustomers.size,
          repeatCustomers,
          recentOrders: orders.slice(-8).reverse(),
        });
      }

      if (pathname === '/api/admin/new-orders-count' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, {
          count: data.orders.filter((o) => o.status === 'new').length,
        });
      }

      // orders
      if (pathname === '/api/admin/orders' && method === 'GET') {
        const data = await db.readDB();
        let orders = data.orders;
        const status = parsedUrl.searchParams.get('status');
        const dateFrom = parsedUrl.searchParams.get('dateFrom');
        const dateTo = parsedUrl.searchParams.get('dateTo');
        const search = parsedUrl.searchParams.get('search');
        if (status) orders = orders.filter((o) => o.status === status);
        if (dateFrom) orders = orders.filter((o) => o.date >= dateFrom);
        if (dateTo) orders = orders.filter((o) => o.date <= dateTo);
        if (search) {
          const s = search.toLowerCase();
          orders = orders.filter(
            (o) =>
              o.id.toLowerCase().includes(s) ||
              o.customer.name.toLowerCase().includes(s) ||
              o.customer.phone.includes(s)
          );
        }
        return sendJSON(res, 200, orders.slice().reverse());
      }

      const orderDetailMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
      if (orderDetailMatch && method === 'GET') {
        const data = await db.readDB();
        const order = data.orders.find((o) => o.id === orderDetailMatch[1]);
        if (!order) return sendError(res, 404, 'Order not found');
        return sendJSON(res, 200, order);
      }
      if (orderDetailMatch && method === 'PATCH') {
        const body = await readBody(req);
        const validStatuses = [
          'new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled',
        ];
        const result = await db.update((d) => {
          const order = d.orders.find((o) => o.id === orderDetailMatch[1]);
          if (!order) return null;
          if (body.status && validStatuses.includes(body.status)) {
            order.status = body.status;
            order.statusHistory.push({ status: body.status, at: new Date().toISOString() });
          }
          if (body.paymentStatus) order.paymentStatus = body.paymentStatus;
          return order;
        });
        if (!result) return sendError(res, 404, 'Order not found');
        return sendJSON(res, 200, { success: true, order: result });
      }

      // products (admin CRUD)
      if (pathname === '/api/admin/products' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, data.products);
      }
      if (pathname === '/api/admin/products' && method === 'POST') {
        const body = await readBody(req);
        if (!body.name || !body.category || body.basePrice == null) {
          return sendError(res, 400, 'Name, category and base price are required');
        }
        const product = {
          id: genId('PROD'),
          name: body.name,
          description: body.description || '',
          category: body.category,
          images: body.images || [],
          basePrice: Number(body.basePrice),
          variants: body.variants || [],
          addOns: body.addOns || [],
          eggless: !!body.eggless,
          vegetarian: body.vegetarian !== false,
          available: body.available !== false,
          prepTimeMinutes: Number(body.prepTimeMinutes) || 30,
          bestseller: !!body.bestseller,
          isNew: !!body.isNew,
          discountPercent: Number(body.discountPercent) || 0,
          notes: body.notes || '',
        };
        await db.update((d) => d.products.push(product));
        return sendJSON(res, 201, product);
      }
      const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (productMatch && method === 'PUT') {
        const body = await readBody(req);
        const result = await db.update((d) => {
          const idx = d.products.findIndex((p) => p.id === productMatch[1]);
          if (idx === -1) return null;
          d.products[idx] = { ...d.products[idx], ...body, id: productMatch[1] };
          return d.products[idx];
        });
        if (!result) return sendError(res, 404, 'Product not found');
        return sendJSON(res, 200, result);
      }
      if (productMatch && method === 'DELETE') {
        await db.update((d) => {
          d.products = d.products.filter((p) => p.id !== productMatch[1]);
        });
        return sendJSON(res, 200, { success: true });
      }

      // reviews moderation
      if (pathname === '/api/admin/reviews' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, data.reviews.slice().reverse());
      }
      const reviewMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
      if (reviewMatch && method === 'PATCH') {
        const body = await readBody(req);
        const result = await db.update((d) => {
          const r = d.reviews.find((r) => r.id === reviewMatch[1]);
          if (!r) return null;
          if (typeof body.approved === 'boolean') r.approved = body.approved;
          return r;
        });
        if (!result) return sendError(res, 404, 'Review not found');
        return sendJSON(res, 200, result);
      }

      // custom cake requests
      if (pathname === '/api/admin/custom-cake' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, data.customCakeRequests.slice().reverse());
      }
      const ccMatch = pathname.match(/^\/api\/admin\/custom-cake\/([^/]+)$/);
      if (ccMatch && method === 'PATCH') {
        const body = await readBody(req);
        const result = await db.update((d) => {
          const r = d.customCakeRequests.find((r) => r.id === ccMatch[1]);
          if (!r) return null;
          if (body.status) r.status = body.status;
          return r;
        });
        if (!result) return sendError(res, 404, 'Request not found');
        return sendJSON(res, 200, result);
      }

      // business config (name, phone, hours, etc — config/business.json)
      if (pathname === '/api/admin/business-config' && method === 'GET') {
        return sendJSON(res, 200, BUSINESS);
      }
      if (pathname === '/api/admin/business-config' && method === 'PUT') {
        const body = await readBody(req);
        Object.assign(BUSINESS, body);
        fs.writeFileSync(
          path.join(__dirname, 'config', 'business.json'),
          JSON.stringify(BUSINESS, null, 2)
        );
        return sendJSON(res, 200, BUSINESS);
      }

      // settings
      if (pathname === '/api/admin/settings' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, data.settings);
      }
      if (pathname === '/api/admin/settings' && method === 'PUT') {
        const body = await readBody(req);
        const result = await db.update((d) => {
          d.settings = { ...d.settings, ...body };
          return d.settings;
        });
        return sendJSON(res, 200, result);
      }

      // coupons
      if (pathname === '/api/admin/coupons' && method === 'GET') {
        const data = await db.readDB();
        return sendJSON(res, 200, data.coupons);
      }
      if (pathname === '/api/admin/coupons' && method === 'POST') {
        const body = await readBody(req);
        if (!body.code || !body.type || body.value == null) {
          return sendError(res, 400, 'Code, type and value are required');
        }
        const coupon = {
          code: body.code.toUpperCase(),
          type: body.type,
          value: Number(body.value),
          minOrder: Number(body.minOrder) || 0,
          maxDiscount: body.maxDiscount ? Number(body.maxDiscount) : null,
          expiresAt: body.expiresAt || null,
          usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
          usedCount: 0,
          active: true,
        };
        await db.update((d) => d.coupons.push(coupon));
        return sendJSON(res, 201, coupon);
      }
      const couponMatch = pathname.match(/^\/api\/admin\/coupons\/([^/]+)$/);
      if (couponMatch && method === 'PUT') {
        const body = await readBody(req);
        const result = await db.update((d) => {
          const c = d.coupons.find((c) => c.code === couponMatch[1].toUpperCase());
          if (!c) return null;
          Object.assign(c, body);
          return c;
        });
        if (!result) return sendError(res, 404, 'Coupon not found');
        return sendJSON(res, 200, result);
      }

      return sendError(res, 404, 'Not found');
    }

    // ===== SEO / PWA files =====
    if (pathname === '/robots.txt') {
      const host = req.headers.host;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: http://${host}/sitemap.xml\n`);
    }
    if (pathname === '/sitemap.xml') {
      const data = await db.readDB();
      const host = req.headers.host;
      const urls = ['', '/menu', '/track', '/custom-cake']
        .concat(data.products.map((p) => `/product/${p.id}`))
        .map((u) => `<url><loc>http://${host}${u}</loc></url>`)
        .join('');
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
    }

    // ===== STATIC FILES / PAGE ROUTES =====

    const routeMap = {
      '/': 'index.html',
      '/menu': 'menu.html',
      '/cart': 'cart.html',
      '/checkout': 'checkout.html',
      '/track': 'track.html',
      '/custom-cake': 'custom-cake.html',
      '/admin/login': 'admin/login.html',
      '/admin': 'admin/dashboard.html',
      '/admin/orders': 'admin/orders.html',
      '/admin/products': 'admin/products.html',
      '/admin/settings': 'admin/settings.html',
      '/admin/reviews': 'admin/reviews.html',
      '/admin/custom-cake': 'admin/custom-cake.html',
    };

    if (routeMap[pathname]) {
      return serveStatic(res, path.join(PUBLIC_DIR, routeMap[pathname]));
    }
    if (pathname.startsWith('/product/')) {
      return serveStatic(res, path.join(PUBLIC_DIR, 'product.html'));
    }
    if (pathname.startsWith('/order/confirmation/')) {
      return serveStatic(res, path.join(PUBLIC_DIR, 'order-confirmation.html'));
    }
    if (pathname.startsWith('/admin/orders/')) {
      return serveStatic(res, path.join(PUBLIC_DIR, 'admin/order-detail.html'));
    }

    // fallback to static asset (css/js/images/manifest/sw.js)
    const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      return sendError(res, 403, 'Forbidden');
    }
    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      return serveStatic(res, safePath);
    }

    return serveStatic(res, path.join(PUBLIC_DIR, '404.html'), 404);
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Something went wrong. Please try again in a moment.');
  }
});

server.listen(PORT, () => {
  console.log(`🍰 Bakery server running at http://localhost:${PORT}`);
});
