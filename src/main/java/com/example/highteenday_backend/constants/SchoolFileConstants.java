package com.example.highteenday_backend.constants;

import java.nio.file.Paths;

public class SchoolFileConstants {

    public static String getSchoolJsonPath() {
        // 현재 실행 디렉토리를 기준으로 절대 경로 생성
        return Paths.get(System.getProperty("user.dir"), "schoolData", "schoolInfo", "schools.json")
                .toAbsolutePath()
                .toString();
    }
}
