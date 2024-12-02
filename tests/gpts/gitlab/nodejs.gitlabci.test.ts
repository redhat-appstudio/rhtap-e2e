import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";

const nodejsTemplateName = 'nodejs';
const stringOnRoute =  'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(nodejsTemplateName) && configuration.gitlab.active && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCITests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName)
    }
}

runNodeJSBasicTests()
