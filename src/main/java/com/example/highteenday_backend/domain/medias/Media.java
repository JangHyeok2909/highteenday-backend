package com.example.highteenday_backend.domain.medias;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.MediaCategory;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "medias")
@Entity
public class Media {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "MDA_id")
    private Long id;

    @Column(name = "MDA_origin_name" ,nullable = false)
    private String originName;

    @Column(name = "MDA_s3_key" ,nullable = false)
    private String s3Key;

    @Column(name = "MDA_url", length = 1000, nullable = false)
    private String url;

    @Column(name = "MDA_size",nullable = false)
    private Long size;

    @Column(name = "MDA_content_type",length = 100,nullable = false)
    private String contentType;

    @Column(name ="MDA_CAT")
    private MediaCategory mediaCategory;

    //null이 아닐 경우 게시글 이미지
    @ManyToOne(fetch = FetchType.LAZY ,optional = true)
    @JoinColumn(name = "PST_id")
    private Post post;

    //null이 아닐 경우 유저 프로필 이미지
    @ManyToOne(fetch = FetchType.LAZY ,optional = true)
    @JoinColumn(name = "USR_profile_owner_id_")
    private User profileOwner;

    //null이 아닐 경우 댓글 이미지
    @ManyToOne(fetch = FetchType.LAZY ,optional = true)
    @JoinColumn(name = "CMT_id")
    private Comment comment;

    public void setPost(Post post){
        this.post = post;
    }
}
