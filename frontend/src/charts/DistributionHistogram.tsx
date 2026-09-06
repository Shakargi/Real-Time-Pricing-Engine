import React from 'react';
import Plot from 'react-plotly.js';
import type { HistogramBin } from '../types';

interface DistributionHistogramProps {
    data: HistogramBin[];
    symbol: string;
}

/**
 * Renders the probability distribution of the asset's price at maturity (T).
 * Displays a log-normal distribution using pre-binned data from the backend
 * to optimize rendering performance.
 */
const DistributionHistogram: React.FC<DistributionHistogramProps> = ({ data, symbol }) => {
    // Extract X (prices) and Y (frequencies) from the binned data array
    const prices = data.map(bin => bin.binCenter);
    const counts = data.map(bin => bin.count);

    return (
        <div className="chart-container" style={{ width: '100%', height: '100%' }}>
            <Plot
                data={[
                    {
                        x: prices,
                        y: counts,
                        type: 'bar',
                        marker: {
                            color: '#2962ff', // Professional blue to contrast with the Fan Chart green
                            opacity: 0.8,
                            line: {
                                color: '#1e53e5', // Slightly darker border for crisp edges
                                width: 1
                            }
                        },
                        name: 'Paths',
                        hovertemplate: 'Price: $%{x:.2f}<br>Paths: %{y}<extra></extra>',
                    }
                ]}
                layout={{
                    title: {
                        text: `${symbol} - Price Distribution at Maturity (T)`,
                        font: { color: '#d1d4dc', size: 16 }
                    },
                    paper_bgcolor: 'rgba(0,0,0,0)', // Inherits the dark mode background
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: {
                        title: 'Asset Price at Maturity (USD)',
                        color: '#d1d4dc',
                        gridcolor: '#2b2b43',
                        zerolinecolor: '#2b2b43',
                    },
                    yaxis: {
                        title: 'Number of Paths (Frequency)',
                        color: '#d1d4dc',
                        gridcolor: '#2b2b43',
                        zerolinecolor: '#2b2b43',
                    },
                    margin: { t: 50, r: 20, b: 50, l: 60 },
                    bargap: 0.05, // Creates a slight visual gap between bins
                    autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '400px' }}
                config={{ responsive: true, displayModeBar: false }}
            />
        </div>
    );
};

export default DistributionHistogram;