package com.example.highteenday_backend.domain.boards;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.dtos.BoardDto;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "boards")
@Entity
public class Board extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "BRD_id")
    private Long id;

    @Column(name = "BRD_name", length = 30, nullable = false)
    private String name;

    @Column(name = "BRD_description", columnDefinition = "TEXT")
    private String description;

    public BoardDto toDto(){
        return BoardDto.builder().boardId(this.id).boardName(this.name).build();
    }
}
