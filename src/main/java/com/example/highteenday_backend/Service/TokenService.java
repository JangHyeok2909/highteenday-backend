package com.example.highteenday_backend.Service;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class TokenService {

    @Autowired
    private TokenRepository tokenRepository;
    @Autowired
    private UserRepository userRepository;

    public void deleteRefreshToken(String userKey){
        tokenRepository.deleteById(userKey);
    }

    @Transactional
    public void saveOrUpdate(String userKey, String refreshToken, String accessToken){
        User user = userRepository.findByEmail(userKey)
                .orElseThrow(() -> new RuntimeException("사용자 없음 - TokenService.java"));

        Optional<Token> optToken = tokenRepository.findByUser(user);

        Token token = optToken
                .map(t -> {
                    t.updateAccessToken(accessToken);
                    t.updateRefreshToken(refreshToken);
                    return t;
                })
                .orElseGet(() -> new Token(user, refreshToken, accessToken));

        tokenRepository.save(token);
    }

    public Token findByAccessTokenOrThrow(String accessToken){
        return tokenRepository.findByAccessToken(accessToken)
                .orElseThrow(() -> new RuntimeException("토큰이 유효하지 않습니다."));
    }

    @Transactional
    public void updateToken(String accessToken, Token token){
        token.updateAccessToken(accessToken);
        tokenRepository.save(token);
    }
}
