# Keeper

Shamelessly vibecoded replacement for Google Keep.

Made because Keep has too many features I don't care about and no good functionality for exporting data.

Only intended for single-user use, i.e. me. So no promises it will be of any value to anyone else.

## Does it actually work?

To a degree. The basic CRUD flows are all in place for notes.

It doesn't have a properly responsive interface yet, so it's not particularly usable on mobile.

I'm trying to get it working as a PWA for mobile usage but not had any success so far.

There is also a browser extension in this repo for sending content to the app; it works pretty well.

## Running as a service

To run Keeper on startup as a systemd user service:

```bash
# Link the service file
mkdir -p ~/.config/systemd/user
cp keeper.service ~/.config/systemd/user/keeper.service

# Enable and start
systemctl --user daemon-reload
systemctl --user enable keeper
systemctl --user start keeper
```

Keeper will be available at **http://localhost:3001**. The service builds the frontend on start and runs the API server.

Useful commands:

```bash
systemctl --user status keeper    # check status
systemctl --user restart keeper   # restart after code changes
journalctl --user -u keeper -f    # view logs
```

To ensure user services run on boot (even before login):

```bash
sudo loginctl enable-linger $USER
```

## Development

```bash
npm run dev        # starts both the API server and Vite dev server
npm run dev:vite   # Vite only (frontend)
npm run server     # API server only
```
