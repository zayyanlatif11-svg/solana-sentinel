import {
  runFullResearchPass,
  runDemoExperiment,
  getSystemHealth,
  getOperatingMode,
} from "@sat/pipeline";
import { getDatabase } from "@sat/database";

async function main() {
  const db = getDatabase();
  console.log(
    JSON.stringify(
      {
        service: "sat-worker",
        operatingMode: getOperatingMode(),
        note: "PAPER/DEMO worker — never broadcasts live swaps",
      },
      null,
      2,
    ),
  );

  const proposals = await runFullResearchPass(db);
  const experiment = await runDemoExperiment(db);
  const health = await getSystemHealth(db);

  console.log(
    JSON.stringify(
      {
        proposals: proposals.length,
        rejected: proposals.filter((p) => p.status === "REJECTED").length,
        proposed: proposals.filter((p) => p.status === "PROPOSED").length,
        experiment: experiment.experiment.name,
        health,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
