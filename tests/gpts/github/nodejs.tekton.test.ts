import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Nodejs template in GitHub with Tekton
 * 
 * @group tekton
 * @group nodejs
 * @group github
 * @group basic
 */

const nodejsTemplateName = 'nodejs';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(nodejsTemplateName) && configuration.github.active && configuration.github.tekton) {
        gitHubBasicGoldenPathTemplateTests(nodejsTemplateName);
    } else {
        skipSuite(nodejsTemplateName)
    }
}

runNodeJSBasicTests()
