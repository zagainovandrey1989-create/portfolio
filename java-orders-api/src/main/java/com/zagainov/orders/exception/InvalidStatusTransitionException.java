package com.zagainov.orders.exception;

import com.zagainov.orders.domain.OrderStatus;

public class InvalidStatusTransitionException extends ConflictException {

    public InvalidStatusTransitionException(OrderStatus from, OrderStatus to) {
        super("Invalid status transition",
                "Order cannot move from %s to %s".formatted(from, to));
    }
}
