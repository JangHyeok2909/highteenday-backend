package com.example.highteenday_backend.metrics;

import com.p6spy.engine.common.StatementInformation;
import com.p6spy.engine.event.SimpleJdbcEventListener;

import java.sql.SQLException;
import java.util.concurrent.atomic.LongAdder;

/**
 * JDBC 문장 실행을 세어 현재 요청의 누적기에 넘기는 p6spy 리스너.
 *
 * 왜 p6spy인가.
 * - 이미 의존성에 있고 DataSource가 이미 프록시로 감싸여 있다. dev·prod에서 꺼둔 것은
 *   로깅 모듈(decorator.datasource.p6spy.enable-logging=false)이지 프록시가 아니다.
 *   따라서 새 의존성도, 새 프록시 계층도 필요 없다.
 * - JDBC 계층이라 JPA·QueryDSL·네이티브 쿼리를 가리지 않고 전부 잡힌다. 특히 지연 로딩이
 *   응답 직렬화 중에 만들어내는 SELECT까지 포함되는데, 이것이 N+1의 실체이고
 *   spring_data_repository_invocations 같은 상위 계층 지표로는 보이지 않는 부분이다.
 *
 * 이 리스너가 요청 하나에 더하는 비용은 문장당 ThreadLocal 조회 한 번과 정수 덧셈 몇
 * 개다. detail 모드가 아니면 문자열도 만들지 않는다.
 */
public class QueryCountListener extends SimpleJdbcEventListener {

    /**
     * 어느 엔드포인트에도 귀속되지 않은 문장 수. 스케줄러, 커넥션 검증, 기동 시 초기화가
     * 여기 쌓이고, 계측 제외 경로(액추에이터 health의 DB 검사)도 함께 들어온다.
     *
     * 이 값이 있어야 "엔드포인트 합계 + 이 값 = MySQL questions" 검산이 성립한다.
     * 검산이 맞지 않으면 계측이 새고 있다는 뜻이므로 지표를 믿으면 안 된다.
     */
    private final LongAdder outsideRequestStatements = new LongAdder();

    /**
     * execute, executeQuery, executeUpdate가 모두 이 콜백으로 모인다.
     * 배치 실행도 상위 클래스가 여기로 넘기지만, 아래에서 따로 가로채므로 여기 오지 않는다.
     */
    @Override
    public void onAfterAnyExecute(StatementInformation statementInformation, long timeElapsedNanos, SQLException e) {
        count(statementInformation, timeElapsedNanos, 1);
    }

    /**
     * 배치 실행은 라운드트립 1회에 문장 여러 개다.
     *
     * 상위 클래스({@link SimpleJdbcEventListener})는 이 콜백을 onAfterAnyExecute로 넘겨
     * 배치 전체를 문장 하나로 세어 버린다. MySQL은 배치 안의 문장을 각각 questions로
     * 세므로 그대로 두면 검산이 어긋난다. 그래서 super를 호출하지 않고 여기서 직접 센다.
     *
     * updateCounts는 실행이 실패하면 null일 수 있다. 그 경우 최소 1문장은 나갔다고 본다.
     */
    @Override
    public void onAfterExecuteBatch(StatementInformation statementInformation, long timeElapsedNanos,
                                    int[] updateCounts, SQLException e) {
        count(statementInformation, timeElapsedNanos, updateCounts == null ? 1 : updateCounts.length);
    }

    private void count(StatementInformation statementInformation, long timeElapsedNanos, int statementCount) {
        if (!QueryCountContext.isActive()) {
            outsideRequestStatements.add(statementCount);
            return;
        }
        QueryCountContext.record(statementInformation.getSql(), timeElapsedNanos, statementCount);
    }

    public LongAdder outsideRequestStatements() {
        return outsideRequestStatements;
    }
}
