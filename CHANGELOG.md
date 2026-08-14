# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
