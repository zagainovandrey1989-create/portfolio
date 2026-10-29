package com.zagainov.orders.service;

import com.zagainov.orders.domain.Product;
import com.zagainov.orders.dto.ProductRequest;
import com.zagainov.orders.exception.ConflictException;
import com.zagainov.orders.repository.OrderItemRepository;
import com.zagainov.orders.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private OrderItemRepository orderItemRepository;

    @InjectMocks
    private ProductService productService;

    @Test
    void createRejectsDuplicateSku() {
        when(productRepository.existsBySku("KB-1")).thenReturn(true);

        assertThatThrownBy(() -> productService.create(request("KB-1")))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("KB-1");

        verify(productRepository, never()).save(any());
    }

    @Test
    void updateRejectsSkuOwnedByAnotherProduct() {
        Product existing = new Product("KB-1", "Keyboard", null, new BigDecimal("10.00"), 1);
        when(productRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(productRepository.existsBySkuAndIdNot("MS-1", 1L)).thenReturn(true);

        assertThatThrownBy(() -> productService.update(1L, request("MS-1")))
                .isInstanceOf(ConflictException.class);

        verify(productRepository, never()).saveAndFlush(any());
    }

    @Test
    void deleteRejectsProductReferencedByOrders() {
        Product existing = new Product("KB-1", "Keyboard", null, new BigDecimal("10.00"), 1);
        when(productRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(orderItemRepository.existsByProductId(1L)).thenReturn(true);

        assertThatThrownBy(() -> productService.delete(1L))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("referenced by existing orders");

        verify(productRepository, never()).delete(any());
    }

    private static ProductRequest request(String sku) {
        return new ProductRequest(sku, "Name", null, new BigDecimal("10.00"), 5);
    }
}
