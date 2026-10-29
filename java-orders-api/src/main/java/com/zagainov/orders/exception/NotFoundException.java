package com.zagainov.orders.exception;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException of(String resource, Object id) {
        return new NotFoundException("%s with id %s was not found".formatted(resource, id));
    }
}
