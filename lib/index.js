var crypto = require('crypto'),
    Path = require('path'),
    fs = require('fs'),
    asyncEach = require('async-each'),
    Gaze = require('gaze').Gaze,
    chalk = require('chalk'),
    csserror = require('csserror');

function compileSass(options) {
    if (!options.root) {
        throw new Error('express-compile-sass: options.root is mandatory');
    }

    function log() {
        if (options.logToConsole) {
            console.log.apply(console, arguments);
        }
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
                log(path, 'was updated --> busting cache and updating', mainFile);
                bustCache(mainFile);

                // This is a hack.
                // Would be better to emit an event to the middleware communicating with the browser
                fs.utimes(mainFile, new Date(), new Date());
            });
        } else {
            // FIXME: This always triggers to late when others are file watching
            log(path, 'was updated, busting cache');
            bustCache(path);
        }
    });

    function watchImports(main, imports) {
        if (!Array.isArray(imports)) {
            return;
        }

        asyncEach(imports, function (path) {
            if (path !== main) {
                if (!Array.isArray(sassFileMap[path])) {
                    sassFileMap[path] = [];
                    fileWatcher.add(path, function (error) {
                        if (error) {
                            log(chalk.red('Error watching'), path);
                            log(chalk.red(error));
                        }
                    });
                    log('Watching sass @import:', path);
                }

                if (sassFileMap[path].indexOf(main) === -1) {
                    sassFileMap[path].push(main);
                }
            } else {
                fileWatcher.add(path, function (error) {
                    if (error) {
                        log(chalk.red('Error watching'), path);
                        log(chalk.red(error));
                    }
                });
                log('Watching sass file:', path);
            }
        }, function (error) {
            if (error) {
                log(new Error('Problem adding file watchers: ' + error.message));
            }
        });
    }

    return function (req, res, next) {

        function sendErrorResponse(err) {
            res.removeHeader('Content-Length');
            res.removeHeader('ETag');
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
            log(err);
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
                log(chalk.green('Browser cache hit:'), fileUrl);
                res.sendStatus(304);
            } else if (cache[fileUrl]) {
                // Leverage server cache
                log(chalk.cyan('Server cache hit:'), fileUrl);
                res.end(cache[fileUrl]);
            } else {
                // Compile sass
                log(chalk.yellow('Compiling sass file:'), fileUrl);
                var stats = {};

                sass.render({
                    file: fileUrl,
                    includePaths: [Path.dirname(fileUrl), Path.resolve(options.root)],
                    error: sassError,
                    stats: stats,
                    success: function (cssText) {
                        var etag = crypto.createHash('md5').update(cssText).digest('hex').substr(0, 16) + '-compile-sass';

                        res.setHeader('ETag', '"' + etag + '"');
                        res.end(cssText);

                        if (watchFiles) {
                            // Cache stuff, since file watches tells us when it expires
                            etagmap[fileUrl] = etag;
                            cache[fileUrl] = cssText;

                            watchImports(fileUrl, stats.includedFiles);
                        }
                    }
                });
            }
        } else {
            next();
        }
    };
}

module.exports = compileSass;
