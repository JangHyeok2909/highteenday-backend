package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class UserService {
    private final UserRepository userRepository;
    public User findById(Long userId){
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("user does not exists, userId=" + userId));
    }

}
