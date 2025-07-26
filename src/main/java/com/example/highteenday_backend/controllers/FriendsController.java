package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.FriendsInfoDto;
import com.example.highteenday_backend.dtos.RequestFriendsDto;
import com.example.highteenday_backend.dtos.RespondFriendRequestDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.security.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.FriendsService;
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
public class FriendsController {

    private final FriendsService friendsService;
    private final UserRepository userRepository;
    private User getLoginUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
    }

    // 친구 목록
    @GetMapping("/list")
    public ResponseEntity<?> getFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ){
        User findUser = getLoginUser(user.getUser().getEmail());

        List<FriendsInfoDto> friendsListDto = friendsService.getFriendsList(findUser.getId());
        
        return ResponseEntity.ok(friendsListDto);
    }

    // 내가 친구 신청한 목록 || 내가 보낸거
    @GetMapping("/requests/sent")
    public ResponseEntity<?> getSentFriendsRequestList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ){
        User findUser = getLoginUser(user.getUser().getEmail());

        List<FriendsInfoDto> friendsListDto = friendsService.getSentFriendsRequestList(findUser);

        return ResponseEntity.ok(friendsListDto);
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @GetMapping("/requests/received")
    public ResponseEntity<?> getReceivedFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        User findUser = getLoginUser(user.getUser().getEmail());

        List<FriendsInfoDto> friendsListDto = friendsService.getReceivedFriendsList(findUser);

        return ResponseEntity.ok(friendsListDto);
    }

    // 친구 삭제
    @PostMapping("/delete")
    public ResponseEntity<?> deleteFriends(
            @AuthenticationPrincipal CustomUserPrincipal user
    ){

    }

    // 친구 차단

    // 친구 검색

    // 친구 신청
    @PostMapping("/request")
    public ResponseEntity<?> requestFriends(
            @AuthenticationPrincipal CustomUserPrincipal requesterPrincipal,
            @RequestBody RequestFriendsDto receiverDto
            ){

        friendsService.sendFriendsRequest(requesterPrincipal, receiverDto);

        return ResponseEntity.ok("친구 신청 완료");
    }

    // 친구 신청 응답
    @PostMapping("/respond")
    public ResponseEntity<?> respondFriends(
            @AuthenticationPrincipal CustomUserPrincipal receiver,
            @RequestBody RespondFriendRequestDto friendReqDto
            ){

        friendsService.respondToFriendRequest(receiver, friendReqDto);

        return ResponseEntity.ok("친구 요청 응답 완료");
    }
}
