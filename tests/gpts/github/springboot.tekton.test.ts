import { gitHubBasicGoldenPathTemplateTests } from "./test-config/github_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests SpringBoot template in GitHub with Tekton
 * 
 * @group tekton
 * @group springboot
 * @group github
 * @group basic
 */

const springBootTemplateName = 'java-springboot';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(springBootTemplateName) && configuration.github.active && configuration.github.tekton) {

        gitHubBasicGoldenPathTemplateTests(springBootTemplateName)
    } else {
        skipSuite(springBootTemplateName)
    }
}

runSpringBootBasicTests()
