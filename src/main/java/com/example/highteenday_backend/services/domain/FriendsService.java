package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Friends.*;
import com.example.highteenday_backend.enums.*;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@RequiredArgsConstructor
@Service
public class FriendsService {

    private final UserRepository userRepository;
    private final FriendRepository friendRepository;
    private final FriendReqRepository friendReqRepository;
    private final NotificationRepository notificationRepository;

    // 친구 목록
    @Transactional
   public List<FriendsInfoDto> getFriendsList(Long id) {

        List<User> findFriendsList = friendRepository.findAllFriends(id);

        List<FriendsInfoDto> friendsListDto = findFriendsList.stream()
                .map(friend -> FriendsInfoDto.builder()
                        .id(friend.getId())
                        .name(friend.getName())
                        .nickname(friend.getNickname())
                        .email(friend.getEmail())
//                        .school(friend.getSchool().getName())
                        .build())
                .toList();

        return friendsListDto;
    }

    // 내가 친구 신청한 목록 || 내가 보낸거
    @Transactional
    public List<FriendsInfoDto> getSentFriendsRequestList(User user) {

        List<FriendReq> findSentFriendsRequestList = friendReqRepository.findSentFriendsRequest(user.getId());

        return findSentFriendsRequestList.stream()
                .map(req -> FriendsInfoDto.builder()
                        .id(req.getReceiver().getId())
                        .name(req.getReceiver().getName())
                        .nickname(req.getReceiver().getNickname())
                        .email(req.getReceiver().getEmail())
                        .build()
                ).toList();
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @Transactional
    public List<FriendsInfoDto> getReceivedFriendsList(User user){
        List<FriendReq> findReceivedFriendsList = friendReqRepository.findReceivedFriendRequestsByRecieverId(user.getId());

        return findReceivedFriendsList.stream()
                .map(req -> FriendsInfoDto.builder()
                        .id(req.getId())
                        .name(req.getRequester().getName())
                        .nickname(req.getRequester().getNickname())
                        .email(req.getRequester().getEmail())
                        .build()
                ).toList();
    }

    // 친구 요청
    @Transactional
    public void sendFriendsRequest(CustomUserPrincipal requestUser, RequestFriendsDto receiverDto){
        User requester = userRepository.findByEmail(requestUser.getUserEmail())
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        User receiver = userRepository.findByEmail(receiverDto.email())
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        if(friendReqRepository.existsByRequesterAndReceiver(requester, receiver)){
            throw new CustomException(ErrorCode.ALREADY_SENT_FRIEND_REQUEST);
        }

        FriendReq friendReq = friendReqRepository.save(
                FriendReq.builder()
                    .requester(requester)
                    .receiver(receiver)
                    .status(FriendRequestStatus.REQUESTED)
                    .build()
            );

        notificationRepository.save(
                Notification.builder()
                        .receiver(receiver)
                        .sender(requester)
                        .category(NotificationCategory.FRIEND_REQUEST)
                        .entityType(EntityType.USER)
                        .entityId(requester.getId())
                        .message(receiver.getNickname() + "님에게 친구 요청을 보냈습니다.")
                        .build()
        );

    }

    // 친구 응답
    @Transactional
    public void respondToFriendRequest(CustomUserPrincipal receiverInfo, RespondFriendRequestDto friendReqDto) {
        FriendReq friendReq = friendReqRepository.findById(friendReqDto.id())
                .orElseThrow(() -> new CustomException(ErrorCode.REQUEST_NOT_FOUND));

        User requester = friendReq.getRequester();
        User receiver = friendReq.getReceiver();
        //요청 수락
        if(friendReqDto.status().toUpperCase().equals(FriendRequestStatus.ACCEPTED.name())){
            // 보낸사람 저장
            friendRepository.save(Friend.builder()
                    .user(requester)
                    .friend(receiver)
                    .status(FriendStatus.FRIEND)
                    .build());

            // 받는사람 저장
            friendRepository.save(Friend.builder()
                    .user(receiver)
                    .friend(requester)
                    .status(FriendStatus.FRIEND)
                    .build());
            //친구 요청 수락 알림 저장
            notificationRepository.save(
                    Notification.builder()
                            .receiver(receiver)
                            .sender(requester)
                            .category(NotificationCategory.FRIEND_ACCEPT)
                            .entityType(EntityType.USER)
                            .entityId(requester.getId())
                            .message(receiver.getNickname() + "님이 친구 요청을 수락했습니다.")
                            .build()
            );
            //친구 요청 삭제

        }
        // 응답자가 차단 했을거니까 응답자만 차단 상태 요청자는 모름 | 친구 요청 보낸사람도 차단 됐는지 알게 할까?
        else if (friendReqDto.status().toUpperCase().equals(FriendRequestStatus.BLOCKED.name())) {

            friendRepository.save(Friend.builder()
                    .user(receiver)
                    .friend(requester)
                    .status(FriendStatus.BLOCKED)
                    .build());

        }
        // 요청 거절시 아무 응답 없음
        else if (friendReqDto.status().equalsIgnoreCase(FriendRequestStatus.DECLINED.name())) {
            // ;
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
            friendRepository.save(Friend.builder()
                    .user(me)
                    .friend(blockUser)
                    .status(FriendStatus.BLOCKED)
                    .build());
        } else {
            relations.stream()
                    .filter(r -> r.getUser().getId().equals(me.getId()))
                    .forEach(r -> r.setStatus(FriendStatus.BLOCKED));
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
                    .forEach(r -> r.setStatus(FriendStatus.FRIEND));
        }
    }

    // 친구 검색
    // 검색 했는데 없으면 그냥 빈 리스트 반환
    @Transactional
    public List<User> selectFriend(SelectFriendDto selectFriendDto) {
        List<User> selectUser = null;

        if(selectFriendDto.email() != null){
            selectUser = userRepository.findByEmail(selectFriendDto.email()).stream().toList();
        } else if(selectFriendDto.name() != null){
            selectUser = userRepository.findByName(selectFriendDto.name());
        } else if(selectFriendDto.nickname() != null){
            selectUser = userRepository.findByNickname(selectFriendDto.nickname()).stream().toList();
        }

        return selectUser;
    }

}
