var crypto = require('crypto'),
    Path = require('path'),
    fs = require('fs'),
    Gaze = require('gaze').Gaze,
    chalk = require('chalk'),
    csserror = require('csserror');

var inlineSourceMapComment = require('inline-source-map-comment');

function compileSass(options) {
    options = options || {};

    if (!options.root) {
        throw new Error('express-compile-sass: options.root is mandatory');
    }

    var watchFiles = (options.watchFiles === false) ? false : true;
    var sass;

    var etagmap = {};
    var cache = {};
    var sassFileMap = {};

    function log() {
        if (options.logToConsole) {
            console.log.apply(console, arguments);
        }
    }

    function bustCache(path) {
        delete etagmap[path];
        delete cache[path];
    }

    function fileChanged(path) {
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
    }

    var fileWatcher = new Gaze('', {
        debounceDelay: 1,
        cwd: options.root
    });

    fileWatcher.on('all', function (event, path) {
        if (event === 'deleted' || event === 'renamed') {
            // OSX combined with editors that do atomic file replacements
            // will not emit 'change' events: https://github.com/joyent/node/issues/2062
            // Remove the file watch and assume it will be re-added when the main file is requested again
            this.remove(path);
            fileChanged(path);
            delete sassFileMap[path];
            return;
        }

        if (event === 'changed') {
            fileChanged(path);
        }
    });

    function watchImports(main, imports) {
        if (!Array.isArray(imports)) {
            return;
        }

        var importsToWatch = [main];

        imports.forEach(function (path) {
            if (path !== main) {
                if (!Array.isArray(sassFileMap[path])) {
                    sassFileMap[path] = [];
                    importsToWatch.push(path);
                }

                if (sassFileMap[path].indexOf(main) === -1) {
                    sassFileMap[path].push(main);
                }
            }
        });

        fileWatcher.add(importsToWatch, function (error) {
            if (error) {
                log(chalk.red('Error setting up file watches'));
                log(chalk.red(error));
            } else {
                log('Watching sass @imports:\n\t', importsToWatch.join('\n\t'));
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
            var errStr = 'express-compile-sass:\n  Syntax error in ' + req.originalUrl + ':' + err.line;

            if (typeof err.column === 'number') {
              errStr += ':' + err.column;
            }

            errStr += '\n' + err.message;

            sendErrorResponse(errStr);
        }

        if (/\.(?:scss|sass)$/.test(req.path)) {
            if (!sass) {
                try {
                    sass = require('node-sass-evergreen');
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
                var start = Date.now();

                sass.render({
                    file: fileUrl,
                    outFile: fileUrl,
                    includePaths: [Path.dirname(fileUrl), Path.resolve(options.root)],
                    sourceComments: !!options.sourceComments,
                    sourceMap: !!options.sourceMap,
                    omitSourceMapUrl: !!options.sourceMap,
                    sourceMapContents: !!options.sourceMap
                }, function (err, result) {
                    if (err) {
                      return sassError(err);
                    }

                    log('Compile time:', (Date.now() - start) + 'ms', fileUrl);

                    var css = result.css.toString('utf8');

                    if (result.map) {
                      var comment = inlineSourceMapComment(result.map.toString('utf8'), {
                        block: true
                      });

                      css += '\n' + comment + '\n';
                    }

                    var etag = crypto.createHash('md5').update(css).digest('hex').substr(0, 16) + '-compile-sass';

                    res.setHeader('ETag', '"' + etag + '"');
                    res.end(css);

                    if (watchFiles) {
                        // Cache stuff, since file watches tells us when it expires
                        etagmap[fileUrl] = etag;
                        cache[fileUrl] = css;

                        watchImports(fileUrl, result.stats.includedFiles);
                    }
                });
            }
        } else {
            next();
        }
    };
}

module.exports = compileSass;
