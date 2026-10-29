package com.zagainov.orders.service;

import com.zagainov.orders.domain.Order;
import com.zagainov.orders.domain.OrderStatus;
import com.zagainov.orders.domain.Product;
import com.zagainov.orders.dto.CreateOrderRequest;
import com.zagainov.orders.dto.OrderResponse;
import com.zagainov.orders.dto.PageResponse;
import com.zagainov.orders.exception.NotFoundException;
import com.zagainov.orders.repository.OrderRepository;
import com.zagainov.orders.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;

    public OrderService(OrderRepository orderRepository, ProductRepository productRepository) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
    }

    /**
     * Creates an order and reserves stock for every line. Lines for the same product are merged.
     * The whole operation is atomic: if any line cannot be fulfilled, no stock is reserved.
     */
    @Transactional
    public OrderResponse create(CreateOrderRequest request) {
        Map<Long, Integer> quantities = request.items().stream()
                .collect(Collectors.toMap(
                        CreateOrderRequest.Item::productId,
                        CreateOrderRequest.Item::quantity,
                        Integer::sum,
                        LinkedHashMap::new));

        Map<Long, Product> products = productRepository.findAllById(quantities.keySet()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));

        List<Long> missing = quantities.keySet().stream()
                .filter(id -> !products.containsKey(id))
                .toList();
        if (!missing.isEmpty()) {
            throw new NotFoundException("Products not found: " + missing);
        }

        Order order = new Order(request.customerEmail());
        quantities.forEach((productId, quantity) -> order.addItem(products.get(productId), quantity));

        return OrderResponse.from(orderRepository.save(order));
    }

    public OrderResponse get(Long id) {
        return OrderResponse.from(findOrder(id));
    }

    public PageResponse<OrderResponse> list(OrderStatus status, Pageable pageable) {
        Page<Order> page = status == null
                ? orderRepository.findAll(pageable)
                : orderRepository.findByStatus(status, pageable);
        return PageResponse.from(page.map(OrderResponse::from));
    }

    /**
     * Applies a status transition. Rules live in {@link OrderStatus}; cancelling restores stock.
     */
    @Transactional
    public OrderResponse changeStatus(Long id, OrderStatus target) {
        Order order = findOrder(id);
        order.transitionTo(target);
        return OrderResponse.from(orderRepository.saveAndFlush(order));
    }

    @Transactional
    public OrderResponse cancel(Long id) {
        return changeStatus(id, OrderStatus.CANCELLED);
    }

    private Order findOrder(Long id) {
        return orderRepository.findById(id).orElseThrow(() -> NotFoundException.of("Order", id));
    }
}
