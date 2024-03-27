import { Routes, Route, Link } from 'react-router-dom';
import Printers from './Printers.jsx'
import Settings from './Settings.jsx'
import { useEffect, useState, useRef } from 'react'
import HomeIcon from './assets/images/home.svg?react'
import SettingsIcon from './assets/images/settings.svg?react'
import LogoutIcon from './assets/images/logout.svg?react'
import MenuIcon from './assets/images/menu.svg?react'
import GitHubIcon from './assets/images/github.svg?react'

function App() {
  const [showMenu, setShowMenu] = useState(false)

  const toggleMenu = () => {
    setShowMenu(!showMenu)
  }

  return (
    <>
      <div className="flex flex-wrap mx-auto text-gray-300">
        <div className="flex w-full sticky top-0 bg-gray-800 z-10">
          <div className="md:hidden flex items-center ml-2">
            <button className="navbar-burger flex items-center text-gray-200 p-3"
            onClick={toggleMenu} >
            <MenuIcon className='className="block h-6 w-6 fill-current' />
            </button>
          </div>
          <div className="flex items-center w-1/2 text-white text-3xl font-bold ml-2 md:ml-10">
            Guppy<span className="text-green-400">FLO</span>
          </div>
          <div className="pt-4 pb-4 pr-3 md:pr-9 w-1/2 flex items-center justify-end text-lg text-gray-300">
            <a className="mr-2 md:mr-6" href='https://ko-fi.com/Z8Z3RE4GK' target='_blank'>
              <img className="h-9" src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' />
            </a>
            <a className="flex items-center text-gray-300 hover:text-gray-200 border-transparent" href="https://github.com/ballaswag">
            <GitHubIcon className='w-9 h-9 fill-current' />
            </a>
          </div>
        </div>
        <div className='flex flex-row w-full'>
          <MobileMenu show={showMenu} setShow={setShowMenu} />
          <SideMenu />
          <div id="content-panel" className="w-full mt-5 flex justify-center">
          <div>
             <Routes>
              <Route path='/' element={<Printers />} />
              <Route path='/settings' element={<Settings />} />
            </Routes>
          </div>
          </div>
        </div>
      </div>
    </>
  )
}

function MobileMenu({show, setShow}) {
  return !show ? (<></>) : (
    <div className="flex-col w-52 h-full md:hidden fixed bg-gray-800 z-10">
    <div className="overflow-y-auto overflow-x-hidden flex-grow">
      <ul className="flex flex-col py-4 space-y-1">
        <li>
          <Link onClick={() => setShow(false)} to='/'
            className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
            <span className="inline-flex justify-center items-center ml-4">
              <HomeIcon className='w-5 h-5' />
            </span>
            <span className="ml-2 text-sm tracking-wide truncate">Dashboard</span>
          </Link>
        </li>
        <li>
          <Link onClick={() => setShow(false)} to="/settings"
            className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
            <span className="inline-flex justify-center items-center ml-4">
              <SettingsIcon className='w-5 h-5' />
            </span>
            <span className="ml-2 text-sm tracking-wide truncate">Settings</span>
          </Link>
        </li>
        <li>
          <a href="/auth/logout"
            className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
            <span className="inline-flex justify-center items-center ml-4">
              <LogoutIcon className='w-5 h-5' />
            </span>
            <span className="ml-2 text-sm tracking-wide truncate">Logout</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
  )
}

function SideMenu() {
  return (
    <div className="md:flex flex-col w-52 h-full fixed hidden z-10">
      <div className="overflow-y-auto overflow-x-hidden flex-grow">
        <ul className="flex flex-col py-4 space-y-1">
          <li>
            <Link to='/'
              className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
              <span className="inline-flex justify-center items-center ml-4">
              <HomeIcon className='w-5 h-5' />
              </span>
              <span className="ml-2 text-sm tracking-wide truncate">Dashboard</span>
            </Link>
          </li>
          <li>
            <Link to="/settings"
              className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
              <span className="inline-flex justify-center items-center ml-4">
              <SettingsIcon className='w-5 h-5' />
              </span>
              <span className="ml-2 text-sm tracking-wide truncate">Settings</span>
            </Link>
          </li>
          <li>
            <a href="/auth/logout"
              className="relative flex flex-row items-center h-11 focus:outline-none hover:bg-gray-700 text-gray-300 hover:text-gray-200 border-l-4 border-transparent hover:border-green-400 pr-6">
              <span className="inline-flex justify-center items-center ml-4">
              <LogoutIcon className='w-5 h-5' />
              </span>
              <span className="ml-2 text-sm tracking-wide truncate">Logout</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default App