import { advancedGoldenPathTests } from '../../scenarios/golden-path-advanced.ts';
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Quarkus template in Github with Tekton
 * 
 * @group tekton
 * @group quarkus
 * @group github
 * @group advanced
 */

const quarkusTemplateName = 'java-quarkus';
const gitProvider = 'github';
const gitOrganization = process.env.GITHUB_ORGANIZATION || '';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.github && configuration.github.tekton) {
        advancedGoldenPathTests(quarkusTemplateName, gitProvider, gitOrganization);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
