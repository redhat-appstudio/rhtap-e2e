import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { basicGoldenPathTests } from '../../scenarios/golden-path-basic.ts';

/**
 * Tests Go template in GitHub with Tekton
 * 
 * @group tekton
 * @group go
 * @group github
 * @group basic
 */

const golangTemplateName = 'go';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        basicGoldenPathTests(golangTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
