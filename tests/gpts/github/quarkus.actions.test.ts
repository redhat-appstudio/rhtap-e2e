import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "./test-config/config.ts";
import { githubActionsSoftwareTemplatesAdvancedScenarios } from "./test-config/github_advanced_actions";

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute =  'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.github && configuration.github.actions) {
        githubActionsSoftwareTemplatesAdvancedScenarios(quarkusTemplateName, stringOnRoute);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
