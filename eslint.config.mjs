import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { ignores: ["**/artifacts"] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            import: importPlugin,
        },
        rules: {
            "indent": ["error", 4, { "SwitchCase": 1 }],
            "semi": ["error", "always"],
            "no-unreachable": "error",
            "camelcase": ["error", { "properties": "always" }],
            "import/no-cycle": "error",

            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    "argsIgnorePattern": "^_",
                    "varsIgnorePattern": "^_",
                    "caughtErrorsIgnorePattern": "^_"
                }
            ],

            
            "no-multiple-empty-lines": ["error", { "max": 2, "maxEOF": 1, "maxBOF": 0 }],
            "eol-last": ["error", "always"],
        }
    }
];
