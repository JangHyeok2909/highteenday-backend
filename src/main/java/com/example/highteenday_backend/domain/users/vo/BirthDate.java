package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.Period;

@Embeddable
@Getter
@EqualsAndHashCode
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BirthDate {

    @Column(name = "USR_birth_date")
    private LocalDate value;

    public BirthDate(LocalDate value) {
        if (value == null) {
            throw new CustomException(ErrorCode.INVALID_BIRTHDATE);
        }
        int age = Period.between(value, LocalDate.now()).getYears();
        if (age < 15 || age > 30) {
            throw new CustomException(ErrorCode.INVALID_BIRTHDATE);
        }
        this.value = value;
    }
}
