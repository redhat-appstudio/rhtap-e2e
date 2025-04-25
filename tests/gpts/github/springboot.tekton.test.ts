import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { basicGoldenPathTests } from '../../scenarios/golden-path-basic.ts';

/**
 * Tests SpringBoot template in GitHub with Tekton
 * 
 * @group tekton
 * @group springboot
 * @group github
 * @group basic
 */

const springBootTemplateName = 'java-springboot';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        basicGoldenPathTests(springBootTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
