#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>
#include <exception>
#include <chrono>

#include <nlohmann/json.hpp>
#include <cppkafka/cppkafka.h> 

#include "HistoricalWindow.hpp"
#include "StochasticCalculator.hpp"
#include "MonteCarloEngine.hpp"

using json = nlohmann::json;
using namespace cppkafka;

int main() {
    std::cout << "[+] Starting C++ Pricing Engine Worker...\n";
    
    std::unordered_map<std::string, HistoricalWindow> asset_windows;

    Configuration config = {
        { "metadata.broker.list", "localhost:9092" },
        { "group.id", "pricing-engine-group-v2" },
        { "auto.offset.reset", "earliest" } 
    };

    Consumer consumer(config);
    std::string topic_name = "market_ticks";
    consumer.subscribe({ topic_name });
    
    std::cout << "[+] C++ Kafka Consumer started. Listening to topic: " << topic_name << "\n";

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
            json tick = json::parse(payload);
            
            std::string symbol = tick["symbol"];
            double price = tick["price"];
            long long timestamp_ms = tick["timestamp"]; 
            long long epoch_sec = timestamp_ms / 1000;

            // עדכון המחיר - ייצור חלון חדש של 365 ימים אם זו מניה חדשה
            asset_windows[symbol].add_price(price, epoch_sec);

            if (asset_windows[symbol].is_ready()) {
                std::vector<double> snapshot = asset_windows[symbol].get_snapshot();
                
                // זיהוי אוטומטי של מספר ימי המסחר בשנה (קריפטו לעומת וול סטריט)
                double trading_days = (symbol.find("USDT") != std::string::npos) ? 365.0 : 252.0;

                double sigma = StochasticCalculator::get_annualized_volatility(snapshot, trading_days);
                double mu = StochasticCalculator::get_annualized_drift(snapshot, trading_days);
                
                // הדפסה שמראה בבירור את גודל המדגם ביחס לחלון המקסימלי
                std::cout << "[*] " << symbol 
                          << " | Data points: " << snapshot.size() << "/365"
                          << " | Price: $" << price 
                          << " | Drift: " << (mu * 100.0) << "%" 
                          << " | Vol: " << (sigma * 100.0) << "%\n";

                // הרצת מונטה קרלו רק אם יש לנו מינימום מדגם סטטיסטי סביר (30 ימי מסחר היסטוריים)
                if (snapshot.size() >= 30 && sigma > 0.0) {
                    size_t future_days = 30; // אופק התחזית שלנו (כמה ימים קדימה לחזות)
                    double T = future_days / trading_days; 
                    size_t num_paths = 10000;

                    auto paths = MonteCarloEngine::simulate_paths(price, mu, sigma, T, future_days, num_paths);
                    
                    double expected_price = 0.0;
                    for (const auto& path : paths) {
                        expected_price += path.back(); 
                    }
                    expected_price /= num_paths;
                    
                    std::cout << "    [->] MC Simulation (10,000 paths): Expected Price in " 
                              << future_days << " days = $" << expected_price << "\n";
                }
            }
        } catch (const json::exception& e) {
            std::cerr << "[-] JSON Parsing error: " << e.what() << "\n";
        } catch (const std::exception& e) {
            std::cerr << "[-] Error processing tick: " << e.what() << "\n";
        }
    }

    return 0;
}