import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Go template in GitHub with Tekton
 * 
 * @group tekton
 * @group go
 * @group github
 * @group basic
 */

const golangTemplateName = 'go';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        gitHubBasicGoldenPathTemplateTests(golangTemplateName);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
