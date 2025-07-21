package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.enums.Provider;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class DataInitializer {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @EventListener(ApplicationReadyEvent.class)
    public void userDataInit() {
        int dataCount = 5;

        List<User> users = new ArrayList<>();

        for(int i=1;i<=dataCount;i++){
            String email = "test"+i+"@gmail.com";
            if (userRepository.findByEmail(email).isEmpty()) {
                User user = new User();
                user.setEmail(email);
                user.setName("tester" + i);
                user.setNickname("TestUser" + i);
                user.setProvider(Provider.DEFAULT);
                user.setHashedPassword(passwordEncoder.encode("asd"));
                userRepository.save(user);
                System.out.println("초기 테스트 유저 설정, user email: " + email);
            }
        }
    }
}

