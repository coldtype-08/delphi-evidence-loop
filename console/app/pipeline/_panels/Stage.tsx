"use client";

import type { Agent } from "../_lib/types";
import { Panel, Step, Btn } from "@/app/components/ui";
import CostBadges from "./CostBadges";

/**
 * 라인의 한 걸음(⓪①②)을 담는 카드.
 *
 * 08/28: `agent`·`model`·`ready` 를 선택으로 풀었다. ⓪(원본 인식)은 **LLM을 안 쓰는
 * 결정론 파싱**이라 에이전트·모델 줄이 맞지 않아 손으로 짠 마크업을 따로 두고 있었는데,
 * 그 결과 같은 라인의 세 걸음 중 ⓪만 제목이 16px(다른 둘은 17px)이고 번호 배지도
 * 사각형(다른 둘은 Step 의 원형)이었다. LLM 미사용 단계를 이 컴포넌트가 받으면
 * 한 곳에서 고치면 셋이 같이 움직인다.
 */
export default function Stage({
  n, title, agent, model, ready, busy, onRun, disabled, runLabel, busyLabel, runTitle,
  badge, note, spec, children,
}: {
  n: string; title: string;
  /** LLM 단계만 — 없으면 `badge`·`note` 가 이 줄을 대신한다 */
  agent?: string; model?: string; ready?: boolean;
  busy: boolean; onRun: () => void; disabled?: boolean; runLabel?: string;
  /** 실행 중 라벨 — 기본 "실행 중…" */
  busyLabel?: string;
  runTitle?: string;
  /** 제목 옆 배지 (예: LLM 미사용 · 0원) */
  badge?: React.ReactNode;
  /** 에이전트 줄 대신 들어갈 설명 */
  note?: React.ReactNode;
  spec?: Agent;
  children?: React.ReactNode;
}) {
  return (
    <Panel as="section" pad="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Step n={n} />
            <h2 className="text-[1.0625rem] font-bold leading-tight text-navy">{title}</h2>
            {badge}
          </div>
          {agent ? (
            <p className="mono mt-2.5 text-[0.8125rem] leading-[1.7] text-muted">
              에이전트 <b className="font-medium text-navy">{agent}</b> · 모델 <code>{model}</code> ·{" "}
              {ready ? <span className="text-green">키 연결됨</span>
                     : <span className="text-rust">키 없음 — 캐시에 있으면 동작</span>}
            </p>
          ) : note}
          {spec && <CostBadges spec={spec} />}
        </div>
        <Btn variant="primary" size="sm" onClick={onRun} disabled={busy || disabled} title={runTitle}>
          {busy ? (busyLabel ?? "실행 중…") : (runLabel ?? "실행")}
        </Btn>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </Panel>
  );
}
