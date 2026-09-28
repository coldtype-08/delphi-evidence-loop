/**
 * 활성 스키마·유래 두 화면이 공유하는 조각 (08/31).
 *
 * 두 화면이 같은 응답(`/contract/schema-view`)을 먹으므로 타입과 표시 규칙을 한 곳에 둔다 —
 * 나뉘어 있으면 계층 색이나 「자유 서술」 표기가 조용히 어긋난다.
 *
 * 08/31: 여기 있던 `UseBar` 를 지웠다. 「활성 스키마」는 «계약에 무엇이 들어 있나»만
 * 말하고 사용량은 「유래」가 범주 단위로 답한다 — 그쪽이 자기 막대를 갖고 있다.
 */

export type SchemaField = {
  key: string;
  labelKo: string;
  required: boolean;
  layer: "FIXED" | "DISCOVERED";
  isAxis: boolean;
  kind: "ENUM" | "FREE_TEXT";
  values: { value: string; labelKo: string | null; labelScope?: string | null }[];
  storedValues: number;
};

export type SchemaLayer = {
  labelKo: string;
  whatKo: string;
  howKo: string;
  roleKo: string;
  fieldCount: number;
  storedValues: number;
  groups: { labelKo: string; noteKo: string; fields: string[]; storedValues: number }[];
};

export type SchemaView = {
  version: string;
  fields: SchemaField[];
  layers: { fixed: SchemaLayer; discovered: SchemaLayer };
  versions: { version: string; status: string; approvedBy: string | null;
              approvedAt: string | null; fieldCount: number;
              /** 활성 계약과 필드 키 집합이 같은가 — 서버가 두 본문을 대조해 잰다.
                  같으면 그 버전으로 읽은 claim 은 지금 계약으로도 그대로 읽힌다. */
              sameShapeAsActive: boolean;
              /** 그 버전으로 **처음** 읽은 건수. 「지금 그 버전이 담당하는 수」가 아니다. */
              claimCount: number }[];
  /** 활성 계약과 같은 구성으로 판독된 claim 총수 (SQL). */
  readableUnderActive: number;
  claimTotal: number;
};

export const fmt = (n: number) => n.toLocaleString("ko-KR");
