Koa-compile-sass
====================
[![NPM version](https://badge.fury.io/js/koa-compile-sass.svg)](http://badge.fury.io/js/koa-compile-sass)
[![Build Status](https://travis-ci.org/swist/koa-compile-sass.svg?branch=master)](https://travis-ci.org/swist/koa-compile-sass)
[![Coverage Status](https://coveralls.io/repos/github/swist/koa-compile-sass/badge.svg?branch=master)](https://coveralls.io/github/swist/koa-compile-sass?branch=master)
<!-- [![Dependency Status](https://david-dm.org/Munter/express-compile-sass.svg)](https://david-dm.org/Munter/express-compile-sass) -->

Koa middleware that will compile any `.scss` or `.sass` files in the response stream and deliver the resulting CSS.
If syntax errors are encountered an error will be displayed very prominently in the browser, giving useful feedback on where to fix the problem.

This module requires node-sass to run, but it will only look for it when it actually encounters a file that needs to be compiled for the first time.
This leaves the installation of the node-sass dependency up to the individual user and lets tool makers use this middleware without introducing unneeded dependencies into projects that aren't using sass. An error message will inform the user of any missing node-sass installation.

Unless disabled, express-compile-sass will set up file watchers on every `.scss` file that has been compiled in the life time of the server, and update the `atime` and `mtime` of the main file that included the updated file. This lets you hook in file watching middlewares to notify the browser of any updates to the CSS.

The module will attempt to leverage both browser and server in-memory cache in order to reduce the sass compiling workload, thus giving you very fast responses on subsequent loads.

Middleware Usage
----------------
``` javascript
var Koa = require('koa'),
    static = require('koa-static'),
    app = new Koa(),
    compileSass = require('express-compile-sass'),
    root = process.cwd();

app.use(compileSass({
    root: root,
    sourceMap: true, // Includes Base64 encoded source maps in output css
    sourceComments: true, // Includes source comments in output css
    watchFiles: true, // Watches sass files and updates mtime on main files for each change
    logToConsole: false // If true, will log to console.error on errors
});
app.use(static(root));

app.listen(5000);
console.log('Listening on port: 5000');
```

Browser Usage
-------------
``` html
<link rel="stylesheet" type="text/css" href="style/main.scss">
```

Changelog
---------

**1.x**:
Ported express compile sass to work with koa


License
-------
MIT
