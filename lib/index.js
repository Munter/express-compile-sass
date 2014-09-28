/*global Buffer*/
var crypto = require('crypto'),
    Path = require('path'),
    fs = require('fs'),
    csserror = require('csserror');

require('express-hijackresponse');
require('bufferjs');

module.exports = function compileSass(options) {
    if (!options.root) {
        throw new Error('express-compile-sass: options.root is mandatory');
    }
    var sass;

    options = options || {};

    var sassFileMap = {};

    function watchImports(main, imports) {
        imports.forEach(function (path) {
            if (!Array.isArray(sassFileMap[path])) {
                sassFileMap[path] = [];

                fs.watch(path, function () {
                    sassFileMap[path].forEach(function (mainFile) {
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
        var isCss = req.headers && req.headers.accept && req.headers.accept.indexOf('text/css') !== -1;

        if ((isCss || !options.strictType) && /\.(?:scss|sass)(?:\?.*)?$/.test(req.url)) {
            if (!sass) {
                try {
                    sass = require('node-sass');
                } catch (e) {
                    var err = 'express-compile-sass: Unable to load the node-sass module. Please run `npm install --save node-sass`';

                    res.removeHeader('Content-Length');
                    res.removeHeader('ETag');
                    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                    res.send(csserror(err));
                    if (options.logToConsole) {
                        console.error(err);
                    }
                    return;
                }
            }

            // Prevent If-None-Match revalidation with the downstream middleware with ETags that aren't suffixed with "-compile-sass":
            var ifNoneMatch = req.headers['if-none-match'],
                validIfNoneMatchTokens;

            if (ifNoneMatch) {
                validIfNoneMatchTokens = ifNoneMatch.split(' ').filter(function (etag) {
                    return (/-compile-sass\"$/).test(etag);
                });

                if (validIfNoneMatchTokens.length > 0) {
                    req.headers['if-none-match'] = validIfNoneMatchTokens.join(' ');
                } else {
                    delete req.headers['if-none-match'];
                }
            }

            delete req.headers['if-modified-since']; // Prevent false positive conditional GETs after enabling compile-sass

            res.hijack(function (err, res) {
                var contentType = res.getHeader('Content-Type'),
                    matchContentType = contentType && contentType.match(/^text\/x-(?:scss|sass)(?:;\s*charset=([a-z0-9\-]+))?$/i),
                    chunks = [];

                function sendErrorResponse(err) {
                    var errorMessage = 'express-compile-sass:\n  Syntax error in ' + req.originalUrl + ' line ' + err.replace('source string:', '').replace(': error:', ':\n ');
                    res.removeHeader('Content-Length');
                    res.removeHeader('ETag');
                    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                    res.send(csserror(errorMessage));
                    if (options.logToConsole) {
                        console.error(errorMessage);
                    }
                }

                // The mime module doesn't support sass yet, so we fall back:
                if (matchContentType || (/\.(?:sass|scss)(?:\?.*)?$/.test(req.url) && contentType === 'application/octet-stream')) {
                    res.on('error', function () {
                        res.unhijack();
                        next();
                    }).on('data', function (chunk) {
                        chunks.push(chunk);
                    }).on('end', function () {
                        if (!chunks.length) {
                            return res.send(res.statusCode);
                        }
                        var sassText = Buffer.concat(chunks).toString('utf-8'); // No other charsets are really relevant, right?
                        var stats = {};

                        sass.render({
                            data: sassText,
                            includePaths: [options.root + '/'],
                            error: sendErrorResponse,
                            stats: stats,
                            success: function (cssText) {
                                watchImports(Path.join(options.root, req.url), stats.includedFiles);
                                res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                                res.setHeader('ETag', crypto.createHash('md5').update(cssText).digest('hex').substr(0, 16) + '-compile-sass');
                                res.setHeader('Content-Length', Buffer.byteLength(cssText));
                                res.end(cssText);
                            }
                        });
                    });
                } else {
                    res.unhijack(true);
                }
            });
            next();
        } else {
            next();
        }
    };
};
