'use strict';

class AwsXray {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.provider = this.serverless.getProvider('aws');

        this.commands = {
            welcome: {
                usage: 'Enables X-Ray tracing on functions',
                lifecycleEvents: [
                    'hello',
                    'world',
                ],
                options: {
                    message: {
                        usage:
                        'Specify the message you want to deploy '
                        + '(e.g. "--message \'My Message\'" or "-m \'My Message\'")',
                        required: true,
                        shortcut: 'm',
                    },
                },
            },
        };

        this.hooks = {
            'after:package:compileFunctions': this.createDeploymentArtifacts.bind(this)
        };
    }

    createDeploymentArtifacts() {
        const functions = this.serverless.service.functions;

        const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

        Object.keys(functions)
            .map(name => [name, functions[name]])
            .filter(([name, definition]) => definition.tracing)
            .forEach(([name, definition]) => {
                console.log('Adding tracing to ' + name);
                const resourceName = this.provider.naming.getLambdaLogicalId(name);
                resources[resourceName].Properties.TracingConfig = {Mode: definition.tracing.mode};
            });

        return this.serverless.service.provider.compiledCloudFormationTemplate;
    }
}

module.exports = AwsXray;
