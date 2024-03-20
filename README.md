# GuppyFLO
GuppyFLO is a self-hosted service that enables local/remote management of multiple Klipper printers using Moonraker.
<p align="center">
    <a aria-label="Downloads" href="https://github.com/ballaswag/guppyflo/releases">
      <img src="https://img.shields.io/github/downloads/ballaswag/guppyflo/total?style=flat-square">
  </a>
    <a aria-label="Stars" href="https://github.com/ballaswag/guppyflo/stargazers">
      <img src="https://img.shields.io/github/stars/ballaswag/guppyflo?style=flat-square">
  </a>
    <a aria-label="Forks" href="https://github.com/ballaswag/guppyflo/network/members">
      <img src="https://img.shields.io/github/forks/ballaswag/guppyflo?style=flat-square">
  </a>
    <a aria-label="License" href="https://github.com/ballaswag/guppyflo/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/ballaswag/guppyflo?style=flat-square">
  </a>
  <a aria-label="Sponsor" href="https://github.com/sponsors/ballaswag">
<img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86">
  </a>
  <br>
    <a href='https://ko-fi.com/ballaswag' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com'></a>  
</p>

## Install
```
wget -O - https://raw.githubusercontent.com/ballaswag/guppyflo/main/installer.sh | sh
```
## Features
1. Global view of all your Klipper/Moonraker printers.
2. Fluidd opens directly to printer of desired printer (no need to mock with switching printers in the Fluidd UI).
3. Unlimited `go2rtc` WebRTC cameras.
4. Integrated Tailscale.
5. Free and secure remote access with `ngrok` (paid `ngrok` subscription availiable via their terms).
6. Unlimited local access.
7. Multiplatform support (runs in Linux/Windows x86_64, buildroot mipsle, PI ARMv6).
8. MobileRaker via `tailscale`

## Roadmap
1. More camera service support (e.g. ustreamer/camera-streamer)
2. More printer metrics at a glance (e.g. heater states)
3. Websocket instead of polling between server/client.

## Screenshot
<img src="https://github.com/ballaswag/guppyflo/blob/main/screenshots/guppyflo.png" alt="GuppyFLO UI" width="700"/>

## Configuration
### Local Access
GuppyFLO starts locally on port `9873`. Open a browser and go to `<guppyflo-host-ip>:9873` for local accces.

### Remote Access via Tailscale
GuppyFlo support secure remote access via Tailscale. You can sign up a free accout [here](https://login.tailscale.com/start).

1. Once you have a `tailscale` account, open browser to `http://<guppyflo-host-ip>:9873`.
2. Click the `tailscale` authentication link to add GuppyFLO as a `tailscale` device.
3. Done! Now you can access GuppyFLO and all your guppy managed printers via your `tailnet`.
4. On any device running `tailscale`, open your browser to [http://guppyflo](http://guppyflo).

### Remote Access via ngrok
GuppyFLO supports secure and authenticated remote access using ngrok. You can sign up for a free account [here](https://dashboard.ngrok.com/signup).

1. [Sign up](https://dashboard.ngrok.com/signup) for a free/paid ngrok account.
2. Copy your ngrok auth token from [here](https://dashboard.ngrok.com/get-started/your-authtoken).
3. Open in browse `http://<guppyflo-host-ip>:9873/settings` and paste your ngrok auth token in `Ngrok Auth Token`.
4. In the GuppyFLO `settings` page, select an OAuth provider (e.g. `google`).
5. Add your `OAuth Email`.
6. Click `Save` and restart guppyflo from your server.
7. The ngrok remote URL is found in GuppyFLO logs, or in your [ngrok dashboard](https://dashboard.ngrok.com/cloud-edge/endpoints)

<img src="https://github.com/ballaswag/guppyflo/blob/main/screenshots/guppyflo-settings.png" alt="GuppyFLO Settings" width="700"/>

### MobileRaker via Tailscale
If you enable `tailscale`, you can add all your guppy managed printer in MobileRaker.

1. In the GuppyFLO dashboard, find the printer link by pointing at the `Fluidd` button, e.g. `http://guppyflo/printer-390877414/fluidd`
2. In MobileRaker, click `Advanced`
3. `Printer - Address` is `guppyflo/printer-390877414/fluidd`
4. `Websocket - Address` is `guppyflo/printer-390877414/fluidd/websocket`
5. Click `Test Connection`, `Continue`

### Camera Setup
GuppyFLO allows unlimited WebRTC camera access only limited by your ISP bandwidth cap. Currently, `go2rtc` is the only support WebRTC camera service, more support will be added later. Refer to [go2rtc](https://github.com/AlexxIT/go2rtc) for setting up webcams and WebRTC. To add a `go2rtc` WebRTC camera:

1. Open GuppyFLO Dashboard in a browser.
2. Click `Add Printer`.
3. In the modal, fill in your printer information and click `Add Camera`.
4. `Camera Endpoint` is the endpoint to a `go2rtc` source, e.g. `/api/ws?src=mycamera1`.
5. `Camera IP` is the host IP where `go2rtc` is running.
6. `Camera Port` is the API port used by `go2rtc`
7. `Camera Service` always `go2rtc` for now.
8. Repeat step 3 to 7 to add more cameras.

<img src="https://github.com/ballaswag/guppyflo/blob/main/screenshots/guppyflo-cameras.png" alt="GuppyFLO Printer Camera" width="400"/>

## Disclaimers
* GuppyFLO is not associate with `ngrok`. It uses it for remote tunneling because it offers a free, secure, and programmable solution.
* GuppyFLO uses a fork of fluidd that enables path base access to moonraker websocket. The changes are tracked in this [fork](https://github.com/ballaswag/fluidd)

## Credit
[Moonraker](https://github.com/Arksine/moonraker)  
[Fluidd](https://github.com/fluidd-core/fluidd)  
[go2rtc](https://github.com/AlexxIT/go2rtc)  
[ngrok-go](https://github.com/ngrok/ngrok-go)  
