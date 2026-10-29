package com.zagainov.orders.exception;

/**
 * A request that is well-formed but conflicts with the current state of a resource (HTTP 409).
 */
public class ConflictException extends RuntimeException {

    private final String title;

    public ConflictException(String title, String message) {
        super(message);
        this.title = title;
    }

    public String getTitle() {
        return title;
    }
}
