#pragma once
#include <vector>

/**
 * @class MonteCarloEngine
 * @brief Core engine for simulating asset price paths using Geometric Brownian Motion.
 */
class MonteCarloEngine {
public:
    /**
     * @brief Generates simulated future price paths for an asset.
     * 
     * @param S0 Current price of the asset.
     * @param mu Annualized drift (expected return).
     * @param sigma Annualized volatility.
     * @param T Time to maturity in years (e.g., 30 days = 30/365.0).
     * @param num_steps Number of time steps in each path.
     * @param num_paths Number of independent paths to simulate.
     * @return std::vector<std::vector<double>> A matrix of simulated paths.
     */
    static std::vector<std::vector<double>> simulate_paths(
        double S0, 
        double mu, 
        double sigma, 
        double T, 
        size_t num_steps, 
        size_t num_paths
    );
};