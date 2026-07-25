package com.example.highteenday_backend.Utils;

/**
 * 로그에 남길 식별자를 마스킹한다.
 *
 * <p>운영 로그 레벨이 INFO이고 로그는 장기 보관되므로, 원문 이메일이나 닉네임을 그대로 남기면
 * 미성년자 개인정보가 애플리케이션 로그에 축적된다. 장애 추적에 필요한 최소한의 상관관계만
 * 남기고 나머지는 가린다.
 *
 * <p>사용자 식별이 필요한 경우 가능한 한 마스킹된 값 대신 {@code userId}를 남길 것.
 */
public final class LogMasker {

    private static final String REDACTED = "***";

    private LogMasker() {
    }

    /**
     * 이메일의 로컬 파트 앞 2글자만 남긴다. {@code hong@gmail.com} → {@code ho***@gmail.com}
     *
     * <p>같은 사용자의 로그를 이어 볼 수 있을 정도의 상관관계는 유지하되,
     * 로그만으로 계정을 특정하지 못하게 한다.
     */
    public static String maskEmail(String email) {
        if (email == null || email.isBlank()) return REDACTED;

        int at = email.indexOf('@');
        if (at <= 0) return REDACTED;

        String local = email.substring(0, at);
        String domain = email.substring(at);
        String visible = local.length() <= 2 ? local.substring(0, 1) : local.substring(0, 2);
        return visible + REDACTED + domain;
    }

    /** 닉네임의 첫 글자만 남긴다. {@code 김하이틴} → {@code 김***} */
    public static String maskNickname(String nickname) {
        if (nickname == null || nickname.isBlank()) return REDACTED;
        return nickname.charAt(0) + REDACTED;
    }
}
