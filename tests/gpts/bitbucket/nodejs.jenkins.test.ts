import { bitbucketJenkinsBasicGoldenPathTemplateTests } from "./configs/bitbucket_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Nodejs template in Bitbucket with Jenkins
 *
 * @group jenkins
 * @group nodejs
 * @group bitbucket
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const stringOnRoute =  'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(nodejsTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.jenkins) {
        bitbucketJenkinsBasicGoldenPathTemplateTests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName);
    }
};

runNodeJSBasicTests();
