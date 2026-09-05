package com.example.highteenday_backend.aop;

import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.services.domain.NotificationFailureService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.task.TaskExecutor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AsyncNotificationAspect")
class AsyncNotificationAspectTest {

    @Mock private TaskExecutor notificationExecutor;
    @Mock private NotificationFailureService notificationFailureService;
    @Mock private ProceedingJoinPoint joinPoint;
    @Mock private MethodSignature methodSignature;
    @Mock private AsyncNotification asyncNotification;

    private AsyncNotificationAspect aspect;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        aspect = new AsyncNotificationAspect(notificationExecutor, notificationFailureService, objectMapper);

        doAnswer(invocation -> {
            ((Runnable) invocation.getArgument(0)).run();
            return null;
        }).when(notificationExecutor).execute(any(Runnable.class));

        lenient().when(joinPoint.getSignature()).thenReturn(methodSignature);
        lenient().when(methodSignature.getReturnType()).thenReturn(void.class);
        lenient().when(methodSignature.toShortString()).thenReturn("TestListener.onEvent(..)");
    }

    @Nested
    @DisplayName("정상 실행")
    class SuccessExecution {

        @Test
        @DisplayName("비동기로 메서드를 실행하고 proceed를 호출한다")
        void proceedsSuccessfully() throws Throwable {
            when(asyncNotification.eventType()).thenReturn(NotificationEventType.COMMENT_CREATED);
            when(joinPoint.getArgs()).thenReturn(new Object[]{Map.of("postId", 1L)});
            when(joinPoint.proceed()).thenReturn(null);

            aspect.handle(joinPoint, asyncNotification);

            verify(joinPoint).proceed();
            verify(notificationFailureService, never()).recordFailure(any(), any(), any());
        }
    }

    @Nested
    @DisplayName("실패 시 recordFailure 호출")
    class FailureRecording {

        @Test
        @DisplayName("proceed 실패 시 실패 기록을 저장한다")
        void recordsFailureOnException() throws Throwable {
            RuntimeException exception = new RuntimeException("DB connection failed");
            when(asyncNotification.eventType()).thenReturn(NotificationEventType.COMMENT_CREATED);
            when(joinPoint.getArgs()).thenReturn(new Object[]{Map.of("postId", 10L)});
            when(joinPoint.proceed()).thenThrow(exception);

            aspect.handle(joinPoint, asyncNotification);

            ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
            verify(notificationFailureService).recordFailure(
                    eq(NotificationEventType.COMMENT_CREATED),
                    payloadCaptor.capture(),
                    eq(exception)
            );
            assertThat(payloadCaptor.getValue()).contains("10");
        }

        @Test
        @DisplayName("이벤트 인자가 없으면 빈 JSON으로 기록한다")
        void recordsEmptyPayloadWhenNoArgs() throws Throwable {
            RuntimeException exception = new RuntimeException("error");
            when(asyncNotification.eventType()).thenReturn(NotificationEventType.FRIEND_REQUEST_SENT);
            when(joinPoint.getArgs()).thenReturn(new Object[]{});
            when(joinPoint.proceed()).thenThrow(exception);

            aspect.handle(joinPoint, asyncNotification);

            ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
            verify(notificationFailureService).recordFailure(
                    eq(NotificationEventType.FRIEND_REQUEST_SENT),
                    payloadCaptor.capture(),
                    eq(exception)
            );
            assertThat(payloadCaptor.getValue()).isEqualTo("{}");
        }
    }

    @Nested
    @DisplayName("void 메서드 검증")
    class VoidMethodValidation {

        @Test
        @DisplayName("void가 아닌 메서드에 적용하면 IllegalStateException")
        void throwsOnNonVoidMethod() {
            when(methodSignature.getReturnType()).thenReturn(String.class);
            when(methodSignature.getName()).thenReturn("nonVoidMethod");

            assertThatThrownBy(() -> aspect.handle(joinPoint, asyncNotification))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("@AsyncNotification is only applicable to void methods");
        }
    }
}
