import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "eval/identifiers.test.ts",
      "eval/redaction.test.ts",
      "eval/session-title.test.ts",
      "eval/auth-schemas.test.ts",
      "eval/chat-composer.test.ts",
      "eval/quota.test.ts",
      "eval/telaah-alur.test.ts",
    ],
  },
});
