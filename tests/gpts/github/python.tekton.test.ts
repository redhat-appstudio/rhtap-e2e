import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Python template in GitHub with Tekton
 * 
 * @group tekton
 * @group python
 * @group github
 * @group basic
 */

const pythonTemplateName = 'python';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(pythonTemplateName) && configuration.github.active && configuration.github.tekton) {

        gitHubBasicGoldenPathTemplateTests(pythonTemplateName)
    } else {
        skipSuite(pythonTemplateName)
    }
}

runPythonBasicTests()