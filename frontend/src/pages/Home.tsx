import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import EventTable from "../components/EventTable";
import MarketCard from "../components/MarketCard";
import Skeleton, { SkeletonBar } from "../components/Skeleton";
import { useMarketLiveUpdates } from "../hooks/useMarketLiveUpdates";

export default function Home() {
  const [fnFilter, setFnFilter] = useState("");
  const [customFn, setCustomFn] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Debounce searchQuery by 300 ms — avoids firing a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: functions = [] } = useQuery({
    queryKey: ["distinctFunctions"],
    queryFn: () => api.distinctFunctions(),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: marketsData,
    isLoading: marketsLoading,
    isError: marketsError,
    error: marketsQueryError,
  } = useQuery({
    queryKey: ["markets", "home"],
    queryFn: () => api.markets({ limit: 6 }),
  });
  const { updates: marketUpdates, connected: marketsConnected, error: marketsStreamError } =
    useMarketLiveUpdates();

  const effectiveFn = customFn || fnFilter || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["events", effectiveFn, debouncedSearchQuery, page],
    queryFn: () => api.events({ fn: effectiveFn, q: debouncedSearchQuery || undefined, page }),
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const hasActiveFilter = Boolean((customFn || fnFilter || debouncedSearchQuery).trim());

  const handleFunctionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFnFilter(value);
    setCustomFn("");
    setPage(1);
  };

  const handleCustomFnChange = (value: string) => {
    setCustomFn(value);
    setFnFilter("");
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Soroban Smart Block Explorer</h1>
        <p style={{ color: "var(--muted)" }}>
          Human-readable Soroban contract events on Stellar.
        </p>
      </div>

      <section aria-labelledby="markets-heading" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 id="markets-heading" style={{ fontSize: 18 }}>Markets</h2>
          <Link to="/markets">Browse all markets</Link>
        </div>
        <p aria-live="polite" style={{ color: marketsStreamError ? "var(--red, #cf222e)" : "var(--muted)", fontSize: 12 }}>
          {marketsStreamError ?? (marketsConnected ? "Live market updates connected" : "Connecting to live market updates…")}
        </p>
        {marketsError ? (
          <p role="alert" style={{ color: "var(--red, #cf222e)" }}>
            Could not load markets: {marketsQueryError instanceof Error ? marketsQueryError.message : "Unknown error"}
          </p>
        ) : marketsLoading ? (
          <SkeletonBar width={220} height={16} />
        ) : (marketsData?.markets.length ?? 0) === 0 ? (
          <p style={{ color: "var(--muted)" }}>No markets have been indexed yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {marketsData?.markets.map((market) => (
              <MarketCard key={market.id} market={market} update={marketUpdates[market.id]} />
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, alignItems: "center", flex: "1 1 auto" }}>
          <input
            type="text"
            placeholder="Search events by description…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: "1 1 300px" }}
          />
        </form>
        <label style={{ color: "var(--muted)" }}>Filter by function:</label>
        <select value={fnFilter} onChange={handleFunctionChange}>
          <option value="">All functions</option>
          {functions.map(f => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Or type custom function name…"
          value={customFn}
          onChange={e => handleCustomFnChange(e.target.value)}
          style={{ flex: "0 1 200px" }}
        />
      </div>

      {isLoading ? (
        <SkeletonBar width={220} height={16} />
      ) : total > 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Showing {events.length} of {total.toLocaleString()} events
          {effectiveFn ? ` (filtered by function: ${effectiveFn})` : ""}
        </div>
      ) : null}

      <div className="card">
        {isLoading ? (
          <Skeleton variant="table" />
        ) : events.length === 0 && page > 1 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>
              No more events.
            </p>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              You have reached the end of the results.
            </p>
          </div>
        ) : (
          <EventTable
            events={events}
            emptyMessage={hasActiveFilter ? "No events match your current filters." : undefined}
            emptySubtitle={hasActiveFilter ? "Try adjusting your filter criteria." : undefined}
          />
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span style={{ padding: "6px 10px", color: "var(--muted)" }}>Page {page}</span>
        <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}
