#!/bin/sh
# Docker HEALTHCHECK for this container. Checks two things:
#
# 1. supergateway's own /healthz — the HTTP/MCP layer is up and accepting
#    connections. This is the only thing the previous healthcheck verified;
#    it says nothing about whether signalk-mcp-server can actually reach
#    SignalK, since supergateway's /healthz is a hardcoded static "ok"
#    response with no hook for custom logic.
# 2. A direct probe of the SignalK REST API using the exact same connection
#    settings (SIGNALK_HOST/PORT/TLS/TOKEN) this container was configured
#    with. A misconfigured or missing SIGNALK_TOKEN against a SignalK
#    server that requires auth answers this with HTTP 401 — surfaced here,
#    through the container manager's health endpoint, instead of only
#    showing up later as an opaque "execute_code" tool-call failure.
#
# Exits non-zero (unhealthy) if either check fails. set -e means the first
# failing command aborts the script with its own exit status.
set -eu

wget -qO- --timeout=3 "http://127.0.0.1:${PORT}/healthz" >/dev/null

proto="http"
if [ "${SIGNALK_TLS:-false}" = "true" ]; then
  proto="https"
fi

url="${proto}://${SIGNALK_HOST}:${SIGNALK_PORT}/signalk/v1/api/vessels/self"

if [ -n "${SIGNALK_TOKEN:-}" ]; then
  wget -qO- --timeout=3 --header="Authorization: Bearer ${SIGNALK_TOKEN}" "$url" >/dev/null
else
  wget -qO- --timeout=3 "$url" >/dev/null
fi
