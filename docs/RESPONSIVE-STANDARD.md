# EKODI Responsive Web Standard

## 기본 원칙
모든 EKODI 웹페이지는 데스크톱과 모바일에서 같은 콘텐츠 구조를 유지하며, 자연어 문장은 단어 중간에서 임의로 잘리지 않도록 한다.

### 타이포그래피
- 한글과 일반 문장: `word-break: keep-all`
- 일반 문장 오버플로 보호: `overflow-wrap: break-word`
- URL, 이메일, 도메인, 인라인 코드: 필요한 경우에만 `overflow-wrap: anywhere`
- 제목: `text-wrap: balance`
- 본문: `text-wrap: pretty`
- 버튼과 메뉴 라벨도 단어 중간 분리를 금지한다.

### 레이아웃
- grid/flex 자식은 `min-width: 0`을 기본으로 하여 좁은 화면에서 컨테이너를 밀어내지 않게 한다.
- 이미지, SVG, 비디오, iframe은 뷰포트를 넘지 않는다.
- 모바일에서 입력 요소와 버튼은 부모 폭을 초과하지 않는다.
- 긴 코드 블록은 문자를 억지로 쪼개지 않고 가로 스크롤을 허용한다.

## 적용 정책
`ekodi-platform`의 프로덕션 빌드는 `responsive.css`를 모든 플랫폼 HTML에 자동 삽입한다. 독립 배포 서비스는 같은 표준 파일을 자체 배포물에 포함한다.

새 서비스와 새 페이지는 이 규칙을 기본 계약으로 사용한다. 특정 UI에서 줄바꿈을 금지해야 할 때는 `.ekodi-nowrap`, 긴 식별자나 URL을 강제로 안전하게 감쌀 때는 `.ekodi-break-anywhere`를 사용한다.

## 회귀 방지
반응형 규칙을 제거하거나 `word-break: break-all`을 전역 적용하지 않는다. 모바일 UI 변경 시 320px, 390px, 768px, 데스크톱 폭에서 텍스트 잘림과 수평 오버플로를 함께 확인한다.
