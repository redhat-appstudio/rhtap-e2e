module.exports = {
    testEnvironment: './jest-environment-fail-fast.js',
    maxWorkers: 6,
    bail: false,
    testRunner: 'jest-circus/runner',
    verbose: true,
    globals: {
        suites: {
            softwareTemplates: {
                templates: ['dotnet-basic', 'go', 'nodejs', 'python', 'java-quarkus', 'java-springboot'],
                github: {
                    active: true,
                    host: 'https://api.github.com',
                    registriesConfig: {
                        quay: {
                            active: true,
                            host: 'quay.io'
                        },
                    },
                },
                gitlab: {
                    active: true,
                    host: 'https://gitlab.com',
                    registriesConfig: {
                        quay: {
                            active: true,
                            host: 'quay.io'
                        },
                    },
                },
            }
        }
    },
    reporters: [
        "default",
        "jest-junit",
        ["jest-html-reporters", {
            "publicPath": process.env.ARTIFACT_DIR || "./artifacts",
            "filename": "report.html",
            "openReport": true,
            "expand": true,
            "pageTitle": "Red Hat Trusted Application Pipeline e2e report",
        }],
    ]
};
