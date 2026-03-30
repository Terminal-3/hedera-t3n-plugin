"use client";

type StatusResponse = {
  provider: { ready: boolean; reason: string | null };
  identity: { ready: boolean; did?: string; networkTier?: string; error?: string };
  agentCard: { exists: boolean; hasGatewayUrl: boolean; gatewayUrl?: string };
  session: { valid: boolean; did?: string; networkTier?: string };
  registration: { t3nRegistered: boolean; hederaRegistered: boolean };
  pinata: { configured: boolean };
  recommendations: string[];
  lastBootstrapError: string | null;
};

export function StatusCards({
  status,
  onRefresh,
  onBootstrap,
  busy,
}: {
  status: StatusResponse | null;
  onRefresh: () => void;
  onBootstrap: (attemptUpload: boolean) => void;
  busy: boolean;
}) {
  return (
    <section className="panel stack-lg">
      <div className="section-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2>Status</h2>
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
          <button className="primary-button" onClick={() => onBootstrap(true)} disabled={busy}>
            Bootstrap + Upload
          </button>
        </div>
      </div>

      <div className="status-grid">
        <article className="status-card">
          <span className={`status-pill ${status?.provider.ready ? "ok" : "warn"}`}>
            {status?.provider.ready ? "Ready" : "Blocked"}
          </span>
          <h3>Model Provider</h3>
          <p>{status?.provider.reason ?? "Configured and usable."}</p>
        </article>
        <article className="status-card">
          <span className={`status-pill ${status?.identity.ready ? "ok" : "warn"}`}>
            {status?.identity.ready ? "Ready" : "Missing"}
          </span>
          <h3>Identity</h3>
          <p>{status?.identity.did ?? status?.identity.error ?? "No identity loaded."}</p>
        </article>
        <article className="status-card">
          <span className={`status-pill ${status?.session.valid ? "ok" : "idle"}`}>
            {status?.session.valid ? "Open" : "Closed"}
          </span>
          <h3>Session</h3>
          <p>{status?.session.did ?? "No authenticated session yet."}</p>
        </article>
      </div>

      <article className="status-card status-card-agent-url">
        <span
          className={`status-pill ${
            status?.agentCard.hasGatewayUrl ? "ok" : status?.agentCard.exists ? "warn" : "idle"
          }`}
        >
          {status?.agentCard.hasGatewayUrl ? "Public" : status?.agentCard.exists ? "Local" : "None"}
        </span>
        <h3>Agent Card</h3>
        <p className="agent-url">
          {status?.agentCard.gatewayUrl ?? "No public gateway URL stored yet."}
        </p>
      </article>

      <div className="split-grid">
        <div className="subpanel">
          <h3>Registration</h3>
          <p>T3N: {status?.registration.t3nRegistered ? "registered" : "not registered"}</p>
          <p>Hedera: {status?.registration.hederaRegistered ? "registered" : "not registered"}</p>
          <p>Pinata creds: {status?.pinata.configured ? "present" : "missing"}</p>
        </div>
        <div className="subpanel">
          <h3>Recommendations</h3>
          {status?.recommendations.length ? (
            <ul className="plain-list">
              {status.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>No immediate bootstrap blockers.</p>
          )}
          {status?.lastBootstrapError ? <p className="error-copy">{status.lastBootstrapError}</p> : null}
        </div>
      </div>
    </section>
  );
}
