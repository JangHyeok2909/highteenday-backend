package com.example.highteenday_backend.support;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

/**
 * 테스트용 인증 주체 생성기.
 *
 * spring-security-test 의 {@code @WithMockUser} 는 스프링 기본 {@code UserDetails} 를
 * 심으므로, 컨트롤러의 {@code @AuthenticationPrincipal CustomUserPrincipal} 이 null 이 된다.
 * 그래서 실제 principal 타입을 직접 만들어 넣는다.
 */
public final class TestPrincipals {

    private TestPrincipals() {
    }

    public static User user(Long id) {
        return User.builder()
                .id(id)
                .email(new Email("user" + id + "@example.com"))
                .nickname(new Nickname("사용자" + id))
                .name(new UserName("홍길동"))
                .role(Role.USER)
                .build();
    }

    public static CustomUserPrincipal principal(Long id) {
        return new CustomUserPrincipal(user(id));
    }

    public static Authentication authenticationFor(Long id) {
        CustomUserPrincipal p = principal(id);
        return new UsernamePasswordAuthenticationToken(p, "", p.getAuthorities());
    }

    /** MockMvc 요청에 로그인 상태를 입힌다. */
    public static RequestPostProcessor loggedInAs(Long id) {
        return authentication(authenticationFor(id));
    }
}
