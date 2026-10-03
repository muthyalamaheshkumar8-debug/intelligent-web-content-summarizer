# Intelligent Web Content Summarizer

A React reading workspace backed by Express, MongoDB, a Python HTML scraper, and Gemini. Paste a public article URL to create a concise brief and key takeaways. Summaries are saved to a private browser session, with real server-sent progress updates and history synchronization between tabs.

## Architecture

React / Vite / Tailwind → Express API → Python / BeautifulSoup → Gemini → MongoDB

The original frontend, backend, scraper and collection remain in place. `server/app.js` builds a testable Express app; `server/server.js` owns startup, MongoDB connectivity and graceful shutdown. No production fallback generates sample summaries or stores history in memory.

## Requirements

- Node.js 22.12+ (Node 24 is used in the container and CI).
- Python 3.12 and a local virtual environment.
- A reachable MongoDB database, with permission to create the additive history index.
- A Gemini API key and access to the model selected by `GEMINI_MODEL`.

## Local setup

Run from this project directory:

```bash
npm ci --prefix server
npm ci --prefix client
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate
```

```bash
pip install -r scraper/requirements-dev.txt
```

Copy `.env.example` to `server/.env` and fill in the MongoDB URI and Gemini key. Generate two independent random secrets, for example by running the following command twice:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use one for `SESSION_SECRET` and the other for `SCRAPER_TOKEN`. Remove the placeholder values. Keep the session secret stable across restarts to retain access to browser history. `server/.env` is loaded relative to `server.js`, regardless of the shell's working directory.

The Python process also needs the matching scraper token. In its terminal:

```bash
# Windows PowerShell
$env:SCRAPER_TOKEN = "YOUR_LOCAL_SCRAPER_TOKEN"
# macOS / Linux
export SCRAPER_TOKEN="YOUR_LOCAL_SCRAPER_TOKEN"
```

Start the three services in separate terminals:

```bash
python scraper/scraper.py
npm run dev --prefix server
npm run dev --prefix client
```

Open http://localhost:5173. Vite forwards `/api` to the Express server on port 5000. The Python development service binds to loopback port 5001.

For the built frontend served by Express:

```bash
npm run build --prefix client
npm start --prefix server
```

Open http://localhost:5000. The scraper and MongoDB must still be running. These commands use development cookie settings unless `NODE_ENV=production` is explicitly configured.

## Free hosted deployment

[Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fmuthyalamaheshkumar8-debug%2Fintelligent-web-content-summarizer)

`render.yaml` explicitly selects one **Free** Docker web service in Singapore. `Dockerfile.render` builds the existing frontend and runs Express plus one Gunicorn scraper worker in that service. The scraper binds only to loopback; only Express is public. MongoDB stays external and persistent. `server/host.js` stops both processes if either fails and forwards graceful termination. The original separate-service Compose deployment remains supported.

1. Create or reuse a **MongoDB Atlas Free (M0)** cluster. Do not choose Flex, a dedicated cluster, or paid backups. Create a database user limited to `readWrite` on the application database. Include that database name in its authenticated connection URI. Preserve any existing database and records; switching databases does not migrate old data automatically.
2. Create a **free-tier Gemini API key** in [Google AI Studio](https://aistudio.google.com/api-keys). Do not enable paid billing for this deployment. The configured `gemini-3.8-flash` model currently offers free-tier input/output within provider quotas; model access varies by key and region. The free tier may use submitted content to improve Google's products.
3. Sign in to Render and open the deployment link above. Review that the Blueprint creates exactly **one web service on the Free plan**, with no paid resource. Enter `MONGODB_URI` and `GEMINI_API_KEY` directly into Render's secret fields. Render generates independent session and scraper secrets; keep them stable to retain browser history. Never commit credentials or paste them into public issues.
4. In Atlas Network Access, allow the outbound IP ranges shown in your Render service's Connect panel. Avoid an unrestricted `0.0.0.0/0` rule. Then deploy/redeploy the service. The API uses Render's automatically supplied HTTPS origin; for a custom domain set `CLIENT_ORIGIN` to the exact HTTPS origin (or a comma-separated list including both domains).
5. Render assigns the actual `https://...onrender.com` link after creating the service. Check `/api/health`, submit a public article, reopen history, and confirm progress updates and deletion on that URL. Health checks cover MongoDB and Python, not Gemini key/model/quota access.

To stay at zero cost, keep Render and Atlas on their free plans, do not add a payment method or enable paid AI billing, and monitor all included quotas. Render grants 750 free instance hours per workspace each month, shared with any other free web services. It sleeps after 15 minutes of inactivity, and cold startup takes about a minute. Build/bandwidth limits also apply; without a payment method exhausted usage suspends the service or builds instead of billing. Atlas Free provides 0.5 GB storage and limited throughput. Free hosting is suitable for a small portfolio/hobby application and does not provide production availability guarantees. This configuration does not use a keep-alive workaround.

Auto-deploy is disabled to avoid unreviewed deployments of downstream copies. After future pushes, use Render's Manual Deploy for the intended commit. No live URL exists until the account setup and first deployment complete.

References: [Render free limits](https://render.com/docs/free), [Blueprint secrets](https://render.com/docs/blueprint-spec), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Production deployment

1. Build and run behind an HTTPS reverse proxy using `compose.yaml` (Docker Compose v2).
2. Create a root `.env` from `.env.example`. Configure a real authenticated MongoDB URI, Gemini key, two strong independent secrets, and your exact HTTPS `CLIENT_ORIGIN`.
3. Set `TRUST_PROXY` to the exact number of trusted proxy hops. Compose binds the API only to `127.0.0.1:5000`; keep it inaccessible except through your reverse proxy.
4. Run `docker compose up --build -d`. Scraper startup requires a service token of at least 32 characters. API startup requires MongoDB and valid production configuration.
5. Check `/api/health`: it returns 200 only when MongoDB is connected and the scraper health request succeeds. It does not spend Gemini credits or validate the API key against the provider.
6. Perform a real article submission with your key before exposing the application to users. Set billing/quota controls with the provider.

The multi-stage API image includes the built frontend, runs as the `node` user, and installs only production dependencies. The scraper runs as a separate unprivileged Gunicorn process. Compose exposes no scraper port and contains no bundled unauthenticated database.

Example reverse-proxy location (substitute your configured upstream):

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 125s;
}
```

Deploy **one API process/replica** with this version: SSE connections, concurrency control and rate limits live in that process. Before horizontal scaling, add a shared event transport and shared limiter, plus a durable job queue if requests must survive restarts. The current synchronous workflow survives a dropped SSE connection through the POST response and history refresh; in-flight work is not durable across process termination.

The frontend defaults to same-origin API requests. Optional `VITE_API_URL` may point to another same-site API origin; add its exact frontend origin to `CLIENT_ORIGIN`. Cookies use `SameSite=Lax`; unrelated cross-site frontend/backend domains are not supported by this configuration.

## API

Bootstrap `/api/session` before concurrent API calls to establish the browser cookie. Every API mutation must include `X-Requested-With: WebContentSummarizer`; browser origins must be explicitly allowed. Cookies are signed, HttpOnly, and Secure in production, and expire after 30 days. This is anonymous browser authentication, not a login/account system. Clearing or losing the cookie loses access to that session's records.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Database + scraper readiness |
| GET | `/api/session` | Establish private browser session |
| GET | `/api/events` | Owner-scoped SSE; ready event, progress events and heartbeat |
| POST | `/api/summaries` | `{ "url": "https://...", "requestId": "optional-UUID" }`; returns 201 after persistence |
| GET | `/api/summaries?limit=20&cursor=...` | Array of summaries; next cursor in `X-Next-Cursor` |
| GET | `/api/summaries/:id` | Owner-scoped detail |
| DELETE | `/api/summaries/:id` | Owner-scoped deletion |

`limit` is 1–50. Progress stages are `extracting`, `summarizing`, `saving`, `complete`, `failed`, and `deleted`. EventSource reconnects automatically; the frontend reloads history on connection recovery. Events are transient, with no replay log. Errors include a safe `message`, `code`, and request ID. Raw article content and ownership IDs are excluded from all summary responses.

## Data compatibility and privacy

The MongoDB collection remains `summaries`. Fields are additive and the history index is `{ ownerId: 1, createdAt: -1, _id: -1 }`; startup does not drop collections or modify existing records. Older documents without `ownerId` remain in the database but are not visible to anonymous sessions. Back them up and explicitly assign ownership under your own migration policy; do not expose them publicly or assign them automatically to the first visitor.

Source text is sent to Gemini for summarization and retained in MongoDB. Article extraction is limited to 50,000 characters, with a 2 MiB HTML fetch limit. Only public HTTP(S) targets on ports 80/443 are accepted. Every redirect is checked, and the connection is pinned to a validated public IP while retaining TLS hostname verification. Internal addresses, reserved addresses, credentials, compressed responses, and unsupported content types are rejected. JavaScript-rendered, authenticated, paywalled and bot-protected sites may not yield readable content; there is no bypass.

Logs contain request IDs, methods, statuses and timings, not submitted URLs, article text, API keys or cookies. Database access, backups and retention should be configured for your deployment. Deleting a summary removes the active database record; backup retention is controlled externally. AI output is treated as text and validated before saving; readers should still verify important claims against the source.

## Verification

```bash
npm run lint --prefix server
npm run lint --prefix client
npm test --prefix server
pytest tests/test_scraper.py -q
npm run build --prefix client
```

The core tests isolate external services. Real MongoDB integration uses an ephemeral `mongod` process and never connects to the application database:

```bash
npm run test:db --prefix server
npm run test:host --prefix server
```

These integration commands download MongoDB 8.0.17 on their first run. `test:host` also needs Gunicorn in the Python environment (set `PYTHON_BIN` to the virtual environment’s Python executable if necessary), a built frontend, and a free loopback port 5001. It checks real combined-service startup and graceful shutdown using a test provider key; it does not call Gemini. Set `MONGOMS_VERSION` / `MONGOMS_DISTRO` if a different compatible test binary is needed. On Windows PowerShell:

```bash
$env:RUN_DB_TESTS = "1"
node --test tests/database.test.js
```

Browser tests serve the production build through the actual Express app, with deterministic article/AI and database fixtures **only in `tests/ui-server.js`**:

```bash
cd client
npx playwright install chromium
npm test
```

These cover creation, backend progress events, cross-tab history, browser-session persistence and isolation, search, copy, text download, deletion, failures, keyboard access and desktop/tablet/mobile overflow, and automated WCAG A/AA scans. They do not prove live Gemini generation. CI also runs dependency audits:

```bash
npm audit --prefix server --audit-level=high
npm audit --prefix client --audit-level=high
pip-audit -r scraper/requirements.txt
```

See `DELIVERY.md` for the checks actually run on the delivered version and remaining deployment/Git requirements.

## Git delivery

The existing repository is [muthyalamaheshkumar8-debug/intelligent-web-content-summarizer](https://github.com/muthyalamaheshkumar8-debug/intelligent-web-content-summarizer), on `main`. The uploaded archive contains no `.git` metadata. GitHub access was subsequently connected, and the remote branch was verified against the archive's original commit `054452fbf6578a5d14742c71204f04ce60847340`. Changes are applied as a normal child commit on that branch, preserving history and the repository name. No branch rename, force push, or replacement repository is needed.

For future local work, use the existing checkout and remote, inspect `git status` and `git diff`, stage only intended source files, and never commit `.env`, credentials, dependencies, or build output. The original archive delta in `review/changes.patch` is for offline review only; it predates the subsequent free-hosting additions and must not be reapplied over the completed GitHub changes.

## License

MIT. The original architecture illustration is preserved at `dd754dd7-fa95-4299-8771-f9192f245473.png`.

## Integration references

- [Gemini structured output and API-key authentication](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini model availability](https://ai.google.dev/gemini-api/docs/models) — configure a model available to your key; the default is `gemini-3.8-flash`.
- [Vite runtime requirements](https://vite.dev/guide/)
