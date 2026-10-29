package com.zagainov.orders.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI ordersOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Orders API")
                .version("1.0.0")
                .description("Products catalogue and order management with stock control.")
                .contact(new Contact().name("Andrei Zagainov")));
    }
}
