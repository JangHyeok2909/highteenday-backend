package com.example.highteenday_backend.services;

import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplateRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.ImportTimetableTemplateDto;
import com.example.highteenday_backend.dtos.RequestTimetableTemplateDto;
import com.example.highteenday_backend.dtos.TimetableTemplateDetailDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.FriendService;
import com.example.highteenday_backend.services.domain.SubjectService;
import com.example.highteenday_backend.services.domain.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TimetableTemplateServiceTest {

    @Mock private TimetableTemplateRepository timetableTemplateRepository;
    @Mock private SubjectService subjectService;
    @Mock private UserTimetableService timetableService;
    @Mock private FriendService friendService;
    @Mock private UserService userService;

    @InjectMocks private TimetableTemplateService service;

    private User me;
    private User friend;

    @BeforeEach
    void setUp() {
        me = user(1L, "me");
        friend = user(2L, "friend");

        when(timetableTemplateRepository.save(any(TimetableTemplate.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(subjectService.save(any(Subject.class))).thenAnswer(inv -> inv.getArgument(0));
        when(timetableService.save(any(UserTimetable.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private static User user(Long id, String nickname) {
        return User.builder()
                .id(id)
                .email(new Email("user" + id + "@test.com"))
                .name(new UserName("이름" + id))
                .nickname(new Nickname(nickname))
                .role(Role.USER)
                .build();
    }

    private static TimetableTemplate template(Long id, User owner, boolean isDefault) {
        return TimetableTemplate.builder()
                .id(id)
                .user(owner)
                .templateName("템플릿" + id)
                .grade(Grade.SOPHOMORE)
                .semester(Semester.FIRST)
                .isDefault(isDefault)
                .build();
    }

    private static void assertErrorCode(Throwable thrown, ErrorCode expected) {
        assertThat(thrown).isInstanceOf(CustomException.class);
        assertThat(((CustomException) thrown).getErrorCode()).isEqualTo(expected);
    }

    // ==================================================================

    @Nested
    @DisplayName("조회")
    class Lookup {

        @Test
        @DisplayName("findById — 없으면 ResourceNotFoundException")
        void throwsWhenTemplateMissing() {
            when(timetableTemplateRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.findById(99L))
                    .isInstanceOf(ResourceNotFoundException.class)
                    .hasMessageContaining("99");
        }

        @Test
        @DisplayName("getDefaultTemplate — 기본 템플릿이 없으면 ResourceNotFoundException")
        void throwsWhenNoDefaultTemplate() {
            when(timetableTemplateRepository.findByUserAndIsDefaultTrue(me)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getDefaultTemplate(me))
                    .isInstanceOf(ResourceNotFoundException.class);
        }

        @Test
        @DisplayName("getDefaultTemplate — 있으면 그대로 반환")
        void returnsDefaultTemplate() {
            TimetableTemplate defaultTemplate = template(10L, me, true);
            when(timetableTemplateRepository.findByUserAndIsDefaultTrue(me))
                    .thenReturn(Optional.of(defaultTemplate));

            assertThat(service.getDefaultTemplate(me)).isSameAs(defaultTemplate);
        }
    }

    @Nested
    @DisplayName("getFriendDefaultTemplate")
    class GetFriendDefaultTemplate {

        @Test
        @DisplayName("친구 관계를 먼저 검사한 뒤 기본 템플릿을 내려준다")
        void returnsFriendTemplate() {
            TimetableTemplate friendTemplate = TimetableTemplate.builder()
                    .id(20L).user(friend).templateName("친구 시간표")
                    .grade(Grade.JUNIOR).semester(Semester.SECOND).isDefault(true)
                    .subjects(List.of()).timetables(List.of())
                    .build();
            when(userService.findById(2L)).thenReturn(friend);
            when(timetableTemplateRepository.findByUserAndIsDefaultTrue(friend))
                    .thenReturn(Optional.of(friendTemplate));

            TimetableTemplateDetailDto dto = service.getFriendDefaultTemplate(me, 2L);

            verify(friendService).validateFriendship(1L, 2L);
            assertThat(dto.getId()).isEqualTo(20L);
            assertThat(dto.getOwnerId()).isEqualTo(2L);
            assertThat(dto.getOwnerNickname()).isEqualTo("friend");
        }

        @Test
        @DisplayName("친구가 아니면 관계 검사에서 막히고 템플릿을 조회하지 않는다")
        void throwsWhenNotFriend() {
            org.mockito.Mockito.doThrow(new CustomException(ErrorCode.FRIEND_NOT_FOUND))
                    .when(friendService).validateFriendship(1L, 2L);

            assertThatThrownBy(() -> service.getFriendDefaultTemplate(me, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.FRIEND_NOT_FOUND));

            verify(timetableTemplateRepository, never()).findByUserAndIsDefaultTrue(any());
        }

        @Test
        @DisplayName("친구에게 기본 템플릿이 없으면 DEFAULT_TIMETABLE_TEMPLATE_NOT_FOUND")
        void throwsWhenFriendHasNoDefault() {
            when(userService.findById(2L)).thenReturn(friend);
            when(timetableTemplateRepository.findByUserAndIsDefaultTrue(friend))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getFriendDefaultTemplate(me, 2L))
                    .satisfies(ex -> assertErrorCode(ex,
                            ErrorCode.DEFAULT_TIMETABLE_TEMPLATE_NOT_FOUND));
        }
    }

    // ==================================================================
    // importTemplate — 과목/시간표 복사
    // ==================================================================

    @Nested
    @DisplayName("importTemplate")
    class ImportTemplate {

        private TimetableTemplate source;
        private Subject math;
        private Subject english;

        @BeforeEach
        void setUp() {
            source = template(20L, friend, false);
            math = Subject.builder().id(100L).subjectName("수학").hoursPerWeek(4)
                    .timetableTemplate(source).build();
            english = Subject.builder().id(101L).subjectName("영어").hoursPerWeek(3)
                    .timetableTemplate(source).build();
            UserTimetable slot1 = UserTimetable.builder()
                    .id(200L).subject(math).timetableTemplate(source)
                    .day(DayOfWeek.MONDAY).period("1").build();
            UserTimetable slot2 = UserTimetable.builder()
                    .id(201L).subject(english).timetableTemplate(source)
                    .day(DayOfWeek.TUESDAY).period("3").build();
            ReflectionSetter.set(source, "subjects", List.of(math, english));
            ReflectionSetter.set(source, "timetables", List.of(slot1, slot2));

            when(timetableTemplateRepository.findById(20L)).thenReturn(Optional.of(source));
        }

        @Test
        @DisplayName("친구 템플릿을 복사하면 과목과 시간표가 새 템플릿에 연결된다")
        void copiesSubjectsAndTimetables() {
            ImportTimetableTemplateDto dto = ImportTimetableTemplateDto.builder()
                    .sourceTemplateId(20L).templateName("가져온 시간표").build();

            TimetableTemplate copied = service.importTemplate(me, dto);

            verify(friendService).validateFriendship(1L, 2L);
            assertThat(copied.getUser()).isSameAs(me);
            assertThat(copied.getTemplateName()).isEqualTo("가져온 시간표");
            assertThat(copied.getGrade()).isEqualTo(source.getGrade());
            assertThat(copied.getSemester()).isEqualTo(source.getSemester());
            assertThat(copied.isDefault()).isFalse();

            ArgumentCaptor<Subject> subjectCaptor = ArgumentCaptor.forClass(Subject.class);
            verify(subjectService, org.mockito.Mockito.times(2)).save(subjectCaptor.capture());
            assertThat(subjectCaptor.getAllValues())
                    .extracting(Subject::getSubjectName, Subject::getHoursPerWeek)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple("수학", 4),
                            org.assertj.core.groups.Tuple.tuple("영어", 3));
            // 복사된 과목은 원본이 아니라 새 템플릿을 가리켜야 한다
            assertThat(subjectCaptor.getAllValues())
                    .allSatisfy(s -> assertThat(s.getTimetableTemplate()).isSameAs(copied));
            assertThat(subjectCaptor.getAllValues()).allSatisfy(s -> assertThat(s.getId()).isNull());
        }

        @Test
        @DisplayName("시간표 칸은 복사된 과목을 가리킨다 — 원본 과목을 참조하면 안 된다")
        void timetableSlotsPointToCopiedSubjects() {
            ImportTimetableTemplateDto dto = ImportTimetableTemplateDto.builder()
                    .sourceTemplateId(20L).build();

            TimetableTemplate copied = service.importTemplate(me, dto);

            ArgumentCaptor<UserTimetable> slotCaptor = ArgumentCaptor.forClass(UserTimetable.class);
            verify(timetableService, org.mockito.Mockito.times(2)).save(slotCaptor.capture());

            assertThat(slotCaptor.getAllValues())
                    .extracting(UserTimetable::getDay, UserTimetable::getPeriod)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(DayOfWeek.MONDAY, "1"),
                            org.assertj.core.groups.Tuple.tuple(DayOfWeek.TUESDAY, "3"));
            assertThat(slotCaptor.getAllValues())
                    .allSatisfy(t -> assertThat(t.getTimetableTemplate()).isSameAs(copied));
            // 원본 과목 인스턴스(math/english)가 그대로 새 시간표에 붙지 않았는지 확인
            assertThat(slotCaptor.getAllValues())
                    .noneSatisfy(t -> assertThat(t.getSubject()).isSameAs(math))
                    .noneSatisfy(t -> assertThat(t.getSubject()).isSameAs(english));
            assertThat(slotCaptor.getAllValues())
                    .extracting(t -> t.getSubject().getSubjectName())
                    .containsExactly("수학", "영어");
        }

        @Test
        @DisplayName("이름을 비우면 원본 이름을 물려받는다")
        void inheritsSourceNameWhenBlank() {
            ImportTimetableTemplateDto dto = ImportTimetableTemplateDto.builder()
                    .sourceTemplateId(20L).templateName("   ").build();

            TimetableTemplate copied = service.importTemplate(me, dto);

            assertThat(copied.getTemplateName()).isEqualTo("템플릿20");
        }

        @Test
        @DisplayName("이름이 null이어도 원본 이름을 물려받는다")
        void inheritsSourceNameWhenNull() {
            ImportTimetableTemplateDto dto = ImportTimetableTemplateDto.builder()
                    .sourceTemplateId(20L).templateName(null).build();

            assertThat(service.importTemplate(me, dto).getTemplateName()).isEqualTo("템플릿20");
        }

        @Test
        @DisplayName("내 템플릿을 복사할 때는 친구 관계를 검사하지 않는다")
        void skipsFriendshipCheckForOwnTemplate() {
            TimetableTemplate mine = template(21L, me, false);
            ReflectionSetter.set(mine, "subjects", List.of());
            ReflectionSetter.set(mine, "timetables", List.of());
            when(timetableTemplateRepository.findById(21L)).thenReturn(Optional.of(mine));

            service.importTemplate(me, ImportTimetableTemplateDto.builder()
                    .sourceTemplateId(21L).build());

            verify(friendService, never()).validateFriendship(any(), any());
        }

        @Test
        @DisplayName("친구가 아닌 사람의 템플릿은 복사할 수 없다")
        void throwsWhenNotFriend() {
            org.mockito.Mockito.doThrow(new CustomException(ErrorCode.FRIEND_NOT_FOUND))
                    .when(friendService).validateFriendship(1L, 2L);

            assertThatThrownBy(() -> service.importTemplate(me,
                    ImportTimetableTemplateDto.builder().sourceTemplateId(20L).build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.FRIEND_NOT_FOUND));

            verify(timetableTemplateRepository, never()).save(any());
        }

        @Test
        @DisplayName("원본 템플릿이 없으면 TIMETABLE_TEMPLATE_NOT_FOUND")
        void throwsWhenSourceMissing() {
            when(timetableTemplateRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.importTemplate(me,
                    ImportTimetableTemplateDto.builder().sourceTemplateId(99L).build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.TIMETABLE_TEMPLATE_NOT_FOUND));
        }

        @Test
        @DisplayName("isDefault=true로 가져오면 기존 기본 템플릿이 해제된다")
        void switchesDefaultWhenRequested() {
            TimetableTemplate oldDefault = template(30L, me, true);
            when(timetableTemplateRepository.findByUser(me)).thenReturn(List.of(oldDefault));

            TimetableTemplate copied = service.importTemplate(me,
                    ImportTimetableTemplateDto.builder().sourceTemplateId(20L).isDefault(true).build());

            assertThat(oldDefault.isDefault()).isFalse();
            assertThat(copied.isDefault()).isTrue();
        }
    }

    // ==================================================================
    // selectDefaultTemplate
    // ==================================================================

    @Nested
    @DisplayName("selectDefaultTemplate")
    class SelectDefaultTemplate {

        @Test
        @DisplayName("기존 기본 템플릿을 모두 해제하고 대상만 기본으로 만든다")
        void movesDefaultFlag() {
            TimetableTemplate oldDefault = template(10L, me, true);
            TimetableTemplate other = template(11L, me, false);
            TimetableTemplate target = template(12L, me, false);
            when(timetableTemplateRepository.findByUser(me))
                    .thenReturn(List.of(oldDefault, other, target));

            service.selectDefaultTemplate(me, target);

            assertThat(oldDefault.isDefault()).isFalse();
            assertThat(other.isDefault()).isFalse();
            assertThat(target.isDefault()).isTrue();
        }

        @Test
        @DisplayName("대상이 목록에 없어도 기본으로 지정된다")
        void marksTargetEvenWhenNotInList() {
            TimetableTemplate oldDefault = template(10L, me, true);
            TimetableTemplate target = template(12L, me, false);
            when(timetableTemplateRepository.findByUser(me)).thenReturn(List.of(oldDefault));

            service.selectDefaultTemplate(me, target);

            assertThat(oldDefault.isDefault()).isFalse();
            assertThat(target.isDefault()).isTrue();
        }

        @Test
        @DisplayName("이미 기본인 템플릿을 다시 지정해도 기본 상태가 유지된다")
        void keepsDefaultWhenReselectingSame() {
            // 루프에서 전체를 false로 만든 뒤 대상만 true로 되돌리는 순서에 의존한다.
            TimetableTemplate target = template(10L, me, true);
            when(timetableTemplateRepository.findByUser(me)).thenReturn(List.of(target));

            service.selectDefaultTemplate(me, target);

            assertThat(target.isDefault()).isTrue();
        }
    }

    // ==================================================================
    // save / update / delete
    // ==================================================================

    @Nested
    @DisplayName("save")
    class Save {

        @Test
        @DisplayName("isDefault=true인 템플릿을 저장하면 기존 기본이 해제된다")
        void switchesDefaultOnSave() {
            TimetableTemplate oldDefault = template(10L, me, true);
            TimetableTemplate incoming = template(11L, me, true);
            when(timetableTemplateRepository.findByUser(me)).thenReturn(List.of(oldDefault));

            service.save(incoming);

            assertThat(oldDefault.isDefault()).isFalse();
            assertThat(incoming.isDefault()).isTrue();
            verify(timetableTemplateRepository).save(incoming);
        }

        @Test
        @DisplayName("isDefault=false면 기본 지정 로직을 건드리지 않는다")
        void doesNotTouchDefaultWhenFalse() {
            TimetableTemplate incoming = template(11L, me, false);

            service.save(incoming);

            verify(timetableTemplateRepository, never()).findByUser(any());
            verify(timetableTemplateRepository).save(incoming);
        }
    }

    @Nested
    @DisplayName("update")
    class Update {

        @Test
        @DisplayName("이름·학년·학기를 갱신한다")
        void updatesFields() {
            TimetableTemplate target = template(10L, me, false);
            RequestTimetableTemplateDto dto = RequestTimetableTemplateDto.builder()
                    .templateName("바뀐 이름")
                    .grade(Grade.SENIOR)
                    .semester(Semester.SECOND)
                    .build();

            service.update(target, dto);

            assertThat(target.getTemplateName()).isEqualTo("바뀐 이름");
            assertThat(target.getGrade()).isEqualTo(Grade.SENIOR);
            assertThat(target.getSemester()).isEqualTo(Semester.SECOND);
        }

        @Test
        @DisplayName("이름을 비우면 DTO가 '학년 학기'로 채워준 값이 들어간다")
        void usesDerivedNameWhenBlank() {
            // RequestTimetableTemplateDto.getTemplateName() 이 비어 있을 때
            // grade.getField() + " " + semester 를 돌려주기 때문이다.
            TimetableTemplate target = template(10L, me, false);
            RequestTimetableTemplateDto dto = RequestTimetableTemplateDto.builder()
                    .templateName("")
                    .grade(Grade.JUNIOR)
                    .semester(Semester.FIRST)
                    .build();

            service.update(target, dto);

            assertThat(target.getTemplateName()).isEqualTo("2학년 FIRST");
        }

        @Test
        @DisplayName("grade가 null이면 학년은 그대로 둔다")
        void keepsGradeWhenNull() {
            TimetableTemplate target = template(10L, me, false);
            RequestTimetableTemplateDto dto = RequestTimetableTemplateDto.builder()
                    .templateName("이름")
                    .grade(null)
                    .semester(Semester.SECOND)
                    .build();

            service.update(target, dto);

            assertThat(target.getGrade()).isEqualTo(Grade.SOPHOMORE);
            assertThat(target.getSemester()).isEqualTo(Semester.SECOND);
        }

        @Test
        @DisplayName("isDefault=true면 기본 템플릿으로 승격된다")
        void promotesToDefault() {
            TimetableTemplate oldDefault = template(9L, me, true);
            TimetableTemplate target = template(10L, me, false);
            when(timetableTemplateRepository.findByUser(me)).thenReturn(List.of(oldDefault, target));
            RequestTimetableTemplateDto dto = RequestTimetableTemplateDto.builder()
                    .templateName("이름").grade(Grade.SENIOR).semester(Semester.FIRST)
                    .isDefault(true).build();

            service.update(target, dto);

            assertThat(target.isDefault()).isTrue();
            assertThat(oldDefault.isDefault()).isFalse();
        }

        @Test
        @DisplayName("isDefault=false면 기본 상태를 내리지 않는다 — 해제 기능은 없다")
        void doesNotDemoteWhenFalse() {
            // update 는 isDefault=false 를 "변경 없음"으로 읽는다. 기본 해제는 다른 템플릿을
            // 기본으로 지정하는 방식으로만 가능하다.
            TimetableTemplate target = template(10L, me, true);
            RequestTimetableTemplateDto dto = RequestTimetableTemplateDto.builder()
                    .templateName("이름").grade(Grade.SENIOR).semester(Semester.FIRST)
                    .isDefault(false).build();

            service.update(target, dto);

            assertThat(target.isDefault()).isTrue();
        }

        @Test
        @DisplayName("templateName이 null이면 이름을 건드리지 않는다 — NPE도 나지 않는다")
        void keepsNameWhenNull() {
            TimetableTemplate target = template(10L, me, false);
            // getTemplateName() 을 우회해 null을 그대로 흘려보낸다.
            RequestTimetableTemplateDto nullNameDto = new RequestTimetableTemplateDto(
                    null, Grade.SENIOR, Semester.SECOND, false) {
                @Override
                public String getTemplateName() {
                    return null;
                }
            };

            service.update(target, nullNameDto);

            assertThat(target.getTemplateName()).isEqualTo("템플릿10");
            // 이름 말고 나머지는 정상 갱신된다
            assertThat(target.getGrade()).isEqualTo(Grade.SENIOR);
            assertThat(target.getSemester()).isEqualTo(Semester.SECOND);
        }

        @Test
        @DisplayName("templateName이 빈 문자열이어도 이름을 건드리지 않는다")
        void keepsNameWhenEmpty() {
            TimetableTemplate target = template(10L, me, false);
            RequestTimetableTemplateDto emptyNameDto = new RequestTimetableTemplateDto(
                    null, Grade.SENIOR, Semester.SECOND, false) {
                @Override
                public String getTemplateName() {
                    return "";
                }
            };

            service.update(target, emptyNameDto);

            assertThat(target.getTemplateName()).isEqualTo("템플릿10");
        }
    }

    @Nested
    @DisplayName("delete")
    class Delete {

        @Test
        @DisplayName("저장소 삭제로 위임한다")
        void delegatesToRepository() {
            TimetableTemplate target = template(10L, me, false);

            service.delete(target);

            verify(timetableTemplateRepository).delete(target);
        }
    }

    /** @OneToMany 필드는 setter가 없어 리플렉션으로 채운다. */
    private static final class ReflectionSetter {
        static void set(Object target, String field, Object value) {
            org.springframework.test.util.ReflectionTestUtils.setField(target, field, value);
        }
    }
}
