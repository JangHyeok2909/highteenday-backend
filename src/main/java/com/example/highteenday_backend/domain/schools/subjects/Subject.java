package com.example.highteenday_backend.domain.schools;

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
@Table(name= "subjects")
@Entity
public class Subject {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SBJ_id", nullable = false)
    private Long id;
    @ManyToOne
    @JoinColumn(name = "USR_id")
    private User user;
    @Column(name = "SBJ_name", nullable = false)
    private String name;

}
