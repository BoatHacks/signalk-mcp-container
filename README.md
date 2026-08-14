# signalk-mcp-container

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

The admin UI panel shows container status, lets you pick an image tag, and
apply updates — all via `signalk-container-helper`'s reusable UI components.

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
