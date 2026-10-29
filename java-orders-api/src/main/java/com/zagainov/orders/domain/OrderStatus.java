package com.zagainov.orders.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Order lifecycle. Allowed transitions:
 * <pre>
 * NEW -> PAID -> SHIPPED -> DELIVERED
 *  \        \
 *   +--------+--> CANCELLED
 * </pre>
 * DELIVERED and CANCELLED are terminal.
 */
public enum OrderStatus {
    NEW,
    PAID,
    SHIPPED,
    DELIVERED,
    CANCELLED;

    public Set<OrderStatus> allowedTransitions() {
        return switch (this) {
            case NEW -> EnumSet.of(PAID, CANCELLED);
            case PAID -> EnumSet.of(SHIPPED, CANCELLED);
            case SHIPPED -> EnumSet.of(DELIVERED);
            case DELIVERED, CANCELLED -> EnumSet.noneOf(OrderStatus.class);
        };
    }

    public boolean canTransitionTo(OrderStatus target) {
        return allowedTransitions().contains(target);
    }
}
