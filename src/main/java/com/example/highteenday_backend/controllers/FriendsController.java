package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Friends.*;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.FriendsService;
import com.example.highteenday_backend.services.domain.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequestMapping("/api/friends")
@RestController
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Friends", description = "친구 목록/요청/차단 등 친구 관련 API")

public class FriendsController {

    private final FriendsService friendsService;
    private final UserService userService;

    private User getUserData(String email) {
        return userService.findByEmail(email);
    }


    @Operation(summary = "내 친구 목록 조회")
    @ApiResponse(responseCode = "200",
            description = "친구 목록",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array = @ArraySchema(schema = @Schema(implementation = FriendsInfoDto.class))))
    @GetMapping("/list")
    public ResponseEntity<List<FriendsInfoDto>> getFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        User findUser = getUserData(user.getUser().getEmail());
        List<FriendsInfoDto> friendsListDto = friendsService.getFriendsList(findUser.getId());

        return ResponseEntity.ok(friendsListDto);
    }


    @Operation(summary = "내가 보낸 친구 요청 목록")
    @ApiResponse(responseCode = "200",
            description = "보낸 요청 목록",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array = @ArraySchema(schema = @Schema(implementation = FriendsInfoListDto.class))))
    @GetMapping("/requests/sent")
    public ResponseEntity<List<FriendsInfoListDto>> getSentFriendsRequestList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        User findUser = getUserData(user.getUser().getEmail());

        List<FriendsInfoListDto> friendsListDto = friendsService.getSentFriendsRequestList(findUser);

        return ResponseEntity.ok(friendsListDto);
    }

    // 누가 나한테 친구 요청한 목록 | 누군가 나한테 신청한 목록
    @Operation(summary = "나에게 온 친구 요청 목록")
    @ApiResponse(responseCode = "200",
            description = "받은 요청 목록",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array = @ArraySchema(schema = @Schema(implementation = FriendsInfoListDto.class))))
    @GetMapping("/requests/received")
    public ResponseEntity<List<FriendsInfoListDto>> getReceivedFriendsList(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        User findUser = getUserData(user.getUser().getEmail());
        List<FriendsInfoListDto> friendsListDto = friendsService.getReceivedFriendsList(findUser);

        return ResponseEntity.ok(friendsListDto);
    }

    // 친구 삭제
    @Operation(summary = "친구 삭제")
    @ApiResponse(responseCode = "200", description = "삭제 완료")
    @PostMapping(value = "/delete", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> deleteFriends(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            schema = @Schema(implementation = DeleteFriendDto.class),
                            examples = @ExampleObject(name = "기본 예시", value = """
                                    {   
                                        "id": 1,
                                        "email": "test1@gmail.com" 
                                    }
                                    """)
                    )
            )
            @RequestBody DeleteFriendDto deleteFriendDto
    ) {

        User findUser = getUserData(user.getUser().getEmail());
        User findFriends = getUserData(deleteFriendDto.email());

        friendsService.deleteFriends(findUser, findFriends);

        return ResponseEntity.ok("친구 삭제 완료");
    }

    // 친구 차단
    // A가 B를 차단 했을 때, B는 A가 나를 차단 했다는 사실을 모름
    // B가 A한테 메세지를 보낼 수 는 있지만 A는 B 한테서 메세지가 온지 모름
    // A가 B의 정보를 볼 수는 있지만, B는 A의 정보를 볼 수 없음
    // A와 B의 친구관계는 A만 삭제
    // A -> B || B -> A 2개 있을 때 A -> B 관계만 삭제
    @Operation(summary = "유저 차단", description = """
            A가 B를 차단 시, B는 차단 사실을 모름. 
            A<-B 메시지는 오지만 A는 알림/표시가 되지 않도록 처리.
            A<->B 친구관계는 A->B만 삭제.
            """)
    @ApiResponse(responseCode = "200", description = "차단 완료")
    @PostMapping(value = "/block", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> blockUser(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            schema = @Schema(implementation = BlockUserDto.class),
                            examples = @ExampleObject(value = """
                                    { 
                                        "id": 1,
                                        "email": "badguy@example.com" 
                                    }
                                    """)
                    )
            )
            @RequestBody BlockUserDto blockUserDto
    ) {
        User findUser = getUserData(user.getUser().getEmail());
        User findBlockUser = getUserData(blockUserDto.email());

        friendsService.blockUser(findUser, findBlockUser);

        return ResponseEntity.ok("유저 차단 완료");
    }

    // 차단 해제
    @Operation(summary = "차단 해제")
    @ApiResponse(responseCode = "200", description = "차단 해제 완료")
    @Transactional
    @PostMapping(value = "/unBlock", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> unBlockUser(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            schema = @Schema(implementation = UnBlockUserDto.class),
                            examples = @ExampleObject(value = """
                                    { 
                                        "id": 1,
                                        "email": "badguy@example.com" 
                                    }
                                    """)
                    )
            )
            @RequestBody UnBlockUserDto unBlockUserDto
    ) {
        User findUser = getUserData(user.getUser().getEmail());
        User findUnBlockUser = getUserData(unBlockUserDto.email());

        friendsService.unBlockUser(findUser, findUnBlockUser);

        return ResponseEntity.ok("유저 차단 해제 완료");
    }

    // 친구 검색
    @Operation(summary = "친구 검색")
    @ApiResponse(responseCode = "200",
            description = "검색된 유저 리스트",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array = @ArraySchema(schema = @Schema(implementation = User.class))))
    @Transactional
    @PostMapping(value = "/select", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<User>> selectFriend(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(schema = @Schema(implementation = SelectFriendDto.class))
            )
            @RequestBody SelectFriendDto selectFriendDto
    ){
        User findUser = getUserData(user.getUser().getEmail());

        List<User> selectUser = friendsService.selectFriend(selectFriendDto);

        return ResponseEntity.ok(selectUser);
    }

    // 친구 신청
    @Operation(summary = "친구 신청 보내기")
    @ApiResponse(responseCode = "200", description = "신청 완료")
    @PostMapping(value = "/request", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> requestFriends(
            @AuthenticationPrincipal CustomUserPrincipal requesterPrincipal,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(schema = @Schema(implementation = RequestFriendsDto.class))
            )
            @RequestBody RequestFriendsDto receiverDto
    ) {

        friendsService.sendFriendsRequest(requesterPrincipal, receiverDto);

        return ResponseEntity.ok("친구 신청 완료");
    }

    // 친구 신청 응답
    @Operation(summary = "친구 신청 응답(수락/거절)")
    @ApiResponse(responseCode = "200", description = "응답 완료")
    @PostMapping(value = "/respond", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> respondFriends(
            @AuthenticationPrincipal CustomUserPrincipal receiver,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(schema = @Schema(implementation = RespondFriendRequestDto.class))
            )
            @RequestBody RespondFriendRequestDto friendReqDto
    ) {

        friendsService.respondToFriendRequest(receiver, friendReqDto);

        return ResponseEntity.ok("친구 요청 응답 완료");
    }
}
