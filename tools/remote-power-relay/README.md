# EKODI Remote Power Relay

관리자페이지가 오프라인 작업 PC에 Wake-on-LAN 매직패킷을 전달하기 위한 최소 권한 LAN 릴레이입니다.

## 구조

`admin.ekodi.kr → api.ekodi.kr → 인증된 HTTPS/Tunnel → LAN relay → Wake-on-LAN → Remote Desktop Commander 자동 시작`

브라우저와 Cloudflare Worker에는 실제 MAC 주소를 저장하지 않습니다. MAC 주소와 브로드캐스트 주소는 LAN 릴레이에만 둡니다.

## 릴레이 실행

1. 항상 켜져 있고 대상 PC와 같은 LAN에 있는 NAS, 미니PC, 라즈베리파이 등에 Node.js 20+를 준비합니다.
2. `.env.example`을 참고해 환경변수를 등록합니다. 실제 비밀키와 MAC 주소는 Git에 커밋하지 않습니다.
3. `node relay.mjs`로 실행하고 서비스 관리자(systemd, Windows Service 등)에서 자동 시작하도록 등록합니다.
4. 릴레이의 8789 포트를 인터넷에 직접 노출하지 않습니다. Cloudflare Tunnel, Tailscale 또는 동등한 사설 터널을 사용합니다.
5. `REMOTE_POWER_RELAY_URL`과 동일한 `REMOTE_POWER_SHARED_SECRET`을 `api.ekodi.kr` Worker secret에 등록합니다.

## 대상 PC 1회 설정

- BIOS/UEFI에서 Wake-on-LAN 활성화
- 유선 NIC의 `Wake on Magic Packet` 활성화
- Windows 빠른 시작이 WOL을 방해하는 기기에서는 비활성화 검토
- Remote Desktop Commander 에이전트를 로그인/부팅 후 자동 시작으로 구성
- 노트북은 제조사에 따라 완전 종료 상태 WOL이 제한될 수 있으므로 절전/최대 절전 정책을 우선 검증

## 보안

- API Worker가 요청 본문을 HMAC-SHA256으로 서명합니다.
- 릴레이는 60초 이상 오래된 요청을 거부합니다.
- 같은 장치에 대한 Wake 요청은 15초 쿨다운이 적용됩니다.
- 관리자 API에는 장치의 논리 ID와 표시명만 노출합니다.
- 임의 명령 실행 기능은 제공하지 않습니다. 릴레이가 수행하는 작업은 Wake-on-LAN 전송뿐입니다.

## 검증

`GET /health`는 릴레이 프로세스 상태와 등록 장치 수만 반환합니다. 실제 MAC 주소와 네트워크 정보는 반환하지 않습니다.
