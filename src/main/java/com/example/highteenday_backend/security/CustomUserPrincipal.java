package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.enums.Provider;
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
    private final OAuth2UserInfo oAuth2UserInfo;
    private final Collection<? extends GrantedAuthority> authorities;

    // CustomUserPrincipal.java
    public CustomUserPrincipal(User user) {
        this.user = user;
        this.oAuth2UserInfo = null;
        this.attributes = Collections.emptyMap();
        this.authorities = List.of(new SimpleGrantedAuthority(user.getRole().name()));
    }

    public CustomUserPrincipal(User user, Map<String, Object> attributes, String role) {
        this.user = user;
        this.oAuth2UserInfo = null;
        this.attributes = attributes;
        this.authorities = List.of(new SimpleGrantedAuthority(role));
    }

    public CustomUserPrincipal(OAuth2UserInfo oAuth2UserInfo, Map<String, Object> attributes, String role) {
        this.user = null;
        this.oAuth2UserInfo = oAuth2UserInfo;
        this.attributes = attributes;
        this.authorities = List.of(new SimpleGrantedAuthority(role));
    }

    public OAuth2UserInfo getoAuth2UserInfo() {
        return this.oAuth2UserInfo;
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
        return user != null ? user.getName() : oAuth2UserInfo.name();
    }

    @Override
    public String getName() {
        return user.getEmail();
    }

    public String getUserEmail(){
        return user != null ? user.getEmail() : oAuth2UserInfo.email();
    }

    public Provider getUserProvider() {
        return user != null ? user.getProvider() : (Provider) oAuth2UserInfo.provider();
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
