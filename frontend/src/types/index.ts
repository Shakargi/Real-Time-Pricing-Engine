export interface PricingData {
  symbol: string;
  underlying_price: number;
  option_price: number;
  timestamp?: number; // Useful for latency tracking in high-frequency systems
}

export type TabView = 'LIVE_DASHBOARD' | 'FORECASTING';

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}