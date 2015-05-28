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
    .then(stub.restore);
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
        body: /^body h1 {\n  color: red; }\n\n\/\*# sourceMappingURL=data:application\/json;base64/
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .then(stub.restore);
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
        body: expect.it('to match', /content: "express-compile-sass:\\00000a  Syntax error in \/scss\/syntaxerror\.scss line 2:undefined\\00000aproperty "color" must be followed by a \\000027";/)
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .then(stub.restore);
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
          request: 'GET /scss/a.scss',
          response: 200
        })
        .then(function (context) {
          return expect.promise(function (run) {
            fs.utimes(root + '/scss/a.scss', new Date(), new Date(), run(function () {
              return context;
            }));
          });
        })
        .then(wait(800)) // Why is this needed? :(
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

      it('should recompile and return 200 when atomically updating the main file', function () {
        var app = getApp({
          watchFiles: true,
          logToConsole: false
        });

        return expect(app, 'to yield exchange', {
          request: 'GET /singleimport/main.scss',
          response: 200
        })
        .then(function (context) {
          return expect.promise(function (resolve, reject) {
            fs.copySync(root + '/singleimport/main.scss', root + '/singleimport/main.scss.tmp');
            fs.renameSync(root + '/singleimport/main.scss.tmp', root + '/singleimport/main.scss');

            resolve(context);
          });
        })
        .then(wait(800)) // Why is this needed? :(
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/singleimport/main.scss',
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
          request: 'GET /singleimport/main.scss',
          response: 200
        })
        .then(function (context) {
          return expect.promise(function (run) {
            fs.utimes(root + '/scss/import.scss', new Date(), new Date(), run(function () {
              return context;
            }));
          });
        })
        .then(wait(400)) // Why is this needed? :(
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/singleimport/main.scss',
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
          request: 'GET /singleimport/main.scss',
          response: 200
        })
        .then(function (context) {
          return expect.promise(function (resolve, reject) {
            fs.copySync(root + '/singleimport/import.scss', root + '/singleimport/import.scss.tmp');
            fs.renameSync(root + '/singleimport/import.scss.tmp', root + '/singleimport/import.scss');

            resolve(context);
          });
        })
        .then(wait(200)) // Why is this needed? :(
        .then(function (context) {
          return expect(app, 'to yield exchange', {
            request: {
              url: '/singleimport/main.scss',
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
