/*global __dirname*/
var express = require('express'),
    request = require('supertest'),
    compileSass = require('../lib/index'),
    expect = require('unexpected'),
    root = __dirname;

describe('File watching', function () {

    it('should serve files fast when not watching files', function (done) {
        var app = express();

        app.use(compileSass({
            root: root,
            watchFiles: false,
            logToConsole: true
        }));

        var start = Date.now();

        request(app)
            .get('/manyfiles/main.scss')
            .end(function () {
                expect(Date.now() - start, 'to be less than', 30);
                done();
            });
    });

    it('should serve files fast when not watching files', function (done) {
        var app = express();

        app.use(compileSass({
            root: root,
            watchFiles: true,
            logToConsole: true
        }));

        var start = Date.now();

        request(app)
            .get('/manyfiles/main.scss')
            .end(function () {
                expect(Date.now() - start, 'to be less than', 30);
                done();
            });
    });
});
