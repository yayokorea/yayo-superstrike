# Superstrike Web

새 웹 앱은 기존 `index.html`과 별도로 유지되는 React + TypeScript 기반 UI입니다.

## 목적

- 단일 파일 대시보드에서 벗어나 `UI / BLE / OTA` 경계를 분리
- `mcumgr-web`를 OTA 전용 transport 레이어로 래핑
- 이후 일반적인 드라이버형 패널 UI로 확장 가능한 구조 확보

## 현재 구조

- `src/features/device`: 기존 커스텀 BLE 서비스 연결과 센서 읽기
- `src/features/ota`: mcumgr-web 래퍼와 OTA 상태 관리
- `src/components`: 재사용 가능한 패널/상태 컴포넌트
- `src/app`: 앱 조립과 상위 상태 연결

## 시작

```bash
npm install
npm run dev
```

## 참고

- OTA는 `mcumgr-web` 스크립트를 런타임에 로드합니다.
- 릴리즈 태그를 만들면 GitHub Release asset 업로드와 GitHub Pages OTA 배포가 함께 수행됩니다.
- 안정 배포 태그는 `vX.Y.Z`, 개발 배포 태그는 `vX.Y.Z-dev.N` 형식을 사용합니다.
- 웹 OTA는 기본적으로 stable 채널의 `https://yayokorea.github.io/yayo-superstrike/ota/manifest.json` 을 조회합니다.
- Firmware 화면에서 stable/dev 채널을 직접 전환할 수 있고, dev 선택 시 `manifest-dev.json` 을 조회합니다.
- 다른 저장소나 별도 OTA 경로를 쓰려면 `VITE_GITHUB_REPO`, `VITE_OTA_BASE_URL`, `VITE_RELEASE_MANIFEST_URL` 중 하나를 설정하면 됩니다.
- 정식 릴리즈는 `VERSION` 값을 먼저 올리고 해당 커밋에 `vX.Y.Z` 태그를 붙여 배포합니다.
- 기존 `index.html`은 당장 제거하지 않고 병행 유지합니다.
