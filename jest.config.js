module.exports = {
    testEnvironment: 'node',
    maxWorkers: 4,
    bail: false,
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
                    active: false,
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
        "jest-junit"
    ]
};
