import next from "eslint-config-next/core-web-vitals";
import tseslint from "@typescript-eslint/eslint-plugin";
import a11y from "eslint-plugin-jsx-a11y";

/**
 * Flat config: eslint-config-next 16 requires ESLint 9 and ships flat config
 * only, so the old .eslintrc.json no longer loads.
 */
const config = [
  { ignores: [".next/", ".next-check/", "node_modules/"] },
  ...next,
  /*
   * core-web-vitals turns on only a handful of jsx-a11y rules, and the ones it
   * leaves off are the ones that catch the failures worth catching — a file
   * input hidden with `display:none` is unreachable by keyboard, and a toggle
   * whose <label> holds no text announces itself as "checkbox" and nothing
   * else. Both shipped. The recommended set costs nothing once the tree is
   * clean, so it is an error here rather than a periodic audit.
   */
  {
    // Rules only — eslint-config-next already registers the jsx-a11y plugin,
    // and flat config refuses to have it defined twice.
    files: ["**/*.tsx"],
    rules: {
      ...a11y.flatConfigs.recommended.rules,
      // The label text on this app's toggles sits a couple of spans deep
      // inside the label. Default depth is 2, which reads those as empty.
      "jsx-a11y/label-has-associated-control": ["error", { depth: 4 }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // A <button> with no type defaults to "submit" and can accidentally
      // submit an enclosing form for a control meant only to toggle or open.
      "react/button-has-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];

export default config;
