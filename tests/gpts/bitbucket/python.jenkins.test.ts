import { bitbucketJenkinsBasicGoldenPathTemplateTests } from "./configs/bitbucket_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Python template in Bitbucket with Jenkins
 *
 * @group jenkins
 * @group python
 * @group bitbucket
 * @group basic
 */

const pythonTemplateName = 'python';
const stringOnRoute =  'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.jenkins) {
        bitbucketJenkinsBasicGoldenPathTemplateTests(pythonTemplateName, stringOnRoute);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
