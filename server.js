const
    db = require('./db')
    , {findAndUpdate, watchDir} = require('./hound')
    , path = require('path')
    , searchExt = 'MP4'
    , express = require('./express')
    , debug = require("debug")('videory:server')
    , {logAndExit} = require("./helpers")
    , transcoder = require("./transcode")
    , {getWatchDirs, getOutputDir, removeStalledTranscodings} = require("./db")

;

(async function () {
    //init sqlite
    await db.init()
        .catch(logAndExit(1));

    //remove videos that started to transcode and did not finish for some reason
    await removeStalledTranscodings();

    //enable api
    express.enable();

    const
        watchDirs = (await getWatchDirs()).map(w => w.path)
        , outputDir = (await getOutputDir()).outputpath
    ;

    //initially search fs for videos
    await findAndUpdate(watchDirs, searchExt)
        .catch(logAndExit(2));

    // watch fs for changes
    // watchDir(watchDirs, searchExt)
    //     .catch(logAndExit(3));

    //start transcoder
    transcoder.schedule(outputDir).next()
})();
