import { gitLabProviderBasicTests } from "./suites-config/gitlab_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests SpringBoot template in GitLab with Tekton
 * 
 * @group tekton
 * @group springboot
 * @group gitlab
 * @group basic
 */

const springBootTemplateName = 'java-springboot';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.tekton) {

        gitLabProviderBasicTests(springBootTemplateName);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
