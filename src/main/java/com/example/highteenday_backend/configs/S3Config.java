package com.example.highteenday_backend.configs;

import com.amazonaws.auth.InstanceProfileCredentialsProvider;
import com.amazonaws.auth.profile.ProfileCredentialsProvider;
import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.AmazonS3ClientBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
public class S3Config {

    @Value("${cloud.aws.region.static}")
    private String region;

    // Production: credentials from EC2 Instance Profile (ec2-s3-role)
    @Bean
    @Profile("prod")
    public AmazonS3 amazonS3Prod() {
        return AmazonS3ClientBuilder.standard()
                .withRegion(region)
                .withCredentials(InstanceProfileCredentialsProvider.getInstance())
                .build();
    }

    // Local / Dev: credentials from ~/.aws/credentials (run "aws configure" once)
    @Bean
    @Profile("!prod")
    public AmazonS3 amazonS3Local() {
        return AmazonS3ClientBuilder.standard()
                .withRegion(region)
                .withCredentials(new ProfileCredentialsProvider())
                .build();
    }
}
