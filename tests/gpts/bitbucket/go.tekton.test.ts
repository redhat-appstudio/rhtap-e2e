import { bitbucketSoftwareTemplateTests } from "./configs/bitbucket_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Go template in Bitbucket with Tekton
 *
 * @group tekton
 * @group go
 * @group bitbucket
 * @group basic
 */

const golangTemplateName = 'go';
const stringOnRoute =  'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.tekton) {
        bitbucketSoftwareTemplateTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
