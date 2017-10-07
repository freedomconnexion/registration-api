const registration = require('./components/registration');

exports.clientToken = (event, context, callback) => {
    registration.btClientToken(event.stageVariables, callback);
};

exports.register = (event, context, callback) => {
    registration.btRegister(event.bodyJson, event.stageVariables, callback);
}