# Reference

이 디렉터리는 실행 결과가 아니라 측정이 성립하기 위한 계약을 설명한다.

- [measurement-contract.md](measurement-contract.md): 원자료, 비교 가능성, 결론의 강도
- [environment](../environment/): Docker 측정 환경
- [datasets](../datasets/): 데이터 생성과 상태 고정
- [scenarios](../scenarios/): 워크로드 종류
- [metrics](../metrics/): 수집 지표
- [tools](../tools/): 실행·수집 도구
- [regression](../regression/): 자동 비교 규칙
- [resilience](../resilience/): 장애 주입 실행기

도구 동작을 설명하는 세부 사항은 해당 코드와 테스트가 정본이다. 문서는 사용자가 알아야 할
계약만 설명하고 내부 구현 전체를 복제하지 않는다.

