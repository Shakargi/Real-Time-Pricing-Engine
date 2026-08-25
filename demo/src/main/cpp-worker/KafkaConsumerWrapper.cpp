#include "KafkaConsumerWrapper.hpp"
#include <iostream>
#include <chrono>

KafkaConsumerWrapper::KafkaConsumerWrapper(const std::string& brokers, const std::string& topic, const std::string& group_id)
    : topic_(topic), 
      config_({
          {"metadata.broker.list", brokers},
          {"group.id", group_id},
          // Crucial configuration: Instructs the consumer to start from the earliest offset
          // if no previous offset exists, ensuring we catch the historical backfill data.
          {"auto.offset.reset", "earliest"} 
      }),
      consumer_(config_),
      running_(false) {
}

KafkaConsumerWrapper::~KafkaConsumerWrapper() {
    stop();
}

void KafkaConsumerWrapper::start(MessageCallback callback) {
    // Subscribe to the designated Kafka topic
    consumer_.subscribe({topic_});
    running_ = true;

    std::cout << "[+] C++ Kafka Consumer started. Listening to topic: " << topic_ << std::endl;

    // Main event loop for polling incoming messages
    while (running_) {
        // Poll for a message with a 1000ms timeout to allow responsive shutdowns
        cppkafka::Message msg = consumer_.poll(std::chrono::milliseconds(1000));

        if (msg) {
            // Check if the message contains an error status
            if (msg.get_error()) {
                // Ignore EOF errors, which simply indicate reaching the end of the partition
                if (!msg.is_eof()) {
                    std::cerr << "[-] Kafka error: " << msg.get_error().to_string() << std::endl;
                }
            } else {
                // Successfully received a message; extract payload into a standard string
                std::string payload(
                    reinterpret_cast<const char*>(msg.get_payload().get_data()), 
                    msg.get_payload().get_size()
                );
                
                // Invoke the provided callback with the raw message payload
                callback(payload);
            }
        }
    }
}

void KafkaConsumerWrapper::stop() {
    running_ = false;
}