package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Embeddable
@Getter
@EqualsAndHashCode
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PhoneNumber {

    private static final String PHONE_REGEX = "^010-\\d{4}-\\d{4}$";

    @Column(name = "USR_phone", length = 20)
    private String value;

    public PhoneNumber(String value) {
        if (value == null || !value.matches(PHONE_REGEX)) {
            throw new CustomException(ErrorCode.INVALID_PHONE_FORMAT);
        }
        this.value = value;
    }
}
