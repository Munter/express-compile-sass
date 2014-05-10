var Path = require('path'),
    crypto = require('crypto'),
    fs = require('fs'),
    async = require('async'),
    _ = require('underscore'),
    passError = require('passerror');

require('express-hijackresponse');
require('bufferjs');

function leftPad(str, length, padChar) {
    str = String(str || '');
    while (str.length < length) {
        str = (padChar || ' ') + str;
    }
    return str;
}

function createCssStringLiteral(str) {
    return "'" + str.replace(/['\\\x00-\x1f]/g, function ($0) {
        return "\\" + leftPad($0.charCodeAt(0).toString(16), 6, '0');
    }) + "'";
}

module.exports = function compiless(options) {
    if (!options || !options.root) {
        throw new Error('options.root is mandatory');
    }
    var less = options.less || require('less');
    return function (req, res, next) {
        if (/\.less(?:\?.*)?$/.test(req.url)) {
            // Prevent If-None-Match revalidation with the downstream middleware with ETags that aren't suffixed with "-compiless":
            var ifNoneMatch = req.headers['if-none-match'];
            if (ifNoneMatch) {
                var validIfNoneMatchTokens = ifNoneMatch.split(" ").filter(function (etag) {
                    return /-compiless\"$/.test(etag);
                });
                if (validIfNoneMatchTokens.length > 0) {
                    req.headers['if-none-match'] = validIfNoneMatchTokens.join(" ");
                } else {
                    delete req.headers['if-none-match'];
                }
            }
            delete req.headers['if-modified-since']; // Prevent false positive conditional GETs after enabling compiless
            res.hijack(function (err, res) {
                var contentType = res.getHeader('Content-Type'),
                    matchContentType = contentType && contentType.match(/^text\/less(?:;\s*charset=([a-z0-9\-]+))?$/i);
                // The mime module doesn't support less yet, so we fall back:
                if (matchContentType || (/\.less(?:\?.*)?$/.test(req.url) && contentType === 'application/octet-stream')) {
                    function formatError(err) { // err can either be a string or an error object
                        if (typeof err === 'string') {
                            return err;
                        } else {
                            // Assume error object
                            return err.message + ('line' in err ? ' at line ' + err.line + ('column' in err ? ', column ' + err.column : '') : '') +
                                ('extract' in err ? ':\n' + err.extract.join('\n') : '');
                        }
                    }

                    function sendErrorResponse(err, cssText) {
                        var errorMessage = "express-compiless: Error compiling " + req.originalUrl + ":\n" + formatError(err);
                        res.removeHeader('Content-Length');
                        res.removeHeader('ETag');
                        res.setHeader('Content-Type', 'text/css');
                        res.send("body * {display: none !important;} body:before {line-height: 1.5; display: block; z-index: 99999999; white-space: pre; font-family: 'Courier New', monospace; font-size: 24px; color: black; margin: 10px; padding: 10px; border: 4px dashed red; margin-bottom: 10px; content: " + createCssStringLiteral(errorMessage) + "}\n" + (cssText || ''));
                    }

                    var chunks = [];
                    res.on('error', function () {
                        res.unhijack();
                        next();
                    }).on('data', function (chunk) {
                        chunks.push(chunk);
                    }).on('end', function () {
                        if (!chunks.length) {
                            return res.send(res.statusCode);
                        }
                        var lessText = Buffer.concat(chunks).toString('utf-8'), // No other charsets are really relevant, right?
                            baseDir = Path.resolve(options.root, req.url.replace(/\/[^\/]*(?:\?.*)?$/, '/').substr(1)),
                            isSeenByFileName = {},
                            lessOptions = {paths: [baseDir], relativeUrls: true},
                            parser = new less.Parser(lessOptions);

                        parser.parse(lessText, passError(sendErrorResponse, function (root) {
                            var importedFileNames = parser.imports && parser.imports.files ? Object.keys(parser.imports.files) : [],
                                statsByFileName = {};
                            async.eachLimit(importedFileNames, 10, function (importedFileName, cb) {
                                fs.stat(importedFileName, passError(cb, function (stats) {
                                    statsByFileName[importedFileName] = stats;
                                    cb();
                                }));
                            }, passError(sendErrorResponse, function () {
                                var oldETag = res.getHeader('ETag');
                                if (oldETag) {
                                    var etagFragments = [oldETag.replace(/^"|"$/g, '')];
                                    if (importedFileNames.length) {
                                        var importedFileStats = [];
                                        importedFileNames.sort().forEach(function (importedFileName) {
                                            var stats = statsByFileName[importedFileName];
                                            importedFileStats.push(importedFileName, String(stats.mtime.getTime()), String(stats.size));
                                        }, this);
                                        etagFragments.push(crypto.createHash('md5').update(importedFileStats.join('-')).digest('hex').substr(0, 16));
                                    }
                                    var newETag = '"' + etagFragments.join('-') + '-compiless"';
                                    res.setHeader('ETag', newETag);

                                    if (ifNoneMatch && ifNoneMatch.indexOf(newETag) !== -1) {
                                        return res.send(304);
                                    }
                                }

                                var rootCSS;
                                try {
                                    rootCSS = root.toCSS();
                                } catch (e) {
                                    return sendErrorResponse(e);
                                }

                                var cssText = importedFileNames.map(function (importedFileName) {
                                    return ".compilessinclude {background-image: url(" + Path.relative(baseDir, importedFileName) + "); display: none;}\n";
                                }).join("") + rootCSS;
                                res.setHeader('Content-Type', 'text/css');
                                res.setHeader('Content-Length', Buffer.byteLength(cssText));
                                res.end(cssText);
                            }));
                        }));
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
