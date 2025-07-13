package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.Collections;
import java.util.Map;

public class CustomUserPrincipal implements UserDetails, OAuth2User {
    private final User user;
    private Map<String, Object> attributes; // OAuth2 Attributes
    private String role;


    public CustomUserPrincipal(User user){
        this.user = user;
        this.attributes = Collections.emptyMap();
        this.role = "ROLE_USER";
    }
    public CustomUserPrincipal(User user, String role){
        this(user);
        this.role = role;
    }
    public CustomUserPrincipal(User user, Map<String, Object> attributes){
        this(user);
        this.attributes = attributes;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singleton(() -> "ROLE_USER");
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
