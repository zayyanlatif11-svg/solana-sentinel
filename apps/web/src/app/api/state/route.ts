import { NextResponse } from "next/server";
import { getDatabase } from "@sat/database";
import {
  runDiscoveryCycle,
  runFullResearchPass,
  evaluateMint,
  executePaperProposal,
  runDemoExperiment,
  getSystemHealth,
  getOperatingMode,
} from "@sat/pipeline";
import { mutatingRequestDenied } from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  let state = await db.getState();
  if (state.candidates.length === 0) {
    await runFullResearchPass(db);
    if ((await db.getState()).experiments.length === 0) await runDemoExperiment(db);
    state = await db.getState();
  }
  return NextResponse.json({
    ...state,
    health: await getSystemHealth(db),
    operatingMode: getOperatingMode(),
  });
}

export async function POST(req: Request) {
  const denied = mutatingRequestDenied(req);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 403 });
  }

  const db = getDatabase();
  const body = (await req.json()) as {
    action?: string;
    mint?: string;
    proposalId?: string;
  };

  switch (body.action) {
    case "discover":
      return NextResponse.json(await runDiscoveryCycle(db));
    case "research_pass":
      return NextResponse.json({
        proposals: await runFullResearchPass(db),
        health: await getSystemHealth(db),
      });
    case "evaluate":
      if (!body.mint)
        return NextResponse.json({ error: "mint required" }, { status: 400 });
      return NextResponse.json({ proposal: await evaluateMint(body.mint, db) });
    case "paper_execute":
      if (!body.proposalId)
        return NextResponse.json({ error: "proposalId required" }, { status: 400 });
      try {
        const result = await executePaperProposal(body.proposalId, db);
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : String(e) },
          { status: 400 },
        );
      }
    case "experiment":
      return NextResponse.json({ experiment: await runDemoExperiment(db) });
    case "reset":
      await db.reset(Number(process.env.PAPER_STARTING_CAPITAL_USD ?? 100_000));
      await runFullResearchPass(db);
      await runDemoExperiment(db);
      return NextResponse.json(await db.getState());
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
