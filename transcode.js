const
    db = require("./db")
    , ffmpeg = require('easy-ffmpeg')
    , path = require("path")
    , fs = require("fs")
    , debug = require("debug")('videory:transcode')
    , transcodeDir = path.join(__dirname, '/transcoded')
;

async function transcodeAll(videos) {
    for (let i = 0; i < videos.length; i++) {
        const movie = videos[i];
        await transcode(movie);
    }
}


/**
 * transcode single movie
 * @param {Object} v - movie
 * @return {Promise<any>}
 */
async function transcode(v) {
    return new Promise(async (resolve, reject) => {

        const videoPath = path.resolve(v.path);

        if (!fs.existsSync(videoPath)) {
            console.alert(videoPath + " was about to be transcoded but cannot be located on filesystem");
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

module.exports.schedule = () => {
    setInterval(async () => {
            const videos = await db.findNotTranscoded();
            await transcodeAll(videos);
        }, 2000
    );
};