import React, { useEffect, useState } from 'react';

interface WatchlistItemProps {
    symbol: string;
    active: boolean;
    /** Company/asset logo URL (see useSymbolLogos). Undefined while loading, null if none exists. */
    logoUrl?: string | null;
    /** Latest close and its rolling 1-minute % change, reported up by SymbolLiveChart. Undefined until that symbol has loaded at least once. */
    price?: number;
    changePct?: number;
    onSelect: () => void;
    onRemove: () => void;
}

const LOGO_SIZE = 28;

/** Round logo; falls back to the symbol's first letter if there is no URL or it fails to load. */
const SymbolLogo: React.FC<{ symbol: string; url?: string | null }> = ({ symbol, url }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [url]);

    const base = { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: '50%', flexShrink: 0 } as const;

    if (url && !failed) {
        return (
            <img
                src={url}
                alt=""
                width={LOGO_SIZE}
                height={LOGO_SIZE}
                loading="lazy"
                onError={() => setFailed(true)}
                // White backing so dark/transparent logos stay visible on the dark theme.
                style={{ ...base, background: '#fff', objectFit: 'contain', padding: 3, boxSizing: 'border-box' }}
            />
        );
    }
    return (
        <div
            aria-hidden="true"
            style={{
                ...base,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'var(--font-mono)',
            }}
        >
            {symbol.charAt(0)}
        </div>
    );
};

/**
 * Previously the watchlist was symbol-only — you had to select a row to find
 * out whether it had moved. This surfaces last price + direction inline,
 * matching the header treatment on the chart panel itself.
 */
const WatchlistItem: React.FC<WatchlistItemProps> = ({ symbol, active, logoUrl, price, changePct, onSelect, onRemove }) => {
    const isUp = changePct != null ? changePct >= 0 : null;

    return (
        <div
            className={`watchlist-item reveal ${active ? 'active' : ''}`}
            onClick={onSelect}
            role="option"
            aria-selected={active}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect();
                }
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <SymbolLogo symbol={symbol} url={logoUrl} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span className="watchlist-symbol">{symbol}</span>
                {price != null ? (
                    <span className="mono-data tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ${price.toFixed(2)}
                        {changePct != null && (
                            <span title="Change over the last minute" style={{ marginLeft: '6px', color: isUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)' }}>
                                {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                            </span>
                        )}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                )}
            </div>
            </div>
            <button
                className="remove-btn"
                aria-label={`Remove ${symbol} from watchlist`}
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
                ✕
            </button>
        </div>
    );
};

export default WatchlistItem;