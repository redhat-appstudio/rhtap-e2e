import NodeEnvironment from "jest-environment-node"

class NodeEnvironmentFailFast extends NodeEnvironment {
    failedDescribeMap = {}
    registeredEventHandler = []

    async setup() {
        await super.setup()
        this.global.testEnvironment = this
    }

    registerTestEventHandler(registeredEventHandler) {
        this.registeredEventHandler.push(registeredEventHandler)
    }

    async executeTestEventHandlers(event, state) {
        for (let handler of this.registeredEventHandler) {
            await handler(event, state)
        }
    }

    async handleTestEvent(event, state) {
        await this.executeTestEventHandlers(event, state)

        switch (event.name) {
            case "hook_failure": {
                const describeBlockName = event.hook.parent.name

                this.failedDescribeMap[describeBlockName] = true
                // hook errors are not displayed if tests are skipped, so display them manually
                console.error(`ERROR: ${describeBlockName} > ${event.hook.type}\n\n`, event.error, "\n")
                break
            }
            case "test_fn_failure": {
                this.failedDescribeMap[event.test.parent.name] = true
                event.test.mode = "fail";

                break
            }
            case "test_start": {
                if (this.failedDescribeMap[event.test.parent.name] && event.test.mode === undefined) {
                    event.test.mode = "skip";
                }

                break
            }
        }

        if (super.handleTestEvent) {
            super.handleTestEvent(event, state)
        }
    }
}

export default NodeEnvironmentFailFast