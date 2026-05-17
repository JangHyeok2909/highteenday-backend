package com.example.highteenday_backend.domain.users;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.users.vo.*;
import com.example.highteenday_backend.enums.*;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(name = "uk_users_email", columnNames = "USR_email")
})
public class User extends BaseEntity {

    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Id
    @Column(name = "USR_id")
    private Long id;

    @Embedded
    private Email email;

    @Embedded
    private Password password;

    @Embedded
    private Nickname nickname;

    @Embedded
    private UserName name;

    @Embedded
    private PhoneNumber phone;

    @Embedded
    private BirthDate birthDate;

    @Column(name = "USR_class")
    private Integer userClass;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_grade")
    private Grade grade;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_semester")
    private Semester semester;

    @Column(name = "USR_major", length = 30)
    private String major;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_provider")
    private Provider provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_role")
    private Role role = Role.USER;

    @Column(name = "USR_profile_image_url", columnDefinition = "TEXT")
    private String profileUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "USR_gender")
    private Gender gender;

    @Column(name = "USR_allow_admsg")
    private Boolean allowAdMsg;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SCH_id", foreignKey = @ForeignKey(name = "fk_users_sch"))
    private School school;

    // === 정적 팩토리 ===

    public static User createDefault(Email email, UserName name, Nickname nickname,
                                     Password password, Gender gender, BirthDate birthDate, PhoneNumber phone) {
        User user = new User();
        user.email = email;
        user.name = name;
        user.nickname = nickname;
        user.password = password;
        user.gender = gender;
        user.birthDate = birthDate;
        user.phone = phone;
        user.provider = Provider.DEFAULT;
        user.role = Role.USER;
        return user;
    }

    public static User createOAuth(Email email, UserName name, Nickname nickname,
                                   Provider provider, String profileUrl) {
        User user = new User();
        user.email = email;
        user.name = name;
        user.nickname = nickname;
        user.provider = provider;
        user.profileUrl = profileUrl;
        user.role = Role.USER;
        return user;
    }

    // === 도메인 메서드 ===

    public void changeNickname(Nickname newNickname) {
        this.nickname = newNickname;
    }

    public void changePassword(Password newPassword) {
        this.password = newPassword;
    }

    public void changePhone(PhoneNumber newPhone) {
        this.phone = newPhone;
    }

    public void updateSchool(School school) {
        this.school = school;
    }

    public void updateGrade(Grade grade) {
        this.grade = grade;
    }

    public void updateUserClass(Integer userClass) {
        this.userClass = userClass;
    }

    public void updateSemester(Semester semester) {
        this.semester = semester;
    }

    public void updateProfileUrl(String profileUrl) {
        this.profileUrl = profileUrl;
    }

    public void updateAllowAdMsg(Boolean allow) {
        this.allowAdMsg = allow;
    }

    public void updateProvider(Provider provider) {
        this.provider = provider;
    }

    public void updateRole(Role role) {
        this.role = role;
    }

    // === 편의 접근자 (기존 코드 호환) ===

    public String getEmailValue() {
        return email != null ? email.getValue() : null;
    }

    public String getNicknameValue() {
        return nickname != null ? nickname.getValue() : null;
    }

    public String getNameValue() {
        return name != null ? name.getValue() : null;
    }

    public String getPhoneValue() {
        return phone != null ? phone.getValue() : null;
    }

    public String getHashedPassword() {
        return password != null ? password.getHashedValue() : null;
    }

    public java.time.LocalDate getBirthDateValue() {
        return birthDate != null ? birthDate.getValue() : null;
    }

    // === Builder (테스트/DataInitializer 호환) ===

    @Builder
    private User(Long id, Email email, Password password, Nickname nickname, UserName name,
                 PhoneNumber phone, BirthDate birthDate, Integer userClass, Grade grade,
                 Semester semester, String major, Provider provider, Role role,
                 String profileUrl, Gender gender, Boolean allowAdMsg, School school) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.name = name;
        this.phone = phone;
        this.birthDate = birthDate;
        this.userClass = userClass;
        this.grade = grade;
        this.semester = semester;
        this.major = major;
        this.provider = provider;
        this.role = role != null ? role : Role.USER;
        this.profileUrl = profileUrl;
        this.gender = gender;
        this.allowAdMsg = allowAdMsg;
        this.school = school;
    }
}
