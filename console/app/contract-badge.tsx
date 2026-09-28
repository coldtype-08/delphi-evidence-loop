"use client";

// Contract 버전 스냅샷 배지 (08/25) — 확정 이력은 불가역(볼륨 스냅샷 영속)이라 이 목록은
// 쌓이기만 한다: "언제·누가 고정했는가"가 곧 스키마의 연대기다.
// 출처는 GET /contract/status + /contract/versions — 화면이 지어내는 목록이 아니다.
//
// 08/30 팀장 지시: 상시 노출을 접는다 — **계약 버전이 판단 재료인 화면에서만** 뜬다:
// AI Readable 전환(/pipeline — 어느 버전으로 판독하는지)과 신호와 가설(/hypotheses —
// claim 이 어느 버전으로 해석되는지). 나머지 화면(홈에는 계약 타일이 따로 있다)에서는
// 우상단을 Topbar 의 날짜·계정에 돌려준다 — Topbar 의 우측 예약 폭도 같이 조건부가 됐다.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Panel } from "@/app/components/ui";

/** 배지가 뜨는 화면. */
const SHOW_ON = ["/pipeline", "/hypotheses"];

type St = { version: string | null; status: string };
type Ver = { version: string; status: string; approvedBy: string | null;
             approvedAt: string | null; fieldCount: number; enumCount: number;
             // 이 버전을 가리키는 claim 수 (08/28) — "왜 아직 목록에 있나"의 답
             claimCount?: number; approvedClaimCount?: number };

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit",
                                          hour: "2-digit", minute: "2-digit", hour12: false });

export default function ContractBadge() {
  const path = usePathname();
  const visible = SHOW_ON.some((p) => path === p || path.startsWith(p + "/"));
  const [st, setSt] = useState<St | null>(null);
  const [vers, setVers] = useState<Ver[] | null>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api<St>("/contract/status").then(setSt).catch(() => {});
    api<Ver[]>("/contract/versions").then(setVers).catch(() => {});
  }, []);
  useEffect(() => {
    if (!visible) return;                     // 안 뜨는 화면에서는 30초 폴링도 하지 않는다
    refresh();
    const t = setInterval(refresh, 30_000);   // 확정·SCP 승인이 다른 화면에서 일어나도 따라온다
    return () => clearInterval(t);
  }, [refresh, visible]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!visible || !st) return null;
  const none = st.status === "NONE";
  // 펼쳐 둘 것: **활성·초안** + **claim 이 실제로 가리키는 버전**.
  // 뒤엣것을 남기는 이유는 절대 규칙 #4다 — 저장된 claim 이 v1.0 을 가리키는데 목록에
  // v1.0 이 없으면 "생성 당시 버전으로 해석한다"를 화면에서 확인할 길이 없다.
  // (지금 배포본 기준으로 승인된 6건이 전부 v1.0 각인이다.)
  const inUse = new Set<string>([st?.version ?? ""]);
  const ordered = vers ? [...vers].reverse() : [];
  const shown = ordered.filter(
    (v) => all || v.status === "ACTIVE" || v.status === "DRAFT"
        || inUse.has(v.version) || (v.claimCount ?? 0) > 0);
  const hidden = all ? [] : ordered.filter((v) => !shown.includes(v));

  return (
    // items-end = 배지를 컨테이너 우측에 고정 (08/25): 컨테이너가 우측 앵커라
    // 패널(w-80)이 열리면 폭이 왼쪽으로 자라는데, 버튼이 기본 좌측 정렬이면
    // 그 폭을 따라 같이 밀린다 — 배지는 제자리에 있어야 한다.
    // 08/30 2차 (팀장 스케치) — 상단 바 **안**에서 **아래**로 내렸다. 날짜 칩·아바타와
    // 한 줄로 서면 「지금 시각」과 「이 화면이 쓰는 계약」이 같은 위계로 읽히는데, 배지는
    // 두 화면에만 뜨는 화면 소속 정보다. 상단 바(58px) 바로 밑에 놓아 본문에 붙인다.
    <div ref={box} className="fixed right-6 top-[70px] z-40 flex flex-col items-end text-xs md:right-8">
      <button onClick={() => { setOpen((o) => !o); if (!open) refresh(); }}
              title="Data Contract 버전 스냅샷 — 확정 이력은 불가역으로 쌓입니다"
              className={`rounded-full border px-3 py-1.5 font-bold shadow-sm ${
                none ? "border-orange bg-rust-soft text-rust"
                     : st.status === "DRAFT" ? "border-orange bg-card text-orange-deep"
                     : "border-line bg-card text-navy"}`}>
        {none ? "계약 없음 (v0.0)" : `Contract v${st.version}`}
        {!none && st.status !== "ACTIVE" && <span className="ml-1 font-normal text-muted">({st.status})</span>}
        <span className="ml-1 text-muted">▾</span>
      </button>
      {open && (
        <Panel pad="sm" className="mt-1 w-80 shadow-lg">
          <p className="mb-2 font-bold text-navy">Data Contract 버전 스냅샷</p>
          <p className="mb-2 text-[0.75rem] leading-relaxed text-muted">
            확정된 버전은 되돌릴 수 없고 여기 쌓입니다 — 과거 데이터는 생성 당시 버전으로 해석됩니다.
            그래서 <b className="text-navy">claim 이 가리키는 버전은 지우지 않습니다</b>. 아래는
            지금 쓰는 것과 claim 이 실제로 가리키는 것만 펼쳐 둔 것입니다.
          </p>
          {!vers || vers.length === 0 ? (
            <p className="rounded-lg bg-paper px-2 py-2 text-[0.75rem] text-muted">
              아직 버전이 없습니다 — 분할 독해 → 채택 → v1.0 조립 → 확정 순서로 만들어집니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {/* 08/28 팀장 지적: 20개가 한꺼번에 떠서 어느 게 지금 것인지 안 보였다.
                  **지우지는 않는다.** 그 행들은 감사 이력이고, claim 1,996건이
                  `contract_version` 으로 그 버전들을 가리킨다 — 승인된 6건도 전부 v1.0 이다.
                  지우면 "과거 데이터는 생성 당시 버전으로 해석한다"(절대 규칙 #4)가 깨진다.
                  삭제 API 도 없다(설계상 없는 것이 맞다).
                  그래서 **접는다**: 지금 쓰는 것 + claim 이 실제로 가리키는 것만 펼치고,
                  나머지는 세어서 한 줄로 보여준다. */}
              {shown.map((v) => (
                <li key={v.version}
                    className={`rounded-lg px-2 py-1.5 ${v.status === "ACTIVE" ? "bg-green-soft" : "bg-paper"}`}>
                  <div className="flex items-baseline gap-2">
                    <b className="text-navy">v{v.version}</b>
                    <span className={`rounded px-1 text-[0.75rem] font-bold ${
                      v.status === "ACTIVE" ? "bg-green text-white"
                        : v.status === "DRAFT" ? "bg-orange text-white" : "bg-line text-ink"}`}>
                      {v.status === "ACTIVE" ? "활성" : v.status === "DRAFT" ? "초안" : "이전 버전"}
                    </span>
                    <span className="ml-auto text-[0.75rem] text-muted">
                      필드 {v.fieldCount} · 허용값 {v.enumCount}
                    </span>
                  </div>
                  <div className="text-[0.75rem] text-muted">
                    {v.approvedAt
                      ? <>{when(v.approvedAt)} 확정 고정 · {v.approvedBy}</>
                      : "확정 전 — 아직 고정되지 않음"}
                  </div>
                  {(v.claimCount ?? 0) > 0 && (
                    <div className="mono text-[0.75rem] text-navy/50">
                      이 버전으로 해석되는 claim {v.claimCount!.toLocaleString("ko-KR")}건
                      {(v.approvedClaimCount ?? 0) > 0 &&
                        <span className="text-orange-deep"> · 승인 {v.approvedClaimCount}</span>}
                    </div>
                  )}
                </li>
              ))}
              {hidden.length > 0 && (
                <li className="rounded-lg bg-paper px-2 py-1.5">
                  <button type="button" onClick={() => setAll((a) => !a)}
                          className="flex w-full items-baseline gap-2 text-left">
                    <span className="text-muted">{all ? "▾" : "▸"}</span>
                    <span className="text-[0.75rem] text-muted">
                      {all ? "지난 버전 접기" : `지난 버전 ${hidden.length}개 더 보기`}
                    </span>
                    <span className="ml-auto text-[0.75rem] text-faint">
                      v{hidden[hidden.length - 1].version}–v{hidden[0].version}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
          <a href="/contract" className="mt-2 block text-right text-[0.75rem] font-bold text-navy underline">
            Data Contract 화면에서 전체 보기 →
          </a>
        </Panel>
      )}
    </div>
  );
}
