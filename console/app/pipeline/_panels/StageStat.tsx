"use client";

import { Panel, Eyebrow } from "@/app/components/ui";

// 단계 안에서 나란히 놓이는 작은 계기 (원래 이 파일의 Stat — ui.tsx 의 Stat 과 이름만 같았다).
// ui.tsx 의 Stat 은 큰 수치 하나를 위한 것이라 여기서는 얕은 줄로 쓴다.
export default function StageStat({ label, value, tone }: {
  label: string; value: React.ReactNode; tone?: "warn" | "ok";
}) {
  return (
    <Panel tone="inset" pad="sm">
      <Eyebrow>{label}</Eyebrow>
      <div className={`mt-1.5 text-[1.0625rem] font-medium tabular-nums leading-none ${
        tone === "warn" ? "text-rust" : tone === "ok" ? "text-green" : "text-navy"}`}>
        {value}
      </div>
    </Panel>
  );
}
