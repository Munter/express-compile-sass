/*global __dirname*/
var compileSass = require('../lib/index');
var expect = require('unexpected')
  .clone()
  .use(require('unexpected-express'));

var root = __dirname;

describe('File watching', function () {

    it('should serve files fast when not watching files', function () {
        var start = Date.now();

        var middleware = compileSass({
            root: root,
            watchFiles: false,
            logToConsole: false
        });

        return expect(middleware, 'to yield exchange', {
            request: '/manyfiles/main.scss'
        })
        .then(function () {
            expect(Date.now() - start, 'to be less than', 200);
        });
    });

    it('should serve files fast when watching files', function () {
        var start = Date.now();

        var middleware = compileSass({
            root: root,
            watchFiles: true,
            logToConsole: false
        });

        return expect(middleware, 'to yield exchange', {
            request: '/manyfiles/main.scss'
        })
        .then(function () {
            middleware.close();
            expect(Date.now() - start, 'to be less than', 1100);
        });
    });
});
