export const GPTS_TEMPLATES = ['python', 'java-springboot', 'go', 'dotnet-basic', 'nodejs', 'java-quarkus'];

export const GITHUB_ORGANIZATION = process.env.GITHUB_ORGANIZATION || 'rhtap-rhdh-qe';

// Im creating this constant due that in the future i want to add a validator for the tests configurations using zod: https://github.com/colinhacks/zod.
// Zod will offer to engineers more reliable errors to see what configs are missing
export const loadGlobals = () => global;

