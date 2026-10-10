# Saffron & Smoke: digital menu

A QR-code menu for a restaurant, built on the MERN stack (MongoDB, Express, React, Node.js).

- **Guests** scan the QR code on their table, browse the plate carousel, customise dishes, send the order to the kitchen and watch it progress live.
- **The restaurant** signs in to the admin panel to manage dishes, photos, prices and categories, mark items sold out, handle live orders and print the table QR codes.

There is no online payment: the guest asks for the bill and pays the server at the table.

## What you need

1. **Node.js 18 or newer**: https://nodejs.org
2. **MongoDB**, one of:
   - MongoDB Community Server installed on this computer (https://www.mongodb.com/try/download/community), or
   - a free MongoDB Atlas cluster (https://www.mongodb.com/atlas), or
   - Docker: `docker compose up -d` in this folder.

## Run it on your computer

```bash
# 1. install everything (once)
npm run install:all

# 2. create the settings file (once)
copy server\.env.example server\.env        # Windows
cp server/.env.example server/.env          # macOS / Linux

# 3. start the API and the React app together
npm run dev
```

Then open:

| What | Address |
| --- | --- |
| Guest menu | Admin → Tables & QR → "Open this table's menu" (the link carries the table's code) |
| Admin panel | http://localhost:5173/admin |

The first start creates the admin account from `server/.env` (default **admin / admin12345**) and a sample menu of 17 dishes. **Change the password** under Admin → Settings.

To try it on your phone, connect the phone to the same Wi-Fi and open `http://<your computer's IP>:5173/?table=5`.

## Admin panel

| Tab | What it does |
| --- | --- |
| Orders | Live board: New → Cooking → Ready → Served, plus open tables to mark as paid. Each new order rings, shows a notice and lands in the bell's list. Shows tables calling a server or asking for the bill, and today's totals. |
| Menu | Add, edit and delete dishes. Upload a photo. One switch marks a dish sold out; guests see it immediately. |
| Categories | Add, rename, reorder and delete categories. |
| Tables & QR | A printable QR code for every table. |
| Settings | Restaurant name, welcome text, currency, tax %, number of tables, public address, password. |

## Live notifications

- **In the page:** guests see a notice each time the kitchen moves their order on or answers a call from their table. The admin panel shows a notice, rings and vibrates for every new order and table call, and repeats a quiet reminder each minute while something is waiting. The bell in the admin header keeps the last 20 alerts and has the sound switch.
- **Push (page closed):** guests tap "Alert me when it moves" in the order sheet; staff tap the button under the admin bell. This needs HTTPS (or `localhost`). On iPhone the site must first be added to the Home Screen.
- **Keys:** push signing keys are created on first use and stored in the database. To supply your own, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` to a real contact address (`mailto:you@yourrestaurant.com`).

## Ordering rules

- **QR codes carry a code.** Each table's QR link ends in `&k=…`, a code only the server can make. Orders, calls and the bill are only accepted with it, so nobody can send food to a table by typing its number. To test on your computer, use the "Open this table's menu" link under Admin → Tables & QR. You can switch the rule off under Settings ("Only take orders from a scanned table QR code"); guests then pick their table from a list. **If you printed QR codes before this rule existed, print them again.**
- **No double orders.** A basket carries its own id, so sending it again after a lost connection returns the first order.
- **Prices are checked.** If a price or an extra changed after the guest filled the basket, the order is refused with an explanation and the menu refreshes.
- **Orders only move forward:** new → cooking → ready → served. An order can be cancelled until it leaves the kitchen.
- **One bill per table.** The guest's bill shows everything the table ordered, from every phone. When the table has paid, tap **Mark paid** under Orders → Open tables; the guests' phones then start a fresh visit.
- **History.** Admin → History lists every day of the last 60 with orders, with that day's orders and sales.
- **Photos** uploaded in the admin are stored in the database, so they survive a redeploy.

## Tests

```bash
npm test --prefix server
```

Runs the ordering rules above against a throwaway database on your MongoDB.

## Look and feel

- **Light and dark:** the sun and moon button (on the guest menu and in the admin header) switches theme and is remembered on that device. Light is the default. Both palettes are the variables at the top of `client/src/styles/base.css`.
- **Layouts:** phones and portrait tablets stack the plate above the dish details; landscape tablets, laptops and desktops put them side by side and open sheets as a drawer.
- **A table is never guessed:** a guest who opens the menu without `?table=` in the link is asked to pick their table before anything is sent.

## Going live

1. Put the project on a host that runs Node.js (Render, Railway, a VPS…) and point it at a MongoDB Atlas database.
2. Set these environment variables on the host: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (a long random string), `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
3. Build and start:

   ```bash
   npm run install:all
   npm run build      # builds the React app into client/dist
   npm start          # Express serves the API and the built app on one port
   ```

4. In Admin → Settings, enter the site's public address, then print the QR codes from Tables & QR.

Uploaded photos are stored in `server/uploads`. Use a host with a persistent disk, or keep a backup of that folder.

## Project structure

```
server/                     Express API + Socket.IO
  src/
    config/                 environment and database connection
    models/                 Mongoose schemas (Setting, Category, Dish, Order, ServiceCall, Admin)
    validators/             zod schemas for every request body
    middleware/             auth, validation, rate limits, uploads, error handling
    services/               order pricing, realtime events
    controllers/            public, auth and admin request handlers
    routes/                 route table
    seed/                   first-run sample data
  uploads/                  dish photos (seed/ holds the sample images)

client/                     React app (Vite)
  src/
    lib/                    API client, socket, formatting, persistent state
    components/             shared UI
    features/customer/      the guest menu
    features/admin/         the admin panel (loaded only at /admin)
    styles/
```

## How it stays safe

- Prices, add-ons and tax are calculated on the server from the database; the browser's numbers are never trusted.
- Every request body is validated with zod.
- Admin sessions use an httpOnly cookie with a signed JWT; passwords are hashed with bcrypt.
- Rate limits on sign-in and on placing orders; Helmet security headers.
- Uploads accept JPG, PNG and WebP only, up to 5 MB, and are renamed on the server.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :5000 and React on :5173 with live reload |
| `npm run build` | Production build of the React app |
| `npm start` | Start the production server |
| `npm run seed` | **Wipes** the menu, orders and settings and restores the sample menu (keeps the admin account) |

## Sample content

The dishes, prices, nutrition figures and allergens in the sample menu are placeholders. Replace them with the restaurant's real information, especially allergens, before guests use it. The sample photos come from the MIT-licensed Foodish collection (github.com/surhud004/Foodish).
