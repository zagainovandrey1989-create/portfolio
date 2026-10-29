package com.zagainov.orders.web;

import com.zagainov.orders.domain.OrderStatus;
import com.zagainov.orders.dto.CreateOrderRequest;
import com.zagainov.orders.dto.OrderResponse;
import com.zagainov.orders.dto.PageResponse;
import com.zagainov.orders.dto.UpdateOrderStatusRequest;
import com.zagainov.orders.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Order placement and lifecycle")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    @Operation(summary = "Place an order", description = "Validates stock, reserves it and computes totals.")
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        OrderResponse created = orderService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get an order by id")
    public OrderResponse get(@PathVariable Long id) {
        return orderService.get(id);
    }

    @GetMapping
    @Operation(summary = "List orders (paged), optionally filtered by status")
    public PageResponse<OrderResponse> list(
            @RequestParam(required = false) OrderStatus status,
            @ParameterObject @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return orderService.list(status, pageable);
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Move an order to another status",
            description = "Allowed: NEW->PAID|CANCELLED, PAID->SHIPPED|CANCELLED, SHIPPED->DELIVERED.")
    public OrderResponse changeStatus(@PathVariable Long id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return orderService.changeStatus(id, request.status());
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "Cancel an order and restore stock")
    public OrderResponse cancel(@PathVariable Long id) {
        return orderService.cancel(id);
    }
}
