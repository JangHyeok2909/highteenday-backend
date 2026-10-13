import { sleep } from 'k6';
export const options = { vus: 2, duration: '2s' };
export default function () { sleep(0.1); }
