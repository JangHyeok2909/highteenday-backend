package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.security.WebSocketAuthChannelInterceptor;
import com.example.highteenday_backend.security.WebSocketAuthInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final WebSocketAuthChannelInterceptor webSocketAuthChannelInterceptor;
    /** 핸드셰이크를 허용하는 출처. HTTP 의 CORS·CSRF 검사와 같은 {@code app.cors.allowed-origins} 를 읽는다. */
    private final List<String> allowedOrigins;

    public WebSocketConfig(WebSocketAuthInterceptor webSocketAuthInterceptor,
                           WebSocketAuthChannelInterceptor webSocketAuthChannelInterceptor,
                           @Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.webSocketAuthChannelInterceptor = webSocketAuthChannelInterceptor;
        this.allowedOrigins = List.copyOf(allowedOrigins);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins.toArray(String[]::new))
                .addInterceptors(webSocketAuthInterceptor)
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthChannelInterceptor);
    }
}
