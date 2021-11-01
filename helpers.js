const
    fs = require("fs")
    , debug = require("debug")("videory:helpers")

;

/**
 * returns file size in MB
 * @param {String} filename - file path to check size
 * @return {string}
 */
module.exports.getFilesizeInMBytes = function (filename) {
    const stats = fs.statSync(filename);
    const fileSizeInBytes = stats["size"];
    return Math.round(fileSizeInBytes / 1024 / 1024 * 100) / 100 + ' MB';
};


module.exports.logAndExit = exitCode => err => {
    console.trace(err);
    process.exit(exitCode);
};

/**
 * resolves if a file exists for given path
 * @param path
 * @returns {Promise<unknown>}
 */
module.exports.checkFileExists = (path) => new Promise((resolve, reject) => {
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

module.exports.pause = (ms=10e3) => new Promise(resolve => {
    debug(`Waiting ${ms} ms`);
    setTimeout(resolve,ms);
})