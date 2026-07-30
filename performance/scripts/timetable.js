/**
 * 시간표 부하 스크립트 — 오늘 시간표 / 템플릿 목록 / 템플릿 생성·과목 추가.
 *
 * 검증 포인트:
 *  - /userTimetables/today : 등교 시간대 고빈도 조회 (급식과 함께 아침 피크 구성)
 *  - 템플릿 + 과목 + 사용자시간표 3계층 조인 로딩 비용
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
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
    check(res, { 'timetable today not 5xx': (r) => r.status < 500 });
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
    check(res, { 'subject list not 5xx': (r) => r.status < 500 });
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

export const handleSummary = makeHandleSummary('timetable');
