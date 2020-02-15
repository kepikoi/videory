const
    debug = require("debug")("videory:db")
    , assert = require("assert")
    , low = require("lowdb")
    , FileAsync = require("lowdb/adapters/FileAsync")
    , adapter = new FileAsync("db.json")
    , db = low(adapter)
    , fs = require("fs")
    , dayjs = require("dayjs")
;

/**
 * init database
 * @return {Promise<*>}
 */
module.exports.init = async () => {
    // init movies table
    
    return (await db).defaults({ videos: [] })
        .write();
    
    //todo: remove transcoding Bit on every video after startup
    //init settings tables
};

/**
 * update video entity
 * @param {Object} video
 * @return {Promise<any>}
 */

async function updateVideo (video) {
    assert.ok(video.hash);
    
    return (await db).get("videos")
        .find({ hash: video.hash, path: video.path })
        .assign(video)
        .write()
        ;
}

module.exports.updateMovie = updateVideo;

/**
 * insert video to database
 * @param {string} hash - video file hash
 * @param {string} name - video name
 * @param {string} path - video fs path
 * @param {Date} created - video creation date
 * @param {string} length - video length in seconds
 * @param {number} fps - video fps
 * @param {number} frames - amount of frames in video file
 * @return {Promise<any | never>}
 */
module.exports.insertMovie = async (hash, name, path, created, length, fps, frames) => {
    const m = (await db).get("videos")
        .find({ hash, path });
    
    if (m.value()) {
        // existing
    } else {
        return (await db).get("videos")
            .push({
                hash,
                name,
                path,
                created,
                length,
                frames,
                codec: null,
                transcoded: null,
                fps: fps,
                bitrate: null,
                failed: null,
                indexed: dayjs(new Date()),
                isTranscoding: false,
                transcodedPath: null,
            })
            .write()
            ;
    }
};

/**
 * deletes a movie from db
 * @param {Object} movie
 * @return {Promise<any>}
 */
const deleteVideo = async ({ hash, path }) => {
    return (await db).get("videos")
        .remove({ hash, path })
        .write()
        ;
};

module.exports.deleteVideo = deleteVideo;

/**
 * returns all transcoded movies from db
 * @return {Promise<any>}
 */
module.exports.findTranscodedVideos = async () => {
    return (await db).get("videos")
        .filter(v => v.transcodedPath != null)
        .value()
        ;
};

/**
 * returns movies that are yet to be encoded
 * @return {Promise<*>}
 */
module.exports.findNotTranscoded = async () => {
    // const notTranscoded = await all('select * from movie where "transcodedPath" ISNULL AND "isTranscoding" is 0');
    
    const notTranscoded = await (await db).get("videos")
        .filter(n => n.transcodedPath === null && n.isTranscoding === false /*&& n.failed === null*/)
        .take(4)
        .value()
    ;
    
    if (!notTranscoded.length) {
        debug("Found no videos to transcode. Will retry shortly");
        const failed = await findFailedTranscodings();
        if (failed.length) {
            debug(`Found ${failed.length} failed transcodings: `, failed);
        }
        return [];
    }
    
    debug("Found videos to transcode:", notTranscoded.map(n => n.path).join());
    
    const toDelete = [];
    const foundNotTranscoded = notTranscoded.filter(async n => {
        exists = await fs.existsSync(n.path);
        if (!exists) {
            debug(`Could not locate DB entry for video ${n.path} on the filesystem. Video entry will be deleted`);
            toDelete.push(n);
        } else {
            return n;
        }
    });
    
    await Promise.all(toDelete.map(d => deleteVideo(d)));
    
    return foundNotTranscoded
        .map(n => ({
            ...n,
            async setTranscodePath (path) {
                n.transcodedPath = path;
                n.transcoded = path ? dayjs(new Date()) : null;
                return updateVideo(n);
            },
            async setFailed (error) {
                n.failed = error.message;
                return updateVideo(n);
            },
            async setIsTrancoding (isTranscoding = true, codec, preset, crf, bitrate) {
                n = { ...n, codec, preset, crf, bitrate };
                return updateVideo(n);
            }
        }));
};

/**
 * find videos from db that are marked as isTranscoding
 * @return {Promise<void>}
 */

const findStalledTranscodings = async () => {
    return (await db).get("videos")
        .filter({ transcodedPath: null, isTranscoding: true });
};

/**
 * find videos from db that are marked as failed
 * @return {Promise<void>}
 */
const findFailedTranscodings = async () => {
    const r = (await db).get("videos")
        .filter(v => {
            return v.failed === false;
        });
    
    return r.value();
};

/**
 * deletes videos from db that are marked as isTranscoding
 * @return {Promise<void>}
 */
module.exports.removeStalledTranscodings = async () => {
    return (await findStalledTranscodings())
        .each((v) => {
            v.isTranscoding = false;
        })
        .write()
        ;
};

module.exports.findStalledTranscodings = findStalledTranscodings;
