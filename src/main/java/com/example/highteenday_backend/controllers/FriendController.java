package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.Friends.*;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.FriendService;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequestMapping("/api/friends")
@RestController
@RequiredArgsConstructor
@Slf4j
public class FriendController {

    private final FriendService friendService;
    private final UserService userService;

    // 친구 목록
    @GetMapping("/list")
    public ResponseEntity<?> getFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        List<FriendInfoDto> friendsListDto = friendService.getFriendsList(user.getUser().getId());

        return ResponseEntity.ok(friendsListDto);
    }

    // 내가 친구 신청한 목록 || 내가 보낸거
    @GetMapping("/requests/sent")
    public ResponseEntity<?> getSentFriendsRequestList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        List<FriendInfoDto> friendsListDto = friendService.getSentFriendsRequestList(user.getUser());

        return ResponseEntity.ok(friendsListDto);
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @GetMapping("/requests/received")
    public ResponseEntity<?> getReceivedFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        List<FriendInfoDto> friendsListDto = friendService.getReceivedFriendsList(user.getUser());

        return ResponseEntity.ok(friendsListDto);
    }

    // 친구 삭제
    @DeleteMapping("/delete")
    public ResponseEntity<?> deleteFriends(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody DeleteFriendDto deleteFriendDto
    ) {
        User findFriends = userService.findByEmail(deleteFriendDto.email());

        friendService.deleteFriends(user.getUser(), findFriends);

        return ResponseEntity.ok("친구 삭제 완료");
    }

    // 친구 차단
    // A가 B를 차단 했을 때, B는 A가 나를 차단 했다는 사실을 모름
    // B가 A한테 메세지를 보낼 수 는 있지만 A는 B 한테서 메세지가 온지 모름
    // A가 B의 정보를 볼 수는 있지만, B는 A의 정보를 볼 수 없음
    // A와 B의 친구관계는 A만 삭제
    // A -> B || B -> A 2개 있을 때 A -> B 관계만 삭제
    @PatchMapping("/block")
    public ResponseEntity<?> blockUser(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody BlockUserDto blockUserDto
    ) {
        User findBlockUser = userService.findByEmail(blockUserDto.email());

        friendService.blockUser(user.getUser(), findBlockUser);

        return ResponseEntity.ok("유저 차단 완료");
    }

    // 차단 해제
    @PatchMapping("/unBlock")
    public ResponseEntity<?> unBlockUser(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody UnBlockUserDto unBlockUserDto
    ) {
        User findUnBlockUser = userService.findByEmail(unBlockUserDto.email());

        friendService.unBlockUser(user.getUser(), findUnBlockUser);

        return ResponseEntity.ok("유저 차단 해제 완료");
    }

    // 친구 검색
    @PostMapping("/search")
    public ResponseEntity<?> searchFriend(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody SelectFriendDto selectFriendDto
    ){
        return ResponseEntity.ok(friendService.searchUsersByNickname(user.getUser(), selectFriendDto));
    }

    // 친구 신청
    @PostMapping("/request")
    public ResponseEntity<?> requestFriends(
            @AuthenticationPrincipal CustomUserPrincipal requesterPrincipal,
            @RequestBody RequestFriendDto receiverDto
    ) {

        friendService.sendFriendsRequest(requesterPrincipal, receiverDto);

        return ResponseEntity.ok("친구 신청 완료");
    }

    // 보낸 친구 신청 취소
    @DeleteMapping("/request/{targetUserId}")
    public ResponseEntity<?> cancelFriendRequest(
            @AuthenticationPrincipal CustomUserPrincipal requesterPrincipal,
            @PathVariable Long targetUserId
    ) {

        friendService.cancelSentRequest(requesterPrincipal.getUser(), targetUserId);

        return ResponseEntity.ok("친구 신청 취소 완료");
    }

    // 친구 신청 응답
    @PostMapping("/respond")
    public ResponseEntity<?> respondFriends(
            @AuthenticationPrincipal CustomUserPrincipal receiver,
            @RequestBody RespondFriendRequestDto friendReqDto
    ) {

        friendService.respondToFriendRequest(receiver, friendReqDto);

        return ResponseEntity.ok("친구 요청 응답 완료");
    }
}
