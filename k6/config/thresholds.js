/**
 * 시나리오별 임계값 정의
 */

export const baselineThresholds = {
  'http_req_failed': ['rate<0.001'],
  'http_req_duration{endpoint:board_posts}': ['p(95)<500'],
  'http_req_duration{endpoint:post_detail}': ['p(95)<500'],
  'http_req_duration{endpoint:comments}': ['p(95)<500'],
  'http_req_duration{endpoint:hot_posts}': ['p(95)<300'],
  'http_req_duration{endpoint:unread_count}': ['p(95)<300'],
  'http_req_duration{endpoint:search}': ['p(95)<3000'],
  'http_req_duration{endpoint:reaction}': ['p(95)<1000'],
  'http_req_duration{endpoint:create_comment}': ['p(95)<1000'],
  'http_req_duration{endpoint:create_post}': ['p(95)<2000'],
  'http_req_duration{endpoint:login}': ['p(95)<2000'],
};

export const lunchRushThresholds = {
  'http_req_failed': ['rate<0.05'],
  'http_req_duration{endpoint:board_posts}': ['p(95)<2000'],
  'http_req_duration{endpoint:post_detail}': ['p(95)<2000'],
  'http_req_duration{endpoint:unread_count}': ['p(95)<3000'],
};

export const viralPostThresholds = {
  'http_req_failed': ['rate<0.03'],
  'http_req_duration{endpoint:post_detail}': ['p(95)<1500'],
  'http_req_duration{endpoint:reaction}': ['p(95)<2000'],
};

export const commentBattleThresholds = {
  'http_req_failed': ['rate<0.03'],
  'http_req_duration{endpoint:create_comment}': ['p(95)<2000'],
};

export const notificationThresholds = {
  'http_req_failed': ['rate<0.02'],
  'http_req_duration{endpoint:unread_count}': ['p(95)<1000'],
  'http_req_duration{endpoint:board_posts}': ['p(95)<1000'],
};

export const searchThresholds = {
  'http_req_failed': ['rate<0.05'],
  'http_req_duration{endpoint:search}': ['p(95)<5000'],
};

export const cacheMissThresholds = {
  'http_req_failed': ['rate<0.05'],
  'http_req_duration{endpoint:board_posts}': ['p(99)<10000'],
};

export const loginBurstThresholds = {
  'http_req_failed': ['rate<0.01'],
  'http_req_duration{endpoint:login}': ['p(95)<3000'],
};

export const soakThresholds = {
  'http_req_failed': ['rate<0.001'],
  'http_req_duration{endpoint:board_posts}': ['p(99)<2000'],
  'http_req_duration{endpoint:post_detail}': ['p(99)<2000'],
  'http_req_duration{endpoint:unread_count}': ['p(99)<1000'],
};
