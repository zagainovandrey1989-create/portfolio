package com.zagainov.orders.service;

import com.zagainov.orders.domain.Product;
import com.zagainov.orders.dto.PageResponse;
import com.zagainov.orders.dto.ProductRequest;
import com.zagainov.orders.dto.ProductResponse;
import com.zagainov.orders.exception.ConflictException;
import com.zagainov.orders.exception.NotFoundException;
import com.zagainov.orders.repository.OrderItemRepository;
import com.zagainov.orders.repository.ProductRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository productRepository;
    private final OrderItemRepository orderItemRepository;

    public ProductService(ProductRepository productRepository, OrderItemRepository orderItemRepository) {
        this.productRepository = productRepository;
        this.orderItemRepository = orderItemRepository;
    }

    public PageResponse<ProductResponse> list(Pageable pageable) {
        return PageResponse.from(productRepository.findAll(pageable).map(ProductResponse::from));
    }

    public ProductResponse get(Long id) {
        return ProductResponse.from(findProduct(id));
    }

    @Transactional
    public ProductResponse create(ProductRequest request) {
        if (productRepository.existsBySku(request.sku())) {
            throw duplicateSku(request.sku());
        }
        Product product = new Product(
                request.sku(),
                request.name(),
                request.description(),
                request.price(),
                request.stockQuantity());
        return ProductResponse.from(productRepository.save(product));
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest request) {
        Product product = findProduct(id);
        if (productRepository.existsBySkuAndIdNot(request.sku(), id)) {
            throw duplicateSku(request.sku());
        }
        product.update(
                request.sku(),
                request.name(),
                request.description(),
                request.price(),
                request.stockQuantity());
        return ProductResponse.from(productRepository.saveAndFlush(product));
    }

    @Transactional
    public void delete(Long id) {
        Product product = findProduct(id);
        if (orderItemRepository.existsByProductId(id)) {
            throw new ConflictException("Product in use",
                    "Product %s is referenced by existing orders and cannot be deleted".formatted(product.getSku()));
        }
        productRepository.delete(product);
    }

    private Product findProduct(Long id) {
        return productRepository.findById(id).orElseThrow(() -> NotFoundException.of("Product", id));
    }

    private static ConflictException duplicateSku(String sku) {
        return new ConflictException("Duplicate SKU", "Product with SKU %s already exists".formatted(sku));
    }
}
