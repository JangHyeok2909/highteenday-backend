package com.example.highteenday_backend.domain.scraps;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
// (USR_id, PST_id) 유니크 제약이 없으면 동시에 들어온 두 토글 요청이 둘 다 "없음"을 보고
// 둘 다 INSERT 해 중복 행이 생긴다. 그러면 isScraped()가 쓰는 findByPostAndUser 가
// NonUniqueResultException 을 던져 게시글 상세 조회까지 영구 장애가 된다.
// 이 엔티티는 하드 삭제하지 않고 is_valid 만 토글하므로 조합당 행이 하나면 충분하다.
@Table(name = "scraps",
        uniqueConstraints = @UniqueConstraint(name = "uk_scraps_usr_pst",
                columnNames = {"USR_id", "PST_id"}))
@Entity
public class Scrap extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SC_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_scraps_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false, foreignKey = @ForeignKey(name = "fk_scraps_pst"))
    private Post post;

    public void activeScrap() {
        this.isValid = true;
    }

    public void cancelScrap() {
        this.isValid = false;
    }
}
