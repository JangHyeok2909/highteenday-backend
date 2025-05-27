package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;



@Data
@AllArgsConstructor
@Builder
public class FileInfo {
    String key;
    String url;
    Long size;
    String originalFilename;
    String contentType;


}
