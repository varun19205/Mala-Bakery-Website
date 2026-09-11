// ---------- tiny fetch helper ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

let BUSINESS_CONFIG = null;
async function getConfig() {
  if (BUSINESS_CONFIG) return BUSINESS_CONFIG;
  BUSINESS_CONFIG = await api('/api/config');
  return BUSINESS_CONFIG;
}

// ---------- toast ----------
function toast(message) {
  let el = document.getElementById('global-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- cart (localStorage) ----------
const CART_KEY = 'bakery_cart_v1';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function addToCart(item) {
  const cart = getCart();
  // merge identical line (same product+variant+addons+notes)
  const key = JSON.stringify({ productId: item.productId, variantId: item.variantId, addOnIds: item.addOnIds, customNotes: item.customNotes, cakeCustomization: item.cakeCustomization });
  const existing = cart.find((c) => JSON.stringify({ productId: c.productId, variantId: c.variantId, addOnIds: c.addOnIds, customNotes: c.customNotes, cakeCustomization: c.cakeCustomization }) === key);
  if (existing) existing.qty += item.qty;
  else cart.push(item);
  saveCart(cart);
}
function removeFromCartAt(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}
function updateCartQtyAt(index, qty) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].qty = Math.max(1, qty);
  saveCart(cart);
}
function clearCart() { saveCart([]); }
function cartCount() { return getCart().reduce((s, c) => s + c.qty, 0); }
function updateCartBadge() {
  document.querySelectorAll('.cart-count').forEach((el) => {
    const n = cartCount();
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
  });
}

// ---------- header / footer chrome ----------
function starIcon() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7.1L12 17.9l-6.2 3.4L7 14.2 2 9.3l7.1-.7z"/></svg>';
}

async function renderChrome(activePath) {
  const cfg = await getConfig();
  const initials = cfg.name.replace(/[\[\]]/g, '').split(' ').map((w) => w[0]).slice(0, 2).join('');
  const headerHost = document.getElementById('site-header');
  if (headerHost) {
    headerHost.innerHTML = `
      <header class="site-header">
        <div class="bar">
          <a class="brand" href="/">
            <span class="brand-mark">${initials}</span>
            <span>
              <span class="brand-name">${cfg.name}</span>
              <span class="brand-tagline">${cfg.tagline}</span>
            </span>
          </a>
          <ul class="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/menu">Menu</a></li>
            <li><a href="/custom-cake">Custom Cakes</a></li>
            <li><a href="/track">Track Order</a></li>
          </ul>
          <div class="header-actions">
            <a class="cart-btn" href="/cart" aria-label="View cart">
              ð§º<span class="cart-count" style="display:none">0</span>
            </a>
            <button class="menu-toggle" id="menuToggleBtn" aria-label="Open menu">â°</button>
          </div>
        </div>
      </header>
      <div class="mobile-drawer" id="mobileDrawer">
        <div class="panel">
          <button class="close" id="drawerClose" aria-label="Close menu">Ã</button>
          <a href="/">Home</a>
          <a href="/menu">Menu</a>
          <a href="/custom-cake">Custom Cakes</a>
          <a href="/track">Track Order</a>
          <a href="https://wa.me/${cfg.whatsapp.replace(/[^\d]/g,'')}" target="_blank" rel="noopener">WhatsApp Us</a>
        </div>
      </div>
    `;
    const toggle = document.getElementById('menuToggleBtn');
    const drawer = document.getElementById('mobileDrawer');
    const close = document.getElementById('drawerClose');
    toggle && toggle.addEventListener('click', () => drawer.classList.add('open'));
    close && close.addEventListener('click', () => drawer.classList.remove('open'));
    drawer && drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.classList.remove('open'); });
  }

  const footerHost = document.getElementById('site-footer');
  if (footerHost) {
    footerHost.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <h4>${cfg.name}</h4>
              <p style="color:#cbbcae">${cfg.tagline}</p>
              <div class="social-row">
                <a href="${cfg.instagram}" target="_blank" rel="noopener" aria-label="Instagram">IG</a>
              </div>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li><a href="/menu">Full Menu</a></li>
                <li><a href="/custom-cake">Custom Cake Request</a></li>
                <li><a href="/track">Track My Order</a></li>
              </ul>
            </div>
            <div>
              <h4>Visit / Contact</h4>
              <ul>
                <li>${cfg.pickupAddress}</li>
                <li><a href="tel:${cfg.phone}">${cfg.phone}</a></li>
                <li><a href="mailto:${cfg.email}">${cfg.email}</a></li>
              </ul>
            </div>
            <div>
              <h4>Hours</h4>
              <ul><li>${cfg.openingHours}</li><li>Delivery: ${cfg.deliveryArea}</li></ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>Â© ${new Date().getFullYear()} ${cfg.name}. All rights reserved.</span>
            <a href="/admin/login">Bakery staff login</a>
          </div>
        </div>
      </footer>
    `;
  }

  const waSlot = document.getElementById('wa-float-slot');
  if (waSlot) {
    waSlot.innerHTML = `<a class="wa-float" href="https://wa.me/${cfg.whatsapp.replace(/[^\d]/g,'')}?text=${encodeURIComponent('Hi ' + cfg.name + ', I have a question about your bakery.')}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="#fff"><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.7.8 5.2 2.2 7.3L3 29l6.3-2.4a13 13 0 0 0 6.7 1.8c7 0 12.7-5.6 12.7-12.6C28.7 8.6 23 3 16 3zm0 22.9c-2.1 0-4.1-.6-5.8-1.6l-.4-.2-3.8 1.4 1.4-3.7-.3-.4a10.3 10.3 0 0 1-1.6-5.6C5.5 9.9 10.2 5.3 16 5.3c5.8 0 10.5 4.6 10.5 10.3S21.8 25.9 16 25.9zm5.7-7.7c-.3-.1-1.9-1-2.2-1.1-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1a8.4 8.4 0 0 1-4.2-3.7c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5L12.6 10c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3 4.8 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.6 1.9-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3z"/></svg>
    </a>`;
  }

  updateCartBadge();
}

// ---------- shared render helpers ----------
function escapeHTML(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function productCardHTML(p) {
  const price = p.discountPercent ? Math.round(p.basePrice * (1 - p.discountPercent / 100)) : p.basePrice;
  const unavailable = p.available === false;
  return `
  <a href="/product/${p.id}" class="product-card" style="${unavailable ? 'opacity:0.55' : ''}">
    <div class="thumb">
      <img src="${(p.images && p.images[0]) || '/images/placeholder-cake-1.svg'}" alt="${escapeHTML(p.name)}" loading="lazy">
      ${p.bestseller ? '<span class="badge">Bestseller</span>' : ''}
      ${p.isNew ? '<span class="badge new">New</span>' : ''}
      ${p.discountPercent ? `<span class="badge discount">${p.discountPercent}% off</span>` : ''}
    </div>
    <div class="info">
      <h3 style="font-size:1.05rem;margin-bottom:2px">${escapeHTML(p.name)}</h3>
      <div class="tags">
        ${p.eggless ? '<span class="tag egg">Eggless</span>' : ''}
        ${p.vegetarian ? '<span class="tag">Veg</span>' : ''}
        ${unavailable ? '<span class="tag" style="background:#fbdada;color:#a63333">Unavailable</span>' : ''}
      </div>
      <div class="price-row">
        <span class="price">${p.discountPercent ? `<span class="was">â¹${p.basePrice}</span>` : ''}â¹${price}</span>
        <span class="btn btn-sm btn-primary">${unavailable ? 'Notify me' : 'View'}</span>
      </div>
    </div>
  </a>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (document.getElementById('site-header') || document.getElementById('site-footer')) {
    renderChrome();
  }
  updateCartBadge();
});
