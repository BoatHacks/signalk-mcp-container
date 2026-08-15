import React, { useEffect, useRef, useState } from "react";
import {
  panelStyles as S,
  SectionTitle,
  StatusCard,
  FieldRow,
  VersionSelect,
  UpdateControls,
  CollapsibleSection,
  ActionStatus,
  Button,
  useStatusPoll,
  useVersions,
} from "signalk-container-helper/ui";

const BASE = "/plugins/signalk-mcp-container";

/** How long to keep polling a pending access request before giving up. */
const ACCESS_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const ACCESS_REQUEST_POLL_MS = 2000;

interface AccessRequestResponse {
  state?: "PENDING" | "COMPLETED";
  href?: string;
  accessRequest?: {
    permission?: "APPROVED" | "DENIED";
    token?: string;
  };
}

/**
 * `crypto.randomUUID()` only exists in "secure contexts" (HTTPS, or
 * http://localhost) — it's simply undefined when the Admin UI is loaded
 * over plain HTTP on a LAN IP, which is the common case on a boat. The
 * access-request clientId doesn't need to be cryptographically random,
 * just distinct per request, so fall back to a plain Math.random() v4-UUID
 * shape instead of failing the request outright.
 */
function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface PluginConfiguration {
  imageTag?: string;
  signalkHost?: string;
  signalkPort?: number;
  signalkTls?: boolean;
  executionMode?: string;
  signalkToken?: string;
}

interface PanelProps {
  configuration?: PluginConfiguration;
  save: (config: PluginConfiguration) => void;
}

export default function PluginConfigurationPanel({
  configuration,
  save,
}: PanelProps) {
  const cfg = configuration || {};
  const [tag, setTag] = useState(cfg.imageTag || "latest");
  const [saved, setSaved] = useState("");
  const [token, setToken] = useState(cfg.signalkToken || "");
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const requestAccessToken = async () => {
    setRequesting(true);
    setRequestError(false);
    setRequestMessage("Requesting access...");
    try {
      const clientId = generateClientId();
      const res = await fetch("/signalk/v1/access/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          description: "signalk-mcp-container plugin",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let body = (await res.json()) as AccessRequestResponse;

      if (body.state !== "COMPLETED") {
        if (!body.href) {
          throw new Error("SignalK did not return a request to poll");
        }
        setRequestMessage(
          'Waiting for approval — go to Server → Security → "Access ' +
            'Requests" and approve this request.',
        );
        body = await pollAccessRequest(body.href);
      }

      if (!mounted.current) return;
      if (body.accessRequest?.permission === "APPROVED" && body.accessRequest.token) {
        setToken(body.accessRequest.token);
        setRequestMessage(
          "Approved — token filled in below. Click Save Configuration to apply it.",
        );
      } else {
        setRequestError(true);
        setRequestMessage("Access request was denied.");
      }
    } catch (err) {
      if (!mounted.current) return;
      setRequestError(true);
      setRequestMessage(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      if (mounted.current) setRequesting(false);
    }
  };

  const pollAccessRequest = async (
    href: string,
  ): Promise<AccessRequestResponse> => {
    const deadline = Date.now() + ACCESS_REQUEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!mounted.current) return {};
      await new Promise((resolve) => setTimeout(resolve, ACCESS_REQUEST_POLL_MS));
      const res = await fetch(href);
      if (!res.ok) continue;
      const body = (await res.json()) as AccessRequestResponse;
      if (body.state === "COMPLETED") return body;
    }
    throw new Error("Timed out waiting for the access request to be approved");
  };

  const { status, loading } = useStatusPoll<{
    status: string;
    endpoint?: string;
    url?: string;
  }>(`${BASE}/api/status`, {
    fallback: { status: "not_running" },
  });

  const versions = useVersions(`${BASE}/api/versions`);

  const running = status?.status === "running";

  return (
    <div style={S.root}>
      <SectionTitle>MCP Server Status</SectionTitle>
      <StatusCard
        icon="M"
        iconBackground={running ? "#7c3aed" : undefined}
        title="signalk-mcp-server"
        meta={
          loading ? "Checking..." : running ? status?.endpoint : "Not running"
        }
        state={running ? "ok" : "error"}
        link={running && status?.url ? { href: status.url, label: "Open ↗" } : undefined}
      />

      {running && (
        <UpdateControls
          checkUrl={`${BASE}/api/update/check`}
          applyUrl={`${BASE}/api/update/apply`}
          tag={tag}
        />
      )}

      <SectionTitle>Settings</SectionTitle>
      <FieldRow label="Image version">
        <VersionSelect
          value={tag}
          onChange={setTag}
          versions={versions.versions}
          loading={versions.loading}
          error={versions.versionsError}
          onRefresh={versions.refresh}
        />
      </FieldRow>

      <FieldRow
        label="SignalK access token"
        hint="only needed if SignalK's security rejects anonymous reads"
      >
        <input
          style={{ ...S.input, width: 260 }}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="none"
        />
        <Button
          onClick={requestAccessToken}
          disabled={requesting}
          style={{ marginLeft: 8 }}
        >
          {requesting ? "Requesting..." : "Request via SignalK"}
        </Button>
      </FieldRow>
      {requestMessage && (
        <ActionStatus message={requestMessage} error={requestError} />
      )}

      <CollapsibleSection title="Advanced">
        <p style={S.hint}>
          Runs signalk-mcp-server in a managed container, exposing this
          vessel's SignalK data to MCP clients (e.g. Claude Desktop) over
          Streamable HTTP. SignalK connection host/port and execution mode
          are configured via the standard Plugin Config JSON schema fields
          above this panel.
        </p>
      </CollapsibleSection>

      <ActionStatus message={saved} />
      <div style={{ marginTop: 24 }}>
        <Button
          onClick={() => {
            save({ ...cfg, imageTag: tag, signalkToken: token });
            setSaved("Saved! Plugin will restart with new configuration.");
          }}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
