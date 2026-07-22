import { describe, expect, test } from "bun:test";

import {
  FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES,
  buildCustomerWorkflowStarterCards,
  normalizeCustomerWorkflowTemplates,
} from "../src/react-app/domains/session/workflows/customer-workflow-templates";
import { LONGEVITY_PRIMARY_GOAL_OPTIONS } from "@matterhorn-work/types/desk-agents";

const expectedTemplateIds = [
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "sui_wallet_workflow",
  "wellness_creator_workflow",
  "blank_chat_workflow",
];

describe("customer workflow template launch cards", () => {
  test("fallback templates expose Matterhorn customer workflows instead of generic tasks", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    expect(cards.map((card) => card.id)).toEqual(expectedTemplateIds);

    const titles = cards.map((card) => card.title).join(" ");
    expect(titles).toContain("Bittensor");
    expect(titles).toContain("Hyperliquid");
    expect(titles).toContain("Polymarket");
    expect(titles).toContain("Sui");
    expect(titles).toContain("Longevity");
  });

  test("blank chat starter uses concise chat copy without a status badge", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const blankChat = cards.find((card) => card.id === "blank_chat_workflow");

    expect(blankChat?.title).toBe("Start chat");
    expect(blankChat?.statusLabel).toBe("");
  });

  test("healthy workflow-ready starter states stay silent", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const wellness = cards.find((card) => card.id === "wellness_creator_workflow");

    expect(wellness?.statusLabel).toBe("");
  });

  test("protocol prompts carry non-custodial safety language", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const bittensor = cards.find((card) => card.id === "bittensor_operator");
    const hyperliquid = cards.find((card) => card.id === "hyperliquid_trader");
    const polymarket = cards.find((card) => card.id === "polymarket_researcher");
    const sui = cards.find((card) => card.id === "sui_wallet_workflow");

    expect(bittensor?.prompt).toContain("Bittensor task");
    expect(bittensor?.prompt).toContain("Scope: TAO");
    expect(bittensor?.prompt).toContain("Do not ask for seed phrases");
    expect(bittensor?.prompt).toContain("private keys");

    expect(hyperliquid?.prompt).toContain("never claim Matterhorn placed it");
    expect(hyperliquid?.prompt).toContain("Finish any real order in your own reviewed Hyperliquid client");
    expect(hyperliquid?.prompt).toContain("Never request keys, signatures, or API secrets");
    expect(hyperliquid?.statusLabel).toBe("Read and preview");
    expect(hyperliquid?.description).not.toContain("place orders");

    const hyperliquidTemplate = FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES.find((template) => template.id === "hyperliquid_trader");
    expect(hyperliquidTemplate?.safetyBoundaries).toMatchObject({
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: false,
      requiresExternalSigner: true,
      allowsRealFunds: false,
    });

    expect(polymarket?.prompt).toContain("Can submit: No");
    expect(polymarket?.prompt).toContain("Live submission: Off");
    expect(polymarket?.prompt).toContain("Matterhorn never signs");

    expect(sui?.prompt).toContain("Sui task");
    expect(sui?.prompt).toContain("Scope: Sui public addresses");
    expect(sui?.prompt).toContain("wallet-standard account reads");
    expect(sui?.prompt).toContain("Do not ask for seed phrases");
    expect(sui?.prompt).toContain("raw signatures");
    expect(sui?.safetySummary).toContain("Use your Sui wallet");
    expect(sui?.safetySummary).toContain("public receipts only");
  });

  test("wellness prompts stay educational and services stay hidden from customer launchers", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const wellness = cards.find((card) => card.id === "wellness_creator_workflow");
    const services = cards.find((card) => card.id === "decentralized_services_operator");

    expect(wellness?.prompt).toContain("Start a Longevity program");
    expect(wellness?.prompt).toContain("Ask me for missing audience");
    expect(wellness?.prompt).toContain("Improve VO2 max");
    expect(wellness?.prompt).toContain("Train for endurance");
    expect(wellness?.prompt).toContain("Allow a custom goal");
    expect(wellness?.prompt).not.toContain("Run this as a visible 7-stage workflow");
    expect(wellness?.safetySummary).toContain("no medical advice");
    expect(wellness?.safetySummary).toContain("no live payments");

    expect(services).toBeUndefined();
    expect(cards.map((card) => card.title).join(" ")).not.toContain("Services");
  });

  test("Longevity goal intake keeps aerobic capacity and endurance distinct", () => {
    const labels = LONGEVITY_PRIMARY_GOAL_OPTIONS.map((option) => option.label);

    expect(labels).toContain("Improve VO2 max");
    expect(labels).toContain("Train for endurance");
    expect(LONGEVITY_PRIMARY_GOAL_OPTIONS.find((option) => option.id === "improve_vo2_max")?.description)
      .toContain("cardiorespiratory fitness");
    expect(LONGEVITY_PRIMARY_GOAL_OPTIONS.find((option) => option.id === "train_for_endurance")?.description)
      .toContain("endurance events");
  });

  test("invalid or empty server payloads fall back to safe local templates", () => {
    expect(buildCustomerWorkflowStarterCards(normalizeCustomerWorkflowTemplates({ ok: true, customerTemplates: [] })).map((template) => template.id))
      .toEqual(expectedTemplateIds);

    const unsafeTemplate = {
      ...FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES[1],
      id: "unsafe_market_template",
      safetyBoundaries: {
        ...FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES[1].safetyBoundaries,
        liveExecutionEnabled: true,
      },
    };

    expect(buildCustomerWorkflowStarterCards(normalizeCustomerWorkflowTemplates({ ok: true, customerTemplates: [unsafeTemplate] })).map((template) => template.id))
      .toEqual(expectedTemplateIds);
  });
});
