"use client";

/**
 * 단계 이동 — 사람이 가설을 다음 칸으로 넘긴다 (08/26).
 *
 * 넘길 수 있는지는 **서버가 판정한다**. 화면은 버튼을 감추기만 하고, 실제 차단은
 * `POST /hypotheses/transition` 이 사유와 함께 돌려준다 — 근거가 부족한 가설
 * (NOT_BOARD_READY)은 화면을 우회해도 넘어가지 않는다.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Btn } from "@/app/components/ui";

type Result = {
  moved: string[];
  refused: { id: string; reasonKo: string }[];
};

// **DRAFT → Screen 은 사람이 누르는 걸음이 아니다** (08/27 팀장 결정).
// 생성된 가설은 예외 없이 Screen 에이전트 검증을 받는다 — 고를 일이 아니므로 버튼이
// 있으면 "안 보낼 수도 있다"는 거짓 선택지가 된다. Screen 검증 화면이 DRAFT를 그대로
// 받아 [Screen 실행]을 띄운다(`run_screen`은 원래 DRAFT를 받는다).
// 사람이 판단하는 걸음은 **Board로 보낼지** 하나뿐이고, 그것만 남긴다.
// 08/30 — NOT_BOARD_READY 도 여기 있다. Screen 은 판정이 아니라 근거 수집이고,
// 그 근거를 읽은 사람이 «지지 0건»이어도 올릴 수 있다 (Human in the loop).
// 다만 **서명이 있어야 열린다** — `canSendToBoard`(서버 계산)가 버튼을 켠다.
// 문구는 **한 가지**다 (08/30). 근거가 두터운 카드와 얇은 카드에 다른 이름을 붙이면
// ("그래도 보내기" 같은) 사람의 판단이 예외나 변칙처럼 읽힌다 — 검토자가 근거를 보고
// 상정하는 것은 이 파이프라인의 **정식 절차**이지 우회로가 아니다. 같은 걸음에는 같은 이름.
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  BOARD_READY: { to: "IN_REVIEW", label: "AI Board로 안건 상정" },
  NOT_BOARD_READY: { to: "IN_REVIEW", label: "AI Board로 안건 상정" },
  // 보류는 «정보를 더 모으라»는 뜻이고, 모은 뒤 다시 올리는 걸음이 있어야 그 뜻이 완성된다.
  HOLD: { to: "IN_REVIEW", label: "2차 심의로 올리기" },
};
/* 되돌리기 — 08/31 에 REJECTED 가 여기 들어왔다.
   `HUMAN_TRANSITIONS` 는 08/28 부터 `REJECTED→SCREEN_QUEUED`·`→DRAFT` 를 열어 두고 있었는데
   **콘솔에는 그 버튼이 한 개도 없었다.** 그래서 기각이 사실상 가설을 버리는 일이 되어,
   사람이 기각을 못 누르는 화면이었다 — docs/01 §3 은 "승인만이 끝이다"라고 말한다.
   REJECTED 의 두 갈래 중 화면에는 Screen 하나만 낸다: Sense 로 되돌리는 것은 회의장의
   [기각의 다음 걸음]에서 결정과 함께 고르는 걸음이고, 여기는 이미 기각된 것을 물리는 자리다. */
const BACK: Record<string, { to: string; label: string } | undefined> = {
  IN_REVIEW: { to: "BOARD_READY", label: "Screen으로 되돌리기" },
  REJECTED: { to: "SCREEN_QUEUED", label: "Screen으로 되돌리기" },
};

export default function HandoffBar({ id, status, canSendToBoard, onMoved }: {
  id: string; status: string;
  /** 외부 근거 검토 서명이 있는가 — 없으면 앞으로 가는 버튼을 잠근다 (08/30) */
  canSendToBoard?: boolean;
  /** 전이가 성공한 뒤 — 카드를 클라이언트에서 들고 있는 화면(회의장)이 다시 읽는다.
   *  `router.refresh()` 는 서버 컴포넌트만 되살리므로 그쪽 상태는 그대로 남는다 (08/31). */
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fwd = NEXT[status];
  const back = BACK[status];
  if (!fwd && !back) return null;
  // 앞으로 가는 버튼만 잠근다 — 되돌리기는 서명과 무관하다(잘못 보낸 것을 물리는 길).
  const locked = !!fwd && canSendToBoard === false;

  const move = async (to: string, label: string) => {
    setBusy(to);
    setMsg(null);
    try {
      const out = await api<Result>("/hypotheses/transition", {
        method: "POST",
        body: JSON.stringify({ ids: [id], to }),
      });
      if (out.refused.length) setMsg(out.refused[0].reasonKo);
      else {
        setMsg(`${label} — 완료`);
        router.refresh();
        onMoved?.();
        // 네비 배지는 별도 컴포넌트의 상태다 — 경로가 안 바뀌면 다시 세지 않는다.
        // 전이했다고 알려 줘야 숫자가 따라온다 (08/27 — 보냈는데 카운트가 그대로였다).
        window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {fwd && (
        <Btn variant="primary" size="sm" onClick={() => move(fwd.to, fwd.label)}
             disabled={!!busy || locked}
             title={locked ? "외부 근거를 검토했다는 확인에 체크하면 상정할 수 있습니다" : undefined}>
          {busy === fwd.to ? "보내는 중…" : fwd.label}
        </Btn>
      )}
      {locked && (
        <span className="mono text-[0.6875rem] text-muted">
          위 검토 확인 후 상정할 수 있습니다
        </span>
      )}
      {back && (
        <Btn size="sm" onClick={() => move(back.to, back.label)} disabled={!!busy}
             title={back.to === "SCREEN_QUEUED"
               ? "외부 근거를 다시 쌓습니다 — 검토 서명은 비워지고, 새 근거를 읽은 사람이 다시 서명해야 상정됩니다"
               : undefined}>
          {busy === back.to ? "되돌리는 중…" : back.label}
        </Btn>
      )}
      {msg && <span className="mono text-[0.75rem] text-muted">{msg}</span>}
    </div>
  );
}
