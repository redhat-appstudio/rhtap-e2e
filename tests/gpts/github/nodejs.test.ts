import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_suite.ts";

const runNodeJSBasicTests = () => {
    gitHubBasicGoldenPathTemplateTests('nodejs')
}

runNodeJSBasicTests()
