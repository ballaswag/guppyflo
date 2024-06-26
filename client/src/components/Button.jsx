import SpinnerIcon from '../assets/images/spinner.svg?react'

function Button({onClick, children, disabled, loading, ...rest}) {
    return (
        <button className="button"
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
