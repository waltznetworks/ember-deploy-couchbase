# ember-deploy-couchbase

[ember-cli-deploy](https://github.com/ember-cli/ember-cli-deploy)
is an index-adapter for [Couchbase](http://www.couchbase.com). This
ember-cli addon lets you deploy your ember-cli app's
index.html to a couchbase server.

# How does it work?

First you must configure the addon using `config/deploy.json`. Here's
a sample config (note its missing configuration for an asset-adapter).

```
module.exports = {
  development: {
    buildEnv: 'development',
    store: {
      type: 'couchbase',
      host: 'couchbase://development.couchbase.server.local',
      bucketName: '<mybucketname>'
    },
  },

  production: {
    store: {
      type: 'couchbase',
      host: 'couchbase://production.couchbase.server.com',
      bucketName: '<mybucketname>'
    },
  }
}
```

When you do `ember deploy:index -e production`, it will 

* Upload the contents of the index.html to the key
`<project-name>:<sha>` as a doc `{ content: "<html>...." }`.
* Then it will update the manifest with details of the freshly
deployed index.html without activating it.

# What is a manifest

The aforementioned manifest is a doc stored in couchbase keyed by
`<project-name>:index.html:manifest`. It is of the form

```json
{
        current: "<project-name>:<sha>",
        revisions: ["<project-name>:<sha>", "<project-name>:<sha>", "<project-name>:<sha>"]
}
```

Currently you can override the manifest's revisions size, but it
defaults to `10`. What that means is that it keeps track of the last
10 deploys.

# How do I integrate it into my app/api server?

Here's a simple ExpressJS + Couchbase Node.js SDK example. Note it
uses GET parameter `index_key` to reference which `<sha>` version of
index.html to display.

## Express.js (v4.0.0)

```
  var express   = require("express"),
      couchbase = require("couchbase"),
      cbConfig  = { host: 'couchbase://127.0.0.1', bucketName: 'default' },
      cbClient  = new couchbase.Cluster(cbConfig.host),
      cbBucket  = cbClient.openBucket(cbConfig.bucketName, cbConfig.password, function(err) {
        if (err) {
          console.log("Error connecting to bucket!");
        } else {
          console.log("Connected to bucket!");
        }
      });

  var app = express();

  app.get("/", function(req, res) {
    // Send back index.html
    var projectName = "my-express-project";
    var indexKey = req.query.index_key;
    var manifestKey = projectName + ":index.html:manifest";

    cbBucket.get(manifestKey, function(err, manifestDoc) {
      if (err) {
        console.log(manifestKey + " not found!");
        res.status(200).send("BRB");
      } else {
        var indexDocKey = null;

        if (indexKey) {
          indexDocKey = projectName + ":" + indexKey;
        } else {
          indexDocKey = manifestDoc.value.current;
        }

        console.log("Serving version `" + indexDocKey + "`");
        cbBucket.get(indexDocKey, function(err, indexDoc) {
          if (err) {
            console.log(indexDocKey + " not found!");
            res.status(200).send("Check yo self, before you wreck yoself!");
          } else {
            res.status(200).send(indexDoc.value.content);
          }
        });
      }
    });
  });

  app.listen(3000);
```

# Tests

This has been tested with Node.js v0.10.25, Couchbase v3.0.1,
ExpressJS v4.12.3
