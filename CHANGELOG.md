# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.14] - 2026-08-16

### Added

- `/api/self-test`'s response now includes `containerLogTail` (last 60 log
  lines) alongside the request/response steps. An empty-but-200
  `text/event-stream` body on `tools/call` is exactly what supergateway
  produces when the `signalk-mcp-server` child process (spawned once per
  session) dies mid-request — its `exit` handler closes the transport
  without ever writing a data frame. If that's what's happening, the log
  tail should show a line like `Child exited: code=..., signal=SIGSEGV`
  right around the failed call, confirming it without a separate `docker
  logs` round trip.

## [0.1.13] - 2026-08-16

### Added

- `GET /plugins/signalk-mcp-container/api/self-test` — a diagnostic route
  that reproduces, server-side, the exact `initialize` → wait → `tools/call
  execute_code` sequence an MCP client runs, and returns the raw
  status/headers/body captured at each step. Meant for diagnosing the
  "SSE response carried no data frame" failure (see this repo's
  [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)) without needing shell access
  to the box running the container — hit the
  URL from a browser or `curl` on the SignalK host itself. Accepts optional
  `delayMs` (default 35000, matching the observed gap between a chat
  round's tool probe and the model's actual call) and `code` query params.

## [0.1.12] - 2026-08-15

### Fixed

- The custom config panel never actually implemented input fields for
  SignalK host/port/TLS/execution mode — it just claimed they were
  "configured via the standard Plugin Config JSON schema fields above this
  panel," which was only true while the panel-loading bug (fixed in
  v0.1.10) meant the plain schema fallback form was the only thing anyone
  ever saw. Now that the real panel loads, those fields were genuinely
  missing from the UI — values were preserved under the hood (the Save
  handler spread the existing config), but there was no way to view or
  change them without editing the plugin's saved config JSON directly.
  Added proper fields for all four to the panel's "Settings" section, and
  removed the now-inaccurate hint text.

## [0.1.11] - 2026-08-15

### Fixed

- "Request via SignalK" button threw `crypto.randomUUID is not a
  function`. That API only exists in "secure contexts" (HTTPS, or
  `http://localhost`) and is simply absent when the Admin UI is loaded
  over plain HTTP on a LAN IP — the common case on a boat. The
  access-request `clientId` doesn't need to be cryptographically random,
  just distinct per request, so fall back to a `Math.random()`-based
  v4-UUID shape when `crypto.randomUUID` isn't available.

## [0.1.10] - 2026-08-15

### Fixed

- Config panel (status card, image-version dropdown, MCP tool connections
  UI, "Request via SignalK" token button, everything in
  `PluginConfigurationPanel.tsx`) never actually loaded on any Signal K
  server — since the plugin's first release — silently falling back to the
  plain JSON-schema form instead. Two bugs:
  1. `package.json`'s `keywords` never included
     `signalk-plugin-configurator`, the exact string signalk-server's
     `mountWebModules` filters installed plugins by
     (`interfaces/webapps.js`) to decide which ones even have a custom
     panel to try loading. Without it, the server never attempted to load
     this plugin's panel at all — no error, just silence.
  2. Even with that fixed, signalk-server only serves a plugin's panel
     bundle if it finds a `public/` directory directly under the package
     root (`fs.existsSync(webappPath + '/public/')`). The webpack config
     built the bundle to `dist/public/` instead of top-level `public/`, the
     wrong location for the server to find it at.

## [0.1.9] - 2026-08-15

### Added

- `docker/healthcheck.sh`, replacing the plain `wget .../healthz` Docker
  `HEALTHCHECK`. In addition to that liveness check (supergateway's HTTP
  layer is up), it now also probes the Signal K REST API directly with the
  container's configured `SIGNALK_HOST`/`PORT`/`TLS`/`TOKEN` settings, and
  reports unhealthy if that probe gets `401`. A missing or invalid
  `SIGNALK_TOKEN` is now flagged through the container's own health status
  (`docker inspect`/`docker ps`, and by extension the container manager)
  instead of only showing up in container logs or as a downstream
  `execute_code` failure. supergateway's own `/healthz` is a hardcoded
  static "ok" with no hook for this, so it needed a dedicated script.
- CI: `docker-smoke-test` now runs `healthcheck.sh` against a stub Signal K
  server (`.github/scripts/ci-stub-signalk.py`) and asserts it fails
  without a token / with a wrong token, and passes with the correct one.

## [0.1.8] - 2026-08-15

### Added

- Config panel: "Request via SignalK" button next to the SignalK access
  token field. Calls Signal K's standard access-request API
  (`POST /signalk/v1/access/requests`) and polls until an admin approves
  it under Server → Security → Access Requests, then fills the token in
  automatically — no manual token generation needed. This is the same
  device-pairing mechanism other Signal K client apps use, and a
  different code path from the Admin UI's broken "generate device token"
  wizard (`expiresIn` bug), so it isn't affected by that bug.

### Changed

- `TROUBLESHOOTING.md`: documents the self-service request flow as the
  primary fix for `HTTP 401: Unauthorized`, with manual token generation
  (CLI or existing device/user) and "allow readonly without login" as
  fallbacks.

## [0.1.7] - 2026-08-15

### Added

- New "SignalK access token" plugin setting, threaded through to the
  container as `SIGNALK_TOKEN`. `signalk-mcp-server` supports Bearer-token
  auth against Signal K (`Authorization: Bearer <token>`, undocumented in
  its own README but present in its source and CHANGELOG since `1.0.8`) —
  this lets the container work against a Signal K server with security
  fully enabled, instead of requiring "Allow readonly access without
  login" to be turned on for every client. Generate a token under
  Server → Security → Devices.

### Changed

- `TROUBLESHOOTING.md`: corrected the `HTTP 401: Unauthorized` section,
  which previously (incorrectly) stated `signalk-mcp-server` had no
  auth-token support at all. Now documents the token as the recommended
  fix, with "allow readonly without login" as a fallback.

## [0.1.6] - 2026-08-15

### Fixed

- `docker/Dockerfile`: every `execute_code` tool call crashed the
  container's MCP process with `SIGSEGV` (killing the session mid-request).
  Root cause: `signalk-mcp-server`'s "code" execution mode depends on
  `isolated-vm`, a native V8-isolate addon that is known to segfault under
  musl libc — the image was built on `node:20-alpine`. Switched the base
  image to `node:20-bookworm-slim` (glibc); `execute_code` no longer
  crashes the process.
- CI: added a Docker build + smoke test (`docker-smoke-test` job in
  `test.yml`) that builds the real image and calls `execute_code` through
  it — `npm test` only typechecks the plugin and never caught this, since
  the crash lives entirely inside the container image.

### Changed

- README: documented that Signal K's "Allow readonly access to API and WS
  without login" security setting must be enabled for this container to
  reach vessel data — `signalk-mcp-server` has no auth-token support of its
  own, so a secured Signal K server otherwise answers every request with
  `HTTP 401: Unauthorized`.

## [0.1.5] - 2026-08-14

### Changed

- README: added an "Updating" section explaining that a new image tag
  doesn't take effect on an already-running container until it's
  recreated (via the admin UI's update controls, or a plugin restart) —
  a plain `podman pull`/`docker pull` only refreshes the local image
  cache and can look like an update silently failed.

## [0.1.4] - 2026-08-14

### Fixed

- `docker/Dockerfile`: the container failed to start —
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yargs' imported from
  /usr/local/bin/supergateway`. The 0.1.2 multi-arch fix had moved the
  `npm install -g` into a separate builder stage and copied only
  `node_modules` plus the two bin symlinks into the final image, which
  didn't reliably preserve npm's hoisted dependency layout. Reverted to
  installing (and then removing the build toolchain) in a single stage.

## [0.1.3] - 2026-08-14

### Fixed

- `package.json`: `repository.url` used the wrong case (`boathacks` instead
  of `BoatHacks`), which npm's sigstore provenance verification rejects on
  publish (`Failed to validate repository information`). This blocked
  every CI-driven npm publish until fixed here.

## [0.1.2] - 2026-08-14

### Fixed

- `docker/Dockerfile` / `docker-publish.yml`: build and publish the
  container image multi-arch (`linux/amd64`, `linux/arm64`). The published
  image previously only had an amd64 manifest, so it failed to pull on
  arm64 hosts (e.g. Raspberry Pi). The Dockerfile now uses a builder stage
  with a full toolchain (python3/make/g++) since `signalk-mcp-server`'s
  `isolated-vm` dependency (a native addon) may not have prebuilt
  binaries for `linux-arm64-musl` and would otherwise fail to compile on
  Alpine's minimal image.

## [0.1.1] - 2026-08-14

### Changed

- README: documented signalk-ollama as a ready-made MCP client for this
  container's default endpoint (`http://localhost:8000/mcp`).

## [0.1.0] - 2026-08-14

### Added

- Initial release: SignalK plugin that runs
  [signalk-mcp-server](https://github.com/VesselSense/signalk-mcp-server) as a
  managed container via
  [signalk-container-helper](https://github.com/hoeken/signalk-container-helper).
- `docker/Dockerfile` builds `ghcr.io/boathacks/signalk-mcp-server-container`,
  wrapping the upstream stdio-only MCP server with `supergateway` to expose
  Streamable HTTP (`/mcp`) and a `/healthz` health endpoint.
- Admin UI configuration panel (Module Federation remote) with container
  status, version selection, and update controls.
- CI: typecheck/build on PRs, npm OIDC-based publish on GitHub release,
  and Docker image build/push to GHCR on `v*` tags.
