import React from 'react';

interface MetricCardProps {
    label: string;
    value: string | number | undefined;
    isCurrency?: boolean;
    /** Plays a one-time pop when the value changes — pass a stable key upstream if you want it keyed to something other than the value itself. */
    animateOnChange?: boolean;
}

/**
 * Shared KPI card. Both pages were building visually-identical metric tiles
 * with their own inline JSX (renderRiskMetric in Monte Carlo, hand-written
 * divs in the Live asset panel) — consolidated so a future third page gets
 * this for free instead of a third slightly-different copy.
 */
const MetricCard: React.FC<MetricCardProps> = ({ label, value, isCurrency = false, animateOnChange = true }) => {
    const isNegative = typeof value === 'number' && value < 0;
    const display = value === undefined
        ? '—'
        : `${isCurrency ? '$' : ''}${typeof value === 'number' ? value.toFixed(2) : value}`;

    return (
        <div className="metric-card">
            <span className="metric-label">{label}</span>
            <span
                key={animateOnChange ? display : undefined}
                className={`metric-value ${animateOnChange ? 'value-pop' : ''} ${isNegative ? 'negative' : ''}`}
            >
                {display}
            </span>
        </div>
    );
};

export default MetricCard;
