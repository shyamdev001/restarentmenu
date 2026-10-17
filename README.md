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
| Guest menu, table 5 | http://localhost:5173/?table=5 |
| Admin panel | http://localhost:5173/admin |

The first start creates the admin account from `server/.env` (default **admin / admin12345**) and a sample menu of 17 dishes. **Change the password** under Admin → Settings.

To try it on your phone, connect the phone to the same Wi-Fi and open `http://<your computer's IP>:5173/?table=5`.

## Admin panel

Sections are listed down the side on a laptop and along the bottom on a phone (the less-used ones sit under **More**). The search box at the top finds things by plain words: type "gst", "password", "qr" or a dish's name and press Enter.

| Section | What it does |
| --- | --- |
| Home | What needs doing now (new orders, table calls, tables to mark paid), today's figures, anything still to set up, and shortcuts. |
| Orders | Live board: New → Cooking → Ready → Served, plus open tables to mark as paid. Each new order rings, shows a notice and lands in the bell's list. Shows tables calling a server or asking for the bill, and today's totals. |
| History | Every day of the last 60 with orders, and that day's orders. |
| Reports | Everything the orders can tell you, for any range of days, compared with the period before. **Overview:** sales, orders, average bill, tax collected, cancellations, sales by day and a day-by-day table. **Dishes:** best sellers with their share of sales, categories, extras, spice choices, dishes that did not sell. **Days and hours:** busiest hours, an average weekday, and a weekday-by-hour map. **Tables:** sales per table and order sizes. **Kitchen and service:** how long orders take at each step, calls from tables and how fast they were answered. Three spreadsheet downloads: orders, dishes, days. Days and hours follow the time zone of the device you are looking from. |
| Menu | Add, edit and delete dishes. Upload a photo. One switch marks a dish sold out; guests see it immediately. |
| Categories | Add, rename, reorder and delete categories. |
| Tables & QR | A printable QR code for every table. |
| Settings | Restaurant name, welcome text, currency, tax %, number of tables, public address, password. |

## Staff, roles and the kitchen screen

Each person gets their own sign-in under **Staff** (owners only). Every role sees only the sections and buttons it can use, and the server checks the same rules on every request:

| Role | Can |
| --- | --- |
| Owner | Everything, including settings, staff and sales |
| Manager | Run service, edit the menu, see reports and QR codes |
| Waiter | Enter orders, serve, answer table calls, mark bills paid |
| Kitchen | Start and finish orders, mark dishes sold out |

Each order keeps a trail of who moved it and when. Switching an account off signs it out at once. There is always at least one active owner. Anyone can change their own password under **My account**.

The **Kitchen screen** is made for a tablet on the pass. It shows big tickets in three columns (to start, cooking, ready), each with a clock that turns amber, then red, as the order runs long. It also shows the "all day" count of every dish still to cook. Cooks tap a line to tick it off and press and hold to move an order on, so a stray touch does nothing. Full screen is one tap, and the screen stays awake.

## Live notifications

- **In the page:** guests see a notice each time the kitchen moves their order on or answers a call from their table. The admin panel shows a notice, rings and vibrates for every new order and table call, and repeats a quiet reminder each minute while something is waiting. The bell in the admin header keeps the last 20 alerts and has the sound switch.
- **Push (page closed):** guests tap "Alert me when it moves" in the order sheet; staff tap the button under the admin bell. This needs HTTPS (or `localhost`). On iPhone the site must first be added to the Home Screen.
- **Keys:** push signing keys are created on first use and stored in the database. To supply your own, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` to a real contact address (`mailto:you@yourrestaurant.com`).

## Ordering rules

- **Orders only from the table's QR card (optional, off by default).** Out of the box any link to the menu can order, and a guest without a table number picks one from a list. To lock it down, print the cards from Admin → Tables & QR, then tick "Only take orders from a scanned table QR code" under Admin → Settings. Each card's link ends in `&k=…`, a code only the server can make; orders, calls and the bill are then refused without it, so nobody can send food to a table by typing its number.
- **No double orders.** A basket carries its own id, so sending it again after a lost connection returns the first order.
- **Prices are checked.** If a price or an extra changed after the guest filled the basket, the order is refused with an explanation and the menu refreshes.
- **Orders only move forward:** new → cooking → ready → served. An order can be cancelled until it leaves the kitchen.
- **While guests wait.** After sending an order the guest lands on its own screen: a countdown round their plate, how many orders are ahead of theirs, the quickest things to add in one tap, the story of the dish that is coming, and a rating once it is served (shown under Reports → Kitchen and service). The owner can also switch on a **wheel** under Settings → While guests wait: one spin per table per visit, with prizes and odds the owner sets; a win shows on the order so staff can honour it.
- **Staff can enter an order.** Orders → **New order**: pick a table or the **Counter** (takeaway, walk-ins, phone orders), tap the dishes, choose spice and extras, and send. It reaches the kitchen like any other order and needs no QR code.
- **Orders are called out.** Each new order, each order the kitchen marks ready, and each table call takes over the admin screen and is read aloud, one dish at a time, with the line being read lit up. It uses the voice built into the browser, so it is free and works offline. Switch the full-screen call-out or the voice off under the bell.
- **One bill per table.** The guest's bill shows everything the table ordered, from every phone. When the table has paid, tap **Mark paid** under Orders → Open tables; the guests' phones then start a fresh visit.
- **History.** Admin → History lists every day of the last 60 with orders, with that day's orders and sales.
- **Photos** uploaded in the admin are converted to WebP (a much smaller format) in two sizes, a large one for the plate and a small one for lists, and stored in the database so they survive a redeploy. Any JPG, PNG or WebP can be uploaded. Older photos are converted automatically the next time the server starts.

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
