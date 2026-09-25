import { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:8081';

// Module-level cache: one lookup per symbol per page load, shared by every component
// and de-duplicated while in flight. A failed lookup is evicted so it can be retried.
const logoCache = new Map<string, Promise<string | null>>();

const isCrypto = (symbol: string) => symbol.endsWith('USDT');

const loadLogo = (symbol: string): Promise<string | null> => {
    // Finnhub has no crypto profiles, so use a public crypto icon set instead.
    // If the icon doesn't exist the <img> onError falls back to the initial letter.
    if (isCrypto(symbol)) {
        const base = symbol.slice(0, -4).toLowerCase();
        return Promise.resolve(
            `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base}.png`
        );
    }

    return fetch(`${API_BASE}/api/symbols/${symbol}/profile`)
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then(profile => (profile?.logo ? String(profile.logo) : null));
};

const getLogo = (symbol: string): Promise<string | null> => {
    let pending = logoCache.get(symbol);
    if (!pending) {
        pending = loadLogo(symbol).catch(() => {
            logoCache.delete(symbol); // allow a retry next time
            return null;
        });
        logoCache.set(symbol, pending);
    }
    return pending;
};

/**
 * Resolves a logo URL for each symbol in the watchlist.
 * Returns a map symbol -> URL (null = no logo available, undefined = still loading).
 */
export const useSymbolLogos = (symbols: string[]): Record<string, string | null> => {
    const [logos, setLogos] = useState<Record<string, string | null>>({});
    const key = symbols.join(',');

    useEffect(() => {
        let cancelled = false;
        symbols.forEach(sym => {
            getLogo(sym).then(url => {
                if (cancelled) return;
                setLogos(prev => (prev[sym] === url ? prev : { ...prev, [sym]: url }));
            });
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return logos;
};