#ifndef MARKET_TICK_HPP
#define MARKET_TICK_HPP

#include <string>
#include <nlohmann/json.hpp>

/**
 * @brief Represents a single market data point or historical candlestick.
 * Directly mirrors the Java MarketTick record.
 */
struct MarketTick {
    std::string symbol;
    double price;
    int volume;
    long long timestamp;

    /**
     * @brief Factory method to parse a JSON string into a MarketTick object.
     * @param json_payload The raw JSON string received from Kafka.
     * @return A populated MarketTick struct.
     */
    static MarketTick from_json(const std::string& json_payload) {
        // Parse the raw string into a JSON object
        auto j = nlohmann::json::parse(json_payload);
        
        // Map the JSON fields to the struct members
        return MarketTick{
            j.at("symbol").get<std::string>(),
            j.at("price").get<double>(),
            j.at("volume").get<int>(),
            j.at("timestamp").get<long long>()
        };
    }
};

#endif // MARKET_TICK_HPP