import { describe, expect, it, vi } from "vitest";
import { parseReceiptText, readReceiptFile } from "./receiptOcr";

vi.mock("./pdfReceiptReader", () => ({
  readPdfReceipt: vi.fn(async () => ({
    text: "MERCADO CENTRAL\nALIMENTACAO\nRua das Flores, 12\nData 07/08/2026\nTOTAL A PAGAR 12,50",
    pageCount: 1,
    usedOcr: false,
  })),
}));

describe("receipt OCR parsing", () => {
  it("extracts the useful fields without requiring a currency symbol", () => {
    const result = parseReceiptText(
      "MERCADO CENTRAL\nRua das Flores, 12\nData 07/08/2026\nTOTAL 12,50",
      [{ id: "food", name: "Alimentação", icon: "utensils", isDefault: true }],
    );

    expect(result.description).toBe("MERCADO CENTRAL");
    expect(result.location).toBe("Rua das Flores, 12");
    expect(result.amount).toBe("12.50");
    expect(result.date).toBe("2026-08-07");
  });

  it("matches a category when its name appears in the extracted text", () => {
    const result = parseReceiptText("COMPRA DE ALIMENTAÇÃO\nTotal 8,90", [
      { id: "food", name: "Alimentação", icon: "utensils", isDefault: true },
    ]);

    expect(result.categoryId).toBe("food");
  });

  it("prioritizes total to pay over subtotal and tax values", () => {
    const result = parseReceiptText("SUBTOTAL 10,00\nIVA 2,30\nTOTAL A PAGAR 12,30");

    expect(result.amount).toBe("12.30");
    expect(result.confidence.amount).toBeGreaterThan(0.9);
  });

  it("uses the nearest label when subtotal, VAT and total share one OCR line", () => {
    const result = parseReceiptText("SUBTOTAL 100,00   IVA 23,00   TOTAL A PAGAR 123,00");

    expect(result.amount).toBe("123.00");
    expect(result.confidence.amount).toBeGreaterThan(0.9);
  });

  it.each([
    ["TOTAL A PAGAR € 1.234,56", "1234.56"],
    ["VALOR TOTAL 1 234,56 EUR", "1234.56"],
    ["T0TAL A PAGAR I2,3O", "12.30"],
    ["GRAND TOTAL 1'234.56", "1234.56"],
  ])("understands Portuguese and noisy OCR money format: %s", (text, expected) => {
    expect(parseReceiptText(text).amount).toBe(expected);
  });

  it("does not treat a VAT percentage as the receipt total", () => {
    const result = parseReceiptText("Taxa IVA 23,00 %\nIVA 2,30");

    expect(result.amount).toBeUndefined();
    expect(result.confidence.amount).toBe(0);
  });

  it("does not extract a decimal-looking fragment embedded in a product code", () => {
    expect(parseReceiptText("ARTIGO AB12,30KG\nNIF 501234567").amount).toBeUndefined();
  });

  it("prioritizes the issue date over the due date", () => {
    const result = parseReceiptText("Data de emissão 05/08/2026\nData de vencimento 20/08/2026");

    expect(result.date).toBe("2026-08-05");
  });

  it.each([
    ["Data de emissão O7-O8-2O26", "2026-08-07"],
    ["Emitido em O7 de agosto de 2O26", "2026-08-07"],
    ["Document date 2026-08-07", "2026-08-07"],
    ["Data 07.08.26 Hora 12:45", "2026-08-07"],
  ])("normalizes difficult receipt dates: %s", (text, expected) => {
    expect(parseReceiptText(text).date).toBe(expected);
  });

  it("uses proximity when issue and due dates appear on the same line", () => {
    const result = parseReceiptText("Data de emissão: 05/08/2026   Vencimento: 20/08/2026");

    expect(result.date).toBe("2026-08-05");
    expect(result.confidence.date).toBeGreaterThan(0.9);
  });

  it("does not classify merchant names by partial words", () => {
    const result = parseReceiptText("CASA CHINA GASTRONOMIA\nTOTAL 18,00", [
      { id: "home", name: "Casa", icon: "house", isDefault: true },
      { id: "transport", name: "Transportes", icon: "car", isDefault: true },
    ]);

    expect(result.categoryId).toBeUndefined();
  });

  it("keeps Uber Eats in food instead of transport", () => {
    const result = parseReceiptText("UBER EATS\nTOTAL A PAGAR 18,90", [
      { id: "food", name: "Alimentação", icon: "utensils", isDefault: true },
      { id: "transport", name: "Transportes", icon: "car", isDefault: true },
    ]);

    expect(result.categoryId).toBe("food");
  });

  it("distinguishes a medical station and the phrase square metre from transport", () => {
    const categories = [
      { id: "health", name: "Saúde", icon: "heart-pulse", isDefault: true },
      { id: "transport", name: "Transportes", icon: "car", isDefault: true },
    ];

    expect(parseReceiptText("POSTO MÉDICO CENTRAL\nConsulta 30,00", categories).categoryId).toBe(
      "health",
    );
    expect(
      parseReceiptText("METRO QUADRADO DECORAÇÃO\nTOTAL 30,00", categories).categoryId,
    ).toBeUndefined();
  });

  it("matches a short custom category only when explicitly labelled", () => {
    const categories = [{ id: "pets", name: "Pets", icon: "paw-print", isDefault: false }];

    expect(parseReceiptText("Categoria: Pets\nTOTAL 9,90", categories).categoryId).toBe("pets");
    expect(
      parseReceiptText("PETSHOP PETS & CIA\nTOTAL 9,90", categories).categoryId,
    ).toBeUndefined();
  });

  it("finds merchant and merchant address while ignoring document and customer metadata", () => {
    const result = parseReceiptText(
      [
        "Página 1 de 2",
        "SUPERMERCADOS BOM DIA, LDA",
        "NIF 501234567",
        "Avenida da Liberdade 20",
        "1000-001 LISBOA",
        "Cliente: Maria Silva",
        "Morada de faturação",
        "Rua do Cliente 9",
        "4000-001 PORTO",
        "TOTAL A PAGAR 42,10",
      ].join("\n"),
    );

    expect(result.description).toBe("SUPERMERCADOS BOM DIA, LDA");
    expect(result.location).toBe("Avenida da Liberdade 20, 1000-001 LISBOA");
    expect(result.confidence.description).toBeGreaterThan(0.8);
    expect(result.confidence.location).toBeGreaterThan(0.8);
  });

  it("preserves multi-page order and finds the final-page total", () => {
    const result = parseReceiptText(
      [
        "Página 1 de 2",
        "MERCEARIA DO BAIRRO",
        "Subtotal 10,00",
        "Página 2 de 2",
        "IVA 2,30",
        "TOTAL DO DOCUMENTO 12,30",
      ].join("\n"),
    );

    expect(result.description).toBe("MERCEARIA DO BAIRRO");
    expect(result.amount).toBe("12.30");
  });

  it("uses the PDF reader result locally and suggests the amount/category", async () => {
    const pdf = new File(["valid-pdf-placeholder"], "fatura.pdf", { type: "application/pdf" });
    const result = await readReceiptFile(pdf, [
      { id: "food", name: "Alimentacao", icon: "utensils", isDefault: true },
    ]);

    expect(result.source).toBe("pdf");
    expect(result.amount).toBe("12.50");
    expect(result.categoryId).toBe("food");
    expect(result.pdf).toEqual({ pageCount: 1, usedOcr: false });
  });
});
