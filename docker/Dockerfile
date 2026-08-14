# Wraps signalk-mcp-server (stdio-only MCP server, no HTTP transport upstream)
# with supergateway so it can run as a long-lived, network-reachable service
# under signalk-container-helper's ManagedContainer (HTTP readiness/health checks).
#
# Built multi-arch (linux/amd64, linux/arm64). signalk-mcp-server depends on
# isolated-vm, a native addon: its prebuilt binaries may not cover
# linux-arm64-musl, in which case npm falls back to compiling from source, so
# a toolchain (python3/make/g++) is installed for the npm install and removed
# right after — a multi-stage COPY of just node_modules + bin symlinks was
# tried first but broke npm's hoisted dependency resolution (supergateway's
# own "yargs" dependency went missing at runtime); installing and stripping
# in place avoids that entirely.
FROM node:20-alpine

ARG MCP_SERVER_VERSION=1.0.8
ARG SUPERGATEWAY_VERSION=3.4.3

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install -g \
        signalk-mcp-server@${MCP_SERVER_VERSION} \
        supergateway@${SUPERGATEWAY_VERSION} \
    && apk del .build-deps \
    && adduser -D -H mcp

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
