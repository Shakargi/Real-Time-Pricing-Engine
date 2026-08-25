#pragma once
#include <vector>

/**
 * @class StochasticCalculator
 * @brief A stateless utility class for computing stochastic market parameters.
 *
 * This class calculates the annualized drift and volatility required for 
 * modeling asset price paths using Geometric Brownian Motion (GBM). 
 * It operates entirely on discrete, thread-safe daily price snapshots, 
 * ensuring high performance and safety in a distributed architecture.
 */
class StochasticCalculator {
public:
    /**
     * @brief Computes the annualized volatility (sigma) from historical prices.
     * 
     * Volatility is derived from the sample variance of the logarithmic returns,
     * scaled by the square root of the number of trading days in a year.
     * 
     * @param prices A chronological snapshot of daily closing prices.
     * @param trading_days The expected number of trading days in a year (default: 252.0).
     * @return double The annualized volatility as a decimal (e.g., 0.25 for 25%). 
     *         Returns 0.0 if the provided dataset contains fewer than 2 prices.
     */
    static double get_annualized_volatility(const std::vector<double>& prices, double trading_days = 252.0);

    /**
     * @brief Computes the annualized drift (mu) from historical prices.
     *
     * This calculation applies Itô's Lemma to adjust the empirical mean return 
     * by adding half of the daily variance. This correction is essential to 
     * accurately reflect the continuous-time stochastic process.
     *
     * @param prices A chronological snapshot of daily closing prices.
     * @param trading_days The expected number of trading days in a year (default: 252.0).
     * @return double The annualized drift as a decimal. Returns 0.0 if data is insufficient.
     */
    static double get_annualized_drift(const std::vector<double>& prices, double trading_days = 252.0);

private:
    /**
     * @brief Calculates the continuous (logarithmic) returns between consecutive prices.
     */
    static std::vector<double> calculate_log_returns(const std::vector<double>& prices);
    
    /**
     * @brief Computes the arithmetic mean of a given dataset.
     */
    static double calculate_mean(const std::vector<double>& data);
    
    /**
     * @brief Computes the sample variance (n-1 degrees of freedom) of a dataset.
     */
    static double calculate_variance(const std::vector<double>& data, double mean);
};