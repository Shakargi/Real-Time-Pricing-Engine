#include "StochasticCalculator.hpp"
#include <cmath>
#include <numeric>

// ------------------------------------------------------------------------
// Private Helper Functions
// ------------------------------------------------------------------------

std::vector<double> StochasticCalculator::calculate_log_returns(const std::vector<double>& prices) {
    if (prices.size() < 2) return {};
    
    std::vector<double> returns;
    // Pre-allocate memory to prevent costly reallocations during vector growth
    returns.reserve(prices.size() - 1); 
    
    // Calculate continuously compounded returns: u_i = ln(S_i / S_{i-1})
    for (size_t i = 1; i < prices.size(); ++i) {
        returns.push_back(std::log(prices[i] / prices[i - 1]));
    }
    return returns;
}

double StochasticCalculator::calculate_mean(const std::vector<double>& data) {
    if (data.empty()) return 0.0;
    
    // std::accumulate is highly optimized for summing contiguous memory arrays
    double sum = std::accumulate(data.begin(), data.end(), 0.0);
    return sum / data.size();
}

double StochasticCalculator::calculate_variance(const std::vector<double>& data, double mean) {
    if (data.size() < 2) return 0.0;
    
    double sq_sum = 0.0;
    // Calculate the sum of squared deviations from the mean
    for (double val : data) {
        sq_sum += (val - mean) * (val - mean);
    }
    // Return sample variance using Bessel's correction (n - 1)
    return sq_sum / (data.size() - 1); 
}

// ------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------

double StochasticCalculator::get_annualized_volatility(const std::vector<double>& prices, double trading_days) {
    if (prices.size() < 2) return 0.0;

    auto returns = calculate_log_returns(prices);
    double mean = calculate_mean(returns);
    double variance = calculate_variance(returns, mean);
    
    // Convert daily variance to daily standard deviation
    double daily_volatility = std::sqrt(variance);
    
    // Scale to annualized volatility assuming independent and identically distributed returns
    return daily_volatility * std::sqrt(trading_days);
}

double StochasticCalculator::get_annualized_drift(const std::vector<double>& prices, double trading_days) {
    if (prices.size() < 2) return 0.0;

    auto returns = calculate_log_returns(prices);
    double mean = calculate_mean(returns);
    double variance = calculate_variance(returns, mean);
    
    // Apply Itô's Lemma correction: The expected return of a log-normal process 
    // requires adding half the variance to the empirical mean.
    double daily_drift = mean + (variance / 2.0);
    
    // Scale linearly to annualized drift
    return daily_drift * trading_days;
}