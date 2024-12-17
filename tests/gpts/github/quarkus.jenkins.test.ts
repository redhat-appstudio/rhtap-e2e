import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { gitHubJenkinsBasicGoldenPathTemplateTests } from "./test-config/github_suite_jenkins.ts";

/**
 * Tests Quarkus template in GitHub with Jenkins
 * 
 * @group jenkins
 * @group quarkus
 * @group github
 * @group basic
 */

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(quarkusTemplateName) && configuration.github.active && configuration.github.jenkins) {
        gitHubJenkinsBasicGoldenPathTemplateTests(quarkusTemplateName, stringOnRoute)
    } else {
        skipSuite(quarkusTemplateName)
    }
}

runQuarkusBasicTests()
