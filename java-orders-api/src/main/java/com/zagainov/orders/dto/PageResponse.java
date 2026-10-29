package com.zagainov.orders.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Stable JSON shape for paged results, independent of Spring Data's internal {@code Page} serialization.
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
