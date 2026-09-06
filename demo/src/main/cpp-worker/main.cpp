#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <exception>
#include <chrono>

#include <nlohmann/json.hpp>
#include <cppkafka/cppkafka.h> 

#include "HistoricalWindow.hpp"
#include "StochasticCalculator.hpp"
#include "MonteCarloEngine.hpp"

using json = nlohmann::json;
using namespace cppkafka;

// ==========================================
// CONFIGURATION CONSTANTS
// ==========================================
constexpr const char* KAFKA_BROKER_LIST = "localhost:9092";
constexpr const char* CONSUMER_GROUP_ID = "cpp-monte-carlo-engine-group";
constexpr const char* INPUT_TOPIC = "monte-carlo.requests";
constexpr const char* OUTPUT_TOPIC = "monte-carlo.results";

constexpr size_t MIN_REQUIRED_HISTORY_DAYS = 30;
constexpr size_t SIMULATION_PATHS = 10000;
constexpr double TIME_TO_MATURITY_YEARS = 1.0;
constexpr int HISTOGRAM_BINS = 20;

int main() {
    std::cout << "[+] Starting C++ Monte Carlo Pricing Engine Worker...\n";
    
    // ---------------------------------------------------------
    // Kafka Consumer Setup (Listening to requests from Java/React)
    // ---------------------------------------------------------
    Configuration consumer_config = {
        { "metadata.broker.list", KAFKA_BROKER_LIST },
        { "group.id", CONSUMER_GROUP_ID },
        { "auto.offset.reset", "latest" }
    };

    Consumer consumer(consumer_config);
    consumer.subscribe({ INPUT_TOPIC });
    
    // ---------------------------------------------------------
    // Kafka Producer Setup (Sending results back to Java)
    // ---------------------------------------------------------
    Configuration producer_config = {
        { "metadata.broker.list", KAFKA_BROKER_LIST }
    };

    Producer producer(producer_config);

    std::cout << "[+] C++ Kafka Consumer started. Listening to: " << INPUT_TOPIC << "\n";
    std::cout << "[+] C++ Kafka Producer ready. Publishing to: " << OUTPUT_TOPIC << "\n";

    // ---------------------------------------------------------
    // Main Event Loop
    // ---------------------------------------------------------
    while (true) {
        Message msg = consumer.poll(std::chrono::milliseconds(1000));
        
        if (!msg) continue;
        if (msg.get_error()) {
            if (!msg.is_eof()) {
                std::cerr << "[-] Kafka error: " << msg.get_error().to_string() << "\n";
            }
            continue;
        }

        try {
            std::string payload(msg.get_payload());
            json request = json::parse(payload);
            
            // Handle potential double-serialization from Java/Spring Boot routing
            if (request.is_string()) {
                request = json::parse(request.get<std::string>());
            }
            
            std::string action = request.value("action", "run_simulation");
            std::string symbol = request.value("symbol", "UNKNOWN");
            std::string sessionId = request.value("sessionId", "");

            if (action == "run_simulation") {
                std::cout << "\n[+] Processing simulation task for symbol: " << symbol 
                          << " (Session: " << sessionId << ")" << std::endl;

                // Step 1: Extract Real-Time Market Data
                std::vector<double> historical_prices;
                if (request.contains("historicalPrices") && request["historicalPrices"].is_array()) {
                    historical_prices = request["historicalPrices"].get<std::vector<double>>();
                }

                double current_price = request.value("currentPrice", 0.0);

                if (historical_prices.size() < MIN_REQUIRED_HISTORY_DAYS) {
                    std::cerr << "[-] Not enough historical data for accurate simulation. Got " 
                              << historical_prices.size() << " days.\n";
                    continue;
                }

                // Step 2: Calculate Stochastic Parameters dynamically
                double trading_days = (symbol.find("USDT") != std::string::npos) ? 365.0 : 252.0;
                double sigma = StochasticCalculator::get_annualized_volatility(historical_prices, trading_days);
                double mu = StochasticCalculator::get_annualized_drift(historical_prices, trading_days);
                size_t future_days = static_cast<size_t>(trading_days);

                std::cout << "    [>] Current Price: $" << current_price << "\n";
                std::cout << "    [>] Analyzed Data Points: " << historical_prices.size() << " days\n";
                std::cout << "    [>] Calculated Drift (mu): " << (mu * 100.0) << "%\n";
                std::cout << "    [>] Calculated Volatility (sigma): " << (sigma * 100.0) << "%\n";

                // Step 3: Execute Monte Carlo Geometric Brownian Motion (GBM)
                auto paths = MonteCarloEngine::simulate_paths(
                    current_price, mu, sigma, TIME_TO_MATURITY_YEARS, future_days, SIMULATION_PATHS
                );
                
                if (paths.empty() || paths[0].empty()) {
                    std::cerr << "[-] Monte Carlo engine returned empty paths.\n";
                    continue;
                }

                size_t num_steps = paths[0].size();

                // Step 4: Aggregate Time-Series Fan Chart Data (Percentiles)
                std::vector<double> time_steps(num_steps);
                std::vector<double> p5(num_steps);
                std::vector<double> median(num_steps);
                std::vector<double> p95(num_steps);

                for (size_t t = 0; t < num_steps; ++t) {
                    time_steps[t] = (TIME_TO_MATURITY_YEARS / num_steps) * t;
                    
                    std::vector<double> column_prices;
                    column_prices.reserve(SIMULATION_PATHS);
                    for (size_t p = 0; p < SIMULATION_PATHS; ++p) {
                        column_prices.push_back(paths[p][t]);
                    }

                    std::sort(column_prices.begin(), column_prices.end());
                    
                    p5[t]     = column_prices[static_cast<size_t>(SIMULATION_PATHS * 0.05)];
                    median[t] = column_prices[static_cast<size_t>(SIMULATION_PATHS * 0.50)];
                    p95[t]    = column_prices[static_cast<size_t>(SIMULATION_PATHS * 0.95)];
                }

                // Step 5: Aggregate Final Distribution Histogram
                std::vector<double> final_prices;
                final_prices.reserve(SIMULATION_PATHS);
                for (size_t p = 0; p < SIMULATION_PATHS; ++p) {
                    final_prices.push_back(paths[p].back());
                }

                double min_price = *std::min_element(final_prices.begin(), final_prices.end());
                double max_price = *std::max_element(final_prices.begin(), final_prices.end());
                
                double bin_width = (max_price - min_price) / HISTOGRAM_BINS;
                if (bin_width == 0) bin_width = 1.0;

                std::vector<int> bin_counts(HISTOGRAM_BINS, 0);
                for (double price : final_prices) {
                    int bin_idx = static_cast<int>((price - min_price) / bin_width);
                    if (bin_idx >= HISTOGRAM_BINS) bin_idx = HISTOGRAM_BINS - 1;
                    if (bin_idx < 0) bin_idx = 0;
                    bin_counts[bin_idx]++;
                }

                json histogram_json = json::array();
                for (int i = 0; i < HISTOGRAM_BINS; ++i) {
                    double bin_center = min_price + (i + 0.5) * bin_width;
                    histogram_json.push_back({
                        {"binCenter", bin_center},
                        {"count", bin_counts[i]}
                    });
                }

                // Step 6: Serialize Data Transfer Object (DTO) for Frontend
                json result_json = {
                    {"sessionId", sessionId},
                    {"symbol", symbol},
                    {"currentPrice", current_price},
                    {"simulatedPaths", SIMULATION_PATHS},
                    {"timeToMaturity", TIME_TO_MATURITY_YEARS},
                    {"drift", mu},
                    {"volatility", sigma},
                    {"fanChart", {
                        {"timeSteps", time_steps},
                        {"percentile5", p5},
                        {"median", median},
                        {"percentile95", p95}
                    }},
                    {"histogram", histogram_json}
                };

                // Step 7: Publish back to Message Broker
                std::string json_str = result_json.dump();
                producer.produce(MessageBuilder(OUTPUT_TOPIC).payload(json_str));
                producer.flush();

                std::cout << "[+] Simulation results published back to " << OUTPUT_TOPIC 
                          << " for session: " << sessionId << "\n";
            }
        } catch (const json::exception& e) {
            std::cerr << "[-] JSON Parsing error: " << e.what() << "\n";
        } catch (const std::exception& e) {
            std::cerr << "[-] Error processing simulation task: " << e.what() << "\n";
        }
    }

    return 0;
}