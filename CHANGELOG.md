# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
