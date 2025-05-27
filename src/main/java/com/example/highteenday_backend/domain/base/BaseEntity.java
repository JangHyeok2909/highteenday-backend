package com.example.highteenday_backend.domain.base;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime created;

    @LastModifiedDate
    @Column(name = "UPT_Date")
    private LocalDateTime updatedDate;

    @Column(name = "UPT_id")
    private Long updatedBy;

    @Column(name = "is_Valid")
    private Boolean isValid = true;

//    HighteendayBackendApplication에 주석 처리 하는 이유 설명하였음
//    public void setCreated(LocalDateTime localDateTime){
//        this.created = localDateTime;
//    }

}
