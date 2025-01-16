import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { githubSoftwareTemplatesAdvancedScenarios } from "./test-config/github_advanced_scenario.ts";

/**
 * Tests Quarkus template in Github with Tekton
 * 
 * @group tekton
 * @group quarkus
 * @group github
 * @group advanced
 */

const quarkusTemplateName = 'java-quarkus';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.github && configuration.github.tekton) {

        githubSoftwareTemplatesAdvancedScenarios(quarkusTemplateName);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
