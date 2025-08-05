import com.example.highteenday_backend.Utils.PageUtils;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.paged.PagedPostsDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.services.domain.BoardService;
import com.example.highteenday_backend.services.domain.PostService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "게시판의 게시글 페이징 API", description = "특정 게시판의 게시글 한 페이지에 10개씩 조회가능")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/boards/{boardId}/posts")
public class BoardPostController {
    private final BoardService boardService;
    private final PostService postService;
    static final int PAGE_SIZE = 10;

    @Operation(summary = "게시글 리스트 조회",description = "boardId의 게시판에 해당되는 게시글 리스트 조회")
    @GetMapping()
    public ResponseEntity<PagedPostsDto> getPostsByBoardId(@PathVariable Long boardId,
                                                           @RequestParam Integer page,
                                                           @RequestParam SortType sortType){
        Board board = boardService.findById(boardId);
        if(page == null) page = 0;
        Page<Post> pagedPosts = postService.getPagedPostsByBoardId(boardId, page, PAGE_SIZE,sortType);

        PagedPostsDto pagedPostsDto = PageUtils.postsToDto(pagedPosts);
        pagedPostsDto.setBoardName(board.getName());
        return ResponseEntity.ok(pagedPostsDto);
    }

    // 사각형 (r1, c1) ~ (r2, c2)이 유효한지 검사 (합이 10이고, 네 변을 모두 포함)
    private boolean isValid(int r1, int c1, int r2, int c2) {
        int sums = 0;
        boolean r1fit = false, c1fit = false, r2fit = false, c2fit = false;

        for (int r = r1; r <= r2; r++) {
            for (int c = c1; c <= c2; c++) {
                if (board.get(r).get(c) != 0) {
                    sums += board.get(r).get(c);
                    if (r == r1) r1fit = true;
                    if (r == r2) r2fit = true;
                    if (c == c1) c1fit = true;
                    if (c == c2) c2fit = true;
                }
            }
        }
        return (sums == 10) && r1fit && r2fit && c1fit && c2fit;
    }

    // ================================================================
    // ===================== [필수 구현] ==============================
    // 합이 10인 유효한 사각형을 찾아 (r1, c1, r2, c2) 반환
    // 없으면 null을 반환하여 패스를 의미함
    // ================================================================
    public int[] calculateMove(int myTime, int oppTime) {
        // 가로로 인접한 두 칸을 선택했을 때 유효하면 선택하는 전략
        for (int r1 = 0; r1 < board.size(); r1++) {
            for (int c1 = 0; c1 < board.get(r1).size() - 1; c1++) {
                int r2 = r1;
                int c2 = c1 + 1;

                if (isValid(r1, c1, r2, c2)) {
                    return new int[]{r1, c1, r2, c2};
                }
            }
        }
        return null; // 유효한 사각형이 없으면 패스
    }
    // =================== [필수 구현 끝] =============================

    // 상대방의 수를 받아 보드에 반영
    public void updateOpponentAction(int[] action, int time) {
        updateMove(action, false);
    }

    // 주어진 수를 보드에 반영 (칸을 0으로 지움)
    public void updateMove(int[] action, boolean isMyMove) {
        if (action == null) {
            passed = true;
            return;
        }
        int r1 = action[0], c1 = action[1], r2 = action[2], c2 = action[3];
        for (int r = r1; r <= r2; r++) {
            for (int c = c1; c <= c2; c++) {
                board.get(r).set(c, 0);
            }
        }
        passed = false;
    }
}

// 표준 입력을 통해 명령어를 처리하는 메인 클래스
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Game game = null;
        boolean first = false;

        while (sc.hasNextLine()) {
            String line = sc.nextLine();
            if (line.isEmpty()) continue;

            String[] parts = line.trim().split("\\s+");
            String command = parts[0];

            switch (command) {
                case "READY":
                    // 선공 여부 확인
                    String turn = parts[1];
                    first = turn.equals("FIRST");
                    System.out.println("OK");
                    System.out.flush();
                    break;

                case "INIT":
                    // 보드 초기화
                    List<List<Integer>> board = new ArrayList<>();
                    for (int i = 1; i < parts.length; i++) {
                        String row = parts[i];
                        List<Integer> boardRow = new ArrayList<>();
                        for (char c : row.toCharArray()) {
                            boardRow.add(Character.getNumericValue(c));
                        }
                        board.add(boardRow);
                    }
                    game = new Game(board, first);
                    break;

                case "TIME":
                    // 내 턴: 수 계산 및 실행
                    int myTime = Integer.parseInt(parts[1]);
                    int oppTime = Integer.parseInt(parts[2]);
                    int[] ret = game.calculateMove(myTime, oppTime);
                    game.updateMove(ret, true);
                    if (ret != null) {
                        System.out.printf("%d %d %d %d\n", ret[0], ret[1], ret[2], ret[3]);
                    } else {
                        System.out.println("-1 -1 -1 -1"); // 패스
                    }
                    System.out.flush();
                    break;

                case "OPP":
                    // 상대 턴 반영
                    int r1 = Integer.parseInt(parts[1]);
                    int c1 = Integer.parseInt(parts[2]);
                    int r2 = Integer.parseInt(parts[3]);
                    int c2 = Integer.parseInt(parts[4]);
                    int time = Integer.parseInt(parts[5]);
                    int[] opponentMove;
                    if (r1 == -1 && c1 == -1 && r2 == -1 && c2 == -1) {
                        opponentMove = null;
                    } else {
                        opponentMove = new int[]{r1, c1, r2, c2};
                    }
                    game.updateOpponentAction(opponentMove, time);
                    break;

                case "FINISH":
                    // 게임 종료
                    return;

                default:
                    // 잘못된 명령 처리
                    System.err.println("Invalid command: " + command);
                    System.exit(1);
                    break;
            }
        }
    }
}
