const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Sends a message to the bakery owner's Telegram via a free Telegram Bot.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars (see README).
 * Fails silently (logs a warning) so a notification outage never blocks an order.
 */
function sendTelegramMessage(text) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn(
        '[notify] Telegram not configured — skipping Telegram notification. ' +
          'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable it.'
      );
      return resolve({ sent: false, reason: 'not_configured' });
    }
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            console.warn('[notify] Telegram API error:', res.statusCode, body);
            resolve({ sent: false, reason: 'api_error' });
          }
        });
      }
    );
    req.on('error', (err) => {
      console.warn('[notify] Telegram request failed:', err.message);
      resolve({ sent: false, reason: 'request_failed' });
    });
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  });
}

function formatOrderForOwner(order, business) {
  const itemsList = order.items
    .map(
      (i) =>
        `• ${i.qty} × ${i.name}${i.variantName ? ' (' + i.variantName + ')' : ''} — ${business.currency}${i.lineTotal}`
    )
    .join('\n');
  return (
    `🧁 <b>NEW ORDER</b> — ${order.id}\n\n` +
    `👤 ${order.customer.name} (${order.customer.phone})\n` +
    `📦 ${order.deliveryType === 'delivery' ? 'Home Delivery' : 'Pickup'}\n` +
    (order.deliveryType === 'delivery'
      ? `📍 ${order.address}${order.landmark ? ', ' + order.landmark : ''} — ${order.pincode}\n`
      : '') +
    `🗓 ${order.date} at ${order.time}\n\n` +
    `<b>Items:</b>\n${itemsList}\n\n` +
    `Subtotal: ${business.currency}${order.subtotal}\n` +
    (order.discount ? `Discount: -${business.currency}${order.discount}\n` : '') +
    `Delivery: ${business.currency}${order.deliveryFee}\n` +
    `<b>Total: ${business.currency}${order.total}</b>\n\n` +
    `💳 Payment: ${order.paymentMethod.toUpperCase()} (${order.paymentStatus})\n` +
    (order.notes ? `📝 Notes: ${order.notes}\n` : '')
  );
}

function buildWhatsAppOwnerLink(order, business, ownerWhatsappNumber) {
  const text = formatOrderForOwner(order, business).replace(/<\/?b>/g, '');
  const number = (ownerWhatsappNumber || '').replace(/[^\d]/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function buildWhatsAppCustomerLink(order, business) {
  const itemsList = order.items
    .map((i) => `${i.qty} x ${i.name}`)
    .join('\n');
  const text =
    `Hello ${business.name},\n` +
    `I would like to confirm my order.\n\n` +
    `Order ID: ${order.id}\n\n` +
    `Items:\n${itemsList}\n\n` +
    `${order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}: ${order.date} ${order.time}\n\n` +
    `Total: ${business.currency}${order.total}`;
  const number = (business.whatsapp || '').replace(/[^\d]/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

module.exports = {
  sendTelegramMessage,
  formatOrderForOwner,
  buildWhatsAppOwnerLink,
  buildWhatsAppCustomerLink,
};
