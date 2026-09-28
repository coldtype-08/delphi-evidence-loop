"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product } from "../_lib/types";
import { Panel, Eyebrow } from "@/app/components/ui";

export default function ProductStrip() {
  const [p, setP] = useState<Product | null>(null);
  useEffect(() => {
    api<Product>("/system/product").then(setP).catch(() => {});
  }, []);
  if (!p) return null;
  return (
    <Panel pad="sm" className="mt-4 inline-block">
      <Eyebrow>대상 제품</Eyebrow>
      <p className="mt-2 text-[0.875rem] leading-[1.7] text-body">
        <b className="font-medium text-navy">{p.brand}</b>{" "}
        <span className="mono text-[0.8125rem] text-faint">{p.inn} · {p.innKo}</span>
        <span className="mx-2 text-faint">|</span>
        허가 <b className="font-medium text-navy">{p.indication.ko}</b> — 허가 범위 밖 환자군 신호는
        Development로 분리됩니다
      </p>
    </Panel>
  );
}
