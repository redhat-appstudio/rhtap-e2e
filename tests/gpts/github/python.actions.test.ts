import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubActionsBasicGoldenPathTemplateTests } from "./test-config/github_actions_suite.ts";

const pythonTemplateName = 'python';
const stringOnRoute =  'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.github && configuration.github.actions) {

        gitHubActionsBasicGoldenPathTemplateTests(pythonTemplateName, stringOnRoute);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
