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
    private LocalDate updatedDate;

    @Column(name = "UPT_id")
    private Long updatedBy;

    @Column(name = "is_Valid")
    private Boolean isValid = true;

//    public void setCreated(LocalDateTime localDateTime){
//        this.created = localDateTime;
//    }

}
