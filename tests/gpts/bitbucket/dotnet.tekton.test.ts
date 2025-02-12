import { bitbucketSoftwareTemplateTests } from "./configs/bitbucket_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests dotnet template in Bitbucket with Tekton
 *
 * @group tekton
 * @group dotnet
 * @group bitbucket
 * @group basic
 */

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute =  'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        bitbucketSoftwareTemplateTests(dotNetTemplateName, stringOnRoute);

    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
