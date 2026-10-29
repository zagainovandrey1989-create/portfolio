package com.zagainov.orders.dto;

import com.zagainov.orders.domain.Order;
import com.zagainov.orders.domain.OrderItem;
import com.zagainov.orders.domain.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OrderResponse(
        Long id,
        String customerEmail,
        OrderStatus status,
        List<Item> items,
        BigDecimal totalAmount,
        Instant createdAt,
        Instant updatedAt) {

    public record Item(
            Long productId,
            String productName,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal) {

        static Item from(OrderItem item) {
            return new Item(
                    item.getProduct().getId(),
                    item.getProductName(),
                    item.getUnitPrice(),
                    item.getQuantity(),
                    item.getLineTotal());
        }
    }

    public static OrderResponse from(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getCustomerEmail(),
                order.getStatus(),
                order.getItems().stream().map(Item::from).toList(),
                order.getTotalAmount(),
                order.getCreatedAt(),
                order.getUpdatedAt());
    }
}
