'use strict'

/**
 * Room Class
 */

class Room {
  constructor (id) {
    this.id = id;
    this.visited = false;
    this.writing = null;
    this.connections = [];
  }
}


/**
 * Module Exports
 * @public
 */

 module.exports = Room;
