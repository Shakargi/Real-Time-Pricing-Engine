import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { HistogramBin } from '../types';

// ==========================================
// CSS Variable Injector Utility
// ==========================================
const getComputedCssVar = (varName: string, fallback: string): string => {
    if (typeof window !== 'undefined') {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }
    return fallback;
};

interface DistributionHistogramProps {
    data: HistogramBin[];
    symbol: string;
}

/**
 * Renders the probability distribution of the asset's price at maturity (T).
 * Fully synchronized with the global CSS Design System for a native terminal look.
 */
const DistributionHistogram: React.FC<DistributionHistogramProps> = ({ data, symbol }) => {
    
    // Dynamically resolve colors from fintech-theme.css on render
    const theme = useMemo(() => ({
        text: getComputedCssVar('--text-primary', '#d1d4dc'),
        textMuted: getComputedCssVar('--text-secondary', '#94a3b8'),
        grid: getComputedCssVar('--border-subtle', '#2b2b43'),
        barColor: getComputedCssVar('--border-focus', '#2962ff'),
        barBorder: getComputedCssVar('--border-active', '#38bdf8')
    }), []);

    const prices = data.map(bin => bin.binCenter);
    const counts = data.map(bin => bin.count);

    return (
        <div className="chart-panel fade-in" style={{ width: '100%', height: '100%', border: 'none' }}>
            <Plot
                data={[
                    {
                        x: prices,
                        y: counts,
                        type: 'bar',
                        marker: {
                            color: theme.barColor,
                            opacity: 0.85,
                            line: {
                                color: theme.barBorder,
                                width: 1
                            }
                        },
                        name: 'Paths',
                        hovertemplate: 'Price: $%{x:.2f}<br>Paths: %{y}<extra></extra>',
                    }
                ]}
                layout={{
                    title: {
                        text: `${symbol} - Terminal Distribution`,
                        font: { color: theme.text, size: 14, family: 'var(--font-mono)' }
                    },
                    paper_bgcolor: 'rgba(0,0,0,0)', 
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: {
                        title: { text: 'Asset Price at Maturity (USD)', font: { color: theme.textMuted, size: 11 } },
                        color: theme.textMuted,
                        gridcolor: theme.grid,
                        zerolinecolor: theme.grid,
                        tickprefix: '$',
                        tickfont: { family: 'var(--font-mono)' }
                    },
                    yaxis: {
                        title: { text: 'Simulated Paths (Frequency)', font: { color: theme.textMuted, size: 11 } },
                        color: theme.textMuted,
                        gridcolor: theme.grid,
                        zerolinecolor: theme.grid,
                        tickfont: { family: 'var(--font-mono)' }
                    },
                    margin: { t: 40, r: 20, b: 40, l: 60 },
                    bargap: 0.1,
                    autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ responsive: true, displayModeBar: false }}
            />
        </div>
    );
};

export default DistributionHistogram;