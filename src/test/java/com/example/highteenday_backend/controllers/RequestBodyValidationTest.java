package com.example.highteenday_backend.controllers;

import jakarta.validation.Valid;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 요청 본문 검증이 모든 컨트롤러에 걸려 있는지 확인한다 (docs/KNOWN-ISSUES.md KI-16).
 *
 * <p>결함은 "특정 요청이 잘못 처리된다"가 아니라 <b>"DTO 에 제약을 붙여도 조용히 무시된다"</b>
 * 였다. `@Valid` 가 전체에서 3곳뿐이라, 댓글·채팅·친구·회원가입 DTO 는 어떤 제약을 붙여도
 * Bean Validation 을 타지 않았다. 그런 함정은 개별 요청 테스트로는 드러나지 않는다 —
 * 제약이 없으니 통과하고, 제약을 붙여도 무시되니 또 통과한다.
 *
 * <p>그래서 <b>구조</b>를 단언한다. 모든 컨트롤러의 `@RequestBody` 파라미터에 `@Valid` 가
 * 붙어 있는지 리플렉션으로 훑는다. 새 엔드포인트를 `@Valid` 없이 추가하면 여기서 깨진다.
 *
 * <p>검증이 실제로 <b>동작</b>하는지(제약 위반이 400 으로 나가는지)는
 * {@code PostControllerWebSliceTest.blankTitleIsRejected()} 가 따로 확인한다.
 * 이 테스트는 "그 배관이 모든 엔드포인트에 연결돼 있는가"만 본다.
 */
class RequestBodyValidationTest {

    private static final String CONTROLLER_PACKAGE = "com.example.highteenday_backend.controllers";

    /**
     * 검증 대상에서 빼는 본문 타입.
     *
     * {@code Map} 은 Bean Validation 이 걸 제약이 없는 타입이라 `@Valid` 를 붙여도 아무
     * 의미가 없다. 이런 자리는 값 검사를 핸들러 안에서 해야 한다.
     */
    private static final Set<Class<?>> NOT_VALIDATABLE = Set.of(Map.class);

    private static List<Class<?>> controllerClasses() {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        List<Class<?>> classes = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents(CONTROLLER_PACKAGE)) {
            try {
                classes.add(Class.forName(definition.getBeanClassName()));
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException(e);
            }
        }
        return classes;
    }

    @Test
    @DisplayName("모든 @RestController 를 찾는다 — 스캔이 비면 이 테스트는 아무것도 검사하지 않는다")
    void scannerFindsControllers() {
        assertThat(controllerClasses())
                .as("스캔 결과가 비면 아래 테스트가 공허하게 통과한다")
                .hasSizeGreaterThan(10);
    }

    @Test
    @DisplayName("모든 @RequestBody 파라미터에 @Valid 가 붙어 있다")
    void everyRequestBodyIsValidated() {
        List<String> unvalidated = new ArrayList<>();

        for (Class<?> controller : controllerClasses()) {
            for (Method method : controller.getDeclaredMethods()) {
                for (Parameter parameter : method.getParameters()) {
                    if (!parameter.isAnnotationPresent(RequestBody.class)) continue;
                    if (NOT_VALIDATABLE.contains(parameter.getType())) continue;
                    if (parameter.isAnnotationPresent(Valid.class)) continue;

                    unvalidated.add("%s.%s(%s)".formatted(
                            controller.getSimpleName(), method.getName(), parameter.getType().getSimpleName()));
                }
            }
        }

        assertThat(unvalidated)
                .as("@Valid 가 없으면 그 DTO 는 어떤 제약을 붙여도 조용히 무시된다 (KI-16)")
                .isEmpty();
    }
}
