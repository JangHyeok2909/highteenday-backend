package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UploadedResult {
    private String url;
    private String fileName;
}
