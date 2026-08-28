package com.example.highteenday_backend.ci;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 배포가 기동 확인 없이 끝나지 않는지 고정한다 (docs/KNOWN-ISSUES.md KI-48).
 *
 * 결함은 "컨테이너가 기동 직후 죽어도 워크플로가 성공으로 남는다"였고, 그 행위는
 * 워크플로 정의에만 존재한다. 그래서 정의 자체를 단언 대상으로 삼는다 — KI-12 의
 * {@link CiTestGateTest} 와 같은 이유다.
 */
class DeploymentHealthCheckTest {

    private static final Path DEPLOY = Path.of(".github/workflows/deploy.yml");

    /** deploy 잡의 SSH 스텝이 EC2 에서 실행하는 스크립트 전문. */
    @SuppressWarnings("unchecked")
    private static String deployScript() throws IOException {
        assertThat(DEPLOY).exists();
        Map<String, Object> workflow;
        try (var in = Files.newInputStream(DEPLOY)) {
            workflow = (Map<String, Object>) new Yaml().load(in);
        }

        Map<String, Object> jobs = (Map<String, Object>) workflow.get("jobs");
        Map<String, Object> deploy = (Map<String, Object>) jobs.get("deploy");
        List<Object> steps = (List<Object>) deploy.get("steps");

        StringBuilder script = new StringBuilder();
        for (Object step : steps) {
            Map<String, Object> withBlock = (Map<String, Object>) ((Map<String, Object>) step).get("with");
            if (withBlock == null) continue;
            Object stepScript = withBlock.get("script");
            if (stepScript != null) script.append(stepScript).append('\n');
        }
        return script.toString();
    }

    @Test
    @DisplayName("컨테이너를 띄운 뒤 actuator 헬스를 확인한다")
    void checksActuatorHealthAfterStart() throws IOException {
        String script = deployScript();

        assertThat(script)
                .as("`up -d` 로 끝나면 컨테이너가 죽어도 워크플로는 성공으로 남는다")
                .contains("/actuator/health");
    }

    @Test
    @DisplayName("헬스 확인에 실패하면 워크플로를 실패로 끝낸다")
    void failsTheWorkflowWhenUnhealthy() throws IOException {
        String script = deployScript();

        assertThat(script)
                .as("확인만 하고 exit 1 이 없으면 실패가 성공으로 보고된다")
                .contains("exit 1");
    }

    @Test
    @DisplayName("헬스 확인에 실패하면 컨테이너 로그를 남긴다")
    void dumpsLogsWhenUnhealthy() throws IOException {
        String script = deployScript();

        assertThat(script)
                .as("로그가 없으면 왜 죽었는지 EC2 에 직접 들어가야만 알 수 있다")
                .contains("docker logs");
    }

    @Test
    @DisplayName("헬스 확인에 실패하면 이전 이미지로 되돌린다")
    void rollsBackWhenUnhealthy() throws IOException {
        String script = deployScript();

        assertThat(script)
                .as("되돌리지 않으면 실패한 배포가 그대로 서비스 중인 상태로 남는다")
                .contains("PREVIOUS_IMAGE");
    }
}
