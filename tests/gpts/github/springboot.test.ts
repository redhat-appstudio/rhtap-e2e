import { githubSoftwareTemplatesAdvancedScenarios } from "./test-config/github_advanced_scenario.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const springBootTemplateName = 'java-springboot';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(springBootTemplateName) && configuration.github.active) {

        githubSoftwareTemplatesAdvancedScenarios(springBootTemplateName)
    } else {
        skipSuite(springBootTemplateName)
    }
}

runSpringBootBasicTests()
