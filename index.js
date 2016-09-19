/* jshint node: true */
'use strict';

var CouchbaseIndexAdapter = require("./lib/couchbase.js"),
    BasePlugin = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-couchbase'

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name;

      requiredConfig: ['host', 'bucketName'],

      upload: function(context) {
      }
    return new DeployPlugin();
  }
};
