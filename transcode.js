const
    db = require("./db")
    , ffmpeg = require('fluent-ffmpeg')
    , path = require("path")
    , fs = require("fs")
    , debug = require("debug")('videory:transcode')
    , assert = require("assert")
;

/**
 * trnascode given videos to given transcode directory
 * @param {[Object]} videos - array of video objects to transcode
 * @param {String} transcodeDir - directory to store the transcoded videos
 * @return {Promise<void>}
 */
async function transcodeAll(videos, transcodeDir) {
    for (let i = 0; i < videos.length; i++) {
        const movie = videos[i];
        await transcode(movie, transcodeDir)
            .catch(debug);
    }
}

/**
 * transcode single video
 * @param {Object} v - video
 * @param {String} transcodeDir - directory to store the transcoded videos
 * @return {Promise<any>}
 */
async function transcode(v, transcodeDir) {
    return new Promise(async (resolve, reject) => {

        const videoPath = path.resolve(v.path);
        const codec = process.env.CODEC || "hevc_nvenc";
        const crf = process.env.CRF || 23;
        const preset = process.env.PRESET || "veryfast";
        // const bitrate = process.env.BITRATE || 10e3;

        // const parsedBitrate = bitrate.match(/^(\d+)(k?)$/i);
        // assert.ok(parsedBitrate.length, `invalid bitrate: ${bitrate}`);
        // const factoredBitrateString = (factor = 1) => `${parseInt(parsedBitrate[1]) * factor}${parsedBitrate[2] || ""}`;

        if (!fs.existsSync(videoPath)) {
            console.warn(videoPath + " was about to be transcoded but cannot be located on filesystem. Video entry will be deleted from the DB.");
            await db.deleteMovie(v);
            return resolve();
        }

        const outPath = path.join(transcodeDir, "/", `${v.name}.${v.hash.substr(0, 5)}.${codec}.crf${crf}.${preset}.mp4`);

        const command = ffmpeg(fs.createReadStream(videoPath), {logger: console})
            .audioCodec('aac')
            .audioBitrate(192, true)
            .videoCodec(codec)
            // .addInputOption(`-tag:v hvc1`) // apple friendly
            .outputOptions(`-preset ${preset}`)
            .outputOptions(`-crf ${crf}`)
            .outputOptions(`-level ${crf}`)
            .outputOptions(`-tune film`)
            .outputOptions("-metadata", `comment="${v.path}"`)
            // .outputOptions("-g", Math.ceil(v.fps) * 2) // Use a 2 second GOP (Group of Pictures), so simply multiply your output frame rate * 2. For example, if your input is -framerate 30, then use -g 60.
            // .outputOptions("-maxrate", factoredBitrateString())
            // .outputOptions("-minrate", factoredBitrateString())
            // .outputOptions(`-bufsize ${factoredBitrateString(2)}`)
            .format("mp4")
            .size('1920x?')
            .on('error', async err => {
                console.error(err);
                await Promise.all([
                    v.setIsTrancoding(false, null, null, null, null),
                    v.setTranscodePath(null),
                    v.setFailed(err),
                ]);
                return reject(err);
            })
            .on('end', async () => {
                await Promise.all([
                    v.setIsTrancoding(false, codec, preset, crf, null),
                    v.setTranscodePath(outPath),
                ]);
                debug('Video file ' + videoPath + ' was transcoded to ' + outPath);
                return resolve(v);
            })
            .on('progress', p => {
                debug('Processing ', {
                    name: v.name,
                    path: v.path,
                    hash: v.hash,
                    progress: `${Math.round(100 / v.frames * p.frames * 100) / 100}%`,
                    ...p,
                });
            })
            .save(outPath)
        ;

        await v.setIsTrancoding(true, codec);

        debug("start transcoding " + v.hash + " to", outPath, "using", {codec, preset, crf},);
    })
}

/**
 * timesout for given amount of time and beginns transcoding unprocessed videos from db. Restarts itself when done transcoding.
 * @param {String} transcodeDir - output directory to save the transcoded videos
 * @param {Number} ms - timeout period before restarting the
 */
function timeoutAndTranscodeAll(transcodeDir, ms) {
    setTimeout(async () => {
        const videos = await db.findNotTranscoded();
        await transcodeAll(videos, transcodeDir);
        debug("restarting scheduler in " + ms + "ms");
        timeoutAndTranscodeAll(transcodeDir, ms);
    }, ms);
}

/**
 * query untranscoded videos from db and start transcoding. Restart when done
 * @param {String} transcodeDir - directory to save transcoded videos
 */
function* schedule(transcodeDir) {
    const timeoutMs = 10000;
    yield timeoutAndTranscodeAll(transcodeDir, timeoutMs);
}

module.exports.schedule = schedule;