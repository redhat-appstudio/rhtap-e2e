import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(quarkusTemplateName) && configuration.github.active && configuration.github.actions) {
        gitHubActionsBasicGoldenPathTemplateTests(quarkusTemplateName, stringOnRoute)
    } else {
        skipSuite(quarkusTemplateName)
    }
}

runQuarkusBasicTests()
