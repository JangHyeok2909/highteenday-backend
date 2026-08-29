package com.example.highteenday_backend.metrics;

import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 요청 하나가 실행한 SQL을 모으는 누적기.
 *
 * 한 요청은 한 스레드에서만 실행되므로(이 프로젝트에는 @Async·DeferredResult 경로가 없다)
 * 동기화하지 않는다. 스레드를 넘나드는 실행이 생기면 이 클래스는 그 구간을 조용히
 * 놓치므로, 비동기 경로를 도입할 때 반드시 함께 손봐야 한다.
 *
 * 세 가지를 구분해서 센다.
 * - statements : DB로 보낸 SQL 문장 수. MySQL의 questions 카운터와 대응하는 값이고
 *                "요청당 쿼리 수"의 기준이다. 배치 실행은 문장 N개로 센다.
 * - roundTrips : JDBC execute* 호출 횟수. 배치는 몇 문장이든 1회다.
 *                statements 와 벌어지면 배치가 동작하고 있다는 뜻이다.
 * - dbTimeNanos: execute* 호출에 걸린 시간의 합. 쿼리가 '많은' 것과 쿼리 하나가
 *                '느린' 것을 가른다.
 */
public final class QueryCountRecorder {

    /**
     * detail 모드에서 기억할 SQL 종류의 상한.
     * N+1은 같은 SQL이 수백 번 반복되는 형태라 종류 수는 적다. 상한을 두는 것은
     * 동적 SQL이 요청 하나에서 수천 종류로 튀는 경우에 맵이 커지는 것을 막기 위해서다.
     */
    private static final int MAX_TRACKED_SQL = 64;

    /** 로그 한 줄이 감당할 수 있는 SQL 길이. 앞부분만 있어도 어떤 쿼리인지 식별된다. */
    private static final int SQL_LOG_LENGTH = 120;

    /** Hibernate가 만드는 SQL은 줄바꿈과 들여쓰기를 포함한다. 로그 한 줄로 접기 위해 미리 컴파일해 둔다. */
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    /** SQL별 실행 횟수. detail 모드가 아니면 null이며, 그때는 종류를 세지 않는다. */
    private final Map<String, int[]> perSql;

    private int statements;
    private int roundTrips;
    private long dbTimeNanos;

    QueryCountRecorder(boolean detail) {
        this.perSql = detail ? new HashMap<>() : null;
    }

    void record(String sql, long elapsedNanos, int statementCount) {
        this.statements += statementCount;
        this.roundTrips++;
        this.dbTimeNanos += elapsedNanos;

        if (perSql == null || sql == null) {
            return;
        }
        int[] counter = perSql.get(sql);
        if (counter != null) {
            counter[0] += statementCount;
        } else if (perSql.size() < MAX_TRACKED_SQL) {
            perSql.put(sql, new int[]{statementCount});
        }
    }

    public int statements() {
        return statements;
    }

    public int roundTrips() {
        return roundTrips;
    }

    public long dbTimeMillis() {
        return TimeUnit.NANOSECONDS.toMillis(dbTimeNanos);
    }

    public long dbTimeNanos() {
        return dbTimeNanos;
    }

    /** detail 모드가 아니면 -1. 0과 구분해야 하므로 음수로 표시한다. */
    public int distinctSql() {
        return perSql == null ? -1 : perSql.size();
    }

    /**
     * 가장 많이 실행된 SQL 상위 n개를 {@code "SELECT ... x300"} 형태로 이어 붙인다.
     * N+1 판정의 핵심 근거다 — 문장 하나가 요청 한 번에 수백 회 찍히면 그것이 N이다.
     * detail 모드가 아니면 null.
     */
    public String topSql(int n) {
        if (perSql == null || perSql.isEmpty()) {
            return null;
        }
        return perSql.entrySet().stream()
                .sorted(Comparator.comparingInt((Map.Entry<String, int[]> e) -> e.getValue()[0]).reversed())
                .limit(n)
                .map(e -> abbreviate(e.getKey()) + " x" + e.getValue()[0])
                .collect(Collectors.joining(" | "));
    }

    private static String abbreviate(String sql) {
        String flat = WHITESPACE.matcher(sql).replaceAll(" ").trim();
        return flat.length() <= SQL_LOG_LENGTH ? flat : flat.substring(0, SQL_LOG_LENGTH) + "...";
    }
}
