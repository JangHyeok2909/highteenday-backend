package com.example.highteenday_backend.dtos;


import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@AllArgsConstructor
@NoArgsConstructor
@Data
@Builder
public class RequestTimetableTemplateDto {
    private String templateName;
    private Grade grade;
    private Semester semester;
    @Builder.Default
    private boolean isDefault=false;

    /**
     * 이름이 없으면 학년·학기로 기본 이름을 만든다. 수정 요청은 바꿀 필드만 보내므로
     * 재료(grade·semester)가 없을 수 있고, 그때는 null 을 돌려 "이름 변경 없음"이 된다.
     */
    public String getTemplateName() {
        if (templateName != null && !templateName.isEmpty()) return templateName;
        if (grade == null || semester == null) return null;
        return grade.getField() + " " + semester;
    }

}
