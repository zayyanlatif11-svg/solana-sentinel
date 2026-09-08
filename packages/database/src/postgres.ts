import pg from "pg";
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
  CandidateAssetSchema,
  PaperOrderSchema,
  PositionSchema,
  PortfolioSnapshotSchema,
  SystemEventSchema,
  TradeProposalSchema,
  TokenRiskAssessmentSchema,
  PolicyAssessmentSchema,
  OpportunityScoreSchema,
  ResearchBriefSchema,
  SignalResultSchema,
} from "@sat/shared";
import type { ExperimentResult } from "@sat/experiments";
import { createInitialPortfolio } from "@sat/portfolio";
import { STORE_SCHEMA_SQL } from "./schema-sql";
import type { Database, StoreSnapshot, StoredSignal } from "./types";
import { newId } from "@sat/shared";

const { Pool } = pg;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export class PostgresDatabase implements Database {
  readonly mode = "postgres" as const;
  private readonly pool: pg.Pool;
  private ready: Promise<void> | null = null;
  private readonly startingCapital: number;

  constructor(
    connectionString: string,
    startingCapital = Number(process.env.PAPER_STARTING_CAPITAL_USD ?? 100_000),
  ) {
    this.startingCapital = startingCapital;
    this.pool = new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    this.pool.on("error", (err) => {
      console.error("sat postgres pool error", err.message);
    });
  }

  private async ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = this.bootstrap();
    }
    await this.ready;
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.pool.query('create extension if not exists "pgcrypto"');
    } catch {
      /* app-generated UUIDs; extension is optional */
    }
    await this.pool.query(STORE_SCHEMA_SQL);
    const port = await this.pool.query("select payload from sat_portfolio where id = 1");
    if (port.rowCount === 0) {
      const { snapshot, positions } = createInitialPortfolio(this.startingCapital);
      await this.pool.query("insert into sat_portfolio (id, payload) values (1, $1::jsonb)", [
        snapshot,
      ]);
      await this.pool.query("insert into sat_equity (t, nav) values ($1, $2)", [
        snapshot.timestamp,
        snapshot.navUsd,
      ]);
      await this.pool.query(
        "insert into sat_meta (k, payload) values ('startingCapital', $1::jsonb) on conflict (k) do update set payload = excluded.payload",
        [{ usd: this.startingCapital }],
      );
      for (const p of positions) {
        await this.pool.query(
          "insert into sat_positions (id, mint, payload, updated_at) values ($1, $2, $3::jsonb, $4)",
          [p.id, p.mint, p, p.updatedAt],
        );
      }
    }
  }

  async getState(): Promise<StoreSnapshot> {
    await this.ensure();
    const [
      candidates,
      proposals,
      orders,
      positions,
      portfolio,
      events,
      tokenRisk,
      policies,
      scores,
      research,
      experiments,
      signals,
      equity,
    ] = await Promise.all([
      this.pool.query("select payload from sat_candidates"),
      this.pool.query("select payload from sat_proposals order by created_at desc"),
      this.pool.query("select payload from sat_orders order by created_at desc"),
      this.pool.query("select payload from sat_positions"),
      this.pool.query("select payload from sat_portfolio where id = 1"),
      this.pool.query("select payload from sat_events order by created_at desc limit 500"),
      this.pool.query("select payload from sat_token_risk"),
      this.pool.query("select payload from sat_policies"),
      this.pool.query("select payload from sat_scores"),
      this.pool.query("select payload from sat_research"),
      this.pool.query("select payload from sat_experiments order by created_at desc"),
      this.pool.query("select mint, payload from sat_signals order by created_at desc limit 500"),
      this.pool.query("select t, nav from sat_equity order by id asc limit 500"),
    ]);

    const initial = createInitialPortfolio(this.startingCapital).snapshot;
    const parsedPortfolio = PortfolioSnapshotSchema.safeParse(portfolio.rows[0]?.payload);

    return {
      mode: "postgres",
      candidates: parseMany(candidates.rows, CandidateAssetSchema),
      proposals: parseMany(proposals.rows, TradeProposalSchema),
      orders: parseMany(orders.rows, PaperOrderSchema),
      positions: parseMany(positions.rows, PositionSchema),
      portfolio: parsedPortfolio.success ? parsedPortfolio.data : initial,
      events: parseMany(events.rows, SystemEventSchema),
      tokenRisk: parseMany(tokenRisk.rows, TokenRiskAssessmentSchema),
      policies: parseMany(policies.rows, PolicyAssessmentSchema),
      scores: parseMany(scores.rows, OpportunityScoreSchema),
      research: parseMany(research.rows, ResearchBriefSchema),
      experiments: experiments.rows.map((r) => r.payload as ExperimentResult),
      signals: signals.rows.flatMap((r) => {
        const parsed = SignalResultSchema.safeParse(r.payload);
        if (!parsed.success) return [];
        return [{ mint: String(r.mint), ...parsed.data } satisfies StoredSignal];
      }),
      equityHistory: equity.rows.map((r) => ({
        t: r.t instanceof Date ? r.t.toISOString() : String(r.t),
        nav: num(r.nav),
      })),
    };
  }

  async setCandidates(c: CandidateAsset[]): Promise<void> {
    await this.ensure();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from sat_candidates");
      for (const row of c) {
        await client.query(
          "insert into sat_candidates (mint, payload, updated_at) values ($1, $2::jsonb, now())",
          [row.mint, row],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async addProposal(p: TradeProposal): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_proposals (id, mint, payload, created_at)
       values ($1, $2, $3::jsonb, $4)
       on conflict (id) do update set payload = excluded.payload, mint = excluded.mint`,
      [p.id, p.mint, p, p.createdAt],
    );
  }

  async addOrder(o: PaperOrder): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_orders (id, mint, payload, created_at)
       values ($1, $2, $3::jsonb, $4)
       on conflict (id) do update set payload = excluded.payload`,
      [o.id, o.mint, o, o.createdAt],
    );
  }

  async setPositions(p: Position[]): Promise<void> {
    await this.ensure();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from sat_positions");
      for (const row of p) {
        await client.query(
          "insert into sat_positions (id, mint, payload, updated_at) values ($1, $2, $3::jsonb, $4)",
          [row.id, row.mint, row, row.updatedAt],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async setPortfolio(s: PortfolioSnapshot): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_portfolio (id, payload) values (1, $1::jsonb)
       on conflict (id) do update set payload = excluded.payload`,
      [s],
    );
  }

  async addEvents(e: SystemEvent[]): Promise<void> {
    await this.ensure();
    for (const ev of e) {
      await this.pool.query(
        "insert into sat_events (id, payload, created_at) values ($1, $2::jsonb, $3) on conflict (id) do nothing",
        [ev.id, ev, ev.timestamp],
      );
    }
    await this.pool.query(
      `delete from sat_events where id in (
         select id from sat_events order by created_at desc offset 500
       )`,
    );
  }

  async addTokenRisk(a: TokenRiskAssessment): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_token_risk (mint, payload, assessed_at) values ($1, $2::jsonb, $3)
       on conflict (mint) do update set payload = excluded.payload, assessed_at = excluded.assessed_at`,
      [a.mint, a, a.assessedAt],
    );
  }

  async addPolicy(a: PolicyAssessment): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_policies (mint, payload, assessed_at) values ($1, $2::jsonb, $3)
       on conflict (mint) do update set payload = excluded.payload, assessed_at = excluded.assessed_at`,
      [a.mint, a, a.assessedAt],
    );
  }

  async addScore(s: OpportunityScore): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_scores (mint, payload, scored_at) values ($1, $2::jsonb, $3)
       on conflict (mint) do update set payload = excluded.payload, scored_at = excluded.scored_at`,
      [s.mint, s, s.scoredAt],
    );
  }

  async addResearch(r: ResearchBrief): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_research (mint, payload, generated_at) values ($1, $2::jsonb, $3)
       on conflict (mint) do update set payload = excluded.payload, generated_at = excluded.generated_at`,
      [r.mint, r, r.generatedAt],
    );
  }

  async addExperiment(e: ExperimentResult): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sat_experiments (id, payload, created_at) values ($1, $2::jsonb, $3)
       on conflict (id) do update set payload = excluded.payload`,
      [e.experiment.id, e, e.experiment.createdAt],
    );
  }

  async addSignals(mint: string, signals: SignalResult[]): Promise<void> {
    await this.ensure();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from sat_signals where mint = $1", [mint]);
      for (const s of signals) {
        await client.query(
          "insert into sat_signals (id, mint, payload, created_at) values ($1, $2, $3::jsonb, $4)",
          [newId(), mint, s, s.timestamp],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async pushEquity(nav: number): Promise<void> {
    await this.ensure();
    await this.pool.query("insert into sat_equity (t, nav) values (now(), $1)", [nav]);
    await this.pool.query(
      `delete from sat_equity where id in (
         select id from sat_equity order by id desc offset 500
       )`,
    );
  }

  async reset(startingCapital: number): Promise<void> {
    await this.ensure();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      for (const table of [
        "sat_candidates",
        "sat_proposals",
        "sat_orders",
        "sat_positions",
        "sat_events",
        "sat_token_risk",
        "sat_policies",
        "sat_scores",
        "sat_research",
        "sat_experiments",
        "sat_signals",
        "sat_equity",
      ]) {
        await client.query(`delete from ${table}`);
      }
      const { snapshot, positions } = createInitialPortfolio(startingCapital);
      await client.query(
        `insert into sat_portfolio (id, payload) values (1, $1::jsonb)
         on conflict (id) do update set payload = excluded.payload`,
        [snapshot],
      );
      await client.query("insert into sat_equity (t, nav) values ($1, $2)", [
        snapshot.timestamp,
        snapshot.navUsd,
      ]);
      for (const p of positions) {
        await client.query(
          "insert into sat_positions (id, mint, payload, updated_at) values ($1, $2, $3::jsonb, $4)",
          [p.id, p.mint, p, p.updatedAt],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function parseMany<T>(
  rows: Array<{ payload: unknown }>,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row.payload);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
