# Getting this plugin working end-to-end: a troubleshooting log

Bringing up `signalk-mcp-container` + `signalk-ollama` together — from first
install through a working `execute_code` tool call in the Ollama playground —
hit **three separate, unrelated failures** in sequence. Each one looked like
it could be the others' symptom, so this doc records the actual root cause
and fix for each, in the order they were hit, to save the next person (or
the next debugging session) from re-diagnosing them from scratch.

If you're here because something in this chain broke again, jump to the
matching symptom below.

## Summary table

| # | Symptom | Where it showed up | Root cause | Fixed in |
|---|---|---|---|---|
| 1 | `Startup failed: Failed to pull ghcr.io/boathacks/signalk-mcp-server-container:latest: Registry authentication failed.` | Signal K plugin startup (this plugin's `signalk-container` runtime) | GHCR container packages built via a workflow's `GITHUB_TOKEN` default to **private** regardless of the repo's own visibility | Manual, once — package settings ([below](#1-registry-authentication-failed-pulling-the-image)) |
| 2 | `🔧 error calling execute_code: MCP tools/call: SSE response carried no data frame` | signalk-ollama playground | signalk-ollama's MCP client only read the *first* SSE event of a Streamable HTTP response; a longer tool call streams progress notifications before the real result | [signalk-ollama v0.2.4](https://github.com/BoatHacks/signalk-ollama/releases/tag/v0.2.4) ([below](#2-sse-response-carried-no-data-frame-signalk-ollama-side)) |
| 3 | `Child exited: code=null, signal=SIGSEGV` on every `execute_code` call, container logs | This container (`signalk-mcp-container`) | `signalk-mcp-server`'s code-execution mode depends on `isolated-vm`, a native V8-isolate addon that segfaults under musl libc — the image was built on `node:20-alpine` | [v0.1.6](https://github.com/BoatHacks/signalk-mcp-container/releases/tag/v0.1.6) ([below](#3-execute_code-segfaults-sigsegv-this-container)) |
| 4 | `SignalK HTTP connection failed: HTTP 401: Unauthorized` in container logs; tool calls that touch real vessel data fail | This container | Signal K's security rejects anonymous reads; `signalk-mcp-server` does support a token (undocumented upstream) but this plugin didn't expose a way to set it yet | [v0.1.7](https://github.com/BoatHacks/signalk-mcp-container/releases/tag/v0.1.7) adds a token field; Signal K-side setup still needed either way ([below](#4-http-401-unauthorized-signal-k-security)) |

Issues 1, 3, and 4 are all fixed or worked around on the
`signalk-mcp-container` side; issue 2 lives in `signalk-ollama`'s MCP client
code and is included here because it was hit in the same debugging session
and is easy to mistake for a container-side problem.

---

## 1. "Registry authentication failed" (pulling the image)

**Symptom**, on Signal K plugin startup:

```
Startup failed: Failed to pull ghcr.io/boathacks/signalk-mcp-server-container:latest: Registry authentication failed.
```

**Root cause**: GHCR (`ghcr.io`) container packages pushed by a GitHub
Actions workflow using the default `GITHUB_TOKEN` are created **private** by
default — independent of whether the source repository itself is public.
An anonymous `docker pull` (which is what `signalk-container`'s runtime does
on the Signal K host) then gets rejected with an auth error rather than a
plain 404, which reads as a credentials problem even though nothing was ever
configured to require credentials.

Confirmed at the time by requesting an anonymous GHCR pull token directly:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  "https://ghcr.io/token?scope=repository:boathacks/signalk-mcp-server-container:pull&service=ghcr.io"
# HTTP_STATUS:401  <- private package
```

**Fix** (one-time, manual — package visibility can't be changed by a
workflow's own `GITHUB_TOKEN`):

1. **https://github.com/orgs/BoatHacks/packages/container/signalk-mcp-server-container/settings**
2. **Danger Zone → Change visibility → Public** → confirm.

If the **Public** radio button is greyed out with *"Setting is disabled by
organization administrators"*, the org itself is blocking public packages.
An org owner needs to unlock it first at
**https://github.com/organizations/BoatHacks/settings/packages** (the
"Package creation" / member-privileges section — exact wording varies by
GitHub UI version) before the per-package toggle becomes available.

No re-push is needed once visibility is changed — existing tags become
pullable immediately, and it stays public across future pushes to the same
package (visibility doesn't reset per-push).

**Verify**:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  "https://ghcr.io/token?scope=repository:boathacks/signalk-mcp-server-container:pull&service=ghcr.io"
# HTTP_STATUS:200  <- fixed
```

---

## 2. "SSE response carried no data frame" (signalk-ollama side)

**Symptom**, in the signalk-ollama playground, after tools/list succeeded
and a chat model requested a tool call:

```
🔧 error calling execute_code: MCP tools/call: SSE response carried no data frame
```

**Root cause**: this is a bug in `signalk-ollama`'s MCP client
(`src/mcp-client.ts`), not this container. The MCP Streamable HTTP transport
answers a request either with a single `application/json` body, or with a
`text/event-stream` carrying **one or more** SSE events — e.g. progress
notifications sent while a long-running tool (`execute_code` included) is
still working, followed eventually by the actual JSON-RPC response. The
client's original SSE parser only looked at the *first* event in the
stream. For a quick call that's also the only event, so it worked in
testing; for anything slower, the first event was a notification with no
matching response, and the client reported "no data frame" instead of
looking further.

**Fix**: parse every event in the SSE stream and pick the one whose `id`
matches the outstanding request, skipping notifications (which carry none).
Shipped in
[signalk-ollama v0.2.4](https://github.com/BoatHacks/signalk-ollama/releases/tag/v0.2.4)
(`src/mcp-client.ts`, `parseSseDataFrames` / the id-matching loop in
`postJsonRpc`). See that repo's `CHANGELOG.md` for the full entry and
`test/mcp-client.test.ts` for regression coverage (notification-before-
response and no-matching-frame cases).

Update `signalk-ollama` to `0.2.4` or later to pick up the fix.

---

## 3. `execute_code` segfaults (`SIGSEGV`) — this container

**Symptom**, in this container's logs, on *every* `execute_code` tool call
(visible via the plugin's container log stream, or `docker logs`):

```
[supergateway] StreamableHttp → Child: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_code", ...}}
[supergateway] Child exited: code=null, signal=SIGSEGV
[supergateway] StreamableHttp connection closed (session undefined)
```

The child process (`signalk-mcp-server`) is killed mid-request, so the
Streamable HTTP connection just drops — from the client's side this can
surface as a transport-level error rather than anything resembling a normal
JSON-RPC error response.

**Root cause**: `signalk-mcp-server`'s "code" execution mode (the default —
see `EXECUTION_MODE` below) runs submitted code inside a V8 isolate via
[`isolated-vm`](https://www.npmjs.com/package/isolated-vm), a native addon.
`isolated-vm` is
[widely reported](https://github.com/laverdet/isolated-vm/issues) to
segfault under **musl libc** — the C library Alpine Linux uses instead of
glibc. `docker/Dockerfile` built the image `FROM node:20-alpine`, so every
isolate creation was on borrowed time.

(An earlier fix in this same repo, v0.1.2, already suspected `isolated-vm`
as fragile — it added a build toolchain so the addon could compile from
source on `linux-arm64-musl` where no prebuilt binary exists. That fixed
*building* the image on arm64; it didn't fix musl's *runtime* segfault,
which affects amd64 too since prebuilt binaries exist for amd64-musl and
compile from source is not the failure mode here.)

**Fix**: `docker/Dockerfile` now builds `FROM node:20-bookworm-slim`
(Debian, glibc) instead of `node:20-alpine`. Debian also ships prebuilt
`isolated-vm` binaries for both `amd64` and `arm64`, so the build toolchain
(`python3 make g++`) is now only a source-compile fallback rather than a
requirement, and the healthcheck's `wget` is installed explicitly (Debian
slim images don't include it by default, unlike Alpine).
Shipped in [v0.1.6](https://github.com/BoatHacks/signalk-mcp-container/releases/tag/v0.1.6).

**Verify**: the `docker-smoke-test` job added to `.github/workflows/test.yml`
in the same release builds the real image, starts it, and drives a full MCP
handshake plus one `execute_code` call through the HTTP endpoint on every
push — this is the check that would have caught the original bug before it
shipped, since `npm test` only typechecks the plugin code and never touches
the container image. If this ever regresses, that job's log is the first
place to look; a passing `execute_code` call there before a release is the
strongest signal the fix is intact for whatever base image is in use.

---

## 4. `HTTP 401: Unauthorized` (Signal K security)

**Symptom**, in this container's logs:

```
[supergateway] Child stderr: SignalK HTTP connection failed: HTTP 401: Unauthorized
Failed to connect to SignalK: Failed to connect to SignalK server: HTTP 401: Unauthorized
```

Note `tools/list` still succeeds even with this error present (the tool
*definitions* don't require a live Signal K connection) — it's only calls
that actually touch vessel data (e.g. `getVesselState()` inside
`execute_code`) that fail. This can make the 401 easy to miss until a real
data-fetching call is attempted.

**Root cause**: `signalk-mcp-server` connects to Signal K as a plain
external HTTP/WS client, and if Signal K's security is enabled and rejects
anonymous reads, every data-fetching call fails this way.

Earlier revisions of this doc said `signalk-mcp-server` had no way to
authenticate at all — that was wrong. Its README doesn't document it, but
the actual source (`src/signalk-client.ts` in
[VesselSense/signalk-mcp-server](https://github.com/VesselSense/signalk-mcp-server),
the code behind the npm package this container installs) **does** support a
`SIGNALK_TOKEN` environment variable, sent as `Authorization: Bearer
<token>` on every request. Their `CHANGELOG.md` confirms it as a real,
tested feature ("Fixed token authentication for remote SignalK servers
(#5)... Tested with remote servers accessed via HTTP"), landed in the exact
version (`1.0.8`) this container's `docker/Dockerfile` pins.

**Fix — two options, in order of preference:**

1. **Recommended: give the container a token, keep Signal K locked down.**
   Since `signalk-mcp-container` v0.1.7, the plugin config has a **"SignalK
   access token"** field (config panel → the standard settings form above
   the custom panel). Generate a token under **Server → Security →
   Devices**, paste it in, save — the plugin threads it through to the
   container as `SIGNALK_TOKEN`. Signal K's security stays fully enabled;
   only this container gets read access.
2. **Fallback (no token management, weaker): allow anonymous reads.**
   **Server → Security → Access Control** → enable **"Allow readonly access
   to API and WS without login"**. This lets *any* client read vessel data
   without a login, not just this container — leaves write access (and the
   rest of Signal K's security) untouched, but is broader than option 1.

---

## Related, non-blocking oddity

Container logs also show, on every startup, lines like:

```
Failed to load resource signalk-overview.json: ENOENT: no such file or directory, open '/usr/local/lib/node_modules/signalk-mcp-server/resources/signalk-overview.json'
```

This is an upstream `signalk-mcp-server` packaging issue (some bundled
reference-doc JSON files aren't present in the published npm package) and is
harmless — the server logs the failure and continues; `tools/list` and
`execute_code` both work regardless. Not addressed here since it's neither
this plugin's code nor something plugin-side configuration can fix.
