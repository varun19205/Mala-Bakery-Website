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
Most "free-tier" stacks still require a credit card, have moving parts, and
need `npm install` against the internet during development — none of which a
small bakery (or the environment this was built in) can rely on.

So this project is deliberately minimal:
- Plain **Node.js** (built-in `http`, `fs`, `crypto` modules — nothing to
  install for the app logic itself)
- Plain **HTML/CSS/JavaScript** on the front end — no build step, no framework
- **Supabase's free Postgres** as the database in production (see Section 6.1
  for why — short version: Render's free hosting tier has no persistent disk,
  so a plain file would get wiped every time the site goes to sleep)
- A local **JSON file** as the database automatically when running on your
  own computer — so trying it out locally still needs zero setup
- **Telegram Bot** + **WhatsApp deep links** for free order notifications

The only actual npm package this project depends on is `pg` (the Postgres
client), and it's only ever loaded if you've configured a database — your
hosting provider installs it automatically during deployment.

---

## 1. What's included

```
bakery-website/
├── server.js              # The entire backend: routing + all API endpoints
├── lib/
│   ├── db.js                # Database layer — Postgres in production,
│   │                          local JSON file for local dev (same API either way)
│   ├── auth.js               # Password hashing + session tokens
│   ├── notify.js              # Telegram + WhatsApp notification builders
│   └── orders.js               # Pricing, coupon validation, ID generation
├── config/business.json    # ← EDIT THIS: bakery name, phone, hours, etc.
├── data/db.json             # Local dev "database" + seed data for Postgres's first boot
├── public/                  # Customer-facing site (plain HTML/CSS/JS)
│   ├── index.html, menu.html, product.html, cart.html, checkout.html…
│   └── admin/                # Owner's dashboard (password protected)
├── setup.js                  # Run once: sets the admin password
├── clear-demo-data.js         # Run before launch: wipes demo products/orders
├── .env.example                # Copy to .env for secrets (local dev only)
└── package.json
```

---

## 2. Run it locally (2 minutes) — no database setup needed

```bash
cd bakery-website
node setup.js "YourStrongPassword123"   # sets the admin password (min 8 chars)
node server.js                          # or: npm start
```

Open `http://localhost:3000` for the customer site, and
`http://localhost:3000/admin/login` (username `admin`, the password you set)
for the dashboard.

Locally, with no `DATABASE_URL` set, everything reads/writes straight to
`data/db.json` on your computer — nothing to configure. The site ships with
**6 demo products, 2 demo reviews, and 2 demo coupons** (`WELCOME10`,
`FLAT50`) so you can see it working immediately.

---

## 3. Configure your mother's bakery (no coding required)

**Everything bakery-specific lives in two places — you never need to touch code:**

1. **`config/business.json`** — name, tagline, city, phone, WhatsApp, email,
   Instagram, opening hours, delivery area, pickup address. Edit this file
   directly, **or** edit it from `/admin/settings` in the dashboard (easier
   for a non-technical owner).
2. **`/admin/products`** — add/edit/delete products, prices, variants,
   add-ons, categories, bestseller/new badges, discounts, availability.

Nothing about the bakery is hard-coded into the pages — every page fetches
this data live.

---

## 4. How order notifications work

In order of preference, exactly as the brief asked — **no fake "free WhatsApp
API" claims**:

| Method | Cost | Setup |
|---|---|---|
| **Telegram Bot** (recommended) | Free, no limits | 2 minutes, see below |
| **WhatsApp deep link** | Free | Every order gives a pre-filled `wa.me` link with the full order details, ready for the owner to tap |
| **Browser notification** (fallback) | Free | The admin dashboard polls for new orders every 20 seconds and shows a browser notification / toast while it's open |
| Email | Free tier available | Not implemented by default — would need an SMTP provider like Brevo's free tier |

**True WhatsApp Business API automation is not free** — that's why it isn't
used here.

### Setting up the free Telegram bot (2 minutes)
1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts →
   copy the **bot token**.
2. Message your new bot anything, then visit
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and
   find your **chat id** (`"chat":{"id": 123456789}`).
3. Add both as environment variables on your host (see Section 7):
   `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
4. Restart the server. Every new order and custom cake request now pings
   that Telegram chat instantly, formatted for easy reading.

---

## 5. How payments work

- **Cash on pickup/delivery** — works out of the box.
- **UPI** — set your UPI ID and name in `/admin/settings`. The checkout page
  shows this to the customer, who pays via any UPI app; the bakery confirms
  the payment manually (marks it "Payment confirmed" on the order). This
  avoids per-transaction gateway fees entirely.
- **Online card/gateway payments are not included** — every real provider
  (Razorpay, PayU, Stripe) charges a transaction fee and requires business
  KYC, so it's intentionally left out to keep this genuinely free. Razorpay's
  standard checkout is the least-friction option for India if you want it later.

---

## 6. Realistic ₹0/month running cost

| Item | Cost | Notes |
|---|---|---|
| Hosting (Render free tier) | ₹0 | Spins down after ~15 min of inactivity; first visit after idle takes ~30s to wake — the honest trade-off of free hosting |
| Database (Supabase free Postgres) | ₹0 | 500MB, no credit card, doesn't expire |
| Notifications (Telegram) | ₹0 | No limits at this volume |
| WhatsApp deep links | ₹0 | Just opens wa.me — no API needed |
| UPI payments | ₹0 to bakery | No gateway = no transaction fee, but also no automatic payment confirmation |
| Domain name (optional) | ~₹700–1200/year | Optional — the free Render subdomain works fine without one |
| SSL/HTTPS | ₹0 | Included free by Render |

**There is no scenario in this build where you pay a monthly fee.** The only
optional cost is a custom domain name.

### 6.1 Why Supabase, and not just a file on Render's disk?

Render's **free** web service tier does not support persistent disks — only
paid plans do. Without one, the app's storage resets to whatever's in GitHub
every time the free instance sleeps and wakes back up (which happens after
~15 minutes of no visitors) or redeploys. That would silently delete new
orders and reset the admin password. Supabase's free Postgres database lives
independently of Render entirely, so it survives sleep/wake cycles, restarts,
and even switching hosting providers later.

---

## 7. Deployment guide (beginner-friendly)

### Step A: Create your free Supabase database
1. Go to [supabase.com](https://supabase.com) → sign up free (no credit card).
2. **New project** → pick any name and a database password (save this
   password somewhere) → choose the region closest to you → **Create**.
   Wait ~2 minutes for it to provision.
3. Once ready: **Project Settings → Database → Connection string** → choose
   the **URI** tab → copy it. It looks like:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres`
4. Replace `[YOUR-PASSWORD]` in that string with the database password from
   step 2. Save this full string — it's your `DATABASE_URL`.

### Step B: Push this project to GitHub
```bash
git init
git add .
git commit -m "Bakery website"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
(If you're on an iPad without git, use GitHub's web "Upload files" interface
instead — same end result.) Make sure `.env` is never uploaded — it's listed
in `.gitignore` for exactly this reason.

### Step C: Deploy on Render
1. Free account at [render.com](https://render.com) (no credit card needed).
2. **New → Web Service** → connect your GitHub repo.
3. **Build Command:** leave blank
4. **Start Command:** `npm start`
5. **Instance Type:** Free
6. **Do not** add a disk — the free tier doesn't support one, and you don't
   need it now that Supabase handles storage.
7. Under **Environment**, add these variables:
   - `DATABASE_URL` — the Supabase connection string from Step A
   - `SESSION_SECRET` — any long random string (generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
     on your own computer, or just mash the keyboard for 40+ characters)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — from Section 4, if you want notifications
8. **Create Web Service**. Wait 2–3 minutes for the build (it runs
   `npm install` automatically, which fetches the `pg` package) and deploy.
   You'll get a free URL like `https://your-bakery.onrender.com`.
9. Open the **Shell** tab on your Render service and run:
   ```
   node setup.js "YourRealPassword123"
   ```
   This sets your real admin password directly in Supabase — it will stick
   around permanently, unlike a password stored only on Render's disk.
10. Visit your live URL, place a test order, and confirm it appears in
    `/admin/orders` (and on Telegram, if configured).
11. Optional: connect a custom domain from Render's settings.

### If you ever outgrow the free tiers
Both Render and Supabase have paid tiers you can upgrade to without
re-architecting anything — the code doesn't change, only the plan.

---

## 8. Database schema

The app's entire state is one JSON document (stored as a single row in
Postgres, or as `data/db.json` locally) shaped like this:

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

**Backups**: in Supabase, go to **Database → Backups** for automatic daily
backups on the free tier, or **Table Editor → app_state → Export** to
download everything as JSON any time you like.

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
  cannot create duplicate orders.
- Order tracking requires **both** the Order ID and the phone number used to
  place it.
- All user input is length-capped and HTML-escaped before rendering to
  prevent injection.
- The Supabase connection uses SSL.

**Before going live**, set a real admin password (`node setup.js`) and a
real `SESSION_SECRET` as an environment variable — never commit `.env` to git.

---

## 10. What requires your input before this can go live

- [ ] A free Supabase project + its connection string as `DATABASE_URL` (Section 7)
- [ ] Real bakery name, phone, WhatsApp, email, address, hours (`/admin/settings`)
- [ ] Real product photos (replace the placeholder illustrations in `/public/images`)
- [ ] Real menu items and prices (`/admin/products`)
- [ ] A strong admin password (`node setup.js "..."` in Render's Shell)
- [ ] A Telegram bot token + chat ID, if you want instant push notifications
- [ ] A UPI ID, if you want to accept UPI payments
- [ ] Run `node clear-demo-data.js` before real customers start ordering

---

## 11. How your mother will use this (plain-language guide)

**Checking for new orders:**
1. Open `yourbakery.onrender.com/admin` on her phone (bookmark it to the
   home screen — it behaves like an app).
2. Log in once — the phone remembers it for 12 hours.
3. The top of the page instantly shows "Orders today" and "Pending orders."
4. If Telegram is set up, a message arrives on her phone the moment an order
   is placed.

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
1. Tap **Settings** → check "Holiday / closure mode" → write a message →
   **Save**. The site stops accepting new orders until she unchecks it.

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
✅ Full regression pass after switching the database layer to support
   Postgres — all of the above re-verified in local (file-based) mode; the
   Postgres code path mirrors the same logic and was reviewed line-by-line,
   but couldn't be executed against a live Supabase instance from this build
   environment (no internet access here) — test it yourself against your
   real Supabase project after Step A above, before announcing the site to customers.

## 13. What to change before a real public launch
- Replace placeholder SVG product images with real photography
- Fill in real business details (Section 3)
- Set a real admin password and `SESSION_SECRET`
- Decide on and test your delivery zones/charges for your actual area
- Place a real test order end-to-end on the live Supabase-backed site before
  telling customers it's open
