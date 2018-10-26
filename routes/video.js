const
    router = require('express').Router()
    , db = require('../db')
;

router.get('/',async (req,res,next)=>{
    const videos =  await db.find();
    res.status(200).json(videos);
});

module.exports = router;