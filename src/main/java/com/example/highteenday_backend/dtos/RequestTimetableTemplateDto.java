package com.example.highteenday_backend.dtos;


import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@AllArgsConstructor
@Data
@Builder
public class RequestTimetableTemplateDto {
    private String templateName;
    private Grade grade;
    private Semester semester;

    public String getTemplateName() {
        if(templateName ==null || templateName.isEmpty()) return grade.getField()+" "+semester;
        else return templateName;
    }
}
