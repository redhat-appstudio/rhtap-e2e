import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { basicGoldenPathTests } from '../../scenarios/golden-path-basic.ts';

/**
 * Tests Python template in GitHub with Tekton
 * 
 * @group tekton
 * @group python
 * @group github
 * @group basic
 */

const pythonTemplateName = 'python';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        basicGoldenPathTests(pythonTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
