package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;

@Embeddable
@Getter
@EqualsAndHashCode
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Password {

    @Column(name = "USR_hashed_password", length = 60)
    private String hashedValue;

    private Password(String hashedValue) {
        this.hashedValue = hashedValue;
    }

    public static Password fromRawPassword(String rawPassword, PasswordEncoder encoder) {
        validateRaw(rawPassword);
        return new Password(encoder.encode(rawPassword));
    }

    public static Password fromHashedValue(String hashedValue) {
        return new Password(hashedValue);
    }

    private static void validateRaw(String raw) {
        if (raw == null || raw.length() < 8) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD_FORMAT);
        }
        if (!raw.matches(".*\\d.*")) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD_FORMAT);
        }
        if (!raw.matches(".*[!@#$%^&*(),.?\":{}|<>].*")) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD_FORMAT);
        }
    }

    public boolean matches(String rawPassword, PasswordEncoder encoder) {
        return encoder.matches(rawPassword, this.hashedValue);
    }
}
