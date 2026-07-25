package com.example.highteenday_backend.logging;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 로그 문에 개인정보 원문이 인자로 들어가지 않는지 소스 전체를 훑어 검증한다.
 *
 * <p>운영 로그 레벨은 INFO이고 로그는 장기 보관된다. 미성년자 이메일/전화번호/실명이 한 번
 * 기록되면 회수할 수 없으므로, 새 로그 문이 추가될 때 리뷰가 아니라 빌드가 막아야 한다.
 * 식별이 필요하면 userId를 남기거나 {@code LogMasker}를 거칠 것.
 */
class PiiLoggingGuardTest {

    private static final Path SOURCE_ROOT = Path.of("src/main/java");

    /** log.xxx( ... ) 한 줄. 여러 줄로 쪼개진 호출은 첫 줄만 검사한다. */
    private static final Pattern LOG_CALL = Pattern.compile("log\\.(trace|debug|info|warn|error)\\s*\\((.*)");

    /**
     * 로그 인자로 넘기면 안 되는 표현.
     * 마스킹을 거친 값(LogMasker.…)과 그 자체로 식별자가 아닌 값은 제외한다.
     */
    private static final List<Pattern> FORBIDDEN_ARGUMENTS = List.of(
            Pattern.compile("\\b\\w*(?<!masked)[eE]mail\\s*\\(\\s*\\)"),   // getEmail(), email()
            Pattern.compile("\\bgetEmailValue\\s*\\(\\s*\\)"),
            Pattern.compile("\\b\\w*[pP]hone\\s*\\(\\s*\\)"),
            Pattern.compile("\\bgetNicknameValue\\s*\\(\\s*\\)"),
            Pattern.compile("\\bgetRawPassword\\s*\\(\\s*\\)"),
            Pattern.compile("\\brefreshToken\\b(?!\\s*!=)"),
            Pattern.compile("\\baccessToken\\b(?!\\s*!=)")
    );

    @Test
    @DisplayName("로그 문에 이메일/전화번호/닉네임/토큰 원문을 직접 넘기지 않는다")
    void noPiiPassedToLogStatements() {
        List<String> violations = new ArrayList<>();

        for (Path file : javaSources()) {
            List<String> lines = readLines(file);
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher call = LOG_CALL.matcher(line);
                if (!call.find()) continue;

                String args = call.group(2);
                if (args.contains("LogMasker.")) continue;

                for (Pattern forbidden : FORBIDDEN_ARGUMENTS) {
                    if (forbidden.matcher(args).find()) {
                        violations.add("%s:%d  %s".formatted(
                                SOURCE_ROOT.relativize(file), i + 1, line.trim()));
                        break;
                    }
                }
            }
        }

        assertThat(violations)
                .as("로그에 개인정보 원문이 들어갑니다. userId를 쓰거나 LogMasker로 가려주세요.")
                .isEmpty();
    }

    private List<Path> javaSources() {
        try (Stream<Path> paths = Files.walk(SOURCE_ROOT)) {
            return paths.filter(p -> p.toString().endsWith(".java")).toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private List<String> readLines(Path file) {
        try {
            return Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
