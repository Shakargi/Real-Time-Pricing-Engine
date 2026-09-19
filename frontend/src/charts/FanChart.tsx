import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { FanChartData } from '../types';

// ==========================================
// CSS Variable Injector Utility
// ==========================================
/**
 * Extracts a computed CSS variable from the DOM to synchronize
 * Canvas/SVG-based charts with the global CSS Design System.
 */
const getComputedCssVar = (varName: string, fallback: string): string => {
    if (typeof window !== 'undefined') {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }
    return fallback;
};

interface FanChartProps {
    data: FanChartData;
    symbol: string;
}

/**
 * Renders the Monte Carlo progression over time.
 * Displays the median path alongside the 5th and 95th percentiles 
 * to visualize the expanding variance (volatility) of the stochastic process.
 */
const FanChart: React.FC<FanChartProps> = ({ data, symbol }) => {
    // Dynamically resolve colors from fintech-theme.css on render
    const theme = useMemo(() => ({
        text: getComputedCssVar('--text-primary', '#d1d4dc'),
        textMuted: getComputedCssVar('--text-secondary', '#94a3b8'),
        grid: getComputedCssVar('--border-subtle', '#2b2b43'),
        primaryLine: getComputedCssVar('--border-active', '#38bdf8'),
        fillArea: getComputedCssVar('--border-focus', '#2962ff')
    }), []);

    // Determine dynamic range for the Y-axis to keep the chart looking clean
    const minPrice = Math.min(...data.percentile5) * 0.95;
    const maxPrice = Math.max(...data.percentile95) * 1.05;

    // We use rgba injection to apply transparency to our solid CSS variable colors
    const applyAlpha = (colorVar: string, alpha: number) => {
        // Simple fallback if the variable isn't parsed as hex/rgb
        if (colorVar.startsWith('#')) {
            const hex = colorVar.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return colorVar; // Fallback to raw string if parsing fails
    };

    return (
        <div className="chart-panel fade-in" style={{ width: '100%', height: '100%', border: 'none' }}>
            <Plot
                data={[
                    // Trace 0: 5th Percentile (Lower Bound)
                    {
                        x: data.timeSteps,
                        y: data.percentile5,
                        type: 'scatter',
                        mode: 'lines',
                        line: { width: 0 },
                        marker: { color: 'transparent' },
                        showlegend: false,
                        hoverinfo: 'skip',
                    },
                    // Trace 1: 95th Percentile (Upper Bound) - Fills down to Trace 0
                    {
                        x: data.timeSteps,
                        y: data.percentile95,
                        type: 'scatter',
                        mode: 'lines',
                        fill: 'tonexty',
                        fillcolor: applyAlpha(theme.fillArea, 0.15),
                        line: { width: 0 },
                        marker: { color: 'transparent' },
                        name: '90% Confidence Interval',
                        hoverinfo: 'skip',
                    },
                    // Trace 2: Median (Expected Value)
                    {
                        x: data.timeSteps,
                        y: data.median,
                        type: 'scatter',
                        mode: 'lines',
                        line: { color: theme.primaryLine, width: 2 },
                        name: 'Median Path (50%)',
                        hovertemplate: 'Time: %{x:.2f}Y<br>Price: $%{y:.2f}<extra></extra>',
                    }
                ]}
                layout={{
                    title: {
                        text: `${symbol} - Price Evolution Envelope`,
                        font: { color: theme.text, size: 14, family: 'var(--font-mono)' }
                    },
                    paper_bgcolor: 'rgba(0,0,0,0)', 
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: {
                        title: { text: 'Time to Maturity (Years)', font: { color: theme.textMuted, size: 11 } },
                        color: theme.textMuted,
                        gridcolor: theme.grid,
                        zerolinecolor: theme.grid,
                        tickfont: { family: 'var(--font-mono)' }
                    },
                    yaxis: {
                        title: { text: 'Asset Price (USD)', font: { color: theme.textMuted, size: 11 } },
                        color: theme.textMuted,
                        gridcolor: theme.grid,
                        zerolinecolor: theme.grid,
                        range: [minPrice, maxPrice],
                        tickprefix: '$',
                        tickfont: { family: 'var(--font-mono)' }
                    },
                    margin: { t: 40, r: 20, b: 40, l: 60 },
                    legend: {
                        font: { color: theme.textMuted, size: 11 },
                        orientation: 'h',
                        y: -0.15
                    },
                    autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ responsive: true, displayModeBar: false }}
            />
        </div>
    );
};

export default FanChart;