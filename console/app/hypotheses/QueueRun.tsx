"use client";

/**
 * 대기줄 카드의 실행 버튼 (08/31) — 무대에 올리지 않고도 가설별로 검증을 시작한다.
 *
 * 무대의 실행 버튼은 «고른 한 건»용이라, 여러 건을 돌리려면 하나씩 골라야 했다.
 * 카드가 Link(a)라 버튼을 안에 중첩할 수 없어(HTML 규칙) 형제로 겹쳐 놓는다 —
 * 클릭은 카드 이동과 분리된다. 실행 자체는 서버가 뒤에서 돌리므로(백그라운드 규약)
 * 여기서는 시작만 알리고 목록을 새로 그린다. 진행 중계는 그 가설을 고른 무대의 몫.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function QueueRun({ hypId }: { hypId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true); setErr(false);
    try {
      await api(`/hypotheses/${hypId}/screen`, { method: "POST" });
      router.refresh();   // 카드 상태가 «실행 중»으로 — 진행은 무대에서 고르면 보인다
      window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
    } catch {
      setErr(true);       // 이미 실행 중(409) 등 — 새로 그리면 카드가 사실을 말한다
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      title="이 가설의 검증을 지금 시작합니다 — 화면을 옮겨도 실행은 계속됩니다"
      className="mono absolute bottom-2 right-2.5 rounded-md border border-line-2 bg-card px-2
                 py-0.5 text-[0.575rem] font-bold text-navy hover:border-orange hover:text-orange-deep
                 disabled:opacity-50"
    >
      {busy ? "시작 중…" : err ? "다시 시도" : "▶ 실행"}
    </button>
  );
}
