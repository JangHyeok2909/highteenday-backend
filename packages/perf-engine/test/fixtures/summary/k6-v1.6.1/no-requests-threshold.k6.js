import { sleep } from 'k6';
export const options = { vus: 2, duration: '2s', thresholds: { http_req_duration: ['p(95)<500'], http_req_failed: ['rate<0.01'] } };
export default function () { sleep(0.1); }
