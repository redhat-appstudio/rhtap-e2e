import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const quarkusTemplateName = 'java-quarkus';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(quarkusTemplateName) && configuration.github.active) {

        gitHubBasicGoldenPathTemplateTests(quarkusTemplateName)
    } else {
        skipSuite(quarkusTemplateName)
    }
}

runQuarkusBasicTests()
