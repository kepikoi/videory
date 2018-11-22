const
    db = require("./db")
    , ffmpeg = require('easy-ffmpeg')
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

        if (!fs.existsSync(videoPath)) {
            console.warn(videoPath + " was about to be transcoded but cannot be located on filesystem. Video entry will be deleted from the DB.");
            await db.deleteMovie(v);
            return resolve();
        }

        const
             outPath = path.join(transcodeDir,"/", v.hash + "_" + v.name + ".avi")
        ;
        await v.setIsTrancoding();

        debug("start transcoding " + v.hash + " to", outPath);

        const command = ffmpeg(fs.createReadStream(videoPath))
            .audioCodec('ac3_fixed')
            .audioBitrate(128)
            .videoCodec('libx264')
            .format("mov")
            .size('1920x?')
            .on('error', async err => {
                console.error(err);
                await Promise.all([
                    v.setIsTrancoding(false),
                    v.setTranscodePath(null)
                ]);
                return reject(err);
            })
            .on('end', async () => {
                await Promise.all([
                    await v.setIsTrancoding(false),
                    await v.setTranscodePath(outPath)
                ]);
                debug('Video file ' + videoPath + ' was transcoded to ' + outPath);
                return resolve(v);
            })
            .save(outPath)
        ;
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