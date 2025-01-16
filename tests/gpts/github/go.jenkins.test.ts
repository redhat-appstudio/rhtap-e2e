import { gitHubJenkinsPromotionTemplateTests } from "./test-config/github_advanced_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Go template in GitHub with Jenkins
 * 
 * @group jenkins
 * @group go
 * @group github
 * @group basic
 */

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.github && configuration.github.jenkins) {
        gitHubJenkinsPromotionTemplateTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
