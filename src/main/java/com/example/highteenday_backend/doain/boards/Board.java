package com.example.highteenday_backend.doain.boards;

import com.example.highteenday_backend.doain.base.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

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
}
