var compileSass = require('../lib/index'),
    expect = require('unexpected');

describe('API', function () {

    it('should throw if `root` option is missing', function () {
        expect(compileSass, 'to throw error', 'express-compile-sass: options.root is mandatory');
    });
});
