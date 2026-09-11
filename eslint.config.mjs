import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "out", "release"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    languageOptions: {
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);
