import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

const springBootTemplateName = 'java-springboot';
const stringOnRoute =  'Hello World!';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.github && configuration.github.actions) {
        gitHubActionsBasicGoldenPathTemplateTests(springBootTemplateName, stringOnRoute);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
