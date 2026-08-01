package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.friends.FriendReq;
import com.example.highteenday_backend.domain.friends.FriendReqRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.Friends.FriendInfoDto;
import com.example.highteenday_backend.dtos.Friends.RequestFriendDto;
import com.example.highteenday_backend.dtos.Friends.RespondFriendRequestDto;
import com.example.highteenday_backend.dtos.Friends.SelectFriendDto;
import com.example.highteenday_backend.dtos.Friends.UserSearchResultDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.FriendRequestStatus;
import com.example.highteenday_backend.enums.FriendStatus;
import com.example.highteenday_backend.enums.RelationStatus;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.eventEntities.events.FriendBlockedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestDeclinedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FriendServiceTest {

    @Mock private FriendRepository friendRepository;
    @Mock private FriendReqRepository friendReqRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private FriendService friendService;

    private User requester;
    private User receiver;
    private CustomUserPrincipal requesterPrincipal;

    @BeforeEach
    void setUp() {
        requester = User.builder().id(1L).email(new Email("requester@test.com")).name(new UserName("Req")).nickname(new Nickname("req")).role(Role.USER).build();
        receiver = User.builder().id(2L).email(new Email("receiver@test.com")).name(new UserName("Rec")).nickname(new Nickname("rec")).role(Role.USER).build();
        requesterPrincipal = new CustomUserPrincipal(requester);

        when(userService.findByEmail("requester@test.com")).thenReturn(requester);
        when(userService.findByEmail("receiver@test.com")).thenReturn(receiver);
        lenient().when(userService.findById(2L)).thenReturn(receiver);
    }

    @Nested
    @DisplayName("sendFriendsRequest")
    class SendFriendsRequest {

        @Test
        @DisplayName("정상 요청 → FriendReq 저장 + FriendRequestSentEvent 발행")
        void savesRequestAndPublishesEvent() {
            RequestFriendDto dto = new RequestFriendDto(2L);
            when(friendReqRepository.findBetween(1L, 2L)).thenReturn(List.of());
            when(friendReqRepository.save(any(FriendReq.class))).thenAnswer(inv -> inv.getArgument(0));

            friendService.sendFriendsRequest(requesterPrincipal, dto);

            ArgumentCaptor<FriendReq> reqCaptor = ArgumentCaptor.forClass(FriendReq.class);
            verify(friendReqRepository).save(reqCaptor.capture());
            assertThat(reqCaptor.getValue().getRequester()).isSameAs(requester);
            assertThat(reqCaptor.getValue().getReceiver()).isSameAs(receiver);
            assertThat(reqCaptor.getValue().getStatus()).isEqualTo(FriendRequestStatus.REQUESTED);

            ArgumentCaptor<FriendRequestSentEvent> eventCaptor = ArgumentCaptor.forClass(FriendRequestSentEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getRequesterId()).isEqualTo(1L);
            assertThat(eventCaptor.getValue().getReceiverId()).isEqualTo(2L);
        }

        @Test
        @DisplayName("중복 요청 → CustomException(ALREADY_SENT_FRIEND_REQUEST)")
        void throwsOnDuplicate() {
            RequestFriendDto dto = new RequestFriendDto(2L);
            when(friendReqRepository.findBetween(1L, 2L))
                    .thenReturn(List.of(FriendReq.create(requester, receiver)));

            assertThatThrownBy(() -> friendService.sendFriendsRequest(requesterPrincipal, dto))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.ALREADY_SENT_FRIEND_REQUEST));

            verify(friendReqRepository, never()).save(any());
            verify(eventPublisher, never()).publishEvent(any());
        }

        @Test
        @DisplayName("상대가 이미 나에게 요청함 → FRIEND_REQUEST_RECEIVED_ALREADY")
        void throwsWhenReverseRequestPending() {
            RequestFriendDto dto = new RequestFriendDto(2L);
            when(friendReqRepository.findBetween(1L, 2L))
                    .thenReturn(List.of(FriendReq.create(receiver, requester)));

            assertThatThrownBy(() -> friendService.sendFriendsRequest(requesterPrincipal, dto))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.FRIEND_REQUEST_RECEIVED_ALREADY));

            verify(friendReqRepository, never()).save(any());
        }

        @Test
        @DisplayName("이미 친구 → ALREADY_FRIENDS")
        void throwsWhenAlreadyFriends() {
            RequestFriendDto dto = new RequestFriendDto(2L);
            when(friendRepository.existsFriendship(1L, 2L)).thenReturn(true);

            assertThatThrownBy(() -> friendService.sendFriendsRequest(requesterPrincipal, dto))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.ALREADY_FRIENDS));

            verify(friendReqRepository, never()).save(any());
        }

        @Test
        @DisplayName("자기 자신에게 요청 → INVALID_REQUEST")
        void throwsOnSelfRequest() {
            when(userService.findById(1L)).thenReturn(requester);

            assertThatThrownBy(() ->
                    friendService.sendFriendsRequest(requesterPrincipal, new RequestFriendDto(1L)))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_REQUEST));

            verify(friendReqRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("friend info DTO mapping")
    class FriendInfoDtoMapping {

        @Test
        @DisplayName("친구 목록은 userId만 반환한다")
        void mapsFriendUserId() {
            when(friendRepository.findAllFriends(1L)).thenReturn(List.of(receiver));

            List<FriendInfoDto> result = friendService.getFriendsList(1L);

            assertThat(result).singleElement().satisfies(friend -> {
                assertThat(friend.userId()).isEqualTo(2L);
                assertThat(friend.requestId()).isNull();
            });
        }

        @Test
        @DisplayName("보낸 요청 목록은 상대 userId와 requestId를 구분한다")
        void mapsSentRequestIds() {
            FriendReq request = FriendReq.builder()
                    .id(10L)
                    .requester(requester)
                    .receiver(receiver)
                    .status(FriendRequestStatus.REQUESTED)
                    .build();
            when(friendReqRepository.findSentFriendsRequest(1L)).thenReturn(List.of(request));

            List<FriendInfoDto> result = friendService.getSentFriendsRequestList(requester);

            assertThat(result).singleElement().satisfies(friend -> {
                assertThat(friend.userId()).isEqualTo(2L);
                assertThat(friend.requestId()).isEqualTo(10L);
            });
        }

        @Test
        @DisplayName("받은 요청 목록은 요청자 userId와 requestId를 구분한다")
        void mapsReceivedRequestIds() {
            FriendReq request = FriendReq.builder()
                    .id(10L)
                    .requester(requester)
                    .receiver(receiver)
                    .status(FriendRequestStatus.REQUESTED)
                    .build();
            when(friendReqRepository.findReceivedFriendRequestsByReceiverId(2L)).thenReturn(List.of(request));

            List<FriendInfoDto> result = friendService.getReceivedFriendsList(receiver);

            assertThat(result).singleElement().satisfies(friend -> {
                assertThat(friend.userId()).isEqualTo(1L);
                assertThat(friend.requestId()).isEqualTo(10L);
            });
        }
    }

    @Nested
    @DisplayName("cancelSentRequest")
    class CancelSentRequest {

        @Test
        @DisplayName("내가 보낸 요청을 소프트 삭제한다")
        void softDeletesSentRequest() {
            FriendReq request = FriendReq.builder()
                    .id(10L)
                    .requester(requester)
                    .receiver(receiver)
                    .status(FriendRequestStatus.REQUESTED)
                    .build();
            when(friendReqRepository.findBetween(1L, 2L)).thenReturn(List.of(request));

            friendService.cancelSentRequest(requester, 2L);

            assertThat(request.getIsValid()).isFalse();
            verify(friendReqRepository, never()).delete(any());
        }

        @Test
        @DisplayName("상대가 보낸 요청은 취소할 수 없다")
        void doesNotCancelReceivedRequest() {
            FriendReq reverseRequest = FriendReq.builder()
                    .id(10L)
                    .requester(receiver)
                    .receiver(requester)
                    .status(FriendRequestStatus.REQUESTED)
                    .build();
            when(friendReqRepository.findBetween(1L, 2L)).thenReturn(List.of(reverseRequest));

            assertThatThrownBy(() -> friendService.cancelSentRequest(requester, 2L))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.REQUEST_NOT_FOUND));

            assertThat(reverseRequest.getIsValid()).isTrue();
        }
    }

    @Nested
    @DisplayName("respondToFriendRequest")
    class RespondToFriendRequest {

        private FriendReq friendReq;
        private CustomUserPrincipal receiverPrincipal;

        @BeforeEach
        void setUp() {
            friendReq = FriendReq.builder()
                    .id(10L)
                    .requester(requester)
                    .receiver(receiver)
                    .status(FriendRequestStatus.REQUESTED)
                    .build();
            receiverPrincipal = new CustomUserPrincipal(receiver);
            when(friendReqRepository.findActiveById(10L)).thenReturn(Optional.of(friendReq));
        }

        @Test
        @DisplayName("수락 → Friend 2건 저장 + 이벤트 발행 + FriendReq 소프트 삭제")
        void acceptCreatesBidirectionalFriendship() {
            RespondFriendRequestDto dto = new RespondFriendRequestDto(10L, "ACCEPTED");

            friendService.respondToFriendRequest(receiverPrincipal, dto);

            ArgumentCaptor<Friend> friendCaptor = ArgumentCaptor.forClass(Friend.class);
            verify(friendRepository, times(2)).save(friendCaptor.capture());

            List<Friend> saved = friendCaptor.getAllValues();
            // requester → receiver
            assertThat(saved.get(0).getUser()).isSameAs(requester);
            assertThat(saved.get(0).getFriend()).isSameAs(receiver);
            assertThat(saved.get(0).getStatus()).isEqualTo(FriendStatus.FRIEND);
            // receiver → requester
            assertThat(saved.get(1).getUser()).isSameAs(receiver);
            assertThat(saved.get(1).getFriend()).isSameAs(requester);
            assertThat(saved.get(1).getStatus()).isEqualTo(FriendStatus.FRIEND);

            ArgumentCaptor<FriendRequestAcceptedEvent> eventCaptor = ArgumentCaptor.forClass(FriendRequestAcceptedEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getRequesterId()).isEqualTo(1L);
            assertThat(eventCaptor.getValue().getReceiverId()).isEqualTo(2L);

            assertThat(friendReq.getIsValid()).isFalse();
            verify(friendReqRepository, never()).delete(friendReq);
        }

        @Test
        @DisplayName("차단 → Friend 1건 저장(receiver→requester BLOCKED) + FriendBlockedEvent 발행")
        void blockCreatesBlockedRelation() {
            RespondFriendRequestDto dto = new RespondFriendRequestDto(10L, "BLOCKED");

            friendService.respondToFriendRequest(receiverPrincipal, dto);

            ArgumentCaptor<Friend> friendCaptor = ArgumentCaptor.forClass(Friend.class);
            verify(friendRepository, times(1)).save(friendCaptor.capture());
            assertThat(friendCaptor.getValue().getUser()).isSameAs(receiver);
            assertThat(friendCaptor.getValue().getFriend()).isSameAs(requester);
            assertThat(friendCaptor.getValue().getStatus()).isEqualTo(FriendStatus.BLOCKED);

            ArgumentCaptor<FriendBlockedEvent> eventCaptor = ArgumentCaptor.forClass(FriendBlockedEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getBlockerId()).isEqualTo(2L);
            assertThat(eventCaptor.getValue().getBlockedUserId()).isEqualTo(1L);

            assertThat(friendReq.getIsValid()).isFalse();
            verify(friendReqRepository, never()).delete(friendReq);
        }

        @Test
        @DisplayName("거절 → Friend 저장 없음 + 이벤트 발행 + FriendReq 소프트 삭제")
        void declinePublishesEventWithoutFriendSave() {
            RespondFriendRequestDto dto = new RespondFriendRequestDto(10L, "DECLINED");

            friendService.respondToFriendRequest(receiverPrincipal, dto);

            verify(friendRepository, never()).save(any());

            ArgumentCaptor<FriendRequestDeclinedEvent> eventCaptor = ArgumentCaptor.forClass(FriendRequestDeclinedEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getRequesterId()).isEqualTo(1L);
            assertThat(eventCaptor.getValue().getReceiverId()).isEqualTo(2L);

            assertThat(friendReq.getIsValid()).isFalse();
            verify(friendReqRepository, never()).delete(friendReq);
        }

        @Test
        @DisplayName("존재하지 않는 요청 ID → CustomException(REQUEST_NOT_FOUND)")
        void throwsWhenRequestNotFound() {
            when(friendReqRepository.findActiveById(999L)).thenReturn(Optional.empty());
            RespondFriendRequestDto dto = new RespondFriendRequestDto(999L, "ACCEPTED");

            assertThatThrownBy(() -> friendService.respondToFriendRequest(receiverPrincipal, dto))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.REQUEST_NOT_FOUND));
        }

        @Test
        @DisplayName("요청 수신자가 아닌 사용자는 친구 요청에 응답할 수 없다")
        void rejectsResponseFromNonReceiver() {
            User attacker = User.builder()
                    .id(3L)
                    .email(new Email("attacker@test.com"))
                    .name(new UserName("Atk"))
                    .nickname(new Nickname("atk"))
                    .role(Role.USER)
                    .build();
            CustomUserPrincipal attackerPrincipal = new CustomUserPrincipal(attacker);
            RespondFriendRequestDto dto = new RespondFriendRequestDto(10L, "ACCEPTED");

            assertThatThrownBy(() -> friendService.respondToFriendRequest(attackerPrincipal, dto))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.NO_ACCESS));

            verify(friendRepository, never()).save(any());
            assertThat(friendReq.getIsValid()).isTrue();
            verify(friendReqRepository, never()).delete(any());
            verify(eventPublisher, never()).publishEvent(any());
        }
    }

    @Nested
    @DisplayName("deleteFriends")
    class DeleteFriends {

        @Test
        @DisplayName("정상 삭제 → deleteAll 호출")
        void deletesAllRelations() {
            Friend f1 = Friend.builder().id(1L).user(requester).friend(receiver).status(FriendStatus.FRIEND).build();
            Friend f2 = Friend.builder().id(2L).user(receiver).friend(requester).status(FriendStatus.FRIEND).build();
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(List.of(f1, f2));

            friendService.deleteFriends(requester, receiver);

            verify(friendRepository).deleteAll(List.of(f1, f2));
        }

        @Test
        @DisplayName("관계 없음 → CustomException(FRIEND_NOT_FOUND)")
        void throwsWhenNoRelation() {
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(Collections.emptyList());

            assertThatThrownBy(() -> friendService.deleteFriends(requester, receiver))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.FRIEND_NOT_FOUND));
        }
    }

    @Nested
    @DisplayName("blockUser")
    class BlockUser {

        @Test
        @DisplayName("기존 관계 없음 → 새 Friend(BLOCKED) 저장")
        void createsNewBlockedRelation() {
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(Collections.emptyList());

            friendService.blockUser(requester, receiver);

            ArgumentCaptor<Friend> captor = ArgumentCaptor.forClass(Friend.class);
            verify(friendRepository).save(captor.capture());
            assertThat(captor.getValue().getUser()).isSameAs(requester);
            assertThat(captor.getValue().getFriend()).isSameAs(receiver);
            assertThat(captor.getValue().getStatus()).isEqualTo(FriendStatus.BLOCKED);
        }

        @Test
        @DisplayName("기존 관계 있음 → 내 관계만 BLOCKED로 상태 변경")
        void updatesExistingRelationToBlocked() {
            Friend myRelation = Friend.builder().id(1L).user(requester).friend(receiver).status(FriendStatus.FRIEND).build();
            Friend theirRelation = Friend.builder().id(2L).user(receiver).friend(requester).status(FriendStatus.FRIEND).build();
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(List.of(myRelation, theirRelation));

            friendService.blockUser(requester, receiver);

            assertThat(myRelation.getStatus()).isEqualTo(FriendStatus.BLOCKED);
            assertThat(theirRelation.getStatus()).isEqualTo(FriendStatus.FRIEND);
            verify(friendRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("unBlockUser")
    class UnBlockUser {

        @Test
        @DisplayName("관계 없음 → CustomException(FRIEND_NOT_FOUND)")
        void throwsWhenNoRelation() {
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(Collections.emptyList());

            assertThatThrownBy(() -> friendService.unBlockUser(requester, receiver))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.FRIEND_NOT_FOUND));
        }

        @Test
        @DisplayName("단방향 차단(reverseRelation 없음) → 내 관계 삭제")
        void deletesOneWayBlock() {
            Friend myBlock = Friend.builder().id(1L).user(requester).friend(receiver).status(FriendStatus.BLOCKED).build();
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(List.of(myBlock));

            friendService.unBlockUser(requester, receiver);

            verify(friendRepository).delete(myBlock);
        }

        @Test
        @DisplayName("양방향 관계(reverseRelation 있음) → 내 관계 FRIEND로 복원")
        void restoresFriendStatus() {
            Friend myBlock = Friend.builder().id(1L).user(requester).friend(receiver).status(FriendStatus.BLOCKED).build();
            Friend theirRelation = Friend.builder().id(2L).user(receiver).friend(requester).status(FriendStatus.FRIEND).build();
            when(friendRepository.findFriendsRelations(1L, 2L)).thenReturn(List.of(myBlock, theirRelation));

            friendService.unBlockUser(requester, receiver);

            assertThat(myBlock.getStatus()).isEqualTo(FriendStatus.FRIEND);
            verify(friendRepository, never()).delete(any());
        }
    }

    @Nested
    @DisplayName("searchUsersByNickname")
    class SearchUsersByNickname {

        @Test
        @DisplayName("nickname 검색 — 결과 있음, 실명·이메일은 담기지 않는다")
        void searchByNickname() {
            when(userRepository.findByNickname("rec")).thenReturn(Optional.of(receiver));

            List<UserSearchResultDto> result =
                    friendService.searchUsersByNickname(requester, new SelectFriendDto("rec"));

            assertThat(result).hasSize(1);
            assertThat(result.get(0).userId()).isEqualTo(2L);
            assertThat(result.get(0).nickname()).isEqualTo("rec");
            assertThat(result.get(0).relation()).isEqualTo(RelationStatus.NONE);
        }

        @Test
        @DisplayName("nickname 검색 — 결과 없음")
        void searchByNicknameNotFound() {
            when(userRepository.findByNickname("nobody")).thenReturn(Optional.empty());

            List<UserSearchResultDto> result =
                    friendService.searchUsersByNickname(requester, new SelectFriendDto("nobody"));

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("nickname null → 빈 리스트 반환")
        void searchWithNullNickname() {
            List<UserSearchResultDto> result =
                    friendService.searchUsersByNickname(requester, new SelectFriendDto(null));

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("나를 차단한 사용자는 검색 결과에서 빠진다")
        void excludesUsersWhoBlockedMe() {
            when(userRepository.findByNickname("rec")).thenReturn(Optional.of(receiver));
            when(friendRepository.findFriendsRelations(1L, 2L))
                    .thenReturn(List.of(Friend.createBlock(receiver, requester)));

            List<UserSearchResultDto> result =
                    friendService.searchUsersByNickname(requester, new SelectFriendDto("rec"));

            assertThat(result).isEmpty();
        }
    }
}
