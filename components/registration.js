'use strict';

const braintree = require('braintree');
const validator = require('validator');
const accounting = require('accounting');

const registrationEmailId = '5a2f9814-dfbe-4a81-951e-48d47985aa38';

const states = ['AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'];

function BraintreeGateway (envVars) {
  const environment = envVars.environment === 'production' ?
    braintree.Environment.Production
    : braintree.Environment.Sandbox;

  const gateway = braintree.connect({
    environment: environment,
    merchantId: envVars.merchantId,
    publicKey: envVars.publicKey,
    privateKey: envVars.privateKey,
    merchantAccountId: envVars.merchantAccountId
  });

  return gateway;
}

function isZip (value) {
  return /^\d{5}(-\d{4})?$/.test(value);
}

function isValidValue(testValue, validValues) {
  return validValues.includes(testValue);
}


function validateInputAndSet(validateFunction, testValue, errorText, errors) {
  if (testValue && validateFunction(testValue)) {
    return testValue;
  } else {
    errors.push(errorText);
    return '';
  }
}

function sendTheMail(apiKey, substitutions, templateId) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(apiKey);
  sgMail.setSubstitutionWrappers('{{', '}}');
  const msg = {
    to: 'jhilde@gmail.com',
    from: 'jhilde@gmail.com',
    subject: 'Apps & Drinks Tickets',
    text: ' ',
    html: ' ',
    templateId: templateId,
    substitutions: substitutions
  };
  return sgMail.send(msg)
}

class Registration {
  constructor(n) {
    let errors = [];

    this.ticket_info = {};
    this.ticket_info.total_amount = n.ticket_info.total_amount;
    //if (n.donation_info.amount < 10) {
    //  errors.push('Amount is less than $10.');
    //}
    // Need to add math check on back end
    this.ticket_info.quantity = n.ticket_info.quantity;
  
    this.purchaser_info = {};

    this.purchaser_info.first_name = validateInputAndSet(validator.isAlpha, n.purchaser_info.first_name, "Missing valid first name.", errors);
    this.purchaser_info.last_name = validateInputAndSet(validator.isAlpha, n.purchaser_info.last_name, "Missing valid last name.", errors);
    this.purchaser_info.email = validateInputAndSet(validator.isEmail, n.purchaser_info.email, "Missing valid email.", errors);
    this.purchaser_info.phone = n.purchaser_info.phone;

    this.purchaser_info.address = {};
    this.purchaser_info.address.street_address = validateInputAndSet(validator.isAscii, n.purchaser_info.address.street_address, "Missing valid street address.", errors);
    this.purchaser_info.address.city = validateInputAndSet(validator.isAlpha, n.purchaser_info.address.city, "Missing valid city.", errors);


    if (isValidValue(n.purchaser_info.address.state, states)) {
      this.purchaser_info.address.state = n.purchaser_info.address.state;
    } else {
      errors.push('Missing valid state')
    }


    this.purchaser_info.address.zip = validateInputAndSet(isZip, n.purchaser_info.address.zip, "Missing valid zip code.", errors);

    this.nonce = n.nonce;


    if (errors.length > 0) {
      throw errors.join(" ");
    }
  }
}

class BraintreeSale {
  constructor(registration) {
    this.amount = registration.ticket_info.total_amount;
    this.paymentMethodNonce = registration.nonce;

    this.customer = {};
    this.customer.firstName = registration.purchaser_info.first_name;
    this.customer.lastName = registration.purchaser_info.last_name;
    this.customer.phone = registration.purchaser_info.phone;
    this.customer.email = registration.purchaser_info.email;

    this.billing = {};
    this.billing.streetAddress = registration.purchaser_info.address.street_address;
    this.billing.extendedAddress = registration.purchaser_info.address.extended_address;
    this.billing.locality = registration.purchaser_info.address.city;
    this.billing.region = registration.purchaser_info.address.state;
    this.billing.postalCode = registration.purchaser_info.address.zip;

    this.options = {};
    this.options.submitForSettlement = true;

    this.customFields = {};
    this.customFields.ticket_count = registration.ticket_info.quantity;
  }
}

exports.btClientToken = (envVars, callback) => {
  const gateway = BraintreeGateway(envVars);

  gateway.clientToken.generate()
  .then((response)=>{
    callback(null, { btClientToken: response.clientToken });
  })
  .catch(() => {
    // should be logging the error
  });
};

exports.btRegister = (event, envVars, callback) => {
  let registration, gateway, braintreeSale;
  
  try {
    registration = new Registration(event);
    gateway = BraintreeGateway(envVars);
    braintreeSale = new BraintreeSale(registration);
  } catch (err) {
    callback(null, {
      success: false,
      err: {
        type: 'validation',
        message: err.message
      }
    })
    return
  }

  try {

    gateway.transaction.sale(braintreeSale)
    .then((result)=> {
      if (result && result.success) {
        sendTheMail(
          envVars.sendGridApiKey,
          {
            purchaserFirstName: registration.purchaser_info.first_name,
            totalAmount: accounting.formatMoney(registration.ticket_info.total_amount),
            transactionId: result.transaction.id
          },
          registrationEmailId
        )
          .then(() => {
            callback(null, {
              success: true,
              transactionId: result.transaction.id
            });
          })
          .catch((err) => {
            //should be logging the error
            console.log(err.toString)
          })
        
      }
      else {
        // Either result is unknown or result.status is false
        if (!result) {
          console.log("Unknown error");
        } else {
          callback(null, {
            success: false,
            err: {
              type: 'processor',
              message: result.message
            }
          });
        }
      }
    });
  }
  catch(err) {
    callback(null, {
      success: false,
      err: {
        type: 'braintree',
        message: err.message
      }
    })
    return
  }
}