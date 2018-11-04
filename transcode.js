const
    db = require("./db")
    , ffmpeg = require("ffmpeg")
    , path = require("path")
    , debug = require("debug")('videory:transcode')
    , transcodeDir = path.join(__dirname, '/transcoded')
;

async function transcode(videos) {
    return await Promise.all(
        videos.map(v => {
            const videoPath = v.path;
            const transcodePath = `${path.join(transcodeDir, v.hash)}`;
            v.setIsTrancoding();
            return new ffmpeg(videoPath)
                .then(p => p
                    .setVideoSize('1920x?', true, true)
                    .setVideoCodec('libx264')
                    .setAudioCodec("ac3_fixed")
                    .setAudioBitRate(128)
                    .setVideoFormat("mov")
                    .save(transcodePath, async (error, file) => {
                        if (error) {
                            return console.error(error)
                        }
                        await v.setIsTrancoding(false);
                        await v.setTranscodePath(transcodePath);
                        debug('Video file transcoded: ' + file);
                        return file;
                    })
                );
        })
    );
}

module.exports.schedule = () => {
    setInterval(async () => {
            const videos = await db.findNotTranscoded();
            await transcode(videos);
        }, 5000
    );
};