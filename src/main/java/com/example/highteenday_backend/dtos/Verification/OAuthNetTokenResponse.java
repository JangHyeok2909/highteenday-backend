package com.example.highteenday_backend.dtos.Verification;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class OAuthNetTokenResponse {
    @JsonProperty("token_type") private String tokenType;
    @JsonProperty("access_token") private String accessToken;
    @JsonProperty("client_id") private String clientId;
    @JsonProperty("expires_in") private Integer expiresIn;
    @JsonProperty("refresh_token") private String refreshToken;
    @JsonProperty("refresh_token_expires_in") private Integer refreshTokenExpiresIn;
    @JsonProperty("scope") private String scope;
}