import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { OHLCVCandle } from '../types';

// ==========================================
// CSS Variable Injector Utility
// ==========================================
/**
 * Extracts a computed CSS variable from the DOM to synchronize
 * Canvas-based charts with the global CSS Design System.
 */
const getComputedCssVar = (varName: string, fallback: string): string => {
    if (typeof window !== 'undefined') {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }
    return fallback;
};

interface TradingViewChartProps {
    data: OHLCVCandle[];
}

/**
 * Institutional-grade React wrapper for TradingView Lightweight Charts.
 * Features dynamic CSS variable injection and ResizeObserver for fluid layouts.
 */
const TradingViewChart: React.FC<TradingViewChartProps> = ({ data }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    // ---------------------------------------------------------
    // Chart Initialization and Auto-Resizing
    // ---------------------------------------------------------
    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Dynamically resolve colors from fintech-theme.css
        const theme = {
            bg: getComputedCssVar('--bg-base', '#050507'),
            text: getComputedCssVar('--text-secondary', '#94a3b8'),
            grid: getComputedCssVar('--border-subtle', '#222631'),
            up: getComputedCssVar('--trade-up-text', '#4ade80'),
            down: getComputedCssVar('--trade-down-text', '#f87171'),
            crosshair: getComputedCssVar('--text-muted', '#64748b'),
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: theme.bg },
                textColor: theme.text,
            },
            localization: {
                locale: 'en-US',
                dateFormat: 'yyyy-MM-dd',
            },
            grid: {
                vertLines: { color: theme.grid, style: 1 },
                horzLines: { color: theme.grid, style: 1 },
            },
            crosshair: {
                vertLine: { color: theme.crosshair, labelBackgroundColor: theme.crosshair },
                horzLine: { color: theme.crosshair, labelBackgroundColor: theme.crosshair },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: theme.grid,
            },
            rightPriceScale: {
                borderColor: theme.grid,
            },
            // Initialize with container's current dimensions
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: theme.up,
            downColor: theme.down,
            borderVisible: false,
            wickUpColor: theme.up,
            wickDownColor: theme.down,
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        // Use ResizeObserver for hardware-accelerated, container-aware responsive scaling
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries.length === 0 || !chartRef.current) return;
            const newRect = entries[0].contentRect;
            chartRef.current.applyOptions({ 
                width: newRect.width, 
                height: newRect.height 
            });
        });

        resizeObserver.observe(chartContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    // ---------------------------------------------------------
    // Data Injection Pipeline
    // ---------------------------------------------------------
    useEffect(() => {
        if (!seriesRef.current || !data || data.length === 0) return;

        try {
            const formattedData = data.map((candle) => ({
                time: candle.time as Time,
                open: Number(candle.open),
                high: Number(candle.high),
                low: Number(candle.low),
                close: Number(candle.close),
            }));

            seriesRef.current.setData(formattedData);
        } catch (error) {
            console.error("[-] Failed to inject data into TradingView chart:", error);
        }
    }, [data]);

    return (
        <div 
            ref={chartContainerRef} 
            className="tradingview-chart-container"
            style={{ width: '100%', height: '100%', position: 'relative' }} 
        />
    );
};

export default TradingViewChart;