# 펴부기 (Pyeobugi)

웹캠으로 거북목 자세를 감지해 바른 자세를 돕는 데스크톱 앱 (macOS / Windows).

- **온디바이스 감지**: 영상, 얼굴, 자세 수치는 기기 밖으로 나가지 않고, 서버에는 익명 이벤트 로그만 전송
- **저전력**: 경량 얼굴 검출 모델 + 상태에 따라 감지 주기를 조절해 발열과 배터리 소모 최소화

## 기술 스택

Electron · React · TypeScript · Vite · MediaPipe Tasks Vision · Vitest

## 시작하기

```bash
npm install
npm run dev
```

## 브랜치 전략

| 브랜치 | 용도 |
| --- | --- |
| `main` | 릴리즈 |
| `dev` | 통합 브랜치 |
| `feature/*` | 기능 단위 개발 (`dev`에서 분기, `dev`로 머지) |
