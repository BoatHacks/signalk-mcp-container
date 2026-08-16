# signalk-mcp-container

> **⚠️ Deprecated.** This plugin was an experiment in running
> `signalk-mcp-server` as a managed container (bridging its stdio-only MCP
> transport to HTTP via `supergateway`, wired up through
> `signalk-container-helper`). In practice it didn't work out — a string of
> architecture-, packaging-, and runtime-level issues (multi-arch image
> builds, npm trusted-publishing, `isolated-vm`/Alpine segfaults, stale
> container recreation, SignalK auth) made it a poor fit for this approach.
> This repo is no longer maintained. Use
> [`signalk-voice-llm`](https://github.com/dirkwa/signalk-voice-llm)
> instead.

A [SignalK](https://signalk.org) server plugin that runs
[signalk-mcp-server](https://github.com/VesselSense/signalk-mcp-server) as a
**managed container**, so an MCP client (e.g. Claude Desktop, or any other
[Model Context Protocol](https://modelcontextprotocol.io) client) can connect
to this vessel's SignalK data over the network — no manual container/process
babysitting, no local npx invocation on every client.

It's built on [`signalk-container-helper`](https://github.com/hoeken/signalk-container-helper)
(requires the [`signalk-container`](https://github.com/hoeken/signalk-container)
plugin to be installed, which supplies the podman/docker runtime integration),
and ships an admin-UI configuration panel for status, version selection and
updates.

## Why a container image is built here, not upstream

`signalk-mcp-server` is a stdio-only MCP server (built for a client to spawn
it as a subprocess, e.g. via `npx`) — it has no HTTP transport, no Dockerfile,
and no health endpoint. `signalk-container-helper`'s `ManagedContainer`
expects an HTTP-reachable, health-checkable service. To bridge that gap, the
image built from [`docker/Dockerfile`](docker/Dockerfile) wraps
`signalk-mcp-server` with [`supergateway`](https://github.com/supercorp-ai/supergateway),
exposing it as Streamable HTTP on `/mcp` with a `/healthz` health endpoint.
The image is published to `ghcr.io/boathacks/signalk-mcp-server-container`.

## Install

From the SignalK admin UI **Appstore**, search for `signalk-mcp-container`
and install (requires the `signalk-container` plugin already installed and a
container runtime — podman or docker — available on the host). Or:

```bash
npm install signalk-mcp-container
```

then restart the server and enable the plugin from **Server → Plugin Config**.

## Configuration

| Setting | Description | Default |
|---|---|---|
| Image tag | Version of `signalk-mcp-server-container` to run | `latest` |
| SignalK host | Hostname the container uses to reach this SignalK server | `host.docker.internal` |
| SignalK port | Port the container uses to reach this SignalK server | this server's port |
| SignalK TLS | Connect over `wss`/`https` | `false` |
| Execution mode | `code` \| `tools` \| `hybrid` (see [signalk-mcp-server docs](https://github.com/VesselSense/signalk-mcp-server)) | `code` |
| SignalK access token | Bearer token sent on every request to SignalK — only needed if SignalK's security rejects anonymous reads. Click **"Request via SignalK"** in the config panel to request one (approve it under Server → Security → Access Requests), or paste one in manually. See [Troubleshooting](TROUBLESHOOTING.md#4-http-401-unauthorized-signal-k-security). | none |

The admin UI panel shows container status, lets you pick an image tag, and
apply updates — all via `signalk-container-helper`'s reusable UI components.

### If Signal K has security enabled

`signalk-mcp-server` connects to Signal K as a plain external HTTP/WS
client — it has no concept of an auth token or API key (its docs describe
auth as "handled by binding layer", i.e. not by the server itself). If your
Signal K server has security enabled and rejects anonymous reads, tool calls
will fail with `SignalK HTTP connection failed: HTTP 401: Unauthorized` in
the container logs.

Fix: **Server → Security → Access Control**, enable **"Allow readonly
access to API and WS without login"**. That lets the container read vessel
data without a login while leaving write access (and the rest of security)
untouched. There is currently no way to give it a token instead — that would
require upstream support in `signalk-mcp-server` itself.

## Updating

A new image tag being published to GHCR does **not** by itself update an
already-running container — a floating tag like `latest` only takes effect
the next time the container is actually recreated. `podman pull` /
`docker pull` alone just refreshes the local image cache; the existing
container, if one is already running, keeps running from whatever image it
was originally created with.

To pick up a new image, use the admin UI panel's **update** controls (which
call `signalk-container-helper`'s update/apply routes and recreate the
container), or restart the `signalk-mcp-container` plugin from **Server →
Plugin Config**. A manual `podman pull` followed by just restarting the
existing container (without recreating it) will keep running the old image
and can look like the update silently failed.

## Connecting an MCP client

Once running, point an MCP client capable of Streamable HTTP transport at:

```
http://<signalk-host>:8000/mcp
```

(The port is only reachable as configured by `signalk-container`'s exposed
ports; check that plugin's settings if the endpoint isn't reachable from
where you expect.)

[**signalk-ollama**](https://github.com/BoatHacks/signalk-ollama) is a
ready-made client: install it alongside this plugin and its chat traffic
(including its own playground webapp) picks up this container as its
default MCP connection at `http://localhost:8000/mcp` automatically — no
extra configuration needed as long as it's running on the default port.

## Troubleshooting

Hit a registry auth error pulling the image, a `SIGSEGV` on `execute_code`
calls, an `HTTP 401` from Signal K, or an `SSE response carried no data
frame` error in signalk-ollama's playground? All four are documented, with
root causes and fixes, in [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).

## Development

```bash
npm install
npm run build   # tsc (plugin) + webpack (admin UI panel)
npm test        # typecheck
```

To build/push the container image locally:

```bash
docker build -t ghcr.io/boathacks/signalk-mcp-server-container:dev -f docker/Dockerfile .
```

### Releases

- **Plugin package** (`signalk-mcp-container` on npm): tag-triggered via
  `.github/workflows/publish.yml`, using npm OIDC trusted publishing.
- **Container image** (`ghcr.io/boathacks/signalk-mcp-server-container`):
  built and pushed by `.github/workflows/docker-publish.yml` on `v*` tags.
  `v1.2.3` publishes `1.2.3` + `latest`; `v1.2.3-alpha.1` publishes
  `1.2.3-alpha.1` + `alpha`.

## License

MIT
