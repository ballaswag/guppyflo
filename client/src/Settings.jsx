import { useEffect, useState } from 'react'
import WarningIcon from './assets/images/warning.svg?react'

function Settings() {
  const [settings, setSettings] = useState({})

  const getSettings = async () => {
    const res = await fetch("/v1/api/settings")
    const data = await res.json()
    setSettings(data)
  };

  const saveSettings = async (formData) => {
    const resp = await fetch('/v1/api/settings',{
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ngrok_api_key: formData.get('ngrokapikey'),
        ngrok_auth_token: formData.get('ngroktoken'),
        ngrok_oauth_provider: formData.get('oauthprovider'),
        ngrok_oauth_email: formData.get('oauthemail'),
        guppyflo_local_port: parseInt(formData.get('guppyfloport'))
      })
    })

    if (resp.status == 200) {
      setSettings(await resp.json())
    } else {
      console.log("failed to save settings")
    }
  }


  useEffect(() => {
    getSettings()
  }, []);


  return (
    <div className='px-10 space-y-10'>
    {!settings.ngrok_auth_token && !settings.ngrok_api_key ? 
    (<div>
      <p className='text-lg'>
      <span className='inline-flex mr-2'>
      <WarningIcon className="w-6 h-6 fill-yellow-500" />
      </span>
      Ngrok is not configured. <a className='text-green-300 hover:underline' href="https://dashboard.ngrok.com/signup" target='_blank'>Sign up</a> for a free Ngrok account and add the Ngrok auth token to enable remote tunneling. 
      Without Ngrok, GuppyFLO only works within your local network.
      </p>
      </div>) : <></>
    }

      <form action={saveSettings} className="max-w-xl mx-auto">
        <div className="mb-5">
          <label className="block mb-2 text-lg font-medium">Ngrok Auth Token <br />
          <span className="text-sm">You can retrieve your Ngrok Auth Token from <a className='text-green-300 hover:underline' href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank">here.</a></span>
          <input type="text" id="ngroktoken" name="ngroktoken" className="text-input"
          value={settings.ngrok_auth_token || ''} onChange={e => setSettings({...settings, ngrok_auth_token: e.target.value})} required />
          </label>
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-lg font-medium">Ngrok API Key<br />
          <span className="text-sm">You can create a Ngrok API Key from <a className='text-green-300 hover:underline' href="https://dashboard.ngrok.com/api" target="_blank">here.</a></span>
          <input type="text" id="ngrokapikey" name="ngrokapikey" className="text-input"
          value={settings.ngrok_api_key || ''} onChange={e => setSettings({...settings, ngrok_api_key: e.target.value})} />
          </label>
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-lg font-medium">Ngrok OAuth Provider<br />
          <span className="text-sm">Select an OAuth provider to secure your GuppyFLO Ngrok tunnel. Learn more <a className='text-green-300 hover:underline' href="https://ngrok.com/docs/http/oauth/" target="_blank">here.</a></span>
          <select id="oauthprovider" name="oauthprovider" className="text-input"
          value={settings.ngrok_oauth_provider || ''} onChange={e => setSettings({...settings, ngrok_oauth_provider: e.target.value})} required>
            <option>facebook</option>
            <option>google</option>
            <option>amazon</option>
            <option>github</option>
            <option>gitlab</option>
            <option>linkedin</option>
            <option>microsoft</option>
            <option>twitch</option>
          </select>
          </label>
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-lg font-medium">OAuth Email<br />
          <span className="text-sm">Your email address associated with the OAuth provider.</span>
          <input type="email" id="oauthemail" name="oauthemail" className="text-input"
          value={settings.ngrok_oauth_email || ''} onChange={e => setSettings({...settings, ngrok_oauth_email: e.target.value})} required />
          </label>
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-lg font-medium">GuppyFLO Port<br />
          <span className="text-sm">Access GuppyFLO at this port locally.</span>
          <input type="number" id="guppyfloport" name="guppyfloport" className="text-input"
          value={settings.guppyflo_local_port || ''} onChange={e => setSettings({...settings, guppyflo_local_port: e.target.value})} required />
          </label>
        </div>

        <button type="submit" className="button">Save</button>
      </form>
    </div>
  )
}

export default Settings