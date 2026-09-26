# Domain Constitution
1. EKODI가 소유하는 공개·사용자·관리자·인증·API·코어·공통서비스 주소는 모두 단일 호스트 `ekodi.kr` 아래의 경로를 사용한다.
2. EKODI 소유 child-host 주소는 생성·유지·리다이렉트·호환 별칭으로 보존하지 않는다.
3. 사용자·기관·사업체·교회·단체·프로젝트의 공개공간은 `ekodi.kr/{slug}`, 관리자 화면은 `ekodi.kr/{slug}/admin`을 사용한다.
4. 공통·전문 서비스는 `ekodi.kr/{service}`, 플랫폼 최고관리자는 `ekodi.kr/admin`, 인증은 `ekodi.kr/auth`, API는 `ekodi.kr/api`를 사용한다.
5. 내부 실행은 Service Binding 또는 비공개 Worker로 연결하며 내부 실행 경계를 DNS 하위도메인으로 노출하지 않는다.
6. 고객이 소유한 외부 도메인은 명시적 연결 계약에 따라 `ekodi.kr/{slug}` 공개공간에 매핑할 수 있다.
