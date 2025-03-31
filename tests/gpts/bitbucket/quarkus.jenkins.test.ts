import { bitbucketJenkinsBasicGoldenPathTemplateTests } from "./configs/bitbucket_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Quarkus template in Bitbucket with Jenkins
 *
 * @group jenkins
 * @group quarkus
 * @group bitbucket
 * @group basic
 */

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.jenkins) {
        bitbucketJenkinsBasicGoldenPathTemplateTests(quarkusTemplateName, stringOnRoute);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
