var CoreObject  = require('core-object'),
    RSVP        = require('rsvp'),
    couchbase   = require('couchbase'),
    chalk       = require('chalk'),
    Promise     = require('ember-cli/lib/ext/promise'),
    SilentError = require('silent-error');

var DEFAULT_MANIFEST_SIZE   = 10;
var DEFAULT_TAGGING_ADAPTER = 'sha';

var green = chalk.green;
var white = chalk.white;
var red   = chalk.red;

module.exports = CoreObject.extend({
  init: function(options) {
    var self = this;
    var host = options.readConfig('host'),
        bucketName = options.readConfig('bucketName');

    if (!host) {
      throw new SilentError("You have to pass in a host");
    }

    if (!bucketName) {
      throw new SilentError("You have to pass in a bucketName");

    self.config = {host: host, bucketName: bucketName};
    self.manifestSize = self.manifestSize || DEFAULT_MANIFEST_SIZE;
    self.client = self._setupCouchbaseConnection(self.config, function(err) {
      if (err) {
        return self._printErrorMessage(red(err.message));
      }
    });
  },

  upload: function(indexHTMLContents) {
    var self = this,
        key  = self.taggingAdapter.createTag();

    return self._upload(indexHTMLContents, key);
  },

  list: function() {
    var self = this;
    return new RSVP.Promise(function(resolve, reject) {
      self.client.get(self._manifestKey(), function(err, res) {
        if (err) {
          if (err.code === 13) {
            self._printErrorMessage(self._manifestNotFoundMessage(self._manifestKey()));
          } else {
            self._printErrorMessage(err.message);
          }
          reject();
        } else {
          var manifestDoc = res.value,
              revisions   = manifestDoc[self._revisionsKey()],
              current     = manifestDoc[self._currentKey()];
          self._printSuccessMessage(self._revisionListMessage(revisions, current));
          resolve();
        }
      });
    });
  },

  activate: function(revisionKey) {
    var self = this;

    if (!revisionKey) {
      return self._printErrorMessage(self._noRevisionPassedMessage());
    }

    var uploadKey = this._currentKey();
    return new RSVP.Promise(function(resolve, reject) {
      self.client.get(self._manifestKey(), function(err, res) {
        if (err) {
          self._printErrorMessage(self._manifestNotFoundMessage(self._manifestKey()));
          return reject();
        } else {
          var manifestDoc = res.value;
          manifestDoc[self._currentKey()] = revisionKey;
          self.client.upsert(self._manifestKey(), manifestDoc, function(err, res) {
            if (err) {
              self._printErrorMessage(self._activationFailureMessage());
              return reject();
            } else {
              self._printSuccessMessage(self._activationSuccessfulMessage());
              return resolve();
            }
          });
        }
      });
    });
  },

  // Private methods
  _setupCouchbaseConnection: function(config, next) {
    return new couchbase.Cluster(config.host).openBucket(config.bucketName, next);
  },

  _upload: function(value, key) {
    return this._uploadIfNotAlreadyInManifest(value, key)
      .then(this._deploySuccessMessage.bind(this, key))
      .then(this._printSuccessMessage.bind(this))
      .then(function() { return key; })
      .catch(function(error) {
        if (error) {
          console.log(error);
        }

        return this._printErrorMessage(this._deployErrorMessage(key));
      }.bind(this));
  },

  _ensureManifestExists: function(next) {
    var self = this;
    self.client.get(self._manifestKey(), function(err, res) {
      if (res) {
        self.manifestDoc = res.value;
      } else {
        self.manifestDoc = self._blankManifest()
      }
      next();
    });
  },

  _uploadIfNotAlreadyInManifest: function(value, key) {
    var self = this;
    return new RSVP.Promise(function(resolve, reject) {
      self._ensureManifestExists(function() {
        if (self.manifestDoc[self._revisionsKey()].indexOf(key) === -1) {
          self.client.insert(key, { content: value.toString() }, function(err, res) {
            if (err) {
              self._printErrorMessage(err.message);

              self._updateManifest(key);
              self._cleanUpManifest();
            } else {
              self._updateManifest(key);
              self._cleanUpManifest();
            }
            self._uploadManifest(function(success) {
              if (success) {
                return resolve();
              } else {
                return reject();
              }
            });
          });
        } else {
          reject();
        }
      });
    });
  },

  _blankManifest: function() {
    var self = this,
        manifest = {};
    manifest[self._currentKey()] = "";
    manifest[self._revisionsKey()] = [];
    return manifest;
  },

  _updateManifest: function(key) {
    var self = this;
    return self.manifestDoc[self._revisionsKey()].unshift(key);
  },

  _cleanUpManifest: function() {
    var self = this;
    self.manifestDoc[self._revisionsKey()].splice(self.manifestSize)
  },

  _uploadManifest: function(next) {
    var self = this;

    self.client.upsert(self._manifestKey(), self.manifestDoc, function(err, res) {
      if (err) {
        self._printErrorMessage("There was a problem creating the manifest document.");
        next(false);
      } else {
        next(true);
      }
    });
  },

  _manifestKey: function() {
    return this.manifest + ":index.html:manifest";
  },

  _currentKey: function() {
    return 'current';
  },

  _revisionsKey: function() {
    return 'revisions';
  },

  _printSuccessMessage: function(message) {
    return this.ui.writeLine(message);
  },

  _printErrorMessage: function(message) {
    return this.ui.writeLine(message);
  },

  _deploySuccessMessage: function(revisionKey) {
    var success       = green('\nUpload of `' + revisionKey +'` successful!\n\n');
    var uploadMessage = white('Uploaded revision: ')+green(revisionKey);

    return success + uploadMessage;
  },

  _deployErrorMessage: function(revisionKey) {
    var failure    = '\nUpload `' + revisionKey + '` failed!\n';
    var suggestion = 'Did you try to upload an already uploaded revision?\n\n';
    var solution   = 'Please run `'+green('ember deploy:list')+'` to ' +
                     'investigate.';

    return failure + '\n' + white(suggestion) + white(solution);
  },

  _noRevisionPassedMessage: function() {
    var err = '\nError! Please pass a revision to `deploy:activate`.\n\n';

    return err + white(this._revisionSuggestion());
  },

  _activationSuccessfulMessage: function() {
    var success = green('\nActivation successful!\n\n');
    var message = white('Please run `'+green('ember deploy:list')+'` to see '+
                        'what revision is current.');

    return success + message;
  },

  _activationFailureMessage: function() {
    var failure = red("\nActivation unsuccessful!\n\n");
    var message = white("Please check your couchbase settings");
    return failure + message;
  },

  _revisionNotFoundMessage: function() {
    var err = '\nError! Passed revision could not be found in manifest!\n\n';

    return err + white(this._revisionSuggestion());
  },

  _revisionSuggestion: function() {
    var suggestion = 'Try to run `'+green('ember deploy:list')+'` '+
                     'and pass a revision listed there to `' +
                     green('ember deploy:activate')+'`.\n\nExample: \n\n'+
                     'ember deploy:activate --revision <manifest>:<sha>';

    return suggestion;
  },

  _revisionListMessage: function(revisions, currentRevision) {
    var manifestSize  = this.manifestSize;
    var headline      = '\nLast '+ manifestSize + ' uploaded revisions:\n\n';
    var footer        = '\n\n# => - current revision';
    var revisionsList = revisions.reduce(function(prev, curr) {
      var prefix = (curr === currentRevision) ? '| => ' : '|    ';
      return prev + prefix + green(curr) + '\n';
    }, '');

    return headline + revisionsList + footer;
  },

  _manifestNotFoundMessage: function(manifestKey) {
    var failure    = red('\nember-deploy-couchbase manifest (key: `' + this._manifestKey() + '`) not found.\n');
    var suggestion = 'Please check your couchbase configuration settings, or you have never previously uploaded a revision?\n\n';
    var solution   = 'Please run `'+green('ember deploy:index')+'` to automagically generate one.';

    return failure + '\n' + white(suggestion) + white(solution);
  }
});
