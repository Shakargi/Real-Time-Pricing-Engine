#include <iostream>
#include <string>
#include <librdkafka/rdkafkacpp.h>
#include <nlohmann/json.hpp>
#include "PricingEngine.hpp"

using json = nlohmann::json;

int main() {
    std::string brokers = "localhost:9092";
    std::string errstr;
    std::string topic_name = "market_ticks";
    std::string group_id = "pricing-engine-group";

    RdKafka::Conf *conf = RdKafka::Conf::create(RdKafka::Conf::CONF_GLOBAL);
    conf->set("bootstrap.servers", brokers, errstr);
    conf->set("group.id", group_id, errstr);
    conf->set("auto.offset.reset", "latest", errstr);

    RdKafka::KafkaConsumer *consumer = RdKafka::KafkaConsumer::create(conf, errstr);
    if (!consumer) {
        std::cerr << "Failed to create consumer: " << errstr << std::endl;
        return 1;
    }

    RdKafka::Producer *producer = RdKafka::Producer::create(conf, errstr);
    if (!producer){
        std::cerr << "Failed to create producer" << errstr << std::endl;
        return 1;
    }
    delete conf;

    std::vector<std::string> topics = { topic_name };
    RdKafka::ErrorCode err = consumer->subscribe(topics);
    if (err) {
        std::cerr << "Failed to subscribe: " << RdKafka::err2str(err) << std::endl;
        return 1;
    }

    std::cout << "Waiting for messages on " << topic_name << "..." << std::endl;

    while (true) {
        RdKafka::Message *msg = consumer->consume(1000);

        if (msg->err() == RdKafka::ERR_NO_ERROR) {
            try {
                std::string payload(static_cast<const char*>(msg->payload()), msg->len());
                
                json tick_data = json::parse(payload);

                std::string symbol = tick_data["symbol"];
                double price = tick_data["price"];

                double option_price = PricingEngine::calculateOptionPrice(price);

                std::cout << "[Processed] " << symbol 
                          << " | Stock: " << price 
                          << " -> Option Price: " << option_price << std::endl;


                json result_msg;
                result_msg["symbol"] = symbol;
                result_msg["underlying_price"] = price;
                result_msg["option_price"] = option_price;

                std::string result_str = result_msg.dump();

                RdKafka::ErrorCode produce_err = producer->produce(
                    "pricing_results",
                    RdKafka::Topic::PARTITION_UA,
                    RdKafka::Producer::RK_MSG_COPY,
                    const_cast<char*>(result_str.c_str()), result_str.size(),
                    NULL, 0, 0, NULL, NULL
                );

                if (produce_err != RdKafka::ERR_NO_ERROR) {
                    std::cerr << "Failed to produce to topic: " << RdKafka::err2str(produce_err) << std::endl;
                }

                producer->poll(0);
            } 
            catch (const json::parse_error& e) {
                std::cerr << "JSON Parse Error: " << e.what() << std::endl;
            }
        } 
        else if (msg->err() != RdKafka::ERR__PARTITION_EOF && msg->err() != RdKafka::ERR__TIMED_OUT) {
            std::cerr << "Consume failed: " << msg->errstr() << std::endl;
        }
        
        delete msg;
    }

    consumer->close();
    delete consumer;

    producer->flush(5000);
    delete producer;
    return 0;
}