# Legacy build configs

These files were used during an earlier attempt to deploy the backend on
Railway with the **DOCKERFILE** builder. We later migrated to **Railpack**
(configured per-service in the Railway UI), so these files are kept here
only as historical reference / fallback if we ever go back to Docker.

- `Dockerfile` — multi-step image build for `packages/backend`. Installs
  OpenSSL + ca-certificates, runs `npm install`, generates the Prisma
  client, normalizes `start.sh` line endings, and runs the API + worker
  via `start.sh`.
- `railway.json` — declared `"builder": "DOCKERFILE"` and pointed at the
  Dockerfile above.

**Do not move these back to the repo root** unless you also remove the
Railpack config in the Railway service UI; otherwise the two builders
collide and BuildKit caches get poisoned (which is what was happening
before this cleanup).
