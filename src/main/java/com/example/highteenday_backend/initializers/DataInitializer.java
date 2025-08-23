package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.schools.UserTimetables.UserTimetable;
import com.example.highteenday_backend.domain.schools.subjects.Subject;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.services.TimetableTemplateService;
import com.example.highteenday_backend.services.UserTimetableService;
import com.example.highteenday_backend.services.domain.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;


@Component
@RequiredArgsConstructor
public class DataInitializer {

    private final UserRepository userRepository;
    private final PostService postService;
    private final PasswordEncoder passwordEncoder;
    private final CommentService commentService;
    private final PostReactionService postReactionService;
    private final ScrapService scrapService;
    private final UserService userService;
    private final SchoolService schoolService;
    private final TimetableTemplateService templateService;
    private final UserTimetableService timetableService;
    private final SubjectService subjectService;
    private final TimetableSubjectService timetableSubjectService;

    @Transactional
    public void dataInit() {
        userDataInit();
        User testUser = userService.findByEmail("test1@gmail.com");
        postDataInit(testUser);
        commentDataInit(testUser);
//        likeAndDislikeDataInit(testUser);
        hotPostLikeDataInit();
        scrapDataInit(testUser);
        dafultTimetableDatasInit(testUser);
    }

    public void userDataInit(){
        int userCount = 10;
        for(int i=1;i<=userCount;i++){
            String email = "test"+i+"@gmail.com";
            if (userRepository.findByEmail(email).isEmpty()) {
                String phone;
                if(i>=10) phone = "+8210"+String.valueOf(i).repeat(8).substring(0,13);
                else phone = "+8210"+String.valueOf(i).repeat(8);


                User user = new User();
                user.setEmail(email);
                user.setName("tester" + i);
                user.setNickname("TestUser" + i);
                user.setProvider(Provider.DEFAULT);
                user.setHashedPassword(passwordEncoder.encode("asd"));
                user.setSchool(schoolService.findById((long)i));
                user.setPhone(phone);
                userRepository.save(user);
                System.out.println("초기 테스트 유저 설정, user email: " + email);
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
        System.out.println("테스트 게시글 생성완료");
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
        System.out.println("테스트 댓글 생성완료");
    }

    public void likeAndDislikeDataInit(User user){
        int likeCount = 11;
        for(int i=1;i<=likeCount;i++){
            if(i%2==0) postReactionService.likeReact(postService.findById((long)i),user);
            else postReactionService.dislikeReact(postService.findById((long)i),user);
        }
        System.out.println("테스트 좋아요/싫어요 생성완료");
    }

    public void hotPostLikeDataInit(){
        int likeCount = 10;
        Post post = postService.findById(1l);
        for (int i=1;i<=likeCount;i++){
            User user = userService.findByEmail("test" + i + "@gmail.com");
            postReactionService.likeReact(post,user);
        }
        System.out.println("postId=1인 게시글 좋아요 10개 생성.");
    }

    public void scrapDataInit(User user){
        int scrapCount= 12;
        for (int i = 1; i <= scrapCount; i++) {
            scrapService.createScrap(postService.findById((long) i), user);
        }
        System.out.println("테스트 스크랩 생성완료");
    }

    public void dafultTimetableDatasInit(User user){
        TimetableTemplate template = TimetableTemplate.builder()
                .user(user)
                .templateName("test default template")
                .grade(Grade.JUNIOR)
                .semester(Semester.FIRST)
                .isDefault(true)
                .build();
        TimetableTemplate savedTemplate= templateService.save(template);

        List<Subject> subjects = new ArrayList<>();
        for(int i=1;i<=7;i++){
            Subject subject = Subject.builder()
                    .subjectName("test subject" + i)
                    .timetableTemplate(savedTemplate)
                    .build();
            subjects.add(subjectService.save(subject));
        }
        for (int i=1;i<7;i++) {
            for(int j=0;j<7;j++){
                UserTimetable timetable = UserTimetable.builder()
                        .timetableTemplate(savedTemplate)
                        .subject(subjects.get(j))
                        .period(String.valueOf(j+1))
                        .day(DayOfWeek.of(i))
                        .build();
                timetableService.save(timetable);
            }
        }
        System.out.println("기본 시간표 생성완료");

    }
}

