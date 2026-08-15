import React, { useState } from "react";
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

      <CollapsibleSection title="Advanced">
        <p style={S.hint}>
          Runs signalk-mcp-server in a managed container, exposing this
          vessel's SignalK data to MCP clients (e.g. Claude Desktop) over
          Streamable HTTP. SignalK connection host/port, execution mode,
          and (if SignalK security requires it) an access token are
          configured via the standard Plugin Config JSON schema fields
          above this panel.
        </p>
      </CollapsibleSection>

      <ActionStatus message={saved} />
      <div style={{ marginTop: 24 }}>
        <Button
          onClick={() => {
            save({ ...cfg, imageTag: tag });
            setSaved("Saved! Plugin will restart with new configuration.");
          }}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
