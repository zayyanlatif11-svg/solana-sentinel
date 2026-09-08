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
import { createInitialPortfolio } from "@sat/portfolio";
import type { Database, StoreSnapshot, StoredSignal } from "./types";
import { PostgresDatabase } from "./postgres";

export type { Database, StoreSnapshot, StoredSignal };

export class InMemoryDatabase implements Database {
  readonly mode = "memory" as const;
  private state: StoreSnapshot;

  constructor(startingCapital = Number(process.env.PAPER_STARTING_CAPITAL_USD ?? 100_000)) {
    this.state = emptyState(startingCapital, "memory");
  }

  async getState(): Promise<StoreSnapshot> {
    return structuredClone(this.state);
  }

  async setCandidates(c: CandidateAsset[]) {
    this.state.candidates = c;
  }
  async addProposal(p: TradeProposal) {
    this.state.proposals = [p, ...this.state.proposals.filter((x) => x.id !== p.id)];
  }
  async addOrder(o: PaperOrder) {
    this.state.orders.unshift(o);
  }
  async setPositions(p: Position[]) {
    this.state.positions = p;
  }
  async setPortfolio(s: PortfolioSnapshot) {
    this.state.portfolio = s;
  }
  async addEvents(e: SystemEvent[]) {
    this.state.events.unshift(...e);
    this.state.events = this.state.events.slice(0, 500);
  }
  async addTokenRisk(a: TokenRiskAssessment) {
    this.state.tokenRisk = [a, ...this.state.tokenRisk.filter((x) => x.mint !== a.mint)].slice(
      0,
      200,
    );
  }
  async addPolicy(a: PolicyAssessment) {
    this.state.policies = [a, ...this.state.policies.filter((x) => x.mint !== a.mint)].slice(
      0,
      200,
    );
  }
  async addScore(s: OpportunityScore) {
    this.state.scores = [s, ...this.state.scores.filter((x) => x.mint !== s.mint)].slice(0, 200);
  }
  async addResearch(r: ResearchBrief) {
    this.state.research = [r, ...this.state.research.filter((x) => x.mint !== r.mint)].slice(
      0,
      200,
    );
  }
  async addExperiment(e: ExperimentResult) {
    this.state.experiments.unshift(e);
  }
  async addSignals(mint: string, signals: SignalResult[]) {
    this.state.signals = [
      ...signals.map((s) => ({ mint, ...s }) satisfies StoredSignal),
      ...this.state.signals.filter((x) => x.mint !== mint),
    ].slice(0, 500);
  }
  async pushEquity(nav: number) {
    this.state.equityHistory.push({ t: new Date().toISOString(), nav });
    if (this.state.equityHistory.length > 500) {
      this.state.equityHistory = this.state.equityHistory.slice(-500);
    }
  }
  async reset(startingCapital: number) {
    this.state = emptyState(startingCapital, "memory");
  }
}

function emptyState(startingCapital: number, mode: StoreSnapshot["mode"]): StoreSnapshot {
  const { snapshot, positions } = createInitialPortfolio(startingCapital);
  return {
    mode,
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
    signals: [],
    equityHistory: [{ t: snapshot.timestamp, nav: snapshot.navUsd }],
  };
}

let singleton: Database | null = null;

export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

export function getDatabase(): Database {
  if (!singleton) {
    const url = databaseUrl();
    singleton = url
      ? new PostgresDatabase(url)
      : new InMemoryDatabase();
  }
  return singleton;
}

export function resetDatabaseForTests(startingCapital = 100_000): InMemoryDatabase {
  const mem = new InMemoryDatabase(startingCapital);
  singleton = mem;
  return mem;
}

export async function closeDatabaseForTests(): Promise<void> {
  if (singleton && singleton instanceof PostgresDatabase) {
    await singleton.close();
  }
  singleton = null;
}

export { PostgresDatabase };
export { STORE_SCHEMA_SQL } from "./schema-sql";
