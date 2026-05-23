package com.example.highteenday_backend.aop;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("ExecutionLoggingAspect")
class ExecutionLoggingAspectTest {

    private ExecutionLoggingAspect aspect;

    @BeforeEach
    void setUp() {
        aspect = new ExecutionLoggingAspect();
    }

    private ProceedingJoinPoint mockJoinPoint(Object returnValue) throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        Signature signature = mock(Signature.class);
        when(signature.toShortString()).thenReturn("TestController.testMethod(..)");
        when(joinPoint.getSignature()).thenReturn(signature);
        when(joinPoint.proceed()).thenReturn(returnValue);
        return joinPoint;
    }

    private ProceedingJoinPoint mockJoinPointThrows(Exception exception) throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        Signature signature = mock(Signature.class);
        when(signature.toShortString()).thenReturn("TestController.failMethod(..)");
        when(joinPoint.getSignature()).thenReturn(signature);
        when(joinPoint.proceed()).thenThrow(exception);
        return joinPoint;
    }

    @Nested
    @DisplayName("정상 실행")
    class NormalExecution {

        @Test
        @DisplayName("Controller advice — 예외 없이 정상 완료되고 결과를 반환한다")
        void controllerCompletesAndReturnsResult() throws Throwable {
            ProceedingJoinPoint joinPoint = mockJoinPoint("ok");

            Object result = aspect.logController(joinPoint);

            assertThat(result).isEqualTo("ok");
        }

        @Test
        @DisplayName("Service advice — 예외 없이 정상 완료되고 결과를 반환한다")
        void serviceCompletesAndReturnsResult() throws Throwable {
            ProceedingJoinPoint joinPoint = mockJoinPoint(42);

            Object result = aspect.logService(joinPoint);

            assertThat(result).isEqualTo(42);
        }
    }

    @Nested
    @DisplayName("예외 발생")
    class ExceptionHandling {

        @Test
        @DisplayName("Controller advice — 예외를 삼키지 않고 rethrow한다")
        void controllerRethrowsException() throws Throwable {
            ProceedingJoinPoint joinPoint = mockJoinPointThrows(new RuntimeException("boom"));

            assertThatThrownBy(() -> aspect.logController(joinPoint))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessage("boom");
        }

        @Test
        @DisplayName("Service advice — 예외를 삼키지 않고 rethrow한다")
        void serviceRethrowsException() throws Throwable {
            ProceedingJoinPoint joinPoint = mockJoinPointThrows(new IllegalArgumentException("invalid"));

            assertThatThrownBy(() -> aspect.logService(joinPoint))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("invalid");
        }
    }
}
