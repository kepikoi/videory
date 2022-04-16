import fs from "fs"
import log from "log";

const debug = log.get("videory:helpers")

/**
 * Return file size in MB
 * @param {String} filename - file path to check size
 * @return {string}
 */
export function getFilesizeInMBytes(filename) {
    const stats = fs.statSync(filename);
    const fileSizeInBytes = stats["size"];
    return Math.round(fileSizeInBytes / 1024 / 1024 * 100) / 100 + ' MB';
}

/**
 * Trace given error and exit the process
 * @param exitCode
 * @returns {(function(*=): void)|*}
 */
export const logAndExit = exitCode => err => {
    console.trace(err);
    process.exit(exitCode);
};

/**
 * Resolve true if a file exists for given path
 * @param path
 * @returns {Promise<unknown>}
 */
export const checkFileExists = (path) => new Promise((resolve, reject) => {
    fs.access(path, fs.F_OK, (err) => {
        if (err) {
            if (err.code === "ENOENT") {
                return resolve(false);
            }

            return reject(err)
        }

        return resolve(true);
    });
});

/**
 * Await delay
 * @param ms
 * @returns {Promise<unknown>}
 */
export const pause = (ms=10e3) => new Promise(resolve => {
    debug.notice(`Waiting ${ms} ms`);
    setTimeout(resolve,ms);
})