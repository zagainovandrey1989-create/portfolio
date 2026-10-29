# Orders API

A REST service for a product catalogue and customer orders, written in Java 21 with Spring Boot.
It places orders with several line items, checks and reserves stock, calculates totals with
`BigDecimal`, and enforces the order lifecycle (`NEW -> PAID -> SHIPPED -> DELIVERED`, with
cancellation from `NEW` or `PAID` returning stock to the catalogue).

Author: **Andrei Zagainov**

Built with modern AI coding tools; every change reviewed and tested by me.

## Tech stack

| Area          | Choice                                                    |
|---------------|-----------------------------------------------------------|
| Language      | Java 21                                                   |
| Framework     | Spring Boot 3.5 (Web MVC, Validation, Data JPA, Actuator) |
| Persistence   | Hibernate, H2 in-memory database                          |
| Migrations    | Flyway                                                    |
| API docs      | springdoc-openapi (Swagger UI)                            |
| Errors        | RFC 7807 problem details (`application/problem+json`)     |
| Tests         | JUnit 5, Mockito, AssertJ, Spring MockMvc, JaCoCo         |
| Build / CI    | Maven, GitHub Actions, multi-stage Docker image           |

## Project layout

```
src/main/java/com/zagainov/orders
├── web/          REST controllers and the global exception handler
├── service/      Business logic and transaction boundaries
├── repository/   Spring Data JPA repositories
├── domain/       JPA entities and the OrderStatus state machine
├── dto/          Request/response records with Bean Validation
├── exception/    Domain exceptions (not found, conflict, ...)
└── config/       OpenAPI metadata
src/main/resources/db/migration   Flyway SQL migrations
```

## Running

Requirements: JDK 21 and Maven 3.9+ (or only Docker).

```bash
mvn spring-boot:run
```

Or build a jar and run it:

```bash
mvn -B package
java -jar target/orders-api.jar
```

With Docker:

```bash
docker build -t orders-api .
docker run --rm -p 8080:8080 orders-api
```

The service listens on `http://localhost:8080`.

- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI JSON: http://localhost:8080/v3/api-docs
- Health: http://localhost:8080/actuator/health

The database is in memory and starts with three demo products (ids 1-3), so the examples below
work right after startup.

## Example requests

Products:

```bash
# List products (paged)
curl -s "http://localhost:8080/api/products?page=0&size=10"

# Create a product
curl -s -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"HD-USB-03","name":"USB-C Hub","description":"7-in-1","price":45.00,"stockQuantity":15}'

# Update a product
curl -s -X PUT http://localhost:8080/api/products/4 \
  -H "Content-Type: application/json" \
  -d '{"sku":"HD-USB-03","name":"USB-C Hub","description":"8-in-1","price":49.00,"stockQuantity":20}'

# Delete a product (only if no order references it)
curl -s -X DELETE http://localhost:8080/api/products/4
```

Orders:

```bash
# Place an order
curl -s -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerEmail":"buyer@example.com","items":[{"productId":1,"quantity":2},{"productId":2,"quantity":1}]}'

# Get an order
curl -s http://localhost:8080/api/orders/1

# List orders, filtered by status, newest first
curl -s "http://localhost:8080/api/orders?status=NEW&page=0&size=20"

# Move an order to the next status
curl -s -X PATCH http://localhost:8080/api/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"PAID"}'

# Cancel an order (stock is returned)
curl -s -X POST http://localhost:8080/api/orders/1/cancel
```

An error response looks like this:

```json
{
  "type": "about:blank",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Product MN-27-4K: requested 10, available 8",
  "instance": "/api/orders"
}
```

Validation errors (HTTP 400) also include an `errors` array with `field` and `message` for every
invalid field.

## Tests

```bash
mvn -B verify
```

This runs:

- **Unit tests** (`OrderServiceTest`, `ProductServiceTest`, `OrderStatusTest`) with Mockito:
  totals and rounding, merging of duplicate lines, stock checks, cancellation, and every allowed
  and forbidden status transition.
- **Integration tests** (`OrderApiIntegrationTest`, `ProductApiIntegrationTest`) with
  `@SpringBootTest` and MockMvc against the real Flyway schema on H2: happy paths, validation
  errors, 404/409 problem responses, pagination and status filtering. Each test runs in a
  transaction that is rolled back.

A JaCoCo coverage report is written to `target/site/jacoco/index.html`.

## Design notes

- **Layers.** Controllers only map HTTP to service calls. Services own the transaction
  boundaries and return DTOs, so lazy JPA associations never leak into the web layer
  (`open-in-view` is disabled).
- **Rich domain model.** Stock changes and status rules live in the entities
  (`Product.reserve/release`, `Order.addItem/transitionTo`) and in the `OrderStatus` enum, so
  invalid states cannot be reached by any caller, not only by the REST API.
- **Atomic orders.** An order is created in one transaction. If any line fails (unknown
  product, not enough stock), nothing is reserved. Repeated lines for the same product are
  merged before the stock check.
- **Money.** All amounts are `BigDecimal` stored as `NUMERIC` with two decimals; line totals use
  `HALF_EVEN` rounding. Order lines keep a copy of the product name and unit price, so later
  catalogue changes do not rewrite past orders.
- **Concurrency.** `Product` and `Order` use optimistic locking (`@Version`). Two requests that
  try to take the same stock at the same time cannot both win; the loser receives
  `409 Concurrent modification` and can retry.
- **Schema ownership.** Flyway owns the schema (`ddl-auto: none`); constraints such as
  non-negative stock and unique SKU are also enforced in the database.
- **Errors.** One `@RestControllerAdvice` turns every failure into an RFC 7807 problem
  document; internal details and stack traces are never returned to the client.
- **Out of scope.** Authentication, payments and a persistent database are intentionally left
  out to keep the example focused. Switching H2 to PostgreSQL only needs a driver dependency and
  datasource settings.
