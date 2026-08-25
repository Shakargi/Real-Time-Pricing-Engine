#include "MonteCarloEngine.hpp"
#include <cmath>
#include <random>

std::vector<std::vector<double>> MonteCarloEngine::simulate_paths(
    double S0, double mu, double sigma, double T, size_t num_steps, size_t num_paths) {

    // Initialize the paths matrix: num_paths rows, num_steps + 1 columns (to include S0)
    std::vector<std::vector<double>> paths(num_paths, std::vector<double>(num_steps + 1));
    
    // Pre-calculate constants for the loop to save CPU cycles
    double dt = T / static_cast<double>(num_steps);
    double drift_term = (mu - 0.5 * sigma * sigma) * dt;
    double vol_term = sigma * std::sqrt(dt);

    // thread_local ensures lock-free random number generation in parallel environments.
    // The Mersenne Twister engine (mt19937) provides high-quality randomness.
    thread_local std::random_device rd;
    thread_local std::mt19937 generator(rd());
    std::normal_distribution<double> standard_normal(0.0, 1.0);

    for (size_t i = 0; i < num_paths; ++i) {
        paths[i][0] = S0; // Starting price
        
        for (size_t j = 1; j <= num_steps; ++j) {
            double Z = standard_normal(generator);
            // Geometric Brownian Motion step
            paths[i][j] = paths[i][j - 1] * std::exp(drift_term + vol_term * Z);
        }
    }

    return paths;
}