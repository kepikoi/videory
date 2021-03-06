const
    db = require("./db")
    , path = require("path")
    , fs = require("fs")
    , debug = require("debug")("videory:transcode")
    , { checkFileExists } = require("./helpers")
    , Utimes = require("@ronomon/utimes")
    , ffmpg = require("dropconvert")
;

/**
 * trnascode given videos to given transcode directory
 * @param {[Object]} videos - array of video objects to transcode
 * @param {String} transcodeDir - directory to store the transcoded videos
 * @return {Promise<void>}
 */
async function transcodeAll (videos, transcodeDir) {
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
async function transcode (v, transcodeDir) {
    return new Promise(async (resolve, reject) => {
        
        const inputPath = path.resolve(v.path);
        const codec = process.env.CODEC || "libx264";
        const crf = process.env.CRF || 22;
        const preset = process.env.PRESET || "medium";
        
        const onError = async err => {
            console.error(err);
            await Promise.all([
                v.setIsTrancoding(false, null, null, null, null),
                v.setTranscodePath(null),
                v.setFailed(err),
            ]);
            return reject(err);
        };
        
        if (!fs.existsSync(inputPath)) {
            console.warn(`${inputPath} was about to be transcoded but cannot be located on filesystem. Video entry will be deleted from the DB.`);
            await db.deleteVideo(v);
            return resolve();
        }
        
        const defineOutPath = async (suffix = 0) => {
            let outputPath = path.join(transcodeDir, "/", `${v.name}.${v.hash.substr(0, 5)}.${codec}.crf${crf}.${preset}${suffix ? "-" + suffix : ""}.mp4`);
            
            const exists = await checkFileExists(outputPath);
            if (exists) {
                if (global.allowVersions) {
                    return defineOutPath(++suffix);
                }
                
                return onError(new Error(`Won't overwrite existing file under ${outputPath}`));
            }
            
            return outputPath;
        };
        
        const outputPath = await defineOutPath();
        
        const onEnd = async () => {
            await Promise.all([
                v.setIsTrancoding(false, codec, preset, crf, null),
                v.setTranscodePath(outputPath),
            ]);
            
            await new Promise((resolve, reject) => {
                fs.stat(inputPath, (err, stats) => {
                    if (err) {
                        return reject(err);
                    }
                    try {
                        const created = stats.ctime.getTime();
                        
                        return Utimes.utimes(outputPath, created, created, undefined, resolve);
                    } catch (e) {
                        return reject(e);
                    }
                });
            });
            
            debug("Video file " + inputPath + " was transcoded to " + outputPath);
            return resolve(v);
        };
        
        const onProgress = p => {
            debug("Processing ", {
                name: v.name,
                path: v.path,
                hash: v.hash,
                progress: `${Math.round(100 / v.frames * p.frames * 100) / 100} % `,
                ...p,
            });
        };
        
        ffmpg(inputPath, outputPath, { onProgress, onEnd, onError });
        
        await v.setIsTrancoding(true, codec);
        
        debug(`Start transcoding ${v.path} to ${outputPath} using`, { codec, preset, crf },);
    });
}

/**
 * timesout for given amount of time and beginns transcoding unprocessed videos from db. Restarts itself when done transcoding.
 * @param {String} transcodeDir - output directory to save the transcoded videos
 * @param {Number} ms - timeout period before restarting the
 */
function timeoutAndTranscodeAll (transcodeDir, ms) {
    setTimeout(async () => {
        const videos = await db.findNotTranscoded();
        await transcodeAll(videos, transcodeDir);
        debug(` Restarting scheduler in ${ms}ms`);
        timeoutAndTranscodeAll(transcodeDir, ms);
    }, ms);
}

/**
 * Query not transcoded videos from db and start transcoding. Restart when done
 * @param {String} transcodeDir - directory to save transcoded videos
 */
function * schedule (transcodeDir) {
    const timeoutMs = 10000;
    yield timeoutAndTranscodeAll(transcodeDir, timeoutMs);
}

module.exports.schedule = schedule;
