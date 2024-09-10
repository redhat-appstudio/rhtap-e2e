import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubJenkinsBasicGoldenPathTemplateTests } from "./test-config/github_suite_jenkins.ts";

const pythonTemplateName = 'python';
const stringOnRoute =  'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(pythonTemplateName) && configuration.github.active && configuration.github.jenkins) {

        gitHubJenkinsBasicGoldenPathTemplateTests(pythonTemplateName, stringOnRoute)
    } else {
        skipSuite(pythonTemplateName)
    }
}

runPythonBasicTests()