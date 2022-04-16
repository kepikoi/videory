import dotenv from "dotenv"
import args from "args"
import {findAndUpdate} from "./hound.js"
import {logAndExit, pause} from "./helpers.js"
import {schedule} from "./transcode.js"
import {removeStalledTranscodings, init} from "./db.js"
import logNode from"log-node";
logNode();

import PrettyError from "pretty-error"
const pe = new PrettyError()

const searchExt = ["MP4", "MOV"]

dotenv.config();

args
    .option("in", "directory transcode videos from")
    .option("out", "directory to transcode videos to")
    .option("allow-versions", "creates a file version if output file does already exist")
;

const flags = args.parse(process.argv);
const d_in = flags.i;
const d_out = flags.o || d_in;

if (!d_in) {
    throw pe.render(new Error("missing 'in' flag"));
}
if (!d_out) {
    throw pe.render(new Error("missing 'out' flag"));
}
if (flags.allowVersions) {
    global.allowVersions = true;
}

(async function () {
    //init sqlite
    await init()
        .catch(logAndExit(1));

    //remove videos that started to transcode and did not finish for some reason
    await removeStalledTranscodings();

    //initially search fs for videos
    await findAndUpdate([d_in], searchExt)
        .catch(logAndExit(2));

    //start transcoder
    while (true) {
        await schedule(d_out).next();
        await pause();
    }
})();
