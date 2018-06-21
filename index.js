'use strict';

const path = require('path');
const fs = require('fs');
const Hapi = require('hapi');
const basePath = __dirname;
const mqttFolder = path.join(basePath, "/mqtt");
const mqttConfigFolder = path.join(basePath, "/mqttConfig");

// Create a server with a host and port
const server = new Hapi.Server({  
  host: 'localhost',
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
    path: '/api/v1/mqtt/config/delete/{f_name}',
    handler: function (request, reply) {
      if (fs.statSync(mqttFolder + "/" + request.params.f_name))
        {
          deleteFile(request.params.f_name);
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
    path: '/api/v1/mqtt/config',
    handler: function (request, reply) {
      const method = request.method
      const payload = request.payload
      var responseData = [];
      if (method === "post") {

        var files = fs.readdirSync(mqttFolder);

        if (files.length == 0)
        {
          payload.config["f_name"] = "1";
          writhFile("1", payload.config)
        }
        else 
        {
          var lastFileName = files[files.length - 1];
          if (lastFileName != undefined && isNaN(lastFileName) == false)
          {
            var newFileName = parseInt(lastFileName);
            newFileName++;

            payload.config["f_name"] = newFileName.toString();

            writhFile(newFileName, payload.config);
          }
          else 
          {
            payload.config["f_name"] = "1";
            writhFile("1", payload.config);
          }
        }

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

        writhFile(payload.config["f_name"], payload.config);

        return payload;
      }
      else {
        return "Error";
      }
    },
  });

var writhFile = function(fileName, config)
{
  fileName = fileName.toString();
  fs.writeFileSync(path.join(mqttFolder, fileName),  JSON.stringify(config));
  fs.writeFileSync(path.join(mqttConfigFolder, "config_" + fileName + ".conf"),  configTemplete(config));
}

var deleteFile = function(fileName)
{
  fileName = fileName.toString();
  fs.unlinkSync(mqttFolder + "/" + fileName);
  fs.unlinkSync(mqttConfigFolder + "/config_" + fileName + ".conf");
}

var configTemplete = function(config) {

  var templete = "\
    connection "+ config.connection +" \n\
    address "+ config.address +" \n\
    \n\
    try_private true #static \n\
    notifications true #static \n\
    bridge_attempt_unsubscribe false #static \n\
    cleansession true #static \n\
    keepalive_interval 5 #static \n\
    restart_timeout 30 #static \n\
    \n\
    #credentials \n\
    remote_username "+ config.remote_username +" \n\
    remote_password "+ config.remote_password +" \n\
    #remote_clientid "+ config.remote_clientid +" \n\
    \n\
    #Topics to bridge \n\
    topic "+ config.topic +" \n\
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