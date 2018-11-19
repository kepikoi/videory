const
    db = require("./db")
    , ffmpeg = require('easy-ffmpeg')
    , path = require("path")
    , debug = require("debug")('videory:transcode')
    , transcodeDir = path.join(__dirname, '/transcoded')
;

async function transcode(videos) {
    return await Promise.all(
        videos.map(async v => {
            const videoPath = path.resolve(v.path);
            const transcodePath = `${path.join(transcodeDir, v.hash)}`;
            await v.setIsTrancoding();
            debug("start transcoding " + v.hash + " to", transcodePath);

            const command = ffmpeg(videoPath)
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
                    ])
                })
                .on('end', async () => {
                    await Promise.all([
                        await v.setIsTrancoding(false),
                        await v.setTranscodePath(transcodePath)
                    ]);
                    debug('Video file transcoded: ' + videoPath);
                })
                .save(path.join(__dirname, 'transcoded', v.hash + ".avi"))
            ;
            //
            //
            // return new ffmpeg(videoPath)
            //     .then(p => p
            //         .setVideoSize('1920x?', true, true)
            //         //  .setVideoCodec('libx264')
            //         //.setAudioCodec("ac3_fixed")
            //         // .setAudioBitRate(128)
            //         //  .setVideoFormat("mov")
            //         .save(transcodePath, async (error, file) => {
            //             if (error) {
            //                 return console.error(error)
            //             }
            //             await v.setIsTrancoding(false);
            //             await v.setTranscodePath(transcodePath);
            //             debug('Video file transcoded: ' + file);
            //             return file;
            //         })
            //     )
            //     .catch(async e => {
            //         console.error(e);
            //         await v.setIsTrancoding(false);
            //         await v.setTranscodePath(null);
            //     })
            //     ;
        })
    );
}

module.exports.schedule = () => {
    setInterval(async () => {
            const videos = await db.findNotTranscoded();
            await transcode(videos);
        }, 2000
    );
};