# 🍰 Bakery Ordering Website

A real, working ordering website for a small bakery: customers browse the menu,
customise cakes, check out, and track their order. The bakery owner gets a
private admin dashboard to manage orders, products, coupons, reviews and
custom cake requests — plus an instant notification whenever an order comes in.

**Everything here is functional, not a mockup.** Placing an order actually
writes to the database and notifies the owner. There are no fake buttons.

---

## 0. Why this is built the way it is

The brief asked for a real ordering platform that costs **₹0/month to run**.
Most "free-tier" stacks (Next.js + Supabase + Vercel, etc.) still require a
credit card, have moving parts, and need `npm install` against the internet —
none of which a small bakery (or this build environment) can rely on.

So this project is deliberately **zero external dependencies**:
- Plain **Node.js** (built-in `http`, `fs`, `crypto` modules only — nothing to `npm install`)
- A single **JSON file** as the database (`data/db.json`)
- Plain **HTML/CSS/JavaScript** on the front end (no build step, no framework)
- **Telegram Bot** + **WhatsApp deep links** for free order notifications

This means it runs anywhere Node.js runs, with no build step and no paid
service required to get started. The trade-off (see Section 6) is that a
single JSON file is fine for a small bakery's order volume, but isn't built
for high concurrency — the migration path to Postgres/Supabase is documented
if the bakery outgrows it.

---

## 1. What's included

```
bakery-website/
├── server.js              # The entire backend: routing + all API endpoints
├── lib/
│   ├── db.js               # JSON-file database read/write (safe queueing)
│   ├── auth.js              # Password hashing + session tokens
│   ├── notify.js             # Telegram + WhatsApp notification builders
│   └── orders.js              # Pricing, coupon validation, ID generation
├── config/business.json    # ← EDIT THIS: bakery name, phone, hours, etc.
├── data/db.json             # The "database": products, orders, coupons…
├── public/                  # Customer-facing site (plain HTML/CSS/JS)
│   ├── index.html, menu.html, product.html, cart.html, checkout.html…
│   └── admin/                # Owner's dashboard (password protected)
├── setup.js                 # Run once: sets the admin password
├── clear-demo-data.js        # Run before launch: wipes demo products/orders
├── .env.example              # Copy to .env for secrets
└── package.json
```

---

## 2. Run it locally (2 minutes)

```bash
cd bakery-website
node setup.js "YourStrongPassword123"   # sets the admin password (min 8 chars)
node server.js                          # or: npm start
```

Open `http://localhost:3000` for the customer site, and
`http://localhost:3000/admin/login` (username `admin`, the password you set)
for the dashboard.

The site ships with **6 demo products, 2 demo reviews, and 2 demo coupons**
(`WELCOME10`, `FLAT50`) so you can see it working immediately. Run
`node clear-demo-data.js` before you go live with real customers.

---

## 3. Configure your mother's bakery (no coding required)

**Everything bakery-specific lives in two places — you never need to touch code:**

1. **`config/business.json`** — name, tagline, city, phone, WhatsApp, email,
   Instagram, opening hours, delivery area, pickup address. Edit this file
   directly, **or** edit it from `/admin/settings` in the dashboard (easier
   for a non-technical owner — it writes to the same file).
2. **`/admin/products`** — add/edit/delete products, prices, variants,
   add-ons, categories, bestseller/new badges, discounts, availability.

Nothing about the bakery is hard-coded into the pages — every page fetches
this data live.

---

## 4. How order notifications work (Section 8 of the brief)

In order of preference, exactly as the brief asked — **no fake "free WhatsApp
API" claims**:

| Method | Cost | Setup |
|---|---|---|
| **Telegram Bot** (recommended) | Free, no limits | 2 minutes, see below |
| **WhatsApp deep link** | Free | Works automatically — every order gives you a "Message ordered on WhatsApp" link, and the API response includes a pre-filled `wa.me` link with the full order details, ready for the owner to tap |
| **Browser notification** (fallback) | Free | The admin dashboard polls for new orders every 20 seconds and shows a browser notification / toast — works automatically once the dashboard tab is open |
| Email | Free tier available | Not implemented by default (would need an SMTP provider like Brevo's free tier — see Section 6) |

**True WhatsApp Business API automation is not free** — that's why it isn't
used here. The honest free alternative implemented is the WhatsApp deep link
combined with Telegram push notifications.

### Setting up the free Telegram bot (2 minutes)
1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts →
   copy the **bot token** it gives you.
2. Message your new bot anything (e.g. "hi"), then visit
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and
   find your **chat id** in the response (`"chat":{"id": 123456789}`).
3. Add both to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-your-token
   TELEGRAM_CHAT_ID=123456789
   ```
4. Restart the server. Every new order and custom cake request now pings
   that Telegram chat instantly, formatted for easy reading.

---

## 5. How payments work (Section 9)

- **Cash on pickup/delivery** — works out of the box.
- **UPI** — set your UPI ID and name in `/admin/settings`. The checkout page
  shows this to the customer, who pays via any UPI app and the bakery
  confirms the payment manually (marks it "Payment confirmed" in the order's
  admin page). This avoids per-transaction gateway fees entirely.
- **Online card/gateway payments are not included** — every real provider
  (Razorpay, PayU, Stripe) charges a transaction fee (typically 2%+) and
  requires business KYC. Adding one is possible later but would break the
  "genuinely free" requirement, so it's intentionally left out. If you want
  it, Razorpay's standard checkout is the least-friction option for India.

Payment statuses are tracked distinctly: `cash_on_delivery`, `pending`,
`payment_initiated` (not used automatically, but available for manual use),
`confirmed`, `failed` — all editable per-order from the admin dashboard.

---

## 6. Realistic ₹0/month running cost

| Item | Cost | Notes |
|---|---|---|
| Hosting (Render/Railway free tier, or a VPS you already have) | ₹0 | See Section 7. Free tiers on Render/Railway spin the app down after inactivity — first visit after idle takes ~30s to "wake up". This is the honest trade-off of free hosting. |
| Database | ₹0 | It's a JSON file on disk — included, no separate service |
| Notifications (Telegram) | ₹0 | No limits on Telegram's Bot API for this volume |
| WhatsApp deep links | ₹0 | Just opens wa.me — no API needed |
| UPI payments | ₹0 to bakery | No gateway = no transaction fee, but also no automatic payment confirmation |
| Domain name (optional) | ~₹700–1200/year | Optional — you can run on the free subdomain your host gives you (e.g. `yourbakery.onrender.com`) |
| SSL/HTTPS | ₹0 | Included free by any host in Section 7 |

**There is no scenario in this build where you pay a monthly fee.** The only
optional cost is a custom domain name, which is not required to operate.

---

## 7. Deployment guide (beginner-friendly)

Because this is a persistent Node.js server with a JSON file it writes to
(not a static site or serverless function), the best free-tier fits are
**Render** or **Railway** — both offer a genuinely free tier for small Node
apps and persistent disk. (Vercel/Netlify/Cloudflare Pages are built for
static sites + serverless functions, which don't suit a stateful file-writing
server well — they're better once you migrate to a hosted database, see the
note at the end of this section.)

### Deploy to Render (recommended, free tier)
1. Create a free account at render.com (no credit card required for the free
   web service tier).
2. Push this project to a new GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Bakery website"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
   **Important**: add a `.gitignore` with `.env` and `node_modules` in it so
   you never commit secrets (see the `.gitignore` included).
3. On Render: **New → Web Service** → connect your GitHub repo.
4. Build command: (leave blank — there's nothing to build)
5. Start command: `npm start`
6. Add environment variables (Render dashboard → Environment):
   - `SESSION_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — from Section 4
7. Add a **persistent disk** (Render → Disks) mounted at `/opt/render/project/src/data`
   so `db.json` survives restarts and deploys. (Free tier includes 1GB free disk.)
8. Deploy. Render gives you a free `https://your-bakery.onrender.com` URL.
9. SSH or use Render's shell to run `node setup.js "YourPassword"` once, to
   set the real admin password (don't ship the demo/placeholder password).
10. Visit your live URL, place a test order, confirm it appears in
    `/admin/orders` and (if configured) arrives on Telegram.
11. Optional: connect a custom domain in Render's settings (domain purchase
    is the only real cost in this whole stack).

### Deploy to Railway (alternative, free tier with usage limits)
Same steps as Render: connect GitHub repo, set start command `npm start`,
add the same environment variables, add a persistent volume for `/data`,
then run `node setup.js` via Railway's shell.

### If you outgrow the JSON file database
A JSON file is fine for a bakery doing dozens of orders a day. If growth
means many concurrent writes, migrate `lib/db.js` to a real database —
**Supabase's free Postgres tier** is the natural next step (500MB DB, no
credit card, generous free bandwidth) since the schema in Section 8 below
maps directly to Postgres tables. That migration is a backend-only change;
none of the front-end pages need to change since they only talk to `/api/*`.

---

## 8. Database schema (as implemented in `data/db.json`)

```
admins            { id, username, passwordHash, salt }
categories        { id, name, order }
products          { id, name, description, category, images[], basePrice,
                    variants[{id,name,priceDelta}], addOns[{id,name,price}],
                    eggless, vegetarian, available, prepTimeMinutes,
                    bestseller, isNew, discountPercent, notes }
orders            { id, clientRef, customer{name,phone,email}, deliveryType,
                    address, landmark, pincode, date, time, notes,
                    items[{productId,name,variantName,addOns[],qty,
                           unitPrice,lineTotal,customNotes,cakeCustomization}],
                    subtotal, discount, couponCode, deliveryFee, total,
                    paymentMethod, paymentStatus, status, statusHistory[],
                    createdAt }
coupons           { code, type, value, minOrder, maxDiscount, expiresAt,
                    usageLimit, usedCount, active }
reviews           { id, name, rating, text, approved, createdAt }
customCakeRequests{ id, name, phone, email, cakeType, size, flavour, eggless,
                    occasion, requiredDate, requiredTime, budgetRange, theme,
                    message, additionalRequirements, status, createdAt }
settings          { deliveryCharge, freeDeliveryThreshold, minOrderAmount,
                    orderCutoffTime, holidayMode, holidayMessage,
                    deliveryZones[], upi{id,name}, paymentMethods[] }
```
This maps 1:1 to relational tables if you migrate to Postgres later —
`order_items` would simply become its own table with an `order_id` foreign key.

**Backups**: `data/db.json` is a plain text file — copy it anywhere (email it
to yourself weekly, or set up your host's automatic disk snapshot if
available) to back up all orders and products at once.

---

## 9. Security

- Admin routes (`/api/admin/*`) require a signed, `HttpOnly` session cookie —
  never exposed to JavaScript, never stored in the frontend.
- Passwords are hashed with **PBKDF2** (100,000 iterations) + a random salt
  per admin — plaintext passwords are never stored.
- Session tokens are HMAC-signed with `SESSION_SECRET` and expire after 12h.
- Login has basic **rate limiting** (8 attempts / 15 minutes per IP).
- **Prices are always recalculated server-side** from the product database —
  the client cart is just a shopping list; a tampered request cannot change
  what it's charged (see `lib/orders.js: priceOrder`).
- Coupons are validated server-side against expiry, usage limits and minimum
  order — never trusted from the client.
- Order creation uses an **idempotency key** so double-tapping "Place Order"
  (or a flaky connection retry) cannot create duplicate orders.
- Order tracking requires **both** the Order ID and the phone number used to
  place it — a guessed Order ID alone reveals nothing.
- All user input is length-capped and HTML-escaped before rendering to
  prevent injection.

**Before going live**, change the demo admin password (`node setup.js`), set
a real `SESSION_SECRET` in `.env`, and never commit `.env` to git.

---

## 10. What requires your input before this can go live

- [ ] Real bakery name, phone, WhatsApp, email, address, hours (`/admin/settings`)
- [ ] Real product photos (replace the placeholder illustrations in `/public/images`
      or use image URLs from your own hosting/Cloudinary free tier)
- [ ] Real menu items and prices (`/admin/products`)
- [ ] A strong admin password (`node setup.js "..."`)
- [ ] A Telegram bot token + chat ID, if you want instant push notifications
- [ ] A UPI ID, if you want to accept UPI payments
- [ ] Run `node clear-demo-data.js` before real customers start ordering

---

## 11. How your mother will use this (plain-language guide)

**Checking for new orders:**
1. Open `yourbakery.onrender.com/admin` on her phone (bookmark it to the
   home screen — it behaves like an app).
2. Log in once — the phone remembers it for 12 hours.
3. The top of the page instantly shows "Orders today" and "Pending orders" —
   if that pending number is more than 0, there's something to prepare.
4. If Telegram is set up, a message arrives on her phone the moment an order
   is placed — no need to keep the dashboard open.

**Handling an order:**
1. Tap **Orders** → tap the order → see exactly what was ordered, for when,
   and any special requests.
2. As she prepares it, tap the status dropdown: New → Confirmed → Preparing
   → Ready → (Out for delivery) → Completed.
3. Tap **Print Invoice** for a paper copy, or **Contact on WhatsApp** to
   message the customer directly.

**Adding a new cake to the menu:**
1. Tap **Products** → **+ Add product** → fill in name, price, description →
   **Save**. It appears on the website immediately.

**Going on holiday:**
1. Tap **Settings** → check "Holiday / closure mode" → write a message like
   "We're closed until Monday" → **Save**. The site stops accepting new
   orders and shows that message until she unchecks it.

---

## 12. Testing performed

✅ Homepage, menu, search & category filters, product detail with variants/add-ons
✅ Cart persistence (localStorage — survives refresh)
✅ Checkout validation (phone format, required fields, delivery vs pickup)
✅ Order creation → correct total calculated server-side → confirmation page
✅ Duplicate order prevention (idempotency key)
✅ Order tracking (correct phone → status timeline; wrong phone → rejected)
✅ Coupon validation (valid, expired, below minimum order)
✅ Custom cake request submission
✅ Review submission (held for approval) → shows only after admin approves
✅ Admin login (correct/incorrect password, session cookie, 401 without login)
✅ Admin analytics, order list + filters, order status/payment updates, printable invoice
✅ Admin product CRUD, coupon creation, business settings, holiday mode
✅ 404 handling, SEO files (`/robots.txt`, `/sitemap.xml`)

## 13. What to change before a real public launch
- Replace placeholder SVG product images with real photography
- Fill in real business details (Section 3) — the site currently shows
  bracketed placeholders like `[BAKERY NAME]` on purpose, so it's obvious
  what still needs replacing
- Set a real admin password and `SESSION_SECRET`
- Decide on and test your delivery zones/charges for your actual area
- If order volume grows large, migrate the JSON database to Postgres/Supabase
  (Section 7)
