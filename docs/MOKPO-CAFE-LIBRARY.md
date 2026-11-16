# 목포노회 원문 링크·첨부 보존형 자료실

운영 경로: `/mokpo-presbytery/library/`. 선교부 `/mokpo-presbytery/mission/#resources` 및 노회 본문 `#library`에서 연결합니다.

## 사실 및 소스

- 노회 공식 자료 출처: https://cafe.daum.net/pckmp (대한예수교장로회 총회 노회 소개에서 공식 URL로 안내).
- 2026-11-16 확인: 외부 비로그인 웹 접근으로는 카페 게시글/자료실 원문·첨부파일 개별 URL을 열 수 없었습니다.
- 최초 `catalog.json`의 2건은 **기존 EKODI 시범 홈페이지에 이미 표시된 제목과 개요**만 수록하였고, 상태는 `metadata_only`입니다. 원문·첨부 사본은 포함하지 않습니다.

## 자료 등록 / 갱신

자료 소유자·노회 운영자에게 공식 카페의 개별 게시글 URL, 원문 내용, 원첨부파일, 공개/복제 허용 여부, 게시/개정일을 확인합니다. 로그인 제한, 이용약관, 개인정보 보호와 저작권을 우회하지 마세요. 공개 승인을 확인한 항목만 `sites/mokpo-presbytery/library/catalog.json`에 추가합니다.

기본 형식:
```json
{
  "id": "stable-id",
  "title": "게시글 제목",
  "scope": "선교부",
  "category": "신청",
  "audiences": ["선교부", "노회"],
  "purposes": ["신청", "보고"],
  "issued_on": "2026-11-16",
  "summary": "허가된 소개문",
  "content": "승인된 원문 전문(텍스트; HTML 실행 안 함)",
  "source": {
    "publisher": "목포노회",
    "kind": "공식 카페 게시글",
    "listed_url": null,
    "cafe_url": "https://cafe.daum.net/pckmp",
    "post_url": "검증된 게시글 개별 URL",
    "verified_at": "2026-11-16"
  },
  "attachments": [
    {
      "name": "원본파일.hwp",
      "original_url": "검증된 원첨부 URL",
      "mirror_url": "/mokpo-presbytery/library/files/승인된파일.hwp"
    }
  ],
  "state": "approved_mirror"
}
```

`approved_mirror`는 **재게시 권한, 실제 원문, 원첨부 파일이 확보되어 공개 검증된 경우만** 사용합니다. 원첨부 URL이 로그인 전용이면 이를 표시하되 다운로드는 카페 로그인에 따릅니다. 별도로 복사한 파일은 원본 형식/바이트를 변경하지 말고 검증된 해시와 공개 허용 근거를 기록한 뒤 `files/`에 둡니다. 이미 있는 한글/PDF/문서 파일을 임의로 재작성하지 않습니다.

공개 목록에는 이름·휴대전화·생년월일·개별 회원명부·내부 회계증빙·비공개 회의록을 포함하지 않습니다. 비공개 문서는 기존 권한별 선교부 업무공간에서만 별도 관리합니다. 복제본은 현행 공문·신청기한의 효력을 보장하지 않으므로 최종 제출 전에 카페/총회 최신 원문을 확인합니다.

변경은 별도 작업 브랜치·보호 PR·검증·공식 승인·보호 배포를 거칩니다. `scripts/build-mokpo-presbytery-pages.py`가 노회 홈페이지와 자료실 HTML을 생성하므로 생성 소스와 결과물을 함께 관리합니다.
