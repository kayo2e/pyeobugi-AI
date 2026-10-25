# 백엔드 인수인계

펴부기 클라이언트(Electron 데스크톱 앱)가 서버와 주고받는 내용을 정리한 문서입니다.
API 명세서(노션)를 기준으로 하며, 이 레포는 그 명세를 클라이언트와 mock 서버로 구현해 둔 상태입니다.

## 1. 한눈에 보기

- 서버가 받는 것은 **익명 이벤트 로그뿐**입니다. 영상, 얼굴, 랜드마크, 각도(pitch), 얼굴 크기, 개인 기준값은
  클라이언트 밖으로 나가지 않습니다.
- 엔드포인트는 두 개입니다.
  - `POST /api/events`: 이벤트 배치 저장 (1~100개, 본문 64KB 이하)
  - `GET /api/reports/summary`: 오늘과 이번 주 지표, 코멘트
- 인증은 `X-Device-Id` 헤더(UUID v4) 하나입니다. 로그인은 없습니다.

## 2. 같이 보면 좋은 파일

| 파일 | 내용 |
| --- | --- |
| [`docs/api/examples/`](api/examples/) | 실제 클라이언트 코드로 생성한 요청과 응답 예시 (`npm run api-examples`로 재생성) |
| [`src/shared/events.ts`](../src/shared/events.ts) | 이벤트 타입과 payload (클라이언트가 보내는 형태 그대로) |
| [`src/shared/api.ts`](../src/shared/api.ts) | 응답 타입 (`PostEventsResponse`, `ReportSummary`, 에러 본문) |
| [`src/main/mock/validate.ts`](../src/main/mock/validate.ts) | 이벤트 검증 규칙 참고 구현 (화이트리스트, 시각 범위, `USAGE_SEGMENT` 규칙) |
| [`src/main/mock/summary.ts`](../src/main/mock/summary.ts) | 리포트 집계 산식 참고 구현 |
| [`src/main/mock/*.test.ts`](../src/main/mock/) | 경계 사례 테스트 (KST 자정, 중복 eventId, 413, rejected index 등) |

mock은 개발 모드에서만 켜지고 프로덕션 빌드에는 들어가지 않습니다. 실제 서버 주소는 빌드할 때
`MAIN_VITE_API_BASE_URL` 환경 변수로 넣습니다.

### 예시 파일

| 파일 | 상황 |
| --- | --- |
| `post-events.request.json` / `.response.json` | 세션 하나 전체: 시작, 기준 잡기, 나쁜 자세, KST 자정에서 나뉜 `USAGE_SEGMENT` 4개, 종료 |
| `post-events-mixed.*` | 한 배치에 중복 1개, 정상 1개, 금지 필드(`payload.pitch`) 1개 → `accepted 1 / duplicated 1 / rejected 1` |
| `reports-summary.response.json` | 위 이벤트를 저장한 뒤의 리포트 |
| `reports-summary-empty.response.json` | 기록이 없는 새 기기 (`hasData: false`) |
| `error-device-id.response.json` | 잘못된 `X-Device-Id` → 400 `DEVICE_ID_INVALID` |

## 3. 서버가 알아야 할 클라이언트 동작

- **같은 이벤트가 반드시 다시 옵니다.** 네트워크 오류, 5xx, 응답 유실 시 같은 `eventId`로 재전송합니다.
  `(deviceId, eventId)`로 중복을 거르고, 내용이 달라도 덮어쓰지 말고 `duplicated`로 세 주세요.
- **2xx를 받으면 그 배치는 전부 처리된 것으로 보고 큐에서 지웁니다.** `rejected`된 이벤트는 재시도하지
  않습니다. 그래서 `accepted`는 영속 저장이 끝난 뒤에 응답해야 합니다.
- **배치 전체를 400으로 거절하면 그 배치는 버려집니다.** 이벤트 하나가 이상할 때는 400 대신 `rejected`로
  응답해 주세요. 예외로 400 `DEVICE_ID_INVALID`는 클라이언트 버그로 보고 배치를 남겨 둔 채 재시도합니다.
- **413을 받으면 배치를 반으로 나눠 다시 보냅니다.** 이벤트 1개짜리가 413이면 버립니다.
- **429는 `retryAfter`(초)만큼 기다렸다가 재시도합니다.** 본문의 `retryAfter`를 먼저 보고, 없으면
  `Retry-After` 헤더를 봅니다.
- **전송 주기**: 10초마다 또는 20개가 쌓이면 최대 100개씩 보냅니다. 오프라인이면 최대 5,000개까지 쌓았다가
  재연결 때 한꺼번에 보내므로, 며칠 지난 `occurredAt`이 정상적으로 들어옵니다(명세상 최대 30일).
- **`USAGE_SEGMENT`**
  - 1분마다 하나씩 만들고, KST 날짜를 넘지 않습니다. 자정에 끝나는 구간은 `endedAt`이 다음 날 `00:00:00`입니다.
  - 연속된 구간은 앞 구간의 `endedAt`과 다음 구간의 `startedAt`이 같습니다.
  - `occurredAt`은 `endedAt`과 같습니다. 집계 날짜는 `startedAt` 기준입니다.
- **`POSTURE_BAD`의 `occurredAt`은 나쁜 자세가 시작된 시각입니다.** 클라이언트는 3초 이상 유지돼야
  판정하고, 판정 시각이 아니라 시작 시각으로 되돌려 기록합니다. 그래서 같은 배치 안에서 시각이 순서대로
  오지 않을 수 있습니다.
- **리포트 조회 직전**에 클라이언트가 열린 구간을 마감하고 큐를 비운 뒤(최대 2초) `GET`을 호출합니다.
  2xx 응답 이후의 조회에는 방금 보낸 이벤트가 반영돼 있어야 합니다.
- 앱 종료 시 마지막 구간과 `SESSION_END`를 보내려고 1.5초까지 기다립니다. 응답이 늦으면 다음 실행 때
  보냅니다.

## 4. 백엔드가 정해야 할 것

| 항목 | 현재 mock 동작 | 비고 |
| --- | --- | --- |
| Rate limit 수치 (기기 ID당, IP 해시당) | 없음 | 명세상 필수. 초과 시 429 + `retryAfter`(정수, 초) |
| IP 해시 방식 | 없음 | 원본 IP는 저장하지 않기로 함. 솔트와 알고리즘 결정 필요 |
| "이번 주" 정의 | 월요일 00:00(KST) ~ 현재 | 명세서에 "최근 7일 vs 이번 주 → 확인 필요"로 남아 있음 |
| 코멘트 문구와 `mood` 규칙 | 오늘 유지율 80% 이상 GOOD, 50% 이상 NORMAL, 그 외 BAD | 문구는 예시. 오늘 사용 시간이 0이면 `comment: null` |
| `traceId` 형식 | `req-<번호>` | 클라이언트는 `console.error`로만 출력 |
| OpenAPI 문서 | 없음 | 서버 코드에서 자동 생성할지, 클라이언트 쪽에서 먼저 작성할지 알려 주세요 |

### 지표 의미에 대해 알아 둘 점

- `turtleNeckCount`는 `POSTURE_BAD` 개수입니다. 클라이언트는 **거북목(머리 내밀기)과 고개 숙임을 구분하지
  않고** 하나의 나쁜 자세로 판정하므로, 이 숫자에는 고개 숙임도 포함됩니다
  ([ADR 0002](adr/0002-single-bad-posture-class.md)). 화면 문구는 기획과 프론트에서 정할 부분입니다.
- 사용 시간은 **기준 잡기를 마친 뒤 얼굴이 보이는 동안**만 집계됩니다. 기준을 잡기 전이나 자리를 비운 시간은
  `USAGE_SEGMENT`에 들어가지 않습니다.
- 클라이언트 쪽 알려진 오차: 얼굴이 사라진 시각을 최대 3초 되돌려 기록하는데, 그 사이에 1분 경계가 있으면
  최대 3초가 사용 시간에 더 들어갈 수 있습니다.

## 5. 서버 검증 규칙 요약 (명세 기준, mock 구현과 동일)

- 최상위 본문은 `events` 필드만 허용합니다. 다른 필드가 있으면 400 `INVALID_REQUEST`이고 전체를 저장하지 않습니다.
- 이벤트와 payload는 화이트리스트입니다. 정의되지 않은 필드가 있으면 그 이벤트만 `FORBIDDEN_FIELD`로 거절합니다.
- `occurredAt`은 현재 +5분 ~ 과거 30일까지 허용합니다. 벗어나면 `OCCURRED_AT_OUT_OF_RANGE`입니다.
- `USAGE_SEGMENT`
  - `0 ≤ badDurationSec ≤ durationSec ≤ 3600`
  - `startedAt < endedAt`, 같은 KST 날짜(자정 종료는 다음 날 00:00 허용)
  - `durationSec = endedAt − startedAt` (±1초 허용)
  - `occurredAt = endedAt`
- 응답의 `accepted + duplicated + rejected` 개수는 요청 이벤트 수와 같아야 합니다. `rejected.index`는 0부터
  시작하고, `eventId`가 없거나 잘못됐으면 생략합니다.
