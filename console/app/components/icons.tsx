/**
 * 아이콘 — **Untitled UI Icons** 에서 고른다 (08/30 팀장 지시: "니가 직접 그리지 말고
 * 여기서 적절한 거 골라서 써줘" — https://www.untitledui.com/resources/icons).
 *
 * 그전에는 SVG path 를 손으로 그렸다. 24px 격자에서 손으로 맞춘 곡률·굵기는 라이브러리의
 * 것과 섞이면 티가 나고, 아이콘마다 광학 크기가 제각각이라 나란히 놓으면 어떤 건 크고
 * 어떤 건 작아 보였다. 한 벌에서 고르면 그 문제가 통째로 없어진다.
 *
 * 이 파일이 하는 일은 **의미 → 아이콘 매핑을 한 곳에 모으는 것**이다. 화면에서 직접
 * `@untitledui/icons` 를 import 하지 말고 여기를 거친다 — 같은 개념이 두 화면에서 다른
 * 그림으로 나오는 것을 막는다(여정 보드의 「가설」과 사이드바의 「신호와 가설」은 같은
 * 전구여야 한다).
 *
 * 라이선스: 개인·상업 프로젝트 사용 허용 (`node_modules/@untitledui/icons/LICENSE`).
 */

import {
  AlertTriangle,
  Award01,
  BarChart08,
  Beaker02,
  Calendar,
  ClipboardCheck,
  ClockRewind,
  Coins01,
  Dataflow04,
  File05,
  FileCheck02,
  FileSearch02,
  GitBranch01,
  Home02,
  Lightbulb02,
  Lock01,
  MedicalCross,
  MessageChatCircle,
  Microphone01,
  PuzzlePiece01,
  Route,
  Rows03,
  Scales01,
  SearchRefraction,
  Share04,
  ShieldTick,
  Table,
  TrendUp01,
  UserCheck01,
  Users01,
} from "@untitledui/icons";
import type { FC, SVGProps } from "react";

export type IconCmp = FC<SVGProps<SVGSVGElement> & { size?: number; color?: string }>;

/** 파이프라인 단계 아이콘 — **그 단계가 무엇을 하는 곳인지**를 그림 하나로 말한다.
 *
 * 08/30 팀장 요청("원문 적재는 비정형 데이터고, 블록 분리는 파싱이고, Claim 추출은
 * AI Readable 전환인데 그런 걸 더 잘 나타낼 수 있나")에 대한 답이 이 표다. 고른 근거를
 * 한 줄씩 남긴다 — 나중에 바꿀 때 «왜 이 그림이었는지»를 다시 추론하지 않도록. */
export const STATION_ICON: Record<string, IconCmp> = {
  "01": File05,           // 원문 적재 — 손대지 않은 문서 그대로 들어온다
  "02": Rows03,           // 블록 분리 — 한 덩이가 균일한 줄로 잘린다 (파싱)
  "03": Table,            // Claim 추출 — 줄글이 «칸이 있는 표»가 된다 (AI Readable 전환)
  "04": BarChart08,       // 신호 축적 — 세는 단계. 막대 = SQL 집계 (절대 규칙 #1)
  "05": Lightbulb02,      // 가설 생성 — 임계를 넘으면 DRAFT 가 선다
  // 08/31 레인 개편 — 루프 **밖**에서 매일 도는 현장 줄이 그려지면서 셋이 생겼다.
  // 숫자가 아니라 «상시 / 현장» 이라는 글자를 배지로 쓴다: 이 둘은 파이프라인의 순번이
  // 아니라 «언제나 도는 것»이라 번호를 매기면 순서가 있는 것처럼 읽힌다.
  // 키는 **스테이션 배지 글자 그대로**다 (다른 칸이 "01"·"SCP" 인 것과 같은 규약).
  // 08/31 첫 판에서 `RT`·`CAP` 로 넣었다가 배지가 「상시」·「현장」이라 조회에 실패했고,
  // 아이콘 자리가 빈 상자로 떴다 — 키를 두 곳에서 다르게 쓰면 반드시 이렇게 된다.
  상시: Calendar,          // 루틴 방문 — 내 권역 × 미방문 경과 순, 이력에서 도출된다
  현장: Microphone01,      // 면담 수집 — 동의 → 전사 → 마스킹 → 저장 (그 자리에서 승인)
  "06": SearchRefraction, // 다중 에이전트 검증 — 하나를 여러 갈래로 비춰 본다 (외부 근거 4종)
  // 08/30 (#117): 사람의 관문이 **둘**이 되면서 여정 보드에 스테이션이 하나 늘었다.
  // 07 이 새로 들어오고 그 뒤가 한 칸씩 밀렸다 — Screen 은 판정이 아니라 «사람이 검토할
  // 근거를 모으는 단계»이므로, 그 근거를 읽고 이름을 건 사람이 있어야 심의로 간다.
  "07": FileCheck02,      // 근거 검토 — 외부 근거 문서를 사람이 직접 읽고 서명한다 (사람 관문 ①)
  "08": Users01,          // Board 심의 — AI 이사회가 찬반을 논한다
  "09": UserCheck01,      // 사람 결정 — 승인·보류·기각 (사람 관문 ②)
  "10": ClipboardCheck,   // 수집 지시 — 승인된 질문이 체크리스트가 되어 현장으로 내려간다
  // 08/31: 배지를 「SCP」에서 「구조」로 바꿨다 (팀장: 내부 약어를 화면에 내지 말 것).
  // 키는 배지 글자 그대로여야 하므로 함께 옮긴다 — 두 곳에서 다르면 아이콘이 빈 상자가 된다.
  구조: PuzzlePiece01,     // 스키마 밖 반복 — 아직 들어갈 칸이 없는 조각 (구조 루프)
};

/** 사이드바 메뉴 아이콘 — 키는 `nav.tsx` 의 href 그대로. */
export const NAV_ICON: Record<string, IconCmp> = {
  "/": Home02,
  "/journey": Route,                              // 여정 = 길
  "/pipeline": FileSearch02,                      // 원문을 읽어 구조로 바꾸는 곳
  "/hypotheses": Lightbulb02,                     // 여정 05 와 같은 전구를 쓴다
  "/hypotheses?stage=screen": SearchRefraction,   // 여정 06 과 같은 그림
  "/hypotheses?stage=board": Users01,             // 여정 08 과 같은 그림
  "/contract": Lock01,                            // 확정된 계약은 AI 가 못 바꾼다 (절대 규칙 #4)
  "/contract/evolve": GitBranch01,                // SCP = 버전이 갈라져 나가는 심사
  "/contract/ontology": Dataflow04,               // 표현들이 하나의 표준어로 모이는 그물
  "/safety": AlertTriangle,                       // AE 는 별도 경로 (절대 규칙 #6)
  "/audit": ClockRewind,                          // 지나간 실행을 되감아 본다
};

/** AI Board 참석자 아이콘 — 원 안에 「그 자리가 무엇을 보는 자리인가」를 그림으로 말한다.
 *
 * 08/31 이관. 그전까지 `BoardRoom.tsx` 가 페르소나 9인의 SVG path 를 **직접 그려** 들고
 * 있었다 — 08/30 지시("니가 직접 그리지 말고 여기서 골라")를 이 화면만 안 따른 자리다.
 * 손으로 맞춘 곡률은 라이브러리 아이콘과 섞이면 티가 나고, 회의장은 사이드바·여정 보드와
 * 나란히 놓이는 화면이라 그 차이가 그대로 보였다.
 *
 * 스테이션·메뉴와 **겹치지 않게** 골랐다: 「Board 심의」는 어디서나 `Users01` 이므로
 * 참석자 개인에게는 쓰지 않고, 「수집 지시」의 `ClipboardCheck` 도 간사에게 주지 않는다.
 * 간사가 하는 일은 서류 정리가 아니라 **발언을 잇는 것**이다.
 */
export const PERSONA_ICON: Record<string, IconCmp> = {
  ORCHESTRATOR: MessageChatCircle, // 진행 — 말을 잇고 쟁점을 지목한다
  CMO: MedicalCross,               // 의학 — 임상 판단
  RA_HEAD: ShieldTick,             // 규제 — 허가 범위가 지켜지는지
  PV_HEAD: ShieldTick,             // 약물감시 — 안전성 신호
  CCO: TrendUp01,                  // 상업 — 시장이 자라는지
  CFO: Coins01,                    // 재무 — 값이 되는지
  CLO: Scales01,                   // 법무·IP — 무게를 견주는 자리
  RND_HEAD: Beaker02,              // 개발 — 임상으로 증명할 수 있는지
  BD_HEAD: Share04,                // 사업개발 — 밖과 잇는다
  CEO: Award01,                    // 판정 — 의장석
};
