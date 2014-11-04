var crypto = require('crypto'),
    Path = require('path'),
    fs = require('fs'),
    csserror = require('csserror');

module.exports = function compileSass(options) {
    if (!options.root) {
        throw new Error('express-compile-sass: options.root is mandatory');
    }

    var watchFiles = (options.watchFiles === false) ? false : true;
    var sass;

    options = options || {};

    var etagmap = {};
    var cache = {};
    var sassFileMap = {};

    function watchImports(main, imports) {
        if (!Array.isArray(imports)) {
            return;
        }

        imports.filter(function (path) {
            return path !== main;
        }).forEach(function (path) {
            if (!Array.isArray(sassFileMap[path])) {
                sassFileMap[path] = [];

                fs.watch(path, function () {
                    sassFileMap[path].forEach(function (mainFile) {
                        delete etagmap[mainFile];
                        delete cache[mainFile];
                        fs.utimes(mainFile, new Date(), new Date());
                    });
                });
            }

            if (sassFileMap[path].indexOf(main) === -1) {
                sassFileMap[path].push(main);
            }
        });
    }

    return function (req, res, next) {

        function sendErrorResponse(err) {
            res.removeHeader('Content-Length');
            res.removeHeader('ETag');
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
            if (options.logToConsole) {
                console.error(err);
            }
            res.end(csserror(err));
        }

        function sassError(err) {
            sendErrorResponse('express-compile-sass:\n  Syntax error in ' + req.originalUrl + ' line ' + err.replace('source string:', '').replace(': error:', ':\n '));
        }

        if (/\.(?:scss|sass)$/.test(req.path)) {
            if (!sass) {
                try {
                    sass = require('node-sass');
                } catch (e) {
                    return sendErrorResponse('express-compile-sass: Unable to load the node-sass module. Please run `npm install --save node-sass`');
                }
            }

            var fileUrl = Path.join(options.root, req.path);

            res.set({
                'Content-Type': 'text/css; charset=UTF-8',
                'ETag': '"' + etagmap[fileUrl] + '"'
            });

            if (req.fresh) {
                // Leverage browser cache
                res.sendStatus(304);
            } else if (cache[fileUrl]) {
                // Leverage server cache
                res.end(cache[fileUrl]);
            } else {
                // Compile sass
                var stats = {};

                sass.render({
                    file: fileUrl,
                    includePaths: [Path.dirname(fileUrl), options.root + '/'],
                    error: sassError,
                    stats: stats,
                    success: function (cssText) {
                        var etag = crypto.createHash('md5').update(cssText).digest('hex').substr(0, 16) + '-compile-sass';

                        if (watchFiles) {
                            watchImports(fileUrl, stats.includedFiles);

                            // Cache stuff, since file watches tells us when it expires
                            etagmap[fileUrl] = etag;
                            cache[fileUrl] = cssText;
                        }

                        res.setHeader('ETag', '"' + etag + '"');
                        res.end(cssText);
                    }
                });
            }
        } else {
            next();
        }
    };
};
