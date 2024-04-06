import { useState } from 'react'
import SubmitButton from './SubmitButton.jsx'
import Button from './Button.jsx'

import CloseIcon from '../assets/images/close.svg?react'
import CameraIcon from '../assets/images/camera.svg?react'
import PlusIcon from '../assets/images/plus.svg?react'
import SaveIcon from '../assets/images/save.svg?react'

function PrinterForm({ printer, printerAction, setModal, isEdit }) {
  const [cameras, setCameras] = useState((printer && printer.printer.cameras) || [])
  const [cameraMsg, setCameraMsg] = useState()

  const addCamera = () => {
    setCameras([...cameras, {
      path: '',
      type: 'go2rtc'
    }])
  }

  const deleteCamera = (cam) => {
    setCameras(cameras.filter((c, idx) =>  cam.id != c.id))
  }

  const discoverCameras = async (formData) => {
    const res = await fetch("/v1/api/cameras?ip=" + formData.get('ip') + "&port=" + formData.get('port'))
    if (res.status == 200) {
      const cameras = await res.json()
      if (cameras && cameras.length > 0) {
        setCameras(cameras)
        setCameraMsg("Detected " + cameras.length +
          " camera(s). There might be duplicates depending on your setup. Select only the ones you want.")

      } else {
        setCameraMsg("Did not detect any cameras.")
      }
    } else {
      setCameraMsg("Failed to auto detect cameras.")
    }
  }

  return (
    <div className="bg-gray-900 bg-opacity-80 flex justify-center pt-24 fixed top-0 start-0 inset-0 z-50 overflow-scroll">
      <div className="w-96 rounded drop-shadow-lg relative flex flex-col text-gray-100">
        <form key={printer && printer.printer.id} action={(formData) => printerAction(formData, cameras)}
          className="bg-gray-700 rounded px-8 pt-6 pb-8 space-y-2">
          <label className="block">
            Printer Name
            <input className="text-input"
              name='name' 
              defaultValue={(printer && printer.printer.printer_name) || ''} />
          </label>
          <label className="block">
            Moonraker IP
            <input className="text-input read-only:bg-gray-500"
              name='ip'
              placeholder='127.0.0.1'
              defaultValue={(printer && printer.printer.moonraker_ip) || '127.0.0.1'}
              readOnly={isEdit} />
          </label>
          <label className="block pb-4">
            Moonraker Port
            <input className="text-input read-only:bg-gray-500"
              name='port'
              type='number'
              defaultValue={(printer && printer.printer.moonraker_port) || '7125'}
              placeholder='7125'
              readOnly={isEdit} />
          </label>
          {cameras.map((cam, i) => {
            return (
              <div key={cam.id} className='border-t-2 border-dotted border-gray-400 space-y-2 py-4 relative'>
                <div className='absolute right-0 top-2'>
                  <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50"
                    type='button'
                    onClick={() => deleteCamera(cam)}>
                    <CloseIcon className='w-5 h-5 fill-current' />
                  </button>
                </div>
                <label className="block">
                  Camera Endpoint<br />
                  <input className="text-input"
                    placeholder='/stream.html?src=cam1'
                    name={'cameraapi' + cam.id} type="text"
                    defaultValue={cam.path} />
                </label>
                <label className="block">
                  Camera IP<br />
                  <input className="text-input"
                    placeholder='127.0.0.1'
                    defaultValue={cam.camera_ip || '127.0.0.1'}
                    name={'cameraip' + cam.id}
                    type="text" />
                </label>
                <label className="block">
                  Camera Port<br />
                  <input className="text-input"
                    defaultValue={cam.camera_port || '1984'}
                    placeholder='1984'
                    name={'cameraport' + cam.id}
                    type="number" />
                </label>
                <label className="block">
                  Camera Service<br />
                  <select className="text-input"
                    name={'cameratype' + cam.id}
                    defaultValue={cam.type}>
                    <option>go2rtc</option>
                    <option>mjpeg-stream</option>
                  </select>
                </label>
              </div>
            )
          })}
          {cameraMsg && (<div className='pb-4'><p className='w-full bg-gray-600 rounded p-2'>{cameraMsg}</p></div>)}
          <div className='flex justify-center items-center w-full space-x-4 pb-2'>
            <SubmitButton
              formAction={(formData) => discoverCameras(formData)}>
              <CameraIcon className='w-5 h-5 fill-current' />
              <span>Auto Detect</span>
            </SubmitButton>

            <Button
              type='button'
              onClick={addCamera}>
              <PlusIcon className='w-5 h-5 fill-current' />
              <span>Camera</span>
            </Button>
          </div>

          <div className='flex justify-center items-center w-full space-x-4'>
            <Button
              type='button'
              onClick={() => setModal(false)}>
              Cancel
            </Button>

            <SubmitButton>
              <SaveIcon className='w-5 h-5 fill-current' />
              <span>Save</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PrinterForm
