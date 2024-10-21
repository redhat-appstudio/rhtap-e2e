import { gitLabSoftwareTemplatesAdvancedScenarios } from "./suites-config/gitlab_advanced_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts"

const quarkusTemplateName = 'java-quarkus';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(quarkusTemplateName) && configuration.gitlab.active && configuration.gitlab.tekton) {

        gitLabSoftwareTemplatesAdvancedScenarios(quarkusTemplateName)
    } else {
        skipSuite(quarkusTemplateName)
    }
}

runQuarkusBasicTests()
