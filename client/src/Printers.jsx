import { useEffect, useState, useRef } from 'react'

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

    const resp = await fetch('/v1/api/printers',{
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
    {!settings.ngrok_auth_token && !settings.ngrok_api_key ? 
    (<div>
      <p className='text-lg'>
        <span className='inline-flex mr-2'>
        <svg className="w-6 h-6 fill-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
        </svg>  
        </span>
      Ngrok is not configured. Configure it in <a className='text-green-300 hover:underline' href="/settings" target='_blank'>Settings</a>.
      </p>
      </div>) : <></>
    }

{settings.ts_auth_url ?
    (<div>
      <p className='text-lg'>
        <span className='inline-flex mr-2'>
        <svg className="w-6 h-6 fill-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
        </svg>  
        </span>
      Tailscale needs to register this GuppyFLO instance in your tailnet. Use <a className='text-green-300 hover:underline' href={settings.ts_auth_url} target='_blank'>{settings.ts_auth_url}</a> to authenticate.
      </p>
      </div>) : <></>
    }

    <AddPrinterModal addPrinter={addPrinter} setShowModal={setShowAddPrinterModal} showModal={showAddPrinterModal} />
      <PrintersSummary printers={printers} />
      <PrinterList printers={printers} />
    </>
  )
}

function PrintersSummary({printers}) {
  const byState = printers.reduce(function (rv, p) {
    (rv[p.stats.state] = rv[p.stats.state] || []).push(p);
    return rv;
  }, {});
  const printing = (byState['printing'] || []).length
  const offline = (byState['offline'] || []).length
  const standby = printers.length - printing - offline

  return (
    <div className='flex flow-row flex-wrap justify-evenly bg-gray-600 rounded-md font-medium py-2'>
      <div className='flex items-center space-x-4'>
        <span className="inline-flex justify-center items-center ml-3 mr-1">
          <svg className="w-5 h-5" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M17 2H7C5.9 2 5 2.9 5 4V19C5 20.11 5.9 21 7 21V22H9V21H15V22H17V21C18.11 21 19 20.11 19 19V4C19 2.9 18.11 2 17 2M17 19H7V4H17V19M10 15H8V10H10V15Z" />
          </svg>
        </span>
        Printers<span>{printers.length}</span>
      </div>

      <div className='space-x-4'>
        <span className='rounded-full bg-rose-600 uppercase text-sm font-medium px-2 py-0.5 ml-7 mt-2'>Offline</span>
        <span>{offline}</span>
      </div>
      <div className='space-x-4'>
        <span className='rounded-full bg-green-500 uppercase text-sm font-medium px-2 py-0.5 ml-7 mt-2'>Printing</span>
        <span>{printing}</span>
      </div>
      <div className='space-x-4'>
        <span className='rounded-full bg-orange-500 uppercase text-sm font-medium px-2 py-0.5 ml-7 mt-2'>Standby</span>
        <span>{standby}</span>
      </div>
    </div>
  )
}

function PrinterCamera({src}) {
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

function PrinterList({printers}) {
  return (
    <div className='divide-y divide-gray-500  bg-gray-600 rounded'>
    {printers.map((printer) => <PrinterCard key={printer.id} printer={printer} />) }
    </div>
  )
}

function PrinterCard({printer}) {
  const [pauseLoading, setPauseLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [estopLoading, setEstopLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCameras, setShowCameras] = useState(false)

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


  const emergencyStop = async (printerid) => {
    const resp = fetch(printerid + '/fluidd/printer/emergency_stop',{
      method: 'POST'
    })

    setEstopLoading(true)
  }

  const printAction = (printerid, action) => {
    const resp = fetch(printerid + '/fluidd/printer/print/' + action,{
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
    <button className="min-w-28 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-1 px-4 rounded-full"
      onClick={() => printAction(printer.id, 'pause')} disabled={pauseLoading}>
      {pauseLoading ?
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
            <svg className='w-5 h-5 fill-orange-400' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M13,16V8H15V16H13M9,16V8H11V16H9M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z" />
            </svg>
            <span>Pause</span>
          </>
        )
      }
    </button>
  )

  const resumeButton = (
    <button className="min-w-28 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-1 px-4 rounded-full"
      onClick={() => printAction(printer.id, 'resume')} disabled={resumeLoading}>
      {resumeLoading ?
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
            <svg className='w-5 h-5 fill-green-500' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" />
            </svg>
            <span>Resume</span>
          </>
        )
      }
    </button>
  )

  const isPrinting = ['printing', 'paused'].includes(printer.stats.state)
  const status = isPrinting
    ? (
      <>
        <div className="text-lg font-semibold truncate text-left min-w-52 space-x-3">
          <span className='inline-block min-w-52'>

            {printer.printer.printer_name}
          </span>
        </div>

        <div className="text-base truncate text-left capitalize">
          <span className='inline-block min-w-28'>{printer.stats.state}</span>
          <span className='text-gray-400'>{(printer.virtual_sdcard.progress * 100).toFixed(2) + '%'}</span>
        </div>
        <div className="text-base truncate text-left">
          <span className='inline-block min-w-28'>File</span>
          <span className='text-gray-400'>{eta.hours() + eta.days() * 24}h {eta.minutes()}m {eta.seconds()}s</span>
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
    <button className="min-w-28 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-2 py-1 px-4 rounded-full"
    onClick={() => emergencyStop(printer.id)} disabled={estopLoading}>
      {estopLoading ?
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
            <svg className='w-6 h-6 fill-rose-600' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M11,15H13V17H11V15M11,7H13V13H11V7M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12C19,15.86 15.86,19 12,19M20.5,20.5C22.66,18.31 24,15.31 24,12C24,8.69 22.66,5.69 20.5,3.5L19.42,4.58C21.32,6.5 22.5,9.11 22.5,12C22.5,14.9 21.32,17.5 19.42,19.42L20.5,20.5M4.58,19.42C2.68,17.5 1.5,14.9 1.5,12C1.5,9.11 2.68,6.5 4.58,4.58L3.5,3.5C1.34,5.69 0,8.69 0,12C0,15.31 1.34,18.31 3.5,20.5L4.58,19.42Z" />
            </svg>
            <span>Stop</span>
          </>
        )
      }

    </button>
  </>
  )
  : (<></>)

  return (
    <div className="flex flex-wrap items-center px-5 py-5">
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
     <div className='inline-flex'>
        {!confirmDelete ? (
          <button className="bg-rose-600 rounded-full p-1 inline-flex items-center justify-center hover:bg-rose-500"
            onClick={() => setConfirmDelete(true)}>
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )
          : (
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
      <div className='w-full mt-4 space-x-6'>
        <a className='hover:text-gray-50 inline-flex items-center space-x-1 bg-gray-500 hover:bg-gray-300 px-4 py-1 rounded-full' href={printer.id + '/fluidd'} target='_blank'>
          <svg className="w-5 h-5" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M19 8C20.66 8 22 9.34 22 11V17H18V21H6V17H2V11C2 9.34 3.34 8 5 8H6V3H18V8H19M8 5V8H16V5H8M16 19V15H8V19H16M18 15H20V11C20 10.45 19.55 10 19 10H5C4.45 10 4 10.45 4 11V15H6V13H18V15M19 11.5C19 12.05 18.55 12.5 18 12.5C17.45 12.5 17 12.05 17 11.5C17 10.95 17.45 10.5 18 10.5C18.55 10.5 19 10.95 19 11.5Z" />
          </svg>
          <span>Fluidd</span>
        </a>

        <button className="min-w-28 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-1 px-4 rounded-full"
          onClick={toggleCameras} disabled={printer.stats.state === 'offline'}>
          <svg className="w-5 h-5" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z" />
          </svg>
          <span>Cameras</span>
        </button>        

        {printControls}

      </div>
      <div>
      {printer.stats.state !== 'offline' && showCameras ? 
      (<div className='w-full flex flex-row flex-wrap justify-start mt-5 gap-2'>
      {printer.printer.cameras.map((c, i) => 
        ( <PrinterCamera key={printer.id + 'cam' + i} src={printer.id + '/' + c.id + c.path} />)
        )}
        </div>) : null}
        </div>
    </div>
  )
}

function AddPrinterModal({addPrinter, setShowModal, showModal}) {
  const [cameras, setCameras] = useState([])

  const addCamera = () => {
    setCameras([...cameras, {
      path: '',
      type: 'go2rtc'
    }])
  }

  const deleteCamera = (camIdx) => {
    setCameras(cameras.filter((cam, idx) => idx != camIdx))
  }

  return (
    <>
        <a href="#" className="hover:text-gray-100 inline-flex items-center space-x-1 bg-gray-500 px-4 py-1 rounded-full"
        onClick={() => setShowModal(true)}>
        <svg className="w-5 h-5" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M19 8C20.66 8 22 9.34 22 11V17H18V21H6V17H2V11C2 9.34 3.34 8 5 8H6V3H18V8H19M8 5V8H16V5H8M16 19V15H8V19H16M18 15H20V11C20 10.45 19.55 10 19 10H5C4.45 10 4 10.45 4 11V15H6V13H18V15M19 11.5C19 12.05 18.55 12.5 18 12.5C17.45 12.5 17 12.05 17 11.5C17 10.95 17.45 10.5 18 10.5C18.55 10.5 19 10.95 19 11.5Z" />
        </svg>
          <span>Add Printer</span>
        </a>
      {showModal ? (
        <>
          <div className="bg-gray-900 bg-opacity-80 flex justify-center items-center fixed top-0 start-0 inset-0 z-50 outline-none focus:outline-non">
              <div className="w-96 border-0 rounded-lg shadow-lg relative flex flex-col bg-gray-500 text-gray-100 outline-none focus:outline-none">
                <form action={(formData) => addPrinter(formData, cameras.length)} className="bg-gray-400 shadow-md rounded px-8 pt-6 pb-8 w-full space-y-2">
                  <label className="block">
                    Printer Name
                    <input className="p-1 rounded w-full text-black"
                     name='name' />
                  </label>
                  <label className="block">
                    Moonraker IP
                    <input className="p-1 rounded w-full text-black"
                     name='ip' 
                     defaultValue='127.0.0.1'
                     placeholder='127.0.0.1' />
                  </label>
                  <label className="block">
                    Moonraker Port
                    <input className="p-1 rounded w-full text-black"
                     name='port'
                     type='number'
                     defaultValue='7125'
                     placeholder='7125' />
                  </label>
                  {cameras.map((cam, i) => {
                    return (
                      <div key={'camera' + i} className='border-2 border-gray-500 rounded px-5 space-y-2 py-2'>
                        <div className='flex justify-end'>
                      <button className="bg-rose-600 rounded-full p-1 inline-flex items-center justify-center hover:bg-rose-500"
                      onClick={() => deleteCamera(i)}>
                      <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      </button>
                      </div>
                        <label className="block">
                          Camera Endpoint<br />
                          <input className="p-1 rounded w-full text-black"
                          placeholder='/api/ws?src=cam1'
                          name={'cameraapi' + i} type="text" />
                        </label>
                        <label className="block">
                          Camera IP<br />
                          <input className="p-1 rounded w-full text-black"
                          placeholder='127.0.0.1'
                          defaultValue='127.0.0.1'
                          name={'cameraip' + i} type="text" />
                        </label>
                        <label className="block">
                          Camera Port<br />
                          <input className="p-1 rounded w-full text-black"
                          defaultValue='1984'
                          placeholder='1984'
                          name={'cameraport' + i} type="number" />
                        </label>
                        <label className="block">
                          Camera Service<br />
                          <select name={'cameratype' + i} className="p-1 rounded block w-full text-black">
                            <option>go2rtc</option>
                          </select>
                        </label>
                      </div>
                    )
                  })}
                  <div className='flex justify-end'>
                  <button
                  className="min-w-32 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                  type='button'
                  onClick={addCamera}>
                    Add Camera
                  </button>
                  </div>
                  <div className='flex justify-end'>
                  <button
                    className="text-red-600 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1"
                    type="button"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                  className="min-w-32 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    type='submit'>
                    Add Printer
                  </button>
                  </div>
                </form>

              </div>
          </div>
        </>
      ) : null}
    </>
  )
}


export default Printers
