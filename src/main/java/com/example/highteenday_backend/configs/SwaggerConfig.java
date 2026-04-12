package com.example.highteenday_backend.configs;


import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class SwaggerConfig {

    @Value("${app.server-url:}")
    private String serverUrl;

    @Bean
    public OpenAPI openAPI() {
        OpenAPI openAPI = new OpenAPI()
                .info(new Info()
                        .title("HighTeenDay API")
                        .version("0.0.1")
                        .description("HighTeenDay API 명세서"));

        if (!serverUrl.isBlank()) {
            openAPI.servers(List.of(new Server().url(serverUrl)));
        }
        return openAPI;
    }
}
