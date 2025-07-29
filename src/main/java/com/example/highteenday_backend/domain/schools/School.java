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
public class School {
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

//    급식정보 받기 위해
    @Column(name = "ATPT_OFCDC_SC_CODE", nullable = false) // 교육청 코드 필드 추가
    private String eduOfficeCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "SCH_CAT", nullable = false)
    private SchoolCategory category;
}
