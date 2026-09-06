import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { OHLCVCandle } from '../types';

// ==========================================
// Configuration Constants
// ==========================================
const CHART_HEIGHT = 400;
const COLORS = {
    background: '#131722',
    text: '#d1d4dc',
    grid: '#2b2b43',
    upCandle: '#26a69a',
    downCandle: '#ef5350',
};

/**
 * Props for the TradingViewChart component.
 */
interface TradingViewChartProps {
    /** Array of formatted OHLCV candles to be rendered on the chart. */
    data: OHLCVCandle[];
}

/**
 * A React wrapper component for the Lightweight Charts library by TradingView.
 * Responsible for rendering a high-performance financial candlestick chart.
 * 
 * @param {TradingViewChartProps} props - The component props containing the chart data.
 * @returns {JSX.Element} The mounted chart container.
 */
const TradingViewChart: React.FC<TradingViewChartProps> = ({ data }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    // ---------------------------------------------------------
    // Chart Initialization and Cleanup (Mount/Unmount)
    // ---------------------------------------------------------
    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Initialize the chart instance with a professional UI theme configuration
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: COLORS.background },
                textColor: COLORS.text,
            },
            grid: {
                vertLines: { color: COLORS.grid },
                horzLines: { color: COLORS.grid },
            },
            width: chartContainerRef.current.clientWidth,
            height: CHART_HEIGHT,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        // Add and configure the candlestick series
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: COLORS.upCandle,
            downColor: COLORS.downCandle,
            borderVisible: false,
            wickUpColor: COLORS.upCandle,
            wickDownColor: COLORS.downCandle,
        });

        // Persist instances to refs for data updates and window resizing
        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        // Handle window resize events to maintain responsive design boundaries
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        
        window.addEventListener('resize', handleResize);

        // Cleanup function to prevent memory leaks during component unmounting
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    // ---------------------------------------------------------
    // Data Injection and Real-Time Updates
    // ---------------------------------------------------------
    useEffect(() => {
        if (!seriesRef.current || !data || data.length === 0) return;

        try {
            // Map incoming DTOs to strictly match the Lightweight Charts expected structure.
            // Note: Timestamp conversions and chronological deduplication are handled by the parent component.
            const formattedData = data.map((candle) => ({
                time: candle.time as Time,
                open: Number(candle.open),
                high: Number(candle.high),
                low: Number(candle.low),
                close: Number(candle.close),
            }));

            // Inject the formatted data into the chart series layer
            seriesRef.current.setData(formattedData);
            
        } catch (error) {
            console.error("[-] Failed to inject data into TradingView chart:", error);
        }
    }, [data]);

    return (
        <div 
            ref={chartContainerRef} 
            className="tradingview-chart-container"
            style={{ 
                width: '100%', 
                height: `${CHART_HEIGHT}px`, 
                minHeight: `${CHART_HEIGHT}px`, 
                display: 'block' 
            }} 
        />
    );
};

export default TradingViewChart;