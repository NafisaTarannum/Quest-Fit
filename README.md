# Quest Fit

A sport-interest matchmaking app: create an account, get recommended people
who share your sports, match with them, and chat privately in real time.
This is the real multi-user version — a Node.js/Express backend with a
**cloud Postgres database**, so your data lives online instead of on your
laptop, and it works for any number of people from any browser.

## What's inside

- `server/server.js` — Express API (auth, discover, search, matches, chat)
  plus the WebSocket server that makes chat update live.
- `server/db.js` — connects to your Postgres database and creates the
  tables it needs on first run.
- `public/` — the frontend (plain HTML/CSS/JS, no build step).

## Requirements

- Node.js 18+ (tested on Node 22)
- A free cloud Postgres database (instructions below)

## 1. Get a free cloud Postgres database

Any standard Postgres host works. **Neon** is the simplest to set up:

1. Go to **https://neon.tech** and sign up (no credit card needed).
2. Create a new project — it gives you a database immediately.
3. On the project dashboard, copy the **connection string**. It looks like:
   ```
   postgresql://neondb_owner:AbCdEf123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

Supabase (https://supabase.com) or Railway (https://railway.app) work the
same way — sign up, create a Postgres database, copy its connection
string. Any of the three is fine.

## 2. Configure the app

In the project folder, copy `.env.example` to a new file named `.env`:

```bash
cp .env.example .env
```

Open `.env` and paste your real connection string in place of the example:

```
DATABASE_URL=postgresql://neondb_owner:AbCdEf123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
```

`.env` is already excluded from git via `.gitignore` — your database
credentials won't accidentally get committed or shared.

## 3. Run it

```bash
npm install
npm start
```

You should see `Quest Fit server running at http://localhost:3000`, and
the app will have created its tables in your cloud database automatically.
Open **http://localhost:3000** in your browser. Open it in two tabs (or two
browsers) to sign up two accounts and match them with each other.

To use a different port:
```bash
PORT=4000 npm start
```

## How accounts & matching work

- **Sign up**: unique display name, email, password (8+ characters, one
  uppercase, one lowercase, one number, one symbol), age, gender, and the
  sports you're interested in. Passwords are hashed with bcrypt (the
  async, non-blocking version) before they're stored — never saved in
  plain text.
- **Discover**: shows one profile at a time, people who share at least one
  sport with you, ranked by how many sports you have in common. Pass moves
  to the next profile. Match sends them a **match request**.
- **Matches require mutual acceptance.** Tapping Match sends a pending
  request — the other person has to accept it before a chat opens. If they
  had already sent *you* a request, your Match instantly completes the
  match (no need to separately accept each other). The Matches tab is
  split into three sections: requests waiting on you (Accept/Decline),
  requests you've sent that are still pending, and accepted matches you
  can chat with.
- **Search**: filter everyone on the app by sport, age range, or name.
- **Matches**: see everyone you've matched with and message them privately.
- **Profile customization**: click your name in the top bar to edit your
  profile — upload a photo (auto-resized/compressed in the browser before
  it's sent), or pick an emoji avatar and accent color, choose a fun title
  (like "Weekend Warrior"), and write a short bio. These show up on your
  card in Discover, in Search results, in the Matches list, and next to
  your messages in chat.
- **Profile tab**: a dedicated page showing your own profile — avatar,
  title, bio, sports, and stats (sports count, matches count, when you
  joined) — with an Edit profile button right there.
- **Viewing other profiles**: click someone's name or avatar in Search
  results to see their full profile (bio, sports, title, posts) in a
  read-only view, with a Match button right there.
- **Photo posts**: post photos (with an optional caption) from your
  Profile tab — they show up in a grid there, and anyone who views your
  profile from Search sees them too. Up to 24 posts per person; delete any
  of your own from the ✕ button on the tile.
- Sessions are per-tab tokens stored in `sessionStorage` (not a shared
  browser cookie), so you can be logged in as different accounts in
  different tabs of the same browser at once.
- Chat is **live**: the server pushes new messages over a WebSocket the
  instant they're sent, so an open conversation updates without a refresh.
  If the connection drops, the client reconnects automatically.

## Deploying it so it's reachable from anywhere (not just your laptop)

Your database is already in the cloud, but the server itself still only
runs when you run `npm start` on your machine. To make the app reachable
from any device, deploy the server to a host like Render, Railway, or
Fly.io:

1. Push this project to a GitHub repo (or connect the host directly to your
   folder, depending on the platform).
2. Set the `DATABASE_URL` environment variable in the host's dashboard —
   same value as your local `.env`, don't commit `.env` itself.
3. Set the start command to `npm start`.
4. A few things worth doing before real users touch it:
   - **Move sessions out of memory.** Tokens currently live in an
     in-memory `Map` in `server/server.js` — simple, but everyone gets
     logged out on a restart, and it won't work across multiple server
     instances. For production, store tokens in the database or Redis.
   - **Serve over HTTPS** (most hosts do this for you automatically).
   - Consider rate-limiting `/api/login` and `/api/signup` to slow down
     brute-force attempts.

## Notes on the current implementation

- Discover excludes anyone you've already swiped (liked or passed) and
  anyone who shares none of your sports, as well as anyone you already
  have a pending or accepted match with.
- The database schema updates itself automatically on startup (adding the
  columns used for match requests and profile customization) — safe to run
  against your existing Neon database, existing accounts get sensible
  defaults (a badge emoji avatar, no bio/title/photo) automatically.
- Profile photos and post photos are stored as base64-encoded images
  directly in Postgres (capped at roughly 500KB each), rather than as
  separate files - this keeps them working correctly even on hosts with an
  ephemeral filesystem (like Render's free tier), where uploaded files
  would otherwise be lost on every restart. Neon's free tier has limited
  storage, so this is worth keeping in mind if usage grows a lot.
- The database connection pool has an error listener attached
  (`server/db.js`). Serverless Postgres providers like Neon can close idle
  connections on their own at any time; without that listener, Node.js
  treats the resulting error as uncaught and crashes the entire server —
  dropping every connected user at once. This was the cause of a real bug
  where opening a second browser tab would occasionally freeze the whole
  app for everyone until Render restarted the process.
- Toast notifications render independently of the main page (see
  `showToast` in `public/app.js`), rather than through the normal
  state/render cycle. Toasts fire very frequently — on almost every live
  event from another user — and the app's rendering approach rebuilds the
  entire current tab's content from scratch on every state change. Routing
  toasts through that would force a full, expensive rebuild (including any
  images on screen) twice per toast, which was contributing to real
  performance problems with multiple tabs/users active at once.
- The server shuts down gracefully on SIGTERM/SIGINT (`server/server.js`),
  closing WebSocket connections and the database pool cleanly before
  exiting. Render sends SIGTERM to the old process on every redeploy;
  without handling it, database connections from the dying process can
  linger on Neon's side until Neon's own timeout eventually reclaims them
  — and across many redeploys, that can add up and contribute to
  slowdowns for real requests queuing behind them.
- If you open two tabs to the same account/site in the *same* browser and
  one seems to hang while the other is active, that's normal browser
  behavior (browsers share a limited connection pool across all tabs of
  the same origin) rather than an app bug — it goes away using a different
  browser, an Incognito/Private window, or simply not keeping many tabs to
  the same site open in one browser at once.
