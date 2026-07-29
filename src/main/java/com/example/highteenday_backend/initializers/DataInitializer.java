package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.*;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.RequestTimetableDto;
import com.example.highteenday_backend.enums.*;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.services.TimetableTemplateService;
import com.example.highteenday_backend.services.domain.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;


@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer {

    private static final List<String> SUBJECT_POOL = List.of(
            "국어", "문학", "수학", "미적분", "확률과통계", "영어", "영어독해", "한국사",
            "통합사회", "생활과윤리", "통합과학", "물리학", "화학", "생명과학", "지구과학",
            "체육", "음악", "미술", "정보", "일본어"
    );

    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final FriendReqRepository friendReqRepository;
    private final FriendRepository friendRepository;
    private final PostService postService;
    private final PasswordEncoder passwordEncoder;
    private final CommentService commentService;
    private final PostReactionService postReactionService;
    private final ScrapService scrapService;
    private final UserService userService;
    private final SchoolService schoolService;
    private final TimetableTemplateService templateService;
    private final SubjectService subjectService;
    private final TimetableSubjectService timetableSubjectService;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void dataInit() {
        userDataInit();
        User testUser = userService.findByEmail("test1@gmail.com");
        postDataInit(testUser);
        commentDataInit(testUser);
//        likeAndDislikeDataInit(testUser);
        hotPostLikeDataInit();
        scrapDataInit(testUser);
        notificationDataInit(testUser);
        timetableDataInit();
    }

    public void userDataInit(){
        int userCount = 10;
        for(int i=1;i<=userCount;i++){
            String email = "test"+i+"@gmail.com";
            if (userRepository.findByEmail(email).isEmpty()) {
                User user = User.builder()
                        .email(new Email(email))
                        .name(new UserName("tester" + i))
                        .nickname(new Nickname("TestUser" + i))
                        .password(Password.fromHashedValue(passwordEncoder.encode("asd")))
                        .provider(Provider.DEFAULT)
                        .school(schoolService.findById((long)i))
                        .build();
                userRepository.save(user);
                log.info("Test user created. email={}", email);
            }
        }
    }

    public void postDataInit(User user){
        int postCount = 10;
        for(int i=1;i<=postCount;i++){
            long boardId = (i-1)%5+1;
            RequestPostDto requestPostDto = RequestPostDto.builder()
                    .boardId(boardId)
                    .title("TestUser1이 모든 게시판에 쓰는 게시글"+i+"의 제목")
                    .content("<br>TestUser1이 모든 게시판에 쓰는 게시글"+i+"의 내용입니다.</br>")
                    .isAnonymous(false)
                    .build();
            postService.createPost(user,requestPostDto);
        }
        log.info("Test posts initialized. count={}", postCount);
    }
    public void commentDataInit(User user){
        int commentCount = 11;
        for(int i=1;i<=commentCount;i++){
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("testUser1이 postId=" + i + "인 게시글에 다는 댓글" + i)
                    .isAnonymous(false)
                    .build();
            commentService.createComment(postService.findById((long)i),user,dto);
        }
        log.info("Test comments initialized. count={}", commentCount);
    }
    public void likeAndDislikeDataInit(User user){
        int likeCount = 11;
        for(int i=1;i<=likeCount;i++){
            if(i%2==0) postReactionService.likeReact(postService.findById((long)i),user);
            else postReactionService.dislikeReact(postService.findById((long)i),user);
        }
        log.info("Test reactions initialized. count={}", likeCount);
    }

    public void hotPostLikeDataInit(){
        int likeCount = 10;
        Post post = postService.findById(1l);
        for (int i=1;i<=likeCount;i++){
            User user = userService.findByEmail("test" + i + "@gmail.com");
            postReactionService.likeReact(post,user);
        }
        log.info("Hot post reactions initialized. postId=1, count={}", likeCount);
    }

    public void scrapDataInit(User user){
        int scrapCount= 12;
        for (int i = 1; i <= scrapCount; i++) {
            scrapService.toggleScrap((long) i, user);
        }
        log.info("Test scraps initialized. count={}", scrapCount);
    }

    public void notificationDataInit(User testUser1) {
        // FRIEND_REQUEST: testUser2~6 → testUser1 (5개)
        // 실제 친구 요청 데이터 저장 + FriendRequestSentEvent 발행 → NotificationEventListener가 알림 생성
        for (int i = 2; i <= 6; i++) {
            User sender = userService.findByEmail("test" + i + "@gmail.com");
            friendReqRepository.save(FriendReq.builder()
                    .requester(sender)
                    .receiver(testUser1)
                    .status(FriendRequestStatus.REQUESTED)
                    .build());
            eventPublisher.publishEvent(new FriendRequestSentEvent(sender.getId(), testUser1.getId()));
        }

        // FRIEND_ACCEPT: testUser1 → testUser7~9 요청 후 수락됨 (3개 수락 알림 → testUser1)
        // 실제 친구 관계 저장 + FriendRequestAcceptedEvent 발행 → NotificationEventListener가 알림 생성
        for (int i = 7; i <= 9; i++) {
            User acceptor = userService.findByEmail("test" + i + "@gmail.com");
            friendRepository.save(Friend.builder().user(testUser1).friend(acceptor).status(FriendStatus.FRIEND).build());
            friendRepository.save(Friend.builder().user(acceptor).friend(testUser1).status(FriendStatus.FRIEND).build());
            eventPublisher.publishEvent(new FriendRequestAcceptedEvent(testUser1.getId(), acceptor.getId()));
        }

        // POST_COMMENT: testUser2~6이 testUser1의 게시글(1~5)에 댓글 (5개)
        // 실제 댓글 생성 → CommentCreatedEvent 발행 → NotificationEventListener가 알림 생성
        for (int i = 2; i <= 6; i++) {
            User commenter = userService.findByEmail("test" + i + "@gmail.com");
            long postId = i - 1;
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content(commenter.getNicknameValue() + "의 댓글 내용 미리보기입니다.")
                    .isAnonymous(false)
                    .build();
            commentService.createComment(postService.findById(postId), commenter, dto);
        }

        // COMMENT_REPLY: 이벤트 없으므로 직접 생성 (3개)
        for (int i = 2; i <= 4; i++) {
            User sender = userService.findByEmail("test" + i + "@gmail.com");
            long postId = i - 1;
            notificationRepository.save(Notification.builder()
                    .receiver(testUser1)
                    .sender(sender)
                    .category(NotificationCategory.COMMENT_REPLY)
                    .entityType(EntityType.POST)
                    .entityId(postId)
                    .message("내 댓글에 답글이 달렸습니다.")
                    .contentMessage(sender.getNicknameValue() + "의 답글 내용 미리보기입니다.")
                    .build());
        }

        // POST_LIKE_THRESHOLD: 이벤트 없으므로 직접 생성 (2개)
        for (int i = 1; i <= 2; i++) {
            notificationRepository.save(Notification.builder()
                    .receiver(testUser1)
                    .category(NotificationCategory.POST_LIKE_THRESHOLD)
                    .entityType(EntityType.POST)
                    .entityId((long) i)
                    .message("내 게시글에 좋아요가 10개 이상 달렸습니다.")
                    .build());
        }

        // POST_TRENDING: 이벤트 없으므로 직접 생성 (1개)
        notificationRepository.save(Notification.builder()
                .receiver(testUser1)
                .category(NotificationCategory.POST_TRENDING)
                .entityType(EntityType.POST)
                .entityId(1L)
                .message("내 게시글이 인기글에 등록되었습니다.")
                .build());

        // FRIEND_BIRTHDAY: 이벤트 없으므로 직접 생성 (1개)
        User birthdayUser = userService.findByEmail("test2@gmail.com");
        notificationRepository.save(Notification.builder()
                .receiver(testUser1)
                .sender(birthdayUser)
                .category(NotificationCategory.FRIEND_BIRTHDAY)
                .entityType(EntityType.USER)
                .entityId(birthdayUser.getId())
                .message(birthdayUser.getNicknameValue() + "님의 생일입니다. 축하 메시지를 보내보세요!")
                .build());

        log.info("Test notifications initialized. receiver=test1@gmail.com");
    }

    public void timetableDataInit(){
        int userCount = 10;
        for(int i=1;i<=userCount;i++){
            User user = userService.findByEmail("test" + i + "@gmail.com");
            if(!templateService.findByUser(user).isEmpty()) continue;
            userTimetableInit(user, i);
        }
    }

    // 테스트 계정마다 학년/학기, 과목 구성, 요일별 교시 수, 배치 순서를 모두 다르게 생성한다.
    private void userTimetableInit(User user, int seed){
        Grade grade = Grade.values()[(seed-1) % Grade.values().length];
        Semester semester = Semester.values()[(seed-1) % Semester.values().length];

        TimetableTemplate template = templateService.save(TimetableTemplate.builder()
                .user(user)
                .templateName(user.getNicknameValue() + "의 " + grade.getField() + " " + semester.getField() + " 시간표")
                .grade(grade)
                .semester(semester)
                .isDefault(true)
                .build());

        // 과목 풀에서 시작 위치를 계정마다 다르게 잡아 과목 구성이 겹치지 않도록 한다.
        int subjectCount = 6 + (seed % 3);
        List<Subject> subjects = new ArrayList<>();
        for(int i=0;i<subjectCount;i++){
            subjects.add(subjectService.save(Subject.builder()
                    .subjectName(SUBJECT_POOL.get(((seed-1) * 2 + i) % SUBJECT_POOL.size()))
                    .timetableTemplate(template)
                    .build()));
        }

        int periodsPerDay = 5 + (seed % 3);
        for(int day=1;day<=5;day++){
            for(int period=1;period<=periodsPerDay;period++){
                Subject subject = subjects.get(((day-1) * periodsPerDay + (period-1) + seed) % subjects.size());
                timetableSubjectService.createTimetableAndIncHours(subject, template, RequestTimetableDto.builder()
                        .subjectId(subject.getId())
                        .day(DayOfWeek.of(day))
                        .period(String.valueOf(period))
                        .build());
            }
        }
        log.info("Timetable initialized. userId={}, template={}, subjects={}, periodsPerDay={}",
                user.getId(), template.getTemplateName(), subjectCount, periodsPerDay);
    }
}
