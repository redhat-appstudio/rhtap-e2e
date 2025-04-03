import { bitbucketJenkinsBasicGoldenPathTemplateTests } from "./configs/bitbucket_suite_jenkins.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests dotnet template in Bitbucket with Jenkins
 *
 * @group jenkins
 * @group dotnet
 * @group bitbucket
 * @group basic
 */

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute =  'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.bitbucket && configuration.bitbucket.jenkins) {
        bitbucketJenkinsBasicGoldenPathTemplateTests(dotNetTemplateName, stringOnRoute);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
