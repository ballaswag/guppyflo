import CloseIcon from '../assets/images/close.svg?react'
import CopyIcon from '../assets/images/copy.svg?react'
import { CopyToClipboard } from 'react-copy-to-clipboard';


function PrinterNetworkInfo({ printer, setShow }) {

  const baseUrl = window.location.href + "printers/" + printer.id

  return (
    <div className='absolute right-0 top-0 z-10'>
      <div className='space-y-3 drop-shadow-lg bg-gray-700 p-4 rounded md:min-w-[552px]'>
        <div className='absolute right-2 top-2'>
          <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50"
            onClick={() => setShow(false)}>
            <CloseIcon className='w-5 h-5 fill-current' />
          </button>
        </div>

        <div className="pt-4 text-base text-left items-center inline-flex flex-wrap">
          <div className='w-full inline-flex items-center md:w-auto'>
            <CopyToClipboard text={baseUrl}>
              <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50 mr-2">
                <CopyIcon className='w-5 h-5 fill-current' />
              </button>
            </CopyToClipboard>
            <span className='inline-block md:min-w-28'>Printer</span>
          </div>
          <span className='ml-8 md:ml-0 block md:inline-block text-gray-400'>{baseUrl}</span>
        </div>


        <div className="text-base text-left items-center inline-flex flex-wrap">
          <div className='w-full inline-flex items-center md:w-auto'>
            <CopyToClipboard text={baseUrl.replace('http', 'ws') + '/websocket'}>
              <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50 mr-2">
                <CopyIcon className='w-5 h-5 fill-current' />
              </button>
            </CopyToClipboard>
            <span className='inline-block md:min-w-28'>Websocket</span>
          </div>
          <span className='ml-8 md:ml-0 block md:inline-block text-gray-400'>{'{Printer}'}/websocket</span>
        </div>

        {printer.printer.cameras.map((cam, idx) => (
          <>
            <div className='md:inline-flex items-center'>
              <CopyToClipboard text={baseUrl + '/cameras/' + cam.id + cam.path}>
                <button className="rounded-full bg-gray-500 p-1 inline-flex items-center justify-center hover:bg-gray-300 hover:text-gray-50 mr-2">
                  <CopyIcon className='w-5 h-5 fill-current' />
                </button>
              </CopyToClipboard>
              <span className='md:min-w-28'>Cam {idx}</span>
              <p className='ml-8 md:ml-0 text-gray-400 text-wrap'>{'{Printer}'}/cameras/{cam.id + cam.path}</p>
            </div>

          </>
        ))
        }
      </div>
    </div>
  )
}

export default PrinterNetworkInfo
