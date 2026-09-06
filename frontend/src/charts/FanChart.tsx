import React from 'react';
import Plot from 'react-plotly.js';
import type { FanChartData } from '../types';

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
    // Determine dynamic range for the Y-axis to keep the chart looking clean
    const minPrice = Math.min(...data.percentile5) * 0.95;
    const maxPrice = Math.max(...data.percentile95) * 1.05;

    return (
        <div className="chart-container" style={{ width: '100%', height: '100%' }}>
            <Plot
                data={[
                    // Trace 0: 5th Percentile (Lower Bound)
                    // Rendered first, transparent line, acts as the base for the fill
                    {
                        x: data.timeSteps,
                        y: data.percentile5,
                        type: 'scatter',
                        mode: 'lines',
                        line: { width: 0 },
                        marker: { color: '#444' },
                        showlegend: false,
                        hoverinfo: 'skip',
                    },
                    // Trace 1: 95th Percentile (Upper Bound)
                    // Fills the area down to the 5th percentile ('tonexty')
                    {
                        x: data.timeSteps,
                        y: data.percentile95,
                        type: 'scatter',
                        mode: 'lines',
                        fill: 'tonexty',
                        fillcolor: 'rgba(38, 166, 154, 0.2)', // Semi-transparent TradingView green
                        line: { width: 0 },
                        marker: { color: '#444' },
                        name: '90% Confidence Interval',
                        hoverinfo: 'skip',
                    },
                    // Trace 2: Median (Expected Value)
                    // Solid line drawn on top of the shaded area
                    {
                        x: data.timeSteps,
                        y: data.median,
                        type: 'scatter',
                        mode: 'lines',
                        line: { color: '#26a69a', width: 2 },
                        name: 'Median Path (50%)',
                        hovertemplate: 'Time: %{x:.2f}Y<br>Price: $%{y:.2f}<extra></extra>',
                    }
                ]}
                layout={{
                    title: {
                        text: `${symbol} - Monte Carlo Price Evolution`,
                        font: { color: '#d1d4dc', size: 16 }
                    },
                    paper_bgcolor: 'rgba(0,0,0,0)', // Transparent to inherit dashboard background
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: {
                        title: 'Time to Maturity (Years)',
                        color: '#d1d4dc',
                        gridcolor: '#2b2b43',
                        zerolinecolor: '#2b2b43'
                    },
                    yaxis: {
                        title: 'Asset Price (USD)',
                        color: '#d1d4dc',
                        gridcolor: '#2b2b43',
                        zerolinecolor: '#2b2b43',
                        range: [minPrice, maxPrice]
                    },
                    margin: { t: 50, r: 20, b: 50, l: 60 },
                    legend: {
                        font: { color: '#d1d4dc' },
                        orientation: 'h',
                        y: -0.2
                    },
                    autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '400px' }}
                config={{ responsive: true, displayModeBar: false }}
            />
        </div>
    );
};

export default FanChart;