# Wraps signalk-mcp-server (stdio-only MCP server, no HTTP transport upstream)
# with supergateway so it can run as a long-lived, network-reachable service
# under signalk-container-helper's ManagedContainer (HTTP readiness/health checks).
#
# Built multi-arch (linux/amd64, linux/arm64), on a glibc base (NOT Alpine):
# signalk-mcp-server's "code" execution mode depends on isolated-vm, a native
# V8-isolate addon that is known to segfault under musl libc (Alpine) — every
# execute_code tool call crashed the child process (SIGSEGV) on the Alpine
# build. Debian's glibc doesn't have that problem, and also ships prebuilt
# isolated-vm binaries for both amd64 and arm64, so a toolchain
# (python3/make/g++) is only needed as a source-compile fallback and is
# removed right after — a multi-stage COPY of just node_modules + bin
# symlinks was tried first but broke npm's hoisted dependency resolution
# (supergateway's own "yargs" dependency went missing at runtime); installing
# and stripping in place avoids that entirely.
FROM node:20-bookworm-slim

ARG MCP_SERVER_VERSION=1.0.8
ARG SUPERGATEWAY_VERSION=3.4.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ wget \
    && npm install -g \
        signalk-mcp-server@${MCP_SERVER_VERSION} \
        supergateway@${SUPERGATEWAY_VERSION} \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home --shell /usr/sbin/nologin mcp

ENV SIGNALK_HOST=host.docker.internal \
    SIGNALK_PORT=3000 \
    SIGNALK_TLS=false \
    EXECUTION_MODE=code \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

USER mcp

ENTRYPOINT ["sh", "-c", "exec supergateway \
    --stdio \"signalk-mcp-server\" \
    --outputTransport streamableHttp \
    --stateful \
    --streamableHttpPath /mcp \
    --healthEndpoint /healthz \
    --port \"${PORT}\" \
    --logLevel info"]
