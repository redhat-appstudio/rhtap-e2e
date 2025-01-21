import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabProviderGitLabCITests } from "./suites-config/gitlab_gitlabci_suite.ts";

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute =  'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.gitlabci) {
        gitLabProviderGitLabCITests(dotNetTemplateName, stringOnRoute);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
