# EduPhi

Standalone app: steer learning by choosing a color (Yellow Explore, Green Engineer, Blue Understand, Red Challenge, Orange Build) then clicking a highlighted term to branch a new card.

- `public/` – mobile-first UI (`core.js` logic, `store.js` persistence, `app.js` UI)
- `worker/worker.js` – Cloudflare Worker + KV: `/api/projects`, `/api/handoff`
- Input contract: `?q=&app=&title=&url=` and optionally `&h=<id>` for a larger context stored via `POST /api/handoff` (never truncated)
- `docs/EXISTING_GENERATOR.md` – status of the Infinity Phi generator discovery (not present in this repo)
- Tests: `npm test`; run locally: `npx wrangler dev` (set `KV` id in `wrangler.toml`)
