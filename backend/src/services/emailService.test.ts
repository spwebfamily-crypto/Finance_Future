import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildVerificationEmail, sendEmail, sendVerificationEmail } from "./emailService.js";
import { env } from "../config.js";

describe("buildVerificationEmail", () => {
  it("uses the first name and includes the verification link", () => {
    const content = buildVerificationEmail({
      name: "Rodrigo Lima",
      verifyUrl: "https://app.exemplo.pt/verify-email?token=abc",
    });

    expect(content.subject).toContain("Confirme o seu email");
    expect(content.html).toContain("Rodrigo");
    expect(content.html).toContain("https://app.exemplo.pt/verify-email?token=abc");
    expect(content.text).toContain("https://app.exemplo.pt/verify-email?token=abc");
  });

  it("escapes HTML so a hostile name cannot inject markup", () => {
    const content = buildVerificationEmail({
      name: '<script>alert("x")</script>',
      verifyUrl: "https://app.exemplo.pt/verify-email?token=abc",
    });

    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});

describe("sendEmail", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (env as { BREVO_API_KEY?: string }).BREVO_API_KEY;
  });

  const message = { to: "cliente@exemplo.pt", subject: "Assunto", text: "Texto", html: "<p>x</p>" };

  it("does not call the network when there is no API key", async () => {
    await sendEmail(message);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("posts to Brevo with the api-key header when configured", async () => {
    (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = "chave-de-teste";
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await sendEmail(message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("chave-de-teste");

    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual([{ email: "cliente@exemplo.pt" }]);
    expect(payload.subject).toBe("Assunto");
    expect(payload.htmlContent).toBe("<p>x</p>");
  });

  it("throws with the provider status when Brevo refuses the email", async () => {
    (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = "chave-de-teste";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"message":"sender not valid"}',
    });

    await expect(sendEmail(message)).rejects.toThrow(/400/);
  });

  it("builds the verification URL from the frontend origin", async () => {
    (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = "chave-de-teste";
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await sendVerificationEmail({ name: "Ana", email: "ana@exemplo.pt", token: "abc123" });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.htmlContent).toContain(`${env.FRONTEND_ORIGIN}/verify-email?token=abc123`);
  });
});
