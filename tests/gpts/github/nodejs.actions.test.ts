import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

/**
 * Tests Nodejs template in GitHub with Actions
 *
 * @group actions
 * @group nodejs
 * @group github
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const stringOnRoute =  'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(nodejsTemplateName) && configuration.pipeline.github && configuration.github.actions) {
        gitHubActionsBasicGoldenPathTemplateTests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName);
    }
};

runNodeJSBasicTests();
