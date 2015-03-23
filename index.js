/* jshint node: true */
'use strict';

var CouchbaseIndexAdapter = require("./lib/couchbase.js");

module.exports = {
  name: 'ember-deploy-couchbase',
  type: 'ember-deploy-addon',

  adapters: {
    index: {
      'couchbase': CouchbaseIndexAdapter
    }
  }
};
