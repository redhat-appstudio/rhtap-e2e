import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_suite.ts";

const runQuarkusBasicTests = () => {
    gitHubBasicGoldenPathTemplateTests('java-quarkus')
}

runQuarkusBasicTests()
