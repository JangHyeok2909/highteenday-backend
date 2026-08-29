package com.example.highteenday_backend.metrics;

/**
 * 현재 요청의 {@link QueryCountRecorder}를 담아 두는 ThreadLocal 보관소.
 *
 * 계측 지점(p6spy 리스너)과 집계 지점(서블릿 필터)이 서로를 모르는 상태로 붙어야 하므로
 * 스레드에 매달아 전달한다. 요청 밖에서 실행된 SQL(스케줄러, 커넥션 검증, 애플리케이션
 * 기동 시 초기화)은 보관소가 비어 있으므로 자연스럽게 제외된다 — 그 양은
 * {@code db.queries.outside.request} 카운터가 따로 센다.
 *
 * {@link #begin(boolean)}과 {@link #end()}는 반드시 짝을 이뤄야 한다. 짝이 깨지면
 * 스레드 풀에 재사용되는 스레드에 누적기가 남아 다음 요청의 쿼리 수가 부풀려진다.
 */
public final class QueryCountContext {

    private static final ThreadLocal<QueryCountRecorder> HOLDER = new ThreadLocal<>();

    private QueryCountContext() {
    }

    /**
     * 새 요청의 계측을 시작한다.
     *
     * @param detail SQL별 실행 횟수까지 기억할지 여부. 요청마다 맵을 하나 만들기 때문에
     *               부하 테스트 대상 환경(dev·perf)에서만 켠다.
     */
    public static void begin(boolean detail) {
        HOLDER.set(new QueryCountRecorder(detail));
    }

    /** 계측 중인 요청 스레드인지. 리스너가 요청 밖 쿼리를 가려내는 데 쓴다. */
    public static boolean isActive() {
        return HOLDER.get() != null;
    }

    /** 계측 중이 아니면 null. 테스트에서 요청 처리 도중의 누적값을 볼 때 쓴다. */
    public static QueryCountRecorder current() {
        return HOLDER.get();
    }

    /** 계측을 끝내고 결과를 돌려준다. 계측 중이 아니었다면 null. */
    public static QueryCountRecorder end() {
        QueryCountRecorder recorder = HOLDER.get();
        HOLDER.remove();
        return recorder;
    }

    static void record(String sql, long elapsedNanos, int statementCount) {
        QueryCountRecorder recorder = HOLDER.get();
        if (recorder != null) {
            recorder.record(sql, elapsedNanos, statementCount);
        }
    }
}
