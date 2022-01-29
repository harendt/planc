# planc

**Simple Planning Poker application**

---

This is just a simple multiplayer Planning Poker application. I wrote this because holding cards
into the camera while working from home does not work well.

## Goals

* Enable efficient participation in planning poker sessions while working from home.
* Enable people in meeting rooms to participate via their mobile phones.
* Provide some basic statistics about the results of each round.

## Setup

### Docker

The easiest way to setup the application. Just build the image and run it.

```bash
docker build -t planc .
docker run --rm -it -p 8080:8080 planc
```

You can now open the application in your webbrowser (localhost:8080).

### Development

The cargo build system expects the frontend to be built already. The top-level docker build takes
care of that automatically. It does not support incremental compilation though.

To build the frontend you can use the `web/build.sh` script. It uses docker to setup a build
environment for the frontend and generates the frontend artifacts in `web/dist/planc`. These
artifacts will then be used by `cargo` when backend is built.
