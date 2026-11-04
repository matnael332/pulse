import { describe, expect, it } from "vitest";

import { type Known, personalize, pseudonymize } from "./names";

const ACCOUNTS: Known[] = [
  { id: "acc_000001", name: "מאפיית הגליל", customer_id: "10001" },
  { id: "acc_000002", name: "מאפיית", customer_id: "10002" },
  { id: "acc_000003", name: "Galil Bakery", customer_id: "7" },
  { id: "acc_000004", name: "מוסך הדרום", customer_id: "10004" },
  { id: "acc_000005", name: "מוסך הדרום", customer_id: "10005" },
  { id: "acc_000006", name: "*Star* Ltd", customer_id: "" },
];

describe("a question to the copilot", () => {
  it("names the accounts by id, glued Hebrew letters and all", () => {
    expect(pseudonymize("למה למאפיית הגליל יש סיכון?", ACCOUNTS)).toBe("למה לacc_000001 יש סיכון?");
    expect(pseudonymize("ומאפיית הגליל, ו-Galil Bakery?", ACCOUNTS)).toBe(
      "וacc_000001, ו-acc_000003?",
    );
  });

  it("takes the longest name first, and a shared name is both accounts", () => {
    expect(pseudonymize("מאפיית ומאפיית הגליל", ACCOUNTS)).toBe("acc_000002 וacc_000001");
    expect(pseudonymize("מה עם מוסך הדרום?", ACCOUNTS)).toBe("מה עם acc_000004 / acc_000005?");
  });

  it("knows the company's account numbers, but only whole", () => {
    expect(pseudonymize("לקוח 10001 ו-100012", ACCOUNTS)).toBe("לקוח acc_000001 ו-100012");
    expect(pseudonymize("7 לקוחות", ACCOUNTS)).toBe("7 לקוחות"); // too short to be a number
    expect(pseudonymize("acc_000001", ACCOUNTS)).toBe("acc_000001");
  });
});

describe("an answer from the copilot", () => {
  it("names the accounts again, and leaves the ids it does not know", () => {
    expect(personalize("acc_000001 בסיכון, וגם acc_999999.", ACCOUNTS)).toBe(
      "מאפיית הגליל בסיכון, וגם acc_999999.",
    );
    expect(personalize("- לacc_000004", ACCOUNTS)).toBe("- למוסך הדרום");
  });

  it("keeps a name as text, never as markdown", () => {
    expect(personalize("acc_000006", ACCOUNTS)).toBe("\\*Star\\* Ltd");
  });
});
