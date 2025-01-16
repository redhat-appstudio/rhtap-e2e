import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";

const pythonTemplateName = 'python';
const stringOnRoute =  'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.gitlab.active && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCITests(pythonTemplateName, stringOnRoute);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
