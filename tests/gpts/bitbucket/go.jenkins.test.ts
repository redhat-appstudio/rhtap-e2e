import { bitbucketJenkinsBasicGoldenPathTemplateTests } from "./configs/bitbucket_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Go template in Bitbucket with Jenkins
 *
 * @group jenkins
 * @group go
 * @group bitbucket
 * @group basic
 */

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.jenkins) {
        bitbucketJenkinsBasicGoldenPathTemplateTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
