require("dotenv").config();

const
    db = require('./db')
    , {findAndUpdate} = require('./hound')
    , searchExt = 'MP4'
    , {logAndExit} = require("./helpers")
    , transcoder = require("./transcode")
    , {removeStalledTranscodings} = require("./db")
    , args = require("args")
;

args
    .option('in', 'directory transcode videos from')
    .option('out', 'directory to transcode videos to')
    .option('allow-versions', 'creates a file version if output file does already exist')
;

const flags = args.parse(process.argv);
const d_in = flags.i;
const d_out = flags.o || d_in;

if (!d_in) {
    throw  new Error("missing 'in' flag");
}
if (!d_out) {
    throw  new Error("missing 'out' flag");
}
if (flags.allowVersions) {
    global.allowVersions = true
}

(async function () {
    //init sqlite
    await db.init()
        .catch(logAndExit(1));

    //remove videos that started to transcode and did not finish for some reason
    await removeStalledTranscodings();

    //initially search fs for videos
    await findAndUpdate([d_in], searchExt)
        .catch(logAndExit(2));

    //start transcoder
    transcoder.schedule(d_out).next()
})();
