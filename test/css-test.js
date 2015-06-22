/*global __dirname*/
var _ = require('lodash'),
  express = require('express'),
  compileSass = require('../lib/index'),
  expect = require('unexpected'),
  sinon = require('sinon'),
  fs = require('fs-extra'),
  root = __dirname;

expect.installPlugin(require('unexpected-sinon'));
expect.installPlugin(require('unexpected-express'));

function getApp(options) {
    var app = express();

    app.use(compileSass(_.extend({
        root: root,
        watchFiles: false,
        logToConsole: true
    }, options)));

    app.use(express.static(root));

    return app;
}

function wait(ms) {
  return function (context) {
    return expect.promise(function (run) {
      setTimeout(run(function () {
        return context;
      }), ms);
    });
  };
}

describe('compile-sass', function () {
  it('should serve CSS unchanged', function () {
    var stub = sinon.stub(console, 'log');

    return expect(getApp(), 'to yield exchange', {
      request: {
        url: '/css/a.css'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: 'body{color:red;}\n'
      }
    }).then(function () {
      expect(stub, 'was not called');
    })
    .finally(stub.restore);
  });

  it('should serve SCSS compiled', function () {
    var stub = sinon.stub(console, 'log');

    return expect(getApp(), 'to yield exchange', {
      request: {
        url: '/scss/a.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: /^body h1 {\n  color: red; }\n/
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .finally(stub.restore);
  });

  it('should serve SCSS compiled with sourcemaps', function () {
    var stub = sinon.stub(console, 'log');

    return expect(getApp({
      sourceMap: true
    }), 'to yield exchange', {
      request: {
        url: '/scss/a.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: /^body h1 {\n  color: red; }\n\n\/\*# sourceMappingURL=data:application\/json;base64/
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .finally(stub.restore);
  });

  it('should serve an error stylesheet when the SCSS has a syntax error', function () {
    var stub = sinon.stub(console, 'log');

    return expect(getApp(), 'to yield exchange', {
      request: {
        url: '/scss/syntaxerror.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: expect.it('to match', /content: "express-compile-sass:\\00000a  Syntax error in \/scss\/syntaxerror\.scss:2(?::10)?\\00000aproperty "color" must be followed by a \\000027:\\000027";/)
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .finally(stub.restore);
  });

  it('should serve an error stylesheet when the SCSS has a missing import', function () {
    var stub = sinon.stub(console, 'log');

    return expect(getApp(), 'to yield exchange', {
      request: {
        url: '/missingimport/missingimport.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: expect.it('to match', /content: "express-compile-sass:\\00000a  Syntax error in \/missingimport\/missingimport\.scss:1:9\\00000afile to import not found or unreadable: missing\.scss\\00000aCurrent dir: .*?express-compile-sass\/test\/missingimport\/"/)
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .finally(stub.restore);
  });

  it('should not include source comments when sourceComments option is false', function () {
    return expect(getApp({
      sourceComments: false,
      logToConsole: false
    }), 'to yield exchange', {
      request: {
        url: '/scss/a.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: expect.it('to match', /^body h1 {\n  color: red; }\n/)
      }
    });
  });

  it('should include source comments when sourceComments option is true', function () {
    return expect(getApp({
      sourceComments: true,
      logToConsole: false
    }), 'to yield exchange', {
      request: {
        url: '/scss/a.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=UTF-8'
        },
        body: expect.it('to match', /^\/\* line 1, .*?\/scss\/a\.scss \*\/\nbody h1 {\n  color: red; }\n/)
      }
    });
  });

  describe('when watching files', function () {
    it('should return a 200 status code if ETag does not match', function () {
      var app = getApp({
        watchFiles: true,
        logToConsole: false
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function () {
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss'
          },
          response: 200
        });
      });
    });

    it('should return a 304 status code if ETag matches', function () {
      var app = getApp({
        watchFiles: true,
        logToConsole: false
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function (context) {
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss',
            headers: {
              'If-None-Match': context.res.get('etag')
            }
          },
          response: 304
        });
      });
    });

    describe('then updating a watched file', function () {
      it('should recompile and return 200 when updating the main file', function () {
        var app = getApp({
          watchFiles: true,
          logToConsole: false
        });

        return expect(app, 'to yield exchange', {
          request: 'GET /import-main/main.scss',
          response: 200
        })
        .then(wait(300)) // File watcher delay
        .then(function (context) {
          return expect.promise(function (run) {
            fs.utimes(root + '/import-main/main.scss', new Date(), new Date(), run(function () {
              return context;
            }));
          });
        })
        .then(wait(300)) // File watch trigger delay
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/import-main/main.scss',
              headers: {
                'If-None-Match': context.res.get('etag')
              }
            },
            response: 200
          });
        });
      });

      it('should recompile and return 200 when atomically updating the main file', function () {
        var app = getApp({
          watchFiles: true,
          logToConsole: false
        });

        return expect(app, 'to yield exchange', {
          request: 'GET /import-main-atomic/main.scss',
          response: 200
        })
        .then(wait(300)) // File watcher delay
        .then(function (context) {
          return expect.promise(function (resolve, reject) {
            fs.copySync(root + '/import-main-atomic/main.scss', root + '/import-main-atomic/main.scss.tmp');
            fs.renameSync(root + '/import-main-atomic/main.scss.tmp', root + '/import-main-atomic/main.scss');

            resolve(context);
          });
        })
        .then(wait(300)) // File watch trigger delay
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/import-main-atomic/main.scss',
              headers: {
                'If-None-Match': context.res.get('etag')
              }
            },
            response: 200
          });
        });
      });

      it('should recompile and return 200 when updating a dependency', function () {
        var app = getApp({
          watchFiles: true,
          logToConsole: false
        });

        return expect(app, 'to yield exchange', {
          request: 'GET /import-import/main.scss',
          response: 200
        })
        .then(wait(300)) // File watcher delay
        .then(function (context) {
          return expect.promise(function (run) {
            fs.utimes(root + '/import-import/import.scss', new Date(), new Date(), run(function () {
              return context;
            }));
          });
        })
        .then(wait(300)) // File watch trigger delay
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/import-import/main.scss',
              headers: {
                'If-None-Match': context.res.get('etag')
              }
            },
            response: 200
          });
        });
      });

      it('should recompile and return 200 when atomically updating a dependency', function () {
        var app = getApp({
          watchFiles: true,
          logToConsole: false
        });

        return expect(app, 'to yield exchange', {
          request: 'GET /import-import-atomic/main.scss',
          response: 200
        })
        .then(wait(300)) // File watcher delay
        .then(function (context) {
          return expect.promise(function (resolve, reject) {
            fs.copySync(root + '/import-import-atomic/import.scss', root + '/import-import-atomic/import.scss.tmp');
            fs.renameSync(root + '/import-import-atomic/import.scss.tmp', root + '/import-import-atomic/import.scss');

            resolve(context);
          });
        })
        .then(wait(300)) // File watch trigger delay
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/import-import-atomic/main.scss',
              headers: {
                'If-None-Match': context.res.get('etag')
              }
            },
            response: 200
          });
        });

      });
    });
  });

  describe('when not watching files', function () {
    it('should return a 200 status code if ETag does not match', function () {
      var app = getApp({
        watchFiles: false,
        logToConsole: false
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function () {
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss'
          },
          response: 200
        });
      });
    });

    it('should return a 200 status code if ETag matches', function () {
      var app = getApp({
        watchFiles: false,
        logToConsole: false
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function (context) {
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss',
            headers: {
              'If-None-Match': context.res.get('etag')
            }
          },
          response: 200
        });
      });
    });
  });
});
