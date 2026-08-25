#ifndef KAFKA_CONSUMER_WRAPPER_HPP
#define KAFKA_CONSUMER_WRAPPER_HPP

#include <string>
#include <functional>
#include <cppkafka/cppkafka.h>

/**
 * @brief Wrapper class around cppkafka to manage connection and message consumption from a Kafka topic.
 * 
 * Encapsulates Kafka configuration, subscription handling, and a blocking polling loop,
 * exposing a clean callback interface for incoming message payloads.
 */
class KafkaConsumerWrapper {
public:
    // Defines a callback function type that accepts the raw JSON string payload of a message
    using MessageCallback = std::function<void(const std::string&)>;

    /**
     * @brief Constructs a new Kafka Consumer Wrapper.
     * 
     * @param brokers  The Kafka broker list address (e.g., "localhost:9092")
     * @param topic    The Kafka topic name to subscribe to (e.g., "market_ticks")
     * @param group_id The consumer group identifier for offset tracking
     */
    KafkaConsumerWrapper(const std::string& brokers, const std::string& topic, const std::string& group_id);
    
    /**
     * @brief Destructor ensuring the consumer stops running safely.
     */
    ~KafkaConsumerWrapper();

    /**
     * @brief Starts the main message polling loop. This is a blocking call.
     * 
     * @param callback The function to execute whenever a valid message payload arrives.
     */
    void start(MessageCallback callback);
    
    /**
     * @brief Signals the polling loop to terminate safely.
     */
    void stop();

private:
    std::string topic_;
    cppkafka::Configuration config_;
    cppkafka::Consumer consumer_;
    bool running_;
};

#endif // KAFKA_CONSUMER_WRAPPER_HPP