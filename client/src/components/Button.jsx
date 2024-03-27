import SpinnerIcon from '../assets/images/spinner.svg?react'

function Button({onClick, children, disabled, loading, ...rest}) {
    return (
        <button className="min-w-32 bg-gray-500 hover:bg-gray-300 hover:text-gray-50 inline-flex justify-center items-center space-x-1 py-2 rounded-full"
        onClick={onClick}
        disabled={disabled}
        {...rest} >
        {loading 
            ? (<SpinnerIcon className='w-6 h-6 text-gray-300 animate-spin'/>)
            : children}
      </button>        
    )
}

export default Button
