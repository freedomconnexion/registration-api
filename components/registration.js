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
    to: {
      name: `${substitutions.purchaserFirstName} ${substitutions.purchaserLastName}`,
      email: substitutions.purchaserEmail
    },
    from: {
      name: 'Justin Hildebrandt',
      email: 'justin@freedomconnexion.org'
    },
    subject: 'Apps & Drinks Tickets',
    text: ' ',
    html: ' ',
    templateId: templateId,
    substitutions
  };
  return sgMail.send(msg)
}

class Registration {
  constructor(n) {
    let errors = [];

    this.ticketInfo = {};
    this.ticketInfo.totalAmount = n.ticketInfo.totalAmount;
    //if (n.donation_info.amount < 10) {
    //  errors.push('Amount is less than $10.');
    //}
    // Need to add math check on back end
    this.ticketInfo.quantity = n.ticketInfo.quantity;
  
    this.purchaserInfo = {};

    this.purchaserInfo.firstName = validateInputAndSet(validator.isAlpha, n.purchaserInfo.firstName, "Missing valid first name.", errors);
    this.purchaserInfo.lastName = validateInputAndSet(validator.isAlpha, n.purchaserInfo.lastName, "Missing valid last name.", errors);
    this.purchaserInfo.email = validateInputAndSet(validator.isEmail, n.purchaserInfo.email, "Missing valid email.", errors);
    this.purchaserInfo.phone = n.purchaserInfo.phone;

    this.purchaserInfo.address = {};
    this.purchaserInfo.address.streetAddress = validateInputAndSet(validator.isAscii, n.purchaserInfo.address.streetAddress, "Missing valid street address.", errors);
    this.purchaserInfo.address.city = validateInputAndSet(validator.isAlpha, n.purchaserInfo.address.city, "Missing valid city.", errors);


    if (isValidValue(n.purchaserInfo.address.state, states)) {
      this.purchaserInfo.address.state = n.purchaserInfo.address.state;
    } else {
      errors.push('Missing valid state')
    }


    this.purchaserInfo.address.zip = validateInputAndSet(isZip, n.purchaserInfo.address.zip, "Missing valid zip code.", errors);

    this.nonce = n.nonce;


    if (errors.length > 0) {
      throw errors.join(" ");
    }
  }
}

class BraintreeSale {
  constructor(registration) {
    this.amount = registration.ticketInfo.totalAmount;
    this.paymentMethodNonce = registration.nonce;

    this.customer = {};
    this.customer.firstName = registration.purchaserInfo.firstName;
    this.customer.lastName = registration.purchaserInfo.lastName;
    this.customer.phone = registration.purchaserInfo.phone;
    this.customer.email = registration.purchaserInfo.email;

    this.billing = {};
    this.billing.streetAddress = registration.purchaserInfo.address.streetAddress;
    this.billing.extendedAddress = registration.purchaserInfo.address.extendedAddress;
    this.billing.locality = registration.purchaserInfo.address.city;
    this.billing.region = registration.purchaserInfo.address.state;
    this.billing.postalCode = registration.purchaserInfo.address.zip;

    this.options = {};
    this.options.submitForSettlement = true;

    this.customFields = {};
    this.customFields.ticketCount = registration.ticketInfo.quantity;
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
            purchaserEmail: registration.purchaserInfo.email,
            purchaserFirstName: registration.purchaserInfo.firstName,
            purchaserLastName: registration.purchaserInfo.lastName,
            totalAmount: accounting.formatMoney(registration.ticketInfo.totalAmount),
            transactionId: result.transaction.id,
            creditCardLast4: result.transaction.creditCard.last4,
            ticketQuantity: registration.ticketInfo.quantity
          },
          registrationEmailId
        )
        .then(() => {
          callback(null, {
            success: true,
            transactionId: result.transaction.id,
            creditCardLast4: result.transaction.creditCard.last4,
            totalAmount: result.transaction.amount
          });
        })
        .catch((error) => {
          //If the email fails, we still want to complete the registation.
          callback(null, {
            success: true,
            transactionId: result.transaction.id
          })
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