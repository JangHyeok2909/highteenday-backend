package com.example.highteenday_backend.aop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = {SchedulerJobAspectTest.TestConfig.class})
@DisplayName("SchedulerJobAspect")
class SchedulerJobAspectTest {

    @Configuration
    @EnableAspectJAutoProxy
    static class TestConfig {
        @Bean
        SchedulerJobAspect schedulerJobAspect() {
            return new SchedulerJobAspect();
        }

        @Bean
        SampleJob sampleJob() {
            return new SampleJob();
        }
    }

    static class SampleJob {
        @SchedulerJob(name = "SuccessJob")
        public void succeed() {
        }

        @SchedulerJob(name = "FailJob")
        public void fail() {
            throw new RuntimeException("boom");
        }

        @SchedulerJob(name = "NonVoidJob")
        public String nonVoid() {
            return "value";
        }
    }

    @Autowired
    SampleJob sampleJob;

    @Nested
    @DisplayName("정상 실행")
    class NormalExecution {

        @Test
        @DisplayName("예외 없이 정상 완료된다")
        void completesWithoutException() {
            assertThatCode(() -> sampleJob.succeed())
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("예외 발생")
    class ExceptionHandling {

        @Test
        @DisplayName("예외를 로깅한 뒤 rethrow한다 — 삼키지 않음")
        void rethrowsAfterLogging() {
            assertThatThrownBy(() -> sampleJob.fail())
                    .isInstanceOf(RuntimeException.class)
                    .hasMessage("boom");
        }
    }

    @Nested
    @DisplayName("반환 타입 검증")
    class ReturnTypeValidation {

        @Test
        @DisplayName("void가 아닌 메서드에 사용하면 IllegalStateException이 발생한다")
        void rejectsNonVoidMethod() {
            assertThatThrownBy(() -> sampleJob.nonVoid())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("only applicable to void methods");
        }
    }
}
