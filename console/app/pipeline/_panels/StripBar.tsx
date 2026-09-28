"use client";

import type { Strip } from "../_lib/types";
import { hhmmss } from "../_lib/format";
import { Panel, Eyebrow } from "@/app/components/ui";

export default function StripBar({ strip }: { strip: Strip | null }) {
  if (!strip) return null;
  // 한 칸 = 파이프라인의 한 단계. 숫자가 크고 라벨이 작다 — 홈 대시보드의 Stat 과 같은 위계.
  const Cell = ({ label, sub, children }: {
    label: string; sub?: string; children: React.ReactNode;
  }) => (
    <div className="min-w-0 flex-1">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 flex flex-wrap items-baseline gap-1.5 text-[1.0625rem] font-medium tabular-nums leading-none text-navy">
        {children}
      </div>
      {sub && <p className="mono mt-2 text-[0.75rem] leading-[1.6] text-muted">{sub}</p>}
    </div>
  );
  const Arrow = () => (
    <span aria-hidden className="mono hidden self-center text-faint md:block">→</span>
  );
  return (
    <Panel as="section" pad="lg">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Eyebrow>결과 — 라인 집계</Eyebrow>
        <span className="mono text-[0.75rem] text-muted">
          위 단계들이 실제로 돌면 이 숫자가 움직입니다 · 셀마다 출처를 표기합니다
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:gap-3">
        <Cell label="비정형 데이터" sub="코퍼스 적재분">
          {strip.rawDocuments.toLocaleString()}
          <span className="mono text-[0.75rem] font-normal text-faint">건</span>
        </Cell>
        <Arrow />
        <Cell label="분석된 기록" sub="0단계에서 나눈 블록 — 원문 위치까지 일치">
          {strip.analyzedRecords.toLocaleString()}
        </Cell>
        <Arrow />
        {/* 08/30: 「잠정 | 공식」 두 숫자를 하나로 합쳤다.
            절대 규칙 #3이 개정되면서(#115) 승인이 «본부 검토 큐»에서 «수집 시점»으로 옮겨졌고,
            원석 배치분은 적재하는 순간 승인된다(`sense.initial_status`). 그래서 «승인을
            기다리는 잠정»이라는 상태가 이 라인의 산출물에 더 이상 없다 — 구조화가 만든 것은
            그냥 claim 이다.
            **두 수를 더한 것이 아니라 세는 대상을 바꾼 것**이다: 이 칸이 세는 것은 「분석에
            쓸 수 있는 값」이 아니라 「구조화가 만들어 낸 값」이다. 나란히·합산 금지가 살아
            있는 곳은 집계·분석 화면(/analytics)이다.
            부제도 뺐다 (08/30 팀장) — 「사람이 볼 몫」을 작은 글씨로 달아 두니 「잠정」이라는
            말만 지웠을 뿐 숫자가 둘로 보이는 것은 그대로였다. 그 수는 검토 큐가 말한다. */}
        {/* 09/01 [팀장]: 「가설」 칸 제거 — 이 화면(AI Readable 전환)은 구조화까지가
            산출물이고, 가설은 「신호와 가설」이 세고 다룬다. 08/28에 가설 섹션을 그 화면으로
            옮겼는데 숫자 칸이 여기 남아 있어, 두 화면의 가설 수가 다를 수 있는 시점(재생성
            전후)에 어느 쪽이 맞느냐는 질문을 만들었다. 세는 자리를 하나로 줄인다. */}
        <Cell label="구조화 신호" sub="근거 문장이 원문과 일치한 값만 · 가설 도출은 「신호와 가설」에서">
          {strip.signals.total.toLocaleString()}
          <span className="mono text-[0.75rem] font-normal text-faint">건</span>
        </Cell>
      </div>

      <p className="mono mt-4 border-t border-line pt-3 text-[0.75rem] text-muted">
        승인은 수집 시점에 찍힙니다 — 검증에 걸린 행만 사람 몫으로 남습니다 ·
        SQL 계산 · {hhmmss(strip.asOf)}
      </p>
    </Panel>
  );
}
