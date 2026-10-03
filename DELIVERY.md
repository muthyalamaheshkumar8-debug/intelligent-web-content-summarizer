# Delivery review — 3 October 2026

The existing React/Express/MongoDB/Python application was edited in place. The original name, folder structure, license and architecture illustration were preserved. The source improvements include production configuration and a free Render deployment Blueprint. A live deployment still requires the owner’s Render account, Atlas connection URI and Gemini key. No live deployment has been verified.

## Improvements

- Replaced the minimal page with a responsive reading workspace, private searchable history, source links, copy and text download, deletion confirmation, keyboard navigation, and meaningful empty/error/loading states.
- Added the missing Vite HTML entry and favicon; production assets are served by Express. Assets have immutable caching and the entry document does not.
- Corrected Gemini API-key authentication and structured JSON generation, separated source text from instructions, and validated output before saving.
- Secured extraction with HTTP(S)/port checks, public-IP validation, redirect revalidation, DNS pinning, TLS hostname checks, bounded HTML/content size, and timeouts.
- Added signed browser-session cookies, owner-scoped database operations, CSRF/origin controls, rate/concurrency limits, security headers, body limits, safe errors and request-ID logging.
- Added real owner-scoped SSE stage events and cross-tab history synchronization, with reconnection and heartbeat handling. Production contains no simulated AI or live data.
- Added stable cursor pagination and an additive history index. No existing MongoDB records were deleted or reassigned.
- Updated dependencies, lockfiles for reproducible installs, lint configurations, integration/browser tests, container definitions and CI workflow. Replaced vulnerable nodemon with Node's built-in watcher; upgraded Tailwind to its current PostCSS integration.

## Checks actually run

| Check | Result |
| --- | --- |
| API/service/SSE and host lifecycle tests | 21 passed; database and host integration are separate opt-in commands |
| Real MongoDB integration | 1 passed with MongoDB 8.0.17: CRUD, session isolation, persisted data, stable pagination including equal timestamps |
| Python scraper tests | 29 passed |
| Frontend lint | Passed |
| Backend and test lint | Passed |
| Production frontend build | Passed; JS approximately 208 kB / 70 kB gzip, CSS approximately 21 kB / 6 kB gzip |
| Node dependency audits | No known vulnerabilities in server or client at check time |
| Python dependency audit | No known vulnerabilities in scraper requirements at check time |
| Express startup + graceful shutdown | Passed against an ephemeral real MongoDB database with a test provider key; no live AI request made |
| Flask development startup | Health endpoint returned 200 |
| Gunicorn production startup | Health endpoint returned 200 with service authentication |
| Combined free-host startup + shutdown | 5 passed: actual Express, built frontend, real MongoDB, authenticated Gunicorn, secure cookie, graceful shutdown and failure lifecycle |
| Docker image/Compose execution | Not run: Docker is unavailable in this environment |
| Live public article extraction | Could not verify: external hostname resolution is restricted; the service returned safe 422 `The article hostname could not be resolved.` |
| Live Gemini generation | Not run: no real API key was supplied |
| Browser workflows | 8 of 8 checks passed, each in an isolated Chromium headless process |
| Accessibility scans | No automated WCAG A/AA violations on the empty workspace or generated summary |
| Responsive checks | No horizontal overflow at 1440 px, 768 px or 390 px; desktop/mobile screenshots visually reviewed |

The standard Chromium download failed through the environment's CDN route. A local headless-shell fallback with software rendering and one process was used for these checks; each check ran separately because this environment restricts Unix sockets and the fallback cannot reliably reuse browser contexts. Browser tests used the built frontend and actual Express routes/SSE with deterministic external-service/database fixtures. The real MongoDB checks were run separately. They do not establish live Gemini success or Docker deployment.

Test screenshots and a machine-readable browser verification record are included in `review/`.

## Deployment requirements and limits

Configure an authenticated MongoDB URI, Gemini API key/model access, independent strong session and scraper secrets, exact HTTPS origin and trusted proxy count. Confirm public DNS/HTTPS egress, then submit a real article before public release. The API's readiness endpoint checks MongoDB and the scraper; it does not verify Gemini billing/key/model access.

Use one API process/replica. Events, rate limits and concurrency state are in process; scaling needs shared infrastructure. Events are transient; POST responses and history refresh restore the interface after SSE loss, but in-flight work does not survive a process restart. Anonymous browser sessions have no cross-device account recovery and expire after 30 days. Older database records remain stored but need an explicit ownership migration before they can appear in the private history. JavaScript-only, compressed, protected and non-HTML pages may not be extractable.

## Git and free-hosting follow-up

GitHub write access was connected after the archive delivery. The existing repository and `main` were inspected, and the remote head matched the archive baseline `054452fbf6578a5d14742c71204f04ce60847340`. Source changes are delivered by a normal child commit and non-forced update of that same branch. Final commit and push confirmation are reported in the conversation after the remote update; no commit hash is fabricated here.

Added `render.yaml`, `Dockerfile.render`, and `server/host.js` for one explicitly free Render web service containing the existing Node/Python processes. Production origin validation supports Render's supplied HTTPS URL. Secrets are prompted/generated by the host and never stored in source. MongoDB Atlas and Gemini accounts remain external; their free tiers have storage, quota and availability limits documented in the README. Account credentials are unavailable in this workspace, so the first live deployment and real Gemini request remain unverified.

The original archive review patch remains an offline artifact and predates these follow-up additions. Do not apply it again after pulling the completed changes.
