package com.zagainov.orders.service;

import com.zagainov.orders.domain.Order;
import com.zagainov.orders.domain.OrderStatus;
import com.zagainov.orders.domain.Product;
import com.zagainov.orders.dto.CreateOrderRequest;
import com.zagainov.orders.dto.OrderResponse;
import com.zagainov.orders.exception.InsufficientStockException;
import com.zagainov.orders.exception.InvalidStatusTransitionException;
import com.zagainov.orders.exception.NotFoundException;
import com.zagainov.orders.repository.OrderRepository;
import com.zagainov.orders.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private OrderService orderService;

    private Product keyboard;
    private Product mouse;

    @BeforeEach
    void setUp() {
        keyboard = product(1L, "KB-1", "Keyboard", "89.90", 10);
        mouse = product(2L, "MS-1", "Mouse", "19.99", 5);
    }

    @Test
    void createComputesTotalsAndReservesStock() {
        when(productRepository.findAllById(any())).thenReturn(List.of(keyboard, mouse));
        when(orderRepository.save(any(Order.class))).then(returnsFirstArg());

        OrderResponse response = orderService.create(request(item(1L, 2), item(2L, 3)));

        assertThat(response.status()).isEqualTo(OrderStatus.NEW);
        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0).lineTotal()).isEqualByComparingTo("179.80");
        assertThat(response.items().get(1).lineTotal()).isEqualByComparingTo("59.97");
        assertThat(response.totalAmount()).isEqualByComparingTo("239.77");
        assertThat(keyboard.getStockQuantity()).isEqualTo(8);
        assertThat(mouse.getStockQuantity()).isEqualTo(2);
    }

    @Test
    void createMergesDuplicateLinesForSameProduct() {
        when(productRepository.findAllById(any())).thenReturn(List.of(mouse));
        when(orderRepository.save(any(Order.class))).then(returnsFirstArg());

        OrderResponse response = orderService.create(request(item(2L, 1), item(2L, 2)));

        assertThat(response.items()).singleElement()
                .satisfies(line -> assertThat(line.quantity()).isEqualTo(3));
        assertThat(mouse.getStockQuantity()).isEqualTo(2);
    }

    @Test
    void createFailsWhenStockIsInsufficient() {
        when(productRepository.findAllById(any())).thenReturn(List.of(mouse));

        assertThatThrownBy(() -> orderService.create(request(item(2L, 6))))
                .isInstanceOf(InsufficientStockException.class)
                .hasMessageContaining("requested 6, available 5");

        verify(orderRepository, never()).save(any());
        assertThat(mouse.getStockQuantity()).isEqualTo(5);
    }

    @Test
    void createFailsWhenProductDoesNotExist() {
        when(productRepository.findAllById(any())).thenReturn(List.of(keyboard));

        assertThatThrownBy(() -> orderService.create(request(item(1L, 1), item(99L, 1))))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("99");

        verify(orderRepository, never()).save(any());
        assertThat(keyboard.getStockQuantity()).isEqualTo(10);
    }

    @Test
    void cancelRestoresStock() {
        Order order = new Order("buyer@example.com");
        order.addItem(keyboard, 4);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order));
        when(orderRepository.saveAndFlush(order)).thenReturn(order);

        OrderResponse response = orderService.cancel(7L);

        assertThat(response.status()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(keyboard.getStockQuantity()).isEqualTo(10);
    }

    @Test
    void cancelIsRejectedForShippedOrder() {
        Order order = new Order("buyer@example.com");
        order.addItem(keyboard, 1);
        order.transitionTo(OrderStatus.PAID);
        order.transitionTo(OrderStatus.SHIPPED);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> orderService.cancel(7L))
                .isInstanceOf(InvalidStatusTransitionException.class);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(keyboard.getStockQuantity()).isEqualTo(9);
    }

    @Test
    void changeStatusAppliesAllowedTransition() {
        Order order = new Order("buyer@example.com");
        order.addItem(mouse, 1);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order));
        when(orderRepository.saveAndFlush(order)).thenReturn(order);

        assertThat(orderService.changeStatus(7L, OrderStatus.PAID).status()).isEqualTo(OrderStatus.PAID);
        assertThat(mouse.getStockQuantity()).isEqualTo(4);
    }

    @Test
    void getUnknownOrderThrowsNotFound() {
        when(orderRepository.findById(42L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderService.get(42L))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Order with id 42 was not found");
    }

    private static Product product(Long id, String sku, String name, String price, int stock) {
        Product product = new Product(sku, name, null, new BigDecimal(price), stock);
        ReflectionTestUtils.setField(product, "id", id);
        return product;
    }

    private static CreateOrderRequest.Item item(Long productId, int quantity) {
        return new CreateOrderRequest.Item(productId, quantity);
    }

    private static CreateOrderRequest request(CreateOrderRequest.Item... items) {
        return new CreateOrderRequest("buyer@example.com", List.of(items));
    }
}
