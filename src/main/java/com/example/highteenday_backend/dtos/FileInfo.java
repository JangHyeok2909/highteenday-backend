package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;



@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class FileInfo {
    String key;
    String url;
    Long size;
    String originalFilename;
    String contentType;


}
