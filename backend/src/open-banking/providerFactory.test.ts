import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FakeOpenBankingProvider } from "./fakeOpenBankingProvider.js";
import { EnableBankingProvider } from "./enableBankingProvider.js";
import { createOpenBankingProvider } from "./providerFactory.js";
import { installTestOpenBankingConfig, useTestOpenBankingConfig } from "./testSupport.js";

installTestOpenBankingConfig();

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const privateKeyB64 = Buffer.from(privateKeyPem).toString("base64");

describe("open banking provider factory", () => {
  it("returns the fake provider when configured", () => {
    expect(createOpenBankingProvider()).toBeInstanceOf(FakeOpenBankingProvider);
  });

  it("returns the enable banking provider when configured", () => {
    useTestOpenBankingConfig({
      OPEN_BANKING_PROVIDER: "enable_banking",
      ENABLE_BANKING_APP_ID: "00000000-1111-4222-8333-444444444444",
      ENABLE_BANKING_PRIVATE_KEY_B64: privateKeyB64,
    });

    expect(createOpenBankingProvider()).toBeInstanceOf(EnableBankingProvider);
  });

  it("fails cleanly when the enable banking private key is missing", () => {
    useTestOpenBankingConfig({
      OPEN_BANKING_PROVIDER: "enable_banking",
      ENABLE_BANKING_APP_ID: "00000000-1111-4222-8333-444444444444",
    });

    expect(() => createOpenBankingProvider()).toThrow(/configurada corretamente/);
  });
});
