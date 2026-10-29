package com.zagainov.orders.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateOrderRequest(
        @Schema(example = "buyer@example.com")
        @NotBlank
        @Email
        @Size(max = 254)
        String customerEmail,

        @NotEmpty
        @Size(max = 100)
        List<@Valid @NotNull Item> items) {

    public record Item(
            @Schema(example = "1")
            @NotNull
            @Positive
            Long productId,

            @Schema(example = "2")
            @NotNull
            @Min(1)
            @Max(1000)
            Integer quantity) {
    }
}
