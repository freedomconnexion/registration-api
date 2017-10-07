module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		
        lambda_invoke: {
            clientToken: {
                options: {
                    handler: 'clientToken',
                    file_name: 'lambdas.js',
                    event: 'clientToken-event.json'
                }
            },
            register: {
                options: {
                    handler: 'register',
                    file_name: 'lambdas.js',
                    event: 'register-event.json'
                }
            }
        },
		lambda_package: {
        	default: {
            	options: {
                    include_time: false,
                    include_version: false
            	}
        	}
        },
        lambda_deploy: {
        	clientToken: {
            	arn: 'arn:aws:lambda:us-east-1:669821887388:function:registrationApp_clientToken',
                package: './dist/server_latest.zip',
                options: {
                    aliases: 'beta',
                    enableVersioning: true
                }
        	},
            register: {
                arn: 'arn:aws:lambda:us-east-1:669821887388:function:registrationApp_register',
                package: './dist/server_latest.zip',
                options: {
                    aliases: 'beta',
                    enableVersioning: true
                }
            }
        }
	});

	grunt.loadNpmTasks('grunt-aws-lambda');


};