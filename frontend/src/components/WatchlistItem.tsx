import React from 'react';

interface WatchlistItemProps {
    symbol: string;
    active: boolean;
    /** Latest close and its % change since period-open, reported up by SymbolLiveChart. Undefined until that symbol has loaded at least once. */
    price?: number;
    changePct?: number;
    onSelect: () => void;
    onRemove: () => void;
}

/**
 * Previously the watchlist was symbol-only — you had to select a row to find
 * out whether it had moved. This surfaces last price + direction inline,
 * matching the header treatment on the chart panel itself.
 */
const WatchlistItem: React.FC<WatchlistItemProps> = ({ symbol, active, price, changePct, onSelect, onRemove }) => {
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span className="watchlist-symbol">{symbol}</span>
                {price != null ? (
                    <span className="mono-data tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ${price.toFixed(2)}
                        {changePct != null && (
                            <span style={{ marginLeft: '6px', color: isUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)' }}>
                                {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                            </span>
                        )}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                )}
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