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

    @Column(name = "is_valid", nullable = false, columnDefinition = "BOOLEAN DEFAULT true")
    private Boolean isValid = true;

    public void delete(){
        this.isValid = false;
    }
    public void restore(){
        this.isValid = true;
    }
    public void setUpdatedBy(Long userId){
        this.updatedBy=userId;
    }
    public void setUpdatedDate(LocalDateTime localDateTime){
        this.updatedDate = localDateTime;
    }
//    HighteendayBackendApplication에 주석 처리 하는 이유 설명하였음
//    public void setCreated(LocalDateTime localDateTime){
//        this.created = localDateTime;
//    }

}
