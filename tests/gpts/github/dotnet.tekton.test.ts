import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { basicGoldenPathTests } from '../../scenarios/golden-path-basic.ts';

/**
 * Tests dotnet template in GitHub with Tekton
 * 
 * @group tekton
 * @group dotnet
 * @group github
 * @group basic
 */

const dotNetTemplateName = 'dotnet-basic';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        basicGoldenPathTests(dotNetTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
