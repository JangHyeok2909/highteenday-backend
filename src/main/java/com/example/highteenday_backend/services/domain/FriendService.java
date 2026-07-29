package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Friends.*;
import com.example.highteenday_backend.dtos.UserProfileDto;
import com.example.highteenday_backend.enums.*;
import com.example.highteenday_backend.eventEntities.events.FriendBlockedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestDeclinedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RequiredArgsConstructor
@Service
public class FriendService {

    private final UserRepository userRepository;
    private final UserService userService;
    private final FriendRepository friendRepository;
    private final FriendReqRepository friendReqRepository;
    private final ApplicationEventPublisher eventPublisher;

    // 친구 목록
    @Transactional
   public List<FriendInfoDto> getFriendsList(Long id) {

        List<User> findFriendsList = friendRepository.findAllFriends(id);

        List<FriendInfoDto> friendsListDto = findFriendsList.stream()
                .map(friend -> FriendInfoDto.builder()
                        .id(friend.getId())
                        .nickname(friend.getNicknameValue())
                        .profileUrl(friend.getProfileUrl())
                        .build())
                .toList();

        return friendsListDto;
    }

    // 내가 친구 신청한 목록 || 내가 보낸거
    @Transactional
    public List<FriendInfoDto> getSentFriendsRequestList(User user) {

        List<FriendReq> findSentFriendsRequestList = friendReqRepository.findSentFriendsRequest(user.getId());

        return findSentFriendsRequestList.stream()
                .map(req -> FriendInfoDto.builder()
                        .id(req.getReceiver().getId())
                        .nickname(req.getReceiver().getNicknameValue())
                        .profileUrl(req.getReceiver().getProfileUrl())
                        .build()
                ).toList();
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @Transactional
    public List<FriendInfoDto> getReceivedFriendsList(User user){
        List<FriendReq> findReceivedFriendsList = friendReqRepository.findReceivedFriendRequestsByRecieverId(user.getId());

        return findReceivedFriendsList.stream()
                // 여기서 id는 요청자가 아니라 FriendReq의 id다. /respond가 그 값을 요구한다.
                .map(req -> FriendInfoDto.builder()
                        .id(req.getId())
                        .nickname(req.getRequester().getNicknameValue())
                        .profileUrl(req.getRequester().getProfileUrl())
                        .build()
                ).toList();
    }

    /**
     * 친구 요청. 대상은 id로 지정한다.
     *
     * 상대가 나를 차단한 경우는 USER_NOT_FOUND로 응답한다. 전용 오류를 주면 "차단당했다"는
     * 사실이 드러나는데, 차단은 상대가 알 수 없어야 한다는 것이 기존 정책이다.
     */
    @Transactional
    public void sendFriendsRequest(CustomUserPrincipal requestUser, RequestFriendDto receiverDto){
        User requester = userService.findByEmail(requestUser.getUserEmail());
        User receiver = userService.findById(receiverDto.targetUserId());

        if (requester.getId().equals(receiver.getId())) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }
        if (isBlockedBy(requester.getId(), receiver.getId())) {
            throw new CustomException(ErrorCode.USER_NOT_FOUND);
        }
        if (hasBlocked(requester.getId(), receiver.getId())) {
            throw new CustomException(ErrorCode.BLOCKED_USER);
        }
        if (friendRepository.existsFriendship(requester.getId(), receiver.getId())) {
            throw new CustomException(ErrorCode.ALREADY_FRIENDS);
        }

        // 방향을 나눠서 본다. 역방향 요청이 있으면 자동 수락하지 않고 받은 요청에서
        // 처리하도록 안내한다. 요청을 보냈는데 친구가 되어 있는 편이 더 놀랍기 때문이다.
        for (FriendReq existing : friendReqRepository.findBetween(requester.getId(), receiver.getId())) {
            if (existing.getRequester().getId().equals(requester.getId())) {
                throw new CustomException(ErrorCode.ALREADY_SENT_FRIEND_REQUEST);
            }
            throw new CustomException(ErrorCode.FRIEND_REQUEST_RECEIVED_ALREADY);
        }

        friendReqRepository.save(FriendReq.create(requester, receiver));

        eventPublisher.publishEvent(new FriendRequestSentEvent(requester.getId(), receiver.getId()));
    }

    /** 보낸 요청 취소. 받는 쪽만 지울 수 있던 것을 보낸 쪽에서도 거둘 수 있게 한다. */
    @Transactional
    public void cancelSentRequest(User me, Long targetUserId) {
        FriendReq request = friendReqRepository.findBetween(me.getId(), targetUserId).stream()
                .filter(r -> r.getRequester().getId().equals(me.getId()))
                .findFirst()
                .orElseThrow(() -> new CustomException(ErrorCode.REQUEST_NOT_FOUND));

        friendReqRepository.delete(request);
    }

    // 친구 응답
    @Transactional
    public void respondToFriendRequest(CustomUserPrincipal receiverInfo, RespondFriendRequestDto friendReqDto) {
        FriendReq friendReq = friendReqRepository.findById(friendReqDto.id())
                .orElseThrow(() -> new CustomException(ErrorCode.REQUEST_NOT_FOUND));

        friendReq.validateReceiver(receiverInfo.getUser().getId());

        User requester = friendReq.getRequester();
        User receiver = friendReq.getReceiver();

        //요청 수락
        if (friendReqDto.status().equalsIgnoreCase(FriendRequestStatus.ACCEPTED.name())) {
            friendRepository.save(Friend.createFriendship(requester, receiver));
            friendRepository.save(Friend.createFriendship(receiver, requester));
            eventPublisher.publishEvent(new FriendRequestAcceptedEvent(requester.getId(), receiver.getId()));
        }
        // 응답자가 차단 했을거니까 응답자만 차단 상태 요청자는 모름
        else if (friendReqDto.status().equalsIgnoreCase(FriendRequestStatus.BLOCKED.name())) {
            friendRepository.save(Friend.createBlock(receiver, requester));
            eventPublisher.publishEvent(new FriendBlockedEvent(receiver.getId(), requester.getId()));
        }
        // 요청 거절시 아무 응답 없음
        else if (friendReqDto.status().equalsIgnoreCase(FriendRequestStatus.DECLINED.name())) {
            eventPublisher.publishEvent(new FriendRequestDeclinedEvent(requester.getId(), receiver.getId()));
        }

        friendReqRepository.delete(friendReq);

    }

    // 친구 삭제 | A B 둘다 삭제
    @Transactional
    public void deleteFriends(User me, User deleteFriendsUser) {
        List<Friend> relations = friendRepository.findFriendsRelations(me.getId(), deleteFriendsUser.getId());
        if (relations.isEmpty()) {
            throw new CustomException(ErrorCode.FRIEND_NOT_FOUND);
        }

        friendRepository.deleteAll(relations);
    }

    // 친구 차단
    @Transactional
    public void blockUser(User me, User blockUser){

        List<Friend> relations = friendRepository.findFriendsRelations(me.getId(), blockUser.getId());
        if(relations.isEmpty()){
            friendRepository.save(Friend.createBlock(me, blockUser));
        } else {
            relations.stream()
                    .filter(r -> r.getUser().getId().equals(me.getId()))
                    .forEach(Friend::block);
        }
    }

    // 친구 차단 해제
    @Transactional
    public void unBlockUser(User me, User unBlockUser) {

        List<Friend> relations = friendRepository.findFriendsRelations(me.getId(), unBlockUser.getId());
        if (relations.isEmpty()) { // 차단한적도 친구 관계 였던적도 없음
            throw new CustomException(ErrorCode.FRIEND_NOT_FOUND);
        }

        Friend reverseRelations = relations.stream()
                .filter(r -> r.getUser().getId().equals(unBlockUser.getId()) && r.getFriend().getId().equals(me.getId()))
                .findFirst()
                .orElse(null);
        
        if(reverseRelations == null){ // 친구 였던적이 없는 관계 | A가 B를 차단만 했던 관계
            relations.stream()
                    .filter(r -> r.getUser().getId().equals(me.getId()))
                    .findFirst()
                    .ifPresent(friendRepository::delete);
        } else {
            relations.stream()
                    .filter(r -> r.getUser().getId().equals(me.getId()))
                    .forEach(Friend::unblock);
        }
    }

    // 서로 차단하지 않은 친구 관계인지 검증
    @Transactional
    public void validateFriendship(Long meId, Long friendId) {
        if (!friendRepository.existsFriendship(meId, friendId)) {
            throw new CustomException(ErrorCode.FRIEND_NOT_FOUND);
        }
    }

    /**
     * 후보 전원과 나의 관계를 세 번의 쿼리로 구한다. 채팅 참여자 목록처럼 N명의 관계가
     * 한꺼번에 필요한 화면에서 1인 1쿼리를 피하기 위한 것이다.
     *
     * 친구 판정은 existsFriendship과 같은 상호 기준을 쓴다. 한쪽만 FRIEND인 관계
     * (= 상대가 나를 차단)를 친구로 세면, 배지는 "친구"인데 시간표 조회는 404가 나서
     * 화면과 권한이 어긋난다.
     */
    @Transactional
    public Map<Long, RelationStatus> getRelations(Long meId, Collection<Long> candidateIds) {
        if (candidateIds.isEmpty()) return Map.of();

        Set<Long> friends = Set.copyOf(friendRepository.findMutualFriendIdsAmong(meId, candidateIds));
        Set<Long> sent = Set.copyOf(friendReqRepository.findRequestedIdsAmong(meId, candidateIds));
        Set<Long> received = Set.copyOf(friendReqRepository.findRequesterIdsAmong(meId, candidateIds));

        Map<Long, RelationStatus> relations = new HashMap<>();
        for (Long id : candidateIds) {
            relations.put(id, resolve(meId, id, friends, sent, received));
        }
        return relations;
    }

    /** 단건 관계. 프로필 카드처럼 대상이 한 명일 때 쓴다. */
    @Transactional
    public RelationStatus getRelation(Long meId, Long targetId) {
        return getRelations(meId, List.of(targetId)).getOrDefault(targetId, RelationStatus.NONE);
    }

    private static RelationStatus resolve(Long meId, Long targetId,
                                          Set<Long> friends, Set<Long> sent, Set<Long> received) {
        if (targetId.equals(meId)) return RelationStatus.SELF;
        if (friends.contains(targetId)) return RelationStatus.FRIEND;
        // 서로 요청이 오갔다면 받은 쪽을 우선한다. 그래야 사용자가 수락으로 바로 끝낼 수 있다.
        if (received.contains(targetId)) return RelationStatus.REQUEST_RECEIVED;
        if (sent.contains(targetId)) return RelationStatus.REQUEST_SENT;
        return RelationStatus.NONE;
    }

    /**
     * 친구의 프로필. 친구가 아니면 FRIEND_NOT_FOUND(404)다.
     *
     * validateFriendship이 상호 판정을 쓰므로 상대가 나를 차단한 경우도 여기서 404가 된다.
     * "차단당했다"를 따로 알리지 않는 기존 정책과 결과가 같다.
     */
    @Transactional
    public UserProfileDto getFriendProfile(User me, Long targetId) {
        if (me.getId().equals(targetId)) {
            return UserProfileDto.fromEntity(me, RelationStatus.SELF);
        }
        validateFriendship(me.getId(), targetId);
        return UserProfileDto.fromEntity(userService.findById(targetId), RelationStatus.FRIEND);
    }

    /** 상대가 나를 차단했는지. 차단은 한 방향으로만 저장된다(차단자 -> 대상). */
    @Transactional
    public boolean isBlockedBy(Long meId, Long targetId) {
        return friendRepository.findFriendsRelations(meId, targetId).stream()
                .anyMatch(r -> r.isBlocked() && r.getUser().getId().equals(targetId));
    }

    /** 내가 상대를 차단했는지. */
    @Transactional
    public boolean hasBlocked(Long meId, Long targetId) {
        return friendRepository.findFriendsRelations(meId, targetId).stream()
                .anyMatch(r -> r.isBlocked() && r.getUser().getId().equals(meId));
    }

    // 친구 검색
    // 검색 했는데 없으면 그냥 빈 리스트 반환
    @Transactional
    public List<UserSearchResultDto> selectFriend(User me, SelectFriendDto selectFriendDto) {
        if (selectFriendDto.nickname() == null) return List.of();

        List<User> found = userRepository.findByNickname(selectFriendDto.nickname()).stream()
                // 나를 차단한 사람은 검색에서 아예 빠진다. 차단이 실제로 동작하는 첫 지점이다.
                .filter(u -> !isBlockedBy(me.getId(), u.getId()))
                .toList();
        if (found.isEmpty()) return List.of();

        Map<Long, RelationStatus> relations =
                getRelations(me.getId(), found.stream().map(User::getId).toList());

        return found.stream()
                .map(u -> UserSearchResultDto.fromEntity(u, relations.get(u.getId())))
                .toList();
    }

}
