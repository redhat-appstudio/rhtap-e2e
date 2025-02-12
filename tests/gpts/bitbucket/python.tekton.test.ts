import { bitbucketSoftwareTemplateTests } from "./configs/bitbucket_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Python template in Bitbucket with Tekton
 *
 * @group tekton
 * @group python
 * @group bitbucket
 * @group basic
 */

const pythonTemplateName = 'python';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.tekton) {

        bitbucketSoftwareTemplateTests(pythonTemplateName);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
