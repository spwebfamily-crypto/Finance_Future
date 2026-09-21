import "dotenv/config";
import {
  previewOutrosCategoryCleanup,
  removeOutrosCategories,
  totalCleanupCounts,
} from "../services/removeOutrosCategoryService.js";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const userId = argument("user-id");
const apply = process.argv.includes("--apply");
const confirmation = argument("confirm");

async function main() {
  if (apply && confirmation !== "REMOVE_OUTROS") {
    throw new Error("A aplicação exige --confirm=REMOVE_OUTROS. Sem isso, nada foi alterado.");
  }

  const preview = await previewOutrosCategoryCleanup(userId);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        userId: userId ?? null,
        categories: preview,
        totals: totalCleanupCounts(preview),
      },
      null,
      2,
    )}\n`,
  );

  if (!apply) {
    process.stdout.write(
      "Nada foi alterado: execute novamente com --apply --confirm=REMOVE_OUTROS após validar o relatório.\n",
    );
    return;
  }

  const applied = await removeOutrosCategories(userId);
  process.stdout.write(
    `${JSON.stringify({ mode: "applied", categories: applied, totals: totalCleanupCounts(applied) }, null, 2)}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../prisma.js");
    await prisma.$disconnect();
  });
