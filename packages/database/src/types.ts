import {
  type CandidateAsset,
  type PaperOrder,
  type Position,
  type PortfolioSnapshot,
  type SystemEvent,
  type TradeProposal,
  type TokenRiskAssessment,
  type PolicyAssessment,
  type OpportunityScore,
  type ResearchBrief,
  type SignalResult,
} from "@sat/shared";
import type { ExperimentResult } from "@sat/experiments";

export interface StoredSignal extends SignalResult {
  mint: string;
}

export interface StoreSnapshot {
  mode: "memory" | "postgres";
  candidates: CandidateAsset[];
  proposals: TradeProposal[];
  orders: PaperOrder[];
  positions: Position[];
  portfolio: PortfolioSnapshot;
  events: SystemEvent[];
  tokenRisk: TokenRiskAssessment[];
  policies: PolicyAssessment[];
  scores: OpportunityScore[];
  research: ResearchBrief[];
  experiments: ExperimentResult[];
  signals: StoredSignal[];
  equityHistory: Array<{ t: string; nav: number }>;
}

export interface Database {
  readonly mode: "memory" | "postgres";
  getState(): Promise<StoreSnapshot>;
  setCandidates(c: CandidateAsset[]): Promise<void>;
  addProposal(p: TradeProposal): Promise<void>;
  addOrder(o: PaperOrder): Promise<void>;
  setPositions(p: Position[]): Promise<void>;
  setPortfolio(s: PortfolioSnapshot): Promise<void>;
  addEvents(e: SystemEvent[]): Promise<void>;
  addTokenRisk(a: TokenRiskAssessment): Promise<void>;
  addPolicy(a: PolicyAssessment): Promise<void>;
  addScore(s: OpportunityScore): Promise<void>;
  addResearch(r: ResearchBrief): Promise<void>;
  addExperiment(e: ExperimentResult): Promise<void>;
  addSignals(mint: string, signals: SignalResult[]): Promise<void>;
  pushEquity(nav: number): Promise<void>;
  reset(startingCapital: number): Promise<void>;
}
