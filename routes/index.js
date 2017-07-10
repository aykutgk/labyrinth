var express = require('express');
var router = express.Router();

const Labyrinth = require('../modules/Labyrinth');

/* Init App */
router.post('/start', function(req, res, next) {

  const commander = req.body.commander || "test@test.com";
  const labyrinth = new Labyrinth(commander);

  labyrinth.start().then(function() {

    labyrinth.explore().then(function() {
      res.send({ok:true});
    }).catch(function(err) {
      next(err);
    });
    
  }).catch(function(err) {
    next(err);
  });

});

module.exports = router;
