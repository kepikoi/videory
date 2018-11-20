const
    express = require('express')
    , app = express()
    , port = process.env.PORT || 3000
    , debug = require("debug")('videory:express')
;

module.exports.enable = () => {
    app.use('/api', require('./routes/api'));

    //start server
    app.listen(port, () => debug(` server listening on port ${port}`));
};