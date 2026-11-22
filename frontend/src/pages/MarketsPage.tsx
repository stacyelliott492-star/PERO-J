import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import MarketCard from "../components/MarketCard";
import Skeleton from "../components/Skeleton";
import { useMarketLiveUpdates } from "../hooks/useMarketLiveUpdates";

export default function MarketsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["markets", "browse"],
    queryFn: () => api.markets({ limit: 50 }),
  });
  const markets = data?.markets ?? [];
  const { updates: marketUpdates, connected, error: streamError } = useMarketLiveUpdates();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Markets</h1>
        <p style={{ color: "var(--muted)" }}>
          Browse markets and follow the current oracle outcome status.
        </p>
        <p aria-live="polite" style={{ color: streamError ? "var(--red, #cf222e)" : "var(--muted)", fontSize: 12 }}>
          {streamError ?? (connected ? "Live market updates connected" : "Connecting to live market updates…")}
        </p>
      </div>

      {isError ? (
        <p role="alert" style={{ color: "var(--red, #cf222e)" }}>
          Could not load markets: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      ) : isLoading ? (
        <div className="card"><Skeleton rows={3} /></div>
      ) : markets.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--muted)" }}>No markets have been indexed yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} update={marketUpdates[market.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
