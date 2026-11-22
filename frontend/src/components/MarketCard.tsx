import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Market, MarketUpdate } from "../api";

type OracleStatus = {
  label: string;
  description: string;
  background: string;
  color: string;
};

const ORACLE_STATUSES: Record<string, OracleStatus> = {
  pending: {
    label: "Open",
    description: "No oracle outcome has been proposed yet.",
    background: "#f1f3f5",
    color: "#57606a",
  },
  open: {
    label: "Open",
    description: "No oracle outcome has been proposed yet.",
    background: "#f1f3f5",
    color: "#57606a",
  },
  submitted: {
    label: "Outcome Proposed",
    description: "An oracle has proposed an outcome; the challenge period is active.",
    background: "#fff8c5",
    color: "#7d4e00",
  },
  proposed: {
    label: "Outcome Proposed",
    description: "An oracle has proposed an outcome; the challenge period is active.",
    background: "#fff8c5",
    color: "#7d4e00",
  },
  disputed: {
    label: "Dispute Active",
    description: "The proposed outcome has been challenged and is being disputed.",
    background: "#ffebe9",
    color: "#a40e26",
  },
  challenged: {
    label: "Dispute Active",
    description: "The proposed outcome has been challenged and is being disputed.",
    background: "#ffebe9",
    color: "#a40e26",
  },
  council_review: {
    label: "Council Review",
    description: "The dispute is under review by the oracle council.",
    background: "#f3e8ff",
    color: "#6b21a8",
  },
  "council-review": {
    label: "Council Review",
    description: "The dispute is under review by the oracle council.",
    background: "#f3e8ff",
    color: "#6b21a8",
  },
  finalized: {
    label: "Finalized",
    description: "The oracle outcome is final.",
    background: "#dafbe1",
    color: "#116329",
  },
  closed: {
    label: "Closed",
    description: "This market is closed.",
    background: "#f1f3f5",
    color: "#57606a",
  },
};

export function getOracleStatus(state?: string | null): OracleStatus {
  const normalized = state?.trim().toLowerCase();
  if (!normalized) {
    return {
      label: "Status unavailable",
      description: "Oracle status has not been reported.",
      background: "#f1f3f5",
      color: "#57606a",
    };
  }
  return ORACLE_STATUSES[normalized] ?? {
    label: normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `Oracle state: ${normalized}.`,
    background: "#f1f3f5",
    color: "#57606a",
  };
}

export function MarketOracleBadge({ state }: { state?: string | null }) {
  const status = getOracleStatus(state);
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 9px",
    background: status.background,
    color: status.color,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  return (
    <span role="status" aria-label={status.label} title={status.description} style={style}>
      {status.label}
    </span>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function AnimatedOdds({ label, value }: { label: string; value: number }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (previous.current !== value) {
      setDirection(value > previous.current ? "up" : "down");
      previous.current = value;
    }

    const timer = window.setTimeout(() => setDirection(null), 700);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span
      style={{
        color: direction === "up" ? "#1a7f37" : direction === "down" ? "#cf222e" : "inherit",
        transition: "color 600ms ease",
      }}
    >
      {label}: {value.toFixed(4)}
    </span>
  );
}

function LiveMarketData({ update }: { update?: MarketUpdate }) {
  if (!update?.data) return null;

  const data = update.data;
  const marketData = isRecord(data.market) ? data.market : {};
  const rawOdds = isRecord(data.odds)
    ? data.odds
    : isRecord(marketData.odds)
      ? marketData.odds
      : {};
  const odds = Object.entries(rawOdds).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  const totalPool = data.total_pool ?? data.totalPool ?? marketData.total_pool ?? marketData.totalPool;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
      {update.type === "bet_placed" && (
        <p aria-live="polite" style={{ color: "var(--muted)" }}>A new bet was received.</p>
      )}
      {totalPool !== undefined && (
        <p>Pool balance: {String(totalPool)}</p>
      )}
      {odds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {odds.map(([outcome, value]) => (
            <AnimatedOdds key={outcome} label={`${outcome} odds`} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}

function truncateId(id: string) {
  return id.length > 24 ? `${id.slice(0, 12)}…${id.slice(-8)}` : id;
}

export default function MarketCard({
  market,
  update,
}: {
  market: Market;
  update?: MarketUpdate;
}) {
  const liveOracleState =
    typeof update?.data?.oracle_state === "string"
      ? update.data.oracle_state
      : market.oracle_state;

  return (
    <article className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h3 style={{ fontSize: 15, overflowWrap: "anywhere" }}>{market.id}</h3>
        <MarketOracleBadge state={liveOracleState} />
      </div>
      {(typeof update?.data?.outcome === "string" ? update.data.outcome : market.outcome) && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Proposed outcome: {typeof update?.data?.outcome === "string" ? update.data.outcome : market.outcome}
        </p>
      )}
      <LiveMarketData update={update} />
      <div style={{ color: "var(--muted)", fontSize: 12 }}>
        Contract: <code title={market.contract_id}>{truncateId(market.contract_id)}</code>
      </div>
    </article>
  );
}
