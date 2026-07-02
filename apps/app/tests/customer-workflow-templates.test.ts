import { describe, expect, test } from "bun:test";

import {
  FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES,
  buildCustomerWorkflowStarterCards,
  normalizeCustomerWorkflowTemplates,
} from "../src/react-app/domains/session/workflows/customer-workflow-templates";

const expectedTemplateIds = [
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
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
    expect(titles).toContain("Longevity");
  });

  test("protocol prompts carry non-custodial safety language", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const bittensor = cards.find((card) => card.id === "bittensor_operator");
    const hyperliquid = cards.find((card) => card.id === "hyperliquid_trader");
    const polymarket = cards.find((card) => card.id === "polymarket_researcher");

    expect(bittensor?.prompt).toContain("Use the Bittensor desk in this session");
    expect(bittensor?.prompt).toContain("Do not ask for seed phrases");
    expect(bittensor?.prompt).toContain("private keys");

    for (const card of [hyperliquid, polymarket]) {
      expect(card?.prompt).toContain("Can submit: No");
      expect(card?.prompt).toContain("Live submission: Off");
      expect(card?.prompt).toContain("Matterhorn never signs");
    }
  });

  test("wellness prompts stay educational and services stay hidden from customer launchers", () => {
    const cards = buildCustomerWorkflowStarterCards(FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES);
    const wellness = cards.find((card) => card.id === "wellness_creator_workflow");
    const services = cards.find((card) => card.id === "decentralized_services_operator");

    expect(wellness?.prompt).toContain("non-medical disclaimer");
    expect(wellness?.prompt).toContain("do not diagnose");
    expect(wellness?.prompt).toContain("claim live payments");

    expect(services).toBeUndefined();
    expect(cards.map((card) => card.title).join(" ")).not.toContain("Services");
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
