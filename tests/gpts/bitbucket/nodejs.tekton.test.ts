import { bitbucketSoftwareTemplateTests } from "./configs/bitbucket_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Nodejs template in Bitbucket with Tekton
 *
 * @group tekton
 * @group nodejs
 * @group bitbucket
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const stringOnRoute =  'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(nodejsTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.tekton) {
        bitbucketSoftwareTemplateTests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName);
    }
};

runNodeJSBasicTests();
