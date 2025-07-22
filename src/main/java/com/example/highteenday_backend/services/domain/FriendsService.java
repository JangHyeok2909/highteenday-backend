package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.FriendsInfoDto;
import com.example.highteenday_backend.dtos.RequestFriendsDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.FriendRequestStatus;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.security.CustomException;
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
                        .firendReq(friendReq)
                        .message(receiver.getNickname() + "님이 친구 요청을 보냈습니다.")
                        .category(NotificationCategory.FRIEND_REQ)
                        .build()
        );

    }

//    @Transactional
//    public void respondToFriendRequest(CustomUserPrincipal receiver, RespondFriendRequestDto status) {
//        FriendReq friendReq = friendReqRepository.findById(dto.friendReq().getId())
//                .orElseThrow(() -> new CustomException(ErrorCode.REQUEST_NOT_FOUND));
//
//        // 요청 거절시 아무 응답 없음
//        if(status.toUpperCase().equals(FriendRequestStatus.ACCEPTED.name())){
//            User request = friendReq.getRequester();
//            User receiver = friendReq.getReceiver();
//
//            friendRepository.save(Friend.builder()
//                    .user(request)
//                    .friend(receiver)
//                    .status(FriendStatus.FRIEND)
//                    .build());
//
//            friendRepository.save(Friend.builder()
//                    .user(receiver)
//                    .friend(request)
//                    .status(FriendStatus.FRIEND)
//                    .build());
//
//            friendReqRepository.delete(dto.friendReq());
//        } else if (status.toUpperCase().equals(FriendRequestStatus.BLOCKED.name())) { // 응답자가 차단 했을거니까 응다자만 차단 상태 요청자는 모름
//            User request = friendReq.getRequester();
//            User receiver = friendReq.getReceiver();
//
//            friendRepository.save(Friend.builder()
//                    .user(receiver)
//                    .friend(request)
//                    .status(FriendStatus.BLOCKED)
//                    .build());
//        } else if (status.equalsIgnoreCase(FriendRequestStatus.DECLINED.name())) {
//            friendReqRepository.delete(friendReq);
//        }
//
//    }
}
