/* jshint node: true */
'use strict';

var CouchbaseIndexAdapter = require("./lib/couchbase.js");

module.exports = {
  name: 'ember-cli-deploy-couchbase'

  createDeployPlugin: function(options) {
    return {
    };
  }
};
