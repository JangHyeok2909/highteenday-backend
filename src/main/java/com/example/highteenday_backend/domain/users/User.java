package com.example.highteenday_backend.domain.users;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.enums.*;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Builder
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Table(name="users")
@Entity
public class User extends BaseEntity {
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Id
    @Column(name = "USR_id")
    private Long id;

    @Column(name = "USR_email", length = 48, nullable = false, unique = true)
    private String email;

    @Column(name = "USR_hashed_password", length = 60)
    private String hashedPassword;

    @Column(name = "USR_nickname", length = 12, nullable = false)
    private String nickname;

    @Column(name = "USR_name", length = 10, nullable = false)
    private String name;

    @Column(name = "USR_class")
    private Integer userClass;

    @Column(name = "USR_grade")
    private Grade grade;

    @Column(name="USR_semester")
    private Semester semester;

    @Column(name = "USR_major", length = 30)
    private String major;

    @Column(name = "USR_phone_num", length = 20/*, nullable = false*/)
    private String phoneNum;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_provider"/*, nullable = false*/)
    private Provider provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_role"/*, nullable = false*/)
    private Role role = Role.USER;

    @Column(name = "USR_profile_image_url", columnDefinition = "TEXT")
    private String profileUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_gender"/*, nullable = false*/)
    private Gender gender;

    @Column(name = "USR_allow_admsg"/*, nullable = false*/)
    private Boolean allowAdMsg;

    @Column(name = "USR_birth_date"/*, nullable = false*/)
    private LocalDate birthDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SCH_id"/*, nullable = false*/)
    private School school;

}
