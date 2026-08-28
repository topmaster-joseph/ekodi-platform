# EKODI Experience Model

Updated: 2026-08-28

EKODI의 사용자 경험은 **역할(Role)** 과 **공간(Surface)** 을 같은 축으로 섞지 않는다. 한 사람은 상황에 따라 회원이면서 특정 운영공간의 운영자일 수 있고, 별도의 플랫폼 관리자 권한을 가질 수도 있다. 반대로 공개영역, My EKODI, 운영공간, 공통서비스는 사람이 들어가 사용하는 화면·서비스 영역이다.

## 1. 표준 용어

| 사용자 표현 | 시스템 의미 | 범위 |
| --- | --- | --- |
| 관리자 | `platform_admin` 역할 | EKODI 전체 플랫폼 |
| 운영자 | `operator` 역할 | 권한이 부여된 Workspace |
| 로그인 전 일반사용자 | `guest` 역할 + `public` Surface | 공개 안내 |
| 로그인 후 마이 에코디 | `member` 역할 + `my` Surface | 개인 중심 |
| 운영공간 | `workspace` Surface | 조직·사업·교회·기관·단체·프로젝트 중심 |
| 공통서비스 | `shared_service` Surface | 여러 사용자·Workspace가 공통 이용 |

## 2. 역할 모델

`guest → member → operator`

`platform_admin`은 위 흐름의 단순 상위 단계로 취급하지 않는다. 플랫폼 관리자 권한은 tenant 활동 역할과 분리한다.

- `guest`: 로그인 전 방문자. 공개 안내와 서비스 소개만 이용한다.
- `member`: Google 로그인 후 무료등급 이상으로 My EKODI와 허용된 공통서비스를 이용한다.
- `operator`: 특정 Workspace에 권한을 부여받아 그 공간의 회원, 콘텐츠, 업무, 서비스를 운영한다.
- `platform_admin`: `admin.ekodi.kr`에서 EKODI 전체 회원, 서비스, 권한, 도메인, 배포, 보안, AI 운영을 관리한다.

## 3. 공간 모델

- `public`: `ekodi.kr` 및 각 서비스의 비로그인 공개 안내 영역.
- `my`: `my.ekodi.kr`. 나 중심의 개인 홈으로 내 정보, 내 서비스, 내 활동과 Workspace 전환을 제공한다.
- `workspace`: 개인·사업자·교회·기관·단체·프로젝트별로 분리되는 운영공간. 데이터와 권한은 Workspace 경계를 넘지 않는다.
- `shared_service`: 여러 사용자와 Workspace가 공통으로 이용하는 전문 플랫폼. 비로그인 상태에서는 안내만 제공하고 실제 기능은 Google 로그인한 무료회원 이상에게 제공한다.
- `admin`: `admin.ekodi.kr`. `platform_admin`만 접근하는 비공개 제어영역.

## 4. 기본 동선

```text
로그인 전 일반사용자
        │
        ▼
      Public
        │ Google 로그인
        ▼
    My EKODI
      ├─ 개인 서비스
      ├─ 공통서비스
      └─ 내가 속한 운영공간
              │
              ▼
           운영자
      (해당 Workspace 범위)

플랫폼 관리자
      │
      ▼
 admin.ekodi.kr
 (tenant 활동권한과 분리)
```

## 5. 강제 원칙

1. 역할과 공간을 같은 enum이나 메뉴 분류로 취급하지 않는다.
2. 운영자 권한은 항상 Workspace 범위로 제한한다.
3. 플랫폼 관리자 권한은 고객·기관의 활동 역할과 분리한다.
4. My EKODI는 사람 중심, 운영공간은 Space 중심으로 유지한다.
5. 공통서비스는 비로그인 사용자에게 소개·안내만 제공하고 실제 기능은 로그인한 무료회원 이상에게 제공한다.
6. 서비스 간 이동 시 `Person + Space + Role + Capability` 컨텍스트를 유지하되, 다른 Workspace의 비공개 데이터에 직접 접근하지 않는다.
7. 로그인 후에는 원래 요청한 서비스 또는 Workspace로 안전하게 복귀한다.

## 6. 배포 계약

My EKODI는 `my/experience-model.json`을 읽기 가능한 정적 계약으로 함께 배포한다. 이 파일은 운영 UI와 신규 서비스 설계에서 표준 용어 및 권한 경계를 확인하기 위한 기준점이다. 변경 시 My EKODI의 검증·스테이징·운영 배포 경로를 거쳐 실제 `my.ekodi.kr/experience-model.json`에서 확인한다.
