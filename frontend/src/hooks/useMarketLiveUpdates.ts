import { useEffect, useState } from "react";
import { streamMarketUpdates, type MarketUpdate } from "../api";

export function useMarketLiveUpdates(marketId?: string) {
  const [latestUpdate, setLatestUpdate] = useState<MarketUpdate | null>(null);
  const [updates, setUpdates] = useState<Record<string, MarketUpdate>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnected(false);
    setError(null);
    setLatestUpdate(null);
    setUpdates({});

    const unsubscribe = streamMarketUpdates(
      marketId,
      (update) => {
        setConnected(true);
        setError(null);
        if (update.type === "connected") return;

        const updateMarketId = update.marketId ?? update.market_id;
        if (marketId && updateMarketId && updateMarketId !== marketId) return;

        setLatestUpdate(update);
        if (updateMarketId) {
          setUpdates((current) => ({ ...current, [updateMarketId]: update }));
        }
      },
      () => {
        setConnected(false);
        setError("Live market updates disconnected; reconnecting…");
      },
    );

    return () => {
      unsubscribe();
      setConnected(false);
    };
  }, [marketId]);

  return { latestUpdate, updates, connected, error };
}
