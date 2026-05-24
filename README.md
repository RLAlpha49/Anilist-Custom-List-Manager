# AniList Custom List Manager

A Next.js web app for people who want finer control over how AniList custom lists are organized and applied across anime and manga entries.

## Why this exists

AniList gives you custom lists, but keeping them tidy at scale can get repetitive. This project adds a guided workflow to:

- connect your AniList account,
- define list rules,
- preview queued changes,
- and apply updates in bulk.

It focuses on reducing manual list cleanup while keeping the process visible and reversible from the UI.

## Key features

- **Fetch anime and manga custom lists** directly from AniList
- **Drag-and-drop list ordering** with persisted section order updates
- **List operations in-app**: add, rename, delete, and mark lists to remove from all entries
- **Condition-based assignment** (status, score, format, genres, tags, tag categories, misc flags)
- **Batch updater with queue controls** (start, pause, stop, complete)

## Who it is for

- AniList users with medium-to-large libraries
- People who rely on many custom lists for filtering/organization
- Users who want a visual workflow instead of manual per-entry edits

## Getting started

### Prerequisites

- Node.js (current LTS recommended)
- Bun (recommended in this repo because scripts use `bun run` in CI helpers)

### 1) Install dependencies

```bash
bun install
```

### 2) Configure environment variables

Create a `.env` file in the project root (or update the existing one):

```env
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_anilist_client_id
```

### 3) Run the app

```bash
bun run dev
```

Open `http://localhost:3000`.

## Security & data notes

- Access tokens are stored locally in the browser via app storage helpers.
- Requests are sent to AniList GraphQL over HTTPS.
- This project does not include a backend service for token storage.

## License

This project is licensed under the [MIT License](LICENSE).
