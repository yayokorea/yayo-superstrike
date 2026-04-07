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
- GitHub Release OTA는 기본적으로 `yayokorea/yayo-superstrike` 저장소의 `releases/latest/download/manifest.json` 을 조회합니다.
- 다른 저장소나 별도 manifest URL을 쓰려면 `VITE_GITHUB_REPO` 또는 `VITE_RELEASE_MANIFEST_URL` 을 설정하면 됩니다.
- 정식 릴리즈는 `VERSION` 값을 먼저 올리고 해당 커밋에 `vX.Y.Z` 태그를 붙여 배포합니다.
- 기존 `index.html`은 당장 제거하지 않고 병행 유지합니다.
