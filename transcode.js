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
        await transcode(movie, transcodeDir);
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
            console.warn(videoPath + " was about to be transcoded but cannot be located on filesystem");
            return db.deleteMovie(v)
        }

        const transcodePath = `${path.join(transcodeDir, v.hash)}`;
        await v.setIsTrancoding();

        debug("start transcoding " + v.hash + " to", transcodePath);

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
                return reject(e);
            })
            .on('end', async () => {
                await Promise.all([
                    await v.setIsTrancoding(false),
                    await v.setTranscodePath(transcodePath)
                ]);
                debug('Video file ' + videoPath + ' was transcoded to ' + transcodePath);
                return resolve(v);
            })
            .save(path.join(__dirname, 'transcoded', v.hash + ".avi"))
        ;
    })
}

/**
 * query for not transcoded videos and start transcoding
 * @param {String} transcodeDir - directory to save transcoded videos
 */
module.exports.schedule = (transcodeDir) => {

    const s = 3000;

    async function schedule() {
        const videos = await db.findNotTranscoded();
        setTimeout(async () => {
            await transcodeAll(videos, transcodeDir);
            debug("restarting scheduler in "+s+"ms");
            schedule();
        }, s);
    }

    schedule();
};