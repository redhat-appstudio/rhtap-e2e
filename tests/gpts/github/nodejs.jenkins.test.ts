import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubJenkinsBasicGoldenPathTemplateTests } from "./test-config/github_suite_jenkins.ts";

/**
 * Tests Nodejs template in GitHub with Jenkins
 * 
 * @group jenkins
 * @group nodejs
 * @group github
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const stringOnRoute =  'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(nodejsTemplateName) && configuration.github.active && configuration.github.jenkins) {
        gitHubJenkinsBasicGoldenPathTemplateTests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName)
    }
}

runNodeJSBasicTests()
