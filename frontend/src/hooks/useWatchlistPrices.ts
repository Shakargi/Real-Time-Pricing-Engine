import { useEffect, useRef, useState } from 'react';
import { Client, type StompSubscription } from '@stomp/stompjs';

const API_BASE = 'http://localhost:8081';
const MINUTE_MS = 60_000;

export interface WatchlistQuote {
    price: number;
    /** % change over the last ~60s. null until there's a live tick AND a comparison point. */
    changePct: number | null;
}

/**
 * Keeps a live price and rolling 1-minute % change for every symbol in the watchlist,
 * independent of which one is currently selected/charted.
 *
 * Previously only the selected symbol's price updated: LiveDashboard subscribed to a single
 * STOMP topic via useLiveMarketData, and the watchlist's price came from SymbolLiveChart's
 * onPriceUpdate callback — which only exists for the symbol actually being rendered. This
 * hook instead opens one subscription per watchlist symbol so every row updates in real time.
 *
 * Each symbol is also seeded from its latest 1-minute REST candle, so a row shows a price
 * immediately, and continues to show one for symbols with no live trades right now (e.g. a
 * stock while its market is closed) instead of going blank.
 */
export const useWatchlistPrices = (url: string, symbols: string[]) => {
    const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});

    const recentPrices = useRef<Record<string, { t: number; price: number }[]>>({});
    const seeded = useRef<Set<string>>(new Set());
    const clientRef = useRef<Client | null>(null);
    const subsRef = useRef<Record<string, StompSubscription>>({});
    const symbolsRef = useRef<string[]>(symbols);
    symbolsRef.current = symbols;

    const recordPrice = (symbol: string, price: number) => {
        if (!(price > 0)) return;
        const now = Date.now();
        const samples = recentPrices.current[symbol] ?? (recentPrices.current[symbol] = []);
        samples.push({ t: now, price });
        // Drop a sample once the next one is also >= 60s old; samples[0] is then the newest
        // sample at least 60s old (or the oldest one seen so far, if none is that old yet).
        while (samples.length > 1 && samples[1].t <= now - MINUTE_MS) samples.shift();
        const ref = samples[0].price;
        const changePct = ref > 0 ? ((price - ref) / ref) * 100 : null;
        setQuotes(prev => {
            const existing = prev[symbol];
            if (existing && existing.price === price && existing.changePct === changePct) return prev;
            return { ...prev, [symbol]: { price, changePct } };
        });
    };

    const subscribeSymbol = (client: Client, symbol: string) => {
        if (subsRef.current[symbol]) return;
        subsRef.current[symbol] = client.subscribe(`/topic/market/${symbol}`, (message) => {
            try {
                const parsed = JSON.parse(message.body);
                if (parsed?.close > 0) recordPrice(symbol, parsed.close);
            } catch (error) {
                console.error(`[-] Failed to parse watchlist candle for ${symbol}:`, error);
            }
        });
    };

    // Seed each newly-added symbol's price from its latest REST candle, once. Does not
    // overwrite a price a live tick may already have set.
    const key = symbols.join(',');
    useEffect(() => {
        symbols.forEach(symbol => {
            if (seeded.current.has(symbol)) return;
            seeded.current.add(symbol);

            fetch(`${API_BASE}/api/symbols/${symbol}/chart?interval=1m`)
                .then(res => (res.ok ? res.json() : []))
                .then((candles: Array<{ close: number }>) => {
                    const last = candles?.[candles.length - 1];
                    if (!(last?.close > 0)) return;
                    setQuotes(prev => (prev[symbol] ? prev : { ...prev, [symbol]: { price: last.close, changePct: null } }));
                })
                .catch(() => {});
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // One STOMP connection for the whole watchlist (separate from the chart's own connection).
    useEffect(() => {
        const client = new Client({
            brokerURL: url,
            reconnectDelay: 3000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            onConnect: () => {
                symbolsRef.current.forEach(symbol => subscribeSymbol(client, symbol));
            },
            onWebSocketClose: () => {
                subsRef.current = {}; // subscriptions die with the socket; onConnect re-adds them
            },
        });
        clientRef.current = client;
        client.activate();

        return () => {
            Object.values(subsRef.current).forEach(sub => sub.unsubscribe());
            subsRef.current = {};
            clientRef.current = null;
            client.deactivate();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    // Add/remove subscriptions as the watchlist changes, without reconnecting.
    useEffect(() => {
        const client = clientRef.current;
        if (!client?.connected) return;

        symbols.forEach(symbol => subscribeSymbol(client, symbol));
        Object.keys(subsRef.current).forEach(symbol => {
            if (!symbols.includes(symbol)) {
                subsRef.current[symbol].unsubscribe();
                delete subsRef.current[symbol];
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return quotes;
};