const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/orders', label: 'Orders', icon: '🧾' },
  { href: '/admin/products', label: 'Products', icon: '🍰' },
  { href: '/admin/custom-cake', label: 'Custom Cakes', icon: '🎂' },
  { href: '/admin/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

function renderAdminShell(activeHref) {
  const app = document.getElementById('adminApp');
  const sideLinks = ADMIN_NAV.map(n => `<a href="${n.href}" class="${n.href===activeHref?'active':''}">${n.icon} ${n.label}</a>`).join('');
  app.insertAdjacentHTML('afterbegin', `
    <aside class="admin-sidebar">
      <div style="font-family:var(--font-display);font-size:1.2rem;color:#fff;margin-bottom:22px">🍰 Bakery Admin</div>
      ${sideLinks}
      <a href="#" id="logoutLink" style="margin-top:20px;color:#e3a1ab">↩ Log out</a>
    </aside>
  `);
  const mobileNav = document.createElement('div');
  mobileNav.className = 'admin-mobile-nav container';
  mobileNav.innerHTML = ADMIN_NAV.map(n => `<a href="${n.href}" class="chip ${n.href===activeHref?'active':''}">${n.icon} ${n.label}</a>`).join('');
  document.getElementById('adminMain').prepend(mobileNav);

  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/admin/logout', { method: 'POST' });
    location.href = '/admin/login';
  });
}

async function requireAdminAuth() {
  try {
    await api('/api/admin/me');
    return true;
  } catch {
    location.href = '/admin/login';
    return false;
  }
}

function money(n) { return '₹' + (n || 0); }

function statusPill(status) {
  const label = status.replaceAll('_', ' ');
  return `<span class="status-pill status-${status}">${label}</span>`;
}

// Polls for new ("new" status) orders and shows a browser notification —
// this is notification Tier 4 (free, no external service) as a fallback.
let lastNotifiedCount = null;
async function pollNewOrders() {
  try {
    const { count } = await api('/api/admin/new-orders-count');
    const badge = document.getElementById('newOrdersBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (lastNotifiedCount !== null && count > lastNotifiedCount) {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('New order received!', { body: `You have ${count} new order(s) waiting.` });
      } else {
        toast(`🔔 New order received! (${count} pending)`);
      }
    }
    lastNotifiedCount = count;
  } catch { /* ignore transient failures */ }
}
function startOrderPolling() {
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  pollNewOrders();
  setInterval(pollNewOrders, 20000);
}
