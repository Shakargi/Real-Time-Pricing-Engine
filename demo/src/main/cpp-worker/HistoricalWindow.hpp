#pragma once

#include <map>
#include <vector>
#include <mutex>

/**
 * @class HistoricalWindow
 * @brief Thread-safe sliding window that manages daily asset prices.
 *
 * This class performs real-time time-based aggregation. It accepts high-frequency
 * market ticks but only retains the latest price per trading day, and maintains
 * a maximum history size (e.g., 365 days) using a FIFO-by-day approach.
 *
 * IMPORTANT: Storage is keyed by trading-day index (epoch_seconds / 86400) rather
 * than by arrival order. This makes the window robust to out-of-order delivery -
 * e.g. historical backfill messages and live WebSocket ticks racing each other
 * over Kafka. A tick for "yesterday" arriving after a tick for "today" is still
 * correctly recorded instead of being discarded as stale.
 */
class HistoricalWindow {
public:
    /**
     * @brief Constructs a new Historical Window.
     * @param max_window_size Maximum number of daily closing prices to retain.
     */
    explicit HistoricalWindow(size_t max_window_size = 365);

    /**
     * @brief Processes a new market tick.
     * Inserts or updates the closing price for the tick's trading day, regardless
     * of whether that day is before, equal to, or after the most recent day seen
     * so far. The window is then trimmed to the max_size_ most recent days.
     *
     * @param price The latest asset price.
     * @param epoch_seconds The Unix timestamp of the tick in seconds.
     */
    void add_price(double price, long long epoch_seconds);

    /**
     * @brief Checks if the window has enough data points to compute statistical variance.
     * @return true if there are at least 2 daily records, false otherwise.
     */
    bool is_ready() const;

    /**
     * @brief Gets the current number of daily records in the window.
     * @return size_t Current window size.
     */
    size_t get_current_size() const;

    /**
     * @brief Retrieves a thread-safe, chronologically-ordered copy of the historical prices.
     * @return std::vector<double> A snapshot of the daily prices, oldest to newest.
     */
    std::vector<double> get_snapshot() const;

private:
    size_t max_size_;                     ///< Maximum number of days to retain.
    std::map<long, double> daily_prices_; ///< day_index -> closing price, always sorted ascending by day.
    mutable std::mutex mutex_;             ///< Mutex to ensure thread-safety across Kafka consumers.
};