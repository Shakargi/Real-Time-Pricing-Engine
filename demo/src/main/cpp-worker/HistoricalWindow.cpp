#include "HistoricalWindow.hpp"
#include <stdexcept>

HistoricalWindow::HistoricalWindow(size_t max_window_size)
    : max_size_(max_window_size) {}

void HistoricalWindow::add_price(double price, long long epoch_seconds) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (price <= 0.0) {
        throw std::invalid_argument("Price must be strictly positive.");
    }

    // Convert Unix timestamp (seconds) to a distinct day index
    // 86400 seconds = 1 day
    long long tick_day_index = epoch_seconds / 86400;

    // Insert or overwrite the closing price for this specific day. Because
    // storage is keyed by day index rather than appended in arrival order,
    // it no longer matters whether this tick arrives before or after ticks
    // belonging to other days - historical backfill (past days) and live
    // trades (today) can interleave in any order over Kafka and still land
    // in the correct slot instead of being discarded as "stale."
    daily_prices_[tick_day_index] = price;

    // Enforce the sliding window size limit: keep only the max_size_ most
    // recent trading days. std::map keeps entries sorted by key (day index),
    // so the smallest key is always the oldest day.
    while (daily_prices_.size() > max_size_) {
        daily_prices_.erase(daily_prices_.begin());
    }
}

bool HistoricalWindow::is_ready() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return daily_prices_.size() >= 2;
}

size_t HistoricalWindow::get_current_size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return daily_prices_.size();
}

std::vector<double> HistoricalWindow::get_snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    // Return a copy, in chronological (ascending day) order, to allow
    // lock-free processing in the mathematical engine.
    std::vector<double> snapshot;
    snapshot.reserve(daily_prices_.size());
    for (const auto& [day_index, price] : daily_prices_) {
        snapshot.push_back(price);
    }
    return snapshot;
}