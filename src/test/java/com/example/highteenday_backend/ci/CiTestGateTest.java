package com.example.highteenday_backend.ci;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CI 파이프라인이 테스트를 실제로 돌리는지 고정한다 (docs/KNOWN-ISSUES.md KI-12).
 *
 * 왜 워크플로 파일을 테스트하는가: KI-12 의 증상은 "코드가 틀렸다"가 아니라
 * "틀린 코드를 아무도 안 막는다"였다. 그 결함은 자바 코드로는 재현되지 않고
 * 워크플로 정의에만 존재하므로, 정의 자체를 단언 대상으로 삼는다.
 * 누군가 테스트 게이트를 지우거나 build 잡의 needs 를 떼면 여기서 깨진다.
 */
class CiTestGateTest {

    private static final Path DEPLOY = Path.of(".github/workflows/deploy.yml");
    private static final Path CI = Path.of(".github/workflows/ci.yml");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> load(Path path) throws IOException {
        assertThat(path).as("워크플로 파일이 존재해야 한다: %s", path).exists();
        try (var in = Files.newInputStream(path)) {
            return (Map<String, Object>) new Yaml().load(in);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> jobs(Map<String, Object> workflow) {
        return (Map<String, Object>) workflow.get("jobs");
    }

    /** 잡 하나가 실행하는 모든 run 명령을 이어 붙인다. */
    @SuppressWarnings("unchecked")
    private static String runCommandsOf(Object job) {
        List<String> commands = new ArrayList<>();
        Object steps = ((Map<String, Object>) job).get("steps");
        if (steps instanceof List<?> list) {
            for (Object step : list) {
                Object run = ((Map<String, Object>) step).get("run");
                if (run != null) commands.add(run.toString());
            }
        }
        return String.join("\n", commands);
    }

    /**
     * YAML 1.1 에서 `on:` 은 불리언 true 로 파싱된다. 두 키를 모두 본다.
     */
    private static Object triggersOf(Map<String, Object> workflow) {
        Object triggers = workflow.get("on");
        return triggers != null ? triggers : workflow.get(Boolean.TRUE);
    }

    @Nested
    @DisplayName("배포 워크플로")
    class DeployWorkflow {

        @Test
        @DisplayName("테스트를 실행하는 잡이 있다")
        void hasTestJob() throws IOException {
            Map<String, Object> jobs = jobs(load(DEPLOY));

            assertThat(jobs).containsKey("test");
            assertThat(runCommandsOf(jobs.get("test")))
                    .as("test 잡은 gradlew test 를 실행해야 한다")
                    .contains("gradlew test");
        }

        @Test
        @DisplayName("이미지 빌드는 테스트 잡이 통과해야만 시작된다")
        @SuppressWarnings("unchecked")
        void buildDependsOnTest() throws IOException {
            Map<String, Object> jobs = jobs(load(DEPLOY));
            Object needs = ((Map<String, Object>) jobs.get("build")).get("needs");

            // needs 는 문자열 하나이거나 문자열 리스트일 수 있다.
            List<String> required = needs instanceof List<?> list
                    ? list.stream().map(Object::toString).toList()
                    : List.of(String.valueOf(needs));

            assertThat(required)
                    .as("build 잡이 test 를 needs 로 걸어야 게이트가 성립한다")
                    .contains("test");
        }

        @Test
        @DisplayName("배포는 빌드가 끝나야만 시작된다")
        @SuppressWarnings("unchecked")
        void deployDependsOnBuild() throws IOException {
            Map<String, Object> jobs = jobs(load(DEPLOY));
            Object needs = ((Map<String, Object>) jobs.get("deploy")).get("needs");

            List<String> required = needs instanceof List<?> list
                    ? list.stream().map(Object::toString).toList()
                    : List.of(String.valueOf(needs));

            assertThat(required).contains("build");
        }
    }

    @Nested
    @DisplayName("CI 워크플로")
    class CiWorkflow {

        @Test
        @DisplayName("풀 리퀘스트에서 테스트를 실행한다")
        @SuppressWarnings("unchecked")
        void runsTestsOnPullRequest() throws IOException {
            Map<String, Object> workflow = load(CI);

            Object triggers = triggersOf(workflow);
            assertThat(triggers)
                    .as("병합 전에 돌아야 게이트다 — pull_request 트리거가 필요하다")
                    .isInstanceOf(Map.class);
            assertThat((Map<String, Object>) triggers).containsKey("pull_request");

            String commands = jobs(workflow).values().stream()
                    .map(CiTestGateTest::runCommandsOf)
                    .reduce("", (a, b) -> a + "\n" + b);
            assertThat(commands).contains("gradlew test");
        }
    }
}
