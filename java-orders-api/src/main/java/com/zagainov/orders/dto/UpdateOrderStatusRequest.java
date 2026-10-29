package com.zagainov.orders.dto;

import com.zagainov.orders.domain.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record UpdateOrderStatusRequest(
        @Schema(example = "PAID")
        @NotNull
        OrderStatus status) {
}
