import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { basicGoldenPathTests } from '../../scenarios/golden-path-basic.ts';

/**
 * Tests Nodejs template in GitHub with Tekton
 * 
 * @group tekton
 * @group nodejs
 * @group github
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(nodejsTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        basicGoldenPathTests(nodejsTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(nodejsTemplateName);
    }
};

runNodeJSBasicTests();
