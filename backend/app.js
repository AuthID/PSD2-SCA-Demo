const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const apiRouter = require('./api');

const app = express();

app.set('trust proxy', '1');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'build', 'PROD')));

app.use('/', apiRouter);

// catch 404 and forward to error handler
app.use((req, res, _next) => {
    res.status(404);
    res.send('');
});

// error handler
app.use((err, req, res, _next) => {
    // render the error page
    res.status(err.status || 500);
    res.send(err.message);
});

module.exports = app;
