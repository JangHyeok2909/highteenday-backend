package com.example.highteenday_backend.domain.schools;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.enums.SchoolCategory;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "schools")
@Entity
public class School extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SCH_id")
    private Long id;

    @Column(name = "SCH_code", nullable = false)
    private Integer code;

    @Column(name = "SCH_name", nullable = false)
    private String name;

    @Column(name = "SCH_location", nullable = false)
    private String location;

    @Enumerated(EnumType.STRING)
    @Column(name = "SCH_CAT", nullable = false)
    private SchoolCategory category;
}
