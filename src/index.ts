import {
  ManagedContainer,
  startSafely,
} from "signalk-container-helper";
import type { Plugin, ServerAPI } from "@signalk/server-api";
import type { Request, Response as ExpressResponse } from "express";

const PLUGIN_ID = "signalk-mcp-container";
const IMAGE = "ghcr.io/boathacks/signalk-mcp-server-container";
const MCP_PORT = 8000;

interface McpContainerConfig {
  imageTag?: string;
  signalkHost?: string;
  signalkPort?: number;
  signalkTls?: boolean;
  executionMode?: "code" | "tools" | "hybrid";
  signalkToken?: string;
}

export default function (app: ServerAPI): Plugin {
  let container: ManagedContainer | null = null;

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: "MCP Server (container)",
    description:
      "Runs signalk-mcp-server in a managed container, exposing SignalK data to MCP clients (e.g. Claude) over Streamable HTTP.",

    schema: () => ({
      type: "object",
      properties: {
        imageTag: {
          type: "string",
          title: "Image tag",
          default: "latest",
        },
        signalkHost: {
          type: "string",
          title: "SignalK host (as seen from inside the container)",
          default: "host.docker.internal",
        },
        signalkPort: {
          type: "number",
          title: "SignalK port",
          default: 3000,
        },
        signalkTls: {
          type: "boolean",
          title: "Connect over TLS (wss/https)",
          default: false,
        },
        executionMode: {
          type: "string",
          title: "Execution mode",
          enum: ["code", "tools", "hybrid"],
          default: "code",
        },
        signalkToken: {
          type: "string",
          title: "SignalK access token (optional)",
          description:
            "Bearer token sent as 'Authorization: Bearer <token>' on every " +
            "request to SignalK. Only needed if SignalK's security rejects " +
            "anonymous reads — generate a device access token under " +
            "Server → Security → Devices, or leave blank if you've enabled " +
            "'Allow readonly access to API and WS without login' instead.",
        },
      },
    }),

    uiSchema: () => ({
      signalkToken: { "ui:widget": "password" },
    }),

    start(rawConfig: McpContainerConfig) {
      container = new ManagedContainer({
        app,
        pluginId: PLUGIN_ID,
        name: "mcp-server",
        image: IMAGE,
        defaultTag: "latest",
        buildConfig: (tag) => ({
          image: IMAGE,
          tag,
          signalkAccessiblePorts: [MCP_PORT],
          env: {
            SIGNALK_HOST: rawConfig?.signalkHost ?? "host.docker.internal",
            SIGNALK_PORT: String(rawConfig?.signalkPort ?? 3000),
            SIGNALK_TLS: String(rawConfig?.signalkTls ?? false),
            EXECUTION_MODE: rawConfig?.executionMode ?? "code",
            // Always present (even empty) so drift detection sees a stable
            // key set across ensureRunning calls regardless of whether a
            // token is configured — see signalk-mcp-server's
            // SIGNALK_TOKEN / "Authorization: Bearer <token>" support.
            SIGNALK_TOKEN: rawConfig?.signalkToken ?? "",
          },
          restart: "unless-stopped",
          resources: {
            cpus: 1,
            memory: "512m",
          },
        }),
        readiness: { port: MCP_PORT, path: "/healthz" },
        updates: {
          versionSource: { githubReleases: "boathacks/signalk-mcp-container" },
          currentTag: () => rawConfig?.imageTag ?? "latest",
        },
      });

      startSafely(app, async () => {
        await container?.start(rawConfig?.imageTag);
        app.setPluginStatus("Running");
      });
    },

    async stop() {
      await container?.stop();
      app.setPluginStatus("Stopped");
    },

    registerWithRouter(router) {
      // GET /plugins/signalk-mcp-container/api/status
      router.get("/api/status", (_req: Request, res: ExpressResponse) => {
        (async () => {
          const info = await container?.getInfo();
          if (!info || info.state !== "running") {
            res.status(503).json({ status: "not_running" });
            return;
          }
          res.status(200).json({
            status: "running",
            endpoint: container?.address ?? undefined,
            url: container?.address ?? undefined,
          });
        })();
      });

      // GET /plugins/signalk-mcp-container/api/versions
      router.get("/api/versions", (_req: Request, res: ExpressResponse) => {
        fetch(
          "https://api.github.com/repos/boathacks/signalk-mcp-container/releases?per_page=20",
        )
          .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
          .then((releases: Array<{ tag_name: string; prerelease: boolean }>) => {
            res.status(200).json({
              versions: releases.map((r) => ({
                tag: r.tag_name.replace(/^v/, ""),
                prerelease: r.prerelease,
              })),
              sources: { releases: "ok" },
            });
          })
          .catch(() => {
            res
              .status(200)
              .json({ versions: [], sources: { releases: "error" } });
          });
      });

      container?.registerUpdateRoutes(router, {
        onApplied: (requestedTag: string) => {
          const current = app.readPluginOptions() as { configuration?: object };
          app.savePluginOptions(
            { ...(current?.configuration ?? {}), imageTag: requestedTag },
            () => {},
          );
        },
      });

      // GET /plugins/signalk-mcp-container/api/self-test
      //
      // Reproduces, server-side, the exact sequence an MCP client (e.g. the
      // ollama plugin) runs against this container: initialize, wait, then
      // call execute_code. Diagnoses "SSE response carried no data frame"
      // by capturing raw status/headers/body at every step rather than
      // requiring someone to run curl by hand from a shell that can reach
      // the container. Query params: delayMs (default 35000, the observed
      // gap between a chat round's tool probe and the model actually
      // issuing the call) and code (default: fetch the vessel name).
      router.get("/api/self-test", (req: Request, res: ExpressResponse) => {
        void runSelfTest(req, res);
      });

      async function runSelfTest(
        req: Request,
        res: ExpressResponse,
      ): Promise<void> {
        const info = await container?.getInfo();
        if (!info || info.state !== "running" || !container?.address) {
          res.status(503).json({ error: "container is not running" });
          return;
        }
        const url = `${container.address}/mcp`;
        const delayMs = Number(req.query.delayMs ?? 35_000);
        const code =
          typeof req.query.code === "string"
            ? req.query.code
            : "(async () => { const v = await getVesselState(); return JSON.stringify({ name: v.data.name?.value }); })()";

        const steps: Array<Record<string, unknown>> = [];
        const describe = async (label: string, resp: Response) => {
          const bodyText = await resp.text();
          steps.push({
            step: label,
            status: resp.status,
            contentType: resp.headers.get("content-type"),
            mcpSessionId: resp.headers.get("mcp-session-id"),
            bodyLength: bodyText.length,
            body:
              bodyText.length > 4000
                ? `${bodyText.slice(0, 4000)}… [truncated]`
                : bodyText,
          });
          app.debug(
            `mcp self-test ${label}: HTTP ${resp.status}, ${bodyText.length} byte body`,
          );
          return bodyText;
        };

        try {
          const initResp = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "self-test", version: "1.0.0" },
              },
            }),
          });
          await describe("initialize", initResp);
          const sessionId = initResp.headers.get("mcp-session-id");

          if (sessionId) {
            const initdResp = await fetch(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                "mcp-session-id": sessionId,
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "notifications/initialized",
              }),
            });
            await describe("notifications/initialized", initdResp);
          }

          app.debug(
            `mcp self-test: waiting ${delayMs}ms before tools/call (reproduces the gap between a chat round's tool probe and the model's actual call)`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          const callHeaders: Record<string, string> = {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          };
          if (sessionId) callHeaders["mcp-session-id"] = sessionId;
          const callResp = await fetch(url, {
            method: "POST",
            headers: callHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "execute_code", arguments: { code } },
            }),
          });
          await describe("tools/call", callResp);

          res.status(200).json({ url, delayMs, sessionId, steps });
        } catch (err) {
          steps.push({ step: "error", error: String(err) });
          res.status(500).json({ url, delayMs, steps });
        }
      }
    },
  };

  return plugin;
}
