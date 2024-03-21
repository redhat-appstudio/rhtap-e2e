import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { githubSoftwareTemplatesAdvancedScenarios } from "./test-config/github_advanced_scenario.ts";

const quarkusTemplateName = 'java-quarkus';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(quarkusTemplateName) && configuration.github.active) {

        githubSoftwareTemplatesAdvancedScenarios(quarkusTemplateName)
    } else {
        skipSuite(quarkusTemplateName)
    }
}

runQuarkusBasicTests()
