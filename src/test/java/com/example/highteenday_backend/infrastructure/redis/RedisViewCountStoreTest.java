package com.example.highteenday_backend.infrastructure.redis;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 대기 카운터 탐색이 SCAN 으로 이뤄지는지 고정한다 (docs/KNOWN-ISSUES.md KI-17).
 *
 * 왜 어댑터에서 보는가: 결함은 "KEYS 로 전체 키스페이스를 훑는다"였고 그 행위는
 * 이 클래스에만 있다. 스케줄러·서비스 테스트는 포트가 돌려준 Map 만 보므로,
 * 탐색 명령을 KEYS 로 되돌려도 그대로 통과한다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RedisViewCountStore")
class RedisViewCountStoreTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private Cursor<String> cursor;

    @InjectMocks
    private RedisViewCountStore store;

    private void givenScanReturns(String... keys) {
        Boolean[] rest = new Boolean[keys.length];
        for (int i = 0; i < keys.length; i++) rest[i] = i < keys.length - 1;
        when(redisTemplate.scan(any(ScanOptions.class))).thenReturn(cursor);
        if (keys.length == 0) {
            when(cursor.hasNext()).thenReturn(false);
            return;
        }
        when(cursor.hasNext()).thenReturn(true, rest);
        String first = keys[0];
        String[] tail = new String[keys.length - 1];
        System.arraycopy(keys, 1, tail, 0, keys.length - 1);
        when(cursor.next()).thenReturn(first, tail);
    }

    @Nested
    @DisplayName("peekPendingCounts")
    class PeekPendingCounts {

        @Test
        @DisplayName("KEYS 가 아니라 SCAN 으로 대기 키를 훑는다 — KEYS 는 Redis 전체를 멈춘다")
        void scansInsteadOfKeys() {
            givenScanReturns("post:views:1");
            when(redisTemplate.opsForValue()).thenReturn(valueOperations);
            when(valueOperations.get("post:views:1")).thenReturn("5");

            Map<Long, Integer> pending = store.peekPendingCounts();

            assertThat(pending).containsExactly(org.assertj.core.api.Assertions.entry(1L, 5));
            verify(redisTemplate, never()).keys(anyString());
        }

        @Test
        @DisplayName("SCAN 은 접두사 패턴으로만 훑는다 — 전체 키스페이스를 받으면 의미가 없다")
        void scanIsScopedToPrefix() {
            givenScanReturns();

            store.peekPendingCounts();

            ArgumentCaptor<ScanOptions> captor = ArgumentCaptor.forClass(ScanOptions.class);
            verify(redisTemplate).scan(captor.capture());
            assertThat(captor.getValue().getPattern()).isEqualTo("post:views:*");
            assertThat(captor.getValue().getCount()).isNotNull();
        }

        @Test
        @DisplayName("커서를 닫는다 — 안 닫으면 60초마다 커넥션이 샌다")
        void closesCursor() {
            givenScanReturns();

            store.peekPendingCounts();

            verify(cursor).close();
        }

        @Test
        @DisplayName("값이 없거나 0 이하인 키는 결과에서 뺀다")
        void skipsEmptyAndNonPositiveValues() {
            givenScanReturns("post:views:1", "post:views:2", "post:views:3");
            when(redisTemplate.opsForValue()).thenReturn(valueOperations);
            when(valueOperations.get("post:views:1")).thenReturn(null);
            when(valueOperations.get("post:views:2")).thenReturn("0");
            when(valueOperations.get("post:views:3")).thenReturn("7");

            Map<Long, Integer> pending = store.peekPendingCounts();

            assertThat(pending).containsOnlyKeys(3L);
        }
    }
}
