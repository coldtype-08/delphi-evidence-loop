"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Btn } from "@/app/components/ui";

// 자유 텍스트 → 분류값 승격 (08/26) — 구조 루프의 실물.
// 자유 서술은 뉘앙스를 보존하지만 집계가 안 된다. 쌓인 값을 읽어 분류값을 제안하고,
// 사람이 채택하면 SCP 큐 → 승인 → 새 버전. 그 뒤엔 "LGS에서 N건"이 SQL로 세어진다.
// 환자군 공백 해소 (08/26) — 실측: claim의 79%가 환자군 미분류(UNSPECIFIED)였다.
// 스키마에 칸이 없어 낙착된 것 — 추출기가 버린 표현(unmapped_terms)과 미분류 인용문을
// 읽어 새 환자군 값을 제안받고, SCP 승인 뒤 미분류를 되짚는다. "써봤더니 좋았다" 같은
// 신호가 미분류에 묻히지 않게 하는 경로다.
// 신호값 쏠림 점검 — 한 값에 몰린 claim을 목록 전체와 다시 대조한다 (08/26).
// 배경: patient_requested_change 에 373건(전체 17%)이 몰렸는데 "의뢰 건수를 셌다" 같은
// 발언까지 섞였다. 계약은 값의 **이름만** 주고 정의는 주지 않아(sense._enum_table) 모델이
// 넓게 끌어온 것. 전면 재판독(블록 1,118건) 대신 그 값의 인용문만 묶음 처리한다.
export default function SignalAuditPanel({ contractActive, onDone }: {
  contractActive: boolean; onDone: () => void;
}) {
  type Row = { value: string; labelKo: string; inContract: boolean; claimCount: number;
               distinctQuotes: number; sharePct: number; samples: string[] };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api<{ rows: Row[] }>("/contract/signal-audit", { role: "DATA_STEWARD" })
      .then((d) => setRows(d.rows)).catch(() => setRows([]));
  };

  const run = async (signal: string) => {
    setBusy(signal); setErr(null);
    setNote("다시 판정하는 중 — 인용문을 묶음 단위로 대조합니다…");
    try {
      const out = await api<{ kept: number; moved: number; demoted: number;
                              movedTo: Record<string, number>; noteKo: string }>(
        "/contract/reclassify-signals", { method: "POST", role: "DATA_STEWARD",
                                          body: JSON.stringify({ signal }) });
      const moved = Object.entries(out.movedTo).map(([k, n]) => `${k} ${n}건`).join(" · ");
      setNote(`판정 완료 — 그대로 ${out.kept}건 · 다른 값으로 ${out.moved}건`
        + `${moved ? ` (${moved})` : ""} · 어느 값도 아님 ${out.demoted}건. ${out.noteKo}`);
      load(); onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const rollback = async () => {
    setBusy("rollback"); setErr(null);
    try {
      const out = await api<{ restored: number }>(
        "/contract/reclassify-signals/rollback", { method: "POST", role: "DATA_STEWARD" });
      setNote(`되돌리기 완료 — ${out.restored}건을 원래 신호값으로 복원했습니다.`);
      load(); onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  return (
    <details className="w-full"
             onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !rows) load(); }}>
      <summary className="cursor-pointer text-xs font-bold text-navy">
        신호값 쏠림 점검 — 한 칸에 몰린 발언 다시 판정하기
      </summary>
      <p className="mt-2 text-[0.75rem] text-muted">
        계약은 값의 <b className="text-ink">이름만</b> 알려주고 정의는 주지 않습니다. 이름이 넓으면
        엉뚱한 발언까지 그 칸에 들어옵니다. 한 값에 지나치게 몰려 있으면
        <b className="text-ink"> 그 값만 골라</b> 전체 목록과 다시 대조하세요 —
        전면 재판독 없이 바로잡히고 비용도 훨씬 적습니다.
      </p>
      {err && <p className="mt-1 text-[0.75rem] font-bold text-rust">{err}</p>}
      {note && <p className="mt-1 rounded bg-green-soft px-2 py-1 text-[0.75rem] font-bold text-green">{note}</p>}
      {!rows ? (
        <p className="mt-2 text-xs text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">아직 판독된 값이 없습니다.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <div key={r.value} className="rounded-xl border border-glass-line bg-card p-2 text-[0.75rem]">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-bold text-navy">{r.value}</code>
                <span className="text-ink">{r.labelKo}</span>
                <span className={r.sharePct >= 15 ? "font-bold text-orange" : "text-muted"}>
                  {r.claimCount.toLocaleString()}건 · 전체의 {r.sharePct}%
                </span>
                {!r.inContract && (
                  <span className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">계약 밖 값</span>
                )}
                <Btn size="xs"  onClick={() => setOpen(open === r.value ? null : r.value)}
                        title="이 값에 실제로 어떤 발언이 들어왔는지 봅니다 (모델 호출 없음)"
                        className={`ml-auto`}>
                  {open === r.value ? "표본 닫기" : "표본 보기"}
                </Btn>
                {r.inContract && (
                  <Btn size="xs"  onClick={() => run(r.value)} disabled={!!busy || !contractActive}
                          title="이 값의 발언만 골라 같은 축의 전체 목록과 다시 대조합니다. 어느 값에도 맞지 않으면 집계에서 빠집니다 (묶음당 1회 호출)"
                          >
                    {busy === r.value ? "판정 중…" : "다시 판정하기"}
                  </Btn>
                )}
              </div>
              {open === r.value && (
                <ul className="mt-1.5 space-y-0.5 text-muted">
                  {r.samples.map((q, i) => <li key={i}>· {q}</li>)}
                </ul>
              )}
            </div>
          ))}
          <Btn size="xs"  onClick={rollback} disabled={!!busy}
                  title="다시 판정이 바꾼 것만 원래 신호값으로 되돌립니다 (모델 호출 없음)"
                  >
            {busy === "rollback" ? "되돌리는 중…" : "판정 되돌리기"}
          </Btn>
        </div>
      )}
    </details>
  );
}
