import { bitbucketSoftwareTemplateTests } from "./configs/bitbucket_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests SpringBoot template in Bitbucket with Tekton
 *
 * @group tekton
 * @group springboot
 * @group bitbucket
 * @group basic
 */

const springBootTemplateName = 'java-springboot';
const stringOnRoute =  'Hello World!';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.tekton) {

        bitbucketSoftwareTemplateTests(springBootTemplateName, stringOnRoute);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
