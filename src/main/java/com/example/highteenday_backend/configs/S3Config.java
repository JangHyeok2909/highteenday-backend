package com.example.highteenday_backend.configs;

import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.AmazonS3ClientBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class S3Config {

    @Value("${cloud.aws.region.static}")
    private String region;

    @Bean
    public AmazonS3 amazonS3() {
        // Credentials are resolved automatically via DefaultAWSCredentialsProviderChain:
        //   - Local : ~/.aws/credentials  (run "aws configure" once)
        //   - EC2   : Instance Profile    (ec2-s3-role attached to the instance)
        return AmazonS3ClientBuilder.standard()
                .withRegion(region)
                .build();
    }
}
