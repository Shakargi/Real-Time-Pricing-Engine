#pragma once
#include <iostream>

class PricingEngine {
public:
    static double calculateOptionPrice(double current_price) {
        int grid_size = 10000;
        
        double* price_grid = new double[grid_size];
        
        double calculated_price = current_price * 1.05;
        
        delete[] price_grid;
        
        return calculated_price;
    }
};