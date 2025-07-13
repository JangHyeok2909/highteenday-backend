package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class CustomUserPrincipal implements UserDetails, OAuth2User {
    private final User user;
    private final Map<String, Object> attributes; // OAuth2 Attributes
    private final Collection<? extends GrantedAuthority> authorities;

    // CustomUserPrincipal.java
    public CustomUserPrincipal(User user) {
        this.user = user;
        this.attributes = Collections.emptyMap();
        this.authorities = List.of(new SimpleGrantedAuthority(user.getRole().name()));
    }

    public CustomUserPrincipal(User user, Map<String, Object> attributes, String role) {
        this.user = user;
        this.attributes = attributes;
        this.authorities = List.of(new SimpleGrantedAuthority(role));
    }



    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return "";
    }

    @Override
    public String getUsername() {
        return user.getEmail();
    }

    @Override
    public String getName() {
        return user.getId().toString();
    }
    public User getUser() {
        return user;
    }

    @Override
    public boolean isAccountNonExpired() { return true; }
    @Override
    public boolean isAccountNonLocked() { return true; }
    @Override
    public boolean isCredentialsNonExpired() { return true; }
    @Override
    public boolean isEnabled() { return true; }
}
