# labyrinth
It is the year 2020 and humanity is abuzz about the discovery of a series of underground labyrinths on Jupiter's moon
Ganymede which were seemingly built by a sentient race of robots that have long since left.

While performing routine seismic surveys, exogeologists discovered the entrance to one of labyrinths and quickly
realized that they were numerous and each containing large numbers of rooms.  Initial explorations also revealed that
some of the rooms contained mysterious writing.

In order to understand the labyrinths as quickly as possible and what the writing could possibly mean,
remotely operated exploration drones have been deployed to the various labyrinth entrances.

As an exploration drone commander, you have the responsibility of guiding your set of drones through a
particular labyrinth and reporting on the writing you find there.

The drones have a RESTful interface that is described below.  Each room in the labyrinth will have one or more
connections to other rooms and may or may not contain writing.

Since the Jovian round trip communication time is quite long, you should batch up your commands as much as possible.
 Drones can accept up to 5 commands at a time.

Also, the drones will only respond to you so be sure to set "x-commander-email:<your-email>" in your request header.

GOAL: Determine the full message by discovering all the valid writings and then concatenating them in order and POSTing
it to /report (see spec below).

NOTE: The body of your requests must be valid json.  If you are getting an empty 200 response be sure to validate your json.

NOTE: Drone response times do not represent actual round trip communication times with Jupiter.  It should take
around 500ms to receive a response.

```
---- Drone REST Interface ----

----------------------------------
GET /start
----------------------------------
Reponses:
200 OK:
{
  "roomId": "<roomId>"
  "drones: ["<droneIds>"]
}

----------------------------------
POST /drone/:droneId/commands
----------------------------------
// NOTE: commandIds are operator (i.e. you) assigned
body:
{
  "<commandId>": {
    "explore": "roomId"
  },
  "<commandId>": {
    "read": "roomId"
  }
}

Responses:
404 Not Found: droneId is invalid

400 Bad Request:
{
  "error": "Drone <droneId> is busy already"
}

200 OK:
{
  "<commandId>": {
    "connections": "[<roomIds>]"
  },
  "<commandId>": {
    "writing": "<writing>"
    "order": "<order>" // -1 means writing is not valid
  },
  "<commandId>": {
    "error": "Invalid command or roomId, or too many commands"
  }
}

----------------------------------
POST /report
----------------------------------
body:
{
  "message": "<concatenated, in-order writings>"
}
```

## Start app
- npm install
- npm start
- method:POST path:/start
- Optional params: {"commander": "aykutged@gmail.com", maxCommand: 5}
