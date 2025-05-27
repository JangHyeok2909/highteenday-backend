package com.example.highteenday_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

//@EnableJpaAuditing을 설정하면 Spring이 자동으로
//엔티티가 저장될 때 @CreatedDate가 붙은 필드에 현재 시간이 자동으로 채워짐
//엔티티가 수정될 때 @LastModifiedDate가 붙은 필드가 자동 갱신됨
//따라서 service/domain/PostService 부분 post.setCreated(LocalDateTime.now()); 주석
//domain/BaseEntity 부분
// public void setCreated(LocalDateTime localDateTime){
//        this.created = localDateTime;
//    } 주석
@EnableJpaAuditing
@SpringBootApplication
@EnableJpaAuditing
public class HighteendayBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(HighteendayBackendApplication.class, args);
	}

}
