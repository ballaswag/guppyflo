import { useEffect, useState, useRef } from 'react'

import Button from './components/Button.jsx'
import PrinterForm from './components/PrinterForm.jsx'
import PrinterNetworkInfo from './components/PrinterNetworkInfo.jsx'

import WarningIcon from './assets/images/warning.svg?react'
import PrinterIcon from './assets/images/printer.svg?react'
import PauseIcon from './assets/images/pause.svg?react'
import ResumeIcon from './assets/images/resume.svg?react'
import StopIcon from './assets/images/stop.svg?react'
import CameraIcon from './assets/images/camera.svg?react'
import CloseIcon from './assets/images/close.svg?react'
import NetworkInfoIcon from './assets/images/network.svg?react'

function Printers() {
  const [printers, setPrinters] = useState([])
  const [settings, setSettings] = useState({})

  const [showAddPrinterModal, setShowAddPrinterModal] = useState(false)

  const getPrinters = async () => {
    const res = await fetch("/v1/api/printers")
    const data = await res.json()
    setPrinters(data)
  };

  const getSettings = async () => {
    const res = await fetch("/v1/api/settings")
    const data = await res.json()
    setSettings(data)
  };

  const addPrinter = async (formData, numCams) => {
    const camFields = [...Array(numCams)].map((_, i) => {
      return {
        path: formData.get('cameraapi' + i),
        type: formData.get('cameratype' + i),
        camera_ip: formData.get('cameraip' + i),
        camera_port: parseInt(formData.get('cameraport' + i))
      }
    })

    const resp = await fetch('/v1/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printer_name: formData.get('name'),
        moonraker_ip: formData.get('ip'),
        moonraker_port: parseInt(formData.get('port')),
        cameras: camFields
      })
    })

    if (resp.status == 200) {
      setPrinters([...printers, await resp.json()])
      setShowAddPrinterModal(false)
    } else {

      console.log("failed to add printer")
    }
  }

  useEffect(() => {
    getSettings()
    getPrinters()
    const timer = setInterval(getPrinters, 5000)
    return () => clearInterval(timer)
  }, []);

  return (
    <>
      {(!settings.ngrok_auth_token && !settings.ngrok_api_key && settings.ts_auth_url) && 
        (
        <p className='py-2 text-lg px-10'>
            <span className='inline-flex mr-2'>
              <WarningIcon className='w-6 h-6 fill-yellow-500' />
            </span>
            Ngrok is not configured. Configure it in <a className='text-green-300 hover:underline' href="/settings" target='_blank'>Settings</a>.
          </p>
        )
      }

      {settings.ts_auth_url &&
        (
          <p className='text-lg mb-2 px-10'>
            <span className='inline-flex mr-2'>
              <WarningIcon className='w-6 h-6 fill-yellow-500' />
            </span>
            Tailscale needs to register this GuppyFLO instance in your tailnet. Use <a className='text-green-300 hover:underline' href={settings.ts_auth_url} target='_blank'>{settings.ts_auth_url}</a> to authenticate.
          </p>
        )
      }

      <div className='flex justify-end mb-3 mr-4 md:mr-0'>
        <Button onClick={() => setShowAddPrinterModal(true)} >
          <PrinterIcon className='w-5 h-5 fill-current' />
          <span>Add Printer</span>
        </Button>
      </div>

      {showAddPrinterModal && <PrinterForm printerAction={addPrinter} setModal={setShowAddPrinterModal} isEdit={false} />}
      <PrintersSummary printers={printers} />
      <PrinterList printers={printers} />
    </>
  )
}

function PrintersSummary({ printers }) {
  const byState = printers.reduce(function (rv, p) {
    (rv[p.stats.state] = rv[p.stats.state] || []).push(p);
    return rv;
  }, {});
  const printing = (byState['printing'] || []).length
  const offline = (byState['offline'] || []).length
  const standby = printers.length - printing - offline

  return (
    <div className='flex flex-wrap justify-evenly bg-gray-600 rounded-t-md font-medium py-2'>
      <div className='space-x-4 flex items-center'>
        <span className="inline-flex rounded-full bg-gray-500 uppercase text-sm font-medium px-2 py-0.5 mt-2">
          <PrinterIcon className='w-5 h-5 fill-current mr-2' />Total ({printers.length})
        </span>

      </div>

      <div className='space-x-4 flex items-center'>
        <span className='rounded-full bg-rose-600 uppercase text-sm font-medium px-2 py-0.5 mt-2'>Offline ({offline})</span>
      </div>
      <div className='space-x-4 flex items-center'>
        <span className='rounded-full bg-green-500 uppercase text-sm font-medium px-2 py-0.5 mt-2'>Printing ({printing})</span>
      </div>
      <div className='space-x-4 flex items-center'>
        <span className='rounded-full bg-orange-500 uppercase text-sm font-medium px-2 py-0.5 mt-2'>Standby ({standby})</span>
      </div>
    </div>
  )
}

function CameraGo2RTC({ src }) {
  const parent = useRef();

  useEffect(() => {
    const video = document.createElement('video-stream');
    video.mode = 'webrtc'
    video.style.flex = '1 0 320px';
    video.src = new URL(src, location.href);
    parent.current.appendChild(video);
  }, [src, parent])

  return (
    <div ref={parent} />
  )
}

function CameraMpjegStream({ src }) {
  const imgRef = useRef()

  useEffect(() => {
    imgRef.current.src = src
    let localRef = imgRef.current;

    return () => {
      localRef.src = ''
    }
  }, [src, imgRef])

  return (
    <a className='border border-gray-500 hover:border-gray-400 hover:border-2' href={src} target='_blank'>
      <img className='max-w-[410px]' ref={imgRef} />
    </a>
  )
}

function PrinterList({ printers }) {
  return (
    <div className='divide-y divide-gray-500  bg-gray-600 rounded-b'>
      {printers.map((printer) => <PrinterCard key={printer.id} printer={printer} />)}
    </div>
  )
}

function PrinterCard({ printer }) {
  const [pauseLoading, setPauseLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [estopLoading, setEstopLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCameras, setShowCameras] = useState(false)
  const [editPrinter, setEditPrinter] = useState(false)
  const [showPrinterNetworkInfo, setShowPrinterNetworkInfo] = useState(false)

  useEffect(() => {
    if (printer.stats.state == 'printing') {
      setResumeLoading(false)
    } else if (printer.stats.state == 'paused') {
      setPauseLoading(false)
    }

    if (printer.stats.state != 'printing') {
      setEstopLoading(false)
    }
  }, [printer]);

  const updatePrinter = async (formData, numCams) => {
    const camFields = [...Array(numCams)].map((_, i) => {
      return {
        path: formData.get('cameraapi' + i),
        type: formData.get('cameratype' + i),
        camera_ip: formData.get('cameraip' + i),
        camera_port: parseInt(formData.get('cameraport' + i))
      }
    })

    const resp = await fetch('/v1/api/printers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printer_name: formData.get('name'),
        moonraker_ip: formData.get('ip'),
        moonraker_port: parseInt(formData.get('port')),
        cameras: camFields
      })
    })

    if (resp.status == 200) {
      setEditPrinter(false)
    } else {
      console.log("failed to edit printer")
    }
  }

  const emergencyStop = async (printerid) => {
    const resp = fetch("printers/" + printerid + '/fluidd/printer/emergency_stop', {
      method: 'POST'
    })

    setEstopLoading(true)
  }

  const printAction = (printerid, action) => {
    const resp = fetch("printers/" + printerid + '/fluidd/printer/print/' + action, {
      method: 'POST'
    })

    if (action == 'pause') {
      setPauseLoading(true)
    } else if (action == 'resume') {
      setResumeLoading(true)
    }
  }

  const deletePrinter = (printerid) => {
    const resp = fetch('/v1/api/printers?id=' + printerid, {
      method: 'DELETE'
    })

    setDeleting(true)

  }

  const toggleCameras = () => {
    setShowCameras(!showCameras)
  }

  const filePrintEta = (printer) => {
    const printDuration = printer.stats.print_duration;
    const progressPercentage = printer.virtual_sdcard.progress;

    return (printDuration / progressPercentage - printDuration)
  }

  const eta = moment.duration(filePrintEta(printer), 'seconds')

  const pauseButton = (
    <Button
      onClick={() => printAction(printer.id, 'pause')}
      disabled={pauseLoading}
      loading={pauseLoading}>
      <PauseIcon className='w-5 h-5 fill-orange-400' />
      <span>Pause</span>
    </Button>
  )

  const resumeButton = (
    <Button
      onClick={() => printAction(printer.id, 'resume')}
      disabled={resumeLoading}
      loading={resumeLoading}>
      <ResumeIcon className='w-5 h-5 fill-green-500' />
      <span>Resume</span>
    </Button>
  )

  const isPrinting = ['printing', 'paused'].includes(printer.stats.state)
  const status = isPrinting
    ? (
      <>
        <div className="text-lg font-semibold truncate text-left mb-1">
          <span className='inline-block min-w-52'>
            {printer.printer.printer_name} - {printer.virtual_sdcard.file_path.substring(printer.virtual_sdcard.file_path.lastIndexOf('/') + 1)}
          </span>
        </div>
        <div className='space-y-1'>
          <div className="text-base truncate text-left capitalize">
            <span className='inline-block min-w-28'>{printer.stats.state}</span>
            <span className='text-gray-400'>{(printer.virtual_sdcard.progress * 100).toFixed(2) + '%'}</span>
          </div>
          <div className="text-base truncate text-left">
            <span className='inline-block min-w-28'>File</span>
            <span className='text-gray-400'>{eta.hours() + eta.days() * 24}h {eta.minutes()}m {eta.seconds()}s</span>
          </div>

          <div className="text-base truncate text-left">
            <span className='inline-block min-w-28'>Extruder</span>
            <span className='text-gray-400'>{printer.extruder.temperature} ({printer.extruder.target}) &deg;C</span>
          </div>
          <div className="text-base truncate text-left">
            <span className='inline-block min-w-28'>Heater Bed</span>
            <span className='text-gray-400'>{printer.heater_bed.temperature} ({printer.heater_bed.target}) &deg;C</span>
          </div>
        </div>
      </>
    )
    : (
      <>
        <p className="text-lg font-semibold truncate text-left">
          {printer.printer.printer_name}
        </p>

        <p className="text-base truncate text-left capitalize">
          {printer.stats.state}
        </p>
      </>
    )


  const printControls = isPrinting ? (<>
    {printer.stats.state === 'paused' ? resumeButton : pauseButton}

    <Button
      onClick={() => emergencyStop(printer.id)}
      disabled={estopLoading}
      loading={estopLoading}>
      <StopIcon className='w-6 h-6 fill-rose-600' />
      <span>Stop</span>
    </Button>
  </>
  )
    : null

  return (
    <div className="flex flex-wrap items-center px-5 py-5 justify-center relative">
      <div className="flex-shrink-0">
        {isPrinting ? (
          <svg className='w-12 h-12 fill-green-500' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M7,2H17V8H19V13H16.5L13,17H11L7.5,13H5V8H7V2M10,22H2V20H10A1,1 0 0,0 11,19V18H13V19A3,3 0 0,1 10,22Z" />
          </svg>
        ) : printer.stats.state !== 'standby' ?

          (
            <svg className="w-12 h-12 fill-rose-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M20.84 22.73L15.31 17.2L14.5 18V21H9.5V18L6 14.5V9C6 8.7 6.1 8.41 6.25 8.14L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M18 14.5V9C18 8 17 7 16 7V3H14V7H10.2L17.85 14.65L18 14.5M10 3H8V4.8L10 6.8V3Z" />
            </svg>
          ) : (
            <svg className="w-12 h-12 fill-orange-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M17 9H7V4H17V9M13 17.5C13 18 13.07 18.5 13.18 19H4V12C4 10.9 4.89 10 6 10H18C18.74 10 19.38 10.41 19.73 11C19.65 11 19.58 11 19.5 11C15.91 11 13 13.91 13 17.5M10 12H6V14H10V12M19 20C17.62 20 16.5 18.88 16.5 17.5C16.5 17.1 16.59 16.72 16.76 16.38L15.67 15.29C15.25 15.92 15 16.68 15 17.5C15 19.71 16.79 21.5 19 21.5V23L21.25 20.75L19 18.5V20M19 13.5V12L16.75 14.25L19 16.5V15C20.38 15 21.5 16.12 21.5 17.5C21.5 17.9 21.41 18.28 21.24 18.62L22.33 19.71C22.75 19.08 23 18.32 23 17.5C23 15.29 21.21 13.5 19 13.5Z" />
            </svg>
          )
        }

      </div>
      <div className="flex-grow ml-3">
        {status}
      </div>
      <div className='absolute right-4 top-4'>
        {!confirmDelete && (
          <div className='space-x-1'>
            <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50"
            onClick={() => setShowPrinterNetworkInfo(!showPrinterNetworkInfo)}>
            <NetworkInfoIcon className='w-5 h-5 fill-current' />
            </button>
            <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50"
              onClick={() => setEditPrinter(!editPrinter)}>
              <svg className='w-5 h-5 fill-current' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
              </svg>
            </button>
            <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50"
              onClick={() => setConfirmDelete(true)}>
              <CloseIcon className='w-5 h-5 fill-current' />
            </button>
          </div>
        )}
        {editPrinter && <PrinterForm printer={printer} printerAction={updatePrinter} setModal={setEditPrinter} isEdit={true} />}
        {showPrinterNetworkInfo && <PrinterNetworkInfo printer={printer} setShow={setShowPrinterNetworkInfo} />}
        {confirmDelete && (
          <div className='space-x-2 inline-flex items-center bg-yellow-500 p-2 rounded'>
            <p className='font-bold text-white'>Delete?</p>
            <button className="min-w-12 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-1 px-4 rounded-full"
              onClick={() => deletePrinter(printer.id)} disabled={deleting}>
              {deleting ?
                (
                  <svg className="w-6 h-6 text-gray-300 animate-spin" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M32 3C35.8083 3 39.5794 3.75011 43.0978 5.20749C46.6163 6.66488 49.8132 8.80101 52.5061 11.4939C55.199 14.1868 57.3351 17.3837 58.7925 20.9022C60.2499 24.4206 61 28.1917 61 32C61 35.8083 60.2499 39.5794 58.7925 43.0978C57.3351 46.6163 55.199 49.8132 52.5061 52.5061C49.8132 55.199 46.6163 57.3351 43.0978 58.7925C39.5794 60.2499 35.8083 61 32 61C28.1917 61 24.4206 60.2499 20.9022 58.7925C17.3837 57.3351 14.1868 55.199 11.4939 52.5061C8.801 49.8132 6.66487 46.6163 5.20749 43.0978C3.7501 39.5794 3 35.8083 3 32C3 28.1917 3.75011 24.4206 5.2075 20.9022C6.66489 17.3837 8.80101 14.1868 11.4939 11.4939C14.1868 8.80099 17.3838 6.66487 20.9022 5.20749C24.4206 3.7501 28.1917 3 32 3L32 3Z"
                      stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"></path>
                    <path
                      d="M32 3C36.5778 3 41.0906 4.08374 45.1692 6.16256C49.2477 8.24138 52.7762 11.2562 55.466 14.9605C58.1558 18.6647 59.9304 22.9531 60.6448 27.4748C61.3591 31.9965 60.9928 36.6232 59.5759 40.9762"
                      stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                    </path>
                  </svg>
                )
                : (
                  <>

                    <svg className='w-6 h-6 fill-green-500' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                    </svg>
                    <span>Yes</span>
                  </>
                )}
            </button>
            <button className="min-w-12 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-1 px-4 rounded-full"
              onClick={() => setConfirmDelete(false)}>
              <svg className='w-6 h-6 fill-rose-600' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></
              svg>
              <span>No</span>
            </button>
          </div>
        )
        }
      </div>
      <div className='w-3/4 flex flex-wrap justify-between mt-5 gap-y-3 md:w-full md:block md:w-full md:space-x-4'>
        <Button
          onClick={() => window.open("printers/" + printer.id + '/fluidd', '_blank', 'noopener,noreferrer')}>
          <PrinterIcon className='w-5 h-5 fill-current' />
          <span>Fluidd</span>
        </Button>
        <Button
          onClick={() => window.open("printers/" + printer.id + '/mainsail', '_blank', 'noopener,noreferrer')}>
          <PrinterIcon className='w-5 h-5 fill-current' />
          <span>Mainsail</span>
        </Button>

        <Button onClick={toggleCameras} disabled={printer.stats.state === 'offline'}>
          <CameraIcon className='w-5 h-5 fill-current' />
          <span>Cameras</span>
        </Button>

        {printControls}

      </div>
      <div>
        {printer.stats.state !== 'offline' && showCameras ?
          (<div className='w-full flex flex-row flex-wrap justify-start mt-5 gap-2'>
            {printer.printer.cameras.map((c, i) => {
              switch (c.type) {
                case 'go2rtc':
                  return (<CameraGo2RTC key={printer.id + 'cam' + i} src={"printers/" + printer.id + '/cameras/' + c.id + c.path} />)
                case 'mjpeg-stream':
                  return (<CameraMpjegStream key={printer.id + 'cam' + i} src={"printers/" + printer.id + '/cameras/' + c.id + c.path} />)
                default:
                  console.log("unknonw camera service")
                  return (<></>)
              }
            }
            )}
          </div>) : <div />}
      </div>
    </div>
  )
}

export default Printers
