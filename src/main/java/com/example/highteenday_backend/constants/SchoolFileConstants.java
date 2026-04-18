package com.example.highteenday_backend.constants;

public class SchoolFileConstants {
    public static final String SCHOOL_JSON_PATH = "./schoolData/schoolInfo/schools.json";
    public static final String MEAL_JSON_DIR = "./schoolData/meals";

    public static String getMealJsonPath(int year, int month) {
        return String.format("%s/meals-%04d-%02d.json", MEAL_JSON_DIR, year, month);
    }
}
