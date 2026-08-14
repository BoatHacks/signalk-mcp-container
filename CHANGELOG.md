# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
