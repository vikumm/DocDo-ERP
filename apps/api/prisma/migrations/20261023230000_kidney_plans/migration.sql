-- Planos passam a ser por rim: unilateral (R$ 1.000) e bilateral (R$ 1.500).
-- Renomeia os valores em vez de recriar o enum, preservando casos e pedidos existentes.
ALTER TYPE "Plan" RENAME VALUE 'STANDARD' TO 'UNILATERAL';
ALTER TYPE "Plan" RENAME VALUE 'EXPRESS' TO 'BILATERAL';
ALTER TABLE "Case" ALTER COLUMN "plan" SET DEFAULT 'UNILATERAL';
