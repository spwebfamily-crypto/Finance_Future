BEGIN;

ALTER TABLE "BankTransaction"
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Esta migration é deliberadamente aditiva. Limpezas por intervalo nunca
-- pertencem ao ciclo de deploy: exigem diagnóstico, backup e confirmação.

COMMIT;
