Express-compile-sass
====================

Express middleware that will compile any `.scss` or `.sass` files requested with `Accept: text/css` in the response stream and deliver the resulting CSS.
If syntax errors are encountered an error will be displayed very prominently in the browser, giving useful feedback on where to fix the problem.

This module requires node-sass to run, but it will only look for it when it actually encounters a file that needs to be compiled for the first time.
This leaves the installation of the node-sass dependency up to the individual user and lets tool makers use this middleware without introducting unneeded dependencies into projects that aren't using sass. An error message will inform the user of any missing node-sass installation.

Middleware Usage
----------------
``` javascript
var express = require('express'),
    app = express(),
    compileSass = require('express-compile-sass'),
    root = process.cwd();

app.use(compileSass(root), {
    strictType: false, // If true, will only compile when Accept heder includes text/css
    logToConsole: false // If true, will log to console.error on errors
});
app.use(express.static(root));

app.listen(5000);
console.log('Listening on port: 5000');
```

Browser Usage
-------------
``` html
<link rel="stylesheet" type="text/css" href="style/main.scss">
```


License
-------
MIT
