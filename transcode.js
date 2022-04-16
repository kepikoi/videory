import {deleteVideo, findNotTranscodedVideos} from "./db.js"
import path from "path"
import fs from "fs"
import {checkFileExists} from "./helpers.js";
import {utimes} from "utimes";
import ffmpg from "dropconvert"
import log from "log";

const debug = log.get("videory:transcode")

/**
 * Transcode given videos to desired transcode directory
 * @param {[Object]} videos - array of video objects to transcode
 * @param {String} transcodeDir - directory to store the transcoded videos
 * @return {Promise<void>}
 */
async function transcodeAll (videos, transcodeDir) {
    for (let i = 0; i < videos.length; i++) {
        const movie = videos[i];
        await transcode(movie, transcodeDir)
            .catch(debug.error); // fixme: decide on error handling
    }
}

/**
 * Transcode single video
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

        if (!fs.existsSync(inputPath)) {
            console.warn(`${inputPath} was about to be transcoded but cannot be located on filesystem. Video entry will be deleted from the DB.`);
            await deleteVideo(v);

            return resolve();
        }

        async function defineOutPath (suffix = 0){
            let outputPath = path.join(transcodeDir, "/", `${v.name}.${v.hash.substr(0, 5)}.${codec}.crf${crf}.${preset}${suffix ? "-" + suffix : ""}.mp4`);

            return outputPath;
        };

        const onProgress = async p => {
            debug.notice("Processing ", {
                name: v.name,
                path: v.path,
                hash: v.hash,
                progress: `${Math.round(100 / v.frames * p.frames * 100) / 100} % `,
                ...p,
            });
        };

        const onEnd = async () => {

            // end transcoding state
            await Promise.all([
                v.setIsTrancoding(false, codec, preset, crf, null),
                v.setTranscodePath(outputPath),
            ]);

            // update filesystem properties
            await new Promise( (resolve, reject) => {
                fs.stat(inputPath, async (err, stats) => {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        const created = stats.ctime.getTime();

                        await utimes(outputPath, {
                            atime: undefined,
                            btime: created,
                            mtime: created
                        });
                    } catch (e) {
                        return reject(e);
                    }

                    return resolve();
                });
            });

            debug.notice("Video file " + inputPath + " was transcoded to " + outputPath);

            return resolve(v);
        };

        const onError = async err => {
            debug.error(err);

            // fail transcoding state
            await Promise.all([
                v.setIsTrancoding(false, null, null, null, null),
                v.setTranscodePath(null),
                v.setFailed(err),
            ]);

            return reject(err);
        };

        // define output target path
        const outputPath = await defineOutPath();

        // check if target exists on fs
        const exists = await checkFileExists(outputPath);

        if (exists) {
            // skip encoding existent file

            if (global.allowVersions) {

                // add suffix to out path
                return defineOutPath(++suffix);
            }

            // assume video was transcoded correctly
            await onEnd();

            debug.notice(`Skip transcoding ${v.path} to ${outputPath} assuming file exists already`);

            return resolve;
        }

        // otherwise encode
        ffmpg(inputPath, outputPath, { onProgress, onEnd, onError });

        // set transcoding state
        await v.setIsTrancoding(true, codec);

        debug.notice(`Start transcoding ${v.path} to ${outputPath} using`, { codec, preset, crf },);
    });
}

/**
 * Fetch next batch of not transcoded videos and transcode them
 * @param {String} transcodeDir - output directory to save the transcoded videos
 */
async function transcodeNext (transcodeDir) {
    const videos = await findNotTranscodedVideos();
    await transcodeAll(videos, transcodeDir);
    debug.notice(`Finished transcoding`);
}

/**
 * Schedule next transcoder iteration
 * @param {String} transcodeDir - directory to save transcoded videos
 */
export async function * schedule (transcodeDir) {
    while(true){
        yield await transcodeNext(transcodeDir);
    }
}