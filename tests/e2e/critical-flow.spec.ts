import { test, expect } from "@playwright/test";

test.describe("critical DEMO/PAPER flow", () => {
  test("dashboard research, SCAMX reject, paper fill, duplicate blocked, live stays off", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page.getByTestId("banner-mode")).toContainText("DEMO / PAPER ONLY");
    await expect(page.getByTestId("health-can-broadcast")).toContainText("false");
    await expect(page.getByTestId("health-live-allowed")).toContainText("OFF");
    await expect(page.getByTestId("btn-activate-live")).toHaveCount(0);

    const state = await request.get("/api/state");
    expect(state.ok()).toBeTruthy();
    const json = await state.json();
    expect(json.health.liveTradingAllowed).toBe(false);
    expect(json.health.canBroadcast).toBe(false);
    expect(json.candidates.length).toBeGreaterThan(0);

    await expect(page.getByTestId("candidate-SCAMX")).toBeVisible();
    await expect(page.getByTestId("proposal-status-SCAMX")).toHaveText("REJECTED");

    const live = await request.post("/api/state", {
      data: { action: "set_mode", mode: "LIVE" },
      headers: { origin: "http://127.0.0.1:4317" },
    });
    expect(live.status()).toBe(400);
    const liveBody = await live.json();
    expect(String(liveBody.error)).toMatch(/unknown action/i);

    const csrf = await request.post("/api/state", {
      data: { action: "reset" },
      headers: { origin: "http://evil.example" },
    });
    expect(csrf.status()).toBe(403);

    await page.getByTestId("candidate-WIF").click();
    await expect(page.getByTestId("btn-paper-execute")).toBeEnabled();
    await page.getByTestId("btn-paper-execute").click();
    await expect(page.getByTestId("action-msg")).toContainText(/Paper fill|already paper-executed/i);
    await expect(page.getByTestId("ledger-order").first()).toBeVisible();
    await expect(page.getByTestId("position-WIF")).toBeVisible();

    await page.getByTestId("btn-paper-execute").click();
    await expect(page.getByTestId("action-msg")).toContainText(/already paper-executed|paper-executed/i);

    const health = await request.get("/api/state");
    const after = await health.json();
    expect(after.health.liveTradingAllowed).toBe(false);
    expect(after.health.canBroadcast).toBe(false);
  });
});
