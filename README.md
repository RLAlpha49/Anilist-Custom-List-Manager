# 📋 AniList Custom List Manager

[![Deploy with Vercel](https://vercel.com/button)](https://anilist-custom-list-manager.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?logo=typescript)](https://typescriptlang.org)

> _Organize your AniList library the way you actually want it — with rules, not repetition._

<!-- PLACEHOLDER: Hero GIF — full flow from AniList login → list configuration → update queue → completed summary.
     Best placed here so a first-time visitor immediately understands the app and whether it solves their problem.
     Suggested filename: docs/images/hero.gif
-->

---

## ℹ️ Overview

If you've ever spent an evening manually sorting hundreds of AniList entries into custom lists — dragging, clicking, second-guessing — you probably got about halfway through before giving up (trust me, I've been there). This website is the fix for that.

AniList Custom List Manager lets you write rules instead of doing the work yourself. "Completed anime scored 8 or above." "Ongoing manga that are Korean manhwa." "Everything I've rewatched." You set up the logic once, the app figures out what goes where, and then it applies those assignments through a single guided workflow.

**Live at:** [anilist-custom-list-manager.vercel.app](https://anilist-custom-list-manager.vercel.app)

A few things worth knowing upfront:

- The app touches **custom list membership** and the **hide-from-default-status-lists flag** — nothing else. Your scores, notes, and watch progress stay exactly as they are.
- There's no backend here. All communication goes directly between your browser and AniList's GraphQL API — your data doesn't pass through any intermediate server.
- Anime and manga are handled **separately** — distinct workflows, no crossover.
- Before you run the updater, the UI will remind you (several times, honestly) to export your AniList data first. Please do it.

---

## 🚀 Usage

### Typical workflow

1. Head to **AniList Login** and connect your account via OAuth.
2. Open **Custom List Manager** and pull in your existing AniList custom lists.
3. Add, rename, reorder, and wire up rules for each list.
4. Run **Estimate Matches** or **Preview Entry** if you want to gut-check your setup before committing.
5. Move to the **Update** step and look over the queue.
6. Kick off the run — the website handles updates in batches.
7. Check the **Completed** page when it's done.

### What you can configure

Each custom list supports one or more rule conditions:

| Condition | Details |
| --- | --- |
| **Status** | Watching, Completed, Paused, Planning, Dropped, Repeating |
| **Score** | Exact scores or shortcuts such as `≥ 8` or `< 5` |
| **Format** | TV, Movie, and region-aware manga variants (manga, manhwa, manhua) |
| **Genres** | Contains one or more genres |
| **Tags** | Contains specific tags |
| **Tag categories** | Matches a tag category (e.g. Isekai, Shounen) |
| **Misc flags** | Rewatched / Reread, Adult (18+) |

Beyond the conditions themselves, you can:

- Flip between **Match All** or **Match Any** logic for include rules
- Layer on separate **exclude** rules
- Reorder lists with **drag-and-drop**
- Save and load **presets**
- Mark lists to **remove from all entries**
- Toggle **Hide Default Status Lists**

<!-- PLACEHOLDER: Animated GIF of the Custom List Manager page
     Show: fetching lists, dragging to reorder, expanding a rule set, adding a condition,
     and using the "Estimate" button to see match count.
     Suggested filename: docs/images/manager-demo.gif
-->

<!-- PLACEHOLDER: Screenshot or GIF of the Update page in progress
     Show the queued entries, live progress bar, and rate-limit / retry feedback.
     Reassures users that updates are reviewable and observable, not a black-box batch action.
     Suggested filename: docs/images/update-progress.gif
-->

---

## 🧠 How it works

### Client-only auth and storage

Auth runs through AniList's OAuth implicit flow, entirely in the browser. The access token gets read from the redirect URL hash, checked against AniList's API, and stored locally — it never touches a backend. Workflow and session state live under `aclm:*` keys in browser storage. If persistent storage isn't available (private browsing, locked-down environments), the app falls back to in-memory storage for the current tab — you just won't retain anything if you close it.

### Bulk updates

When you kick off an update run, here's what actually happens under the hood:

1. The website paginates through your entire AniList library
2. Every entry gets evaluated against your configured rule sets
3. It computes exactly which custom list changes are needed — nothing more
4. AniList save-entry mutations go out in batches
5. Transient failures get retried; if a batch fails, it falls back to single-entry saves
6. You can pause, resume, stop, or manually mark the run complete at any point

That last point matters. This isn't a black-box process you hand off and hope for the best — you can see what's happening and step in if something looks off. There is a built-in delay between requests for this very reason.

### A note on safety

Export your AniList data before running the updater. You'll find the option in AniList's settings. The website is built to be careful — rate limiting, retry logic, batch fallbacks — but bulk changes are bulk changes. Having an export file on hand costs you two minutes and could save a lot of frustration if anything unforeseen happens.

---

## ⬇️ Installation

> **Prerequisites:** [Bun](https://bun.sh) (recommended) or Node.js 20+. You'll also need an [AniList OAuth application](https://anilist.co/settings/developer) to get a Client ID.

### 1. Clone the repository

```bash
git clone https://github.com/RLAlpha49/Anilist-Custom-List-Manager.git
cd Anilist-Custom-List-Manager
```

### 2. Install dependencies

```bash
bun install
```

### 3. Create an AniList OAuth application

1. Go to [AniList Developer Settings](https://anilist.co/settings/developer)
2. Click **Create New Client**
3. Set the **Redirect URL** to `http://localhost:3000/anilist-redirect` (for local dev)
4. Copy the **Client ID** — you'll need it in the next step

### 4. Configure environment variables

Create a `.env.local` file at the project root:

```env
# Required — your AniList OAuth application Client ID
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id_here

# Optional — canonical base URL (defaults to the Vercel deployment URL)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Full list of environment variables:**

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_ANILIST_CLIENT_ID` | ✅ Yes | AniList OAuth Client ID |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical base URL for metadata and sitemap |
| `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` | No | Vercel production URL (auto-set on Vercel) |
| `NEXT_PUBLIC_VERCEL_URL` | No | Vercel preview URL (auto-set on Vercel) |
| `NEXT_PUBLIC_VERCEL_ENV` | No | Vercel environment name (auto-set on Vercel) |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | No | Git commit SHA for telemetry |
| `NEXT_PUBLIC_UPDATER_FAIL_FAST_THRESHOLD` | No | Consecutive failure limit before updater aborts (default: `5`) |
| `NEXT_FETCH_LOG_FULL_URL` | No | Set to `1` to log full GraphQL request URLs |

### 5. Run the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🏗️ Building for production

```bash
bun run build
bun run start
```

The build uses `output: "standalone"` and works cleanly with containerized deployments.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/RLAlpha49/Anilist-Custom-List-Manager)

Set `NEXT_PUBLIC_ANILIST_CLIENT_ID` in your Vercel project environment variables, then update the AniList OAuth redirect URL to match your deployment (`https://your-app.vercel.app/anilist-redirect`).

---

## 💭 Feedback and Contributing

Found something broken? Have a feature idea that's been nagging at you? Want to clean up something that bothered you while reading the code?

- [Open an issue](https://github.com/RLAlpha49/Anilist-Custom-List-Manager/issues) for bugs and feature requests
- Start a [Discussion](https://github.com/RLAlpha49/Anilist-Custom-List-Manager/discussions) if you want to think through a bigger idea before diving in
- Submit a pull request for focused, targeted improvements

**Contributing steps:**

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run the full validation gate: `bun run validate:ci`
5. Open a pull request

For anything substantial, open an issue first. It's much easier to align on an approach before the code exists than after.

---

## 📄 License

[MIT](./LICENSE) © 2025 [RLAlpha49](https://github.com/RLAlpha49)
