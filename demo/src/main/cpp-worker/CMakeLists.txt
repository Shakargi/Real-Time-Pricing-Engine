cmake_minimum_required(VERSION 3.15)
project(PricingWorker)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(PricingWorker main.cpp)

target_link_libraries(PricingWorker rdkafka++ rdkafka)