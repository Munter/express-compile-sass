/*global __dirname*/
var extend = require('extend');
var Koa = require('koa');
var static = require('koa-static');
var compileSass = require('../lib/index');
var sinon = require('sinon');
var fs = require('fs-extra');

var expect = require('unexpected')
  .clone()
  .use(require('unexpected-sinon'))
  .use(require('unexpected-koa'));

var root = __dirname;

// Css custom assertion
var mensch = require('mensch');

function parseAndPrettyPrint(cssString) {
    return mensch.stringify(mensch.parse(cssString), {indentation: '  '});
}

expect.addAssertion('<string> to contain the same CSS as <string>', function (expect, subject, value) {
    expect(parseAndPrettyPrint(subject), 'to equal', parseAndPrettyPrint(value));
});

expect.addAssertion('<string> to contain an inline source map [exhaustively] satisfying <object>', function (expect, subject, value) {
    return expect(subject, 'to match', /(?:\/\*|\/\/)# sourceMappingURL=data:application\/json;base64,([^* ]*)/).spread(function ($0, base64Str) {
        return expect(JSON.parse(new Buffer(base64Str, 'base64').toString('utf-8')), 'to [exhaustively] satisfy', value);
    });
});


function getApp(options) {
    var app = new Koa();

    var middleware = compileSass(extend({
        root: root,
        watchFiles: false,
        logToConsole: true
    }, options));

    app.use(middleware);

    app.use(static(root));

    app.close = middleware.close;

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
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to contain the same CSS as', 'body{ color: red;}')
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
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to contain the same CSS as', 'body h1 { color: red; }')
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
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to contain the same CSS as', 'body h1 { color: red; }')
          .and('to contain an inline source map satisfying', {
            version: 3,
            file: 'a.scss',
            sources: [ 'a.scss' ],
            names: []
          })
      }
    })
    .then(function () {
      expect(stub, 'was called twice');
    })
    .finally(stub.restore);
  });

  it('should serve an error stylesheet when the SCSS has a syntax error', function () {
    var stub = sinon.spy(console, 'log');

    return expect(getApp(), 'to yield exchange', {
      request: {
        url: '/scss/syntaxerror.scss'
      },
      response: {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to contain', 'content: "express\\2d compile\\2d sass:\\a   Syntax error in \\2f scss\\2f syntaxerror\\2e scss:2:5\\a property \\22 color\\22  must be followed by a \\27 :\\27 "')
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
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to contain', 'content: "express\\2d compile\\2d sass:\\a   Syntax error in \\2f missingimport\\2f missingimport\\2e scss:1:1\\a File to import not found or unreadable: missing\\2e scss')
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
          'Content-Type': 'text/css; charset=utf-8'
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
          'Content-Type': 'text/css; charset=utf-8'
        },
        body: expect.it('to match', /^\/\* line 1, .*?\/scss\/a\.scss \*\/\nbody h1 {\n  color: red; }\n/)
      }
    });
  });

  describe('when watching files', function () {
    it('should return a 200 status code if ETag does not match', function () {
      var app = getApp({
        watchFiles: true,
        logToConsole: true
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function (context) {
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss'
          },
          response: 200
        });
      })
      .finally(app.close);
    });

    it('should return a 304 status code if ETag matches', function () {
      var app = getApp({
        watchFiles: true,
        logToConsole: true
      });

      return expect(app, 'to yield exchange', {
        request: 'GET /scss/a.scss',
        response: 200
      })
      .then(function (context) {
        console.log('etag match', context.httpResponse.headers.get('etag'));
        return expect(app, 'to yield exchange', {
          request: {
            url: '/scss/a.scss',
            headers: {
              'If-None-Match': context.httpResponse.headers.get('etag')
            }
          },
          response: 304
        });
      })
      .finally(app.close);
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
                'If-None-Match': context.httpResponse.headers.get('etag')
              }
            },
            response: 200
          });
        })
        .finally(app.close);
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
                'If-None-Match': context.httpResponse.headers.get('etag')
              }
            },
            response: 200
          });
        })
        .finally(app.close);
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
                'If-None-Match': context.httpResponse.headers.get('etag')
              }
            },
            response: 200
          });
        })
        .finally(app.close);
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
                'If-None-Match': context.httpResponse.headers.get('etag')
              }
            },
            response: 200
          });
        })
        .finally(app.close);
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
              'If-None-Match': context.httpResponse.headers.get('etag')
            }
          },
          response: 200
        });
      });
    });
  });
});
