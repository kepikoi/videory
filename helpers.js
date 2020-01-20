const
    fs = require("fs")
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