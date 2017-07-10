var express = require('express');
var router = express.Router();

const Labyrinth = require('../modules/Labyrinth');

/* Init App */
router.post('/start', function(req, res, next) {

  const commander = req.body.commander || "test@test.com";
  const maxCommand = req.body.maxCommand;
  const labyrinth = new Labyrinth(commander, maxCommand);

  labyrinth.start().then(function() {
    labyrinth.search().then(function() {
      labyrinth.report().then(function(data) {
        let now = new Date();
        let diff = now - req.startTime;
        Object.assign(data, {timer: diff});
        res.send(data);
      }).catch(function(err) {
        next(err);
      });
    }).catch(function(err) {
      next(err);
    });
  }).catch(function(err) {
    next(err);
  });

});

module.exports = router;
