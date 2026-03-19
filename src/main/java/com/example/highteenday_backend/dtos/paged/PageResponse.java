package com.example.highteenday_backend.dtos.paged;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;


@AllArgsConstructor
@Data
public class PageResponse<T> {
    List<T> content;
    int page;
    int size;
    long total;
}