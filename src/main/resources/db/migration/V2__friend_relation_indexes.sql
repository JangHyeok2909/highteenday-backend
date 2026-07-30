-- V2: 친구 관계 조회용 복합 인덱스.
--
-- 프로필 기능이 추가한 조회 패턴을 받쳐주기 위한 것이다. 테이블 구조는 바꾸지 않는다.
-- (프로필/친구요청 변경에서 새로 저장하는 데이터는 없다.)
--
-- MySQL은 FK마다 단일 컬럼 인덱스를 자동으로 만들어 두는데, 아래 쿼리들은 두 컬럼과
-- 상태값을 함께 걸러내므로 단일 컬럼만으로는 행을 다 읽어야 한다. 채팅방 참여자 목록은
-- 인원 수만큼 이 판정을 반복하므로 여기가 가장 먼저 느려진다.

-- ------------------------------------------------------------------
-- friends
-- ------------------------------------------------------------------
-- findMutualFriendIdsAmong / existsFriendship
--   바깥 조건: USR_id = ? AND FRD_status = 'FRIEND' AND USR_frd_id IN (...)
--   EXISTS 조건: USR_id = ? AND USR_frd_id = ? AND FRD_status = 'FRIEND'
-- 세 컬럼 모두 동등 비교라 아래 한 인덱스로 양쪽이 커버된다.
CREATE INDEX idx_friends_usr_status_frd
    ON friends (USR_id, FRD_status, USR_frd_id);

-- findAllFriends의 UNION 뒷부분과 findFriendsRelations의 역방향 조건이
-- USR_frd_id를 선행 컬럼으로 쓴다.
CREATE INDEX idx_friends_frd_status_usr
    ON friends (USR_frd_id, FRD_status, USR_id);

-- ------------------------------------------------------------------
-- friends_requests
-- ------------------------------------------------------------------
-- findRequestedIdsAmong: USR_req_id = ? AND USR_rec_id IN (...)
-- findBetween의 정방향 조건도 같은 모양이다.
CREATE INDEX idx_friends_requests_req_rec
    ON friends_requests (USR_req_id, USR_rec_id);

-- findRequesterIdsAmong: USR_rec_id = ? AND USR_req_id IN (...)
-- findBetween의 역방향 조건도 같은 모양이다.
CREATE INDEX idx_friends_requests_rec_req
    ON friends_requests (USR_rec_id, USR_req_id);
