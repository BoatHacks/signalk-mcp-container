import {
  ManagedContainer,
  startSafely,
} from "signalk-container-helper";
import type { Plugin, ServerAPI } from "@signalk/server-api";
import type { Request, Response } from "express";

const PLUGIN_ID = "signalk-mcp-container";
const IMAGE = "ghcr.io/boathacks/signalk-mcp-server-container";
const MCP_PORT = 8000;

interface McpContainerConfig {
  imageTag?: string;
  signalkHost?: string;
  signalkPort?: number;
  signalkTls?: boolean;
  executionMode?: "code" | "tools" | "hybrid";
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
      },
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
      router.get("/api/status", (_req: Request, res: Response) => {
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
      router.get("/api/versions", (_req: Request, res: Response) => {
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
    },
  };

  return plugin;
}
