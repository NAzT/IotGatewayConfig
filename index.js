'use strict';

process.env["NODE_CONFIG_DIR"] = __dirname + "/config/";

const cmd = require('node-command-line');
Promise = require('bluebird');
const apiVersion = "/api/v1/";
const noderedUrl = "http://localhost:1880/flows";
const noderedUrlAuth =  "http://localhost:1880/auth/token";
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');
const Hapi = require('hapi');
const basePath = __dirname;
const noderedFilePath = path.join(basePath, "/nodered.json");
const mqttFolder = path.join(basePath, "/mqtt");
const mqttConfigFolder = path.join(basePath, "/mqttConfig");
const amazonIotConfigFile = path.join(basePath, "/amazonIotConfig/config");
const amazonIotCertsFolder = path.join(basePath, "/amazonIotConfig/certs");
const request = require('request');
const config = require('config');
var noderedToken = "";

var noderedConfig = config.get('Nodered.adminConfig');

GetNooderedToken();

// Create a server with a host and port
console.log("Starting server");
const server = new Hapi.Server({  
  host: '0.0.0.0',
  port: 8000
});

// Add the route
server.route(
  {
    method: ['DELETE'],
    config: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        }
    },
    path: apiVersion + 'mqtt/config/delete/{f_name}',
    handler: function (request, reply) {
      if (fs.statSync(mqttFolder + "/" + request.params.f_name))
        {
          deleteMqttFile(request.params.f_name);
          RunUpdateMqttConfig();
          return "Done";
        }
        else
        {
          return "Failed";
        }
      }
  }
);

server.route(
  {
    method: ['GET', 'POST', 'PATCH'],
    config: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        }
    },
    path: apiVersion + 'mqtt/config',
    handler: function (request, reply) {
      const method = request.method
      const payload = request.payload
      var responseData = [];
      if (method === "post") {

        var files = fs.readdirSync(mqttFolder);

        if (files.length == 0)
        {
          payload.config["f_name"] = "1";
          writhMqttFile("1", payload.config)
        }
        else 
        {
          var lastFileName = files[files.length - 1];
          if (lastFileName != undefined && isNaN(lastFileName) == false)
          {
            var newFileName = parseInt(lastFileName);
            newFileName++;

            payload.config["f_name"] = newFileName.toString();

            writhMqttFile(newFileName, payload.config);
          }
          else 
          {
            payload.config["f_name"] = "1";
            writhMqttFile("1", payload.config);
          }
        }

        RunUpdateMqttConfig();
        return payload;

      }
      else if (method === "get") {

        var files = fs.readdirSync(mqttFolder);

        files.forEach(function(file) {

          if (file != ".DS_Store" && file != ".gitignore") {
            var content = fs.readFileSync(mqttFolder + '/' + file, "utf8");

            content = content.replace(/(?:\r\n|\r|\n)/g, '');

            responseData.push(content);            
          }
        });

        return JSON.stringify(responseData.reverse());
      }
      else if (method === "patch") {

        writhMqttFile(payload.config["f_name"], payload.config);

        RunUpdateMqttConfig();
        return payload;
      }
      else {
        return "Error";
      }
    },
  });


server.route(
  {
    method: ['GET'],
    config: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        }
    },
    path: apiVersion + 'amazonIot/config/recommend',
    handler: function (request, reply) {
      const method = request.method;
      const payload = request.payload;
        
      var recommendSetting = {}
      recommendSetting.aws_certs = amazonIotCertsFolder;


      var files = fs.readdirSync(amazonIotCertsFolder);

      if (files.length != 0)
      {
        files.forEach(function(file) {

          var fileStat = fs.statSync(path.join(amazonIotCertsFolder, file));

          if (file.indexOf("root-CA.crt") !== -1)
          {
            recommendSetting.rootCA = fileStat.mtime;
          }
          else if (file.indexOf(".cert.pem") !== -1)
          {
            recommendSetting.cert = fileStat.mtime;
          }
          else if (file.indexOf(".private.key") !== -1)
          {
            recommendSetting.privateKey = fileStat.mtime;
          }

        });
      }

      return recommendSetting;

    },
  });


server.route(
  {
    method: ['POST'],
    config: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        },
        payload: {
            output: 'file',
            allow: 'multipart/form-data',
        }
    },
    path: apiVersion + 'amazonIot/config/certs/{cert_name}',
    handler: function (request, reply) {

      var certName = request.params.cert_name;

      if (certName == "rootCA" || certName == "cert" || certName == "privateKey" && request.payload.cert.filename != '')
      {
        var certFilename = certName;

        if (certFilename == "rootCA")
        {
          certFilename = "root-CA.crt";
        }
        else if (certFilename == "cert")
        {
          certFilename = request.payload.cert.filename + ".cert.pem";
        }
        else if (certFilename == "privateKey")
        {
          certFilename = request.payload.cert.filename + ".private.key";
        }

        writhAmazonCertFile(certFilename, request.payload.cert);

        UpdateNodeRed();
        return "Done";
      }

      return "Failed";

    }
  });

server.route(
  {
    method: ['GET', 'PATCH'],
    config: {
        cors: {
            origin: ['*'],
            additionalHeaders: ['cache-control', 'x-requested-with']
        }
    },
    path: apiVersion + 'amazonIot/config',
    handler: function (request, reply) {
      const method = request.method
      const payload = request.payload
      var responseData = [];
      if (method === "post") {

        writhAmazonIotFile(payload.config);

        UpdateNodeRed();
        return payload;

      }
      else if (method === "get") {

        var content = fs.readFileSync(amazonIotConfigFile, "utf8");
        content = content.replace(/(?:\r\n|\r|\n)/g, '');

        return content;
      }
      else if (method === "patch") {
        writhAmazonIotFile(payload.config);

        UpdateNodeRed();
        return payload;
      }
      else {
        return "Error";
      }
    },
  });


var writhMqttFile = function(fileName, config)
{
  fileName = fileName.toString();
  fs.writeFileSync(path.join(mqttFolder, fileName),  JSON.stringify(config));
  fs.writeFileSync(path.join(mqttConfigFolder, "config_" + fileName + ".conf"),  configTemplete(config));
}

var deleteMqttFile = function(fileName)
{
  fileName = fileName.toString();
  fs.unlinkSync(mqttFolder + "/" + fileName);
  fs.unlinkSync(mqttConfigFolder + "/config_" + fileName + ".conf");
}

var writhAmazonIotFile = function(config)
{
  fs.writeFileSync(amazonIotConfigFile,  JSON.stringify(config));
}

var deleteAmazonIotFile = function()
{
  fs.unlinkSync(amazonIotConfigFile);
}

var writhAmazonCertFile = function(fileName, data)
{
  fs.renameSync(data.path, path.join(amazonIotCertsFolder, fileName))
}

var configTemplete = function(config) {

  var templete = "\
connection "+ config.connection +"\n\
address "+ config.address +"\n\
\n\
try_private true #static\n\
notifications true #static\n\
bridge_attempt_unsubscribe false #static\n\
cleansession true #static\n\
keepalive_interval 5 #static\n\
restart_timeout 30 #static\n\
\n\
#credentials \n\
remote_username "+ config.remote_username +"\n\
remote_password "+ config.remote_password +"\n\
#remote_clientid "+ config.remote_clientid +"\n\
\n\
#Topics to bridge\n\
topic "+ config.topic +"\n\
";

  return templete;
}

// Start the server
server.start((err) => {

  if (err) {
    throw err;
  }
  console.log('Server running at:', server.info.uri);
});

function GetNooderedToken() {

  if (noderedConfig.username == "" ||
      noderedConfig.password == "")
  {
    return;
  }

  var dataBody = {
        client_id: "node-red-admin",
        grant_type: "password",
        scope: "*",
        username: noderedConfig.username,
        password: noderedConfig.password,
      }

  request.post(
      {
        url: noderedUrlAuth, 
        form:dataBody
      }
    , 
    function optionalCallback(err, httpResponse, body) {

      if (err)
      {
        console.log("Error: " + err);
      }

      body = JSON.parse(body);

      noderedToken = body.access_token;

      setTimeout(function () {
        console.log('get token again');
        GetNooderedToken();
      }, body.expires_in)

    }
  );

}

var UpdateNodeRed = function() {
  request({
      url: noderedUrl, 
      headers: {
        'Content-type': 'application/json',
        'Authorization': 'Bearer ' + noderedToken,
      },
    }, 
    function (error, response, body) {
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    
    body = JSON.parse(body);

    for (var i = 0; i < body.length; i++)
    {
      if (body[i]['type'] == "aws-iot-device")
      {
        var readAmazonFile = fs.readFileSync(amazonIotConfigFile);
        readAmazonFile = JSON.parse(readAmazonFile);
        
        body[i]['clientId'] = readAmazonFile.client_id;
        body[i]['endpoint'] = readAmazonFile.endpoint;
        body[i]['awscerts'] = readAmazonFile.aws_certs;
      }
      else if (body[i]['type'] == "aws-mqtt out" || body[i]['type'] == "aws-mqtt in") 
      {
        body[i]['topic'] = readAmazonFile.topic;
      }
    }

    request.post(
      {
        url: noderedUrl, 
        body: JSON.stringify(body),
        headers: {
          'Content-type': 'application/json',
          'Node-RED-Deployment-Type': 'full',
          'Authorization': 'Bearer ' + noderedToken,
        },
      }, 
      function optionalCallback(err, httpResponse, body) {
        
        if (err) {
          return console.error('upload failed:', err);
        }
        console.log('Upload successful!  Server responded with:', body);

      }
    );

  });
}

function RunUpdateMqttConfig() {
  Promise.coroutine(function *() {
    yield cmd.run('sudo rsync --delete  -av /home/pi/IotGatewayConfig/mqttConfig/ /etc/mosquitto/bridges.d/');
    yield cmd.run('sudo service mosquitto restart');
    yield cmd.run('pm2 restart node-red');
    console.log('Executed command with sudo');
  })();
}