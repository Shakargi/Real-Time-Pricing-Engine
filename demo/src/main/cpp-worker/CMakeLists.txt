set(CMAKE_TOOLCHAIN_FILE "${CMAKE_CURRENT_SOURCE_DIR}/vcpkg/scripts/buildsystems/vcpkg.cmake" CACHE STRING "Vcpkg toolchain file")

cmake_minimum_required(VERSION 3.15)
project(PricingWorker)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CppKafka CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_executable(PricingWorker
    main.cpp
    KafkaConsumerWrapper.cpp
    HistoricalWindow.cpp
    StochasticCalculator.cpp
    MonteCarloEngine.cpp
)

target_link_libraries(PricingWorker PRIVATE CppKafka::cppkafka nlohmann_json::nlohmann_json)