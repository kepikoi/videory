const
    db = require("./db")
    , ffmpeg = require('fluent-ffmpeg')
    , path = require("path")
    , fs = require("fs")
    , debug = require("debug")('videory:transcode')
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
        const crf = process.env.CRF || 28;
        const preset = process.env.PRESET || "medium";
        const bitrate = process.env.BITRATE || 20e3;

        if (!fs.existsSync(videoPath)) {
            console.warn(videoPath + " was about to be transcoded but cannot be located on filesystem. Video entry will be deleted from the DB.");
            await db.deleteMovie(v);
            return resolve();
        }

        const
            outPath = path.join(transcodeDir, "/", `${v.name}.${codec}.crf${crf}.mp4`)
        ;
        const command = ffmpeg(fs.createReadStream(videoPath), {logger: console})
            .audioCodec('aac')
            .audioBitrate(192, true)
            .videoCodec(codec)
            .addInputOption(`-preset ${preset}`)
            .addInputOption(`-crf ${crf}`)
            .addInputOption(`-tag:v hvc1`) // apple friendly
            .outputOptions("-metadata", `comment="${v.path}"`)
            .videoBitrate(bitrate, true)
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
                    v.setIsTrancoding(false, codec, preset, crf, bitrate),
                    v.setTranscodePath(outPath),
                ]);
                debug('Video file ' + videoPath + ' was transcoded to ' + outPath);
                return resolve(v);
            })
            .on('progress', progress => {
                debug('Processing ', {
                    name: v.name,
                    path: v.path,
                    hash: v.hash,
                    ...progress
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