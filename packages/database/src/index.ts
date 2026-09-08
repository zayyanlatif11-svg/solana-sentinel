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
} from "@sat/shared";
import type { ExperimentResult } from "@sat/experiments";
import { createInitialPortfolio } from "@sat/portfolio";

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
  equityHistory: Array<{ t: string; nav: number }>;
}

export interface Database {
  readonly mode: "memory" | "postgres";
  getState(): StoreSnapshot;
  setCandidates(c: CandidateAsset[]): void;
  addProposal(p: TradeProposal): void;
  addOrder(o: PaperOrder): void;
  setPositions(p: Position[]): void;
  setPortfolio(s: PortfolioSnapshot): void;
  addEvents(e: SystemEvent[]): void;
  addTokenRisk(a: TokenRiskAssessment): void;
  addPolicy(a: PolicyAssessment): void;
  addScore(s: OpportunityScore): void;
  addResearch(r: ResearchBrief): void;
  addExperiment(e: ExperimentResult): void;
  pushEquity(nav: number): void;
  reset(startingCapital: number): void;
}

export class InMemoryDatabase implements Database {
  readonly mode = "memory" as const;
  private state: StoreSnapshot;

  constructor(startingCapital = Number(process.env.PAPER_STARTING_CAPITAL_USD ?? 100_000)) {
    const { snapshot, positions } = createInitialPortfolio(startingCapital);
    this.state = {
      mode: "memory",
      candidates: [],
      proposals: [],
      orders: [],
      positions,
      portfolio: snapshot,
      events: [],
      tokenRisk: [],
      policies: [],
      scores: [],
      research: [],
      experiments: [],
      equityHistory: [{ t: snapshot.timestamp, nav: snapshot.navUsd }],
    };
  }

  getState(): StoreSnapshot {
    return structuredClone(this.state);
  }

  setCandidates(c: CandidateAsset[]) {
    this.state.candidates = c;
  }
  addProposal(p: TradeProposal) {
    this.state.proposals = [p, ...this.state.proposals.filter((x) => x.id !== p.id)];
  }
  addOrder(o: PaperOrder) {
    this.state.orders.unshift(o);
  }
  setPositions(p: Position[]) {
    this.state.positions = p;
  }
  setPortfolio(s: PortfolioSnapshot) {
    this.state.portfolio = s;
  }
  addEvents(e: SystemEvent[]) {
    this.state.events.unshift(...e);
    this.state.events = this.state.events.slice(0, 500);
  }
  addTokenRisk(a: TokenRiskAssessment) {
    this.state.tokenRisk = [a, ...this.state.tokenRisk.filter((x) => x.mint !== a.mint)].slice(
      0,
      200,
    );
  }
  addPolicy(a: PolicyAssessment) {
    this.state.policies = [a, ...this.state.policies.filter((x) => x.mint !== a.mint)].slice(
      0,
      200,
    );
  }
  addScore(s: OpportunityScore) {
    this.state.scores = [s, ...this.state.scores.filter((x) => x.mint !== s.mint)].slice(0, 200);
  }
  addResearch(r: ResearchBrief) {
    this.state.research = [r, ...this.state.research.filter((x) => x.mint !== r.mint)].slice(
      0,
      200,
    );
  }
  addExperiment(e: ExperimentResult) {
    this.state.experiments.unshift(e);
  }
  pushEquity(nav: number) {
    this.state.equityHistory.push({ t: new Date().toISOString(), nav });
    if (this.state.equityHistory.length > 500) {
      this.state.equityHistory = this.state.equityHistory.slice(-500);
    }
  }
  reset(startingCapital: number) {
    const { snapshot, positions } = createInitialPortfolio(startingCapital);
    this.state = {
      mode: "memory",
      candidates: [],
      proposals: [],
      orders: [],
      positions,
      portfolio: snapshot,
      events: [],
      tokenRisk: [],
      policies: [],
      scores: [],
      research: [],
      experiments: [],
      equityHistory: [{ t: snapshot.timestamp, nav: snapshot.navUsd }],
    };
  }
}

let singleton: Database | null = null;

export function getDatabase(): Database {
  if (!singleton) {
    // Postgres path reserved — ship migrations; use memory unless DATABASE_URL wired later
    singleton = new InMemoryDatabase();
  }
  return singleton;
}

export function resetDatabaseForTests(startingCapital = 100_000): Database {
  singleton = new InMemoryDatabase(startingCapital);
  return singleton;
}
