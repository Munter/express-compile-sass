/*global __dirname*/
var express = require('express'),
    request = require('supertest'),
    compileSass = require('../lib/index'),
    app = express(),
    root = __dirname;

app.use(compileSass({
    root: root
}));
app.use(express.static(root));

describe('compile-sass', function () {
    it('should serve CSS unchanged', function (done) {
        request(app)
            .get('/css/a.css')
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect(200)
            .expect('body{color:red;}\n', done);
    });

    it('should serve SCSS compiled', function (done) {
        request(app)
            .get('/scss/a.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect('body h1 {\n  color: red; }\n', done);
    });

    it('should serve an error stylesheet when the SCSS has a syntax error', function (done) {
        request(app)
            .get('/scss/syntaxerror.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect(function (res) {
                return res.text.indexOf('syntaxerror') === -1;
            })
            .end(done);
    });

    it('should return a 304 status code if ETag matches', function (done) {
        request(app)
            .get('/scss/a.scss')
            .end(function (err, res) {
                request(app)
                    .get('/scss/a.scss')
                    .set('If-None-Match', res.get('etag'))
                    .expect(304)
                    .end(done);
            });
    });

    it('should return a 200 status code if ETag does not match', function (done) {
        request(app)
            .get('/scss/a.scss')
            .end(function (err, res) {
                request(app)
                    .get('/scss/a.scss')
                    .set('If-None-Match', res.get('etag') + 'foo')
                    .expect(200)
                    .end(done);
            });
    });
});
