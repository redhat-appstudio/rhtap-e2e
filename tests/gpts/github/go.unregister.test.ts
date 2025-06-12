import { gitHubImportTemplateTests } from "./test-config/github_import_template.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";

/**
 * Tests Go template in GitHub with Tekton
 * 
 * @group tekton
 * @group go
 * @group github
 * @group advanced
 */

const golangTemplateName = 'go';

const runGolangImportTemplateTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.github && configuration.github.tekton) {

        gitHubImportTemplateTests(golangTemplateName);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangImportTemplateTests();
