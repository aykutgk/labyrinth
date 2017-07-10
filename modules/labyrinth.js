'use strict'

const http = require('http');
const EventEmitter = require('events');
const Room = require('./room');
const Drone = require('./drone');

/**
* Labyrinth Class
*/

class Labyrinth extends EventEmitter {
  constructor(commander, maxCommand = 5) {
    super();

    this.commander = commander;

    // Available Drones
    this.drones = [];

    // All taks (Explore/Read) for each discovered room.
    this.tasks = [];
    this.roomLookup = {};

    // Max command number for drone to process at once.
    this.maxCommand = maxCommand;

    // Used Set() to prevent duplicates
    this.visitedRooms = new Set();
  }

  _parseBody(rawData, callback) {
    try {
      let data = JSON.parse(rawData);
      return callback(null, data);
    } catch (err) {
      return callback({err: err.message});
    }
  }

  _validateParams(data, callback) {
    if ("roomId" in data && data.roomId != ''
    && "drones" in data
    && Array.isArray(data.drones)
    && data.drones.length > 0) {
      return callback(null);
    }

    let err = {err: 'Missing roomId or drones!'}
    return callback(err);
  }

  _initDrones(drones) {
    drones.forEach((id) => {
      let drone = new Drone(id);
      this.drones.push(drone);
    });
    return this;
  }

  _addTask(id) {
    const exploreTask = {roomId: id, type: 'explore'};
    const readTask = {roomId: id, type: 'read'};
    this.tasks.push(exploreTask);
    this.emit('newTask');
    this.tasks.push(readTask);
    this.emit('newTask');
    return this;
  }

  /**
  * Get room from roomLookup
  */

  _getRoom(id) {
    if (this.roomLookup.hasOwnProperty(id)) {
      return this.roomLookup[id];
    }
    let room = new Room(id);
    this.roomLookup[id] = room;
    return room;
  }

  _initRoom(id) {
    this._getRoom(id);
    this._addTask(id);
    return this;
  }

  /**
  * Call '/start' endpoint at host and get initial room and drones.
  *
  */

  start() {
    const self = this;

    // TODO: put this variables into config file.
    const options = {
      hostname: 'challenge2.airtime.com',
      port: '10001',
      path: '/start',
      method: 'GET',
      headers: {
        'x-commander-email': `${this.commander}`,
      },
    };

    return new Promise(function(resolve, reject) {

      const req = http.request(options, (res) => {

        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            self._parseBody(rawData, (err, data) => {
              if (err) return reject(err);
              self._validateParams(data, (err) => {
                if (err) return reject(err);
                const {roomId, drones} = data;
                self._initRoom(roomId)._initDrones(drones);
                resolve();
              });
            });
          } else if (res.statusCode === 401) {
            let err = new Error('Commander not set!');
            reject({err: err.message});
          } else {
            let err = new Error('Something went wrong!');
            reject({err: err.message});
          }
        });

      });

      req.on('error', (err) => {
        reject({err: err.message});
      });

      req.end();

    });

  }

  /**
  * Generate command post data.
  */

  _generateCommandPostData() {
    let postData = {};
    for (let i = 0; i < this.maxCommand; i++) {
      let task = this.tasks.pop();
      if (task !== undefined) {
        if (task.type === 'explore') {
          postData[task.roomId] = {explore: task.roomId}
        } else {
          let readCommandKey = `__READ__${task.roomId}`;
          postData[readCommandKey] = {read: task.roomId}
        }
      }
    }
    return postData;
  }

  /**
  * Put the tasks back because of drone or network failure.
  */

  _putTasksBack(postData) {
    const keys = Object.keys(postData);
    keys.forEach((key) => {
      if (key.slice(0,8) === '__READ__') {
        this.tasks.push({roomId: key.slice(8), type: 'read'});
      } else {
        this.tasks.push({roomId: key, type: 'explore'});
      }
      this.emit('newTask');
    });
    return this;
  }

  /**
  * Put the drone back on success or network failure.
  */

  _putDroneBack(drone) {
    this.drones.push(drone);
    this.emit('droneBack');
    return this;
  }

  /**
  * Mark room as visited
  */

  _setRoomVisited(room) {
    if (room.connections.length > 0 && room.writing !== null) {
      room.visited = true;
      this.visitedRooms.add(room);
    }
    return this;
  }

  /**
  * Parse data after explore/read request
  * Process invalid commands if it exceeds the limit which is 5 for now.
  */

  _processResponseAfterExplore(postData, data) {
    const self = this;
    const keys = Object.keys(postData);
    keys.forEach((key) => {
      if (key.slice(0,8) === '__READ__') {
        let roomId = key.slice(8);
        let room = self._getRoom(roomId);
        if ('writing' in data[key] && 'order' in data[key]) {
          room.writing = data[key];
        }
        if ('error' in data[key]) {
          self._putTasksBack({[key]: postData[key]});
        }
        self._setRoomVisited(room);
      } else {
        let room = self._getRoom(key);
        if ('connections' in data[key] && data[key].connections.length > 0) {
          data[key].connections.forEach((id) => {
            if (!(id in self.roomLookup)) {
              self._addTask(id);
            }
            let innerRoom = self._getRoom(id);
            room.connections.push(innerRoom);
          });
        }
        if ('error' in data[key]) {
          self._putTasksBack({[key]: postData[key]});
        }
        self._setRoomVisited(room);
      }
    });
    return this;
  }

  /**
  * Explore multiple rooms
  *
  */

  explore() {
    const self = this;

    const drone = this.drones.pop();

    return new Promise(function(resolve, reject) {
      if (drone.isBusy) {
        // If Drone is busy, dont put it back because it is always busy!
        let err = new Error('Drone is already busy!');
        reject({err: err.message});
      }

      const postData = self._generateCommandPostData();

      if (Object.keys(postData).length === 0) {
        self._putDroneBack(drone);
        let err = new Error('No tasks available!');
        reject({err: err.message});
      }

      const droneId = drone.id;
      const path = `/drone/${droneId}/commands`;

      const options = {
        hostname: 'challenge2.airtime.com',
        port: 10001,
        path: path,
        method: 'POST',
        headers: {
          'x-commander-email': self.commander,
          'Content-Type': 'application/json',
        }
      };

      const req = http.request(options, (res) => {

        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            self._parseBody(rawData, (err, data) => {
              if (err) return reject(err);
              self._processResponseAfterExplore(postData, data);
              self.stats();
              self._putDroneBack(drone);
              resolve();
            });
          } else if (res.statusCode === 404) {
            // Drone is invalid
            // Put the tasks back
            // If SQS used, returning error will handle putting tasks back.
            self._putTasksBack(postData);
            let err = new Error('Drone is invalid!');
            reject({err: err.message});
          } else if (res.statusCode === 400) {
            // Drone is busy
            // Put the tasks back
            // If SQS used, returning error will handle putting tasks back.
            self._putTasksBack(postData);
            let err = new Error('Drone is busy!');
            reject({err: err.message});
          } else {
            let err = new Error('Something went wrong!');
            reject({err: err.message});
          }
        });

      });

      req.on('error', (err) => {
        self._putDroneBack(drone);
        self._putTasksBack(postData);
        reject({err: err.message});
      });

      req.write(JSON.stringify(postData));
      req.end();

    });

  }

  /**
  * Log status of progress
  */

  stats() {
    console.log(`Drones: ${this.drones.length}`);
    console.log(`Total tasks: ${this.tasks.length}`);
    console.log(`Visited rooms: ${this.visitedRooms.size}`);
    console.log(`roomLookup keys: ${Object.keys(this.roomLookup).length}`);
    return this;
  }

  /**
  * Check all rooms are searched
  */

  _searchDone() {
    return Object.keys(this.roomLookup).length === this.visitedRooms.size && this.tasks.length === 0;
  }

  /**
  * Get writings from rooms and combine them
  */
  _getMessage() {
    // let writings = [];
    // for (let room of this.visitedRooms) {
    //   if (room.writing.order !== -1) {
    //     writings.push({writing: room.writing.writing, order: room.writing.order});
    //   }
    // }
    let writings = [...this.visitedRooms].filter((room) => room.writing.order !== -1);
    writings.sort((a, b) => a.writing.order - b.writing.order);
    return writings.map((i) => i.writing.writing).join('');
  }

  /**
  * Report the message
  */

  report () {
    const self = this;

    const options = {
      hostname: 'challenge2.airtime.com',
      port: '10001',
      path: '/report',
      method: 'POST',
      headers: {
        'x-commander-email': `${this.commander}`,
        'Content-Type': 'application/json',
      },
    };

    const message = this._getMessage();
    const postData = {
      message: message,
    }

    return new Promise((resolve, reject) => {

      const req = http.request(options, (res) => {

        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          self._parseBody(rawData, (err, data) => {
            if (err) return reject({err: err.message});
            if (res.statusCode === 400) {
              resolve(data);
            } else if (res.statusCode === 200) {
              resolve(data);
            } else {
              let err = new Error('Something went wrong!');
              reject({err: err.message});
            }
          });
        });

      });

      req.on('error', (err) => {
        reject({err: err.message});
      });

      req.write(JSON.stringify(postData));

      req.end();

    });

  }

  /**
  * Search Algorithm that searches all rooms
  * Similar to BFS/DFS but async.
  */

  search() {
    const self = this;

    return new Promise((resolve, reject) => {
      this.on('newTask', () => {
        if (this.drones.length > 0) {
          self.explore().then(function(result) {
            if (self._searchDone()) {
              self.report();
              resolve();
            }
          }).catch(function(err) {
            // TODO: handle errs like drone is busy or invalid
            // on network error, reject
            //reject(err);
          });
        }
      });

      this.on('droneBack', () => {
        if (this.tasks.length > 0) {
          this.explore().then(function(result) {
            if (self._searchDone()) {
              self.report();
              resolve();
            }
          }).catch(function(err) {
            // TODO: handle errs like drone is busy or invalid
            // on network error, reject
            //reject(err);
          });
        }
      });

      this.explore().then(function(result) {
      }).catch(function(err) {
        //reject(err);
      });
    });
  }
}


/**
* Module Exports
* @public
*/

module.exports = Labyrinth;
