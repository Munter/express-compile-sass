var crypto = require('crypto'),
    Path = require('path'),
    fs = require('fs'),
    Gaze = require('gaze').Gaze,
    csserror = require('csserror');

function compileSass(options) {
    if (!options.root) {
        throw new Error('express-compile-sass: options.root is mandatory');
    }

    var watchFiles = (options.watchFiles === false) ? false : true;
    var sass;

    options = options || {};

    var etagmap = {};
    var cache = {};
    var sassFileMap = {};

    function bustCache(path) {
        delete etagmap[path];
        delete cache[path];
    }

    var fileWatcher = new Gaze('', {
        debounceDelay: 1,
        cwd: options.root
    });

    fileWatcher.on('changed', function (path) {
        if (Array.isArray(sassFileMap[path])) {
            // A sass import was updated, trigger update on main file
            sassFileMap[path].forEach(function (mainFile) {
                bustCache(mainFile);

                // This is a hack.
                // Would be better to emit an event to the middleware communicating with the browser
                fs.utimes(mainFile, new Date(), new Date());
            });
        } else {
            // FIXME: This always triggers to late when others are file watching
            bustCache(path);
        }
    });

    function watchImports(main, imports) {
        if (!Array.isArray(imports)) {
            return;
        }

        imports.forEach(function (path) {
            fileWatcher.add(path);

            if (path !== main) {
                if (!Array.isArray(sassFileMap[path])) {
                    sassFileMap[path] = [];
                }

                if (sassFileMap[path].indexOf(main) === -1) {
                    sassFileMap[path].push(main);
                }
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

            var fileUrl = Path.join(Path.resolve(options.root), req.path);

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
                    includePaths: [Path.dirname(fileUrl), Path.resolve(options.root)],
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
}

module.exports = compileSass;
