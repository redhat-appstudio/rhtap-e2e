import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

/**
 * Tests Python template in GitHub with Actions
 *
 * @group actions
 * @group python
 * @group github
 * @group basic
 */

const pythonTemplateName = 'python';
const stringOnRoute =  'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.pipeline.github && configuration.github.actions) {

        gitHubActionsBasicGoldenPathTemplateTests(pythonTemplateName, stringOnRoute);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
