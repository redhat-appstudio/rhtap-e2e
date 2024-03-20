import { githubSoftwareTemplatesAdvancedScenarios } from "./test-config/github_advanced_scenario.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

const pythonTemplateName = 'python';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(pythonTemplateName) && configuration.github.active) {

        githubSoftwareTemplatesAdvancedScenarios(pythonTemplateName)
    } else {
        skipSuite(pythonTemplateName)
    }
}

runPythonBasicTests()
