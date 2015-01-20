/*global __dirname*/
var _ = require('lodash'),
    express = require('express'),
    request = require('supertest'),
    compileSass = require('../lib/index'),
    expect = require('unexpected'),
    sinon = require('sinon'),
    root = __dirname;

expect.installPlugin(require('unexpected-sinon'));

function getApp(options) {
    var app = express();

    app.use(compileSass(_.extend({
        root: root,
        sourcemap: false,
        watchFiles: false,
        logToConsole: true
    }, options)));

    app.use(express.static(root));

    return app;
}

describe('compile-sass', function () {
    it('should serve CSS unchanged', function (done) {
        var stub = sinon.stub(console, 'log');

        request(getApp())
            .get('/css/a.css')
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect(200)
            .expect('body{color:red;}\n')
            .end(function () {
                expect(stub, 'was not called');
                stub.restore();
                done();
            });
    });

    it('should serve SCSS compiled', function (done) {
        var stub = sinon.stub(console, 'log');

        request(getApp())
            .get('/scss/a.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect('body h1 {\n  color: red; }\n')
            .end(function () {
                expect(stub, 'was called twice');
                stub.restore();
                done();
            });
    });

    it('should serve an error stylesheet when the SCSS has a syntax error', function (done) {
        var stub = sinon.stub(console, 'log');

        request(getApp())
            .get('/scss/syntaxerror.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect(function (res) {
                return res.text.indexOf('syntaxerror') === -1;
            })
            .end(function () {
                expect(stub, 'was called twice');
                stub.restore();
                done();
            });
    });

    describe('when watching files', function () {
        it('should return a 200 status code if ETag does not match', function (done) {
            var app = getApp({
                watchFiles: true
            });
            var stub = sinon.stub(console, 'log');

            request(app)
                .get('/scss/a.scss')
                .expect(200)
                .end(function (err, res) {
                    expect(stub, 'was called times', 2);
                    expect(stub.getCall(0), 'to match', /Compiling sass file/);
                    expect(stub.getCall(1), 'to match', /Compile time/);

                    setTimeout(function () {
                        expect(stub, 'was called times', 3);
                        expect(stub.getCall(2), 'to match', /Watching sass @imports/);

                        request(app)
                            .get('/scss/a.scss')
                            .set('If-None-Match', res.get('etag') + 'foo')
                            .expect(200)
                            .end(function () {
                                expect(stub, 'was called times', 4);
                                expect(stub.getCall(3), 'to match', /Server cache hit/);

                                stub.restore();
                                done();
                            });
                    }, 100);
                });
        });

        it('should return a 304 status code if ETag matches', function (done) {
            var app = getApp({
                watchFiles: true
            });
            var stub = sinon.stub(console, 'log');

            request(app)
                .get('/scss/a.scss')
                .expect(200)
                .end(function (err, res) {
                    expect(stub, 'was called times', 2);
                    expect(stub.getCall(0), 'to match', /Compiling sass file/);
                    expect(stub.getCall(1), 'to match', /Compile time/);

                    setTimeout(function () {
                        expect(stub, 'was called times', 3);
                        expect(stub.getCall(2), 'to match', /Watching sass @imports/);

                        request(app)
                            .get('/scss/a.scss')
                            .set('If-None-Match', res.get('etag'))
                            .expect(304)
                            .end(function () {
                                expect(stub, 'was called times', 4);
                                expect(stub.getCall(3), 'to match', /Browser cache hit/);

                                stub.restore();
                                done();
                            });
                    }, 100);
                });
        });
    });

    describe('when not watching files', function () {
        it('should recompile and return a 200 status code if ETag matches', function (done) {
            var app = getApp();
            var stub = sinon.stub(console, 'log');

            request(app)
                .get('/scss/a.scss')
                .expect(200)
                .end(function (err, res) {
                    expect(stub, 'was called times', 2);
                    expect(stub.getCall(0), 'to match', /Compiling sass file/);
                    expect(stub.getCall(1), 'to match', /Compile time/);

                    request(app)
                        .get('/scss/a.scss')
                        .set('If-None-Match', res.get('etag'))
                        .expect(200)
                        .end(function () {
                            expect(stub, 'was called times', 4);
                            expect(stub.getCall(2), 'to match', /Compiling sass file/);
                            expect(stub.getCall(3), 'to match', /Compile time/);

                            stub.restore();
                            done();
                        });
                });
        });


        it('should recompile and return a 200 status code if ETag does not match', function (done) {
            var app = getApp();
            var stub = sinon.stub(console, 'log');

            request(app)
                .get('/scss/a.scss')
                .expect(200)
                .end(function (err, res) {
                    expect(stub, 'was called times', 2);
                    expect(stub.getCall(0), 'to match', /Compiling sass file/);
                    expect(stub.getCall(1), 'to match', /Compile time/);

                    request(app)
                        .get('/scss/a.scss')
                        .set('If-None-Match', res.get('etag') + 'foo')
                        .expect(200)
                        .end(function () {
                            expect(stub, 'was called times', 4);
                            expect(stub.getCall(2), 'to match', /Compiling sass file/);
                            expect(stub.getCall(3), 'to match', /Compile time/);

                            stub.restore();
                            done();
                        });
                });
        });
    });

    it('should not include source comments when sourcemap option is false', function (done) {
        var app = getApp({
            sourcemap: false,
            logToConsole: false
        });

        request(app)
            .get('/scss/a.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect('body h1 {\n  color: red; }\n', done);
    });

    it('should include source comments when sourcemap option is true', function (done) {
        var app = getApp({
            sourcemap: true,
            logToConsole: false
        });

        request(app)
            .get('/scss/a.scss')
            .expect(200)
            .expect('Content-Type', 'text/css; charset=UTF-8')
            .expect('/* line 1, ' + root + '/scss/a.scss */\nbody h1 {\n  color: red; }\n', done);
    });
});
