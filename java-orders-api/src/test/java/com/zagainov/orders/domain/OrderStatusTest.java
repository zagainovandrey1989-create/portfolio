package com.zagainov.orders.domain;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class OrderStatusTest {

    @ParameterizedTest(name = "{0} -> {1} allowed = {2}")
    @CsvSource({
            "NEW, PAID, true",
            "NEW, CANCELLED, true",
            "NEW, SHIPPED, false",
            "PAID, SHIPPED, true",
            "PAID, CANCELLED, true",
            "PAID, NEW, false",
            "SHIPPED, DELIVERED, true",
            "SHIPPED, CANCELLED, false",
            "DELIVERED, CANCELLED, false",
            "CANCELLED, NEW, false",
            "CANCELLED, PAID, false"
    })
    void enforcesLifecycle(OrderStatus from, OrderStatus to, boolean allowed) {
        assertThat(from.canTransitionTo(to)).isEqualTo(allowed);
    }
}
