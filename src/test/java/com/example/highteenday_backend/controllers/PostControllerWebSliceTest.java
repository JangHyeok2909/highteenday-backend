package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.services.domain.PostDetailService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.support.TestPrincipals;
import com.example.highteenday_backend.support.WebSliceTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 웹 슬라이스 테스트 기반이 실제로 동작하는지 보여주는 첫 사용처 (KI-52).
 *
 * 여기서 고정되는 것은 세 가지다: 인가 규칙(비로그인 쓰기 차단),
 * 요청 본문 검증(@Valid 가 실제로 걸리는지), 응답 직렬화(익명 글의 닉네임).
 * 셋 다 이전에는 테스트로 고정할 수단이 없었다.
 */
@WebSliceTest(PostController.class)
class PostControllerWebSliceTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockitoBean
    PostService postService;

    @MockitoBean
    PostDetailService postDetailService;

    private Post samplePost() {
        User author = TestPrincipals.user(1L);
        Board board = Board.builder().id(10L).name("자유게시판").build();
        return Post.create(author, board, "제목", "내용", true);
    }

    @Nested
    @DisplayName("게시글 조회 GET /api/posts/{postId}")
    class GetPost {

        @Test
        @DisplayName("비로그인도 조회할 수 있다")
        void anonymousCanRead() throws Exception {
            given(postService.findById(1L)).willReturn(samplePost());

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("익명 글은 작성자 닉네임 대신 익명 표시를 내보내고 userId 를 비운다")
        void anonymousPostHidesAuthor() throws Exception {
            given(postService.findById(1L)).willReturn(samplePost());

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.author").value("익명"))
                    .andExpect(jsonPath("$.userId").isEmpty());
        }
    }

    @Nested
    @DisplayName("게시글 생성 POST /api/posts")
    class CreatePost {

        @Test
        @DisplayName("비로그인 요청은 401 이다")
        void anonymousIsRejected() throws Exception {
            RequestPostDto dto = RequestPostDto.builder()
                    .boardId(10L).title("제목").content("내용").build();

            mockMvc.perform(post("/api/posts")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(dto)))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("제목이 비면 400 이다 — @Valid 가 실제로 걸린다")
        void blankTitleIsRejected() throws Exception {
            RequestPostDto dto = RequestPostDto.builder()
                    .boardId(10L).title("   ").content("내용").build();

            mockMvc.perform(post("/api/posts")
                            .with(TestPrincipals.loggedInAs(1L))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(dto)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }

        @Test
        @DisplayName("정상 요청은 201 과 Location 헤더를 돌려준다")
        void validRequestIsCreated() throws Exception {
            given(postService.createPost(any(User.class), any(RequestPostDto.class)))
                    .willReturn(samplePost());

            RequestPostDto dto = RequestPostDto.builder()
                    .boardId(10L).title("제목").content("내용").build();

            mockMvc.perform(post("/api/posts")
                            .with(TestPrincipals.loggedInAs(1L))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(dto)))
                    .andExpect(status().isCreated());
        }
    }
}
