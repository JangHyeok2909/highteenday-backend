package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.FriendsInfoDto;
import com.example.highteenday_backend.dtos.RequestFriendsDto;
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

    // 친구 신청
    @PostMapping("/request")
    public ResponseEntity<?> requestFriends(
            @AuthenticationPrincipal CustomUserPrincipal requesterPrincipal,
            @RequestBody RequestFriendsDto receiverDto
            ){

        friendsService.sendFriendsRequest(requesterPrincipal, receiverDto);

        return ResponseEntity.ok("친구 신청 완료");
    }

//    @PostMapping("/respond")
//    public ResponseEntity<?> respondFriends(
//            @AuthenticationPrincipal CustomUserPrincipal receiver,
//            @RequestBody RespondFriendRequestDto status
//            ){
//
//        friendsService.respondToFriendRequest(receiver, status);
//
//        return ResponseEntity.ok("친구 요청 응답 완료");
//    }
}
