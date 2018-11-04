const
    express = require('express')
    , app = express()
    , db = require('./db')
    , {findAndUpdate, watchDir} = require('./hound')
    , path = require('path')
    , searchDir = path.join('C:', 'Users', 'autod', 'OneDrive', 'Dokumente', 'videory test videos')
    , searchExt = 'MP4'
    , port = process.env.PORT || 3000
    , api = require('./routes/api')
    , debug = require("debug")('videory:server')
    , {logAndExit} = require("./helpers")
    , transcoder = require("./transcode")
;


(async function () {
    //init sqlite
    await db.init()
        .catch(logAndExit(1));

    //initially search fs for videos
    await findAndUpdate(searchDir, searchExt)
        .catch(logAndExit(2));

    // watch fs for changes
    watchDir(searchDir, searchExt)
        .catch(logAndExit(3));

    //enable api
    app.use('/api', api);

    //start server
    app.listen(port, () => debug(` server listening on port ${port}`));

    //start transcoder
    transcoder.schedule()
})();
