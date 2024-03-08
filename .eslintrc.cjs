/* eslint-disable no-undef */
/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    "rules": {
        '@typescript-eslint/indent': 'error',
        'no-multiple-empty-lines': "error",
        'no-shadow': 'off',
        'no-redeclare': 'off',
        '@typescript-eslint/no-shadow': 'error',
        '@typescript-eslint/no-redeclare': 'error',
        'no-undef': 'off',
        'no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-expressions': 'error',
        '@typescript-eslint/consistent-type-assertions': 'error',
        '@typescript-eslint/no-unused-vars': [
            'warn',
            {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: true,
                argsIgnorePattern: '^_',
            },
        ],
    }
};
