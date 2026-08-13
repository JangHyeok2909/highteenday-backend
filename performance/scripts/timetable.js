/**
 * 시간표 부하 스크립트 — 오늘 시간표 / 템플릿 목록 / 템플릿 생성·과목 추가.
 *
 * 검증 포인트:
 *  - /userTimetables/today : 등교 시간대 고빈도 조회 (급식과 함께 아침 피크 구성)
 *  - 템플릿 + 과목 + 사용자시간표 3계층 조인 로딩 비용
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export function todayTimetable() {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/timetableTemplates/userTimetables/today`,
      tags('timetable', 'read', 'timetable_today'),
    );
    check(res, { 'timetable today 200': (r) => r.status === 200 });
    return res;
  });
}

export function listTemplates() {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/timetableTemplates`,
      tags('timetable', 'read', 'template_list'),
    );
    check(res, { 'template list 200': (r) => r.status === 200 });
    return res;
  });
}

export function listSubjects(templateId) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/timetableTemplates/${templateId}/subjects`,
      tags('timetable', 'read', 'subject_list'),
    );
    // templateId는 listTemplates()가 돌려준 내 템플릿이다. 비소유자면 컨트롤러가 400을
    // 주는데, 그 경우는 이 스크립트에 없다 — 나면 조회 경로가 아니라 에러 경로를 잰 것이다.
    check(res, { 'subject list 200': (r) => r.status === 200 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{name:timetable_today}': ['p(95)<250'],
  }),
};

export default function () {
  ensureSession(myUser());
  todayTimetable();
  sleep(thinkTime());
  if (Math.random() < 0.3) {
    const res = listTemplates();
    try {
      const templates = JSON.parse(res.body);
      if (Array.isArray(templates) && templates.length > 0) {
        listSubjects(templates[0].id ?? templates[0].timetableTemplateId);
      }
    } catch (_) {}
    sleep(thinkTime());
  }
}

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 60),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('timetable', STANDALONE_PLAN);
