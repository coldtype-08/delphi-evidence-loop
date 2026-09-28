/** 백엔드 호출 단일 경유지 — 응답 모양의 계약은 docs/04. 형태가 다르면 프론트가 아니라 스펙부터 고친다. */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export class ApiError extends Error {
  code: string;
  constructor(code: string, messageKo: string) {
    super(messageKo);
    this.code = code;
  }
}

/**
 * 조회 대기 한도 (08/28) — 인혁이 Field에서 먼저 세운 패턴을 콘솔로 가져왔다
 * (`apps/field/lib/api.ts`, 브랜치 `jih/field-timeout`). 새 방식을 만들지 않는다.
 *
 * 왜 필요한가: 타임아웃이 없으면 **서버 컴포넌트의 조회가 페이지 전체를 무한정 붙잡는다.**
 * 배포본 실측 — 콘솔 첫 로드 **15.9초**, Field 11.5초, API 자체는 0.4초. 즉 느린 것은
 * 백엔드가 아니라 콜드 스타트를 기다리는 화면이고, 심사위원이 처음 여는 화면이 16초
 * 멈춘다. 한도를 걸면 그 자리에서 "깨어나는 중"이라고 말하고 넘어갈 수 있다.
 *
 * ⚠ **조회(GET)에만 건다.** 콘솔의 POST 37개 중 상당수가 LLM을 **동기로** 실행한다
 * (문서 추출·발언 귀속·가설 도출·Screen·Board·스키마 제안·재분류). 거기에 같은 한도를
 * 걸면 정상 동작을 실패로 끊는다 — Field는 조회가 대부분이라 일괄로 걸어도 됐지만
 * 콘솔은 다르다. 오래 걸리는 조회가 새로 생기면 `timeoutMs`로 개별 지정한다.
 */
const GET_TIMEOUT_MS = 12_000;

export async function api<T>(
  path: string,
  init?: RequestInit & { role?: string; timeoutMs?: number },
): Promise<T> {
  // method 를 안 주면 GET 이다 (fetch 기본값)
  const isRead = !init?.method || init.method.toUpperCase() === "GET";
  const limit = init?.timeoutMs ?? (isRead ? GET_TIMEOUT_MS : undefined);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // 롤은 시연용 헤더 주입 (docs/04 §0) — 권한 강제는 서버의 책임, 프론트는 필터링하지 않는다
        "X-Delphi-Role": init?.role ?? "CLINICAL_STRATEGY",
        ...init?.headers,
      },
      cache: "no-store",
      ...(limit ? { signal: AbortSignal.timeout(limit) } : {}),
    });
  } catch (e) {
    // 원인을 삼키지 않는다 — "느린가 막힌가"를 화면에서 구분할 수 있어야 한다
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    if (timedOut) {
      throw new ApiError(
        "TIMEOUT",
        `백엔드가 ${Math.round((limit as number) / 1000)}초 안에 답하지 않았습니다 — ` +
          "배포본이 깨어나는 중이면 잠시 후 새로고침하세요.",
      );
    }
    // fetch 자체가 실패 = HTTP 이전 단계 (서버 재시작 중·주소 설정·네트워크)
    throw new ApiError(
      "NETWORK_UNREACHABLE",
      "백엔드에 연결하지 못했습니다. 서버가 재배포 중이면 1~2분 뒤 다시 시도하세요. 계속되면 NEXT_PUBLIC_API_BASE_URL(콘솔)과 ALLOWED_ORIGINS(백엔드) 설정을 확인하세요.",
    );
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? "ERROR", body?.error?.message_ko ?? `API ${res.status}`);
  }
  return body.data as T;
}
