'use strict';

const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

const https = AWSXRay.captureHTTPs(require('https'));

const queryString = require('query-string');

module.exports.convert = (event, context, callback) => {
    console.log(JSON.stringify(event));

    const response = {
        statusCode: 202
    };

    const body = queryString.parse(event.body);

    const message = {
        id: event.requestContext.requestId,
        from: body.from,
        to: body.to,
        amount: parseFloat(body.amount)
    };

    const sqs = new AWS.SQS();

    const params = {
        QueueUrl: process.env.CONVERSIONS_QUEUE,
        MessageBody: JSON.stringify(message)
    };

    sqs.sendMessage(params)
        .promise()
        .then(() => callback(null, response))
        .catch(callback);
};

module.exports.orchestrate = (event, context, callback) => {
    const s3 = new AWS.S3();
    const sqs = new AWS.SQS();
    const lambda = new AWS.Lambda();

    const processConversion = conversionRequest => {
        lambda.invoke({
            FunctionName: process.env.PROCESS_CONVERSION_FUNCTION,
            InvocationType: 'RequestResponse',
            Payload: conversionRequest
        }, (err, result) => {
            if (err) {
                console.log(err);
                callback(err);
            } else {
                const conversion = JSON.parse(result.Payload);
                console.log(JSON.stringify(conversion));
                const params = {
                    Bucket: process.env.BUCKET_NAME,
                    Key: `${conversion.id}.json`,
                    ContentType: 'application/json',
                    Body: JSON.stringify(conversion)
                };

                s3.putObject(params, callback)
                    .promise()
                    .then(() => callback())
                    .catch(callback);
            }
        });
    };

    sqs.receiveMessage({QueueUrl: process.env.CONVERSIONS_QUEUE})
        .promise()
        .then(response => {
            if (response.Messages) {
                response.Messages
                    .map((msg) => msg.Body)
                    .forEach(processConversion);
                sqs.deleteMessageBatch({
                    QueueUrl: process.env.CONVERSIONS_QUEUE,
                    Entries: response.Messages.map((msg, idx) =>
                        ({Id: idx.toString(), ReceiptHandle: msg.ReceiptHandle}))
                }).promise()
                    .then(callback());
            } else {
                console.log('No messages');
                callback()
            }
        })
        .catch(callback);
};

module.exports.processConversion = (event, content, callback) => {
    const lambda = new AWS.Lambda();

    lambda.invoke({
        FunctionName: process.env.FETCH_RATES_FUNCTION,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(event)
    }, (err, response) => {
        if (err) {
            console.log(err);
            callback(err);
        } else {
            const conversion = JSON.parse(response.Payload);
            const converted = event.amount * conversion.rate;
            callback(null, Object.assign({}, event, {result: converted}));
        }
    })
};

module.exports.fetchRates = (event, content, callback) => {
    const options = {
        hostname: 'api.fixer.io',
        port: 443,
        path: `/latest?base=${event.from}&symbols=${event.to}`
    };

    https.get(options, (res) => {
        if (res.statusCode !== 200) {
            const error = `Request failed: ${res.statusCode}`;
            console.log(error);
            callback(new Error(error));
        } else {
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => rawData += chunk);
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    console.log(parsedData);
                    callback(null, {rate: parsedData.rates[event.to]});
                } catch (e) {
                    console.log(e.message);
                    callback(e);
                }
            });
        }
    }).on('error', (e) => {
        console.log(`Got error: ${e.message}`);
        callback(e);
    });
};

module.exports.persistToS3 = (event, context, callback) => {
    console.log(JSON.stringify(event));

    callback();
};
