var express = require('express'),
    request = require('supertest'),
    compileSass = require('../lib/index'),
    app = express(),
    root = __dirname;

app.use(compileSass(root, {
    strictType: true
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

    it('should serve SCSS unchanged', function (done) {
        request(app)
            .get('/scss/a.scss')
            .expect(200)
            .expect('Content-Type', 'application/octet-stream')
            .expect('body{h1{color:red;}}\n', done);
    });

    it('should serve SCSS compiled when content-type is text/css', function (done) {
        request(app)
            .get('/scss/a.scss')
            .set('Accept', 'text/css')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect('body h1 {\n  color: red; }\n', done);
    });

    it('should serve an error stylesheet when the SCSS ha a syntax error', function (done) {
        request(app)
            .get('/scss/syntaxerror.scss')
            .set('Accept', 'text/css')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect(function (res) {
                return res.text.indexOf('syntaxerror') === -1;
            })
            .end(done);
    });
});
