package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Friends.*;
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

import java.util.List;

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
                        .name(friend.getNameValue())
                        .nickname(friend.getNicknameValue())
                        .email(friend.getEmailValue())
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
                        .name(req.getReceiver().getNameValue())
                        .nickname(req.getReceiver().getNicknameValue())
                        .email(req.getReceiver().getEmailValue())
                        .profileUrl(req.getReceiver().getProfileUrl())
                        .build()
                ).toList();
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @Transactional
    public List<FriendInfoDto> getReceivedFriendsList(User user){
        List<FriendReq> findReceivedFriendsList = friendReqRepository.findReceivedFriendRequestsByRecieverId(user.getId());

        return findReceivedFriendsList.stream()
                .map(req -> FriendInfoDto.builder()
                        .id(req.getId())
                        .name(req.getRequester().getNameValue())
                        .nickname(req.getRequester().getNicknameValue())
                        .email(req.getRequester().getEmailValue())
                        .profileUrl(req.getRequester().getProfileUrl())
                        .build()
                ).toList();
    }

    // 친구 요청
    @Transactional
    public void sendFriendsRequest(CustomUserPrincipal requestUser, RequestFriendDto receiverDto){
        User requester = userService.findByEmail(requestUser.getUserEmail());
        User receiver = userService.findByNickname(receiverDto.nickname());

        if(friendReqRepository.existsByRequesterAndReceiver(requester, receiver)){
            throw new CustomException(ErrorCode.ALREADY_SENT_FRIEND_REQUEST);
        }

        FriendReq friendReq = friendReqRepository.save(FriendReq.create(requester, receiver));

        eventPublisher.publishEvent(new FriendRequestSentEvent(requester.getId(), receiver.getId()));
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

    // 친구 검색
    // 검색 했는데 없으면 그냥 빈 리스트 반환
    @Transactional
    public List<User> selectFriend(SelectFriendDto selectFriendDto) {
        if (selectFriendDto.nickname() == null) return List.of();
        return userRepository.findByNickname(selectFriendDto.nickname()).stream().toList();
    }

}
