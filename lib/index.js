var crypto = require('crypto');

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
    return '"' + str.replace(/['\\\x00-\x2f]/g, function ($0) {
        return '\\' + leftPad($0.charCodeAt(0).toString(16), 6, '0');
    }) + '"';
}

module.exports = function compileSass(webRoot, options) {
    if (!webRoot) {
        throw new Error('express-compile-sass: webRoot is mandatory');
    }
    var sass,
        sassOptions = {

        };

    return function (req, res, next) {
        var isCss = req.headers && req.headers.accept && req.headers.accept.indexOf('text/css') !== -1;

        if (isCss && /\.(?:scss|sass)(?:\?.*)?$/.test(req.url)) {
            if (!sass) {
                try {
                    sass = require('node-sass');
                } catch (e) {
                    var err = 'express-compile-sass: Unable to load the node-sass module. Please run `npm install --save node-sass`';

                    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                    res.send('body * {display: none !important;} body:before {line-height: 1.5; display: block; z-index: 99999999; white-space: pre; font-family: "Courier New", monospace; font-size: 20px; color: black; margin: 10px; padding: 10px; border: 4px dashed red; margin-bottom: 10px; content: ' + createCssStringLiteral(err) + '}');
                    console.error(err);
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

                function sendErrorResponse(err, cssText) {
                    var errorMessage = 'express-compile-sass:\n  Syntax error in ' + req.originalUrl + ' line ' + err.replace('source string:', '').replace(': error:', ':\n ');
                    res.removeHeader('Content-Length');
                    res.removeHeader('ETag');
                    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                    res.send('body * {display: none !important;} body:before {line-height: 1.5; display: block; z-index: 99999999; white-space: pre; font-family: "Courier New", monospace; font-size: 20px; color: black; margin: 10px; padding: 10px; border: 4px dashed red; margin-bottom: 10px; content: ' + createCssStringLiteral(errorMessage) + '}\n' + (cssText || ''));
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

                        sass.render({
                            data: sassText,
                            error: sendErrorResponse,
                            success: function (cssText) {
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
