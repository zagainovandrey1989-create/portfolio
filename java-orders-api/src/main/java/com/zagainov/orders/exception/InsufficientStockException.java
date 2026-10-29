package com.zagainov.orders.exception;

public class InsufficientStockException extends ConflictException {

    public InsufficientStockException(String sku, int requested, int available) {
        super("Insufficient stock",
                "Product %s: requested %d, available %d".formatted(sku, requested, available));
    }
}
