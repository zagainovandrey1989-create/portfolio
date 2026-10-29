package com.zagainov.orders.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import com.zagainov.orders.domain.Product;
import com.zagainov.orders.dto.CreateOrderRequest;
import com.zagainov.orders.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItems;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end tests through HTTP, service, JPA and the Flyway-managed H2 schema.
 * Each test runs in a transaction that is rolled back afterwards.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OrderApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository productRepository;

    private Product lamp;
    private Product cable;

    @BeforeEach
    void setUp() {
        lamp = productRepository.save(new Product("TEST-LAMP", "Lamp", null, new BigDecimal("24.50"), 10));
        cable = productRepository.save(new Product("TEST-CABLE", "USB-C Cable", null, new BigDecimal("9.99"), 3));
    }

    @Test
    void createOrderComputesTotalsAndReservesStock() throws Exception {
        mvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderJson(item(lamp, 2), item(cable, 3))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("NEW"))
                .andExpect(jsonPath("$.customerEmail").value("buyer@example.com"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].lineTotal").value(49.00))
                .andExpect(jsonPath("$.items[1].lineTotal").value(29.97))
                .andExpect(jsonPath("$.totalAmount").value(78.97));

        assertThat(stockOf(lamp)).isEqualTo(8);
        assertThat(stockOf(cable)).isZero();
    }

    @Test
    void createOrderWithInsufficientStockIsRejected() throws Exception {
        mvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderJson(item(lamp, 1), item(cable, 4))))
                .andExpect(status().isConflict())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Insufficient stock"))
                .andExpect(jsonPath("$.detail").value("Product TEST-CABLE: requested 4, available 3"));
    }

    @Test
    void createOrderWithUnknownProductReturnsNotFound() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "customerEmail", "buyer@example.com",
                "items", List.of(Map.of("productId", 987_654, "quantity", 1))));

        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Products not found: [987654]"));
    }

    @Test
    void createOrderValidatesRequest() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "customerEmail", "not-an-email",
                "items", List.of()));

        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].field", hasItems("customerEmail", "items")));
    }

    @Test
    void createOrderValidatesLineItems() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "customerEmail", "buyer@example.com",
                "items", List.of(Map.of("productId", lamp.getId(), "quantity", 0))));

        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("items[0].quantity"));
    }

    @Test
    void getOrderById() throws Exception {
        long id = createOrder(item(lamp, 1));

        mvc.perform(get("/api/orders/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.items[0].productName").value("Lamp"))
                .andExpect(jsonPath("$.items[0].unitPrice").value(24.50));
    }

    @Test
    void listOrdersSupportsPaginationAndStatusFilter() throws Exception {
        long first = createOrder(item(lamp, 1));
        long second = createOrder(item(cable, 1));
        mvc.perform(patch("/api/orders/{id}/status", second)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"PAID\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mvc.perform(get("/api/orders").param("status", "PAID"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(second));

        mvc.perform(get("/api/orders").param("status", "NEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(first));

        mvc.perform(get("/api/orders").param("size", "1").param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void listOrdersRejectsUnknownStatus() throws Exception {
        mvc.perform(get("/api/orders").param("status", "LOST"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void cancelRestoresStockAndCannotBeRepeated() throws Exception {
        long id = createOrder(item(lamp, 4));
        assertThat(stockOf(lamp)).isEqualTo(6);

        mvc.perform(post("/api/orders/{id}/cancel", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(stockOf(lamp)).isEqualTo(10);

        mvc.perform(post("/api/orders/{id}/cancel", id))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Invalid status transition"))
                .andExpect(jsonPath("$.detail").value("Order cannot move from CANCELLED to CANCELLED"));
        assertThat(stockOf(lamp)).isEqualTo(10);
    }

    @Test
    void invalidTransitionIsRejected() throws Exception {
        long id = createOrder(item(cable, 1));

        mvc.perform(patch("/api/orders/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DELIVERED\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Order cannot move from NEW to DELIVERED"));
    }

    @Test
    void productReferencedByOrderCannotBeDeleted() throws Exception {
        createOrder(item(lamp, 1));

        mvc.perform(delete("/api/products/{id}", lamp.getId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Product in use"));
    }

    @Test
    void unknownOrderReturnsNotFound() throws Exception {
        mvc.perform(post("/api/orders/{id}/cancel", 424_242))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Order with id 424242 was not found"));
    }

    private long createOrder(CreateOrderRequest.Item... items) throws Exception {
        String response = mvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderJson(items)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private String orderJson(CreateOrderRequest.Item... items) throws Exception {
        return objectMapper.writeValueAsString(new CreateOrderRequest("buyer@example.com", List.of(items)));
    }

    private static CreateOrderRequest.Item item(Product product, int quantity) {
        return new CreateOrderRequest.Item(product.getId(), quantity);
    }

    private int stockOf(Product product) {
        return productRepository.findById(product.getId()).orElseThrow().getStockQuantity();
    }
}
