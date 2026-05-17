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
public class Nickname {

    @Column(name = "USR_nickname", length = 12, nullable = false)
    private String value;

    public Nickname(String value) {
        if (value == null || value.length() < 2 || value.length() > 12) {
            throw new CustomException(ErrorCode.INVALID_NICKNAME_FORMAT);
        }
        this.value = value;
    }
}
