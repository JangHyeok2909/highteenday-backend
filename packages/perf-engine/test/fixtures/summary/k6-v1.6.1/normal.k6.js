import http from 'k6/http';
export const options = { vus: 2, duration: '2s' };
export default function () { http.get('http://127.0.0.1:18999/ok'); }
