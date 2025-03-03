import { bitbucketSoftwareTemplatesAdvancedScenarios } from "./configs/bitbucket_advanced_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Quarkus template in Bitbucket with Tekton
 *
 * @group tekton
 * @group quarkus
 * @group bitbucket
 * @group advanced
 */

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';


const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.tekton) {

        bitbucketSoftwareTemplatesAdvancedScenarios(quarkusTemplateName, stringOnRoute);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
