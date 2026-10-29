package com.zagainov.orders.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record ProductRequest(
        @Schema(example = "KB-MECH-01")
        @NotBlank
        @Pattern(regexp = "^[A-Z0-9-]{3,64}$", message = "must be 3-64 characters: A-Z, 0-9 or '-'")
        String sku,

        @Schema(example = "Mechanical Keyboard")
        @NotBlank
        @Size(max = 200)
        String name,

        @Size(max = 2000)
        String description,

        @Schema(example = "89.90")
        @NotNull
        @DecimalMin(value = "0.00", inclusive = false)
        @Digits(integer = 10, fraction = 2)
        BigDecimal price,

        @Schema(example = "25")
        @NotNull
        @PositiveOrZero
        Integer stockQuantity) {
}
